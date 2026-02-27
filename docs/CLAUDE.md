# Universal ICM Connector - AI Agent Instructions

> **This file is auto-read by Claude Code at session start.**
> Last updated: February 2026

## What Is This?

**Universal ICM Connector** is a TypeScript library/service that extracts compensation rule **concepts** from any ICM (Incentive Compensation Management) system and normalizes them into a vendor-agnostic schema consumable by the Commission Calculator and other SPM tools.

**Key distinction:** We extract rule *intent* (e.g. "accelerator above 100% quota"), not raw rule objects.

## Supported ICM Systems

| Vendor | Module | Status |
|--------|--------|--------|
| **Varicent** (formerly Verisent) | Incentive Compensation | Planned |
| **Xactly** (Exactly) | Incent | Planned |
| **SAP** | SuccessFactors ICM | Planned |
| **CaptivateIQ** | Commission Management | **Implemented** |
| **Salesforce** | Spiff / ICM | Planned |

## Essential Files to Read

| When Working On | Read This First |
|-----------------|-----------------|
| **Architecture & design** | `docs/README.md` |
| **Project memory & decisions** | `docs/MEMORY.md` |
| **Normalized schema** | `src/types/normalized-schema.ts` |
| **Connector interface** | `src/types/connector.ts` |
| **CaptivateIQ connector** | `src/connectors/captivateiq/` |
| **Dashboard server** | `src/dashboard/server.ts` |
| **Dashboard UI** | `src/dashboard/index.html` |
| **Normalizer pipeline** | `src/normalizer/pipeline.ts` |

## Project Structure

```
src/
├── index.ts                  # Main entry point
├── cli.ts                    # CLI (extract, list-plans, normalize, pipeline)
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
│   └── concept-extractor.ts  # AI interpretation (stubbed — user interprets externally)
├── normalizer/
│   └── pipeline.ts           # Extract → Interpret → Normalize pipeline
├── config/
│   └── index.ts              # Environment and runtime config
└── dashboard/
    ├── server.ts             # HTTP server (real API endpoints, no mock data)
    └── index.html            # Self-contained SPA (connector-first UI)

docs/
├── CLAUDE.md                 # This file (AI agent instructions)
├── README.md                 # Full project documentation
└── MEMORY.md                 # Persistent project memory (maintained by Claude)
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Language** | TypeScript (strict) |
| **Validation** | Zod |
| **Runtime** | Node.js 20+ |
| **Testing** | Vitest |
| **AI** | Claude API (via AICR Gateway or direct) for rule interpretation |

## Architecture: Connect → Extract → Export

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Connect    │────▶│   Extract    │────▶│   Export     │
│  (Auth/API)  │     │ (Raw Rules)  │     │  (JSON)      │
└──────────────┘     └──────────────┘     └──────────────┘
     │                     │                     │
  Vendor API          Plans, quotas,        Copy/Download
  credentials         territories,          full JSON for
                      assumptions,          external AI
                      worksheets            interpretation
```

**Note:** AI interpretation is external — the connector focuses on getting full, untruncated data through the API. Users copy the raw JSON and interpret with their own AI.

## Key Conventions

- **IDs**: lowercase kebab-case (e.g. `varicent-accel-tier-1`)
- **Files**: kebab-case filenames
- **Variables**: camelCase
- **Types**: PascalCase
- **Interfaces**: IPascalCase prefix (e.g. `IConnector`)
- **Zod schemas**: camelCase with `Schema` suffix (e.g. `normalizedRuleSchema`)
- **Vendor modules**: one directory per vendor under `src/connectors/`

## Rule Concept Taxonomy

The connector classifies extracted rules into these concept categories:

| Concept | Description |
|---------|-------------|
| **RateTable** | Commission rate lookup (flat, tiered, matrix) |
| **Accelerator** | Rate increase above quota threshold |
| **Decelerator** | Rate decrease below quota threshold |
| **Qualifier** | Gate condition (e.g. must hit 80% to earn) |
| **Split** | Credit splitting between reps/roles |
| **Territory** | Geographic or account assignment rules |
| **QuotaTarget** | Quota/target definition and allocation |
| **Draw** | Guaranteed minimum / recoverable draw |
| **SPIF** | Special incentive (bonus, contest) |
| **Cap** | Maximum earning limit |
| **Floor** | Minimum earning guarantee |
| **Clawback** | Recovery of previously paid commissions |

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test

# Type check
npm run type-check

# CLI: Extract rules from a vendor
npm run extract -- --vendor captivateiq --plan FY2026
npm run extract -- --vendor captivateiq --output ./extracted.json

# CLI: List plans for a vendor
npx tsx src/cli.ts list-plans --vendor captivateiq

# CLI: Normalize extracted rules
npm run normalize -- --input ./extracted-rules.json --output ./normalized.json

# Dashboard (connector-first UI, real API endpoints)
npm run dashboard
```

## Downstream Consumers

- **Commission Calculator** (real-time, Mattress Firm use case)
- **Pay Curves Tool** (Spark suite)
- **Modeling & Simulation** (Monte Carlo)
- **SGM/SPARCC** (governance gap analysis)

## Related Repositories

- **sgm-sparcc-demo** - Sales Governance Manager (consumes normalized rules)
- **intelligentSPM** - SPM knowledge platform (929 domain cards)
- **docs-main** - AICR Platform documentation

---

**Assigned to:** Aaron & Keshav
**Business driver:** Mattress Firm — universal connector for real-time commission calculator
