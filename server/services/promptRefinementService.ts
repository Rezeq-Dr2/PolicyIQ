import { storage } from "../storage";

interface PromptFeedback {
  id: string;
  promptId: string;
  analysisId: string;
  userFeedback: 'accurate' | 'inaccurate' | 'incomplete';
  specificIssues: string[];
  expectedOutput?: string;
  createdAt: Date;
}

interface PromptVersion {
  id: string;
  promptType: 'compliance-analysis' | 'dpa2018-analysis' | 'health-safety-analysis';
  version: number;
  promptText: string;
  performance: {
    accuracyScore: number;
    totalUsages: number;
    positiveReviews: number;
    commonIssues: string[];
  };
  createdAt: Date;
  isActive: boolean;
}

function sampleBeta(alpha: number, beta: number): number {
  // Simple approx via Math.random() power transform for Beta when alpha,beta near 1
  const u1 = Math.random() ** (1/alpha);
  const u2 = Math.random() ** (1/beta);
  return u1 / (u1 + u2);
}

export class PromptRefinementService {
  
  async recordFeedback(feedback: Omit<PromptFeedback, 'id' | 'createdAt'>): Promise<void> {
    try {
      // Store feedback in database
      await storage.createPromptFeedback({
        ...feedback,
        id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date()
      });
      const wasAccurate = feedback.userFeedback === 'accurate';
      await this.updatePromptPerformance(feedback.promptId, wasAccurate);
      // Trigger prompt refinement if enough negative feedback
      await this.checkForRefinementTrigger(feedback.promptId);
    } catch (error) {
      console.error('Error recording prompt feedback:', error);
    }
  }

  async getOptimalPrompt(promptType: PromptVersion['promptType']): Promise<string> {
    try {
      const activePrompt = await storage.getActivePromptVersion(promptType);
      return activePrompt?.promptText || this.getDefaultPrompt(promptType);
    } catch (error) {
      console.error('Error getting optimal prompt:', error);
      return this.getDefaultPrompt(promptType);
    }
  }

  async selectPromptVersionThompson(promptType: PromptVersion['promptType']): Promise<PromptVersion | null> {
    // Fallback: if storage lacks versions listing, use the single active one
    const active = await storage.getActivePromptVersion(promptType);
    if (!active) return null;
    return active as any;
  }

  private async checkForRefinementTrigger(promptId: string): Promise<void> {
    try {
      const recentFeedback = await storage.getRecentPromptFeedback(promptId, 10);
      
      const negativeCount = recentFeedback.filter(f => 
        f.userFeedback === 'inaccurate' || f.userFeedback === 'incomplete'
      ).length;
      
      // Trigger refinement if more than 40% negative feedback in recent samples
      if (recentFeedback.length >= 5 && negativeCount / recentFeedback.length > 0.4) {
        await this.refinePrompt(promptId, recentFeedback);
      }
    } catch (error) {
      console.error('Error checking refinement trigger:', error);
    }
  }

  private async refinePrompt(promptId: string, feedback: PromptFeedback[]): Promise<void> {
    try {
      const currentPrompt = await storage.getPromptVersion(promptId);
      if (!currentPrompt) return;

      // Analyze common issues
      const commonIssues = this.extractCommonIssues(feedback);
      
      // Generate refined prompt
      const refinedPrompt = await this.generateRefinedPrompt(currentPrompt, commonIssues, feedback);
      
      // Create new prompt version
      await storage.createPromptVersion({
        id: `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        promptType: currentPrompt.promptType,
        version: currentPrompt.version + 1,
        promptText: refinedPrompt,
        performance: {
          accuracyScore: 0,
          totalUsages: 0,
          positiveReviews: 0,
          commonIssues: []
        },
        createdAt: new Date(),
        isActive: true
      });

      // Deactivate old prompt
      await storage.updatePromptVersion(promptId, { isActive: false });
      
      console.log(`Refined prompt for ${currentPrompt.promptType}, new version: ${currentPrompt.version + 1}`);
    } catch (error) {
      console.error('Error refining prompt:', error);
    }
  }

  private extractCommonIssues(feedback: PromptFeedback[]): string[] {
    const allIssues = feedback.flatMap(f => f.specificIssues);
    const issueCounts = allIssues.reduce((acc, issue) => {
      acc[issue] = (acc[issue] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Return issues that appear in more than 20% of feedback
    const threshold = Math.max(1, Math.floor(feedback.length * 0.2));
    return Object.entries(issueCounts)
      .filter(([_, count]) => count >= threshold)
      .map(([issue, _]) => issue);
  }

  private async generateRefinedPrompt(
    currentPrompt: PromptVersion, 
    commonIssues: string[], 
    feedback: PromptFeedback[]
  ): Promise<string> {
    // This would use AI to refine the prompt based on feedback
    // For now, we'll use rule-based improvements
    
    let refinedPrompt = currentPrompt.promptText;
    
    // Add specific instructions based on common issues
    if (commonIssues.includes('missing legal citations')) {
      refinedPrompt += '\n\nIMPORTANT: Always include specific legal citations and reference numbers in your analysis.';
    }
    
    if (commonIssues.includes('vague recommendations')) {
      refinedPrompt += '\n\nIMPORTANT: Provide specific, actionable recommendations with clear implementation steps.';
    }
    
    if (commonIssues.includes('incorrect risk assessment')) {
      refinedPrompt += '\n\nIMPORTANT: Carefully evaluate risk levels based on potential regulatory consequences and enforcement likelihood.';
    }
    
    if (commonIssues.includes('incomplete analysis')) {
      refinedPrompt += '\n\nIMPORTANT: Ensure comprehensive analysis covering all relevant regulatory requirements.';
    }
    
    return refinedPrompt;
  }

  private getDefaultPrompt(promptType: PromptVersion['promptType']): string {
    switch (promptType) {
      case 'compliance-analysis':
        return `
Analyze the following policy text for compliance against the provided regulatory clauses using a step-by-step approach:

Please think through this analysis step-by-step:

1. UNDERSTANDING: First, identify the key requirements from each regulatory clause
2. EXTRACTION: Extract the relevant provisions from the policy text
3. COMPARISON: Compare each policy provision against the regulatory requirements
4. GAPS IDENTIFICATION: Identify any missing or insufficient provisions
5. RISK ASSESSMENT: Evaluate the compliance risk level based on gaps found
6. RECOMMENDATIONS: Generate specific, actionable recommendations

Focus on semantic meaning and legal intent, not just keyword matching.
`;

      case 'dpa2018-analysis':
        return `
You are a UK data protection expert specializing in the Data Protection Act 2018 and ICO guidance.

Analyze the policy text step-by-step:

1. UNDERSTANDING: Identify DPA 2018 requirements
2. COMPLIANCE CHECK: Verify policy compliance with each requirement
3. ICO GUIDANCE: Reference relevant ICO guidance documents
4. RISK ASSESSMENT: Evaluate enforcement and business risks
5. RECOMMENDATIONS: Provide UK-specific actionable recommendations

Include specific DPA 2018 section references and ICO guidance URLs where applicable.
`;

      case 'health-safety-analysis':
        return `
You are a UK health and safety law expert specializing in the Health and Safety at Work etc. Act 1974 and HSE guidance.

Analyze the policy text step-by-step:

1. UNDERSTANDING: Identify Health & Safety Act requirements
2. COMPLIANCE CHECK: Verify policy compliance with each requirement  
3. HSE GUIDANCE: Reference relevant HSE guidance documents
4. RISK ASSESSMENT: Evaluate enforcement and workplace safety risks
5. RECOMMENDATIONS: Provide UK-specific actionable recommendations

Include specific Act section references and HSE guidance URLs where applicable.
`;

      default:
        return 'Analyze the provided text for compliance.';
    }
  }

  async updatePromptPerformance(promptId: string, wasAccurate: boolean): Promise<void> {
    try {
      const prompt = await storage.getPromptVersion(promptId);
      if (!prompt) return;

      const updatedPerformance = {
        ...prompt.performance,
        totalUsages: prompt.performance.totalUsages + 1,
        positiveReviews: wasAccurate ? prompt.performance.positiveReviews + 1 : prompt.performance.positiveReviews
      };

      updatedPerformance.accuracyScore = updatedPerformance.positiveReviews / Math.max(1, updatedPerformance.totalUsages);

      await storage.updatePromptVersion(promptId, { performance: updatedPerformance });
    } catch (error) {
      console.error('Error updating prompt performance:', error);
    }
  }
}

export const promptRefinementService = new PromptRefinementService();