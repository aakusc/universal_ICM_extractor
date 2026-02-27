# Universal ICM Connector

## Overview

The Universal ICM Connector extracts compensation plan data from any Incentive Compensation Management (ICM) system and exports it as structured JSON. Connect to a vendor API, pull plans and rules, then copy the raw output for external interpretation.

### How It Works

1. **Connect** — Authenticate against a vendor's API (token, OAuth, etc.)
2. **Extract** — Pull raw plan data: rate tables, quotas, territories, employee assumptions, payout schedules
3. **Export** — Copy or download the full JSON for external analysis

The extracted data is vendor-specific but structurally consistent — plans, periods, worksheets, records, and attributes come through in a predictable format regardless of source.

## Quick Start

```bash
# Install dependencies
npm install

# Launch the dashboard (opens http://localhost:3847)
npm run dashboard

# Or use the CLI
npx tsx src/cli.ts extract --vendor captivateiq
npx tsx src/cli.ts list-plans --vendor captivateiq
```

### Dashboard

The dashboard is a zero-dependency web UI served by a Node HTTP server on port 3847. It provides:

- **Vendor connector setup** — Accordion panels for each ICM vendor with credential input
- **Test connection** — Verify API credentials before extracting
- **List plans** — Browse available compensation plans
- **Extract rules** — Pull all plan data from a vendor (or filter by plan)
- **Export** — Copy Full JSON to clipboard or Download JSON file
- **Concept taxonomy reference** — Quick reference of rule concept categories

Currently supported: **CaptivateIQ** (live). Varicent, Xactly, SAP SuccessFactors, and Salesforce show "coming soon."

### API Endpoints

The dashboard server exposes these endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/test-connection` | Test vendor API credentials |
| `POST` | `/api/list-plans` | List compensation plans |
| `POST` | `/api/extract-rules` | Extract rules (optionally filtered by planId) |

All endpoints accept `{ vendor, auth, planId? }` JSON bodies and return JSON responses.

## Supported ICM Systems

| Vendor | Auth | Status |
|--------|------|--------|
| **CaptivateIQ** | Token (API key) | **Implemented** |
| **Varicent** | OAuth2 | Planned |
| **Xactly** | API key/secret | Planned |
| **SAP SuccessFactors** | OAuth2 | Planned |
| **Salesforce/Spiff** | OAuth2 | Planned |

## CaptivateIQ Connector

### Authentication

Generate an API token in CaptivateIQ: **User Profile → API Tokens**. The token authenticates via `Authorization: Token <token>` header.

Base URL: `https://api.captivateiq.com/ciq/v1/`

### What Gets Extracted

The connector uses a 5-source extraction strategy:

| Source | Data | Rule Type |
|--------|------|-----------|
| Plans + Period Groups | Plan structure, payout dates, effective periods | `COMMISSION_PLAN`, `PERIOD_GROUP` |
| Employee Assumptions | Quotas, variable amounts, targets per employee | `EMPLOYEE_ASSUMPTIONS` |
| Data Worksheets | Raw tables (rate data, quota tables, deal data) | `DATA_WORKSHEET` |
| Attribute Worksheets | Roles, territories, team assignments | `ATTRIBUTE_WORKSHEET` |
| Payout Worksheets + Report Models | Calculation outputs, commission structures | `PAYOUT_WORKSHEET`, `REPORT_MODEL` |

### Example Extraction Output

```json
{
  "rules": [
    {
      "id": "plan-abc123",
      "type": "COMMISSION_PLAN",
      "source": "plan",
      "data": {
        "planId": "abc123",
        "planName": "FY2026 Sales Comp",
        "payoutDates": ["2026-01-31", "2026-02-28", ...],
        "employeeCount": 7
      }
    },
    {
      "id": "ea-plan-abc123",
      "type": "EMPLOYEE_ASSUMPTIONS",
      "source": "employee-assumptions",
      "data": {
        "planId": "abc123",
        "employees": [
          { "name": "Jane Smith", "role": "RSD", "variableAmount": 50000, "territory": "West" }
        ]
      }
    }
  ],
  "count": 7
}
```

### Rate Limits

- **Burst**: 5 requests/second
- **Hourly**: 1,500 requests/hour (Standard tier)

### Important Notes

- CaptivateIQ's API does **not** expose SmartGrid formula definitions, calculation component logic, or rate table bindings
- The API is a data I/O layer — rule concepts must be inferred from data patterns (quotas, territories, payout schedules, role attributes)
- Endpoint paths use hyphens: `/period-groups/`, `/data-workbooks/`, `/employee-assumptions/`, etc.

## Architecture

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
│   └── captivateiq/
│       ├── client.ts         # REST API client (Token auth, paginated)
│       └── connector.ts      # BaseConnector implementation
├── interpreter/
│   └── concept-extractor.ts  # AI interpretation (stubbed)
├── normalizer/
│   └── pipeline.ts           # Extract → Interpret → Normalize pipeline
├── config/
│   └── index.ts              # Environment and runtime config
└── dashboard/
    ├── server.ts             # HTTP server (API endpoints)
    └── index.html            # Self-contained SPA
```

### Pipeline: Connect → Extract → Interpret → Normalize

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Connect    │────▶│   Extract    │────▶│  Interpret   │────▶│  Normalize   │
│  (Auth/API)  │     │ (Raw Rules)  │     │  (External)  │     │  (Schema)    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
     │                     │                     │                     │
  Vendor API          Plans, quotas,        User copies raw       Unified JSON
  credentials         territories,          JSON to their own     consumable by
                      assumptions,          AI for concept        downstream
                      worksheets            interpretation        tools
```

The **Interpret** stage is currently external — the connector focuses on getting full, untruncated data through the API. Users copy the raw JSON output and use their own AI to identify rule concepts.

## Rule Concept Taxonomy

These are the compensation concepts the extracted data may contain:

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

## CLI Reference

```bash
# Extract raw rules from CaptivateIQ
npm run extract -- --vendor captivateiq --plan <planId>
npm run extract -- --vendor captivateiq --output ./extracted.json

# List plans
npx tsx src/cli.ts list-plans --vendor captivateiq

# Normalize extracted rules (requires AI interpretation)
npm run normalize -- --input ./extracted-rules.json --output ./normalized.json

# Launch dashboard
npm run dashboard
```

## Configuration

### Environment Variables

```bash
# CaptivateIQ (generate in User Profile → API Tokens)
CAPTIVATEIQ_API_TOKEN=

# AI Provider (for future rule interpretation)
ANTHROPIC_API_KEY=
AICR_GATEWAY_URL=
AICR_API_KEY=

# Other vendors (planned)
VARICENT_BASE_URL=
VARICENT_CLIENT_ID=
VARICENT_CLIENT_SECRET=
XACTLY_BASE_URL=
XACTLY_API_KEY=
XACTLY_API_SECRET=
SAP_SF_BASE_URL=
SAP_SF_CLIENT_ID=
SAP_SF_CLIENT_SECRET=
SALESFORCE_BASE_URL=
SALESFORCE_CLIENT_ID=
SALESFORCE_CLIENT_SECRET=
```

## Development

```bash
npm install          # Install dependencies
npm run dev          # Run in watch mode
npm run build        # Compile TypeScript
npm test             # Run test suite (Vitest)
npm run type-check   # Type-check without emitting
npm run dashboard    # Launch dashboard UI
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (strict) |
| Validation | Zod |
| Runtime | Node.js 20+ |
| Testing | Vitest |
| Dashboard | Zero-dependency (Node HTTP + vanilla HTML/CSS/JS) |

## Related Projects

| Project | Relationship |
|---------|-------------|
| **Commission Calculator** | Primary consumer — real-time commissions from normalized rules |
| **SGM/SPARCC** | Governance consumer — gap analysis against normalized rules |
| **IntelligentSPM** | Knowledge base — 929 SPM domain cards |
| **Pay Curves** | Analytics — pay curve visualizations from normalized data |
