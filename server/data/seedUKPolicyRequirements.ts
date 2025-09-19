import { storage } from "../storage";
import { UK_LEGAL_POLICY_REQUIREMENTS } from "./uk-legal-policy-requirements";

export async function seedUKPolicyRequirements() {
  console.log("Seeding UK legal policy requirements...");

  try {
    // First, create or update the UK Legal Compliance regulation
    let ukLegalRegulation;
    const existingRegulations = await storage.getAllRegulations();
    const existing = existingRegulations.find(r => r.name === "UK Legal Compliance");
    
    if (existing) {
      console.log("UK Legal Compliance regulation already exists, updating...");
      ukLegalRegulation = existing;
    } else {
      console.log("Creating UK Legal Compliance regulation...");
      ukLegalRegulation = await storage.createRegulation({
        name: "UK Legal Compliance",
        fullName: "United Kingdom Legal Policy Requirements for Businesses",
        description: "Comprehensive UK legal policy requirements including employment law, data protection, health & safety, and industry-specific compliance obligations for small and medium enterprises.",
        jurisdiction: "United Kingdom",
        effectiveDate: new Date("2024-01-01"),
        version: "2024.1",
        isActive: true,
        lastUpdatedBy: "PolicyIQ System"
      });
    }

    const regulationId = ukLegalRegulation.id;
    let clauseCount = 0;

    // Add Employment Law clauses
    const employmentPolicies = UK_LEGAL_POLICY_REQUIREMENTS.employment;
    for (const [policyKey, policy] of Object.entries(employmentPolicies)) {
      for (const clause of policy.clauses) {
        const clauseText = `${policy.name} - ${clause.requirement}

${clause.content}

Legal Basis: ${policy.legalBasis}
Applicable to: ${policy.companySize}
Compliance Type: ${policy.mandatory ? "Mandatory" : "Recommended"}
Risk Level: ${clause.riskLevel}
Category: ${clause.category}`;

        await storage.createRegulationClause({
          regulationId,
          clauseIdentifier: clause.id,
          clauseText,
          lastUpdatedBy: "PolicyIQ System"
        });
        clauseCount++;
      }
    }

    // Add Data Protection clauses
    const dataProtectionPolicies = UK_LEGAL_POLICY_REQUIREMENTS.dataProtection;
    for (const [policyKey, policy] of Object.entries(dataProtectionPolicies)) {
      for (const clause of policy.clauses) {
        const clauseText = `${policy.name} - ${clause.requirement}

${clause.content}

Legal Basis: ${policy.legalBasis}
Applicable to: ${policy.companySize}
Compliance Type: ${policy.mandatory ? "Mandatory" : "Recommended"}
Risk Level: ${clause.riskLevel}
Category: ${clause.category}`;

        await storage.createRegulationClause({
          regulationId,
          clauseIdentifier: clause.id,
          clauseText,
          lastUpdatedBy: "PolicyIQ System"
        });
        clauseCount++;
      }
    }

    // Add Fire Safety clauses
    const fireSafetyPolicies = UK_LEGAL_POLICY_REQUIREMENTS.fireSafety;
    for (const [policyKey, policy] of Object.entries(fireSafetyPolicies)) {
      for (const clause of policy.clauses) {
        const clauseText = `${policy.name} - ${clause.requirement}

${clause.content}

Legal Basis: ${policy.legalBasis}
Applicable to: ${policy.companySize}
Compliance Type: ${policy.mandatory ? "Mandatory" : "Recommended"}
Risk Level: ${clause.riskLevel}
Category: ${clause.category}`;

        await storage.createRegulationClause({
          regulationId,
          clauseIdentifier: clause.id,
          clauseText,
          lastUpdatedBy: "PolicyIQ System"
        });
        clauseCount++;
      }
    }

    // Add Medium Company specific clauses
    const mediumCompanyPolicies = UK_LEGAL_POLICY_REQUIREMENTS.mediumCompany;
    for (const [policyKey, policy] of Object.entries(mediumCompanyPolicies)) {
      for (const clause of policy.clauses) {
        const clauseText = `${policy.name} - ${clause.requirement}

${clause.content}

Legal Basis: ${policy.legalBasis}
Applicable to: ${policy.companySize}
Compliance Type: ${policy.mandatory ? "Mandatory" : "Recommended"}
Risk Level: ${clause.riskLevel}
Category: ${clause.category}`;

        await storage.createRegulationClause({
          regulationId,
          clauseIdentifier: clause.id,
          clauseText,
          lastUpdatedBy: "PolicyIQ System"
        });
        clauseCount++;
      }
    }

    // Add Large Company specific clauses
    const largeCompanyPolicies = UK_LEGAL_POLICY_REQUIREMENTS.largeCompany;
    for (const [policyKey, policy] of Object.entries(largeCompanyPolicies)) {
      for (const clause of policy.clauses) {
        const clauseText = `${policy.name} - ${clause.requirement}

${clause.content}

Legal Basis: ${policy.legalBasis}
Applicable to: ${policy.companySize}
Compliance Type: ${policy.mandatory ? "Mandatory" : "Recommended"}
Risk Level: ${clause.riskLevel}
Category: ${clause.category}`;

        await storage.createRegulationClause({
          regulationId,
          clauseIdentifier: clause.id,
          clauseText,
          lastUpdatedBy: "PolicyIQ System"
        });
        clauseCount++;
      }
    }

    // Add Industry-Specific clauses
    const industrySpecificPolicies = UK_LEGAL_POLICY_REQUIREMENTS.industrySpecific;
    for (const [policyKey, policy] of Object.entries(industrySpecificPolicies)) {
      for (const clause of policy.clauses) {
        const industries = 'industries' in policy ? policy.industries.join(', ') : 'All industries';
        const clauseText = `${policy.name} - ${clause.requirement}

${clause.content}

Legal Basis: ${policy.legalBasis}
Applicable to: ${policy.companySize || "Applicable sectors"}
Industries: ${industries}
Compliance Type: ${policy.mandatory ? "Mandatory" : "Recommended"}
Risk Level: ${clause.riskLevel}
Category: ${clause.category}`;

        await storage.createRegulationClause({
          regulationId,
          clauseIdentifier: clause.id,
          clauseText,
          lastUpdatedBy: "PolicyIQ System"
        });
        clauseCount++;
      }
    }

    // Add Recommended Best Practice clauses
    const recommendedPolicies = UK_LEGAL_POLICY_REQUIREMENTS.recommended;
    for (const [policyKey, policy] of Object.entries(recommendedPolicies)) {
      for (const clause of policy.clauses) {
        const clauseText = `${policy.name} - ${clause.requirement}

${clause.content}

Legal Basis: ${policy.legalBasis}
Applicable to: All companies
Compliance Type: ${policy.mandatory ? "Mandatory" : "Recommended"}
Risk Level: ${clause.riskLevel}
Category: ${clause.category}`;

        await storage.createRegulationClause({
          regulationId,
          clauseIdentifier: clause.id,
          clauseText,
          lastUpdatedBy: "PolicyIQ System"
        });
        clauseCount++;
      }
    }

    console.log(`Successfully seeded ${clauseCount} UK legal policy requirement clauses`);
    console.log("UK legal policy requirements seeding completed.");

  } catch (error) {
    console.error("Error seeding UK legal policy requirements:", error);
    throw error;
  }
}