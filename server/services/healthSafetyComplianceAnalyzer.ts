import OpenAI from "openai";
import { promptRefinementService } from "./promptRefinementService";

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY must be set');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface HSEFinding {
  section: string;
  requirement: string;
  complianceStatus: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable';
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence?: string;
  recommendedAction?: string;
}

export interface HSERiskAssessment {
  overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  hazardsIdentified: string[];
  controlsAdequacy: 'adequate' | 'needs_improvement' | 'inadequate';
  trainingGaps: string[];
  incidentReportingReadiness: 'ready' | 'needs_work';
}

export interface HealthSafetyComplianceResult {
  overallCompliance: number;
  findings: HSEFinding[];
  recommendations: string[];
  riskAssessment: HSERiskAssessment;
  confidenceScore?: number;
}

export class HealthSafetyComplianceAnalyzer {
  static async analyzeHealthSafetyCompliance(policyText: string): Promise<HealthSafetyComplianceResult> {
    const promptVersion = await promptRefinementService.getOptimalPrompt('health-safety-analysis');

    const enhancedPrompt = `
${promptVersion}

You are a UK Health & Safety compliance expert specializing in the Health and Safety at Work etc. Act 1974 and HSE guidance.
Analyze the following policy text for compliance against HSE principles:

TEXT:
${policyText.slice(0, 12000)}

Focus areas:
- Hazard identification and risk assessment (suitable and sufficient, documented)
- Hierarchy of controls and safe systems of work
- Training and competence (induction, refreshers, role-specific)
- Incident and near-miss reporting (RIDDOR), investigations, corrective actions
- PPE policies and maintenance
- Emergency procedures and first aid
- Contractor management and workplace inspections
- Roles and responsibilities (employers, employees, competent persons)

Return JSON with:
{
  "overallCompliance": number (0-100),
  "findings": [
    {
      "section": string,
      "requirement": string,
      "complianceStatus": "compliant"|"partial"|"non-compliant"|"not-applicable",
      "severity": "low"|"medium"|"high"|"critical",
      "evidence": string,
      "recommendedAction": string
    }
  ],
  "recommendations": [string],
  "riskAssessment": {
    "overallRiskLevel": "low"|"medium"|"high"|"critical",
    "hazardsIdentified": [string],
    "controlsAdequacy": "adequate"|"needs_improvement"|"inadequate",
    "trainingGaps": [string],
    "incidentReportingReadiness": "ready"|"needs_work"
  },
  "confidenceScore": number (0-1)
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-5',
        messages: [
          { role: 'system', content: 'You are an HSE (UK) legal compliance assistant. Provide strictly JSON outputs when requested.' },
          { role: 'user', content: enhancedPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      });

      const parsed = JSON.parse(response.choices[0].message.content || '{}');

      // Basic validation and normalization
      const overallCompliance = Math.max(0, Math.min(100, Number(parsed.overallCompliance || 0)));
      const confidenceScore = Math.max(0, Math.min(1, Number(parsed.confidenceScore || 0.6)));

      const findings: HSEFinding[] = Array.isArray(parsed.findings)
        ? parsed.findings.map((f: any) => ({
            section: String(f.section || 'General'),
            requirement: String(f.requirement || ''),
            complianceStatus: (['compliant','partial','non-compliant','not-applicable'] as const).includes(f.complianceStatus) ? f.complianceStatus : 'partial',
            severity: (['low','medium','high','critical'] as const).includes(f.severity) ? f.severity : 'medium',
            evidence: f.evidence ? String(f.evidence) : undefined,
            recommendedAction: f.recommendedAction ? String(f.recommendedAction) : undefined,
          }))
        : [];

      const recommendations: string[] = Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map((r: any) => String(r)).slice(0, 10)
        : [];

      const riskAssessment: HSERiskAssessment = {
        overallRiskLevel: (['low','medium','high','critical'] as const).includes(parsed?.riskAssessment?.overallRiskLevel)
          ? parsed.riskAssessment.overallRiskLevel
          : 'medium',
        hazardsIdentified: Array.isArray(parsed?.riskAssessment?.hazardsIdentified)
          ? parsed.riskAssessment.hazardsIdentified.map((h: any) => String(h)).slice(0, 10)
          : [],
        controlsAdequacy: (['adequate','needs_improvement','inadequate'] as const).includes(parsed?.riskAssessment?.controlsAdequacy)
          ? parsed.riskAssessment.controlsAdequacy
          : 'needs_improvement',
        trainingGaps: Array.isArray(parsed?.riskAssessment?.trainingGaps)
          ? parsed.riskAssessment.trainingGaps.map((g: any) => String(g)).slice(0, 10)
          : [],
        incidentReportingReadiness: (['ready','needs_work'] as const).includes(parsed?.riskAssessment?.incidentReportingReadiness)
          ? parsed.riskAssessment.incidentReportingReadiness
          : 'needs_work',
      };

      return { overallCompliance, findings, recommendations, riskAssessment, confidenceScore };
    } catch (error) {
      // Deterministic, minimal fallback based on keyword presence
      const text = policyText.toLowerCase();
      const factors = [
        /risk assessment|hazard|risk register|suitable and sufficient/.test(text),
        /controls|safe system of work|permit to work/.test(text),
        /training|competence|induction/.test(text),
        /riddor|incident|near[- ]?miss|investigation/.test(text),
        /ppe|personal protective equipment/.test(text),
        /emergency|first aid|evacuation/.test(text),
      ];
      const score = Math.round((factors.filter(Boolean).length / factors.length) * 100);
      const ra: HSERiskAssessment = {
        overallRiskLevel: score >= 85 ? 'low' : score >= 60 ? 'medium' : 'high',
        hazardsIdentified: [],
        controlsAdequacy: score >= 70 ? 'adequate' : 'needs_improvement',
        trainingGaps: [],
        incidentReportingReadiness: score >= 70 ? 'ready' : 'needs_work',
      };
      return { overallCompliance: score, findings: [], recommendations: [], riskAssessment: ra, confidenceScore: 0.5 };
    }
  }
}