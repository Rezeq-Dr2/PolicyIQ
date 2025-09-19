import type { Express } from "express";
import { createServer as createHttpServer, type Server } from "http";
import https from 'https';
import fs from 'fs';
import { storage } from "./storage";
import { db } from "./db";
import { promptVersions } from "@shared/schema";
import { desc, sql } from "drizzle-orm";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { requireRoles } from "./rbac";
import { insertPolicyDocumentSchema, insertComplianceReportSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import { processDocument, getSupportedExtensions, isFileTypeSupported } from "./services/enhancedDocumentProcessor";
import { enqueueAnalysisJob, analysisQueue, analysisDlq } from "./services/queue";
import { generateReport } from "./services/reportGenerator";
import { notificationService } from "./services/notificationService";
import { analyticsService } from "./services/analyticsService";
import { executiveReportingService } from "./services/executiveReportingService";
import { regulatoryCrawlerService } from "./services/regulatoryCrawler";
import { redis } from "./services/queue";
import { aiQualityService } from "./services/aiQualityService";
import { dpiaService } from "./services/dpiaService";
import { consentService } from "./services/consentService";
import { breachService } from "./services/breachService";
import { hsService } from "./services/hsService";
import { dataMappingService } from "./services/dataMappingService";
import { piaService } from "./services/piaService";
import { policyTemplateService } from "./services/policyTemplateService";
import { dsarService } from "./services/dsarService";
import { handlePublicConsentIntake } from "./services/consentSdk";
import { policyDriftService } from "./services/policyDriftService";
import { breachRulesService } from "./services/breachRulesService";
import { retentionService } from "./services/retentionService";
import { collectorsService } from "./services/collectorsService";
import { dsnService } from "./services/dsnService";
import { dsnDiscoveryService } from './services/dsnDiscoveryService';
import { indexAdvisorService } from "./services/indexAdvisor";
import { simulationService } from "./services/simulationService";
import { rateLimitByOrg } from './middleware/rateLimit';
import { singleFlightHttp } from './middleware/singleFlightHttp';
import { queueOutboxEvent } from './services/outbox';
import { scenarioService } from './services/scenarioService';
import { activeLearningService } from './services/activeLearningService';
import { frameworkMappingService } from './services/frameworkMappingService';
import { withUserOrganization } from './db';
import { runSyntheticChecks } from './services/syntheticChecks';
import { llmMetricsService } from './services/llmMetrics';
import { getRecentMetrics } from './services/metrics';
import { kmsService } from './services/kms';
import { scimService } from './services/scimService';
import { auditLogService } from './services/auditLog';
import { checkAndConsumeQuota } from './services/quotas';
import { sloService } from './services/slo';
import { oidcSsoService } from './services/ssoOidc';
import { samlService } from './services/ssoSaml';
import { retrievalMetrics } from './services/retrievalMetrics';
import { usageMetricsService } from './services/usageMetrics';
import { healthSummaryService } from './services/healthSummary';
import { alertsService } from './services/alerts';
import { promMetricsService } from './services/promMetrics';
import { grafanaDashService } from './services/grafanaDash';

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (isFileTypeSupported(file.mimetype, file.originalname)) {
      cb(null, true);
    } else {
      const supportedExtensions = getSupportedExtensions().join(', ');
      cb(new Error(`Unsupported file type. Supported formats: ${supportedExtensions}`));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Serve lightweight consent SDK
  app.get('/sdk/consent.js', (_req: any, res: any) => {
    const js = `(()=>{const u=(k)=>{try{localStorage.setItem('policyiq.consent.org',k)}catch{}};const r=(t)=>{try{fetch('/api/public/consent',{method:'POST',headers:{'Content-Type':'application/json','x-org-key':(t&&t.orgKey)||localStorage.getItem('policyiq.consent.org')||''},body:JSON.stringify({subjectId:t&&t.subjectId||'',purposeId:t&&t.purposeId||'',granted:!!(t&&t.granted),method:t&&t.method||'sdk',meta:t&&t.meta||{}})})}catch{}};const h=()=>{try{const s=document.createElement('div');s.style.cssText='position:fixed;bottom:0;left:0;right:0;background:#111;color:#fff;padding:12px;z-index:99999;display:flex;justify-content:space-between;align-items:center;font:14px sans-serif';s.innerHTML='<div>This site uses cookies for policy consent.</div><div><button id="piq-accept" style="margin-right:8px">Accept</button><button id="piq-decline">Decline</button></div>';document.body.appendChild(s);document.getElementById('piq-accept').onclick=()=>{r({purposeId:'cookies',granted:true,method:'banner'});s.remove();};document.getElementById('piq-decline').onclick=()=>{r({purposeId:'cookies',granted:false,method:'banner'});s.remove();};}catch{}};window.PolicyIQConsent={record:r,setOrgKey:u,showBanner:h}})();`;
    res.setHeader('Content-Type','application/javascript');
    res.send(js);
  });

  app.use('/api', rateLimitByOrg({ capacity: 30, refillPerSecond: 15 }));

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Organization routes
  app.post('/api/organizations', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { name } = req.body;
      const organization = await storage.createOrganization({ name });
      
      // Update user with organization ID
      await storage.upsertUser({
        ...user,
        organizationId: organization.id,
      });

      res.json(organization);
    } catch (error) {
      console.error("Error creating organization:", error);
      res.status(500).json({ message: "Failed to create organization" });
    }
  });

  // File format info route
  app.get('/api/policies/supported-formats', (req, res) => {
    res.json({
      supportedExtensions: getSupportedExtensions(),
      maxFileSize: 10 * 1024 * 1024, // 10MB
      supportedTypes: [
        { extension: '.docx', description: 'Word Document (DOCX)' },
        { extension: '.doc', description: 'Word Document (DOC)' },
        { extension: '.txt', description: 'Plain Text' }
      ],
      comingSoon: [
        { extension: '.pdf', description: 'PDF Document' },
        { extension: '.rtf', description: 'Rich Text Format' }
      ]
    });
  });

  // Policy document routes
  app.post('/api/policies/upload', isAuthenticated, requireRoles('editor'), upload.single('document'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Org-level rate limiting and cost cap check
      const orgKey = `org:${user.organizationId}:uploads`; 
      const limit = 50; // daily uploads limit per org
      const ttl = 24 * 60 * 60; // seconds
      const current = await redis.incr(orgKey);
      if (current === 1) {
        await redis.expire(orgKey, ttl);
      }
      if (current > limit) {
        return res.status(429).json({ message: "Upload rate limit exceeded for your organization" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { title, analyzerType } = req.body;
      
      // Create policy document record
      const policyDocument = await storage.createPolicyDocument({
        organizationId: user.organizationId,
        title: title || req.file.originalname,
        originalFilename: req.file.originalname,
        storagePath: req.file.path,
      });

      // Process document asynchronously and enqueue analysis
      processDocument(req.file.path, policyDocument.id)
        .then(async (extractedText) => {
          await storage.updatePolicyDocument(policyDocument.id, { extractedText });
          const report = await storage.createComplianceReport({
            policyDocumentId: policyDocument.id,
            organizationId: user.organizationId!,
            status: "processing",
          });
          await enqueueAnalysisJob({ organizationId: user.organizationId!, reportId: report.id, policyText: extractedText, analyzerType: (analyzerType as any) || 'auto', traceId: (req as any).id });
          // Store processing metadata sidecar if available
          try { /* metadata is persisted by processor; nothing to do here */ } catch {}
        })
        .catch(error => { console.error("Error processing document:", error); });

      res.json(policyDocument);
    } catch (error) {
      console.error("Error uploading policy:", error);
      res.status(500).json({ message: "Failed to upload policy" });
    }
  });

  // Batch upload endpoint for multiple documents
  app.post('/api/policies/batch-upload', isAuthenticated, requireRoles('editor'), upload.array('documents', 10), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Batch upload guard based on per-org cost cap (count-based proxy)
      const orgKey = `org:${user.organizationId}:uploads`;
      const limit = 50;
      const ttl = 24 * 60 * 60;
      const current = await redis.incrby(orgKey, (req.files?.length || 0));
      if (current === (req.files?.length || 0)) {
        await redis.expire(orgKey, ttl);
      }
      if (current > limit) {
        return res.status(429).json({ message: "Upload rate limit exceeded for your organization" });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      const uploadedDocuments = [];
      const processingErrors = [];

      // Process each file
      for (const file of req.files as Express.Multer.File[]) {
        try {
          // Create policy document record
          const policyDocument = await storage.createPolicyDocument({
            organizationId: user.organizationId,
            title: file.originalname,
            originalFilename: file.originalname,
            storagePath: file.path,
          });

          uploadedDocuments.push(policyDocument);

          processDocument(file.path, policyDocument.id)
            .then(async (extractedText) => {
              await storage.updatePolicyDocument(policyDocument.id, { extractedText });
              const report = await storage.createComplianceReport({
                policyDocumentId: policyDocument.id,
                organizationId: user.organizationId!,
                status: "processing",
              });
              await enqueueAnalysisJob({ organizationId: user.organizationId!, reportId: report.id, policyText: extractedText, traceId: (req as any).id });
            })
            .catch(error => { console.error(`Error processing document ${file.originalname}:`, error); });

        } catch (error) {
          console.error(`Error uploading document ${file.originalname}:`, error);
          processingErrors.push({
            filename: file.originalname,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      res.json({
        uploadedDocuments,
        totalUploaded: uploadedDocuments.length,
        totalFiles: req.files.length,
        errors: processingErrors
      });
    } catch (error) {
      console.error("Error in batch upload:", error);
      res.status(500).json({ message: "Failed to process batch upload" });
    }
  });

  app.get('/api/policies', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const policies = await storage.getPolicyDocuments(user.organizationId);
      res.json(policies);
    } catch (error) {
      console.error("Error fetching policies:", error);
      res.status(500).json({ message: "Failed to fetch policies" });
    }
  });

  app.get('/api/policies/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const policy = await storage.getPolicyDocument(id);
      
      if (!policy || policy.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Policy not found" });
      }

      res.json(policy);
    } catch (error) {
      console.error("Error fetching policy:", error);
      res.status(500).json({ message: "Failed to fetch policy" });
    }
  });

  // Compliance report routes
  app.get('/api/reports', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const reports = await storage.getComplianceReports(user.organizationId);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  app.get('/api/reports/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const report = await storage.getComplianceReport(id);
      
      if (!report || report.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Report not found" });
      }

      const analysisResults = await storage.getAnalysisResults(id);
      
      res.json({
        ...report,
        analysisResults,
      });
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  app.get('/api/reports/:id/pdf', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const report = await storage.getComplianceReport(id);
      
      if (!report || report.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Report not found" });
      }

      const analysisResults = await storage.getAnalysisResults(id);
      const pdfBuffer = await generateReport(report, analysisResults);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="compliance-report-${id}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  // Dashboard stats
  app.get('/api/dashboard/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const reports = await storage.getComplianceReports(user.organizationId);
      const completedReports = reports.filter(r => r.status === "completed");
      
      let overallScore = 0;
      let totalGaps = 0;
      let highRiskCount = 0;

      if (completedReports.length > 0) {
        overallScore = completedReports.reduce((sum, r) => sum + (r.overallScore || 0), 0) / completedReports.length;
        totalGaps = completedReports.reduce((sum, r) => sum + (r.gapCount || 0), 0);
        highRiskCount = completedReports.filter(r => r.riskLevel === "High").length;
      }

      const riskLevel = highRiskCount > 0 ? "High" : totalGaps > 5 ? "Medium" : "Low";

      res.json({
        complianceScore: Math.round(overallScore),
        gapCount: totalGaps,
        riskLevel,
        totalReports: reports.length,
        completedReports: completedReports.length,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Historical tracking routes
  app.get('/api/analytics/compliance-history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { policyDocumentId, regulationId, periodDays = 90 } = req.query;
      
      const { HistoricalTrackingService } = await import('./services/historicalTracking');
      const history = await HistoricalTrackingService.analyzeComplianceHistory(
        user.organizationId,
        policyDocumentId as string,
        regulationId as string,
        parseInt(periodDays as string) || 90
      );

      res.json(history);
    } catch (error) {
      console.error("Error fetching compliance history:", error);
      res.status(500).json({ message: "Failed to fetch compliance history" });
    }
  });

  app.get('/api/analytics/trend-comparison', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { policyDocumentId } = req.query;
      
      const { HistoricalTrackingService } = await import('./services/historicalTracking');
      const comparisons = await HistoricalTrackingService.compareCompliancePeriods(
        user.organizationId,
        policyDocumentId as string
      );

      res.json(comparisons);
    } catch (error) {
      console.error("Error fetching trend comparison:", error);
      res.status(500).json({ message: "Failed to fetch trend comparison" });
    }
  });

  app.get('/api/analytics/improvement-suggestions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { policyDocumentId } = req.query;
      
      const { HistoricalTrackingService } = await import('./services/historicalTracking');
      const suggestions = await HistoricalTrackingService.getImprovementSuggestions(
        user.organizationId,
        policyDocumentId as string
      );

      res.json({ suggestions });
    } catch (error) {
      console.error("Error fetching improvement suggestions:", error);
      res.status(500).json({ message: "Failed to fetch improvement suggestions" });
    }
  });

  // Executive reporting routes
  app.get('/api/reports/executive-summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { periodDays = 90 } = req.query;
      
      const { ExecutiveReportingService } = await import('./services/executiveReporting');
      const summary = await ExecutiveReportingService.generateExecutiveSummary(
        user.organizationId,
        parseInt(periodDays as string) || 90
      );

      res.json(summary);
    } catch (error) {
      console.error("Error generating executive summary:", error);
      res.status(500).json({ message: "Failed to generate executive summary" });
    }
  });

  app.get('/api/reports/detailed-compliance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { ExecutiveReportingService } = await import('./services/executiveReporting');
      const report = await ExecutiveReportingService.generateDetailedComplianceReport(
        user.organizationId
      );

      res.json(report);
    } catch (error) {
      console.error("Error generating detailed compliance report:", error);
      res.status(500).json({ message: "Failed to generate detailed compliance report" });
    }
  });

  // Compliance calendar routes
  app.get('/api/calendar/summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { ComplianceCalendarService } = await import('./services/complianceCalendar');
      const summary = await ComplianceCalendarService.getCalendarSummary(user.organizationId);

      res.json(summary);
    } catch (error) {
      console.error("Error generating calendar summary:", error);
      res.status(500).json({ message: "Failed to generate calendar summary" });
    }
  });

  app.get('/api/calendar/events', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { startDate, endDate } = req.query;
      const { ComplianceCalendarService } = await import('./services/complianceCalendar');
      
      if (startDate && endDate) {
        const events = await ComplianceCalendarService.getEventsInRange(
          user.organizationId,
          new Date(startDate as string),
          new Date(endDate as string)
        );
        res.json(events);
      } else {
        const events = await ComplianceCalendarService.generateCalendarEvents(user.organizationId);
        res.json(events);
      }
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ message: "Failed to fetch calendar events" });
    }
  });

  app.post('/api/calendar/events/:eventId/complete', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { eventId } = req.params;
      const { notes } = req.body;

      const { ComplianceCalendarService } = await import('./services/complianceCalendar');
      const success = await ComplianceCalendarService.markEventCompleted(eventId, userId, notes);

      if (success) {
        res.json({ message: "Event marked as completed" });
      } else {
        res.status(400).json({ message: "Failed to mark event as completed" });
      }
    } catch (error) {
      console.error("Error marking event as completed:", error);
      res.status(500).json({ message: "Failed to mark event as completed" });
    }
  });

  // Admin regulation management routes
  app.get('/api/admin/regulations', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const regulations = await storage.getAllRegulations();
      res.json(regulations);
    } catch (error) {
      console.error("Error fetching regulations:", error);
      res.status(500).json({ message: "Failed to fetch regulations" });
    }
  });

  app.get('/api/admin/prompts', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const rows = await db.select().from(promptVersions).orderBy(desc(promptVersions.createdAt));
      res.json({ prompts: rows });
    } catch (error) {
      console.error('Error fetching prompts:', error);
      res.status(500).json({ message: 'Failed to fetch prompts' });
    }
  });

  // AI Quality System endpoints (admin)
  app.post('/api/admin/golden-examples', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { promptType, inputText, regulationName, expected, tags } = req.body || {};
      if (!promptType || !inputText) return res.status(400).json({ message: 'promptType and inputText required' });
      await db.execute(sql`insert into golden_examples (prompt_type, input_text, regulation_name, expected, tags) values (${promptType}, ${inputText}, ${regulationName || null}, ${expected || {}}, ${tags || []})`);
      res.status(201).json({ message: 'Golden example created' });
    } catch (err) {
      console.error('Error creating golden example:', err);
      res.status(500).json({ message: 'Failed to create golden example' });
    }
  });

  app.post('/api/admin/eval/run', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { promptType, promptVersionId } = req.body || {};
      if (!promptType) return res.status(400).json({ message: 'promptType required' });
      const result = await aiQualityService.runOfflineEval(promptType, promptVersionId);
      res.json(result);
    } catch (err) {
      console.error('Error running offline eval:', err);
      res.status(500).json({ message: 'Failed to run offline eval' });
    }
  });

  app.get('/api/admin/regulations/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const regulation = await storage.getRegulation(id);
      
      if (!regulation) {
        return res.status(404).json({ message: "Regulation not found" });
      }

      const clauses = await storage.getRegulationClauses(id);
      res.json({ ...regulation, clauses });
    } catch (error) {
      console.error("Error fetching regulation:", error);
      res.status(500).json({ message: "Failed to fetch regulation" });
    }
  });

  app.post('/api/admin/regulations', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const regulationData = { ...req.body, lastUpdatedBy: userId };
      
      const regulation = await storage.createRegulation(regulationData);
      res.status(201).json(regulation);
    } catch (error) {
      console.error("Error creating regulation:", error);
      res.status(500).json({ message: "Failed to create regulation" });
    }
  });

  app.put('/api/admin/regulations/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const regulationData = { ...req.body, lastUpdatedBy: userId, updatedAt: new Date() };
      
      const regulation = await storage.updateRegulation(id, regulationData);
      if (!regulation) {
        return res.status(404).json({ message: "Regulation not found" });
      }

      res.json(regulation);
    } catch (error) {
      console.error("Error updating regulation:", error);
      res.status(500).json({ message: "Failed to update regulation" });
    }
  });

  app.delete('/api/admin/regulations/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteRegulation(id);
      
      if (!success) {
        return res.status(404).json({ message: "Regulation not found" });
      }

      res.json({ message: "Regulation deleted successfully" });
    } catch (error) {
      console.error("Error deleting regulation:", error);
      res.status(500).json({ message: "Failed to delete regulation" });
    }
  });

  // Regulation clauses management
  app.post('/api/admin/regulations/:regulationId/clauses', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { regulationId } = req.params;
      const userId = req.user.claims.sub;
      const clauseData = { ...req.body, regulationId, lastUpdatedBy: userId };
      
      const clause = await storage.createRegulationClause(clauseData);
      res.status(201).json(clause);
    } catch (error) {
      console.error("Error creating regulation clause:", error);
      res.status(500).json({ message: "Failed to create regulation clause" });
    }
  });

  app.put('/api/admin/clauses/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const clauseData = { ...req.body, lastUpdatedBy: userId };
      
      const clause = await storage.updateRegulationClause(id, clauseData);
      if (!clause) {
        return res.status(404).json({ message: "Regulation clause not found" });
      }

      res.json(clause);
    } catch (error) {
      console.error("Error updating regulation clause:", error);
      res.status(500).json({ message: "Failed to update regulation clause" });
    }
  });

  app.delete('/api/admin/clauses/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteRegulationClause(id);
      
      if (!success) {
        return res.status(404).json({ message: "Regulation clause not found" });
      }

      res.json({ message: "Regulation clause deleted successfully" });
    } catch (error) {
      console.error("Error deleting regulation clause:", error);
      res.status(500).json({ message: "Failed to delete regulation clause" });
    }
  });

  // Advanced Analytics endpoints
  app.get('/api/analytics/trends', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const timeRange = req.query.timeRange as '30d' | '90d' | '1y' || '90d';
      if (req.query.quick === '1') {
        const trends = await analyticsService.getTrendSummaryQuick(user.organizationId);
        return res.json(trends);
      }
      const trends = await analyticsService.getTrendAnalysis(user.organizationId, timeRange);
      res.json(trends);
    } catch (error) {
      console.error("Error getting trend analysis:", error);
      res.status(500).json({ message: "Failed to get trend analysis" });
    }
  });

  app.get('/api/analytics/comparative', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const analysis = await analyticsService.getComparativeAnalysis(user.organizationId);
      res.json(analysis);
    } catch (error) {
      console.error("Error getting comparative analysis:", error);
      res.status(500).json({ message: "Failed to get comparative analysis" });
    }
  });

  app.get('/api/analytics/benchmarks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { industry = 'Technology', companySize = 'Medium', regulationId } = req.query;
      const benchmarks = await analyticsService.getIndustryBenchmarks(
        user.organizationId, 
        industry as string,
        companySize as string,
        regulationId as string
      );
      res.json(benchmarks);
    } catch (error) {
      console.error("Error getting industry benchmarks:", error);
      res.status(500).json({ message: "Failed to get industry benchmarks" });
    }
  });

  app.get('/api/analytics/predictive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const predictive = await analyticsService.getPredictiveAnalytics(user.organizationId);
      res.json(predictive);
    } catch (error) {
      console.error("Error getting predictive analytics:", error);
      res.status(500).json({ message: "Failed to get predictive analytics" });
    }
  });

  // Admin queue controls
  app.post('/api/admin/queue/analysis/pause', isAuthenticated, isAdmin, async (_req: any, res) => {
    try { await analysisQueue.pause(); res.json({ ok: true, status: 'paused' }); } catch (e) { res.status(500).json({ message: 'Failed to pause' }); }
  });
  app.post('/api/admin/queue/analysis/resume', isAuthenticated, isAdmin, async (_req: any, res) => {
    try { await analysisQueue.resume(); res.json({ ok: true, status: 'resumed' }); } catch (e) { res.status(500).json({ message: 'Failed to resume' }); }
  });

  // DLQ admin
  app.get('/api/admin/queue/dlq', isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const jobs = await analysisDlq.getJobs(['failed'], 0, 100);
      const rows = jobs.map((j: any) => ({ id: j?.id, name: j?.name, attemptsMade: j?.attemptsMade, failedReason: j?.failedReason, timestamp: j?.timestamp, data: j?.data }));
      res.json(rows);
    } catch (e) { res.status(500).json({ message: 'Failed to fetch DLQ' }); }
  });
  app.post('/api/admin/queue/dlq/retry/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const job = await analysisDlq.getJob(String(req.params.id));
      if (!job) return res.status(404).json({ message: 'Not found' });
      const data = job.data as any;
      await enqueueAnalysisJob(data);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: 'Failed to retry DLQ job' }); }
  });
  app.delete('/api/admin/queue/dlq/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const job = await analysisDlq.getJob(String(req.params.id));
      if (!job) return res.status(404).json({ message: 'Not found' });
      await job.remove();
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: 'Failed to delete DLQ job' }); }
  });

  // Admin KMS key rotation per org
  app.post('/api/admin/kms/rotate', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const orgId = String(req.body?.organizationId || '');
      if (!orgId) return res.status(400).json({ message: 'organizationId required' });
      const out = await kmsService.rotateOrgKey(orgId);
      try { await auditLogService.record({ organizationId: orgId, actorUserId: req.user?.claims?.sub, action: 'kms.rotate', subjectType: 'organization', subjectId: orgId, data: { rewrapped: out.rewrapped } }); } catch {}
      res.json(out);
    } catch (e) { res.status(500).json({ message: 'Failed to rotate key' }); }
  });

  // Audit verify
  app.get('/api/admin/audit/verify', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const orgId = req.query?.organizationId ? String(req.query.organizationId) : undefined; const out = await auditLogService.verify(orgId); res.json(out); } catch (e) { res.status(500).json({ message: 'Failed to verify' }); }
  });

  // SCIM v2 Users (token in Authorization: Bearer <token>)
  const scimAuth = (req: any, res: any, next: any) => {
    const hdr = String(req.headers['authorization'] || '');
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
    if (!token || token !== (process.env.SCIM_TOKEN || '')) return res.status(401).json({ message: 'Unauthorized' });
    next();
  };
  app.get('/scim/v2/Users', scimAuth, async (req: any, res) => {
    try { const startIndex = parseInt(String(req.query.startIndex || '1')); const count = parseInt(String(req.query.count || '50')); const out = await scimService.listUsers({ startIndex, count, filter: String(req.query.filter || '') }); res.json(out); } catch (e) { res.status(500).json({ message: 'Failed' }); }
  });
  app.post('/scim/v2/Users', scimAuth, async (req: any, res) => {
    try { const out = await scimService.createUser(req.body || {}); res.status(201).json(out); } catch (e) { res.status(500).json({ message: 'Failed' }); }
  });
  app.get('/scim/v2/Users/:id', scimAuth, async (req: any, res) => {
    try { const out = await scimService.getUser(req.params.id); if (!out) return res.status(404).json({ message: 'Not found' }); res.json(out); } catch (e) { res.status(500).json({ message: 'Failed' }); }
  });
  app.put('/scim/v2/Users/:id', scimAuth, async (req: any, res) => {
    try { const out = await scimService.replaceUser(req.params.id, req.body || {}); res.json(out); } catch (e) { res.status(500).json({ message: 'Failed' }); }
  });
  app.delete('/scim/v2/Users/:id', scimAuth, async (req: any, res) => {
    try { await scimService.deleteUser(req.params.id); res.status(204).send(); } catch (e) { res.status(500).json({ message: 'Failed' }); }
  });

  // Admin metrics endpoints
  app.get('/api/admin/metrics/llm', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const model = String(req.query?.model || 'gpt-5');
      const minutes = parseInt(String(req.query?.minutes || '60')) || 60;
      const stats = await llmMetricsService.getRecent(model, minutes);
      res.json({ model, minutes, ...stats });
    } catch (e) { res.status(500).json({ message: 'Failed to fetch LLM metrics' }); }
  });
  app.get('/api/admin/metrics/api', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const org = String(req.query?.org || '');
      const minutes = parseInt(String(req.query?.minutes || '60')) || 60;
      if (!org) return res.status(400).json({ message: 'org required' });
      const rows = await getRecentMetrics(org, minutes);
      res.json({ organizationId: org, minutes, rows });
    } catch (e) { res.status(500).json({ message: 'Failed to fetch API metrics' }); }
  });

  // Admin quotas
  app.post('/api/admin/quotas', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { organizationId, feature, window, limit } = req.body || {};
      if (!organizationId || !feature || !window || !limit) return res.status(400).json({ message: 'organizationId, feature, window, limit required' });
      await db.execute(sql`insert into feature_quotas (organization_id, feature, window, limit_count) values (${organizationId}::uuid, ${feature}, ${window}, ${parseInt(String(limit), 10)}) on conflict (organization_id, feature, window) do update set limit_count=excluded.limit_count, updated_at=now()` as any);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: 'Failed to set quota' }); }
  });
  app.get('/api/admin/quotas', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const org = String(req.query?.organizationId || ''); if (!org) return res.status(400).json({ message: 'organizationId required' }); const rows: any = await db.execute(sql`select feature, window, limit_count from feature_quotas where organization_id=${org}::uuid` as any); res.json(rows?.rows ?? []); } catch (e) { res.status(500).json({ message: 'Failed to fetch quotas' }); }
  });

  // Admin SLOs
  app.post('/api/admin/slo', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const { organizationId, name, targetLatencyMs, maxErrorRate } = req.body || {}; if (!organizationId || !name) return res.status(400).json({ message: 'organizationId,name required' }); await db.execute(sql`insert into slo_policies (organization_id, name, target_latency_ms, max_error_rate) values (${organizationId}::uuid, ${name}, ${targetLatencyMs || null}, ${maxErrorRate || null}) on conflict (organization_id, name) do update set target_latency_ms=excluded.target_latency_ms, max_error_rate=excluded.max_error_rate, updated_at=now()` as any); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: 'Failed to upsert SLO' }); }
  });
  app.get('/api/admin/slo', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const org = String(req.query?.organizationId || ''); if (!org) return res.status(400).json({ message: 'organizationId required' }); const rows: any = await db.execute(sql`select name, target_latency_ms, max_error_rate from slo_policies where organization_id=${org}::uuid` as any); res.json(rows?.rows ?? []); } catch (e) { res.status(500).json({ message: 'Failed to fetch SLOs' }); }
  });
  app.get('/api/admin/slo/dashboard', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const org = String(req.query?.organizationId || ''); if (!org) return res.status(400).json({ message: 'organizationId required' });
      const mins = parseInt(String(req.query?.minutes || '60'));
      const burn = await sloService.computeBurnRate({ organizationId: org, windowMinutes: mins });
      const metrics = await getRecentMetrics(org, mins);
      res.json({ burn, metrics });
    } catch (e) { res.status(500).json({ message: 'Failed to fetch SLO dashboard' }); }
  });

  // Retrieval metrics
  app.get('/api/admin/retrieval/metrics', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const org = String(req.query?.organizationId || ''); const minutes = parseInt(String(req.query?.minutes || '60')); const out = await retrievalMetrics.get({ organizationId: org || undefined, minutes }); res.json(out); } catch (e) { res.status(500).json({ message: 'Failed to fetch retrieval metrics' }); }
  });

  // Usage metrics
  app.get('/api/admin/usage', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const org = String(req.query?.organizationId || '');
      const feature = String(req.query?.feature || 'policy_generation');
      if (!org) return res.status(400).json({ message: 'organizationId required' });
      const [daily, weekly, monthly] = await Promise.all([
        usageMetricsService.getDaily(org, feature, 30),
        usageMetricsService.getWeekly(org, feature, 12),
        usageMetricsService.getMonthly(org, feature, 12),
      ]);
      res.json({ feature, daily, weekly, monthly });
    } catch (e) {
      res.status(500).json({ message: 'Failed to fetch usage metrics' });
    }
  });

  // Health summary
  app.get('/api/admin/health/summary', isAuthenticated, isAdmin, async (_req: any, res) => {
    try { const summary = await healthSummaryService.summarize(); res.json(summary); } catch (e) { res.status(500).json({ message: 'Failed to fetch health summary' }); }
  });

  // Alerts config and evaluation
  app.post('/api/admin/alerts/thresholds', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const org = String(req.body?.organizationId || ''); if (!org) return res.status(400).json({ message: 'organizationId required' }); await alertsService.setThresholds(org, req.body?.thresholds || {}); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: 'Failed to set thresholds' }); }
  });
  app.get('/api/admin/alerts/thresholds', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const org = String(req.query?.organizationId || ''); if (!org) return res.status(400).json({ message: 'organizationId required' }); const t = await alertsService.getThresholds(org); res.json(t || {}); } catch (e) { res.status(500).json({ message: 'Failed to get thresholds' }); }
  });
  app.get('/api/admin/alerts/evaluate', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const org = String(req.query?.organizationId || ''); if (!org) return res.status(400).json({ message: 'organizationId required' }); const minutes = parseInt(String(req.query?.minutes || '15')); const out = await alertsService.evaluate(org, minutes); res.json(out); } catch (e) { res.status(500).json({ message: 'Failed to evaluate alerts' }); }
  });
  app.post('/api/admin/alerts/destinations', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const org = String(req.body?.organizationId || ''); if (!org) return res.status(400).json({ message: 'organizationId required' }); await alertsService.setDestinations(org, req.body?.dest || {}); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: 'Failed to set destinations' }); }
  });
  app.post('/api/admin/alerts/ack', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const org = String(req.body?.organizationId || ''); const kind = String(req.body?.kind || ''); const ttl = parseInt(String(req.body?.ttlSeconds || '900')); if (!org || !kind) return res.status(400).json({ message: 'organizationId and kind required' }); await alertsService.acknowledge(org, kind, ttl); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: 'Failed to acknowledge alert' }); }
  });

  // Prometheus metrics (org scoped)
  app.get('/metrics', async (req: any, res) => {
    try { const org = String(req.query?.organizationId || 'na'); const minutes = parseInt(String(req.query?.minutes || '5')); const text = await promMetricsService.render(org, minutes); res.setHeader('Content-Type', 'text/plain'); res.send(text); } catch (e) { res.status(500).send('# metrics unavailable'); }
  });

  // Grafana dashboard JSON for quick import
  app.get('/api/admin/grafana/dashboard', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const org = String(req.query?.organizationId || 'na'); const dash = grafanaDashService.getDashboard(org); res.json(dash); } catch (e) { res.status(500).json({ message: 'Failed to fetch dashboard' }); }
  });

  // SLO dashboard (aggregated)
  app.get('/api/admin/slo/dashboard', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const org = String(req.query?.organizationId || '');
      if (!org) return res.status(400).json({ message: 'organizationId required' });
      const minutes = parseInt(String(req.query?.minutes || '60'));
      const models = String(req.query?.models || '').split(',').filter(Boolean);
      const modelList = models.length > 0 ? models : (process.env.LLM_MODELS?.split(',').filter(Boolean) || ['gpt-4o-mini']);

      const [burn, apiRecent, retrieval, queues] = await Promise.all([
        sloService.computeBurnRate({ organizationId: org, windowMinutes: minutes }),
        getRecentMetrics(org, minutes),
        retrievalMetrics.get({ organizationId: org, minutes }),
        healthSummaryService.getQueueStats(),
      ]);

      const llmByModel: Record<string, any> = {};
      for (const m of modelList) {
        try {
          const snapshot = await llmMetricsService.getRecent(m, minutes);
          llmByModel[m] = snapshot;
        } catch {}
      }

      res.json({ burn, apiRecent, llmRecent: llmByModel, retrieval, queues });
    } catch (e) {
      res.status(500).json({ message: 'Failed to build SLO dashboard' });
    }
  });
  app.get('/api/admin/slo/burn-rate', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const org = String(req.query?.organizationId || ''); if (!org) return res.status(400).json({ message: 'organizationId required' }); const minutes = parseInt(String(req.query?.minutes || '60')); const name = req.query?.name ? String(req.query.name) : undefined; const out = await sloService.computeBurnRate({ organizationId: org, windowMinutes: minutes, sloName: name }); res.json(out); } catch (e) { res.status(500).json({ message: 'Failed to compute burn rate' }); }
  });

  // OIDC SSO
  app.get('/auth/oidc/login', (_req: any, res) => {
    try { const state = Math.random().toString(36).slice(2); const nonce = Math.random().toString(36).slice(2); res.cookie?.('oidc.state', state, { httpOnly: true, sameSite: 'lax' }); res.cookie?.('oidc.nonce', nonce, { httpOnly: true, sameSite: 'lax' }); const url = oidcSsoService.buildAuthUrl(state, nonce); res.redirect(url); } catch (e) { res.status(500).json({ message: 'SSO not configured' }); }
  });
  app.get('/auth/oidc/callback', async (req: any, res) => {
    try {
      const { code, state } = req.query as any;
      const st = req.cookies?.['oidc.state'] || '';
      const nonce = req.cookies?.['oidc.nonce'] || '';
      if (!code || !state || state !== st) return res.status(400).json({ message: 'Invalid state' });
      const tok = await oidcSsoService.exchangeCodeForToken(String(code));
      const claims = await oidcSsoService.verifyIdToken(tok.id_token, nonce);
      // minimal user linking
      const email = claims.email || claims.preferred_username || '';
      if (!email) return res.status(400).json({ message: 'No email in token' });
      let user = null as any;
      try { user = await (storage as any).getUserByEmail?.(email); } catch {}
      if (!user) user = await storage.upsertUser({ id: claims.sub, email });
      const appJwt = oidcSsoService.signAppJwt({ sub: user.id, email });
      res.setHeader('Set-Cookie', `session=${appJwt}; Path=/; HttpOnly; SameSite=Lax`);
      res.redirect('/');
    } catch (e) { res.status(500).json({ message: 'SSO failed' }); }
  });

  // SAML endpoints
  app.get('/auth/saml/metadata', (_req: any, res) => {
    try { const xml = samlService.metadataXml(); res.setHeader('Content-Type', 'application/xml'); res.send(xml); } catch (e) { res.status(500).json({ message: 'SAML not configured' }); }
  });
  app.get('/auth/saml/login', (_req: any, res) => {
    try { const url = samlService.buildLoginUrl(); res.redirect(url); } catch (e) { res.status(500).json({ message: 'SAML not configured' }); }
  });
  app.post('/auth/saml/acs', async (req: any, res) => {
    try {
      const xml = String(req.body?.SAMLResponse || req.body?.samlResponse || '');
      const decoded = Buffer.from(xml, 'base64').toString('utf-8');
      const out = samlService.verifyAssertion(decoded);
      const email = out.email || out.nameId || '';
      if (!email) return res.status(400).json({ message: 'No subject' });
      let user = await (storage as any).getUserByEmail?.(email);
      if (!user) user = await storage.upsertUser({ id: out.nameId || email, email });
      const appJwt = oidcSsoService.signAppJwt({ sub: user.id, email });
      res.setHeader('Set-Cookie', `session=${appJwt}; Path=/; HttpOnly; SameSite=Lax`);
      res.redirect('/');
    } catch (e) { res.status(500).json({ message: 'SAML ACS failed' }); }
  });

  // DP option on risk summary
  app.get('/api/analytics/risk-summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      if (req.query.dp === '1') {
        const summary = await analyticsService.getRiskSummaryDP(user.organizationId);
        return res.json(summary);
      }
      const summary = await analyticsService.getRiskSummaryQuick(user.organizationId);
      res.json(summary);
    } catch (err) { res.status(500).json({ message: 'Failed to fetch risk summary' }); }
  });

  // Admin endpoint to seed industry benchmarks
  app.post('/api/admin/seed-benchmarks', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await analyticsService.seedIndustryBenchmarks();
      res.json({ message: "Industry benchmarks seeded successfully" });
    } catch (error) {
      console.error("Error seeding benchmarks:", error);
      res.status(500).json({ message: "Failed to seed benchmarks" });
    }
  });

  // Executive Reporting endpoints
  app.post('/api/executive/board-report', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { reportPeriod } = req.body;
      const boardReport = await executiveReportingService.createBoardReport(
        user.organizationId, 
        reportPeriod || new Date().toISOString().slice(0, 7),
        userId
      );
      
      res.json(boardReport);
    } catch (error) {
      console.error("Error creating board report:", error);
      res.status(500).json({ message: "Failed to create board report" });
    }
  });

  app.get('/api/executive/reports', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const reports = await storage.getExecutiveReports(user.organizationId);
      res.json(reports);
    } catch (error) {
      console.error("Error getting executive reports:", error);
      res.status(500).json({ message: "Failed to get executive reports" });
    }
  });

  app.post('/api/executive/kpi-dashboard', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { stakeholderType, name, description } = req.body;
      const dashboard = await executiveReportingService.createCustomKPIDashboard(
        user.organizationId,
        stakeholderType,
        name,
        description,
        userId
      );
      
      res.json(dashboard);
    } catch (error) {
      console.error("Error creating KPI dashboard:", error);
      res.status(500).json({ message: "Failed to create KPI dashboard" });
    }
  });

  app.get('/api/executive/kpi-dashboards', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { stakeholderType } = req.query;
      const dashboards = await storage.getKPIDashboards(user.organizationId, stakeholderType as string);
      res.json(dashboards);
    } catch (error) {
      console.error("Error getting KPI dashboards:", error);
      res.status(500).json({ message: "Failed to get KPI dashboards" });
    }
  });

  app.post('/api/executive/schedule-report', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { reportType, name, frequency, recipients, filters } = req.body;
      const scheduleId = await executiveReportingService.scheduleAutomatedReport(
        user.organizationId,
        reportType,
        name,
        frequency,
        recipients,
        filters,
        userId
      );
      
      res.json({ scheduleId, message: "Report scheduled successfully" });
    } catch (error) {
      console.error("Error scheduling report:", error);
      res.status(500).json({ message: "Failed to schedule report" });
    }
  });

  app.get('/api/executive/report-schedules', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const schedules = await storage.getReportSchedules(user.organizationId);
      res.json(schedules);
    } catch (error) {
      console.error("Error getting report schedules:", error);
      res.status(500).json({ message: "Failed to get report schedules" });
    }
  });

  app.post('/api/executive/export-bi', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { exportType, dataSource } = req.body;
      const exportResult = await executiveReportingService.exportForBI(
        user.organizationId,
        exportType,
        dataSource,
        userId
      );
      
      res.json(exportResult);
    } catch (error) {
      console.error("Error exporting for BI:", error);
      res.status(500).json({ message: "Failed to export for BI" });
    }
  });

  app.get('/api/executive/bi-exports', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const exports = await storage.getBIExports(user.organizationId);
      res.json(exports);
    } catch (error) {
      console.error("Error getting BI exports:", error);
      res.status(500).json({ message: "Failed to get BI exports" });
    }
  });

  // Regulatory Crawler routes
  app.get('/api/regulatory/sources', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const sources = await storage.getRegulatorySourcesForOrganization(user.organizationId);
      res.json(sources);
    } catch (error) {
      console.error("Error fetching regulatory sources:", error);
      res.status(500).json({ message: "Failed to fetch regulatory sources" });
    }
  });

  app.get('/api/regulatory/updates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { status } = req.query;
      const updates = await storage.getRegulatoryUpdates(user.organizationId, status as string);
      res.json(updates);
    } catch (error) {
      console.error("Error fetching regulatory updates:", error);
      res.status(500).json({ message: "Failed to fetch regulatory updates" });
    }
  });

  app.get('/api/regulatory/crawler/stats', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const stats = await regulatoryCrawlerService.getCrawlerStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching crawler stats:", error);
      res.status(500).json({ message: "Failed to fetch crawler stats" });
    }
  });

  app.get('/api/regulatory/updates/recent', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }
      const { limit = 50 } = req.query;
      const updates = await storage.getRegulatoryUpdates(user.organizationId, undefined, parseInt(limit as string));
      res.json(updates);
    } catch (error) {
      console.error("Error fetching recent updates:", error);
      res.status(500).json({ message: "Failed to fetch recent updates" });
    }
  });

  app.get('/api/regulatory/updates/pending', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }
      const updates = await storage.getRegulatoryUpdates(user.organizationId, 'pending');
      res.json(updates);
    } catch (error) {
      console.error("Error fetching pending updates:", error);
      res.status(500).json({ message: "Failed to fetch pending updates" });
    }
  });

  app.post('/api/regulatory/crawler/run/:sourceId', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { sourceId } = req.params;
      const result = await regulatoryCrawlerService.crawlSource(sourceId, 'manual');
      res.json(result);
    } catch (error) {
      console.error("Error running crawler:", error);
      res.status(500).json({ message: "Failed to run crawler" });
    }
  });

  app.post('/api/regulatory/crawler/run-all', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      // Run scheduled crawls for all sources
      await regulatoryCrawlerService.runScheduledCrawls();
      res.json({ message: "Scheduled crawls initiated" });
    } catch (error) {
      console.error("Error running scheduled crawls:", error);
      res.status(500).json({ message: "Failed to run scheduled crawls" });
    }
  });

  app.get('/api/regulatory/jobs', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { sourceId } = req.query;
      const jobs = await storage.getCrawlerJobs(sourceId as string);
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching crawler jobs:", error);
      res.status(500).json({ message: "Failed to fetch crawler jobs" });
    }
  });

  app.get('/api/regulatory/notifications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const notifications = await storage.getRegulatoryNotifications(user.organizationId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching regulatory notifications:", error);
      res.status(500).json({ message: "Failed to fetch regulatory notifications" });
    }
  });

  // Prompt Feedback API
  app.post('/api/prompt-feedback', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { analysisId, userFeedback, specificIssues, expectedOutput } = req.body || {};

      if (!analysisId || !userFeedback) {
        return res.status(400).json({ message: 'analysisId and userFeedback are required' });
      }

      const promptId = 'compliance-analysis';
      const { promptRefinementService } = await import('./services/promptRefinementService');
      await promptRefinementService.recordFeedback({
        promptId,
        analysisId,
        userFeedback,
        specificIssues: Array.isArray(specificIssues) ? specificIssues : [],
        expectedOutput: expectedOutput || undefined,
      } as any);

      res.json({ message: 'Feedback recorded' });
    } catch (error) {
      console.error('Error recording prompt feedback:', error);
      res.status(500).json({ message: 'Failed to record feedback' });
    }
  });

  app.get('/api/regulatory/impact-assessments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const assessments = await storage.getUpdateImpactAssessments(user.organizationId);
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching impact assessments:", error);
      res.status(500).json({ message: "Failed to fetch impact assessments" });
    }
  });

  // Remediation & Policy Generation
  app.post('/api/remediation/suggest', isAuthenticated, singleFlightHttp({ windowSeconds: 20 }), async (req: any, res) => {
    try {
      const { textSnippet, regulationName, contextSummary } = req.body || {};
      if (!textSnippet) return res.status(400).json({ message: 'textSnippet required' });
      const { RemediationService } = await import('./services/remediationService');
      const result = await RemediationService.suggestFix({ textSnippet, regulationName, contextSummary });
      res.json(result);
    } catch (error) {
      console.error('suggest remediation failed:', error);
      res.status(500).json({ message: 'Failed to generate remediation' });
    }
  });

  app.post('/api/remediation/apply', isAuthenticated, rateLimitByOrg({ capacity: 5, refillPerSecond: 2 }), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { policyDocumentId, originalText, replacementText, changeDescription } = req.body || {};
      if (!policyDocumentId || !originalText || !replacementText) {
        return res.status(400).json({ message: 'policyDocumentId, originalText, replacementText required' });
      }
      const { RemediationService } = await import('./services/remediationService');
      const result = await RemediationService.applyPolicyUpdate({ policyDocumentId, originalText, replacementText, changeDescription, userId });
      try { await queueOutboxEvent({ organizationId: '', topic: 'remediation.applied', payload: { policyDocumentId } }); } catch {}
      res.json(result);
    } catch (error) {
      console.error('apply remediation failed:', error);
      res.status(500).json({ message: 'Failed to apply remediation' });
    }
  });

  app.post('/api/remediation/revert', isAuthenticated, rateLimitByOrg({ capacity: 5, refillPerSecond: 2 }), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { policyDocumentId, originalText, replacementText } = req.body || {};
      if (!policyDocumentId || !originalText || !replacementText) {
        return res.status(400).json({ message: 'policyDocumentId, originalText, replacementText required' });
      }
      const { RemediationService } = await import('./services/remediationService');
      const result = await RemediationService.revertPolicyUpdate({ policyDocumentId, originalText, replacementText, userId });
      try { await queueOutboxEvent({ organizationId: '', topic: 'remediation.reverted', payload: { policyDocumentId } }); } catch {}
      res.json(result);
    } catch (error) {
      console.error('revert remediation failed:', error);
      res.status(500).json({ message: 'Failed to revert remediation' });
    }
  });

  app.post('/api/policy-studio/generate', isAuthenticated, singleFlightHttp({ windowSeconds: 30 }), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const ok = await checkAndConsumeQuota({ organizationId: user.organizationId, feature: 'policy_generate' });
      if (!ok) return res.status(429).json({ message: 'Quota exceeded' });
      const { prompt, title } = req.body || {};
      if (!prompt) return res.status(400).json({ message: 'prompt required' });
      const { RemediationService } = await import('./services/remediationService');
      const result = await RemediationService.generatePolicyDraft({ prompt, title, organizationId: user.organizationId });
      res.json(result);
    } catch (error) {
      console.error('generate policy failed:', error);
      res.status(500).json({ message: 'Failed to generate policy' });
    }
  });

  // Governance Workflows
  app.post('/api/gov/tasks', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const { title, description, dueDate, slaHours, assigneeUserId } = req.body || {};
      const result: any = await db.execute(sql`
        insert into workflow_tasks (organization_id, title, description, due_date, sla_hours, assignee_user_id, created_by)
        values (${user.organizationId}::uuid, ${title}, ${description || null}, ${dueDate || null}, ${slaHours || null}, ${assigneeUserId || null}, ${userId})
        returning *
      `);
      res.status(201).json((result?.rows ?? [])[0] || {});
    } catch (err) {
      console.error('Error creating task:', err);
      res.status(500).json({ message: 'Failed to create task' });
    }
  });

  app.put('/api/gov/tasks/:id', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const { id } = req.params;
      const { status, title, description, dueDate, slaHours, assigneeUserId } = req.body || {};
      const result: any = await db.execute(sql`
        update workflow_tasks set 
          status = coalesce(${status}, status),
          title = coalesce(${title}, title),
          description = coalesce(${description}, description),
          due_date = coalesce(${dueDate}, due_date),
          sla_hours = coalesce(${slaHours}, sla_hours),
          assignee_user_id = coalesce(${assigneeUserId}, assignee_user_id),
          updated_at = now()
        where id = ${id}::uuid and organization_id = ${user.organizationId}::uuid
        returning *
      `);
      const row = (result?.rows ?? [])[0];
      if (!row) return res.status(404).json({ message: 'Task not found' });
      res.json(row);
    } catch (err) {
      console.error('Error updating task:', err);
      res.status(500).json({ message: 'Failed to update task' });
    }
  });

  app.get('/api/gov/tasks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const result: any = await db.execute(sql`select * from workflow_tasks where organization_id = ${user.organizationId}::uuid order by created_at desc limit 200`);
      res.json(result?.rows ?? []);
    } catch (err) {
      console.error('Error listing tasks:', err);
      res.status(500).json({ message: 'Failed to list tasks' });
    }
  });

  app.post('/api/gov/tasks/:id/approvals', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const { id } = req.params;
      const { approverUserId } = req.body || {};
      const result: any = await db.execute(sql`
        insert into task_approvals (task_id, approver_user_id)
        select ${id}::uuid, ${approverUserId || userId}
        where exists (select 1 from workflow_tasks where id = ${id}::uuid and organization_id = ${user.organizationId}::uuid)
        returning *
      `);
      const row = (result?.rows ?? [])[0];
      if (!row) return res.status(404).json({ message: 'Task not found' });
      res.status(201).json(row);
    } catch (err) {
      console.error('Error creating approval:', err);
      res.status(500).json({ message: 'Failed to create approval' });
    }
  });

  app.post('/api/gov/approvals/:approvalId/decide', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const { approvalId } = req.params;
      const { decision, note } = req.body || {};
      const status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'pending';
      const result: any = await db.execute(sql`update task_approvals set status = ${status}, note = ${note || null}, approved_at = case when ${status} = 'approved' then now() else approved_at end where id = ${approvalId}::uuid returning *`);
      const row = (result?.rows ?? [])[0];
      if (!row) return res.status(404).json({ message: 'Approval not found' });
      res.json(row);
    } catch (err) {
      console.error('Error deciding approval:', err);
      res.status(500).json({ message: 'Failed to decide approval' });
    }
  });

  app.post('/api/gov/evidence', isAuthenticated, requireRoles('editor'), rateLimitByOrg({ capacity: 10, refillPerSecond: 5 }), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const { taskId, reportId, kind, content, dataDomain } = req.body || {};
      const result: any = await withUserOrganization({ userId, organizationId: user.organizationId }, async (dbc) => {
        // ABAC validation when enforced
        try {
          const abac = await dbc.execute(sql`select coalesce(nullif(current_setting('app.enforce_abac', true), '')::boolean, false) as abac` as any);
          const abacOn = Boolean((abac as any)?.rows?.[0]?.abac);
          if (abacOn && dataDomain) {
            const u: any = await dbc.execute(sql`select data_domains from users where id = ${userId}` as any);
            const domains: string[] = (u?.rows?.[0]?.data_domains) || [];
            if (Array.isArray(domains) && domains.length > 0 && !domains.includes(String(dataDomain))) {
              throw Object.assign(new Error('Data domain not permitted by ABAC policy'), { status: 403 });
            }
          }
        } catch {}
        const ins: any = await dbc.execute(sql`
          insert into evidence_items (organization_id, task_id, report_id, kind, content, uploaded_by, data_domain)
          values (${user.organizationId}::uuid, ${taskId || null}, ${reportId || null}, ${kind || 'note'}, ${content || ''}, ${userId}, ${dataDomain || null})
          returning *
        `);
        return ins;
      });
      const row = (result?.rows ?? [])[0] || {};
      try { await queueOutboxEvent({ organizationId: user.organizationId, topic: 'evidence.created', payload: row }); } catch {}
      res.status(201).json(row);
    } catch (err: any) {
      const status = err?.status || 500;
      if (status >= 500) console.error('Error adding evidence:', err);
      res.status(status).json({ message: err?.message || 'Failed to add evidence' });
    }
  });

  // GDPR: DPIA endpoints
  app.post('/api/gdpr/dpia/generate', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const { projectName, context } = req.body || {};
      if (!projectName) return res.status(400).json({ message: 'projectName required' });
      const out = await dpiaService.generate({ organizationId: user.organizationId, projectName, context: context || {} });
      try { await queueOutboxEvent({ organizationId: user.organizationId, topic: 'dpia.created', payload: { id: out.id, projectName } }); } catch {}
      res.status(201).json(out);
    } catch (e) { res.status(500).json({ message: 'Failed to generate DPIA' }); }
  });

  app.get('/api/gdpr/dpia/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const out = await dpiaService.get(user.organizationId, req.params.id);
      if (!out) return res.status(404).json({ message: 'Not found' });
      res.json(out);
    } catch (e) { res.status(500).json({ message: 'Failed to fetch DPIA' }); }
  });

  app.post('/api/gdpr/dpia/:id/approve', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const { decision, comment } = req.body || {};
      if (!['approved','rejected'].includes(decision)) return res.status(400).json({ message: 'decision required' });
      await dpiaService.approve({ organizationId: user.organizationId, id: req.params.id, approverUserId: userId, decision, comment });
      try { await queueOutboxEvent({ organizationId: user.organizationId, topic: 'dpia.approved', payload: { id: req.params.id, decision } }); } catch {}
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: 'Failed to approve DPIA' }); }
  });

  // GDPR: Consent management
  app.post('/api/gdpr/consent/purposes', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const { name, description, retentionDays, legalBasis } = req.body || {};
      if (!name) return res.status(400).json({ message: 'name required' });
      const purpose = await consentService.upsertPurpose({ organizationId: user.organizationId, name, description, retentionDays, legalBasis });
      try { await queueOutboxEvent({ organizationId: user.organizationId, topic: 'consent.purpose.upserted', payload: purpose }); } catch {}
      res.status(201).json(purpose);
    } catch (e) { res.status(500).json({ message: 'Failed to upsert purpose' }); }
  });

  app.post('/api/gdpr/consent/record', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const { subjectId, purposeId, granted, method, expiryAt } = req.body || {};
      if (!subjectId || !purposeId || typeof granted !== 'boolean') return res.status(400).json({ message: 'subjectId, purposeId, granted required' });
      const row = await consentService.recordConsent({ organizationId: user.organizationId, subjectId, purposeId, granted, method, expiryAt, actorUserId: userId });
      try { await queueOutboxEvent({ organizationId: user.organizationId, topic: 'consent.recorded', payload: row }); } catch {}
      res.status(201).json(row);
    } catch (e) { res.status(500).json({ message: 'Failed to record consent' }); }
  });

  app.get('/api/gdpr/consent/subject/:subjectId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const list = await consentService.getSubjectConsents(user.organizationId, req.params.subjectId);
      res.json(list);
    } catch (e) { res.status(500).json({ message: 'Failed to fetch subject consents' }); }
  });
  app.get('/api/analytics/consent-coverage', isAuthenticated, async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      if (req.query.dp === '1') { const eps = parseFloat(String(req.query.epsilon || '1.0')); const rows = await analyticsService.getConsentCoverageDP(user.organizationId, eps); return res.json(rows); }
      const rows = await analyticsService.getConsentCoverage(user.organizationId); res.json(rows);
    } catch (e) { res.status(500).json({ message: 'Failed to fetch consent coverage' }); }
  });
  app.get('/api/analytics/training-status', isAuthenticated, async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      if (req.query.dp === '1') { const eps = parseFloat(String(req.query.epsilon || '1.0')); const r = await analyticsService.getTrainingStatusDP(user.organizationId, eps); return res.json(r); }
      const r = await analyticsService.getTrainingStatus(user.organizationId); res.json(r);
    } catch (e) { res.status(500).json({ message: 'Failed to fetch training status' }); }
  });
  app.get('/api/analytics/hs-incidents', isAuthenticated, async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' }); const r = await analyticsService.getHsIncidentSummary(user.organizationId); res.json(r); } catch (e) { res.status(500).json({ message: 'Failed to fetch incident summary' }); }
  });

  // Breach incidents & notifications
  app.post('/api/gdpr/incidents', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub; const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const out = await breachService.createIncident({ organizationId: user.organizationId, ...req.body });
      try { await queueOutboxEvent({ organizationId: user.organizationId, topic: 'incident.created', payload: { id: out.id } }); } catch {}
      res.status(201).json(out);
    } catch (e) { res.status(500).json({ message: 'Failed to create incident' }); }
  });
  app.post('/api/gdpr/breach/:id/submit', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub; const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      await breachService.submitNotification({ organizationId: user.organizationId, id: req.params.id, content: req.body?.content || '' });
      try { await queueOutboxEvent({ organizationId: user.organizationId, topic: 'breach.submitted', payload: { id: req.params.id } }); } catch {}
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: 'Failed to submit breach' }); }
  });
  app.post('/api/gdpr/breach/rules', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const { regulator, deadlineHours, template } = req.body || {}; if (!regulator || !deadlineHours) return res.status(400).json({ message: 'regulator and deadlineHours required' }); const r = await breachRulesService.upsertRule({ regulator, deadlineHours, template }); res.status(201).json(r); } catch (e) { res.status(500).json({ message: 'Failed to upsert rule' }); }
  });

  // Health & Safety
  app.post('/api/hs/risk-assessments', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub; const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const out = await hsService.createRiskAssessment({ organizationId: user.organizationId, ...req.body });
      res.status(201).json(out);
    } catch (e) { res.status(500).json({ message: 'Failed to create risk assessment' }); }
  });
  app.post('/api/hs/risk-assessments/:id/findings', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { await hsService.addRiskFinding({ assessmentId: req.params.id, ...req.body }); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: 'Failed to add finding' }); }
  });
  app.post('/api/hs/incidents', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub; const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const out = await hsService.reportIncident({ organizationId: user.organizationId, ...req.body });
      res.status(201).json(out);
    } catch (e) { res.status(500).json({ message: 'Failed to report incident' }); }
  });
  app.post('/api/hs/trainings', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' }); const out = await hsService.createTraining({ organizationId: user.organizationId, ...req.body }); res.status(201).json(out); } catch (e) { res.status(500).json({ message: 'Failed to create training' }); }
  });
  app.post('/api/hs/trainings/:id/assign', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { const out = await hsService.assignTraining({ trainingId: req.params.id, userId: req.body?.userId, dueAt: req.body?.dueAt }); res.json(out); } catch (e) { res.status(500).json({ message: 'Failed to assign' }); }
  });
  app.post('/api/hs/assignments/:id/complete', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { await hsService.completeTraining({ assignmentId: req.params.id, score: req.body?.score }); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: 'Failed to complete' }); }
  });

  // Data mapping & PIA & Templates
  app.post('/api/data/assets', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' }); const out = await dataMappingService.upsertAsset({ organizationId: user.organizationId, ...req.body }); res.status(201).json(out); } catch (e) { res.status(500).json({ message: 'Failed to upsert asset' }); }
  });
  app.post('/api/data/assets/:id/map', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' }); const hits = await dataMappingService.mapAssetToRegulatoryNodes({ organizationId: user.organizationId, assetId: req.params.id, description: req.body?.description || '' }); res.json(hits); } catch (e) { res.status(500).json({ message: 'Failed to map asset' }); }
  });
  app.post('/api/gdpr/pia/generate', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' }); const out = await piaService.generate({ organizationId: user.organizationId, title: req.body?.title || 'PIA', context: req.body?.context || {} }); res.status(201).json(out); } catch (e) { res.status(500).json({ message: 'Failed to generate PIA' }); }
  });
  app.post('/api/policy-templates', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); const out = await policyTemplateService.createTemplate({ organizationId: user?.organizationId || undefined, title: req.body?.title, content: req.body?.content, framework: req.body?.framework, version: req.body?.version, isGlobal: !!req.body?.isGlobal }); res.status(201).json(out); } catch (e) { res.status(500).json({ message: 'Failed to create template' }); }
  });
  app.get('/api/policy-templates', isAuthenticated, async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); const list = await policyTemplateService.listTemplates(user?.organizationId || undefined); res.json(list); } catch (e) { res.status(500).json({ message: 'Failed to list templates' }); }
  });

  // DSAR
  app.post('/api/dsar/requests', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' }); const out = await dsarService.openRequest({ organizationId: user.organizationId, subjectId: req.body?.subjectId }); try { await queueOutboxEvent({ organizationId: user.organizationId, topic: 'dsar.opened', payload: out }); } catch {}; res.status(201).json(out); } catch (e) { res.status(500).json({ message: 'Failed to open DSAR' }); }
  });
  app.post('/api/dsar/requests/:id/gather', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' }); const n = await dsarService.gatherFromPolicyDocuments({ organizationId: user.organizationId, requestId: req.params.id }); res.json({ gathered: n }); } catch (e) { res.status(500).json({ message: 'Failed to gather DSAR items' }); }
  });
  app.post('/api/dsar/items/:itemId/redact', isAuthenticated, requireRoles('editor'), async (_req: any, res) => {
    try { await dsarService.redactItem(_req.params.itemId); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: 'Failed to redact item' }); }
  });
  app.post('/api/dsar/requests/:id/close', isAuthenticated, requireRoles('editor'), async (_req: any, res) => {
    try { await dsarService.closeRequest(_req.params.id); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: 'Failed to close DSAR' }); }
  });
  app.post('/api/dsar/requests/:id/verify', async (req: any, res) => {
    try { const ok = await dsarService.verifySubject({ requestId: req.params.id, token: req.body?.token || '' }); if (!ok) return res.status(400).json({ message: 'Invalid or expired token' }); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: 'Failed to verify DSAR' }); }
  });
  app.post('/api/dsar/requests/:id/export', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { const out = await dsarService.exportPackage({ requestId: req.params.id }); res.json(out); } catch (e) { res.status(500).json({ message: 'Failed to export DSAR' }); }
  });

  // Policy drift
  app.post('/api/policies/:id/drift/compute', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { const out = await policyDriftService.computeForDocument({ policyDocumentId: req.params.id, baselineTemplateId: req.body?.baselineTemplateId }); res.json(out); } catch (e) { res.status(500).json({ message: 'Failed to compute drift' }); }
  });
  app.get('/api/policies/:id/drift', isAuthenticated, async (req: any, res) => {
    try { const out = await policyDriftService.latest(req.params.id); if (!out) return res.status(404).json({ message: 'Not found' }); res.json(out); } catch (e) { res.status(500).json({ message: 'Failed to get drift' }); }
  });

  // Retention
  app.post('/api/retention/consent-expiry/run', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' }); const job = await retentionService.startJob(user.organizationId, 'consent_expiry'); const out = await retentionService.runConsentExpiry(user.organizationId, job.jobId); res.json({ jobId: job.jobId, ...out }); } catch (e) { res.status(500).json({ message: 'Failed to run retention' }); }
  });
  app.post('/api/admin/retention/scan-all', isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const rows: any = await db.execute(sql`select id from organizations limit 500` as any);
      let total = 0;
      for (const r of (rows?.rows ?? [])) {
        try { const out = await retentionService.runConsentExpiry(r.id); total += out.purged; } catch {}
      }
      res.json({ purged: total });
    } catch (e) { res.status(500).json({ message: 'Failed to scan retention' }); }
  });

  // Evidence collectors
  app.post('/api/collectors', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' }); const out = await collectorsService.createCollector({ organizationId: user.organizationId, name: req.body?.name, type: req.body?.type, config: req.body?.config || {} }); res.status(201).json(out); } catch (e) { res.status(500).json({ message: 'Failed to create collector' }); }
  });
  app.get('/api/collectors', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const rows: any = await db.execute(sql`select id, organization_id, name, type, created_at from collectors order by created_at desc limit 200` as any); res.json(rows?.rows ?? []); } catch (e) { res.status(500).json({ message: 'Failed to list collectors' }); }
  });
  app.post('/api/collectors/:id/run', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const out = await collectorsService.runCollector({ collectorId: req.params.id }); res.json(out); } catch (e) { res.status(500).json({ message: 'Failed to run collector' }); }
  });
  app.post('/api/collectors/run-all', isAuthenticated, isAdmin, async (_req: any, res) => {
    try { const rows: any = await db.execute(sql`select id from collectors limit 200` as any); let total = 0; for (const r of (rows?.rows ?? [])) { try { const out = await collectorsService.runCollector({ collectorId: r.id }); total += out.items; } catch {} } res.json({ items: total }); } catch (e) { res.status(500).json({ message: 'Failed to run all collectors' }); }
  });

  // Data Sources (DSN catalog)
  app.post('/api/dsn/sources', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' }); const out = await dsnService.createSource({ organizationId: user.organizationId, name: req.body?.name, type: req.body?.type, config: req.body?.config || {} }); res.status(201).json(out); } catch (e) { res.status(500).json({ message: 'Failed to create data source' }); }
  });
  app.get('/api/dsn/sources', isAuthenticated, async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' }); const list = await dsnService.listSources(user.organizationId); res.json(list); } catch (e) { res.status(500).json({ message: 'Failed to list data sources' }); }
  });
  app.post('/api/dsn/sources/:id/discover', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const url = req.body?.url; const headers = req.body?.headers || {};
      if (!url) return res.status(400).json({ message: 'url required' });
      const out = await dsnDiscoveryService.runHttpJsonDiscovery({ organizationId: user.organizationId, sourceId: req.params.id, url, headers });
      res.json(out);
    } catch (e) { res.status(500).json({ message: 'Failed to run discovery' }); }
  });

  // Index advisor
  app.post('/api/admin/index-advisor/explain', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const plan = await indexAdvisorService.explain(String(req.body?.query || 'select 1')); res.json({ plan }); } catch (e) { res.status(500).json({ message: 'Failed to explain' }); }
  });
  app.post('/api/admin/index-advisor/suggest', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const out = await indexAdvisorService.suggest(String(req.body?.query || '')); res.json(out); } catch (e) { res.status(500).json({ message: 'Failed to suggest' }); }
  });
  app.post('/api/admin/index-advisor/baseline', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const name = String(req.body?.name || 'baseline'); const query = String(req.body?.query || 'select 1'); const plan = await indexAdvisorService.explain(query); await indexAdvisorService.saveBaseline({ name, query, planText: plan }); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: 'Failed to baseline' }); }
  });
  app.post('/api/admin/index-advisor/check', isAuthenticated, isAdmin, async (req: any, res) => {
    try { const name = String(req.body?.name || 'baseline'); const query = String(req.body?.query || 'select 1'); const r = await indexAdvisorService.checkRegression({ name, query }); res.json(r); } catch (e) { res.status(500).json({ message: 'Failed to check regression' }); }
  });

  // Simulation sandbox
  app.post('/api/simulation/policy', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try { const userId = req.user.claims.sub; const user = await storage.getUser(userId); if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' }); const out = await simulationService.simulatePolicy({ organizationId: user.organizationId, policyText: req.body?.policyText || '', baseRegulationId: req.body?.regulationId, extraRules: req.body?.extraRules || [] }); res.json(out); } catch (e) { res.status(500).json({ message: 'Failed to simulate policy' }); }
  });

  // Public consent intake (org API key header X-Org-Key expected to resolve org)
  app.post('/api/public/consent', async (req: any, res) => {
    try {
      const orgKey = req.headers['x-org-key'];
      if (!orgKey || typeof orgKey !== 'string') return res.status(401).json({ message: 'Missing org key' });
      // Simple resolve via storage (assuming API keys stored on orgs)
      const org = await db.execute(sql`select id from organizations where api_key = ${orgKey}` as any);
      const orgId = ((org as any)?.rows?.[0]?.id) as string | undefined;
      if (!orgId) return res.status(401).json({ message: 'Invalid org key' });
      const out = await handlePublicConsentIntake({ orgId, body: req.body || {} });
      res.status(201).json(out);
    } catch (e) { res.status(500).json({ message: 'Failed to intake consent' }); }
  });

  app.get('/api/gov/evidence', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const { reportId, taskId } = req.query as { reportId?: string; taskId?: string };
      const result: any = await withUserOrganization({ userId, organizationId: user.organizationId }, async (dbc) => dbc.execute(sql`
        select * from evidence_items
        where organization_id = ${user.organizationId}::uuid
          ${reportId ? sql`and report_id = ${reportId}::uuid` : sql``}
          ${taskId ? sql`and task_id = ${taskId}::uuid` : sql``}
        order by created_at desc limit 200
      `));
      res.json(result?.rows ?? []);
    } catch (err) {
      console.error('Error fetching evidence:', err);
      res.status(500).json({ message: 'Failed to fetch evidence' });
    }
  });

  app.post('/api/gov/attestations', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const { name, description, dueDate } = req.body || {};
      const result: any = await db.execute(sql`
        insert into attestation_campaigns (organization_id, name, description, due_date, created_by)
        values (${user.organizationId}::uuid, ${name}, ${description || null}, ${dueDate || null}, ${userId})
        returning *
      `);
      res.status(201).json((result?.rows ?? [])[0] || {});
    } catch (err) {
      console.error('Error creating attestation campaign:', err);
      res.status(500).json({ message: 'Failed to create attestation campaign' });
    }
  });

  app.post('/api/gov/attestations/:campaignId/assign', isAuthenticated, requireRoles('editor'), async (req: any, res) => {
    try {
      const { campaignId } = req.params;
      const { userId: targetUser } = req.body || {};
      const result: any = await db.execute(sql`insert into attestation_assignments (campaign_id, user_id) values (${campaignId}::uuid, ${targetUser}) returning *`);
      res.status(201).json((result?.rows ?? [])[0] || {});
    } catch (err) {
      console.error('Error assigning attestation:', err);
      res.status(500).json({ message: 'Failed to assign attestation' });
    }
  });

  // Big Bets endpoints
  app.post('/api/bets/scenario/run', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const { name, hypothesis } = req.body || {};
      if (!name) return res.status(400).json({ message: 'name required' });
      const out = await scenarioService.runScenario({ organizationId: user.organizationId, name, hypothesis });
      res.json(out);
    } catch (e) {
      res.status(500).json({ message: 'Failed to run scenario' });
    }
  });

  app.get('/api/bets/scenario/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const { id } = req.params;
      const scenario = await scenarioService.getScenario(user.organizationId, id);
      if (!scenario) return res.status(404).json({ message: 'Not found' });
      res.json(scenario);
    } catch (e) {
      res.status(500).json({ message: 'Failed to fetch scenario' });
    }
  });

  app.post('/api/bets/feedback', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const { reportId, analysisId, label, rationale } = req.body || {};
      if (!label) return res.status(400).json({ message: 'label required' });
      await activeLearningService.recordFeedback({ organizationId: user.organizationId, reportId, analysisId, label, rationale });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: 'Failed to record feedback' });
    }
  });

  app.post('/api/bets/models/register', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const { provider, baseModel, modelName, datasetRef, organizationId } = req.body || {};
      if (!provider || !baseModel || !modelName) return res.status(400).json({ message: 'provider, baseModel, modelName required' });
      const orgId = organizationId || user?.organizationId || null;
      const result: any = await db.execute(sql`
        insert into finetuned_models (organization_id, provider, base_model, model_name, dataset_ref)
        values (${orgId}, ${provider}, ${baseModel}, ${modelName}, ${datasetRef || null})
        returning id
      ` as any);
      res.json({ id: (result?.rows?.[0]?.id) || (result as any)?.id });
    } catch (e) {
      res.status(500).json({ message: 'Failed to register model' });
    }
  });

  app.post('/api/bets/framework/map', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) return res.status(400).json({ message: 'User must belong to an organization' });
      const { frameworkName, controls } = req.body || {};
      if (!frameworkName || !Array.isArray(controls)) return res.status(400).json({ message: 'frameworkName and controls[] required' });
      const out = await frameworkMappingService.mapControls({ organizationId: user.organizationId, frameworkName, controls, topK: 3, persist: true });
      res.json(out);
    } catch (e) {
      res.status(500).json({ message: 'Failed to map controls' });
    }
  });

  app.post('/api/admin/synthetic-checks/run', isAuthenticated, isAdmin, async (_req: any, res) => {
    try { const r = await runSyntheticChecks(); res.json(r); } catch (e) { res.status(500).json({ message: 'Failed to run checks' }); }
  });

  let httpServer: Server;
  if (process.env.USE_HTTPS === '1' && process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
    try {
      const opts: any = {
        key: fs.readFileSync(process.env.SSL_KEY_PATH),
        cert: fs.readFileSync(process.env.SSL_CERT_PATH),
      };
      if (process.env.SSL_CA_PATH) opts.ca = fs.readFileSync(process.env.SSL_CA_PATH);
      if (process.env.REQUIRE_CLIENT_CERT === '1') {
        opts.requestCert = true;
        opts.rejectUnauthorized = true;
      }
      httpServer = https.createServer(opts, app) as unknown as Server;
    } catch (e) {
      console.warn('HTTPS setup failed, falling back to HTTP:', (e as any)?.message || e);
      httpServer = createHttpServer(app);
    }
  } else {
    httpServer = createHttpServer(app);
  }
  return httpServer;
}
