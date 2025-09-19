// UK Legal Policy Requirements for PolicyIQ Analysis
// Based on comprehensive requirements for SMEs in the UK

export const UK_LEGAL_POLICY_REQUIREMENTS = {
  // Core Employment Policies - Mandatory
  employment: {
    healthAndSafety: {
      name: "Health and Safety Policy",
      legalBasis: "Health and Safety at Work etc. Act 1974",
      companySize: "5+ employees",
      mandatory: true,
      clauses: [
        {
          id: "hs_001",
          requirement: "Statement of intent outlining employer's commitment to maintaining a safe workplace",
          content: "The organization must have a written statement of intent that clearly outlines the employer's commitment to health and safety, demonstrating leadership commitment to maintaining a safe workplace for all employees.",
          category: "health-safety",
          riskLevel: "high"
        },
        {
          id: "hs_002", 
          requirement: "Defined responsibilities for health and safety within the organization",
          content: "Clear definition of health and safety responsibilities must be established for all levels of the organization, from senior management to individual employees, with specific roles and accountabilities documented.",
          category: "health-safety",
          riskLevel: "high"
        },
        {
          id: "hs_003",
          requirement: "Specific arrangements to ensure health and safety standards are met",
          content: "Detailed arrangements and procedures must be documented to ensure health and safety standards are consistently met, including risk assessments, training programs, and monitoring procedures.",
          category: "health-safety", 
          riskLevel: "medium"
        },
        {
          id: "hs_004",
          requirement: "Accident Book requirement for companies with 10+ employees",
          content: "Organizations with 10 or more employees must maintain an Accident Book to record all workplace incidents, near misses, and injuries in accordance with RIDDOR requirements.",
          category: "health-safety",
          riskLevel: "medium"
        }
      ]
    },
    disciplinary: {
      name: "Disciplinary and Dismissal Policy",
      legalBasis: "ACAS Code of Practice on Disciplinary and Grievance Procedures",
      companySize: "All companies",
      mandatory: true,
      clauses: [
        {
          id: "disc_001",
          requirement: "Procedures for addressing misconduct and poor performance",
          content: "Clear procedures must be established for addressing both misconduct and poor performance, distinguishing between different types of issues and appropriate responses.",
          category: "employment",
          riskLevel: "high"
        },
        {
          id: "disc_002",
          requirement: "Clear steps for handling disciplinary issues",
          content: "The disciplinary process must include clear, progressive steps including informal discussion, formal investigation, disciplinary hearing, and appeal process.",
          category: "employment", 
          riskLevel: "high"
        },
        {
          id: "disc_003",
          requirement: "Written notice procedures and decision-making processes",
          content: "All disciplinary actions must follow proper written notice procedures with clear decision-making processes that are fair, consistent, and legally compliant.",
          category: "employment",
          riskLevel: "medium"
        }
      ]
    },
    grievance: {
      name: "Grievance Policy",
      legalBasis: "Employment Rights Act 1996 and ACAS Code of Practice",
      companySize: "All companies",
      mandatory: true,
      clauses: [
        {
          id: "griev_001",
          requirement: "Process for submitting a grievance",
          content: "A clear, accessible process must be provided for employees to submit grievances, including who to contact, required format, and timeframes for submission.",
          category: "employment",
          riskLevel: "medium"
        },
        {
          id: "griev_002", 
          requirement: "How grievances will be handled and investigated",
          content: "Detailed procedures for handling and investigating grievances must be established, including impartial investigation processes and evidence gathering.",
          category: "employment",
          riskLevel: "medium"
        },
        {
          id: "griev_003",
          requirement: "Steps involved in the resolution process",
          content: "Clear steps for grievance resolution must be outlined, including timescales, meeting procedures, decision-making processes, and appeal rights.",
          category: "employment",
          riskLevel: "medium"
        }
      ]
    }
  },

  // Data Protection Requirements - Mandatory
  dataProtection: {
    gdprCompliance: {
      name: "Data Protection Policy (GDPR/DPA 2018 Compliance)",
      legalBasis: "Data Protection Act 2018 / UK GDPR",
      companySize: "All companies processing personal data",
      mandatory: true,
      clauses: [
        {
          id: "dp_001",
          requirement: "How personal data is collected, processed, stored, and protected",
          content: "Comprehensive documentation of all personal data lifecycle processes including lawful bases for processing, data minimization, accuracy, storage limitation, and security measures.",
          category: "data-protection",
          riskLevel: "critical"
        },
        {
          id: "dp_002",
          requirement: "Privacy policy for websites and data collection",
          content: "Clear, accessible privacy policy explaining data collection practices, cookies usage, third-party sharing, and individual rights in plain English.",
          category: "data-protection",
          riskLevel: "high"
        },
        {
          id: "dp_003",
          requirement: "Records of processing activities (250+ employees or high-risk)",
          content: "Detailed records of all processing activities including purposes, categories of data, retention periods, and international transfers for companies with 250+ employees or high-risk processing.",
          category: "data-protection",
          riskLevel: "high"
        },
        {
          id: "dp_004",
          requirement: "Data retention policy specifying retention periods",
          content: "Specific data retention schedules for different types of personal data with clear justification for retention periods and secure deletion procedures.",
          category: "data-protection",
          riskLevel: "medium"
        },
        {
          id: "dp_005",
          requirement: "ICO registration for data processing activities",
          content: "All businesses processing personal data must register with the Information Commissioner's Office and pay the annual data protection fee.",
          category: "data-protection",
          riskLevel: "high"
        }
      ]
    }
  },

  // Fire Safety Requirements - Mandatory
  fireSafety: {
    riskAssessment: {
      name: "Fire Risk Assessment and Safety Procedures",
      legalBasis: "Regulatory Reform (Fire Safety) Order 2005",
      companySize: "All businesses",
      mandatory: true,
      clauses: [
        {
          id: "fire_001",
          requirement: "Conduct fire risk assessment (written if 5+ employees)",
          content: "Comprehensive fire risk assessment must be conducted identifying fire hazards, people at risk, and preventive measures. Must be written if 5 or more employees.",
          category: "fire-safety",
          riskLevel: "high"
        },
        {
          id: "fire_002",
          requirement: "Fire safety procedures and evacuation plans",
          content: "Clear fire safety procedures including evacuation plans, assembly points, fire warden responsibilities, and emergency contact procedures must be established and communicated.",
          category: "fire-safety",
          riskLevel: "high"
        },
        {
          id: "fire_003",
          requirement: "Appropriate firefighting and detection equipment",
          content: "Suitable firefighting equipment and fire detection systems must be provided, properly maintained, and regularly tested in accordance with manufacturer guidelines.",
          category: "fire-safety",
          riskLevel: "medium"
        },
        {
          id: "fire_004",
          requirement: "Appoint competent persons to manage fire safety",
          content: "Competent persons must be appointed to manage fire safety responsibilities including risk assessment reviews, equipment maintenance, and emergency procedures.",
          category: "fire-safety",
          riskLevel: "medium"
        }
      ]
    }
  },

  // Company Size-Specific Requirements
  mediumCompany: {
    modernSlavery: {
      name: "Modern Slavery Statement",
      legalBasis: "Modern Slavery Act 2015",
      companySize: "£36 million+ annual turnover",
      mandatory: true,
      clauses: [
        {
          id: "ms_001",
          requirement: "Steps taken to prevent modern slavery in operations and supply chains",
          content: "Detailed disclosure of specific steps taken to identify, assess, and address modern slavery risks in operations and supply chains including due diligence processes.",
          category: "modern-slavery",
          riskLevel: "high"
        },
        {
          id: "ms_002",
          requirement: "Board approval and director sign-off",
          content: "Modern slavery statement must be approved by the board of directors and signed by a director or equivalent senior person.",
          category: "modern-slavery", 
          riskLevel: "high"
        },
        {
          id: "ms_003",
          requirement: "Publication on company website with prominent homepage link",
          content: "Statement must be published on the organization's website with a clear, prominent link from the homepage and be easily accessible to the public.",
          category: "modern-slavery",
          riskLevel: "medium"
        }
      ]
    }
  },

  // Large Company Requirements
  largeCompany: {
    genderPayGap: {
      name: "Gender Pay Gap Reporting",
      legalBasis: "Equality Act 2010 (Gender Pay Gap Information) Regulations 2017",
      companySize: "250+ employees",
      mandatory: true,
      clauses: [
        {
          id: "gpg_001",
          requirement: "Annual gender pay gap reporting and publication",
          content: "Annual reporting of gender pay gap data including mean and median pay gaps, bonus gaps, and quartile pay band distributions with publication on company website and government portal.",
          category: "equality",
          riskLevel: "medium"
        }
      ]
    }
  },

  // Industry-Specific Requirements
  industrySpecific: {
    antiMoneyLaundering: {
      name: "Anti-Money Laundering (AML) Compliance",
      legalBasis: "Money Laundering Regulations 2017",
      companySize: "Applicable sectors",
      industries: ["financial", "legal", "accountancy", "estate-agency"],
      mandatory: true,
      clauses: [
        {
          id: "aml_001",
          requirement: "Customer due diligence procedures",
          content: "Robust customer due diligence procedures including identity verification, beneficial ownership identification, and ongoing monitoring of business relationships.",
          category: "anti-money-laundering",
          riskLevel: "critical"
        },
        {
          id: "aml_002",
          requirement: "Risk assessments and monitoring",
          content: "Comprehensive risk assessments of money laundering and terrorist financing risks with appropriate risk management and monitoring systems.",
          category: "anti-money-laundering",
          riskLevel: "high"
        },
        {
          id: "aml_003",
          requirement: "Record-keeping requirements",
          content: "Detailed record-keeping of customer due diligence, transaction records, and internal reports for specified retention periods.",
          category: "anti-money-laundering",
          riskLevel: "high"
        },
        {
          id: "aml_004",
          requirement: "Suspicious activity reporting procedures",
          content: "Clear procedures for identifying, reporting, and managing suspicious activities to the National Crime Agency (NCA) through Suspicious Activity Reports (SARs).",
          category: "anti-money-laundering",
          riskLevel: "critical"
        },
        {
          id: "aml_005",
          requirement: "Staff training programs",
          content: "Regular training programs for all relevant staff on money laundering risks, red flags, reporting procedures, and regulatory requirements.",
          category: "anti-money-laundering",
          riskLevel: "medium"
        }
      ]
    },
    environmental: {
      name: "Environmental and Climate Reporting",
      legalBasis: "Various environmental regulations",
      companySize: "Qualifying companies",
      mandatory: false,
      clauses: [
        {
          id: "env_001",
          requirement: "Streamlined Energy and Carbon Reporting (SECR)",
          content: "Annual reporting of energy consumption and carbon emissions for qualifying companies with specific disclosure requirements and methodologies.",
          category: "environmental",
          riskLevel: "low"
        },
        {
          id: "env_002",
          requirement: "Environmental impact assessments",
          content: "Environmental impact assessments for businesses in specific industries or undertaking certain activities with potential environmental consequences.",
          category: "environmental",
          riskLevel: "medium"
        },
        {
          id: "env_003",
          requirement: "Waste management protocols",
          content: "Appropriate waste management protocols including waste duty of care, hazardous waste procedures, and environmental protection measures.",
          category: "environmental",
          riskLevel: "low"
        }
      ]
    }
  },

  // Recommended Best Practices
  recommended: {
    equality: {
      name: "Equal Opportunities Policy",
      legalBasis: "Equality Act 2010 (best practice)",
      mandatory: false,
      clauses: [
        {
          id: "eq_001",
          requirement: "Equal opportunities and diversity policy",
          content: "Comprehensive equal opportunities policy demonstrating commitment to equality, diversity, and inclusion with specific protections for all protected characteristics.",
          category: "equality",
          riskLevel: "low"
        }
      ]
    },
    antiBribery: {
      name: "Anti-Bribery and Corruption Policy", 
      legalBasis: "Bribery Act 2010 (adequate procedures defense)",
      mandatory: false,
      clauses: [
        {
          id: "brib_001",
          requirement: "Anti-bribery procedures and risk assessment",
          content: "Adequate procedures to prevent bribery including risk assessment, due diligence, clear policies, and training to provide defense against corporate liability.",
          category: "anti-bribery",
          riskLevel: "medium"
        }
      ]
    }
  }
};

// Categories for organization
export const UK_POLICY_CATEGORIES = [
  {
    name: "Employment Law",
    description: "Core employment policies required by UK law",
    policies: ["healthAndSafety", "disciplinary", "grievance"]
  },
  {
    name: "Data Protection",
    description: "GDPR and Data Protection Act 2018 compliance",
    policies: ["gdprCompliance"]
  },
  {
    name: "Health & Safety",
    description: "Fire safety and workplace safety requirements",
    policies: ["riskAssessment"]
  },
  {
    name: "Corporate Governance",
    description: "Company size-specific governance requirements",
    policies: ["modernSlavery", "genderPayGap"]
  },
  {
    name: "Industry-Specific",
    description: "Sector-specific compliance requirements",
    policies: ["antiMoneyLaundering", "environmental"]
  },
  {
    name: "Best Practice",
    description: "Recommended policies for legal protection",
    policies: ["equality", "antiBribery"]
  }
];