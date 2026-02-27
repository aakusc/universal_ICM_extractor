# Universal ICM Connector

## Overview

The Universal ICM Connector is a generic extraction and normalization engine that pulls compensation plan rules from any Incentive Compensation Management (ICM) system and converts them into a vendor-agnostic schema. The key differentiator: it extracts **rule concepts** (the business intent behind a rule) rather than copying raw vendor-specific rule objects.

### Why Concepts, Not Objects?

Every ICM vendor stores compensation rules differently:
- **Varicent** uses hierarchical rule trees with position-based inheritance
- **Xactly** uses flat incentive components with formula expressions
- **SAP SuccessFactors** uses XML-based rule definitions with deep nesting
- **Salesforce/Spiff** uses object-based rules with Apex/formula syntax

But they all express the same underlying **business concepts**: "pay 5% on revenue above quota", "split credit 60/40 between overlay and territory rep", "claw back if deal churns within 90 days."

The Universal ICM Connector uses AI interpretation to recognize these concepts regardless of vendor syntax, producing a normalized output any downstream tool can consume.

## Architecture

### Pipeline: Connect → Extract → Interpret → Normalize

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Universal ICM Connector                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │ Connect  │──▶│ Extract  │──▶│  Interpret    │──▶│  Normalize   │        │
│  │          │   │          │   │  (AI Layer)   │   │              │        │
│  └──────────┘   └──────────┘   └──────────────┘   └──────────────┘        │
│       │              │                │                    │                │
│   Auth/API      Raw vendor        Concept            Vendor-agnostic       │
│   credentials   rule objects      extraction         normalized JSON       │
│                                                                             │
│  Vendor Connectors:                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌──────────┐      │
│  │ Varicent │ │  Xactly  │ │   SAP    │ │CaptivateIQ │ │Salesforce│      │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ └──────────┘      │
│                                                                             │
│  Downstream Consumers:                                                      │
│  ┌──────────────────┐ ┌──────────────┐ ┌──────────────────────┐           │
│  │ Commission Calc  │ │  Pay Curves  │ │ Modeling/Simulation  │           │
│  └──────────────────┘ └──────────────┘ └──────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Stage 1: Connect

Each vendor connector implements the `IConnector` interface and handles authentication against the target ICM system. Supported auth methods vary by vendor (OAuth2, API key, SAML, basic auth).

### Stage 2: Extract

Connectors pull raw compensation plan rules from the vendor API. This includes:
- Rate tables and commission schedules
- Accelerator/decelerator definitions
- Qualifier and gate conditions
- Credit and split rules
- Territory assignments
- Quota targets and allocation rules
- Draw, cap, floor, SPIF, and clawback rules

### Stage 3: Interpret (AI Layer)

The AI interpreter analyzes raw vendor rules and identifies the underlying business concept. This is the core innovation — instead of building brittle vendor-specific field mappings, the interpreter uses LLM reasoning to understand rule intent.

**Example:**
```
Varicent raw rule:
  { ruleType: "COMM_TABLE", tiers: [{min: 0, max: 100, rate: 0.05}, {min: 100, max: null, rate: 0.08}] }

Interpreted concept:
  "Tiered rate table: 5% base commission up to 100% quota, accelerator to 8% above quota"

Classified as:
  [RateTable, Accelerator]
```

### Stage 4: Normalize

Interpreted concepts are transformed into the vendor-agnostic normalized schema — a standardized JSON format that any downstream SPM tool can consume without knowing which ICM system the rules came from.

## Normalized Schema

The output schema is defined using Zod and covers all rule concept types:

### NormalizedPlan
Top-level container for a compensation plan's extracted rules.

```typescript
{
  id: string;                    // Unique plan identifier
  sourceVendor: VendorId;        // Origin ICM system
  sourcePlanId: string;          // Original plan ID in vendor system
  extractedAt: string;           // ISO timestamp
  planName: string;              // Human-readable plan name
  effectivePeriod: {
    start: string;               // ISO date
    end: string;                 // ISO date
  };
  rules: NormalizedRule[];       // Extracted and normalized rules
  metadata: Record<string, unknown>;
}
```

### NormalizedRule
Individual rule concept with classification and parameters.

```typescript
{
  id: string;                    // Rule identifier
  concept: RuleConcept;          // Concept category (see taxonomy)
  description: string;           // AI-generated plain-english description
  parameters: Record<string, unknown>; // Concept-specific parameters
  confidence: number;            // AI interpretation confidence (0-1)
  sourceRef: {                   // Traceability back to vendor
    vendorRuleId: string;
    vendorRuleType: string;
    rawSnapshot: unknown;        // Original vendor data
  };
}
```

### Rule Concept Taxonomy

| Concept | Parameters | Description |
|---------|-----------|-------------|
| `rate-table` | tiers, method (flat/tiered/matrix), measure | Commission rate lookup |
| `accelerator` | threshold, multiplier, tiers | Rate increase above quota |
| `decelerator` | threshold, multiplier, tiers | Rate decrease below quota |
| `qualifier` | metric, operator, value, gate | Gate condition for eligibility |
| `split` | participants, ratios, method | Credit splitting rules |
| `territory` | assignments, hierarchy, rules | Geographic/account assignment |
| `quota-target` | amount, period, allocation | Quota definition and allocation |
| `draw` | amount, type (recoverable/non), period | Guaranteed minimum |
| `spif` | criteria, reward, duration | Special incentive/bonus/contest |
| `cap` | maxAmount, period, scope | Maximum earning limit |
| `floor` | minAmount, period, scope | Minimum earning guarantee |
| `clawback` | triggerEvent, lookbackPeriod, method | Commission recovery rule |

## Vendor Connector Details

### Varicent (formerly Verisent)

- **API**: REST API with OAuth2
- **Rule format**: Hierarchical rule trees, position-based inheritance
- **Key entities**: Plans, Components, Rules, RateTables, Positions
- **Notes**: Rules inherit through position hierarchy; must resolve inheritance before interpretation

### Xactly (Exactly)

- **API**: REST/SOAP hybrid
- **Rule format**: Flat incentive components with formula expressions
- **Key entities**: Plans, IncentiveComponents, Formulas, Quotas, Credits
- **Notes**: Formula expressions need parsing; Xactly uses its own expression language

### SAP SuccessFactors ICM

- **API**: OData v4
- **Rule format**: XML-based rule definitions, deeply nested
- **Key entities**: CompensationPlans, RuleDefinitions, PayoutStructures
- **Notes**: Complex XML schema; rule nesting can be 5+ levels deep

### CaptivateIQ

- **API**: REST API with Token auth (`Authorization: Token <token>`)
- **Base URL**: `https://api.captivateiq.com/ciq/v1/`
- **Status**: **Implemented** — first working connector
- **Docs**: https://developers.captivateiq.com/docs
- **Rate limits**: 5 req/s burst, 1500 req/hr (Standard tier)
- **Key entities**: CommissionPlans, PeriodGroups, DataWorkbooks, DataWorksheets, WorksheetRecords, Employees, ReportModels
- **Extraction strategy**:
  1. List commission plans → plan structure (COMMISSION_PLAN rules)
  2. Fetch period groups per plan → period definitions (PERIOD_GROUP rules)
  3. List data workbooks/worksheets → rate tables, quotas (DATA_WORKSHEET rules)
  4. Fetch worksheet records → raw rule data for AI interpretation
  5. List report models → calculated commission structures (REPORT_MODEL rules)
- **Auth setup**: Generate token in CaptivateIQ → User Profile → API Tokens
- **Notes**: 80+ API endpoints across 18 resource categories. Paginated responses with next/previous cursors. Forrester Wave Leader in ICM.

### Salesforce (Spiff / ICM)

- **API**: Salesforce REST API / Spiff API
- **Rule format**: Object-based with Apex formula syntax
- **Key entities**: IncentivePlans, CommissionRules, Quotas, Territories
- **Notes**: Salesforce ecosystem; may require Apex formula parsing

## Usage

### As a Library

```typescript
import { createConnector, extractAndNormalize } from 'universal-icm-connector';

// Create a vendor connector
const connector = createConnector('varicent', {
  baseUrl: 'https://api.varicent.com',
  clientId: process.env.VARICENT_CLIENT_ID,
  clientSecret: process.env.VARICENT_CLIENT_SECRET,
});

// Extract and normalize in one step
const normalizedPlan = await extractAndNormalize(connector, {
  planId: 'FY2026-SALES-PLAN',
  aiProvider: 'claude',
});

console.log(normalizedPlan.rules);
// [
//   { concept: 'rate-table', description: 'Tiered commission: 5% base, 8% above quota', ... },
//   { concept: 'accelerator', description: 'Accelerator above 100% quota to 8%', ... },
//   { concept: 'qualifier', description: 'Must achieve 80% quota to qualify', ... },
// ]
```

### CLI

```bash
# Extract raw rules from a vendor
npx universal-icm-connector extract --vendor varicent --plan FY2026-SALES

# Normalize previously extracted rules
npx universal-icm-connector normalize --input ./raw-rules.json --output ./normalized.json

# Full pipeline: extract + interpret + normalize
npx universal-icm-connector pipeline --vendor varicent --plan FY2026-SALES --output ./output.json
```

## Configuration

Configuration is loaded from environment variables and/or a JSON config file.

### Environment Variables

```bash
# AI Provider (for rule interpretation)
ANTHROPIC_API_KEY=         # Claude API key (preferred)
AICR_GATEWAY_URL=          # AICR Gateway URL (if using gateway)
AICR_API_KEY=              # AICR Gateway API key

# Varicent
VARICENT_BASE_URL=
VARICENT_CLIENT_ID=
VARICENT_CLIENT_SECRET=

# Xactly
XACTLY_BASE_URL=
XACTLY_API_KEY=
XACTLY_API_SECRET=

# SAP SuccessFactors
SAP_SF_BASE_URL=
SAP_SF_CLIENT_ID=
SAP_SF_CLIENT_SECRET=

# CaptivateIQ (generate in CaptivateIQ → User Profile → API Tokens)
CAPTIVATEIQ_API_TOKEN=

# Salesforce
SALESFORCE_BASE_URL=
SALESFORCE_CLIENT_ID=
SALESFORCE_CLIENT_SECRET=
```

## Development

```bash
npm install          # Install dependencies
npm run dev          # Run in watch mode
npm run build        # Compile TypeScript
npm test             # Run test suite
npm run type-check   # Type-check without emitting
```

## Related Projects

| Project | Relationship |
|---------|-------------|
| **Commission Calculator** | Primary consumer — displays real-time commissions from normalized rules |
| **SGM/SPARCC** | Governance consumer — runs gap analysis against normalized rules |
| **IntelligentSPM** | Knowledge base — 929 SPM domain cards inform AI interpretation |
| **Pay Curves** | Analytics consumer — builds pay curve visualizations from normalized data |
| **Modeling & Simulation** | Uses normalized rules for Monte Carlo and what-if analysis |
