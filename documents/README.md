# Universal ICM Connector & Rule Builder

## Overview

This repo provides two complementary modes for working with compensation plan data:

### ICM Rule Builder (primary)

Reverse-logic platform for ICM implementation engagements. Upload Excel compensation calculators → AI analysis (Claude Opus 4.6) → structured CaptivateIQ rule configurations and API-ready payloads.

**Workflow:**
1. **Create a project** for each ICM implementation engagement
2. **Upload** Excel compensation plan calculators, requirements, notes
3. **Extract** — AI reverse-engineers the rules (rate tables, accelerators, qualifiers, etc.)
4. **Generate** — Transform extracted configs into CaptivateIQ API-ready payloads
5. **Aggregate** — Merge insights from multiple Excel files per project
6. **Export** — Download structured JSON for CaptivateIQ plan buildout

### ICM Connector (original)

Extracts compensation plan data directly from vendor APIs (CaptivateIQ implemented, others planned) and exports structured JSON for external analysis.

**Workflow:**
1. **Connect** — Authenticate against a vendor's API
2. **Extract** — Pull raw plan data: rate tables, quotas, territories, employee assumptions
3. **Export** — Copy or download the full JSON for external analysis

## Quick Start

```bash
# Install dependencies
npm install

# Launch the dashboard (http://localhost:3847)
npm run dashboard

# Or use the Builder CLI
npx tsx src/cli.ts builder help
```

### Environment Variables

```bash
# Required for AI extraction
ANTHROPIC_API_KEY=sk-ant-...

# Required for CaptivateIQ connector (original mode)
CAPTIVATEIQ_API_TOKEN=

# Optional: AI Gateway
AICR_GATEWAY_URL=
AICR_API_KEY=
```

## ICM Rule Builder

### Dashboard

The dashboard is a zero-dependency web UI on port 3847 with a dark theme. The Builder section provides:

- **Project sidebar** — Create/manage ICM implementation projects
- **File upload** — Drag-and-drop Excel files (.xlsx, .xls, .csv)
- **Requirements & notes** — Add context that guides AI extraction
- **AI extraction** — One-click Claude Opus 4.6 analysis with full results display
- **Generate payloads** — Transform extraction results into CaptivateIQ API payloads
- **Aggregate** — Merge insights from 2+ extracted files into a combined config
- **Export** — Download JSON payloads

### Builder CLI

Full terminal-based workflow via `npx tsx src/cli.ts builder <command>`:

```bash
# Project management
builder projects [list]                          # List all projects
builder projects create --name <name> [--desc <description>]
builder projects show   --id <projectId>         # Show project details
builder projects delete --id <projectId>

# File management
builder upload --project <id> --file <path>      # Upload an Excel file

# AI extraction
builder extract --project <id> --file <fileId>   # Run Claude AI extraction

# Payload generation
builder generate  --project <id> --file <fileId> # Generate CaptivateIQ API payloads
builder aggregate --project <id>                 # Aggregate all extractions in project

# Export
builder export --project <id> [--file <fileId>] [--output <path>]
```

**Example session:**

```bash
npx tsx src/cli.ts builder projects create --name "FY2026 Sales Plan"
# → Created project: FY2026 Sales Plan (ID: abc123...)

npx tsx src/cli.ts builder upload --project abc123 --file ./quota-table.xlsx
# → Uploaded and parsed: quota-table.xlsx (45.2KB)

npx tsx src/cli.ts builder extract --project abc123 --file def456
# → Extraction complete (12 rules, 3 data worksheets, 5 assumptions)

npx tsx src/cli.ts builder generate --project abc123 --file def456
# → Generated CaptivateIQ API payloads

npx tsx src/cli.ts builder export --project abc123 --output ./payloads.json
# → Exported to ./payloads.json
```

### Builder REST API

All endpoints are served by the dashboard server on port 3847.

#### Projects

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/builder/projects` | List all projects |
| `POST` | `/api/builder/projects` | Create project `{ name, description? }` |
| `PATCH` | `/api/builder/projects/:id` | Update project `{ name?, description? }` |
| `DELETE` | `/api/builder/projects/:id` | Delete project and all data |

#### Files

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/builder/projects/:id/files` | List project files |
| `POST` | `/api/builder/projects/:id/files` | Upload file `{ filename, data (base64), mimeType? }` |
| `DELETE` | `/api/builder/projects/:id/files/:fileId` | Delete a file |

#### Extraction

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/builder/projects/:id/files/:fileId/extract` | Run AI extraction (Claude Opus 4.6) |
| `GET` | `/api/builder/projects/:id/files/:fileId/extraction` | Retrieve saved extraction |

#### Generation

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/builder/projects/:id/files/:fileId/generate` | Generate CaptivateIQ API payloads |
| `GET` | `/api/builder/projects/:id/files/:fileId/generation` | Retrieve saved payloads |

#### Aggregation

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/builder/projects/:id/aggregate` | Merge 2+ extracted files into combined config |
| `GET` | `/api/builder/projects/:id/aggregate` | Retrieve saved aggregation |

#### Requirements & Notes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/builder/projects/:id/requirements` | List requirements |
| `POST` | `/api/builder/projects/:id/requirements` | Add requirement `{ text, priority? }` |
| `GET` | `/api/builder/projects/:id/notes` | List notes |
| `POST` | `/api/builder/projects/:id/notes` | Add note `{ text }` |

### AI Extraction Details

The extractor (`src/excel/extractor.ts`) sends the full parsed workbook to Claude Opus 4.6 with a structured prompt. It returns:

- **Rules** — Normalized rule objects classified by concept (rate-table, accelerator, qualifier, etc.)
- **Insights** — Free-text analysis of the compensation plan structure
- **CaptivateIQ Build Config** — Structured recommendations:
  - `planStructure` — Plan name, period type, payout components
  - `dataWorksheets[]` — Rate tables, quota tables, deal data with column definitions and sample rows
  - `employeeAssumptionColumns[]` — Quota, variable pay, territory assignments
  - `attributeWorksheets[]` — Role, territory, team mapping worksheets
  - `formulaRecommendations[]` — Pseudo-formulas with CaptivateIQ implementation notes

### Payload Generation

Generators (`src/generators/`) transform `CaptivateIQBuildConfig` into `CaptivateIQApiPayloads` — structured JSON ready for the CaptivateIQ REST API:

| Payload | CaptivateIQ API Endpoint |
|---------|--------------------------|
| `plan` | `POST /ciq/v1/plans` |
| `periodGroup` | `POST /ciq/v1/period_groups` |
| `dataWorksheets[]` | `POST /ciq/v1/workbooks/:id/worksheets` + records |
| `employeeAssumptions` | `PATCH /ciq/v1/plans/:id/employee_assumptions/schema` |
| `attributeWorksheets[]` | `POST /ciq/v1/attribute_worksheets` |
| `formulaReference` | N/A — SmartGrid formulas are UI-only, exported as reference doc |

Generators are **pure functions** — no AI calls, just structural transformation from the extraction config.

### Multi-File Aggregation

When a project has 2+ extracted files, the aggregator (`src/generators/aggregator.ts`) merges them:

- **Union** all data worksheets, employee assumptions, attribute worksheets, and formula recommendations
- **Dedup** by name/concept to avoid duplicates
- **Merge** plan structure (longest payout component list wins)
- Output persisted to `data/generations/<projectId>-aggregated.json`

### Storage

All data is file-based JSON under `data/`:

| Path | Contents |
|------|----------|
| `data/store.json` | Project, file, requirement, note metadata |
| `data/files/` | Uploaded Excel file blobs (UUID filenames) |
| `data/extractions/<projectId>-<fileId>.json` | AI extraction results per file |
| `data/generations/<projectId>-<fileId>.json` | Generated payloads per file |
| `data/generations/<projectId>-aggregated.json` | Aggregated payloads |

## ICM Connector (Original Mode)

### Connector Dashboard

The dashboard also serves the original connector UI:

- **Vendor setup** — Accordion panels for each ICM vendor with credential input
- **Test connection** — Verify API credentials before extracting
- **List plans** — Browse available compensation plans
- **Extract rules** — Pull all plan data from a vendor
- **Export** — Copy Full JSON or Download JSON file

### Connector API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/test-connection` | Test vendor API credentials |
| `POST` | `/api/list-plans` | List compensation plans |
| `POST` | `/api/extract-rules` | Extract rules (optionally filtered by planId) |

### Connector CLI

```bash
npm run extract -- --vendor captivateiq --plan <planId>
npm run extract -- --vendor captivateiq --output ./extracted.json
npx tsx src/cli.ts list-plans --vendor captivateiq
npm run normalize -- --input ./extracted-rules.json --output ./normalized.json
```

### Supported ICM Systems

| Vendor | Auth | Status |
|--------|------|--------|
| **CaptivateIQ** | Token (API key) | **Implemented** |
| **Varicent** | OAuth2 | Planned |
| **Xactly** | API key/secret | Planned |
| **SAP SuccessFactors** | OAuth2 | Planned |
| **Salesforce/Spiff** | OAuth2 | Planned |

### CaptivateIQ Connector Details

- **Auth**: API token via `Authorization: Token <token>` header
- **Base URL**: `https://api.captivateiq.com/ciq/v1/`
- **Rate limits**: 5 req/sec burst, 1,500 req/hour
- **Extracted data**: Plans, period groups, employee assumptions, data worksheets, attribute worksheets, payout worksheets, report models
- **Important**: The API does not expose SmartGrid formula definitions — rule concepts must be inferred from data patterns

## Architecture

```
src/
├── index.ts                  # Main entry point
├── cli.ts                    # CLI router (extract, normalize, builder)
├── builder-cli.ts            # Builder CLI commands
├── project/
│   ├── types.ts              # Builder data model
│   └── store.ts              # File-based JSON store
├── excel/
│   ├── parser.ts             # SheetJS Excel → ParsedWorkbook
│   └── extractor.ts          # Claude Opus 4.6 AI extraction
├── generators/
│   ├── index.ts              # Orchestrator: config → payloads
│   ├── types.ts              # API payload types
│   ├── plan.ts               # Plan + PeriodGroup generators
│   ├── data-worksheets.ts    # DataWorksheetBundle generator
│   ├── employee-assumptions.ts
│   ├── attribute-worksheets.ts
│   └── aggregator.ts         # Multi-file merger
├── types/                    # Connector types (schema, taxonomy)
├── connectors/               # Vendor API connectors
├── routes/                   # Hono route modules (brd, context, files, pipeline, profiles, projects, results, tester)
├── middleware/               # Error handler, project loader
├── interpreter/              # AI concept extraction
├── normalizer/               # Normalize pipeline
├── config/                   # Runtime config
├── logger.ts                 # Structured logger with levels
└── dashboard/
    ├── server.ts             # Dashboard HTTP server
    └── index.html            # SPA (dark theme, both modes)
```

## Rule Concept Taxonomy

| Concept | Description |
|---------|-------------|
| **rate-table** | Commission rate lookup (flat, tiered, matrix) |
| **accelerator** | Rate increase above quota threshold |
| **decelerator** | Rate decrease below quota threshold |
| **qualifier** | Gate condition (e.g. must hit 80% to earn) |
| **split** | Credit splitting between reps/roles |
| **territory** | Geographic or account assignment rules |
| **quota-target** | Quota/target definition and allocation |
| **draw** | Guaranteed minimum / recoverable draw |
| **spif** | Special incentive (bonus, contest) |
| **cap** | Maximum earning limit |
| **floor** | Minimum earning guarantee |
| **clawback** | Recovery of previously paid commissions |

## Development

```bash
npm install          # Install dependencies
npm run dashboard    # Launch dashboard UI (port 3847)
npm run dev          # Run in watch mode
npm run build        # Compile TypeScript
npm test             # Run tests (Vitest)
npm run type-check   # Type-check without emitting
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (strict) |
| Runtime | Node.js 20+ |
| AI | Claude Opus 4.6 via `@anthropic-ai/sdk` |
| Excel | ExcelJS (`exceljs`) |
| Validation | Zod |
| Storage | File-based JSON |
| Testing | Vitest (297 passing, 5 skipped, 21 files) |
| Server | Hono (`hono` + `@hono/node-server`) |
| Dashboard | Vanilla HTML/CSS/JS SPA |

## Related Projects

| Project | Relationship |
|---------|-------------|
| **Commission Calculator** | Primary consumer — real-time commissions from normalized rules |
| **SGM/SPARCC** | Governance consumer — gap analysis against normalized rules |
| **IntelligentSPM** | Knowledge base — 929 SPM domain cards |
| **Pay Curves** | Analytics — pay curve visualizations from normalized data |
