# Universal ICM Connector — Project Memory

> **Maintained by Claude across sessions.** This file tracks architectural decisions, patterns, known issues, and context that persists between work sessions.

## Project Status

- **Phase**: Initial scaffolding (Feb 2026)
- **Assigned**: Aaron & Keshav
- **Business driver**: Mattress Firm — current tablet solution inadequate, need universal connector for real-time commission calculator
- **SRS gap**: Feature gap identified that this connector addresses

## Architectural Decisions

### ADR-001: Concepts Over Objects (Feb 2026)
- **Decision**: Extract rule *concepts* (business intent) rather than raw rule objects
- **Rationale**: Every ICM vendor stores rules differently, but the underlying business concepts are universal. AI interpretation bridges the vendor-specific gap.
- **Consequence**: Requires AI layer in the pipeline; adds confidence scoring to output

### ADR-002: Zod for Schema Validation (Feb 2026)
- **Decision**: Use Zod for both the normalized schema and vendor-specific schemas
- **Rationale**: Consistent with SGM/SPARCC patterns. Runtime validation + TypeScript inference in one package.

### ADR-003: IConnector Interface Pattern (Feb 2026)
- **Decision**: Each vendor connector implements IConnector with connect(), extractRules(), and disconnect() methods
- **Rationale**: Clean separation allows adding new vendors without touching the pipeline. Follows SGM's Contracts + Ports + Bindings pattern.

### ADR-004: AI Provider Priority (Feb 2026)
- **Decision**: Claude API preferred, AICR Gateway as intermediary, fallback chain mirrors IntelligentSPM pattern
- **Rationale**: Consistent with BHG platform architecture. Claude for concept interpretation accuracy.

## Vendor-Specific Notes

### Varicent
- Hierarchical rule trees with position-based inheritance
- Must resolve inheritance before interpretation
- REST API with OAuth2

### Xactly
- Flat incentive components with proprietary formula expression language
- Formula parser will be needed
- REST/SOAP hybrid API

### SAP SuccessFactors
- OData v4 API
- XML rule definitions, nesting 5+ levels deep
- Most complex extraction target

### CaptivateIQ
- **Status**: First implemented connector (Feb 2026)
- REST API: `https://api.captivateiq.com/ciq/v1/`
- Token auth via `Authorization: Token <token>` header
- Rate limits: 5 req/s burst, 1500 req/hr (Standard tier)
- 80+ endpoints across 18 resource categories
- Paginated responses with next/previous cursors
- Forrester Wave Leader in ICM
- Developer docs: https://developers.captivateiq.com/docs
- Note: Original meeting notes referred to "CapIQ" — this means CaptivateIQ, NOT S&P Capital IQ
- **CRITICAL**: CaptivateIQ's API does NOT expose SmartGrid formula definitions, calculation component logic, or rate table bindings. The API is a data I/O layer only.
- **Correct endpoint paths** (hyphens, not underscores): `/plans/`, `/period-groups/`, `/data-workbooks/`, `/data-worksheets/{id}/records/`, `/employee-assumptions/`, `/attribute-worksheets/`, `/payouts/worksheets/`, `/report-models/`, `/me/organizations/`, `/employees/`
- **5-source extraction strategy**: (1) plans + period groups, (2) employee assumptions (quotas/rates/targets), (3) data worksheets (raw tables), (4) attribute worksheets (roles/territories), (5) payout worksheets + report models (calculation outputs)
- AI interpreter infers concepts from data patterns, not from formula definitions

### Salesforce/Spiff
- Object-based rules with Apex formula syntax
- Standard Salesforce REST API patterns
- May need Apex formula parsing

## Cross-Repo Integration Points

| Repo | Integration | Status |
|------|-------------|--------|
| **sgm-sparcc-demo** | Consumes normalized rules for governance gap analysis | Planned |
| **intelligentSPM** | 929 SPM knowledge cards inform AI interpretation prompts | Planned |
| **Commission Calculator** | Primary consumer — real-time display | Planned |
| **docs-main** | Documentation site for AICR platform | Planned |

## Known Issues & Open Questions

- [ ] Which Varicent API version to target? Need access credentials to explore.
- [ ] Xactly formula expression language — need documentation or samples to build parser
- [ ] SAP OData entity graph — need to map which entities contain rule definitions
- [x] CaptivateIQ API — researched and implemented (Token auth, REST, paginated)
- [ ] Salesforce Spiff — has NO plan rule extraction API; may need workaround
- [ ] Confidence threshold for AI interpretation — what score is "good enough" for production?
- [ ] How to handle rules that span multiple concepts (e.g., a rate table with built-in accelerator)?

## Session Log

### 2026-02-26 — Initial Setup
- Created project framework: directory structure, package.json, tsconfig.json
- Created CLAUDE.md, docs/README.md, docs/MEMORY.md
- Defined normalized schema types, IConnector interface, rule concept taxonomy
- Scaffolded connector base class, normalizer pipeline, config, CLI entry points
- Context gathered from: CAIO Weekly Update (Feb 16), AI Platform Demo (Feb 12), SGM/SPARCC patterns, IntelligentSPM patterns

### 2026-02-26 — Dashboard & CaptivateIQ Connector
- Built zero-dependency dashboard (Node HTTP server + self-contained HTML SPA, port 3847)
- Researched all 5 vendor APIs in detail — discovered "CapIQ" in meeting notes means CaptivateIQ (ICM platform), NOT S&P Capital IQ (financial data)
- Swapped `capiq` → `captivateiq` across entire codebase
- Implemented CaptivateIQ connector: full API client (client.ts) + BaseConnector implementation (connector.ts)
- Wired CaptivateIQ into CLI (extract, list-plans, pipeline commands work for captivateiq vendor)
- CaptivateIQ is the first fully implemented vendor connector

### 2026-02-26 — Interactive Connector Setup & Real API Integration
- Added accordion-style connector setup panels in dashboard (Configure button per vendor)
- CaptivateIQ: test connection, list plans, extract rules — all calling real API endpoints
- Server endpoints: POST /api/test-connection, POST /api/list-plans, POST /api/extract-rules
- 5-source extraction strategy: plans+periods, employee assumptions, data worksheets, attribute worksheets, payouts+report models
- Fixed ByteString errors (switched to DOM-based rendering instead of innerHTML)
- Fixed 404 errors on CaptivateIQ API paths (hyphens not underscores)
- Verified real extraction: 7 rules from CaptivateIQ "test" plan (COMMISSION_PLAN, PERIOD_GROUP, EMPLOYEE_ASSUMPTIONS, 4x ATTRIBUTE_WORKSHEET)

### 2026-02-26 — Dashboard Cleanup
- Removed all mock data (deleted mock-data.ts, removed /api/data endpoint)
- Stripped mock pipeline flow, stats bar, rules table, activity log, "How It Works" modal
- Dashboard is now connector-first: vendor setup is the primary UI
- Added Copy Full JSON + Download JSON export buttons for raw extraction output
- Concept taxonomy reference card kept inline
- Moved CLAUDE.md from project root to docs/
- Pushed to GitHub: https://github.com/aakusc/universal_ICM_extractor

### Design Decision: External AI Interpretation
- The concept-extractor.ts `interpretSingleRule()` remains stubbed (returns empty concepts, confidence 0)
- User copies raw extraction JSON output and interprets with their own AI externally
- CaptivateIQ API does NOT expose SmartGrid formula definitions — AI must infer rule concepts from data patterns (quotas, territories, payout schedules, role attributes)

### 2026-03-03 — Multi-Format Bulk Processing (v2)
- **Major revision**: Platform now accepts ALL document types, not just Excel
- Added document parser (`src/documents/parser.ts`): supports PDF, Word (.docx), CSV, text files
- New dependencies: `pdf-parse` (PDF text extraction), `mammoth` (Word doc extraction)
- **Bulk "Process All" mode**: Single button feeds all project files (Excel + documents) into one Claude Opus call for cross-referencing
- **Excel output**: New exporter (`src/excel/exporter.ts`) generates consolidated multi-sheet Excel workbook with Summary, Rules, Data Worksheets, Employee Assumptions, Attribute Worksheets, Formula Logic, CIQ Build Guide, and Insights sheets
- **CaptivateIQ Build Document**: New generator (`src/generators/build-document.ts`) produces formatted implementation guide with step-by-step instructions
- Updated file model with `category` field (excel | document | csv | unknown) for pipeline routing
- Back-compatibility: existing files without `category` default to 'excel'
- Dashboard UI overhauled: multi-format drag-drop upload, "Process All" banner, download bar (Excel, Build Guide, JSON), full results view
- New API endpoints: `POST /process-all`, `GET /export-excel`, `GET /build-document`
- TypeScript compiles clean, dashboard verified running on port 3847
