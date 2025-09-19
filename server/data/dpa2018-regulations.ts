// Data Protection Act 2018 - UK Specific Requirements
// This module contains the specific provisions of the DPA 2018 that go beyond GDPR

export const DPA2018_REGULATIONS = {
  act: "Data Protection Act 2018",
  jurisdiction: "United Kingdom",
  authority: "Information Commissioner's Office (ICO)",
  lastUpdated: "2024-12-01",
  
  // Part 2 - General Processing (GDPR Implementation)
  part2: {
    title: "General Processing",
    description: "UK implementation of GDPR with specific derogations and additions",
    sections: [
      {
        section: "Section 10",
        title: "Special categories of personal data and criminal conviction data",
        subsections: [
          {
            reference: "Section 10(1)",
            title: "Processing for employment purposes",
            requirement: "The processing is necessary for the purposes of performing or exercising obligations or rights which are imposed or conferred by law on the controller or the data subject in connection with employment, social security or social protection",
            complianceCheck: "employment_data_processing",
            icoGuidance: "Employment practices code: https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/employment/"
          },
          {
            reference: "Section 10(2)",
            title: "Processing for health or social care purposes",
            requirement: "The processing is necessary for health or social care purposes and is carried out by or under the responsibility of a health professional or social work professional",
            complianceCheck: "health_data_processing",
            icoGuidance: "Health data guidance: https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/special-category-data/"
          }
        ]
      },
      {
        section: "Section 11",
        title: "Public task: safeguarding of children and of individuals at risk",
        subsections: [
          {
            reference: "Section 11(1)",
            title: "Safeguarding processing",
            requirement: "Processing is necessary for the performance of a task carried out for the purposes of protecting an individual under 18 years of age, or an individual at risk, where the processing is carried out without the consent of the data subject",
            complianceCheck: "safeguarding_processing",
            icoGuidance: "Safeguarding guidance: https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/lawful-basis-for-processing/"
          }
        ]
      }
    ]
  },

  // Part 3 - Law Enforcement Processing
  part3: {
    title: "Law Enforcement Processing",
    description: "Processing for law enforcement purposes under the LED (Law Enforcement Directive)",
    sections: [
      {
        section: "Section 31",
        title: "Scope of Part 3",
        subsections: [
          {
            reference: "Section 31(1)",
            title: "Law enforcement processing scope",
            requirement: "This Part applies to the processing of personal data by a competent authority for any of the law enforcement purposes",
            complianceCheck: "law_enforcement_scope",
            icoGuidance: "Law enforcement guidance: https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-le-processing/"
          }
        ]
      }
    ]
  },

  // Part 4 - Intelligence Services Processing
  part4: {
    title: "Intelligence Services Processing",
    description: "Processing by intelligence services with specific safeguards",
    sections: [
      {
        section: "Section 82",
        title: "Scope of Part 4",
        subsections: [
          {
            reference: "Section 82(1)",
            title: "Intelligence services scope",
            requirement: "This Part applies to the processing of personal data by an intelligence service",
            complianceCheck: "intelligence_services_scope",
            icoGuidance: "Intelligence services guidance: https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-intelligence-services-processing/"
          }
        ]
      }
    ]
  },

  // Key UK-Specific Provisions
  ukSpecificProvisions: [
    {
      provision: "Age of consent",
      reference: "Section 9",
      requirement: "In the UK, the age below which consent cannot be given is 13 years",
      complianceCheck: "age_of_consent_uk",
      icoGuidance: "Children's code: https://ico.org.uk/for-organisations/guide-to-data-protection/ico-codes-of-practice/age-appropriate-design-a-code-of-practice-for-online-services/"
    },
    {
      provision: "Representative requirements",
      reference: "Section 3(2)",
      requirement: "Controllers not established in the UK must appoint a representative in the UK if they process personal data of UK data subjects",
      complianceCheck: "uk_representative_required",
      icoGuidance: "Representatives guidance: https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/international-transfers/"
    },
    {
      provision: "Immigration exemption",
      reference: "Schedule 2, Part 1, paragraph 4",
      requirement: "Exemption for processing for immigration control purposes",
      complianceCheck: "immigration_exemption",
      icoGuidance: "Immigration exemption: https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/exemptions/"
    }
  ],

  // ICO Specific Requirements
  icoRequirements: [
    {
      requirement: "Data Protection Fee",
      reference: "DPA 2018, Section 117-120",
      description: "Most organisations must pay an annual data protection fee to the ICO",
      complianceCheck: "ico_fee_paid",
      details: "Fee ranges from £40-£2,900 depending on organisation size and turnover",
      icoGuidance: "Data protection fee: https://ico.org.uk/for-organisations/data-protection-fee/"
    },
    {
      requirement: "Breach notification to ICO",
      reference: "GDPR Article 33 as implemented by DPA 2018",
      description: "Personal data breaches must be reported to the ICO within 72 hours where feasible",
      complianceCheck: "breach_notification_procedure",
      details: "Use ICO's online breach reporting tool",
      icoGuidance: "Breach reporting: https://ico.org.uk/for-organisations/report-a-breach/"
    },
    {
      requirement: "Direct Marketing Rules",
      reference: "DPA 2018, Section 122-124 and PECR",
      description: "Specific rules for direct marketing under DPA 2018 and Privacy and Electronic Communications Regulations",
      complianceCheck: "direct_marketing_compliance",
      details: "Must comply with both DPA 2018 and PECR requirements",
      icoGuidance: "Direct marketing guidance: https://ico.org.uk/for-organisations/guide-to-pecr/electronic-and-telephone-marketing/"
    }
  ],

  // Post-Brexit Specific Requirements
  postBrexitRequirements: [
    {
      requirement: "UK Adequacy Decision",
      description: "Processing data transfers from EEA to UK under adequacy decision",
      complianceCheck: "uk_adequacy_transfers",
      icoGuidance: "International transfers: https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/international-transfers/"
    },
    {
      requirement: "Dual Compliance",
      description: "Organisations operating in both UK and EU may need dual compliance",
      complianceCheck: "dual_uk_eu_compliance",
      icoGuidance: "Brexit and data protection: https://ico.org.uk/for-organisations/data-protection-and-the-eu-in-detail/"
    }
  ],

  // Sector-Specific Guidance
  sectorGuidance: {
    healthcare: {
      title: "Healthcare Data Protection",
      keyRequirements: [
        "NHS Digital guidance compliance",
        "Health and social care data processing conditions",
        "Medical research exemptions under Schedule 2"
      ],
      icoGuidance: "https://ico.org.uk/for-organisations/health/"
    },
    education: {
      title: "Education Data Protection",
      keyRequirements: [
        "Pupil information and parental rights",
        "School census data obligations",
        "Educational research provisions"
      ],
      icoGuidance: "https://ico.org.uk/for-organisations/education/"
    },
    finance: {
      title: "Financial Services",
      keyRequirements: [
        "FCA data protection requirements",
        "Financial crime prevention processing",
        "Credit reference agency obligations"
      ],
      icoGuidance: "https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/lawful-basis-for-processing/"
    }
  }
};

// Common DPA 2018 compliance check patterns
export const DPA2018_COMPLIANCE_PATTERNS = {
  // Age verification for UK (13 years)
  age_verification_uk: {
    pattern: /age.*verification|age.*consent|under.*13|children.*consent/i,
    requirement: "Must verify age of consent is 13 or over in the UK",
    section: "Section 9 DPA 2018"
  },

  // ICO registration and fees
  ico_registration: {
    pattern: /ico.*registration|data.*protection.*fee|ico.*fee/i,
    requirement: "Must register with ICO and pay appropriate data protection fee",
    section: "Sections 117-120 DPA 2018"
  },

  // UK representative requirements
  uk_representative: {
    pattern: /uk.*representative|representative.*uk|not.*established.*uk/i,
    requirement: "Non-UK established controllers must appoint UK representative",
    section: "Section 3(2) DPA 2018"
  },

  // Breach notification specific to ICO
  ico_breach_notification: {
    pattern: /breach.*notification|personal.*data.*breach|72.*hours|ico.*reporting/i,
    requirement: "Must report qualifying breaches to ICO within 72 hours",
    section: "Article 33 GDPR as implemented by DPA 2018"
  },

  // Direct marketing under DPA 2018 and PECR
  direct_marketing_uk: {
    pattern: /direct.*marketing|marketing.*communications|electronic.*marketing|pecr/i,
    requirement: "Must comply with DPA 2018 and PECR for direct marketing",
    section: "Sections 122-124 DPA 2018 and PECR"
  },

  // Special category data under UK implementation
  special_category_uk: {
    pattern: /health.*data|ethnic.*origin|political.*opinions|religious.*beliefs|trade.*union/i,
    requirement: "Must meet UK conditions for processing special category data",
    section: "Section 10 DPA 2018 and Schedule 1"
  },

  // Law enforcement processing
  law_enforcement_processing: {
    pattern: /law.*enforcement|police|criminal.*investigation|national.*security/i,
    requirement: "Different rules apply for law enforcement processing",
    section: "Part 3 DPA 2018"
  }
};

// ICO enforcement actions and penalties
export const ICO_ENFORCEMENT_CONTEXT = {
  maximumFines: {
    gdprTier1: "£17.5 million or 4% of annual global turnover (whichever is higher)",
    gdprTier2: "£8.7 million or 2% of annual global turnover (whichever is higher)",
    pecr: "£500,000",
    dataProtectionFee: "£1,000 plus ongoing non-compliance penalties"
  },
  
  recentEnforcement: [
    {
      organisation: "British Airways",
      fine: "£20 million",
      reason: "Failure to implement appropriate technical and organisational measures",
      year: "2020"
    },
    {
      organisation: "Marriott International",
      fine: "£18.4 million", 
      reason: "Failure to implement appropriate technical and organisational measures",
      year: "2020"
    }
  ],
  
  commonViolations: [
    "Failure to implement appropriate security measures",
    "Unlawful processing without proper legal basis",
    "Failure to respond to data subject requests within timeframes",
    "Non-payment of data protection fee",
    "Inadequate privacy notices"
  ]
};