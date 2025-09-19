import { db } from "../db";
import { regulatorySources } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedRegulatorySources() {
  console.log("Seeding regulatory sources...");

  const ukRegulatorySources = [
    {
      name: "ICO - Information Commissioner's Office",
      jurisdiction: "UK",
      sourceType: "regulator",
      baseUrl: "https://ico.org.uk",
      crawlConfig: {
        maxPages: 20,
        delay: 2000,
        timeout: 30000,
        retryAttempts: 3,
        userAgent: "PolicyIQ-Crawler/1.0"
      },
      selectors: {
        title: "h2 a, h3 a, .title a",
        link: "a",
        date: ".date, time, .published",
        description: ".summary, .excerpt, p"
      },
      updateFrequency: "daily",
      priority: 10,
      tags: ["data protection", "privacy", "gdpr", "dpa 2018", "ico guidance"],
      reliability: 0.95
    },
    {
      name: "HSE - Health and Safety Executive",
      jurisdiction: "UK",
      sourceType: "regulator",
      baseUrl: "https://www.hse.gov.uk",
      crawlConfig: {
        maxPages: 15,
        delay: 2000,
        timeout: 30000,
        retryAttempts: 3
      },
      selectors: {
        title: "h2, h3, .headline",
        link: "a",
        date: ".date, time",
        description: "p, .summary"
      },
      updateFrequency: "daily",
      priority: 9,
      tags: ["health and safety", "workplace safety", "hse guidance", "risk assessment"],
      reliability: 0.93
    },
    {
      name: "UK Government - GOV.UK",
      jurisdiction: "UK",
      sourceType: "government",
      baseUrl: "https://www.gov.uk/search/news-and-communications",
      crawlConfig: {
        maxPages: 25,
        delay: 1500,
        timeout: 45000,
        retryAttempts: 2
      },
      selectors: {
        title: ".gem-c-document-list__item-title a, h3 a",
        link: "a",
        date: ".gem-c-metadata__date, time",
        description: ".gem-c-document-list__item-description"
      },
      updateFrequency: "daily",
      priority: 8,
      tags: ["government updates", "legislation", "policy changes", "uk law"],
      reliability: 0.90
    },
    {
      name: "FCA - Financial Conduct Authority",
      jurisdiction: "UK",
      sourceType: "regulator",
      baseUrl: "https://www.fca.org.uk",
      crawlConfig: {
        maxPages: 10,
        delay: 2500,
        timeout: 30000,
        retryAttempts: 3
      },
      selectors: {
        title: "h2 a, h3 a",
        link: "a",
        date: ".date, time",
        description: ".summary, p"
      },
      updateFrequency: "daily",
      priority: 7,
      tags: ["financial services", "financial regulation", "consumer protection"],
      reliability: 0.88
    },
    {
      name: "Department for Business and Trade",
      jurisdiction: "UK",
      sourceType: "government",
      baseUrl: "https://www.gov.uk/government/organisations/department-for-business-and-trade",
      crawlConfig: {
        maxPages: 15,
        delay: 2000,
        timeout: 30000,
        retryAttempts: 2
      },
      selectors: {
        title: "h3 a, .title a",
        link: "a",
        date: "time, .date",
        description: "p, .summary"
      },
      updateFrequency: "daily",
      priority: 6,
      tags: ["business regulation", "trade policy", "employment law", "company law"],
      reliability: 0.85
    }
  ];

  const euSources = [
    {
      name: "European Commission - DG Justice",
      jurisdiction: "EU",
      sourceType: "government",
      baseUrl: "https://commission.europa.eu/about-european-commission/departments-and-executive-agencies/justice-and-consumers_en",
      crawlConfig: {
        maxPages: 10,
        delay: 3000,
        timeout: 45000,
        retryAttempts: 2
      },
      selectors: {
        title: "h3 a, .title a",
        link: "a",
        date: ".date, time",
        description: "p, .summary"
      },
      updateFrequency: "weekly",
      priority: 5,
      tags: ["eu gdpr", "european privacy", "eu regulation", "data protection"],
      reliability: 0.82
    },
    {
      name: "European Data Protection Board",
      jurisdiction: "EU",
      sourceType: "regulator",
      baseUrl: "https://edpb.europa.eu",
      crawlConfig: {
        maxPages: 8,
        delay: 3000,
        timeout: 30000,
        retryAttempts: 2
      },
      selectors: {
        title: "h2 a, h3 a",
        link: "a",
        date: ".date, time",
        description: "p, .excerpt"
      },
      updateFrequency: "weekly",
      priority: 6,
      tags: ["gdpr guidelines", "edpb opinions", "data protection authority"],
      reliability: 0.88
    }
  ];

  const usSources = [
    {
      name: "California Attorney General - Privacy",
      jurisdiction: "US",
      sourceType: "government",
      baseUrl: "https://oag.ca.gov/privacy",
      crawlConfig: {
        maxPages: 5,
        delay: 2000,
        timeout: 30000,
        retryAttempts: 2
      },
      selectors: {
        title: "h2 a, h3 a",
        link: "a",
        date: ".date, time",
        description: "p"
      },
      updateFrequency: "weekly",
      priority: 4,
      tags: ["ccpa", "california privacy", "consumer privacy act", "us privacy"],
      reliability: 0.80
    }
  ];

  // Combine all sources
  const allSources = [...ukRegulatorySources, ...euSources, ...usSources];

  for (const sourceData of allSources) {
    try {
      // Check if source already exists
      const existing = await db.select()
        .from(regulatorySources)
        .where(eq(regulatorySources.name, sourceData.name))
        .limit(1);

      if (existing.length === 0) {
        // Calculate next crawl time (within next 24 hours)
        const nextCrawl = new Date();
        nextCrawl.setHours(nextCrawl.getHours() + Math.floor(Math.random() * 24));

        await db.insert(regulatorySources).values({
          ...sourceData,
          nextCrawl,
          isActive: true
        });

        console.log(`Created regulatory source: ${sourceData.name}`);
      } else {
        console.log(`Regulatory source already exists: ${sourceData.name}`);
      }
    } catch (error) {
      console.error(`Error creating regulatory source ${sourceData.name}:`, error);
    }
  }

  console.log("Regulatory sources seeding completed.");
}