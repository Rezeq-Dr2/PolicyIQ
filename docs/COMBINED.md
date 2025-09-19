# ARCHITECTURE.md

(From docs/ARCHITECTURE.md)

# PolicyIQ Architecture (Updated)

This document describes the current system after recent hardening and fixes. It is honest to the codebase as-is.

## Overview
- Backend: Node/Express (TypeScript, ESM), Drizzle ORM (PostgreSQL), BullMQ (Redis), OpenAI, Puppeteer
- Frontend: React + Vite, TanStack Query, shadcn/ui
- Multi-tenancy: All tenant-owned data operations are scoped by `organizationId` (route and/or storage layer)
- Async jobs: BullMQ queue + worker for compliance analysis
- Search: Pinecone if configured; deterministic PostgreSQL FTS fallback
- Analytics: SQL-backed metrics persisted to `analytics_metrics`
- History: Compliance trends in `compliance_trends`
- Calendar: Persistent `compliance_calendar_events`
- Secrets: Fail-fast if env missing
- Tests: Jest + ts-jest in place for key services

## Data Model Highlights
- `users` (role, `organizationId`), `organizations`
- `policy_documents`, `compliance_reports`, `analysis_results`
- `regulations`, `regulation_clauses`
- `compliance_trends` (non-null `regulationId`), `compliance_improvements`
- `analytics_metrics`, `predictive_risk_models`
- Exec/BI: `executive_reports`, `kpi_dashboards`, `report_schedules`, `bi_exports`
- Regulatory ingestion: `regulatory_sources`, `regulatory_updates`, `crawler_jobs`, `regulatory_notifications`, `update_impact_assessments`
- Calendar: `compliance_calendar_events` with unique idempotency index
- Prompt management: `prompt_versions`, `prompt_feedback`

## Multi-Tenancy & Security
- Route-level guards load user, verify `organizationId`; per-resource checks confirm ownership before returning details (policies, reports, PDFs)
- Storage methods apply `organizationId` where appropriate; regulatory updates are org-scoped via join on `regulatory_notifications`
- RBAC middleware `requireRoles('viewer'|'editor'|'admin')` with hierarchy; write endpoints require `editor`, admin endpoints require `admin`
- Rate limiting: Redis-based org-level counters for upload endpoints

## Document Processing
- Unified enhanced processor supports: .docx (mammoth), .doc (python-docx via shell), .txt, .rtf (rtf-parser), .pdf (pdf-parse)
- AI-assisted cleaning for large/complex docs, basic normalization otherwise
- Upload endpoints only call the enhanced processor; type acceptance is centralized

## Analysis Pipeline
- Upload → extract text → create `policy_documents` & `compliance_reports(status=processing)` → enqueue BullMQ job → worker runs analyzer → `analysis_results` saved → historical trend attempt persisted → notifications/analytics updated
- Enhanced analyzers: general compliance and DPA2018-specialized
  - Enhanced DPA2018 analyzer implemented: ICO references (from gaps), UK checks (13 age, ICO fee, 72h breach, PECR), sector guidance detection + scoring, prioritized recommendations

## Vector Search
- `OPENAI_API_KEY` required; Pinecone initialized only if `PINECONE_API_KEY`
- Fallback: PostgreSQL full-text search on `regulation_clauses.clause_text`
- Hybrid search uses fallback if Pinecone fails; logs clearly

## Analytics
- Trends: group `compliance_trends`; compute slope, projected score, trend direction; persist metrics (`trend_slope`, `last_score`, predicted scores)
- Comparative: derives `policyTypes`/`businessUnits` from existing `analytics_metrics` if present; regulations comparison via SQL
- Predictive: slope-based forecasts and velocity; emerging risks from high-risk findings joined via clauses→regulations

## Executive Reporting
- Detailed/summary reports for orgs
- Clause coverage is computed by intersecting org-wide `analysis_results.matchedRegulationClauseId` with regulation clauses (replacing prior placeholder)
- Audit trail composed from uploads and completed analyses; improvement roadmap and actions are heuristic but consistent

## Historical Tracking
- On analysis completion, attempt to persist to `compliance_trends` (requires `regulationId` due to non-null schema)
- Current behavior: derive `regulationId` via `analysis_results.matchedRegulationClauseId -> regulation_clauses.regulationId`; if none derived, insertion risks failure (see Risks doc)
- History/suggestions functions provide simple but useful outputs

## Regulatory Crawler
- Sources: active records in `regulatory_sources`; due for crawling determined by `nextCrawl` or null
- Puppeteer-based crawls for sites (gov.uk, ico.org.uk, generic); API crawler hardened (JSON mapping, headers, validation)
- Deduplicate updates by `title|sourceUrl`; persist to `regulatory_updates` with `status=pending`
- Fan-out notifications to all orgs (read-scoped per-tenant)
- Reliability score nudged up/down per crawl outcome

## Compliance Calendar
- Generates renewal, review, deadlines (UK GDPR/GDPR), training, audits
- Persisted with unique idempotency; statuses computed at read-time (‘upcoming’, ‘due’, ‘overdue’, ‘completed’)
- Summary aggregates priority/type breakdowns and a simple health score

## Configuration & Secrets
- Fail-fast on: `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `SESSION_SECRET`, `REPLIT_DOMAINS`; `PINECONE_API_KEY` optional

## Testing
- Jest + ts-jest configured (ESM). Setup file seeds env to avoid fail-fast during unit tests
- Service tests:
  - Enhanced DPA2018 analyzer: UK checks and recs
  - Executive reporting: detailed report generation with storage/historical mocks
  - Compliance calendar: event generation/persistence idempotency with mocks
  - Regulatory crawler: missing source graceful handling; API parser hardened
  - Analytics: comparative analysis chain mocked

## Key Corrections Reflected
- Multi-tenancy scope hardened across routes/storage
- RBAC enforced per-route with role hierarchy
- Async analysis via BullMQ; uploads rate-limited per org
- Vector fallback implemented; Pinecone optional
- Analytics engine replaced heuristic/mocked logic with SQL-backed computations and persisted metrics
- Clause-level coverage replaces placeholder computations in executive reporting
- Doc processing unified; PDF support added
- Regulatory crawler API ingestion hardened
- Tests introduced for critical service flows

## Known Gaps (Current State)
- `compliance_trends.regulationId` is non-null. `historicalTracking.trackAnalysis` attempts to derive it; if not found, insert may fail. Options: guard insert, or relax schema to nullable and backfill later
- Default user role (`users.role` defaults to "member") vs RBAC roles (`viewer|editor|admin`). Map at upsert/login, or migrate default to `viewer`
- `.doc` extraction depends on python3 + python-docx availability in runtime

---

# FILEMAP.md

(From docs/FILEMAP.md)

# File Map

## Top-level
- `client/`: React frontend
- `server/`: Express backend
- `shared/`: Drizzle schema and shared types
- `docs/`: Documentation

## Server
- `server/index.ts`: App bootstrap, route registration, worker init
- `server/routes.ts`: All HTTP routes
- `server/db.ts`: Postgres/Drizzle setup, env fail-fast
- `server/storage.ts`: Data access layer with multi-tenancy scoping
- `server/rbac.ts`: Role middleware and `isAuthenticated`
- `server/replitAuth.ts`: OIDC session/auth integration
- `server/services/`
  - `analysisWorker.ts`: BullMQ worker
  - `queue.ts`: Queue/Redis setup
  - `enhancedComplianceAnalyzer.ts`: Main analyzer
  - `dpa2018ComplianceAnalyzer.ts`: DPA2018 analyzer
  - `enhancedDPA2018Analyzer.ts`: Enhanced DPA2018 analyzer (implemented)
  - `enhancedVectorDatabase.ts`: Pinecone/FTS fallback
  - `enhancedDocumentProcessor.ts`: DOC/DOCX/PDF/RTF/TXT processing
  - `documentProcessor.ts`: legacy processor (not used by routes)
  - `analyticsService.ts`: Trends, comparative, predictive
  - `executiveReporting.ts`: Exec reports (clause coverage)
  - `executiveReportingService.ts`: Exec report orchestration
  - `historicalTracking.ts`: Persist trends after analysis
  - `complianceCalendar.ts`: Persistent calendar
  - `regulatoryCrawler.ts`: Crawling and API ingestion
  - `notificationService.ts`: Notification hooks
  - `reportGenerator.ts`: PDF generation
  - `seedData.ts`, `seed/regulatoryCrawlerSeed.ts`: seed utilities
  - `healthSafetyComplianceAnalyzer.ts`: additional analyzer (not central)
  - `promptRefinementService.ts`: prompt selection logic
  - `riskAssessment.ts`: risk metrics helper
  - `vite.ts`: vite helper for server

## Shared
- `shared/schema.ts`: All tables, relations, zod insert schemas, exported types

## Client (selected)
- `client/src/pages/`: views like `Analytics.tsx`, `executive.tsx`, `regulatory.tsx`, `upload.tsx`, admin pages
- `client/src/hooks/useAuth.ts`: AuthUser typing and hook
- `client/src/lib/queryClient.ts`: fetch helpers and default queryFn
- `client/src/components/ui/`: shadcn components

## Docs
- `docs/ARCHITECTURE.md`: architecture overview (updated)
- `docs/FILEMAP.md`: this file
- `docs/RISKS.md`: residual risks and suggestions

---

# RISKS.md

(From docs/RISKS.md)

# Residual Risks and Recommendations

## Schema vs Logic
- `compliance_trends.regulationId` is non-null. `historicalTracking.trackAnalysis` attempts to derive it via matched clause; if none exists, insert may fail.
  - Recommendation: Guard insert (skip if unknown) or make column nullable and backfill when determinate.

## Roles
- `users.role` default is "member" while RBAC expects `viewer|editor|admin`.
  - Recommendation: Map "member" → `viewer` at login/upsert or migrate default to `viewer`.

## Document Processing
- `.doc` extraction depends on runtime having python3 and `python-docx`.
  - Recommendation: Containerize with required tools or add fallback path.

## Crawler
- Puppeteer requires headless-friendly environment.
  - Recommendation: Package Chrome dependencies or use a managed browser runner.
- Notifications fan-out to all organizations for every update.
  - Recommendation: Add org-level subscriptions or jurisdiction filters.

## Analytics Heuristics
- Forecasts/velocity are heuristic, not model-driven.
  - Recommendation: Introduce time-series models; version metrics in `analytics_metrics`.

## Secrets and Env
- Fail-fast is good; ensure CI/test env set via `jest.setup.ts`.
  - Recommendation: Provide `.env.example` with required keys.

## Testing
- Current tests are unit-level with mocks.
  - Recommendation: Add integration tests using Testcontainers (Postgres/Redis) and e2e sanity.
