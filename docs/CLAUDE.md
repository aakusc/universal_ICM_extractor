# Universal ICM Connector & Rule Builder - AI Agent Instructions

> **This file is auto-read by Claude Code at session start.**
> Last updated: March 2026

## What Is This?

This repo has **two modes**:

1. **ICM Connector** — Extracts compensation plan data from vendor APIs (CaptivateIQ, etc.) and exports structured JSON for external interpretation.
2. **ICM Rule Builder** — Reverse-logic platform: upload Excel compensation calculators → AI analysis (Claude Opus 4.6) → CaptivateIQ rule configurations and API-ready payloads.

The Rule Builder is the active focus. The Connector remains functional for direct API extraction.

## Essential Files to Read

| When Working On | Read This First |
|-----------------|-----------------|
| **Architecture & design** | `docs/README.md` |
| **Project memory & decisions** | `docs/MEMORY.md` |
| **Builder types & data model** | `src/project/types.ts` |
| **Builder store (file-based JSON)** | `src/project/store.ts` |
| **Excel parser** | `src/excel/parser.ts` |
| **AI extractor (Claude Opus)** | `src/excel/extractor.ts` |
| **Payload generators** | `src/generators/index.ts` |
| **Multi-file aggregator** | `src/generators/aggregator.ts` |
| **Generator output types** | `src/generators/types.ts` |
| **Dashboard server** | `src/dashboard/server.ts` |
| **Dashboard UI** | `src/dashboard/index.html` |
| **Builder CLI** | `src/builder-cli.ts` |
| **Normalized schema** | `src/types/normalized-schema.ts` |
| **Connector interface** | `src/types/connector.ts` |
| **CaptivateIQ connector** | `src/connectors/captivateiq/` |

## Project Structure

```
src/
├── index.ts                  # Main entry point
├── cli.ts                    # CLI router (extract, normalize, builder)
├── builder-cli.ts            # Builder CLI commands (projects, upload, extract, generate, aggregate, export)
├── project/
│   ├── types.ts              # Builder data model (Project, File, ExtractionResult, CaptivateIQBuildConfig)
│   └── store.ts              # File-based JSON store (data/store.json)
├── excel/
│   ├── parser.ts             # SheetJS Excel → ParsedWorkbook
│   └── extractor.ts          # Claude Opus 4.6 AI rule extraction
├── generators/
│   ├── index.ts              # Orchestrator: CaptivateIQBuildConfig → CaptivateIQApiPayloads
│   ├── types.ts              # API payload types (PlanPayload, WorksheetPayload, etc.)
│   ├── plan.ts               # Plan + PeriodGroup generators
│   ├── data-worksheets.ts    # DataWorksheetBundle generator
│   ├── employee-assumptions.ts # EmployeeAssumptions generator
│   ├── attribute-worksheets.ts # AttributeWorksheet generator
│   └── aggregator.ts         # Multi-file extraction merger (union/dedup)
├── types/
│   ├── connector.ts          # IConnector interface
│   ├── normalized-schema.ts  # Vendor-agnostic output schema (Zod)
│   └── rule-concepts.ts      # Rule concept taxonomy
├── connectors/
│   ├── base-connector.ts     # Abstract base class
│   └── captivateiq/          # CaptivateIQ connector (implemented)
│       ├── client.ts         # REST API client (Token auth, paginated)
│       └── connector.ts      # BaseConnector implementation
├── interpreter/
│   └── concept-extractor.ts  # AI interpretation (stubbed)
├── normalizer/
│   └── pipeline.ts           # Extract → Interpret → Normalize pipeline
├── config/
│   └── index.ts              # Environment and runtime config
└── dashboard/
    ├── server.ts             # HTTP server (Connector + Builder API endpoints)
    └── index.html            # Self-contained SPA (dark theme, both modes)

tests/
├── excel/                    # Excel parser tests
└── project/                  # Store tests

data/
├── store.json                # Project/file metadata
├── files/                    # Uploaded Excel blobs
├── extractions/              # AI extraction results (per file)
└── generations/              # Generated CaptivateIQ payloads

docs/
├── CLAUDE.md                 # This file (AI agent instructions)
├── README.md                 # Full project documentation
└── MEMORY.md                 # Persistent project memory
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Language** | TypeScript (strict) |
| **Runtime** | Node.js 20+ |
| **AI** | Claude Opus 4.6 via `@anthropic-ai/sdk` |
| **Excel** | SheetJS (`xlsx`) |
| **Validation** | Zod |
| **Storage** | File-based JSON (`data/`) |
| **Testing** | Vitest |
| **Dashboard** | Zero-dependency (Node HTTP + vanilla HTML/CSS/JS) |
| **Port** | 3847 |

## Architecture

### ICM Rule Builder Pipeline

```
┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐
│  Upload   │───▶│   Parse   │───▶│  Extract  │───▶│ Generate  │───▶│  Export   │
│  (Excel)  │    │ (SheetJS) │    │(Claude AI)│    │(Payloads) │    │  (JSON)   │
└───────────┘    └───────────┘    └───────────┘    └───────────┘    └───────────┘
                                        │                │
                                  Rules, insights,   CaptivateIQ
                                  CaptivateIQBuild   API-ready
                                  Config             payloads
```

For multi-file projects, an **Aggregate** step merges extractions from 2+ files (union + dedup) before generating combined payloads.

### ICM Connector Pipeline (original)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Connect    │────▶│   Extract    │────▶│   Export     │
│  (Auth/API)  │     │ (Raw Rules)  │     │  (JSON)      │
└──────────────┘     └──────────────┘     └──────────────┘
```

## Key Conventions

- **IDs**: lowercase kebab-case (e.g. `varicent-accel-tier-1`)
- **Files**: kebab-case filenames
- **Variables**: camelCase
- **Types**: PascalCase
- **Interfaces**: IPascalCase prefix (e.g. `IConnector`)
- **Zod schemas**: camelCase with `Schema` suffix
- **Generators**: Pure functions — no AI calls, just structural transformation
- **Store**: `emptyStore()` factory to avoid shared-reference bugs (no shallow copy)
- **Formulas**: CaptivateIQ SmartGrid formulas are UI-only (not in API) — formula recs become a reference doc

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
# Install dependencies
npm install

# Launch dashboard (http://localhost:3847)
npm run dashboard

# Run tests
npm test

# Type check
npm run type-check

# Builder CLI
npx tsx src/cli.ts builder help
npx tsx src/cli.ts builder projects list
npx tsx src/cli.ts builder projects create --name "FY2026 Sales Plan"
npx tsx src/cli.ts builder upload --project <id> --file ./plan.xlsx
npx tsx src/cli.ts builder extract --project <id> --file <fileId>
npx tsx src/cli.ts builder generate --project <id> --file <fileId>
npx tsx src/cli.ts builder aggregate --project <id>
npx tsx src/cli.ts builder export --project <id> --output ./payloads.json

# Connector CLI (original mode)
npm run extract -- --vendor captivateiq --plan FY2026
npx tsx src/cli.ts list-plans --vendor captivateiq
npm run normalize -- --input ./extracted-rules.json --output ./normalized.json
```

## Known Gotchas

- `store.ts` uses `emptyStore()` factory, not `{ ...EMPTY_STORE }` — shallow copy caused mutation leakage
- In Vitest, `vi.clearAllMocks` wipes all mock implementations — restore them in `beforeEach` after clearing
- The AI extractor requires `ANTHROPIC_API_KEY` in env
- SmartGrid formulas are not API-accessible — generated `formulaReference` is a reference doc, not an API payload

## Downstream Consumers

- **Commission Calculator** (real-time, Mattress Firm use case)
- **Pay Curves Tool** (Spark suite)
- **SGM/SPARCC** (governance gap analysis)

## Related Repositories

- **sgm-sparcc-demo** - Sales Governance Manager
- **intelligentSPM** - SPM knowledge platform (929 domain cards)
- **docs-main** - AICR Platform documentation

---

**Assigned to:** Aaron & Keshav
**Business driver:** Mattress Firm — universal connector for real-time commission calculator
