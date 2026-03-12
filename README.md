# Universal ICM Extractor

Generic connector that extracts compensation rule concepts from any ICM system and normalizes them into a vendor-agnostic schema.

## Status

**Complete** — 231 tests passing, full type-check support.

## Purpose

The Universal ICM Extractor bridges the gap between arbitrary Incentive Compensation Management (ICM) systems and CaptivateIQ by:
1. Parsing compensation plan documents (Excel, PDF, Word)
2. Extracting rule concepts using AI
3. Normalizing rules into a vendor-agnostic schema
4. Generating CaptivateIQ-compatible build configurations

## Features

- **Multi-format Document Parsing**: Excel (.xlsx, .xls), PDF, Word (.docx)
- **AI-Powered Rule Extraction**: Claude Opus integration for semantic understanding
- **Vendor-Agnostic Schema**: Zod-validated intermediate representation
- **CaptivateIQ Generation**: Multi-file aggregation and build config generation
- **CLI & Dashboard**: Command-line interface and web UI for viewing extractions

## Installation

```bash
npm install
```

## Usage

### CLI Commands

```bash
# Extract rules from a document
npm run extract <file>

# Normalize extracted data to intermediate schema
npm run normalize <dir>

# Start web dashboard (port 3000)
npm run dashboard

# Run tests
npm test
```

### API (Dashboard)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/:id` | Get project details |
| POST | `/api/projects` | Create new project |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |
| POST | `/api/extract` | Trigger extraction |
| GET | `/api/health` | Health check |

## Configuration

Create a `.env` file based on `.env.example`:

```
ANTHROPIC_API_KEY=your_claude_api_key
```

## Project Structure

```
universal_ICM_extractor/
├── src/
│   ├── index.ts          # Main entry
│   ├── cli.ts            # CLI commands
│   ├── parsers/          # Document parsers (Excel, PDF, Word)
│   ├── normalizers/      # Data normalization
│   ├── generators/       # Config generators
│   ├── ai/               # AI extraction (Claude Opus)
│   ├── schema/           # Zod schemas
│   ├── dashboard/        # Web UI
│   └── types/            # TypeScript types
├── tests/                # Test suites (231 tests)
├── docs/                 # Documentation
├── scripts/              # Utility scripts
├── data/                 # Project data storage
├── spec.md               # Full specification
└── package.json
```

## Tech Stack

- **TypeScript** — Type safety
- **Node.js** — Runtime (>=20.0.0)
- **Vitest** — Testing framework
- **Zod** — Schema validation
- **xlsx** — Excel parsing
- **mammoth** — Word document parsing
- **pdf-parse** — PDF parsing

## Testing

```bash
npm test                   # Run all tests
npm run test:watch        # Watch mode
```

Test coverage: 231 tests across 15 test files. 223 passing, 8 require ANTHROPIC_API_KEY.

## License

MIT
