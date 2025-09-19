import { db } from "../db";
import { 
  regulatorySources, 
  regulatoryUpdates, 
  crawlerJobs, 
  regulatoryNotifications,
  updateImpactAssessments,
  regulations,
  organizations
} from "@shared/schema";
import { eq, desc, and, isNull, lt, sql, or } from "drizzle-orm";
import OpenAI from "openai";
import puppeteer from "puppeteer";

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY must be set');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface CrawlConfig {
  maxPages?: number;
  delay?: number;
  userAgent?: string;
  timeout?: number;
  retryAttempts?: number;
}

export interface ExtractedUpdate {
  title: string;
  description?: string;
  content?: string;
  updateType?: string;
  effectiveDate?: Date;
  publishedDate?: Date;
  sourceUrl: string;
  documentUrl?: string;
  keywords?: string[];
  confidence: number;
}

export interface CrawlResult {
  success: boolean;
  updatesFound: number;
  newUpdates: number;
  pagesScraped: number;
  executionTime: number;
  errorMessage?: string;
  extractedData: ExtractedUpdate[];
}

export class RegulatoryCrawlerService {

  async getActiveSources(): Promise<any[]> {
    return await db.select()
      .from(regulatorySources)
      .where(eq(regulatorySources.isActive, true))
      .orderBy(desc(regulatorySources.priority));
  }

  async getSourcesDueForCrawling(): Promise<any[]> {
    const now = new Date();
    return await db.select()
      .from(regulatorySources)
      .where(and(
        eq(regulatorySources.isActive, true),
        or(
          isNull(regulatorySources.nextCrawl),
          lt(regulatorySources.nextCrawl, now)
        )
      ))
      .orderBy(desc(regulatorySources.priority));
  }

  async crawlSource(sourceId: string, jobType: 'scheduled' | 'manual' | 'retry' = 'scheduled'): Promise<CrawlResult> {
    const startTime = Date.now();
    
    // Create crawler job record
    const [job] = await db.insert(crawlerJobs).values({
      sourceId,
      jobType,
      status: 'running',
      startedAt: new Date(),
    }).returning();

    try {
      // Get source configuration
      const [source] = await db.select()
        .from(regulatorySources)
        .where(eq(regulatorySources.id, sourceId));

      if (!source) {
        throw new Error(`Source not found: ${sourceId}`);
      }

      console.log(`Starting crawl for source: ${source.name}`);

      // Extract configuration
      const crawlConfig = source.crawlConfig as CrawlConfig || {};
      const selectors = source.selectors as any || {};

      // Perform the actual crawling
      const extractedData = await this.performCrawl(source, crawlConfig, selectors);

      // Process and deduplicate updates
      const processedUpdates = await this.processExtractedData(extractedData, sourceId);
      const newUpdates = await this.saveNewUpdates(processedUpdates, sourceId);

      const executionTime = Date.now() - startTime;

      // Update crawler job with results
      await db.update(crawlerJobs)
        .set({
          status: 'completed',
          completedAt: new Date(),
          updatesFound: extractedData.length,
          newUpdates: newUpdates.length,
          executionTime,
          pagesScraped: extractedData.length,
          dataExtracted: { updates: extractedData.slice(0, 5) } // Store sample for debugging
        })
        .where(eq(crawlerJobs.id, job.id));

      // Update source metadata
      await this.updateSourceMetadata(sourceId, true);

      // Trigger notifications for new updates
      if (newUpdates.length > 0) {
        await this.triggerUpdateNotifications(newUpdates);
        // For pending/draft/consultation updates, run predictive impact analysis
        const { predictiveImpactAnalyzer } = await import('./predictiveImpactAnalyzer');
        for (const nu of newUpdates) {
          if (nu.updateType === 'pending' || nu.updateType === 'consultation') {
            try {
              await predictiveImpactAnalyzer.assessAndAlert(nu.id);
            } catch (e) {
              console.warn('Predictive impact analysis failed for', nu.id, e);
            }
          }
        }
      }

      console.log(`Crawl completed for ${source.name}: ${newUpdates.length} new updates found`);

      return {
        success: true,
        updatesFound: extractedData.length,
        newUpdates: newUpdates.length,
        pagesScraped: extractedData.length,
        executionTime,
        extractedData
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      console.error(`Crawl failed for source ${sourceId}:`, error);

      // Update job with error
      await db.update(crawlerJobs)
        .set({
          status: 'failed',
          completedAt: new Date(),
          executionTime,
          errorMessage
        })
        .where(eq(crawlerJobs.id, job.id));

      // Update source metadata
      await this.updateSourceMetadata(sourceId, false);

      return {
        success: false,
        updatesFound: 0,
        newUpdates: 0,
        pagesScraped: 0,
        executionTime,
        errorMessage,
        extractedData: []
      };
    }
  }

  private async performCrawl(
    source: any, 
    config: CrawlConfig, 
    selectors: any
  ): Promise<ExtractedUpdate[]> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      
      // Set user agent if specified
      if (config.userAgent) {
        await page.setUserAgent(config.userAgent);
      }

      // Set timeout
      page.setDefaultTimeout(config.timeout || 30000);

      const extractedData: ExtractedUpdate[] = [];

      // Navigate to the base URL
      console.log(`Navigating to: ${source.baseUrl}`);
      await page.goto(source.baseUrl, { waitUntil: 'networkidle2' });

      // Wait for content to load
      if (config.delay) {
        await new Promise(r => setTimeout(r, config.delay));
      }

      // Extract updates based on source type
      switch (source.sourceType) {
        case 'government':
          return await this.crawlGovernmentSite(page, source, selectors);
        case 'regulator':
          return await this.crawlRegulatorSite(page, source, selectors);
        case 'legal_publisher':
          return await this.crawlGenericSite(page, source, selectors);
        case 'api':
          return await this.crawlApiSource(source);
        default:
          return await this.crawlGenericSite(page, source, selectors);
      }

    } finally {
      await browser.close();
    }
  }

  private async crawlGovernmentSite(page: any, source: any, selectors: any): Promise<ExtractedUpdate[]> {
    const updates: ExtractedUpdate[] = [];

    try {
      // UK Government sites (gov.uk)
      if (source.baseUrl.includes('gov.uk')) {
        return await this.crawlGovUkSite(page, source, selectors);
      }
      
      // EU sites
      if (source.baseUrl.includes('europa.eu')) {
        return await this.crawlGenericSite(page, source, selectors);
      }

      // Generic government crawling
      return await this.crawlGenericSite(page, source, selectors);

    } catch (error) {
      console.error(`Error crawling government site ${source.name}:`, error);
      return updates;
    }
  }

  private async crawlGovUkSite(page: any, source: any, selectors: any): Promise<ExtractedUpdate[]> {
    const updates: ExtractedUpdate[] = [];

    try {
      // Look for news and updates sections
      const newsItems = await page.$$eval('article, .gem-c-document-list__item, .govuk-summary-list__row', (elements: Element[]) => {
        return elements.map((element) => {
          const titleEl = element.querySelector('h2, h3, .govuk-link, a');
          const descEl = element.querySelector('p, .govuk-body, .gem-c-metadata__definition');
          const linkEl = element.querySelector('a');
          const dateEl = element.querySelector('time, .gem-c-metadata__date');

          return {
            title: titleEl?.textContent?.trim() || '',
            description: descEl?.textContent?.trim() || '',
            link: linkEl?.getAttribute('href') || '',
            date: dateEl?.textContent?.trim() || dateEl?.getAttribute('datetime') || ''
          };
        }).filter(item => item.title && item.link);
      });

      for (const item of newsItems) {
        if (this.isRegulatoryUpdate(item.title, item.description)) {
          const update: ExtractedUpdate = {
            title: item.title,
            description: item.description,
            sourceUrl: item.link.startsWith('http') ? item.link : `https://www.gov.uk${item.link}`,
            publishedDate: this.parseDate(item.date),
            updateType: this.classifyUpdateType(item.title, item.description),
            keywords: await this.extractKeywords(item.title + ' ' + item.description),
            confidence: this.calculateConfidence(item.title, item.description)
          };

          // Try to get full content
          try {
            const fullContent = await this.getFullContent(page, update.sourceUrl);
            if (fullContent) {
              update.content = fullContent;
            }
          } catch (error) {
            console.warn(`Could not get full content for ${update.sourceUrl}`);
          }

          updates.push(update);
        }
      }

    } catch (error) {
      console.error('Error crawling gov.uk site:', error);
    }

    return updates;
  }

  private async crawlRegulatorSite(page: any, source: any, selectors: any): Promise<ExtractedUpdate[]> {
    const updates: ExtractedUpdate[] = [];

    try {
      // ICO (Information Commissioner's Office)
      if (source.baseUrl.includes('ico.org.uk')) {
        return await this.crawlIcoSite(page, source, selectors);
      }

      // HSE (Health and Safety Executive)
      if (source.baseUrl.includes('hse.gov.uk')) {
        return await this.crawlGenericSite(page, source, selectors);
      }

      // FCA (Financial Conduct Authority)
      if (source.baseUrl.includes('fca.org.uk')) {
        return await this.crawlGenericSite(page, source, selectors);
      }

      // Generic regulator crawling
      return await this.crawlGenericSite(page, source, selectors);

    } catch (error) {
      console.error(`Error crawling regulator site ${source.name}:`, error);
      return updates;
    }
  }

  private async crawlIcoSite(page: any, source: any, selectors: any): Promise<ExtractedUpdate[]> {
    const updates: ExtractedUpdate[] = [];

    try {
      // Navigate to news and updates section
      await page.goto(`${source.baseUrl}/about-the-ico/news-and-updates/`, { waitUntil: 'networkidle2' });

      const newsItems = await page.$$eval('.view-content article, .news-item', (elements: Element[]) => {
        return elements.map((element) => {
          const titleEl = element.querySelector('h2 a, h3 a, .title a');
          const descEl = element.querySelector('.summary, .excerpt, p');
          const dateEl = element.querySelector('.date, time');

          return {
            title: titleEl?.textContent?.trim() || '',
            description: descEl?.textContent?.trim() || '',
            link: titleEl?.getAttribute('href') || '',
            date: dateEl?.textContent?.trim() || ''
          };
        }).filter(item => item.title && item.link);
      });

      for (const item of newsItems) {
        if (this.isDataProtectionUpdate(item.title, item.description)) {
          updates.push({
            title: item.title,
            description: item.description,
            sourceUrl: item.link.startsWith('http') ? item.link : `https://ico.org.uk${item.link}`,
            publishedDate: this.parseDate(item.date),
            updateType: 'guidance',
            keywords: await this.extractKeywords(item.title + ' ' + item.description),
            confidence: this.calculateConfidence(item.title, item.description)
          });
        }
      }

    } catch (error) {
      console.error('Error crawling ICO site:', error);
    }

    return updates;
  }

  private async crawlGenericSite(page: any, source: any, selectors: any): Promise<ExtractedUpdate[]> {
    const updates: ExtractedUpdate[] = [];

    try {
      // Use provided selectors or fallback to common patterns
      const titleSelector = selectors.title || 'h1, h2, h3, .title, .headline';
      const linkSelector = selectors.link || 'a';
      const dateSelector = selectors.date || 'time, .date, .published';
      const descriptionSelector = selectors.description || 'p, .summary, .excerpt';

      const items = await page.$$eval(`${titleSelector}`, (elements: Element[], selectors: any) => {
        return elements.map((element) => {
          const parent = element.closest('article, .item, .post, .news-item') || element.parentElement;
          const linkEl = parent?.querySelector('a') || element.querySelector('a');
          const descEl = parent?.querySelector(selectors.description) || parent?.querySelector('p');
          const dateEl = parent?.querySelector(selectors.date);

          return {
            title: element.textContent?.trim() || '',
            description: descEl?.textContent?.trim() || '',
            link: linkEl?.getAttribute('href') || '',
            date: dateEl?.textContent?.trim() || ''
          };
        }).filter(item => item.title && item.link);
      }, selectors);

      for (const item of items) {
        if (this.isRegulatoryUpdate(item.title, item.description)) {
          updates.push({
            title: item.title,
            description: item.description,
            sourceUrl: this.resolveUrl(item.link, source.baseUrl),
            publishedDate: this.parseDate(item.date),
            updateType: this.classifyUpdateType(item.title, item.description),
            keywords: await this.extractKeywords(item.title + ' ' + item.description),
            confidence: this.calculateConfidence(item.title, item.description)
          });
        }
      }

    } catch (error) {
      console.error('Error crawling generic site:', error);
    }

    return updates;
  }

  private async crawlApiSource(source: any): Promise<ExtractedUpdate[]> {
    const updates: ExtractedUpdate[] = [];
    try {
      const endpoint = (source.crawlConfig as any)?.apiEndpoint || source.baseUrl;
      const res = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return updates;
      const data = await res.json();
      const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];

      for (const raw of items.slice(0, 100)) {
        const title = String(raw.title || '').trim();
        const url = String(raw.url || raw.link || '').trim();
        if (!title || !url) continue;
        const description = String(raw.summary || raw.description || '').trim();
        const dateStr = String(raw.date || raw.published_at || raw.published || '').trim();

        const update: ExtractedUpdate = {
          title,
          description,
          sourceUrl: url,
          publishedDate: dateStr ? this.parseDate(dateStr) : undefined,
          updateType: this.classifyUpdateType(title, description),
          keywords: await this.extractKeywords(`${title} ${description}`),
          confidence: this.calculateConfidence(title, description),
        };
        updates.push(update);
      }
    } catch (e) {
      console.warn('API crawler failed:', e);
    }
    return updates;
  }

  private isRegulatoryUpdate(title: string, description: string): boolean {
    const content = (title + ' ' + description).toLowerCase();
    
    const regulatoryKeywords = [
      'regulation', 'compliance', 'gdpr', 'data protection', 'privacy',
      'health and safety', 'dpa 2018', 'ico', 'hse', 'amendment',
      'guidance', 'consultation', 'enforcement', 'penalty', 'fine',
      'policy', 'legislation', 'law', 'act', 'directive', 'code of practice'
    ];

    return regulatoryKeywords.some(keyword => content.includes(keyword));
  }

  private isDataProtectionUpdate(title: string, description: string): boolean {
    const content = (title + ' ' + description).toLowerCase();
    
    const dpKeywords = [
      'gdpr', 'data protection', 'privacy', 'dpa 2018', 'personal data',
      'consent', 'breach', 'subject access', 'right to erasure', 'portability'
    ];

    return dpKeywords.some(keyword => content.includes(keyword));
  }

  private classifyUpdateType(title: string, description: string): string {
    const content = (title + ' ' + description).toLowerCase();
    
    if (content.includes('amendment') || content.includes('updated') || content.includes('revised')) {
      return 'amendment';
    }
    if (content.includes('new') || content.includes('introduces')) {
      return 'new_regulation';
    }
    if (content.includes('consultation') || content.includes('call for views')) {
      return 'consultation';
    }
    if (content.includes('draft') || content.includes('proposed')) {
      return 'pending';
    }
    if (content.includes('guidance') || content.includes('advice')) {
      return 'guidance';
    }
    
    return 'guidance'; // Default
  }

  private parseDate(dateString: string): Date | undefined {
    if (!dateString) return undefined;
    
    try {
      // Try parsing various date formats
      const cleaned = dateString.replace(/(\d+)(st|nd|rd|th)/, '$1');
      const date = new Date(cleaned);
      
      if (isNaN(date.getTime())) {
        return undefined;
      }
      
      return date;
    } catch (error) {
      return undefined;
    }
  }

  private async extractKeywords(text: string): Promise<string[]> {
    try {
      const prompt = `Extract 5-10 relevant keywords from this regulatory update text. Focus on legal, compliance, and regulatory terms. Return as a comma-separated list:

${text.slice(0, 1000)}`;

      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        max_tokens: 100
      });

      const keywords = response.choices[0].message.content
        ?.split(',')
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 2) || [];

      return keywords.slice(0, 10);
    } catch (error) {
      console.error('Error extracting keywords:', error);
      return this.extractBasicKeywords(text);
    }
  }

  private extractBasicKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);

    const keywordCounts = new Map<string, number>();
    
    words.forEach(word => {
      keywordCounts.set(word, (keywordCounts.get(word) || 0) + 1);
    });

    return Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private calculateConfidence(title: string, description: string): number {
    const content = (title + ' ' + description).toLowerCase();
    let confidence = 0.5; // Base confidence

    // Boost confidence for strong regulatory indicators
    if (content.includes('regulation') || content.includes('compliance')) confidence += 0.2;
    if (content.includes('gdpr') || content.includes('data protection')) confidence += 0.2;
    if (content.includes('amendment') || content.includes('guidance')) confidence += 0.1;
    if (content.includes('ico') || content.includes('hse')) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http')) {
      return url;
    }
    
    const base = new URL(baseUrl);
    return new URL(url, base).toString();
  }

  private async getFullContent(page: any, url: string): Promise<string | undefined> {
    try {
      await page.goto(url, { waitUntil: 'networkidle2' });
      
      const content = await page.$eval('main, .content, article, .post-content', (el: Element) => {
        return el.textContent?.trim();
      }).catch(() => undefined);

      return content;
    } catch (error) {
      return undefined;
    }
  }

  private async processExtractedData(
    extractedData: ExtractedUpdate[], 
    sourceId: string
  ): Promise<ExtractedUpdate[]> {
    // Remove duplicates based on title and source URL
    const seen = new Set<string>();
    const processed = extractedData.filter(update => {
      const key = `${update.title}|${update.sourceUrl}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    // Enhance with AI analysis
    for (const update of processed) {
      try {
        const analysis = await this.analyzeUpdateContent(update);
        update.updateType = analysis.updateType || update.updateType;
        update.keywords = [...(update.keywords || []), ...(analysis.keywords || [])];
        update.confidence = Math.max(update.confidence, analysis.confidence || 0);
      } catch (error) {
        console.warn(`Failed to enhance update analysis: ${error}`);
      }
    }

    return processed;
  }

  private async analyzeUpdateContent(update: ExtractedUpdate): Promise<any> {
    try {
      const prompt = `Analyze this regulatory update and classify it:

Title: ${update.title}
Description: ${update.description}
Content: ${update.content?.slice(0, 1000) || 'N/A'}

Please provide:
1. Update type (amendment, new_regulation, guidance, consultation)
2. Keywords (5-10 relevant terms)
3. Confidence score (0-1)
4. Brief summary

Return as JSON with keys: updateType, keywords, confidence, summary`;

      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 300
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      console.error('Error analyzing update content:', error);
      return {};
    }
  }

  private async saveNewUpdates(
    updates: ExtractedUpdate[], 
    sourceId: string
  ): Promise<any[]> {
    const newUpdates = [];

    for (const update of updates) {
      try {
        // Check if update already exists
        const existing = await db.select()
          .from(regulatoryUpdates)
          .where(and(
            eq(regulatoryUpdates.title, update.title),
            eq(regulatoryUpdates.sourceUrl, update.sourceUrl)
          ))
          .limit(1);

        if (existing.length === 0) {
          // Save new update
          const [savedUpdate] = await db.insert(regulatoryUpdates).values({
            sourceId,
            title: update.title,
            description: update.description,
            content: update.content,
            updateType: update.updateType,
            effectiveDate: update.effectiveDate,
            publishedDate: update.publishedDate,
            sourceUrl: update.sourceUrl,
            documentUrl: update.documentUrl,
            keywords: update.keywords,
            confidence: update.confidence,
            status: 'pending'
          }).returning();

          newUpdates.push(savedUpdate);
        }
      } catch (error) {
        console.error(`Error saving update "${update.title}":`, error);
      }
    }

    return newUpdates;
  }

  private async updateSourceMetadata(sourceId: string, success: boolean): Promise<void> {
    const now = new Date();
    const nextCrawl = this.calculateNextCrawlTime(now);

    await db.update(regulatorySources)
      .set({
        lastCrawled: now,
        nextCrawl,
        updatedAt: now,
        // Adjust reliability based on success
        reliability: success 
          ? sql`LEAST(${regulatorySources.reliability} + 0.1, 1.0)`
          : sql`GREATEST(${regulatorySources.reliability} - 0.2, 0.1)`
      })
      .where(eq(regulatorySources.id, sourceId));
  }

  private calculateNextCrawlTime(from: Date): Date {
    // Default to 24 hours from now
    return new Date(from.getTime() + 24 * 60 * 60 * 1000);
  }

  private async triggerUpdateNotifications(newUpdates: any[]): Promise<void> {
    const { regulatoryImpactAssessor } = await import('./regulatoryImpactAssessor');
    for (const update of newUpdates) {
      try {
        await regulatoryImpactAssessor.assessAndNotify(update.id);
      } catch (error) {
        console.error(`Error assessing impact for update ${update.id}:`, error);
      }
    }
  }

  // Public methods for managing crawling

  async runScheduledCrawls(): Promise<void> {
    console.log('Starting scheduled regulatory crawls...');
    
    const sourcesDue = await this.getSourcesDueForCrawling();
    
    for (const source of sourcesDue) {
      try {
        console.log(`Crawling source: ${source.name}`);
        await this.crawlSource(source.id, 'scheduled');
      } catch (error) {
        console.error(`Failed to crawl source ${source.name}:`, error);
      }
    }
    
    console.log(`Completed scheduled crawls for ${sourcesDue.length} sources`);
  }

  async getRecentUpdates(limit: number = 50): Promise<any[]> {
    return await db.select()
      .from(regulatoryUpdates)
      .orderBy(desc(regulatoryUpdates.createdAt))
      .limit(limit);
  }

  async getPendingUpdates(): Promise<any[]> {
    return await db.select()
      .from(regulatoryUpdates)
      .where(eq(regulatoryUpdates.status, 'pending'))
      .orderBy(desc(regulatoryUpdates.createdAt));
  }

  async getCrawlerStats(): Promise<any> {
    const totalSources = await db.select({ count: sql`count(*)` })
      .from(regulatorySources);
    
    const activeSources = await db.select({ count: sql`count(*)` })
      .from(regulatorySources)
      .where(eq(regulatorySources.isActive, true));
    
    const recentJobs = await db.select()
      .from(crawlerJobs)
      .orderBy(desc(crawlerJobs.createdAt))
      .limit(10);

    const pendingUpdates = await db.select({ count: sql`count(*)` })
      .from(regulatoryUpdates)
      .where(eq(regulatoryUpdates.status, 'pending'));

    return {
      totalSources: totalSources[0]?.count || 0,
      activeSources: activeSources[0]?.count || 0,
      recentJobs,
      pendingUpdatesCount: pendingUpdates[0]?.count || 0
    };
  }
}

export const regulatoryCrawlerService = new RegulatoryCrawlerService();