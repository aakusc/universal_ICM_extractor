# BHG-ICM-Services — Project Context

> Auto-read by Claude Code at session start. Last updated: March 2026

## What Is This?

This repo has **two modes**:

1. **ICM Rule Builder** (active focus) — Upload Excel compensation calculators + PDF/Word/CSV documents → AI analysis (Claude Opus 4.6) → CaptivateIQ rule configurations and API-ready payloads.
2. **ICM Connector** — Extracts compensation plan data from vendor APIs (CaptivateIQ implemented, others planned) and exports structured JSON for external interpretation.

- **Type:** api
- **Stack:** TypeScript (strict), Node.js 20+, Hono, Vitest, Zod, ExcelJS, mammoth, pdf-parse, Claude Opus 4.6 (`@anthropic-ai/sdk`)
- **Phase:** complete (297 tests passing, 5 skipped, 21 test files)
- **Assigned to:** Aaron & Keshav
- **Business driver:** Mattress Firm — universal connector for real-time commission calculator

## Essential Files to Read

| When Working On | Read This First |
|-----------------|-----------------|
| **Architecture & design** | `documents/README.md` |
| **Project memory & decisions** | `documents/MEMORY.md` |
| **Builder types & data model** | `src/project/types.ts` |
| **Builder store (file-based JSON)** | `src/project/store.ts` |
| **Excel parser** | `src/excel/parser.ts` |
| **AI extractor (Claude Opus)** | `src/excel/extractor.ts` |
| **Document parser (PDF/Word/CSV)** | `src/documents/parser.ts` |
| **Pipeline runner** | `src/pipeline/runner.ts` |
| **Pipeline prompts** | `src/pipeline/prompts.ts` |
| **BRD generator** | `src/pipeline/brd-generator.ts` |
| **Payload generators** | `src/generators/index.ts` |
| **Multi-file aggregator** | `src/generators/aggregator.ts` |
| **Generator output types** | `src/generators/types.ts` |
| **Hono server** | `src/server.ts` |
| **Route modules** | `src/routes/` |
| **Structured logger** | `src/logger.ts` |
| **Dashboard UI** | `src/dashboard/index.html` |
| **Builder CLI** | `src/builder-cli.ts` |
| **Normalized schema** | `src/types/normalized-schema.ts` |
| **Connector interface** | `src/types/connector.ts` |
| **CaptivateIQ connector** | `src/connectors/captivateiq/` |

## Project Structure

```
BHG-ICM-Services/
├── src/
│   ├── index.ts                  # Main entry point
│   ├── cli.ts                    # CLI router (extract, normalize, builder)
│   ├── builder-cli.ts            # Builder CLI commands
│   ├── server.ts                 # Hono API server
│   ├── logger.ts                 # Structured logger with levels
│   ├── project/
│   │   ├── types.ts              # Builder data model
│   │   └── store.ts              # File-based JSON store (data/store.json)
│   ├── excel/
│   │   ├── parser.ts             # ExcelJS → ParsedWorkbook
│   │   └── extractor.ts          # Claude Opus 4.6 AI rule extraction
│   ├── documents/
│   │   └── parser.ts             # PDF, Word (.docx), CSV, text parser
│   ├── pipeline/
│   │   ├── runner.ts             # Pipeline orchestration
│   │   ├── prompts.ts            # AI prompt templates
│   │   ├── plan-tester.ts        # Plan testing
│   │   ├── brd-generator.ts      # BRD document generation
│   │   ├── completeness.ts       # Completeness scoring
│   │   ├── offline-comparator.ts # Offline comparison
│   │   ├── source-summary.ts     # Source summarization
│   │   └── types.ts              # Pipeline types
│   ├── generators/
│   │   ├── index.ts              # Orchestrator: config → payloads
│   │   ├── types.ts              # API payload types
│   │   ├── plan.ts               # Plan + PeriodGroup generators
│   │   ├── data-worksheets.ts    # DataWorksheetBundle generator
│   │   ├── employee-assumptions.ts
│   │   ├── attribute-worksheets.ts
│   │   └── aggregator.ts         # Multi-file merger (union + dedup)
│   ├── routes/
│   │   ├── brd.ts                # BRD endpoints
│   │   ├── context.ts            # Context endpoints
│   │   ├── files.ts              # File management endpoints
│   │   ├── pipeline.ts           # Pipeline endpoints
│   │   ├── profiles.ts           # Profile endpoints
│   │   ├── projects.ts           # Project endpoints
│   │   ├── results.ts            # Results endpoints
│   │   └── tester.ts             # Tester endpoints
│   ├── middleware/
│   │   ├── error-handler.ts      # Error handling middleware
│   │   └── project-loader.ts     # Project loading middleware
│   ├── types/                    # Connector types (schema, taxonomy)
│   ├── connectors/               # Vendor API connectors
│   ├── interpreter/              # AI concept extraction
│   ├── normalizer/               # Normalize pipeline
│   ├── config/                   # Runtime config
│   └── dashboard/
│       ├── server.ts             # Dashboard HTTP server
│       └── index.html            # SPA (dark theme, both modes)
├── tests/                        # 297 tests, 21 files (5 skipped w/o API key)
├── dashboard/                    # Dashboard frontend (separate npm project)
├── docs/                         # Documentation
├── data/                         # File-based JSON storage
├── documents/                    # Project context (this folder)
├── spec.md                       # Full specification
├── TECHDEBT.md                   # Code quality notes
└── work.md                       # Agent work log
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
- **Logging**: Structured logger (`src/logger.ts`) with configurable levels
- **Server**: Hono framework with modular route files under `src/routes/`

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

## Known Gotchas

- `store.ts` uses `emptyStore()` factory, not `{ ...EMPTY_STORE }` — shallow copy caused mutation leakage
- In Vitest, `vi.clearAllMocks` wipes all mock implementations — restore them in `beforeEach` after clearing
- The AI extractor requires `ANTHROPIC_API_KEY` in env (5 tests skipped without it)
- SmartGrid formulas are not API-accessible — generated `formulaReference` is a reference doc, not an API payload

## Development

```bash
npm install             # Install dependencies
npm run dashboard       # Launch dashboard (port 3847)
npm run dev             # Concurrent API + dashboard watch mode
npm test                # Run tests (297 passing, 5 skipped)
npm run type-check      # TypeScript validation
npm run lint            # ESLint
```

## Downstream Consumers

- **Commission Calculator** (real-time, Mattress Firm use case)
- **Pay Curves Tool** (Spark suite)
- **SGM/SPARCC** (governance gap analysis)

## Reference

- [README.md](./README.md) — full project documentation
- [MEMORY.md](./MEMORY.md) — architectural decisions and session history
- [services.md](./services.md) — available platforms and tools
