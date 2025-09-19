import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  uuid,
  boolean,
  real,
  integer,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table - mandatory for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - mandatory for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  organizationId: uuid("organization_id").references(() => organizations.id),
  role: varchar("role").notNull().default("member"), // 'admin', 'member'
  department: text("department"),
  dataDomains: text("data_domains").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Organizations
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Policy Documents
export const policyDocuments = pgTable("policy_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  title: varchar("title", { length: 255 }).notNull(),
  originalFilename: varchar("original_filename", { length: 255 }),
  storagePath: varchar("storage_path", { length: 1024 }).notNull(),
  extractedText: text("extracted_text"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

// Regulations (managed by internal team)
export const regulations = pgTable("regulations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(), // e.g., "CCPA"
  fullName: varchar("full_name", { length: 500 }), // e.g., "California Consumer Privacy Act"
  description: text("description"),
  jurisdiction: varchar("jurisdiction", { length: 100 }), // e.g., "California"
  effectiveDate: timestamp("effective_date"),
  version: varchar("version", { length: 50 }),
  isActive: boolean("is_active").default(true),
  lastUpdatedBy: varchar("last_updated_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Regulation Clauses
export const regulationClauses = pgTable("regulation_clauses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  regulationId: uuid("regulation_id").notNull().references(() => regulations.id),
  clauseIdentifier: varchar("clause_identifier", { length: 100 }).notNull(), // e.g., "Section 1798.110"
  clauseText: text("clause_text").notNull(),
  lastUpdatedBy: varchar("last_updated_by", { length: 255 }),
});

// Compliance Reports Status
export const reportStatusEnum = pgEnum("report_status", ["pending", "processing", "completed", "failed"]);

export const complianceReports = pgTable("compliance_reports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  policyDocumentId: uuid("policy_document_id").notNull().references(() => policyDocuments.id),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  status: reportStatusEnum("status").notNull().default("pending"),
  overallScore: real("overall_score"), // 0-100
  gapCount: real("gap_count").default(0),
  riskLevel: varchar("risk_level", { length: 50 }), // 'Low', 'Medium', 'High'
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Analysis Results
export const analysisResults = pgTable("analysis_results", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid("report_id").notNull().references(() => complianceReports.id),
  policyChunkText: text("policy_chunk_text"),
  matchedRegulationClauseId: uuid("matched_regulation_clause_id").references(() => regulationClauses.id),
  complianceScore: real("compliance_score"), // 0-1
  summary: text("summary"),
  suggestedWording: text("suggested_wording"),
  riskLevel: varchar("risk_level", { length: 50 }), // 'Low', 'Medium', 'High'
  createdAt: timestamp("created_at").defaultNow(),
});

// Policy Document Versions - Track changes over time
export const policyDocumentVersions = pgTable("policy_document_versions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  policyDocumentId: uuid("policy_document_id").notNull().references(() => policyDocuments.id),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  versionNumber: varchar("version_number", { length: 50 }).notNull(), // e.g., "1.0", "1.1", "2.0"
  title: varchar("title", { length: 255 }).notNull(),
  originalFilename: varchar("original_filename", { length: 255 }),
  storagePath: varchar("storage_path", { length: 1024 }).notNull(),
  extractedText: text("extracted_text"),
  changeDescription: text("change_description"), // What changed in this version
  uploadedBy: varchar("uploaded_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Compliance Trends - Historical compliance metrics over time
export const complianceTrends = pgTable("compliance_trends", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  policyDocumentId: uuid("policy_document_id").notNull().references(() => policyDocuments.id),
  regulationId: uuid("regulation_id").notNull().references(() => regulations.id),
  complianceReportId: uuid("compliance_report_id").notNull().references(() => complianceReports.id),
  overallScore: real("overall_score").notNull(), // 0-100
  gapCount: integer("gap_count").default(0),
  riskLevel: varchar("risk_level", { length: 50 }).notNull(),
  businessImpactScore: real("business_impact_score"), // From risk assessment
  regulatoryRiskScore: real("regulatory_risk_score"), // From risk assessment
  priorityRanking: integer("priority_ranking"), // 1-5, 1 being highest priority
  remediationUrgency: varchar("remediation_urgency", { length: 50 }), // 'Immediate', 'Within 30 days', etc.
  measurementDate: timestamp("measurement_date").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Compliance Improvements - Track specific improvements made
export const complianceImprovements = pgTable("compliance_improvements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  policyDocumentId: uuid("policy_document_id").notNull().references(() => policyDocuments.id),
  regulationClauseId: uuid("regulation_clause_id").notNull().references(() => regulationClauses.id),
  improvementType: varchar("improvement_type", { length: 100 }), // 'policy_update', 'process_change', 'training'
  description: text("description").notNull(),
  beforeScore: real("before_score"), // Compliance score before improvement
  afterScore: real("after_score"), // Compliance score after improvement
  implementedBy: varchar("implemented_by", { length: 255 }),
  implementedAt: timestamp("implemented_at").defaultNow(),
  verifiedAt: timestamp("verified_at"),
  status: varchar("status", { length: 50 }).default("implemented"), // 'planned', 'implemented', 'verified'
  createdAt: timestamp("created_at").defaultNow(),
});

// Compliance Calendar Events - Persistent calendar
export const complianceCalendarEvents = pgTable(
  "compliance_calendar_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    assignedTo: varchar("assigned_to", { length: 255 }),
    title: varchar("title", { length: 255 }).notNull(),
    type: varchar("type", { length: 50 }).notNull(), // 'deadline' | 'renewal' | 'review' | 'training' | 'audit'
    date: timestamp("date").notNull(),
    priority: varchar("priority", { length: 20 }).notNull().default("medium"), // 'low'|'medium'|'high'|'critical'
    description: text("description"),
    relatedPolicyId: uuid("related_policy_id").references(() => policyDocuments.id),
    relatedReportId: uuid("related_report_id").references(() => complianceReports.id),
    status: varchar("status", { length: 20 }).notNull().default("upcoming"), // 'upcoming'|'due'|'overdue'|'completed'
    reminderDays: integer("reminder_days").array(),
    completedAt: timestamp("completed_at"),
    completedBy: varchar("completed_by", { length: 255 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("IDX_calendar_org_date").on(table.organizationId, table.date),
    uniqueIndex("UX_calendar_dedupe").on(
      table.organizationId,
      table.type,
      table.title,
      table.date,
      table.relatedPolicyId,
      table.relatedReportId
    ),
  ],
);

// Industry Benchmarks - Store peer comparison data
export const industryBenchmarks = pgTable("industry_benchmarks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  industry: varchar("industry", { length: 100 }).notNull(), // 'Technology', 'Healthcare', 'Finance'
  companySize: varchar("company_size", { length: 50 }), // 'Small', 'Medium', 'Large'
  regulationId: uuid("regulation_id").notNull().references(() => regulations.id),
  averageComplianceScore: real("average_compliance_score").notNull(), // Industry average
  medianComplianceScore: real("median_compliance_score"),
  topQuartileScore: real("top_quartile_score"), // 75th percentile
  bottomQuartileScore: real("bottom_quartile_score"), // 25th percentile
  averageGapCount: real("average_gap_count"),
  commonRiskAreas: text("common_risk_areas").array(), // JSON array of common issues
  benchmarkPeriod: varchar("benchmark_period", { length: 50 }), // 'Q1 2024', 'Annual 2023'
  sampleSize: integer("sample_size"), // Number of companies in benchmark
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Predictive Risk Models - Store ML model predictions
export const predictiveRiskModels = pgTable("predictive_risk_models", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  modelType: varchar("model_type", { length: 100 }).notNull(), // 'compliance_deterioration', 'gap_emergence'
  targetRegulationId: uuid("target_regulation_id").references(() => regulations.id),
  predictionHorizon: varchar("prediction_horizon", { length: 50 }), // '30_days', '90_days', '1_year'
  currentScore: real("current_score"),
  predictedScore: real("predicted_score"),
  confidenceLevel: real("confidence_level"), // 0-1, prediction confidence
  riskFactors: jsonb("risk_factors"), // JSON of contributing factors
  recommendedActions: text("recommended_actions").array(),
  predictionDate: timestamp("prediction_date").defaultNow(),
  validUntil: timestamp("valid_until"),
  modelVersion: varchar("model_version", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Analytics Metrics - Store calculated analytics for dashboard
export const analyticsMetrics = pgTable("analytics_metrics", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  metricType: varchar("metric_type", { length: 100 }).notNull(), // 'trend_slope', 'improvement_velocity', 'risk_acceleration'
  regulationId: uuid("regulation_id").references(() => regulations.id),
  policyType: varchar("policy_type", { length: 100 }), // 'privacy', 'hr', 'safety'
  businessUnit: varchar("business_unit", { length: 100 }), // For comparative analysis
  metricValue: real("metric_value").notNull(),
  metricContext: jsonb("metric_context"), // Additional context data
  calculationPeriod: varchar("calculation_period", { length: 50 }), // 'last_30_days', 'quarterly'
  lastCalculated: timestamp("last_calculated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Executive Reports - Store generated executive reports
export const executiveReports = pgTable("executive_reports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  reportType: varchar("report_type", { length: 100 }).notNull(), // 'board_summary', 'quarterly_review', 'risk_assessment'
  title: varchar("title", { length: 255 }).notNull(),
  executiveSummary: text("executive_summary"), // AI-generated executive summary
  keyInsights: text("key_insights").array(), // Array of key insights
  kpiData: jsonb("kpi_data"), // KPI metrics and values
  complianceScore: real("compliance_score"), // Overall compliance score
  riskLevel: varchar("risk_level", { length: 50 }), // 'Low', 'Medium', 'High'
  priorityActions: text("priority_actions").array(), // Critical actions needed
  trendAnalysis: jsonb("trend_analysis"), // Trend data and analysis
  benchmarkComparison: jsonb("benchmark_comparison"), // Industry benchmark data
  reportPeriod: varchar("report_period", { length: 100 }), // 'Q1 2024', 'January 2024'
  generatedBy: varchar("generated_by", { length: 255 }), // User who generated the report
  scheduledDelivery: boolean("scheduled_delivery").default(false),
  deliveryFrequency: varchar("delivery_frequency", { length: 50 }), // 'monthly', 'quarterly', 'annual'
  recipients: text("recipients").array(), // Email addresses for distribution
  pdfPath: varchar("pdf_path", { length: 1024 }), // Path to generated PDF
  exportedAt: timestamp("exported_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// KPI Dashboards - Customizable dashboard configurations
export const kpiDashboards = pgTable("kpi_dashboards", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  stakeholderType: varchar("stakeholder_type", { length: 100 }), // 'board', 'executive', 'compliance_team', 'legal'
  layout: jsonb("layout"), // Dashboard layout configuration
  kpiMetrics: jsonb("kpi_metrics"), // Selected KPI metrics and their configurations
  refreshFrequency: varchar("refresh_frequency", { length: 50 }), // 'real_time', 'daily', 'weekly'
  accessLevel: varchar("access_level", { length: 50 }).default("organization"), // 'organization', 'department', 'individual'
  isDefault: boolean("is_default").default(false),
  createdBy: varchar("created_by", { length: 255 }),
  lastModified: timestamp("last_modified").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Report Schedules - Automated report delivery schedules
export const reportSchedules = pgTable("report_schedules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  reportType: varchar("report_type", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  frequency: varchar("frequency", { length: 50 }).notNull(), // 'daily', 'weekly', 'monthly', 'quarterly'
  dayOfWeek: integer("day_of_week"), // 0-6 for weekly reports
  dayOfMonth: integer("day_of_month"), // 1-31 for monthly reports
  time: varchar("time", { length: 10 }), // 'HH:MM' format
  recipients: text("recipients").array().notNull(), // Email addresses
  includeAttachments: boolean("include_attachments").default(true),
  filters: jsonb("filters"), // Report filters and parameters
  isActive: boolean("is_active").default(true),
  nextRunDate: timestamp("next_run_date"),
  lastRunDate: timestamp("last_run_date"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Business Intelligence Exports - Track BI tool integrations
export const biExports = pgTable("bi_exports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  exportType: varchar("export_type", { length: 100 }).notNull(), // 'tableau', 'powerbi', 'looker', 'csv', 'json'
  dataSource: varchar("data_source", { length: 100 }), // 'compliance_trends', 'kpi_metrics', 'executive_summary'
  exportPath: varchar("export_path", { length: 1024 }),
  exportFormat: varchar("export_format", { length: 50 }), // 'csv', 'json', 'xml', 'parquet'
  dataSchema: jsonb("data_schema"), // Schema definition for the exported data
  lastExported: timestamp("last_exported"),
  recordCount: integer("record_count"),
  isScheduled: boolean("is_scheduled").default(false),
  scheduleFrequency: varchar("schedule_frequency", { length: 50 }),
  apiEndpoint: varchar("api_endpoint", { length: 500 }), // For API-based exports
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Regulatory Sources - Track sources for regulatory updates
export const regulatorySources = pgTable("regulatory_sources", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 100 }).notNull(), // 'UK', 'EU', 'US', 'Global'
  sourceType: varchar("source_type", { length: 100 }).notNull(), // 'government', 'regulator', 'legal_publisher', 'api'
  baseUrl: varchar("base_url", { length: 1024 }).notNull(),
  crawlConfig: jsonb("crawl_config"), // Configuration for crawling this source
  selectors: jsonb("selectors"), // CSS selectors for extracting content
  updateFrequency: varchar("update_frequency", { length: 50 }).default("daily"), // 'hourly', 'daily', 'weekly'
  isActive: boolean("is_active").default(true),
  lastCrawled: timestamp("last_crawled"),
  nextCrawl: timestamp("next_crawl"),
  reliability: real("reliability").default(1.0), // 0.0 to 1.0 reliability score
  priority: integer("priority").default(5), // 1-10 priority level
  tags: text("tags").array(), // Tags for categorization
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Regulatory Updates - Store detected regulatory changes
export const regulatoryUpdates = pgTable("regulatory_updates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: uuid("source_id").notNull().references(() => regulatorySources.id),
  regulationId: uuid("regulation_id").references(() => regulations.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  content: text("content"), // Full content of the update
  updateType: varchar("update_type", { length: 100 }), // 'amendment', 'new_regulation', 'guidance', 'consultation'
  effectiveDate: timestamp("effective_date"),
  publishedDate: timestamp("published_date"),
  sourceUrl: varchar("source_url", { length: 1024 }),
  documentUrl: varchar("document_url", { length: 1024 }),
  status: varchar("status", { length: 50 }).default("pending"), // 'pending', 'reviewed', 'implemented', 'ignored'
  impact: varchar("impact", { length: 50 }), // 'low', 'medium', 'high', 'critical'
  affectedSections: text("affected_sections").array(), // Sections of regulation affected
  keywords: text("keywords").array(), // Extracted keywords
  confidence: real("confidence").default(1.0), // AI confidence in the detection
  reviewedBy: varchar("reviewed_by", { length: 255 }),
  reviewedAt: timestamp("reviewed_at"),
  implementedAt: timestamp("implemented_at"),
  metadata: jsonb("metadata"), // Additional metadata from crawling
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Crawler Jobs - Track crawling execution
export const crawlerJobs = pgTable("crawler_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: uuid("source_id").notNull().references(() => regulatorySources.id),
  jobType: varchar("job_type", { length: 50 }).notNull(), // 'scheduled', 'manual', 'retry'
  status: varchar("status", { length: 50 }).default("pending"), // 'pending', 'running', 'completed', 'failed', 'cancelled'
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  updatesFound: integer("updates_found").default(0),
  newUpdates: integer("new_updates").default(0),
  errorMessage: text("error_message"),
  executionTime: integer("execution_time"), // Milliseconds
  pagesScraped: integer("pages_scraped").default(0),
  dataExtracted: jsonb("data_extracted"), // Summary of extracted data
  createdAt: timestamp("created_at").defaultNow(),
});

// Regulatory Notifications - Track notifications for regulatory updates
export const regulatoryNotifications = pgTable("regulatory_notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  updateId: uuid("update_id").notNull().references(() => regulatoryUpdates.id),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  notificationType: varchar("notification_type", { length: 50 }).notNull(), // 'email', 'in_app', 'webhook'
  recipients: text("recipients").array(), // Email addresses or user IDs
  subject: varchar("subject", { length: 255 }),
  message: text("message"),
  status: varchar("status", { length: 50 }).default("pending"), // 'pending', 'sent', 'delivered', 'failed'
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  metadata: jsonb("metadata"), // Additional notification metadata
  createdAt: timestamp("created_at").defaultNow(),
});

// Update Impact Assessment - Assess impact of regulatory updates on organizations
export const updateImpactAssessments = pgTable("update_impact_assessments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  updateId: uuid("update_id").notNull().references(() => regulatoryUpdates.id),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  impactLevel: varchar("impact_level", { length: 50 }), // 'none', 'low', 'medium', 'high', 'critical'
  affectedPolicies: text("affected_policies").array(), // Policy document IDs
  requiredActions: text("required_actions").array(), // Actions needed for compliance
  estimatedEffort: integer("estimated_effort"), // Hours of work estimated
  complianceGaps: text("compliance_gaps").array(), // Identified gaps
  recommendations: text("recommendations").array(), // AI-generated recommendations
  aiAnalysis: text("ai_analysis"), // Detailed AI analysis
  reviewStatus: varchar("review_status", { length: 50 }).default("pending"), // 'pending', 'in_review', 'approved', 'rejected'
  assignedTo: varchar("assigned_to", { length: 255 }), // User responsible for addressing
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Prompt refinement storage
export const promptVersions = pgTable("prompt_versions", {
  id: varchar("id").primaryKey(),
  promptType: varchar("prompt_type", { length: 100 }).notNull(),
  version: integer("version").notNull(),
  promptText: text("prompt_text").notNull(),
  performance: jsonb("performance"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const promptFeedback = pgTable("prompt_feedback", {
  id: varchar("id").primaryKey(),
  promptId: varchar("prompt_id").notNull().references(() => promptVersions.id),
  analysisId: varchar("analysis_id"),
  userFeedback: varchar("user_feedback", { length: 50 }).notNull(),
  specificIssues: text("specific_issues").array(),
  expectedOutput: text("expected_output"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  policyDocuments: many(policyDocuments),
  complianceReports: many(complianceReports),
}));

export const policyDocumentsRelations = relations(policyDocuments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [policyDocuments.organizationId],
    references: [organizations.id],
  }),
  complianceReports: many(complianceReports),
}));

export const regulationsRelations = relations(regulations, ({ many }) => ({
  regulationClauses: many(regulationClauses),
}));

export const regulationClausesRelations = relations(regulationClauses, ({ one, many }) => ({
  regulation: one(regulations, {
    fields: [regulationClauses.regulationId],
    references: [regulations.id],
  }),
  analysisResults: many(analysisResults),
}));

export const complianceReportsRelations = relations(complianceReports, ({ one, many }) => ({
  policyDocument: one(policyDocuments, {
    fields: [complianceReports.policyDocumentId],
    references: [policyDocuments.id],
  }),
  organization: one(organizations, {
    fields: [complianceReports.organizationId],
    references: [organizations.id],
  }),
  analysisResults: many(analysisResults),
}));

export const analysisResultsRelations = relations(analysisResults, ({ one }) => ({
  complianceReport: one(complianceReports, {
    fields: [analysisResults.reportId],
    references: [complianceReports.id],
  }),
  matchedRegulationClause: one(regulationClauses, {
    fields: [analysisResults.matchedRegulationClauseId],
    references: [regulationClauses.id],
  }),
}));

// Zod schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
});

export const insertPolicyDocumentSchema = createInsertSchema(policyDocuments).omit({
  id: true,
  uploadedAt: true,
});

export const insertComplianceReportSchema = createInsertSchema(complianceReports).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertAnalysisResultSchema = createInsertSchema(analysisResults).omit({
  id: true,
  createdAt: true,
});

export const insertComplianceTrendSchema = createInsertSchema(complianceTrends).omit({
  id: true,
  measurementDate: true,
  createdAt: true,
});

export const insertPolicyDocumentVersionSchema = createInsertSchema(policyDocumentVersions).omit({
  id: true,
  createdAt: true,
});

export const insertComplianceImprovementSchema = createInsertSchema(complianceImprovements).omit({
  id: true,
  implementedAt: true,
  createdAt: true,
});

export const insertRegulationSchema = createInsertSchema(regulations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRegulationClauseSchema = createInsertSchema(regulationClauses).omit({
  id: true,
});

export const insertIndustryBenchmarkSchema = createInsertSchema(industryBenchmarks).omit({
  id: true,
  lastUpdated: true,
  createdAt: true,
});

export const insertPredictiveRiskModelSchema = createInsertSchema(predictiveRiskModels).omit({
  id: true,
  predictionDate: true,
  createdAt: true,
});

export const insertAnalyticsMetricSchema = createInsertSchema(analyticsMetrics).omit({
  id: true,
  lastCalculated: true,
  createdAt: true,
});

export const insertExecutiveReportSchema = createInsertSchema(executiveReports).omit({
  id: true,
  exportedAt: true,
  createdAt: true,
});

export const insertKpiDashboardSchema = createInsertSchema(kpiDashboards).omit({
  id: true,
  lastModified: true,
  createdAt: true,
});

export const insertReportScheduleSchema = createInsertSchema(reportSchedules).omit({
  id: true,
  nextRunDate: true,
  lastRunDate: true,
  createdAt: true,
});

export const insertBiExportSchema = createInsertSchema(biExports).omit({
  id: true,
  lastExported: true,
  createdAt: true,
});

export const insertRegulatorySourceSchema = createInsertSchema(regulatorySources).omit({
  id: true,
  lastCrawled: true,
  nextCrawl: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRegulatoryUpdateSchema = createInsertSchema(regulatoryUpdates).omit({
  id: true,
  reviewedAt: true,
  implementedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCrawlerJobSchema = createInsertSchema(crawlerJobs).omit({
  id: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
});

export const insertRegulatoryNotificationSchema = createInsertSchema(regulatoryNotifications).omit({
  id: true,
  sentAt: true,
  deliveredAt: true,
  createdAt: true,
});

export const insertUpdateImpactAssessmentSchema = createInsertSchema(updateImpactAssessments).omit({
  id: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type PolicyDocument = typeof policyDocuments.$inferSelect;
export type InsertPolicyDocument = z.infer<typeof insertPolicyDocumentSchema>;
export type Regulation = typeof regulations.$inferSelect;
export type RegulationClause = typeof regulationClauses.$inferSelect;
export type ComplianceReport = typeof complianceReports.$inferSelect;
export type InsertComplianceReport = z.infer<typeof insertComplianceReportSchema>;
export type AnalysisResult = typeof analysisResults.$inferSelect;
export type InsertAnalysisResult = z.infer<typeof insertAnalysisResultSchema>;
export type ComplianceTrend = typeof complianceTrends.$inferSelect;
export type InsertComplianceTrend = z.infer<typeof insertComplianceTrendSchema>;
export type PolicyDocumentVersion = typeof policyDocumentVersions.$inferSelect;
export type InsertPolicyDocumentVersion = z.infer<typeof insertPolicyDocumentVersionSchema>;
export type ComplianceImprovement = typeof complianceImprovements.$inferSelect;
export type InsertComplianceImprovement = z.infer<typeof insertComplianceImprovementSchema>;
export type InsertRegulation = z.infer<typeof insertRegulationSchema>;
export type InsertRegulationClause = z.infer<typeof insertRegulationClauseSchema>;
export type IndustryBenchmark = typeof industryBenchmarks.$inferSelect;
export type InsertIndustryBenchmark = z.infer<typeof insertIndustryBenchmarkSchema>;
export type PredictiveRiskModel = typeof predictiveRiskModels.$inferSelect;
export type InsertPredictiveRiskModel = z.infer<typeof insertPredictiveRiskModelSchema>;
export type AnalyticsMetric = typeof analyticsMetrics.$inferSelect;
export type InsertAnalyticsMetric = z.infer<typeof insertAnalyticsMetricSchema>;
export type ExecutiveReport = typeof executiveReports.$inferSelect;
export type InsertExecutiveReport = z.infer<typeof insertExecutiveReportSchema>;
export type KpiDashboard = typeof kpiDashboards.$inferSelect;
export type InsertKpiDashboard = z.infer<typeof insertKpiDashboardSchema>;
export type ReportSchedule = typeof reportSchedules.$inferSelect;
export type InsertReportSchedule = z.infer<typeof insertReportScheduleSchema>;
export type BiExport = typeof biExports.$inferSelect;
export type InsertBiExport = z.infer<typeof insertBiExportSchema>;
export type RegulatorySource = typeof regulatorySources.$inferSelect;
export type InsertRegulatorySource = z.infer<typeof insertRegulatorySourceSchema>;
export type RegulatoryUpdate = typeof regulatoryUpdates.$inferSelect;
export type InsertRegulatoryUpdate = z.infer<typeof insertRegulatoryUpdateSchema>;
export type CrawlerJob = typeof crawlerJobs.$inferSelect;
export type InsertCrawlerJob = z.infer<typeof insertCrawlerJobSchema>;
export type RegulatoryNotification = typeof regulatoryNotifications.$inferSelect;
export type InsertRegulatoryNotification = z.infer<typeof insertRegulatoryNotificationSchema>;
export type UpdateImpactAssessment = typeof updateImpactAssessments.$inferSelect;
export type InsertUpdateImpactAssessment = z.infer<typeof insertUpdateImpactAssessmentSchema>;
