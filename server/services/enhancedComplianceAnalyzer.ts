import OpenAI from "openai";
import { storage } from "../storage";
import { enhancedChunkText } from "./enhancedDocumentProcessor";
import { enhancedVectorDbService } from "./enhancedVectorDatabase";
import { notificationService } from "./notificationService";
import { UKRiskAssessmentService, RiskAssessment } from "./riskAssessment";
import { HistoricalTrackingService } from "./historicalTracking";
import { EnhancedDPA2018ComplianceAnalyzer, EnhancedDPA2018ComplianceResult } from "./enhancedDPA2018Analyzer";
import { HealthSafetyComplianceAnalyzer, HealthSafetyComplianceResult } from "./healthSafetyComplianceAnalyzer";
import { promptRefinementService } from "./promptRefinementService";
import { aiQualityService } from "./aiQualityService";
import { costGovernance } from "./costGovernance";
import { rulesEngine } from "./rulesEngine";
import { sanitizePrompt, validateJsonOutput } from './promptShield';
import { modelRouter } from './modelRouter';
import { redis } from "./queue";
import { singleFlight } from "./singleFlight";
import crypto from 'crypto';
import { makeCacheKey, getCached, setCached } from './llmCache';
import { llmMetricsService } from './llmMetrics';
import { withSpan, injectContextToHeaders, getTraceId } from './telemetry';

// Enforce strict secret presence
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY must be set');
}

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY
});

interface EnhancedComplianceAnalysis {
  complianceScore: number;
  summary: string;
  suggestedWording: string;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  matchedClauseId?: string;
  regulationName?: string;
  dpa2018Analysis?: EnhancedDPA2018ComplianceResult;
  healthSafetyAnalysis?: HealthSafetyComplianceResult;
  icoGuidanceReferences?: string[];
  chainOfThoughtReasoning?: string;
  confidenceScore?: number;
  selfCorrectionApplied?: boolean;
}

interface EnhancedComplianceReport {
  analysisResults: EnhancedComplianceAnalysis[];
  riskAssessment: RiskAssessment;
  overallScore: number;
  gapCount: number;
  riskLevel: string;
  qualityMetrics: {
    averageConfidenceScore: number;
    chainOfThoughtApplied: boolean;
    selfCorrectionUsed: boolean;
    hybridSearchUsed: boolean;
    semanticChunkingUsed: boolean;
  };
}

export async function enhancedAnalyzeCompliance(
  reportId: string,
  policyText: string,
  analyzerType: 'auto' | 'uk_gdpr' | 'hse_1974' = 'auto'
): Promise<void> {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      console.log(`Starting enhanced compliance analysis for report ${reportId} (attempt ${attempt + 1}/${maxRetries})`);  
      
      // Initialize enhanced vector database
      await enhancedVectorDbService.initialize();
    
      // Get all active regulations, prioritizing UK GDPR and Health & Safety or forcing by analyzerType
      const regulations = await storage.getActiveRegulations();
      const priority: Record<string, number> = { 
        'UK GDPR': 1, 
        'Health and Safety at Work etc. Act 1974': 2,
        'GDPR': 3, 
        'CCPA': 4 
      };
      const prioritizedRegulations = regulations.sort((a, b) => {
        return (priority[a.name] || 99) - (priority[b.name] || 99);
      });
      
      if (prioritizedRegulations.length === 0) {
        throw new Error("No active regulations found in database");
      }

      // Select primaryRegulation
      let primaryRegulation = prioritizedRegulations[0];
      if (analyzerType === 'uk_gdpr') {
        const uk = regulations.find(r => r.name.includes('UK GDPR'));
        if (uk) primaryRegulation = uk;
      } else if (analyzerType === 'hse_1974') {
        const hse = regulations.find(r => r.name.includes('Health and Safety'));
        if (hse) primaryRegulation = hse;
      }
      const allClauses = await storage.getRegulationClauses(primaryRegulation.id);
      
      if (allClauses.length === 0) {
        throw new Error(`No clauses found for ${primaryRegulation.name} regulation`);
      }

      // Determine organization for cost governance
      const report = await storage.getComplianceReport(reportId);
      const organizationId = report?.organizationId as string;
      if (organizationId) {
        await costGovernance.ensureOrgPolicy(organizationId);
      }

      // Enhanced semantic chunking
      const policyChunks = enhancedChunkText(policyText);
      console.log(`Policy text semantically chunked into ${policyChunks.length} segments`);

      const analysisResults: EnhancedComplianceAnalysis[] = [];
      
      // Optional: canary/capability flags
      const useCoT = aiQualityService.shouldUseCoT();
      const useSelfCorrection = aiQualityService.shouldUseSelfCorrection();

      // Perform enhanced analysis based on regulation type
      let dpa2018Analysis: EnhancedDPA2018ComplianceResult | undefined;
      let healthSafetyAnalysis: HealthSafetyComplianceResult | undefined;
      
      if (analyzerType === 'uk_gdpr' || (analyzerType === 'auto' && primaryRegulation.name.includes('UK GDPR'))) {
        try {
          console.log('Performing enhanced DPA 2018 compliance analysis with Chain of Thought...');
          dpa2018Analysis = await EnhancedDPA2018ComplianceAnalyzer.analyzeDPA2018Compliance(policyText);
          console.log(`Enhanced DPA 2018 analysis completed with ${dpa2018Analysis.overallCompliance}% compliance (confidence: ${dpa2018Analysis.confidenceScore})`);
        } catch (error) {
          console.error('Error in enhanced DPA 2018 analysis:', error);
        }
      }
      
      if (analyzerType === 'hse_1974' || (analyzerType === 'auto' && primaryRegulation.name.includes('Health and Safety'))) {
        try {
          console.log('Performing enhanced Health and Safety compliance analysis...');
          healthSafetyAnalysis = await HealthSafetyComplianceAnalyzer.analyzeHealthSafetyCompliance(policyText);
          console.log(`Health and Safety analysis completed with ${healthSafetyAnalysis.overallCompliance}% compliance`);
        } catch (error) {
          console.error('Error in Health and Safety analysis:', error);
        }
      }

      // Analyze each policy chunk
      for (let i = 0; i < policyChunks.length; i++) {
        const chunk = policyChunks[i];
        console.log(`Analyzing chunk ${i + 1}/${policyChunks.length} with enhanced AI methods`);

        try {
          const relevantClauses = await enhancedVectorDbService.performHybridSearch(
            chunk, 
            undefined,
            primaryRegulation.id
          );
          console.log(`Found ${relevantClauses.length} relevant clauses using hybrid search`);

          const clausesToAnalyze = relevantClauses.length > 0 
            ? relevantClauses.map(rc => ({ id: rc.clauseId, clauseIdentifier: rc.id, content: rc.content }))
            : allClauses;

          // Prompt routing via A/B
          const basePrompt = await aiQualityService.routePrompt('compliance-analysis');

          // Schema guardrails
          const schema = aiQualityService.getComplianceSchema();
          const schemaStr = JSON.stringify(schema);

          const cotInstruction = useCoT ? '\nAlways use step-by-step reasoning.' : '';

          const enhancedPrompt = `
${basePrompt}
${cotInstruction}

POLICY TEXT TO ANALYZE:
${chunk}

RELEVANT REGULATORY CLAUSES FOR ${primaryRegulation.name}:
${clausesToAnalyze.map((clause, index) => `
${index + 1}. Clause ID: ${clause.id}
Content: ${'content' in clause ? clause.content : clause.clauseText}
`).join('')}

Return JSON strictly matching this schema (no extra fields):
${schemaStr}
`;

          // Enforce caps before call (rough token estimate)
          const safePrompt = sanitizePrompt(enhancedPrompt);
          const estimatedTokens = Math.ceil((chunk.length + safePrompt.length) / 4) + 300;
          if (organizationId) {
            await costGovernance.enforceCaps(organizationId, estimatedTokens);
          }

          // LLM cache + single-flight key
          const chunkHash = crypto.createHash('sha256').update(chunk).digest('base64').slice(0, 32);
          const keyBase = `llm:analysis:${organizationId || 'na'}:${primaryRegulation.id}:${chunkHash}:cot${useCoT?'1':'0'}:sc${useSelfCorrection?'1':'0'}`;
          const clauseIds = clausesToAnalyze.map(c => c.id).sort();
          const cacheKey = makeCacheKey({ k: 'analysis', org: organizationId, rid: reportId, reg: primaryRegulation.id, chunk: chunkHash, cot: useCoT, sc: useSelfCorrection, clauses: clauseIds });
          let initialResult: any | null = await getCached<any>(cacheKey);
          if (!initialResult) {
            initialResult = await singleFlight<any>(keyBase, 60, async () => {
              const model = await modelRouter.selectModel({ organizationId, targetLatencyMs: 2500, maxErrorRate: 0.25 });
              const tStart = Date.now();
              const initialResponse = await openai.chat.completions.create({
                model,
                messages: [
                  { role: 'system', content: `You are a legal compliance expert specializing in ${primaryRegulation.name}.` },
                  { role: 'user', content: safePrompt }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.1
              });
              const resObj = validateJsonOutput(initialResponse.choices[0].message.content || '{}');
              await setCached(cacheKey, resObj, { ttlSeconds: 6 * 3600 });

              // Record usage (approx; OpenAI usage tokens can be used if available)
              if (organizationId) {
                const usage = (initialResponse as any).usage as { total_tokens?: number } | undefined;
                const tokens = usage?.total_tokens ?? estimatedTokens;
                await costGovernance.recordUsage(organizationId, 'openai', tokens, { reportId, analyzerType: 'compliance' });
              }
              // SLO metrics
              try {
                const usage = (initialResponse as any).usage as { total_tokens?: number } | undefined;
                const tokens = usage?.total_tokens ?? estimatedTokens;
                await llmMetricsService.record({ model, latencyMs: Date.now() - tStart, tokens, success: true });
              } catch {}
              return resObj;
            });
          }

          let finalResult = initialResult;
          if (useSelfCorrection) {
            const relevantClausesForCorrection = relevantClauses.map(rc => ({
              id: rc.id,
              regulationId: rc.regulationId,
              clauseId: rc.clauseId,
              content: rc.content,
              category: rc.category,
              metadata: rc.metadata,
            }));
            finalResult = await enhancedVectorDbService.performSelfCorrectionAnalysis(
              chunk,
              relevantClausesForCorrection,
              initialResult
            );
          }

          analysisResults.push({
            complianceScore: finalResult.complianceScore || 0,
            summary: finalResult.summary || 'Analysis completed',
            suggestedWording: finalResult.suggestedWording || 'No specific suggestions available',
            riskLevel: finalResult.riskLevel || 'Medium',
            matchedClauseId: finalResult.matchedClauseId,
            regulationName: finalResult.regulationName || primaryRegulation.name,
            chainOfThoughtReasoning: finalResult.chainOfThoughtReasoning || (useCoT ? 'Enhanced reasoning applied' : undefined),
            confidenceScore: finalResult.confidenceScore || 0.7,
            selfCorrectionApplied: useSelfCorrection
          });

          await storage.createAnalysisResult({
            reportId,
            policyChunkText: chunk,
            matchedRegulationClauseId: finalResult.matchedClauseId,
            complianceScore: finalResult.complianceScore || 0,
            summary: finalResult.summary || 'Analysis completed',
            suggestedWording: finalResult.suggestedWording || null,
            riskLevel: finalResult.riskLevel || 'Medium',
          });

          if (analysisResults[analysisResults.length - 1].confidenceScore! > 0.7) {
            await promptRefinementService.updatePromptPerformance('compliance-analysis', true);
          }

          const percent = Math.round(((i + 1) / policyChunks.length) * 100);
          try {
            await withSpan('events.publish.analysis.progress', async () => {
              const headers = injectContextToHeaders();
              const traceId = getTraceId();
              const evt = { topic: 'analysis.progress', traceId, headers, payload: { reportId, completedChunks: i+1, totalChunks: policyChunks.length, percent } };
              await redis.publish('events', JSON.stringify(evt));
            });
          } catch {}

          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error analyzing chunk ${i + 1}:`, error);
        }
      }

      const riskAssessment = await UKRiskAssessmentService.assessRisk(
        policyText, 
        analysisResults, 
        primaryRegulation.name
      );

      const overallScore = calculateEnhancedOverallScore(analysisResults);
      const gapCount = analysisResults.filter(r => 
        r.complianceScore < 70 || r.riskLevel === 'High' || r.riskLevel === 'Critical'
      ).length;

      const qualityMetrics = {
        averageConfidenceScore: analysisResults.reduce((sum, r) => sum + (r.confidenceScore || 0), 0) / Math.max(1, analysisResults.length),
        chainOfThoughtApplied: useCoT,
        selfCorrectionUsed: useSelfCorrection,
        hybridSearchUsed: true,
        semanticChunkingUsed: true
      };

      // Run symbolic rules alongside LLM results
      try {
        await rulesEngine.evaluateRules({
          reportId,
          organizationId: organizationId as string,
          policyText,
          regulationId: primaryRegulation.id
        });
      } catch (e) {
        console.warn('Rules evaluation failed:', (e as any)?.message || e);
      }

      await storage.updateComplianceReport(reportId, {
        overallScore,
        gapCount,
        riskLevel: riskAssessment.overallRiskLevel,
        status: 'completed',
        completedAt: new Date()
      } as any);

      await HistoricalTrackingService.trackAnalysis(reportId, {
        analysisResults,
        riskAssessment,
        overallScore,
        gapCount,
        qualityMetrics,
        riskLevel: riskAssessment.overallRiskLevel
      });

      if (gapCount > 0 || riskAssessment.overallRiskLevel === 'high') {
        if ((notificationService as any)?.sendComplianceAlert) {
          await (notificationService as any).sendComplianceAlert(reportId, {
            gapCount,
            riskLevel: riskAssessment.overallRiskLevel,
            criticalFindings: analysisResults.filter(r => r.riskLevel === 'Critical').length,
            averageConfidence: qualityMetrics.averageConfidenceScore
          });
        }
      }

      console.log(`Enhanced compliance analysis completed successfully for report ${reportId}`);
      return;

    } catch (error) {
      attempt++;
      console.error(`Attempt ${attempt} failed for report ${reportId}:`, error);
      if (attempt >= maxRetries) {
        await storage.updateComplianceReport(reportId, { status: 'failed' } as any);
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}

async function analyzeChunkWithEnhancedSemanticSearch(
  policyChunk: string, 
  relevantClauses: any[], 
  regulationName: string
): Promise<EnhancedComplianceAnalysis | null> {
  // legacy path retained; main path above now uses aiQualityService controls
  if (relevantClauses.length === 0) {
    return null;
  }
  const promptVersion = await promptRefinementService.getOptimalPrompt('compliance-analysis');
  const enhancedPrompt = `\n${promptVersion}\nPOLICY TEXT TO ANALYZE:\n${policyChunk}\n`;
  try {
    const initialResponse = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        { role: 'system', content: `You are a legal compliance expert specializing in ${regulationName}.` },
        { role: 'user', content: enhancedPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    });
    const initialResult = JSON.parse(initialResponse.choices[0].message.content || '{}');
    const finalResult = initialResult;
    return {
      complianceScore: finalResult.complianceScore || 0,
      summary: finalResult.summary || 'Analysis completed',
      suggestedWording: finalResult.suggestedWording || 'No specific suggestions available',
      riskLevel: finalResult.riskLevel || 'Medium',
      matchedClauseId: finalResult.matchedClauseId,
      regulationName: finalResult.regulationName || regulationName,
      chainOfThoughtReasoning: finalResult.chainOfThoughtReasoning || undefined,
      confidenceScore: finalResult.confidenceScore || 0.7,
      selfCorrectionApplied: false
    };
  } catch {
    return {
      complianceScore: 0,
      summary: 'Analysis failed due to processing error',
      suggestedWording: 'Unable to provide suggestions due to error',
      riskLevel: 'High',
      regulationName: regulationName,
      chainOfThoughtReasoning: 'Analysis failed due to technical error',
      confidenceScore: 0.0,
      selfCorrectionApplied: false
    };
  }
}

function calculateEnhancedOverallScore(results: EnhancedComplianceAnalysis[]): number {
  if (results.length === 0) return 0;
  let totalWeightedScore = 0;
  let totalWeight = 0;
  for (const result of results) {
    const weight = result.confidenceScore || 0.5;
    totalWeightedScore += result.complianceScore * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;
}

export const analyzeCompliance = enhancedAnalyzeCompliance;