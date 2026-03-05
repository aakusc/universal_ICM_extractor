/**
 * ICM Builder CLI — terminal-based workflow for the builder platform
 *
 * Usage:
 *   npx tsx src/cli.ts builder projects [list]
 *   npx tsx src/cli.ts builder projects create --name "Plan Name" [--desc "..."]
 *   npx tsx src/cli.ts builder projects show --id <projectId>
 *   npx tsx src/cli.ts builder projects delete --id <projectId>
 *   npx tsx src/cli.ts builder upload --project <id> --file <path>
 *   npx tsx src/cli.ts builder extract --project <id> --file <fileId>
 *   npx tsx src/cli.ts builder generate --project <id> --file <fileId>
 *   npx tsx src/cli.ts builder aggregate --project <id>
 *   npx tsx src/cli.ts builder export --project <id> [--file <fileId>] [--output <path>]
 */

import fs from 'node:fs';
import path from 'node:path';
import * as store from './project/store.js';
import { parseExcelBuffer } from './excel/parser.js';
import { extractRulesFromWorkbook } from './excel/extractor.js';
import { generatePayloads } from './generators/index.js';
import { aggregateExtractions } from './generators/aggregator.js';

// ── Helpers ──────────────────────────────────────────────────

function getArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index !== -1 ? args[index + 1] : undefined;
}

function requireArg(args: string[], name: string): string {
  const value = getArg(args, name);
  if (!value) {
    console.error(`Missing required argument: --${name}`);
    process.exit(1);
  }
  return value;
}

function fmt(date: string): string {
  return new Date(date).toLocaleString();
}

function bytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

// ── Project Commands ─────────────────────────────────────────

function projectsList(): void {
  const projects = store.listProjects();
  if (projects.length === 0) {
    console.log('No projects yet. Create one with: builder projects create --name "My Plan"');
    return;
  }
  console.log(`\n  Projects (${projects.length}):\n`);
  for (const p of projects) {
    const files = store.listFiles(p.id);
    const extractions = store.listExtractionMeta(p.id);
    console.log(`  ${p.id}  ${p.name}`);
    console.log(`    ${files.length} files, ${extractions.length} extractions — updated ${fmt(p.updatedAt)}`);
    if (p.description) console.log(`    ${p.description}`);
  }
  console.log('');
}

function projectsCreate(args: string[]): void {
  const name = requireArg(args, 'name');
  const description = getArg(args, 'desc');
  const project = store.createProject(name, description);
  console.log(`\n  ✓ Created project: ${project.name}`);
  console.log(`    ID: ${project.id}\n`);
}

function projectsShow(args: string[]): void {
  const id = requireArg(args, 'id');
  const project = store.getProject(id);
  if (!project) {
    console.error(`Project not found: ${id}`);
    process.exit(1);
  }

  console.log(`\n  Project: ${project.name}`);
  console.log(`  ID: ${project.id}`);
  if (project.description) console.log(`  Description: ${project.description}`);
  console.log(`  Created: ${fmt(project.createdAt)}`);
  console.log(`  Updated: ${fmt(project.updatedAt)}`);

  // Files
  const files = store.listFiles(project.id);
  if (files.length > 0) {
    console.log(`\n  Files (${files.length}):`);
    for (const f of files) {
      const extracted = store.listExtractionMeta(project.id).some((e) => e.fileId === f.id);
      const status = extracted ? '✓ extracted' : f.parsedAt ? '• parsed' : '○ uploaded';
      console.log(`    ${f.id}  ${f.originalName} (${bytes(f.size)}) [${status}]`);
    }
  }

  // Requirements
  const reqs = store.listRequirements(project.id);
  if (reqs.length > 0) {
    console.log(`\n  Requirements (${reqs.length}):`);
    for (const r of reqs) {
      console.log(`    [${r.priority.toUpperCase()}] ${r.text}`);
    }
  }

  // Notes
  const notes = store.listNotes(project.id);
  if (notes.length > 0) {
    console.log(`\n  Notes (${notes.length}):`);
    for (const n of notes) {
      console.log(`    [${n.createdAt.split('T')[0]}] ${n.text}`);
    }
  }

  // Extractions
  const extractions = store.listExtractionMeta(project.id);
  if (extractions.length > 0) {
    console.log(`\n  Extractions (${extractions.length}):`);
    for (const e of extractions) {
      const file = store.getFile(e.fileId);
      console.log(`    ${e.id}  ${file?.originalName ?? e.fileId} — ${fmt(e.extractedAt)}`);
    }
  }

  console.log('');
}

function projectsDelete(args: string[]): void {
  const id = requireArg(args, 'id');
  const project = store.getProject(id);
  if (!project) {
    console.error(`Project not found: ${id}`);
    process.exit(1);
  }
  store.deleteProject(id);
  console.log(`\n  ✓ Deleted project: ${project.name} (${id})\n`);
}

// ── File Upload ──────────────────────────────────────────────

function uploadFile(args: string[]): void {
  const projectId = requireArg(args, 'project');
  const filePath = requireArg(args, 'file');

  const project = store.getProject(projectId);
  if (!project) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(resolved);
  const originalName = path.basename(resolved);
  const ext = path.extname(originalName).toLowerCase();
  const mimeType = ext === '.xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : ext === '.xls'
      ? 'application/vnd.ms-excel'
      : ext === '.csv'
        ? 'text/csv'
        : 'application/octet-stream';

  const file = store.saveFile(projectId, originalName, buffer, mimeType);

  // Attempt parse
  try {
    parseExcelBuffer(buffer, originalName);
    store.markFileParsed(file.id);
    console.log(`\n  ✓ Uploaded and parsed: ${originalName} (${bytes(buffer.length)})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    store.markFileParsed(file.id, msg);
    console.log(`\n  ✓ Uploaded: ${originalName} (${bytes(buffer.length)})`);
    console.log(`  ⚠ Parse warning: ${msg}`);
  }

  console.log(`    File ID: ${file.id}`);
  console.log(`    Project: ${project.name}\n`);
}

// ── AI Extraction ────────────────────────────────────────────

async function extractFile(args: string[]): Promise<void> {
  const projectId = requireArg(args, 'project');
  const fileId = requireArg(args, 'file');

  const project = store.getProject(projectId);
  if (!project) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const file = store.getFile(fileId);
  if (!file || file.projectId !== projectId) {
    console.error(`File not found in project: ${fileId}`);
    process.exit(1);
  }

  const filePath = store.getFilePath(file.storedName);
  if (!fs.existsSync(filePath)) {
    console.error(`File blob missing from disk: ${filePath}`);
    process.exit(1);
  }

  console.log(`\n  Extracting rules from: ${file.originalName}`);
  console.log(`  Project: ${project.name}`);
  console.log(`  Using Claude Opus 4.6 with adaptive thinking...\n`);

  const buffer = fs.readFileSync(filePath);
  const workbook = parseExcelBuffer(buffer, file.originalName);
  const requirements = store.listRequirements(projectId);
  const notes = store.listNotes(projectId);

  let result;
  try {
    result = await extractRulesFromWorkbook({
      projectId,
      fileId,
      workbook,
      requirements: requirements.map((r) => ({ text: r.text, priority: r.priority })),
      notes: notes.map((n) => ({ text: n.text, createdAt: n.createdAt })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n  ✗ AI extraction failed: ${msg}`);
    console.error(`    This may be due to a network error, API quota limit, or invalid API key.`);
    console.error(`    Check your ANTHROPIC_API_KEY environment variable and try again.\n`);
    process.exit(1);
  }

  store.saveExtraction(result);

  console.log(`\n  ✓ Extraction complete`);
  console.log(`    Rules found: ${result.rules.length}`);
  console.log(`    Data worksheets: ${result.captivateiqConfig.dataWorksheets.length}`);
  console.log(`    Employee assumptions: ${result.captivateiqConfig.employeeAssumptionColumns.length}`);
  console.log(`    Attribute worksheets: ${result.captivateiqConfig.attributeWorksheets.length}`);
  console.log(`    Formula recommendations: ${result.captivateiqConfig.formulaRecommendations.length}`);
  console.log(`    Extraction ID: ${result.id}\n`);
}

// ── Generate Payloads ────────────────────────────────────────

function generateFile(args: string[]): void {
  const projectId = requireArg(args, 'project');
  const fileId = requireArg(args, 'file');

  const extraction = store.getExtraction(projectId, fileId);
  if (!extraction) {
    console.error(`No extraction found for project=${projectId}, file=${fileId}`);
    console.error('Run extraction first: builder extract --project <id> --file <id>');
    process.exit(1);
  }

  console.log(`\n  Generating CaptivateIQ API payloads from extraction...`);
  const payloads = generatePayloads(extraction.captivateiqConfig);
  store.saveGeneration(projectId, fileId, payloads);

  console.log(`  ✓ Generated payloads`);
  console.log(`    Plan: ${payloads.plan.name} (${payloads.plan.period_type})`);
  console.log(`    Data worksheets: ${payloads.dataWorksheets.length}`);
  console.log(`    Employee assumptions: ${payloads.employeeAssumptions.columns.length}`);
  console.log(`    Attribute worksheets: ${payloads.attributeWorksheets.length}`);
  console.log(`    Formula references: ${payloads.formulaReference.formulas.length}`);
  console.log(`    Generated at: ${payloads.summary.generatedAt}\n`);
}

// ── Aggregate ────────────────────────────────────────────────

function aggregateProject(args: string[]): void {
  const projectId = requireArg(args, 'project');

  const project = store.getProject(projectId);
  if (!project) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const extractions = store.getProjectExtractions(projectId);
  if (extractions.length === 0) {
    console.error(`No extractions found for project: ${project.name}`);
    console.error('Extract files first: builder extract --project <id> --file <id>');
    process.exit(1);
  }

  if (extractions.length < 2) {
    console.log(`\n  Only 1 extraction found — use 'generate' for single-file payloads.`);
    console.log(`  Aggregation requires 2+ extracted files.\n`);
    return;
  }

  console.log(`\n  Aggregating ${extractions.length} extractions for: ${project.name}`);

  const aggregated = aggregateExtractions(projectId, extractions);
  const payloads = generatePayloads(aggregated.mergedConfig);
  store.saveAggregatedGeneration(projectId, aggregated, payloads);

  console.log(`  ✓ Aggregated successfully`);
  console.log(`    Sources: ${aggregated.sources.map((s) => s.fileName).join(', ')}`);
  console.log(`    Data worksheets: ${aggregated.stats.dataWorksheetCount}`);
  console.log(`    Employee assumptions: ${aggregated.stats.employeeAssumptionCount}`);
  console.log(`    Attribute worksheets: ${aggregated.stats.attributeWorksheetCount}`);
  console.log(`    Formulas: ${aggregated.stats.formulaCount}\n`);
}

// ── Export ────────────────────────────────────────────────────

function exportPayloads(args: string[]): void {
  const projectId = requireArg(args, 'project');
  const fileId = getArg(args, 'file');
  const outputPath = getArg(args, 'output');

  const project = store.getProject(projectId);
  if (!project) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  let payloads;
  let label = 'unknown';

  if (fileId) {
    // Export single-file generation
    payloads = store.getGeneration(projectId, fileId);
    if (!payloads) {
      console.error(`No generated payloads for file ${fileId}. Run 'generate' first.`);
      process.exit(1);
    }
    const file = store.getFile(fileId);
    label = file?.originalName ?? fileId;
  } else {
    // Export aggregated generation
    const agg = store.getAggregatedGeneration(projectId);
    if (agg) {
      payloads = agg.payloads;
      label = 'aggregated';
    } else {
      // Fall back to single file if only one extraction
      const extractions = store.listExtractionMeta(projectId);
      if (extractions.length === 1) {
        payloads = store.getGeneration(projectId, extractions[0].fileId);
        const file = store.getFile(extractions[0].fileId);
        label = file?.originalName ?? extractions[0].fileId;
      }
      if (!payloads) {
        console.error(`No generated payloads found. Run 'generate' or 'aggregate' first.`);
        process.exit(1);
      }
    }
  }

  const outFile = outputPath ?? `ciq-payloads-${projectId.slice(0, 13)}.json`;
  fs.writeFileSync(outFile, JSON.stringify(payloads, null, 2));
  console.log(`\n  ✓ Exported payloads for: ${label}`);
  console.log(`    Output: ${path.resolve(outFile)}\n`);
}

// ── Help ─────────────────────────────────────────────────────

function showHelp(): void {
  console.log(`
  ICM Rule Builder CLI

  Usage: npx tsx src/cli.ts builder <command> [options]

  Project Management:
    projects [list]                          List all projects
    projects create --name <name> [--desc <description>]
    projects show   --id <projectId>         Show project details
    projects delete --id <projectId>         Delete project and all data

  File Management:
    upload --project <id> --file <path>      Upload an Excel file

  AI Extraction:
    extract --project <id> --file <fileId>   Run Claude AI extraction

  Payload Generation:
    generate  --project <id> --file <fileId> Generate CaptivateIQ API payloads
    aggregate --project <id>                 Aggregate all extractions in project

  Export:
    export --project <id> [--file <fileId>] [--output <path>]
                                             Export payloads to JSON file

  Examples:
    npx tsx src/cli.ts builder projects create --name "FY2026 Sales Plan"
    npx tsx src/cli.ts builder upload --project abc123 --file ./quota-table.xlsx
    npx tsx src/cli.ts builder extract --project abc123 --file def456
    npx tsx src/cli.ts builder generate --project abc123 --file def456
    npx tsx src/cli.ts builder aggregate --project abc123
    npx tsx src/cli.ts builder export --project abc123 --output ./payloads.json
`);
}

// ── Router ───────────────────────────────────────────────────

/**
 * Entry point for `cli.ts builder ...` commands.
 * @param args — everything after `builder` in argv
 */
export async function runBuilderCli(args: string[]): Promise<void> {
  const sub = args[0];

  switch (sub) {
    case 'projects': {
      const action = args[1];
      switch (action) {
        case 'create':
          projectsCreate(args.slice(1));
          break;
        case 'show':
          projectsShow(args.slice(1));
          break;
        case 'delete':
          projectsDelete(args.slice(1));
          break;
        case 'list':
        case undefined:
          projectsList();
          break;
        default:
          console.error(`Unknown projects action: ${action}`);
          showHelp();
          process.exit(1);
      }
      break;
    }

    case 'upload':
      uploadFile(args);
      break;

    case 'extract':
      await extractFile(args);
      break;

    case 'generate':
      generateFile(args);
      break;

    case 'aggregate':
      aggregateProject(args);
      break;

    case 'export':
      exportPayloads(args);
      break;

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showHelp();
      break;

    default:
      console.error(`Unknown builder command: ${sub}`);
      showHelp();
      process.exit(1);
  }
}
