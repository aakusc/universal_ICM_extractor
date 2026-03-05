---
title: Universal ICM Extractor
status: complete
created: 2026-03-01
agents: [claude, colin]
---

## Description

Generic connector that extracts compensation rule concepts from any ICM system and normalizes them into a vendor-agnostic schema. Parses Excel compensation plans, uses AI (Claude Opus) for rule extraction, and generates CaptivateIQ configuration.

## Purpose

The Universal ICM Extractor bridges the gap between arbitrary Incentive Compensation Management (ICM) systems and CaptivateIQ by:
1. Parsing compensation plan documents (Excel, PDF, Word)
2. Extracting rule concepts using AI
3. Normalizing rules into a vendor-agnostic schema
4. Generating CaptivateIQ-compatible build configurations

## Architecture

### Core Components

- **Parsers** (`src/parsers/`): Document ingestion (Excel via `xlsx`, PDF via `pdf-parse`, Word via `mammoth`)
- **Normalizers** (`src/normalizers/`): Convert parsed data to intermediate schema
- **Generators** (`src/generators/`): Output CaptivateIQ config (YAML/JSON)
- **AI Engine** (`src/ai/`): Claude Opus integration for rule extraction
- **CLI** (`src/cli.ts`): Command-line interface for extract/normalize operations
- **Dashboard** (`src/dashboard/`): Web UI for viewing and managing extractions

### Data Flow

```
Excel/PDF/Word → Parsers → Normalizers → AI Rule Extraction → Generators → CaptivateIQ Config
                                              ↓
                                    Intermediate Schema (Zod)
```

### Key Features

1. **Multi-format Document Parsing**
   - Excel (.xlsx, .xls) - primary format
   - PDF documents
   - Word (.docx)

2. **AI-Powered Rule Extraction**
   - Claude Opus integration for semantic understanding
   - Pattern recognition for compensation structures
   - Tier/bracket/performance bucket identification

3. **Vendor-Agnostic Schema**
   - Zod-validated intermediate representation
   - Supports multiple output formats

4. **CaptivateIQ Generation**
   - Multi-file aggregation
   - Build config generation
   - Direct API payload preparation

5. **CLI & Dashboard**
   - `npm run extract` - Extract from documents
   - `npm run normalize` - Normalize to intermediate schema
   - `npm run dashboard` - Web UI (port 3000)

## External Dependencies

### Runtime
- `xlsx@^0.18.5` - Excel parsing
- `mammoth@^1.11.0` - Word document parsing
- `pdf-parse@^2.4.5` - PDF parsing
- `zod@^3.23.0` - Schema validation
- `dotenv@^16.4.0` - Environment configuration

### Development
- `typescript@^5.6.0` - Type safety
- `vitest@^2.1.0` - Testing framework
- `tsx@^4.21.0` - TypeScript execution
- `eslint@^9.0.0` - Linting

### Environment
- Node.js >=20.0.0
- Claude API key (ANTHROPIC_API_KEY)

## API Endpoints (Dashboard)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/:id` | Get project details |
| POST | `/api/projects` | Create new project |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |
| POST | `/api/extract` | Trigger extraction |
| GET | `/api/health` | Health check |

## Testing

- **Framework**: Vitest
- **Coverage**: 231 tests across 15 test files
- **Status**: All passing

## File Structure

```
universal_ICM_extractor/
├── src/
│   ├── index.ts          # Main entry
│   ├── cli.ts            # CLI commands
│   ├── parsers/          # Document parsers
│   ├── normalizers/      # Data normalization
│   ├── generators/       # Config generators
│   ├── ai/               # AI extraction
│   ├── schema/           # Zod schemas
│   ├── dashboard/        # Web UI
│   └── types/            # TypeScript types
├── tests/                # Test suites
├── docs/                 # Documentation
├── scripts/              # Utility scripts
├── data/                 # Project data storage
└── package.json
```

## CLI Commands

```bash
npm run extract <file>     # Extract rules from document
npm run normalize <dir>    # Normalize extracted data
npm run dashboard          # Start web UI
npm test                   # Run tests
```

## Status

All goals completed. Project is functional with full test coverage.
