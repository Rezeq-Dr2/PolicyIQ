import OpenAI from "openai";
import { DPA2018_REGULATIONS, DPA2018_COMPLIANCE_PATTERNS, ICO_ENFORCEMENT_CONTEXT } from "../data/dpa2018-regulations";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface DPA2018ComplianceResult {
  overallCompliance: number;
  dpa2018SpecificFindings: DPA2018Finding[];
  icoGuidanceReferences: ICOReference[];
  ukSpecificRequirements: UKRequirement[];
  sectorSpecificGuidance: SectorGuidance[];
  riskAssessment: UKRiskAssessment;
  actionableRecommendations: UKRecommendation[];
}

export interface DPA2018Finding {
  section: string;
  reference: string;
  requirement: string;
  complianceStatus: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable';
  finding: string;
  icoGuidanceUrl: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enforcementRisk: string;
}

export interface ICOReference {
  guidanceTitle: string;
  url: string;
  relevantSection: string;
  keyRequirement: string;
  complianceGap?: string;
}

export interface UKRequirement {
  requirement: string;
  dpaSection: string;
  status: 'met' | 'partially-met' | 'not-met' | 'unclear';
  evidence: string;
  recommendedAction: string;
}

export interface SectorGuidance {
  sector: string;
  relevantGuidance: string[];
  specificRequirements: string[];
  complianceLevel: number;
}

export interface UKRiskAssessment {
  overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  icoEnforcementRisk: string;
  potentialFineExposure: string;
  reputationalRisk: string;
  businessImpact: string;
  mitigationPriority: string[];
}

export interface UKRecommendation {
  priority: 'immediate' | 'high' | 'medium' | 'low';
  category: 'legal-compliance' | 'ico-guidance' | 'technical-security' | 'governance';
  title: string;
  description: string;
  dpaReference: string;
  icoGuidance: string;
  implementationSteps: string[];
  timeframe: string;
  businessJustification: string;
}

export class DPA2018ComplianceAnalyzer {

  /**
   * Analyze policy document against DPA 2018 and ICO guidance
   */
  static async analyzeDPA2018Compliance(
    policyText: string,
    organizationType?: string
  ): Promise<DPA2018ComplianceResult> {

    // Analyze against DPA 2018 specific provisions
    const dpa2018Findings = await this.analyzeDPA2018Provisions(policyText);
    
    // Generate ICO guidance references
    const icoReferences = await this.generateICOGuidanceReferences(policyText, dpa2018Findings);
    
    // Check UK-specific requirements
    const ukRequirements = await this.checkUKSpecificRequirements(policyText);
    
    // Generate sector-specific guidance if applicable
    const sectorGuidance = this.generateSectorSpecificGuidance(policyText, organizationType);
    
    // Assess UK-specific risks
    const riskAssessment = this.assessUKRisks(dpa2018Findings, ukRequirements);
    
    // Generate UK-focused recommendations
    const recommendations = await this.generateUKRecommendations(
      dpa2018Findings, 
      ukRequirements, 
      riskAssessment
    );

    // Calculate overall compliance score
    const overallCompliance = this.calculateDPA2018ComplianceScore(
      dpa2018Findings, 
      ukRequirements
    );

    return {
      overallCompliance,
      dpa2018SpecificFindings: dpa2018Findings,
      icoGuidanceReferences: icoReferences,
      ukSpecificRequirements: ukRequirements,
      sectorSpecificGuidance: sectorGuidance,
      riskAssessment,
      actionableRecommendations: recommendations
    };
  }

  /**
   * Analyze against specific DPA 2018 provisions
   */
  private static async analyzeDPA2018Provisions(policyText: string): Promise<DPA2018Finding[]> {
    const findings: DPA2018Finding[] = [];

    // Check key DPA 2018 sections
    const sectionsToCheck = [
      ...DPA2018_REGULATIONS.part2.sections,
      ...DPA2018_REGULATIONS.ukSpecificProvisions,
      ...DPA2018_REGULATIONS.icoRequirements
    ];

    for (const section of sectionsToCheck) {
      const finding = await this.analyzeSpecificSection(policyText, section);
      findings.push(finding);
    }

    return findings;
  }

  /**
   * Analyze a specific DPA 2018 section
   */
  private static async analyzeSpecificSection(
    policyText: string, 
    section: any
  ): Promise<DPA2018Finding> {
    
    const prompt = `
    You are a UK data protection law expert specializing in the Data Protection Act 2018. 
    
    Analyze this privacy policy against the specific DPA 2018 requirement:
    
    Section: ${section.reference || section.provision}
    Requirement: ${section.requirement || section.description}
    
    Privacy Policy Text:
    ${policyText}
    
    Provide analysis in JSON format:
    {
      "complianceStatus": "compliant|partial|non-compliant|not-applicable",
      "finding": "Detailed analysis of compliance with this specific DPA 2018 requirement",
      "severity": "low|medium|high|critical",
      "enforcementRisk": "Assessment of ICO enforcement risk for this specific issue",
      "evidence": "Specific text from policy that supports the finding"
    }
    
    Focus specifically on UK DPA 2018 requirements, not generic GDPR compliance.
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      const analysis = content ? JSON.parse(content) : {};

      return {
        section: section.title || section.provision,
        reference: section.reference || section.provision,
        requirement: section.requirement || section.description,
        complianceStatus: analysis.complianceStatus,
        finding: analysis.finding,
        icoGuidanceUrl: section.icoGuidance || '',
        severity: analysis.severity,
        enforcementRisk: analysis.enforcementRisk
      };
    } catch (error) {
      return {
        section: section.title || section.provision,
        reference: section.reference || section.provision,
        requirement: section.requirement || section.description,
        complianceStatus: 'not-applicable',
        finding: 'Unable to analyze due to processing error',
        icoGuidanceUrl: section.icoGuidance || '',
        severity: 'low',
        enforcementRisk: 'Unable to assess'
      };
    }
  }

  /**
   * Generate ICO-specific guidance references
   */
  private static async generateICOGuidanceReferences(
    policyText: string,
    findings: DPA2018Finding[]
  ): Promise<ICOReference[]> {
    const references: ICOReference[] = [];

    // Add ICO guidance for identified issues
    const nonCompliantFindings = findings.filter(f => 
      f.complianceStatus === 'non-compliant' || f.complianceStatus === 'partial'
    );

    for (const finding of nonCompliantFindings) {
      if (finding.icoGuidanceUrl) {
        references.push({
          guidanceTitle: `ICO Guidance: ${finding.section}`,
          url: finding.icoGuidanceUrl,
          relevantSection: finding.reference,
          keyRequirement: finding.requirement,
          complianceGap: finding.finding
        });
      }
    }

    // Add general ICO guidance references
    references.push(
      {
        guidanceTitle: "Guide to the General Data Protection Regulation (GDPR)",
        url: "https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/",
        relevantSection: "General GDPR compliance",
        keyRequirement: "Comprehensive GDPR compliance guide for UK organisations"
      },
      {
        guidanceTitle: "Privacy notices, transparency and control",
        url: "https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/individual-rights/right-to-be-informed/",
        relevantSection: "Right to be informed",
        keyRequirement: "Clear and transparent privacy notices"
      },
      {
        guidanceTitle: "Data Protection Fee",
        url: "https://ico.org.uk/for-organisations/data-protection-fee/",
        relevantSection: "Fee obligations",
        keyRequirement: "Annual data protection fee payment"
      }
    );

    return references;
  }

  /**
   * Check UK-specific requirements
   */
  private static async checkUKSpecificRequirements(policyText: string): Promise<UKRequirement[]> {
    const requirements: UKRequirement[] = [];

    // Check against compliance patterns
    for (const [key, pattern] of Object.entries(DPA2018_COMPLIANCE_PATTERNS)) {
      const hasPattern = pattern.pattern.test(policyText);
      const status = hasPattern ? 'met' : 'not-met';
      
      requirements.push({
        requirement: pattern.requirement,
        dpaSection: pattern.section,
        status,
        evidence: hasPattern ? 'Pattern found in policy text' : 'No evidence found in policy',
        recommendedAction: hasPattern ? 'Review implementation details' : 'Add specific provision to policy'
      });
    }

    // Specific UK requirements
    const ukSpecificChecks = [
      {
        requirement: "UK age of consent (13 years) specified",
        dpaSection: "Section 9 DPA 2018",
        pattern: /13.*years|age.*13|thirteen.*years/i
      },
      {
        requirement: "ICO as supervisory authority mentioned",
        dpaSection: "DPA 2018 general",
        pattern: /ICO|Information.*Commissioner|supervisory.*authority.*UK/i
      },
      {
        requirement: "UK GDPR explicitly referenced",
        dpaSection: "DPA 2018 general",
        pattern: /UK.*GDPR|Data.*Protection.*Act.*2018|DPA.*2018/i
      },
      {
        requirement: "Post-Brexit data transfer provisions",
        dpaSection: "Schedule 21 DPA 2018",
        pattern: /adequacy.*decision|international.*transfer.*UK|Brexit.*data|UK.*adequacy/i
      }
    ];

    for (const check of ukSpecificChecks) {
      const hasRequirement = check.pattern.test(policyText);
      requirements.push({
        requirement: check.requirement,
        dpaSection: check.dpaSection,
        status: hasRequirement ? 'met' : 'not-met',
        evidence: hasRequirement ? 'Requirement addressed in policy' : 'Requirement not found in policy',
        recommendedAction: hasRequirement ? 'Verify implementation' : 'Add UK-specific provision'
      });
    }

    return requirements;
  }

  /**
   * Generate sector-specific guidance
   */
  private static generateSectorSpecificGuidance(
    policyText: string, 
    organizationType?: string
  ): SectorGuidance[] {
    const guidance: SectorGuidance[] = [];

    // Auto-detect sector from policy text
    const detectedSectors = [];
    
    if (/health|medical|NHS|patient|healthcare/i.test(policyText)) {
      detectedSectors.push('healthcare');
    }
    if (/school|education|pupil|student|university/i.test(policyText)) {
      detectedSectors.push('education');
    }
    if (/financial|bank|credit|payment|fintech/i.test(policyText)) {
      detectedSectors.push('finance');
    }

    // Add organization type if provided
    if (organizationType) {
      detectedSectors.push(organizationType);
    }

    // Generate guidance for detected sectors
    type KnownSector = keyof typeof DPA2018_REGULATIONS.sectorGuidance;
    for (const sector of detectedSectors) {
      const sectorKey = sector as KnownSector;
      const sectorData = (DPA2018_REGULATIONS.sectorGuidance as Record<KnownSector, any>)[sectorKey];
      if (sectorData) {
        guidance.push({
          sector: sectorKey,
          relevantGuidance: [sectorData.icoGuidance],
          specificRequirements: sectorData.keyRequirements,
          complianceLevel: this.calculateSectorCompliance(policyText, sectorData)
        });
      }
    }

    return guidance;
  }

  /**
   * Calculate sector-specific compliance
   */
  private static calculateSectorCompliance(policyText: string, sectorData: any): number {
    let score = 0;
    const requirements = sectorData.keyRequirements;
    
    for (const requirement of requirements) {
      // Simple keyword matching for demo - in production would use more sophisticated analysis
      if (policyText.toLowerCase().includes(requirement.toLowerCase().split(' ')[0])) {
        score += 1;
      }
    }
    
    return Math.round((score / requirements.length) * 100);
  }

  /**
   * Assess UK-specific risks
   */
  private static assessUKRisks(
    findings: DPA2018Finding[], 
    requirements: UKRequirement[]
  ): UKRiskAssessment {
    
    const criticalFindings = findings.filter(f => f.severity === 'critical').length;
    const highFindings = findings.filter(f => f.severity === 'high').length;
    const unmetRequirements = requirements.filter(r => r.status === 'not-met').length;

    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let fineExposure = '£40 - £10,000';
    let enforcementRisk = 'Low risk of ICO enforcement action';

    if (criticalFindings > 0) {
      riskLevel = 'critical';
      fineExposure = 'Up to £17.5 million or 4% of annual global turnover';
      enforcementRisk = 'High risk of immediate ICO enforcement action';
    } else if (highFindings > 2 || unmetRequirements > 5) {
      riskLevel = 'high';
      fineExposure = '£100,000 - £1 million';
      enforcementRisk = 'Moderate risk of ICO investigation';
    } else if (highFindings > 0 || unmetRequirements > 2) {
      riskLevel = 'medium';
      fineExposure = '£10,000 - £100,000';
      enforcementRisk = 'Low to moderate risk of ICO inquiry';
    }

    return {
      overallRiskLevel: riskLevel,
      icoEnforcementRisk: enforcementRisk,
      potentialFineExposure: fineExposure,
      reputationalRisk: riskLevel === 'critical' ? 'Severe reputational damage possible' : 
                       riskLevel === 'high' ? 'Significant reputational risk' : 'Limited reputational impact',
      businessImpact: riskLevel === 'critical' ? 'Potential business suspension' :
                     riskLevel === 'high' ? 'Operational disruption likely' : 'Minimal business impact',
      mitigationPriority: this.generateMitigationPriorities(riskLevel, findings)
    };
  }

  /**
   * Generate mitigation priorities
   */
  private static generateMitigationPriorities(
    riskLevel: string, 
    findings: DPA2018Finding[]
  ): string[] {
    const priorities = [];

    if (riskLevel === 'critical') {
      priorities.push('Immediate legal review required');
      priorities.push('Engage external DPA 2018 specialist');
      priorities.push('Implement emergency data protection measures');
    }

    // Add specific priorities based on findings
    const criticalFindings = findings.filter(f => f.severity === 'critical');
    for (const finding of criticalFindings) {
      priorities.push(`Address: ${finding.section}`);
    }

    if (priorities.length === 0) {
      priorities.push('Continue regular compliance monitoring');
      priorities.push('Schedule quarterly ICO guidance review');
    }

    return priorities.slice(0, 5); // Top 5 priorities
  }

  /**
   * Generate UK-focused recommendations
   */
  private static async generateUKRecommendations(
    findings: DPA2018Finding[],
    requirements: UKRequirement[],
    riskAssessment: UKRiskAssessment
  ): Promise<UKRecommendation[]> {
    
    const recommendations: UKRecommendation[] = [];

    // Add recommendations for non-compliant findings
    for (const finding of findings) {
      if (finding.complianceStatus === 'non-compliant' || finding.complianceStatus === 'partial') {
        recommendations.push({
          priority: finding.severity === 'critical' ? 'immediate' : 
                   finding.severity === 'high' ? 'high' : 'medium',
          category: 'legal-compliance',
          title: `Address DPA 2018 compliance: ${finding.section}`,
          description: finding.finding,
          dpaReference: finding.reference,
          icoGuidance: finding.icoGuidanceUrl,
          implementationSteps: [
            'Review ICO guidance',
            'Update policy language',
            'Implement technical measures',
            'Train relevant staff'
          ],
          timeframe: finding.severity === 'critical' ? '48 hours' : 
                    finding.severity === 'high' ? '1 week' : '1 month',
          businessJustification: `Reduces ICO enforcement risk and ensures DPA 2018 compliance`
        });
      }
    }

    // Add UK-specific recommendations
    const unmetRequirements = requirements.filter(r => r.status === 'not-met');
    for (const requirement of unmetRequirements.slice(0, 3)) { // Top 3 unmet requirements
      recommendations.push({
        priority: 'high',
        category: 'ico-guidance',
        title: `Implement UK requirement: ${requirement.requirement}`,
        description: requirement.recommendedAction,
        dpaReference: requirement.dpaSection,
        icoGuidance: 'https://ico.org.uk/for-organisations/',
        implementationSteps: [
          'Review DPA 2018 provision',
          'Update privacy policy',
          'Implement procedural changes',
          'Document compliance measures'
        ],
        timeframe: '2 weeks',
        businessJustification: 'Ensures full UK DPA 2018 compliance and reduces regulatory risk'
      });
    }

    return recommendations.slice(0, 8); // Top 8 recommendations
  }

  /**
   * Calculate overall DPA 2018 compliance score
   */
  private static calculateDPA2018ComplianceScore(
    findings: DPA2018Finding[],
    requirements: UKRequirement[]
  ): number {
    let score = 100;

    // Deduct points for non-compliant findings
    for (const finding of findings) {
      switch (finding.complianceStatus) {
        case 'non-compliant':
          score -= finding.severity === 'critical' ? 25 : 
                   finding.severity === 'high' ? 15 : 
                   finding.severity === 'medium' ? 10 : 5;
          break;
        case 'partial':
          score -= finding.severity === 'critical' ? 15 : 
                   finding.severity === 'high' ? 10 : 
                   finding.severity === 'medium' ? 5 : 2;
          break;
      }
    }

    // Deduct points for unmet UK requirements
    const unmetRequirements = requirements.filter(r => r.status === 'not-met').length;
    score -= unmetRequirements * 5;

    return Math.max(0, Math.round(score));
  }
}