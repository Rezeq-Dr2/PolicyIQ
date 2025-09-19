import { db } from "../db";
import { regulations, regulationClauses } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedCCPARegulations() {
  try {
    console.log("Seeding CCPA regulations...");
    
    // Check if CCPA regulation already exists
    const existingRegulation = await db
      .select()
      .from(regulations)
      .where(eq(regulations.name, "CCPA"));
    
    if (existingRegulation.length > 0) {
      console.log("CCPA regulation already exists, skipping seed.");
      return;
    }

    // Create CCPA regulation
    const [ccpaRegulation] = await db
      .insert(regulations)
      .values({
        name: "CCPA",
        jurisdiction: "California",
        version: "2020",
        isActive: true,
      })
      .returning();

    console.log(`Created CCPA regulation with ID: ${ccpaRegulation.id}`);

    // CCPA clauses based on the actual regulation
    const ccpaClauses = [
      {
        clauseIdentifier: "Section 1798.100",
        clauseText: "A consumer shall have the right to request that a business that collects personal information about the consumer disclose to the consumer the following: (1) The categories of personal information it has collected about that consumer. (2) The categories of sources from which the personal information is collected. (3) The business or commercial purpose for collecting or selling personal information. (4) The categories of third parties with whom the business shares personal information. (5) The specific pieces of personal information it has collected about that consumer.",
      },
      {
        clauseIdentifier: "Section 1798.105",
        clauseText: "A consumer shall have the right to request that a business delete any personal information about the consumer which the business has collected from the consumer.",
      },
      {
        clauseIdentifier: "Section 1798.110",
        clauseText: "A consumer shall have the right to request that a business that collects personal information about the consumer disclose to the consumer: (1) The categories of personal information it has collected about that consumer. (2) The categories of sources from which the personal information is collected. (3) The business or commercial purpose for collecting or selling personal information. (4) The categories of third parties with whom the business shares personal information. (5) The specific pieces of personal information it has collected about that consumer.",
      },
      {
        clauseIdentifier: "Section 1798.115",
        clauseText: "A consumer shall have the right to request that a business that sells personal information about the consumer, or that discloses it for a business purpose, disclose to that consumer: (1) The categories of personal information that the business collected about the consumer. (2) The categories of personal information that the business sold about the consumer and the categories of third parties to whom the personal information was sold, by category or categories of personal information for each category of third parties to whom the personal information was sold. (3) The categories of personal information that the business disclosed about the consumer for a business purpose.",
      },
      {
        clauseIdentifier: "Section 1798.120",
        clauseText: "A consumer shall have the right, at any time, to direct a business that sells personal information about the consumer to third parties not to sell the consumer's personal information. This right may be referred to as the right to opt-out.",
      },
      {
        clauseIdentifier: "Section 1798.125",
        clauseText: "A business shall not discriminate against a consumer because the consumer exercised any of the consumer's rights under this title, including, but not limited to, by: (1) Denying goods or services to the consumer. (2) Charging different prices or rates for goods or services, including through the use of discounts or other benefits or imposing penalties. (3) Providing a different level or quality of goods or services to the consumer. (4) Suggesting that the consumer will receive a different price or rate for goods or services or a different level or quality of goods or services.",
      },
      {
        clauseIdentifier: "Section 1798.130",
        clauseText: "In order to comply with Sections 1798.100, 1798.105, 1798.110, 1798.115, and 1798.125, a business shall, in a form that is reasonably accessible to consumers: (1) Make available to consumers two or more designated methods for submitting requests for information required to be disclosed pursuant to Sections 1798.110 and 1798.115, including, at a minimum, a toll-free telephone number, and if the business maintains an Internet Web site, a Web site address. (2) Disclose and deliver the required information to a consumer free of charge within 45 days of receiving a verifiable consumer request from the consumer.",
      },
      {
        clauseIdentifier: "Section 1798.135",
        clauseText: "A business that is required to comply with Section 1798.120 shall, in a form that is reasonably accessible to consumers: (1) Provide a clear and conspicuous link on the business's Internet homepage, titled 'Do Not Sell My Personal Information,' to an Internet Web page that enables a consumer, or a person authorized by the consumer, to opt-out of the sale of the consumer's personal information. A business shall not require a consumer to create an account in order to direct the business not to sell the consumer's personal information.",
      },
      {
        clauseIdentifier: "Section 1798.140(o)",
        clauseText: "'Personal information' means information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household.",
      },
      {
        clauseIdentifier: "Section 1798.140(t)",
        clauseText: "'Sell,' 'selling,' 'sale,' or 'sold,' means selling, renting, releasing, disclosing, disseminating, making available, transferring, or otherwise communicating orally, in writing, or by electronic or other means, a consumer's personal information by the business to another business or a third party for monetary or other valuable consideration.",
      },
      {
        clauseIdentifier: "Section 1798.145",
        clauseText: "This title shall not apply to: (1) Medical information governed by the Confidentiality of Medical Information Act (Part 2.6 (commencing with Section 56) of Division 1) or protected health information that is collected by a covered entity or business associate governed by the privacy, security, and breach notification rules issued by the United States Department of Health and Human Services, Parts 160 and 164 of Title 45 of the Code of Federal Regulations, established pursuant to the Health Insurance Portability and Accountability Act of 1996 (Public Law 104-191) and the Health Information Technology for Economic and Clinical Health Act (Public Law 111-5).",
      },
    ];

    // Insert CCPA clauses
    for (const clause of ccpaClauses) {
      await db.insert(regulationClauses).values({
        regulationId: ccpaRegulation.id,
        clauseIdentifier: clause.clauseIdentifier,
        clauseText: clause.clauseText,
        lastUpdatedBy: "System",
      });
    }

    console.log(`Successfully seeded ${ccpaClauses.length} CCPA clauses`);
  } catch (error) {
    console.error("Error seeding CCPA regulations:", error);
    throw error;
  }
}

export async function seedGDPRRegulations() {
  try {
    console.log("Seeding GDPR regulations...");

    // Check if GDPR regulation already exists
    const existingGDPR = await db
      .select()
      .from(regulations)
      .where(eq(regulations.name, "GDPR"))
      .limit(1);

    if (existingGDPR.length > 0) {
      console.log("GDPR regulation already exists, skipping seed.");
      return;
    }

    // Create GDPR regulation
    const [gdprRegulation] = await db
      .insert(regulations)
      .values({
        name: "GDPR",
        fullName: "General Data Protection Regulation",
        description: "EU regulation on data protection and privacy for individuals within the European Union and European Economic Area",
        jurisdiction: "European Union",
        effectiveDate: new Date("2018-05-25"),
        version: "1.0",
        isActive: true,
        lastUpdatedBy: "System",
      })
      .returning();

    // GDPR key clauses
    const gdprClauses = [
      {
        clauseIdentifier: "Article 5",
        clauseText: "Personal data shall be processed lawfully, fairly and in a transparent manner in relation to the data subject ('lawfulness, fairness and transparency');"
      },
      {
        clauseIdentifier: "Article 6",
        clauseText: "Processing shall be lawful only if and to the extent that at least one of the following applies: (a) the data subject has given consent to the processing of his or her personal data for one or more specific purposes;"
      },
      {
        clauseIdentifier: "Article 7",
        clauseText: "Where processing is based on consent, the controller shall be able to demonstrate that the data subject has consented to processing of his or her personal data."
      },
      {
        clauseIdentifier: "Article 13",
        clauseText: "Where personal data relating to a data subject are collected from the data subject, the controller shall, at the time when personal data are obtained, provide the data subject with information about the identity and contact details of the controller."
      },
      {
        clauseIdentifier: "Article 14",
        clauseText: "Where personal data have not been obtained from the data subject, the controller shall provide the data subject with information about the identity and contact details of the controller."
      },
      {
        clauseIdentifier: "Article 15",
        clauseText: "The data subject shall have the right to obtain from the controller confirmation as to whether or not personal data concerning him or her are being processed."
      },
      {
        clauseIdentifier: "Article 16",
        clauseText: "The data subject shall have the right to obtain from the controller without undue delay the rectification of inaccurate personal data concerning him or her."
      },
      {
        clauseIdentifier: "Article 17",
        clauseText: "The data subject shall have the right to obtain from the controller the erasure of personal data concerning him or her without undue delay ('right to be forgotten')."
      },
      {
        clauseIdentifier: "Article 18",
        clauseText: "The data subject shall have the right to obtain from the controller restriction of processing where one of the following applies."
      },
      {
        clauseIdentifier: "Article 20",
        clauseText: "The data subject shall have the right to receive the personal data concerning him or her, which he or she has provided to a controller, in a structured, commonly used and machine-readable format ('data portability')."
      },
      {
        clauseIdentifier: "Article 21",
        clauseText: "The data subject shall have the right to object, on grounds relating to his or her particular situation, at any time to processing of personal data concerning him or her."
      },
      {
        clauseIdentifier: "Article 25",
        clauseText: "Taking into account the state of the art, the cost of implementation and the nature, scope, context and purposes of processing, the controller shall implement appropriate technical and organisational measures ('data protection by design and by default')."
      },
      {
        clauseIdentifier: "Article 30",
        clauseText: "Each controller and, where applicable, the controller's representative, shall maintain a record of processing activities under its responsibility."
      },
      {
        clauseIdentifier: "Article 32",
        clauseText: "Taking into account the state of the art, the costs of implementation and the nature, scope, context and purposes of processing, the controller and the processor shall implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk."
      },
      {
        clauseIdentifier: "Article 33",
        clauseText: "In the case of a personal data breach, the controller shall without undue delay and, where feasible, not later than 72 hours after having become aware of it, notify the personal data breach to the supervisory authority."
      },
      {
        clauseIdentifier: "Article 34",
        clauseText: "When the personal data breach is likely to result in a high risk to the rights and freedoms of natural persons, the controller shall communicate the personal data breach to the data subject without undue delay."
      },
      {
        clauseIdentifier: "Article 35",
        clauseText: "Where a type of processing in particular using new technologies is likely to result in a high risk to the rights and freedoms of natural persons, the controller shall carry out a data protection impact assessment."
      },
      {
        clauseIdentifier: "Article 37",
        clauseText: "The controller and the processor shall designate a data protection officer in cases where the processing is carried out by a public authority or body."
      }
    ];

    // Insert GDPR clauses
    for (const clause of gdprClauses) {
      await db.insert(regulationClauses).values({
        regulationId: gdprRegulation.id,
        clauseIdentifier: clause.clauseIdentifier,
        clauseText: clause.clauseText,
        lastUpdatedBy: "System",
      });
    }

    console.log(`Successfully seeded ${gdprClauses.length} GDPR clauses`);
  } catch (error) {
    console.error("Error seeding GDPR regulations:", error);
    throw error;
  }
}

export async function seedUKGDPRRegulations() {
  try {
    console.log("Seeding UK GDPR regulations...");

    // Check if UK GDPR regulation already exists
    const existingUKGDPR = await db
      .select()
      .from(regulations)
      .where(eq(regulations.name, "UK GDPR"))
      .limit(1);

    if (existingUKGDPR.length > 0) {
      console.log("UK GDPR regulation already exists, skipping seed.");
      return;
    }

    // Create UK GDPR regulation
    const [ukGdprRegulation] = await db
      .insert(regulations)
      .values({
        name: "UK GDPR",
        fullName: "UK General Data Protection Regulation",
        description: "UK's data protection regulation following Brexit, based on EU GDPR but with UK-specific provisions",
        jurisdiction: "United Kingdom",
        effectiveDate: new Date("2021-01-01"),
        version: "1.0",
        isActive: true,
        lastUpdatedBy: "System",
      })
      .returning();

    // UK GDPR key clauses (similar to EU GDPR but with UK-specific elements)
    const ukGdprClauses = [
      {
        clauseIdentifier: "Article 5",
        clauseText: "Personal data shall be processed lawfully, fairly and in a transparent manner in relation to the data subject ('lawfulness, fairness and transparency'). UK GDPR requires specific consideration of UK law in determining lawful basis."
      },
      {
        clauseIdentifier: "Article 6",
        clauseText: "Processing shall be lawful only if and to the extent that at least one of the following applies: (a) the data subject has given consent to the processing of his or her personal data for one or more specific purposes. UK law may provide additional lawful bases."
      },
      {
        clauseIdentifier: "Article 7",
        clauseText: "Where processing is based on consent, the controller shall be able to demonstrate that the data subject has consented to processing of his or her personal data under UK GDPR requirements."
      },
      {
        clauseIdentifier: "Article 13",
        clauseText: "Where personal data relating to a data subject are collected from the data subject, the controller shall provide information including identity and contact details of the controller and, where applicable, the controller's representative in the UK."
      },
      {
        clauseIdentifier: "Article 14",
        clauseText: "Where personal data have not been obtained from the data subject, the controller shall provide the data subject with information about the identity and contact details of the controller and UK representative where applicable."
      },
      {
        clauseIdentifier: "Article 15",
        clauseText: "The data subject shall have the right to obtain from the controller confirmation as to whether or not personal data concerning him or her are being processed, and where that is the case, access to the personal data under UK GDPR."
      },
      {
        clauseIdentifier: "Article 16",
        clauseText: "The data subject shall have the right to obtain from the controller without undue delay the rectification of inaccurate personal data concerning him or her under UK data protection law."
      },
      {
        clauseIdentifier: "Article 17",
        clauseText: "The data subject shall have the right to obtain from the controller the erasure of personal data concerning him or her without undue delay ('right to be forgotten') subject to UK legal requirements and exemptions."
      },
      {
        clauseIdentifier: "Article 18",
        clauseText: "The data subject shall have the right to obtain from the controller restriction of processing where one of the following applies under UK GDPR provisions."
      },
      {
        clauseIdentifier: "Article 20",
        clauseText: "The data subject shall have the right to receive the personal data concerning him or her in a structured, commonly used and machine-readable format ('data portability') under UK GDPR."
      },
      {
        clauseIdentifier: "Article 21",
        clauseText: "The data subject shall have the right to object, on grounds relating to his or her particular situation, at any time to processing of personal data concerning him or her under UK data protection law."
      },
      {
        clauseIdentifier: "Article 25",
        clauseText: "The controller shall implement appropriate technical and organisational measures for ensuring that data protection is integrated into the processing activities ('data protection by design and by default') in accordance with UK GDPR."
      },
      {
        clauseIdentifier: "Article 27",
        clauseText: "Where a controller not established in the UK processes personal data of data subjects who are in the UK, the controller shall designate a representative in the UK."
      },
      {
        clauseIdentifier: "Article 30",
        clauseText: "Each controller and, where applicable, the controller's representative, shall maintain a record of processing activities under its responsibility in compliance with UK GDPR requirements."
      },
      {
        clauseIdentifier: "Article 32",
        clauseText: "The controller and the processor shall implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk under UK GDPR standards."
      },
      {
        clauseIdentifier: "Article 33",
        clauseText: "In the case of a personal data breach, the controller shall without undue delay and, where feasible, not later than 72 hours after having become aware of it, notify the personal data breach to the Information Commissioner's Office (ICO)."
      },
      {
        clauseIdentifier: "Article 34",
        clauseText: "When the personal data breach is likely to result in a high risk to the rights and freedoms of natural persons, the controller shall communicate the personal data breach to the data subject without undue delay under UK GDPR."
      },
      {
        clauseIdentifier: "Article 35",
        clauseText: "Where a type of processing is likely to result in a high risk to the rights and freedoms of natural persons, the controller shall carry out a data protection impact assessment (DPIA) in accordance with UK GDPR and ICO guidance."
      },
      {
        clauseIdentifier: "Article 37",
        clauseText: "The controller and the processor shall designate a data protection officer in cases where processing is carried out by a public authority or body, or where processing activities require regular monitoring under UK GDPR."
      },
      {
        clauseIdentifier: "UK Specific - ICO Powers",
        clauseText: "The Information Commissioner's Office (ICO) has the power to impose administrative fines up to £17.5 million or 4% of annual worldwide turnover, whichever is higher, for infringements of UK GDPR."
      },
      {
        clauseIdentifier: "UK Specific - International Transfers",
        clauseText: "Transfers of personal data to third countries or international organisations may only take place where the UK has made an adequacy decision or appropriate safeguards are in place as determined by UK law."
      },
      {
        clauseIdentifier: "DPA 2018 Section 9",
        clauseText: "In the UK, a child is considered to be under 13 years old for the purposes of consent to information society services. The processing is lawful only if consent is given or authorised by the holder of parental responsibility over the child."
      },
      {
        clauseIdentifier: "DPA 2018 Section 10",
        clauseText: "Special categories of personal data may be processed for employment purposes where necessary for performing obligations or rights under employment law, or for health/social care purposes under professional responsibility."
      },
      {
        clauseIdentifier: "DPA 2018 Section 11",
        clauseText: "Processing for safeguarding children and individuals at risk is permitted without consent where necessary for protecting an individual under 18 or an individual at risk, subject to appropriate safeguards."
      },
      {
        clauseIdentifier: "DPA 2018 Section 117-120",
        clauseText: "Controllers must pay a data protection fee to the Information Commissioner's Office. The fee amount depends on the organisation's size and annual turnover. Failure to pay may result in enforcement action."
      },
      {
        clauseIdentifier: "DPA 2018 Section 122-124",
        clauseText: "Direct marketing must comply with both DPA 2018 and Privacy and Electronic Communications Regulations (PECR). Organisations must have valid consent or legitimate interest and provide clear opt-out mechanisms."
      },
      {
        clauseIdentifier: "ICO Guidance - Representatives",
        clauseText: "Non-UK established controllers processing UK data subjects' personal data must designate a UK representative and notify the ICO. The representative acts as a point of contact for supervisory authorities and data subjects."
      },
      {
        clauseIdentifier: "ICO Guidance - Breach Notification",
        clauseText: "Personal data breaches must be reported to the ICO within 72 hours using the online breach reporting tool. High-risk breaches must also be communicated to affected data subjects without undue delay."
      },
      {
        clauseIdentifier: "ICO Guidance - Age Verification",
        clauseText: "Organisations providing online services to children must implement appropriate age verification measures for users under 13. The ICO Children's Code provides specific guidance on age-appropriate design."
      }
    ];

    // Insert UK GDPR clauses
    for (const clause of ukGdprClauses) {
      await db.insert(regulationClauses).values({
        regulationId: ukGdprRegulation.id,
        clauseIdentifier: clause.clauseIdentifier,
        clauseText: clause.clauseText,
        lastUpdatedBy: "System",
      });
    }

    console.log(`Successfully seeded ${ukGdprClauses.length} UK GDPR clauses`);
  } catch (error) {
    console.error("Error seeding UK GDPR regulations:", error);
    throw error;
  }
}

export async function seedHealthAndSafetyRegulations() {
  try {
    console.log("Seeding Health and Safety regulations...");

    // Check if Health and Safety regulation already exists
    const existingHealthSafety = await db
      .select()
      .from(regulations)
      .where(eq(regulations.name, "Health and Safety at Work etc. Act 1974"))
      .limit(1);

    if (existingHealthSafety.length > 0) {
      console.log("Health and Safety regulation already exists, skipping seed.");
      return;
    }

    // Create Health and Safety regulation
    const [healthSafetyRegulation] = await db
      .insert(regulations)
      .values({
        name: "Health and Safety at Work etc. Act 1974",
        fullName: "Health and Safety at Work etc. Act 1974",
        description: "UK legislation establishing general duties on employers, employees and others to ensure health, safety and welfare at work",
        jurisdiction: "United Kingdom",
        effectiveDate: new Date("1974-07-31"),
        version: "1.0",
        isActive: true,
        lastUpdatedBy: "System",
      })
      .returning();

    // Health and Safety key clauses based on the Act and HSE guidance
    const healthSafetyClauses = [
      {
        clauseIdentifier: "Section 2(1)",
        clauseText: "It shall be the duty of every employer to ensure, so far as is reasonably practicable, the health, safety and welfare at work of all his employees."
      },
      {
        clauseIdentifier: "Section 2(3)",
        clauseText: "Except in such cases as may be prescribed, it shall be the duty of every employer to prepare and as often as may be appropriate revise a written statement of his general policy with respect to the health and safety at work of his employees and the organisation and arrangements for the time being in force for carrying out that policy, and to bring the statement and any revision of it to the notice of all of his employees."
      },
      {
        clauseIdentifier: "Policy Statement - General Intent",
        clauseText: "The health and safety policy must include a general statement of your policy on health and safety at work, including your commitment to protecting employees and others who may be affected by your work activities."
      },
      {
        clauseIdentifier: "Policy Statement - Responsibilities",
        clauseText: "The policy must clearly identify who has overall and day-to-day responsibility for health and safety in your organization, including specific roles and responsibilities for managers, supervisors, and employees at all levels."
      },
      {
        clauseIdentifier: "Policy Statement - Arrangements",
        clauseText: "The policy must detail the practical arrangements for managing health and safety, including procedures for risk assessment, accident reporting, emergency procedures, training, consultation with employees, and monitoring of health and safety performance."
      },
      {
        clauseIdentifier: "Section 3(1)",
        clauseText: "It shall be the duty of every employer to conduct his undertaking in such a way as to ensure, so far as is reasonably practicable, that persons not in his employment who may be affected thereby are not thereby exposed to risks to their health or safety."
      },
      {
        clauseIdentifier: "Section 7",
        clauseText: "It shall be the duty of every employee while at work to take reasonable care for the health and safety of himself and of other persons who may be affected by his acts or omissions at work; and to co-operate with his employer or any other person so far as is necessary to enable any duty or requirement imposed under the relevant statutory provisions to be performed or complied with."
      },
      {
        clauseIdentifier: "Risk Assessment Requirement",
        clauseText: "Employers must carry out risk assessments to identify hazards and assess risks to employees and others who may be affected by work activities. The assessment must be suitable and sufficient, regularly reviewed, and recorded if the employer has five or more employees."
      },
      {
        clauseIdentifier: "Training and Information",
        clauseText: "Employers must provide employees with adequate health and safety training, including induction training for new employees, training when new equipment or procedures are introduced, and refresher training as necessary. Information must be provided in a form that employees can understand."
      },
      {
        clauseIdentifier: "Consultation with Employees",
        clauseText: "Employers must consult with employees on health and safety matters, either directly or through elected representatives or trade union safety representatives. This includes consulting on risk assessments, health and safety arrangements, and any changes that may affect health and safety."
      },
      {
        clauseIdentifier: "Emergency Procedures",
        clauseText: "Employers must establish and maintain emergency procedures, including procedures for serious and imminent danger, evacuation procedures, first aid arrangements, and procedures for dealing with accidents and incidents."
      },
      {
        clauseIdentifier: "Monitoring and Review",
        clauseText: "Health and safety policies and arrangements must be monitored to ensure they remain effective and are being followed. Regular review and update of the policy is required, particularly following significant changes to work activities, accidents, or changes in legislation."
      },
      {
        clauseIdentifier: "HSE Guidance - Policy Content",
        clauseText: "HSE guidance states that health and safety policies should be proportionate to the size and nature of the business, clearly written in language that employees can understand, and regularly communicated to all staff including new employees and contractors."
      },
      {
        clauseIdentifier: "Legal Compliance",
        clauseText: "The health and safety policy must demonstrate compliance with all relevant health and safety legislation, including specific regulations that apply to the particular industry or type of work being carried out."
      }
    ];

    // Insert Health and Safety clauses
    for (const clause of healthSafetyClauses) {
      await db.insert(regulationClauses).values({
        regulationId: healthSafetyRegulation.id,
        clauseIdentifier: clause.clauseIdentifier,
        clauseText: clause.clauseText,
        lastUpdatedBy: "System",
      });
    }

    console.log(`Successfully seeded ${healthSafetyClauses.length} Health and Safety clauses`);
  } catch (error) {
    console.error("Error seeding Health and Safety regulations:", error);
    throw error;
  }
}
