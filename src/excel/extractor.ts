/**
 * AI Rule Extractor — Multi-format input → NormalizedRules + CaptivateIQ config
 *
 * Uses Claude CLI with adaptive thinking to analyze compensation data from:
 *   - Excel workbooks (parsed sheets, formulas, named ranges)
 *   - PDF documents (text content)
 *   - Word documents (text content)
 *   - CSV files (tabular data)
 *   - Text files / notes (plain text)
 *
 * All sources are combined into a single AI prompt for holistic analysis.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workbookToPromptString } from './parser.js';
import { documentToPromptString, type ParsedDocument } from '../documents/parser.js';
import type { ParsedWorkbook } from '../project/types.js';
import type { ExtractionResult, CaptivateIQBuildConfig } from '../project/types.js';
import type { NormalizedRule } from '../types/normalized-schema.js';
import { generateId } from '../project/store.js';

export interface ExtractorInput {
  projectId: string;
  fileId: string;
  workbook: ParsedWorkbook;
  requirements: Array<{ text: string; priority: string }>;
  notes: Array<{ text: string; createdAt: string }>;
}

/**
 * Bulk extractor input — all files for a project at once.
 */
export interface BulkExtractorInput {
  projectId: string;
  workbooks: Array<{ fileId: string; workbook: ParsedWorkbook }>;
  documents: Array<{ fileId: string; document: ParsedDocument }>;
  requirements: Array<{ text: string; priority: string }>;
  notes: Array<{ text: string; createdAt: string }>;
}

/**
 * Single document extractor input — for PDF, DOCX, TXT files.
 */
export interface DocumentExtractorInput {
  projectId: string;
  fileId: string;
  document: ParsedDocument;
  requirements: Array<{ text: string; priority: string }>;
  notes: Array<{ text: string; createdAt: string }>;
}

const SYSTEM_PROMPT = `You are an expert in Sales Performance Management (SPM) and Incentive Compensation Management (ICM). You specialize in analyzing compensation plans from multiple sources — Excel calculators, PDF plan documents, Word docs, CSVs, and notes — to understand the underlying business rules and translate them into structured ICM system configurations.

Your task is to analyze ALL provided source materials and:
1. Cross-reference information across all documents to build a complete picture
2. Identify all compensation plan rules and business logic
3. Extract each rule as a structured NormalizedRule object
4. Generate a complete CaptivateIQ implementation configuration
5. Consolidate numeric data from all sources into structured tables

Rule concepts to identify:
- rate-table: Commission rate lookup (flat, tiered, matrix)
- accelerator: Rate increase above quota threshold
- decelerator: Rate decrease below quota threshold
- qualifier: Gate condition for eligibility
- split: Credit splitting between reps/roles
- territory: Geographic or account assignment rules
- quota-target: Quota/target definition and allocation
- draw: Guaranteed minimum / recoverable draw
- spif: Special incentive / bonus / contest
- cap: Maximum earning limit
- floor: Minimum earning guarantee
- clawback: Commission recovery rule

For CaptivateIQ, note:
- CaptivateIQ's API does NOT expose SmartGrid formula definitions
- Rate tables → Data Worksheets with tier rows
- Quotas/targets → Employee Assumption columns
- Territory/role mappings → Attribute Worksheets
- Calculation logic → Formula Recommendations (pseudocode)
- Plans are structured around Period Groups and Payout Worksheets

IMPORTANT: Cross-reference ALL documents. A PDF may describe rules that an Excel file implements numerically. Notes may clarify edge cases. Use ALL sources together.`;

function buildUserPrompt(input: ExtractorInput): string {
  const parts: string[] = [];

  parts.push('# Analyze This Compensation Calculator Workbook');
  parts.push('');
  parts.push(workbookToPromptString(input.workbook));

  if (input.requirements.length > 0) {
    parts.push('## Project Requirements');
    for (const req of input.requirements) {
      parts.push(`- [${req.priority.toUpperCase()}] ${req.text}`);
    }
    parts.push('');
  }

  if (input.notes.length > 0) {
    parts.push('## Project Notes');
    for (const note of input.notes) {
      parts.push(`- [${note.createdAt.split('T')[0]}] ${note.text}`);
    }
    parts.push('');
  }

  parts.push(JSON_TASK_PROMPT);
  return parts.join('\n');
}

function buildBulkUserPrompt(input: BulkExtractorInput): string {
  const parts: string[] = [];

  parts.push('# Analyze ALL Source Materials for Compensation Plan');
  parts.push('');
  parts.push(`You have been provided ${input.workbooks.length} Excel workbook(s) and ${input.documents.length} document(s). Analyze ALL of them together to build a complete, unified compensation plan configuration.`);
  parts.push('');

  // Excel workbooks
  if (input.workbooks.length > 0) {
    parts.push('---');
    parts.push('# EXCEL WORKBOOKS');
    parts.push('');
    for (const wb of input.workbooks) {
      parts.push(workbookToPromptString(wb.workbook));
      parts.push('');
    }
  }

  // Documents (PDFs, Word, CSV, text)
  if (input.documents.length > 0) {
    parts.push('---');
    parts.push('# SUPPORTING DOCUMENTS');
    parts.push('');
    for (const doc of input.documents) {
      parts.push(documentToPromptString(doc.document));
      parts.push('');
    }
  }

  // Requirements
  if (input.requirements.length > 0) {
    parts.push('---');
    parts.push('## Project Requirements');
    for (const req of input.requirements) {
      parts.push(`- [${req.priority.toUpperCase()}] ${req.text}`);
    }
    parts.push('');
  }

  // Notes
  if (input.notes.length > 0) {
    parts.push('---');
    parts.push('## Project Notes');
    for (const note of input.notes) {
      parts.push(`- [${note.createdAt.split('T')[0]}] ${note.text}`);
    }
    parts.push('');
  }

  parts.push(JSON_TASK_PROMPT);
  return parts.join('\n');
}

function buildDocumentPrompt(input: DocumentExtractorInput): string {
  const parts: string[] = [];

  parts.push('# Analyze This Compensation Plan Document');
  parts.push('');
  parts.push(documentToPromptString(input.document));

  if (input.requirements.length > 0) {
    parts.push('## Project Requirements');
    for (const req of input.requirements) {
      parts.push(`- [${req.priority.toUpperCase()}] ${req.text}`);
    }
    parts.push('');
  }

  if (input.notes.length > 0) {
    parts.push('## Project Notes');
    for (const note of input.notes) {
      parts.push(`- [${note.createdAt.split('T')[0]}] ${note.text}`);
    }
    parts.push('');
  }

  parts.push(JSON_TASK_PROMPT);
  return parts.join('\n');
}

const JSON_TASK_PROMPT = `## Your Task

Analyze ALL provided materials and return a JSON object with exactly this structure:

\`\`\`json
{
  "insights": "2-3 paragraph plain-English explanation of how this compensation plan works, what the key rules are, and any important observations. Cross-reference findings across all documents.",
  "rules": [
    {
      "id": "kebab-case-id",
      "concept": "rate-table|accelerator|decelerator|qualifier|split|territory|quota-target|draw|spif|cap|floor|clawback",
      "description": "Plain-English description of the rule",
      "parameters": { ...concept-specific parameters },
      "confidence": 0.0-1.0,
      "sourceRef": {
        "vendorRuleId": "source-file-and-location",
        "vendorRuleType": "EXCEL_FORMULA|EXCEL_TABLE|EXCEL_NAMED_RANGE|DOCUMENT_TEXT|CSV_DATA",
        "rawSnapshot": { "source": "...", "location": "..." }
      }
    }
  ],
  "captivateiqConfig": {
    "planStructure": {
      "planName": "suggested plan name",
      "periodType": "monthly|quarterly|annual",
      "payoutComponents": ["component 1", "component 2"],
      "notes": "implementation notes"
    },
    "dataWorksheets": [
      {
        "name": "worksheet name",
        "description": "what this table represents",
        "concept": "rate-table|spif|etc",
        "columns": [{ "name": "col", "type": "text|number|percent|date" }],
        "sampleRows": [{ "col1": "val1" }],
        "apiPayload": {}
      }
    ],
    "employeeAssumptionColumns": [
      {
        "name": "column name",
        "type": "currency|percent|text|number",
        "description": "what this assumption represents",
        "concept": "quota-target|etc",
        "exampleValue": 50000
      }
    ],
    "attributeWorksheets": [
      {
        "name": "worksheet name",
        "description": "what this maps",
        "concept": "territory|split|etc",
        "pkType": "employee|opportunity|account",
        "columns": [{ "name": "col", "type": "text|number|date" }],
        "apiPayload": {}
      }
    ],
    "formulaRecommendations": [
      {
        "concept": "accelerator|cap|etc",
        "description": "what this formula does",
        "logicExplanation": "step-by-step explanation",
        "pseudoFormula": "IF(attainment > 100%, base_rate * 1.5, base_rate)",
        "captivateiqNotes": "how to implement this in CaptivateIQ SmartGrid"
      }
    ]
  }
}
\`\`\`

CRITICAL: Your entire response must be a single JSON object starting with { and ending with }. Do NOT include any text, commentary, or markdown before or after the JSON. No prose, no preamble, no explanation — ONLY the JSON object.`;

/**
 * Run Claude CLI and return the text output.
 */
export function runClaudeCli(systemPrompt: string, userPrompt: string, model: string = 'claude-opus-4-6'): Promise<string> {
  return new Promise((resolve, reject) => {
    // Check for required API key before attempting to run
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      reject(new Error('ANTHROPIC_API_KEY is not set. Please configure it in your .env file.'));
      return;
    }

    console.log(`  [AI] Prompt size: ${(userPrompt.length / 1024).toFixed(1)}KB, running Claude CLI...`);

    const child = spawn('/opt/homebrew/bin/claude', [
      '--print',
      '--dangerously-skip-permissions',
      '--model', model,
      '--system-prompt', systemPrompt,
      '--max-turns', '1',
      '--output-format', 'text',
      '--setting-sources', '',
      '-',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    // Write prompt to stdin, then close it
    child.stdin.write(userPrompt, 'utf-8');
    child.stdin.end();

    // 5 minute timeout
    const timeout = setTimeout(() => {
      console.error('  [AI] Claude CLI timeout (8 min), killing...');
      child.kill('SIGTERM');
    }, 480_000);

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timeout);

      const out = Buffer.concat(stdoutChunks).toString('utf-8').trim();
      const errText = Buffer.concat(stderrChunks).toString('utf-8').trim();

      if (code !== 0) {
        const preview = (out || errText).slice(0, 500);
        console.error(`  [AI] Claude CLI exit code ${code}, stderr: ${errText.slice(0, 300)}, stdout preview: ${out.slice(0, 200)}`);
        reject(new Error(`Claude CLI exited with code ${code}: ${preview}`));
        return;
      }

      if (!out) {
        console.error(`  [AI] Claude CLI returned empty output. stderr: ${errText.slice(0, 300)}`);
        reject(new Error(`Claude CLI returned empty output. stderr: ${errText.slice(0, 300)}`));
        return;
      }

      console.log(`  [AI] Claude CLI responded: ${(out.length / 1024).toFixed(1)}KB`);
      resolve(out);
    });
  });
}

export function parseAiResponse(rawText: string): {
  insights: string;
  rules: NormalizedRule[];
  captivateiqConfig: CaptivateIQBuildConfig;
} {
  // Strip markdown fences if present
  let jsonText = rawText.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  // Try direct parse first
  try {
    return JSON.parse(jsonText);
  } catch {
    // Claude may have added prose before/after the JSON — extract the outermost { ... }
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const extracted = jsonText.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(extracted);
      } catch (err2) {
        console.error('[extractor] Could not parse extracted JSON block:', extracted.slice(0, 300));
        throw new Error(`AI response contained invalid JSON even after extraction: ${err2 instanceof Error ? err2.message : String(err2)}`, { cause: err2 });
      }
    }
    console.error('[extractor] No JSON object found in AI response:', jsonText.slice(0, 500));
    throw new Error(`AI response did not contain a JSON object. Response starts with: ${jsonText.slice(0, 80)}`);
  }
}

const EMPTY_CONFIG: CaptivateIQBuildConfig = {
  planStructure: { planName: '', periodType: 'annual', payoutComponents: [], notes: '' },
  dataWorksheets: [],
  employeeAssumptionColumns: [],
  attributeWorksheets: [],
  formulaRecommendations: [],
};

/**
 * Run AI extraction on a single parsed workbook (legacy single-file mode).
 * Uses Claude CLI with Opus 4.6.
 */
export async function extractRulesFromWorkbook(
  input: ExtractorInput
): Promise<ExtractionResult> {

  console.log(`  [AI] Analyzing workbook: ${input.workbook.filename}`);
  console.log(`  [AI] Sheets: ${input.workbook.sheetNames.join(', ')}`);
  console.log(`  [AI] Using Claude CLI...`);

  const rawText = await runClaudeCli(SYSTEM_PROMPT, buildUserPrompt(input));
  const parsed = parseAiResponse(rawText);

  const result: ExtractionResult = {
    id: generateId(),
    projectId: input.projectId,
    fileId: input.fileId,
    extractedAt: new Date().toISOString(),
    workbook: input.workbook,
    rules: parsed.rules ?? [],
    insights: parsed.insights ?? '',
    captivateiqConfig: parsed.captivateiqConfig ?? EMPTY_CONFIG,
  };

  console.log(`  [AI] Extracted ${result.rules.length} rules from ${input.workbook.filename}`);
  return result;
}

/**
 * Run AI extraction on a single document (PDF, DOCX, TXT, etc.).
 * Uses Claude CLI with Opus 4.6.
 */
export async function extractRulesFromDocument(
  input: DocumentExtractorInput
): Promise<ExtractionResult> {

  console.log(`  [AI] Analyzing document: ${input.document.filename}`);
  console.log(`  [AI] Type: ${input.document.fileType.toUpperCase()}, ${input.document.pageOrLineCount} ${input.document.fileType === 'pdf' ? 'pages' : 'lines'}`);
  console.log(`  [AI] Using Claude CLI...`);

  const rawText = await runClaudeCli(SYSTEM_PROMPT, buildDocumentPrompt(input));
  const parsed = parseAiResponse(rawText);

  // Create a synthetic workbook from the document for the result
  const syntheticWorkbook: ParsedWorkbook = {
    filename: input.document.filename,
    sheetNames: [],
    sheets: [],
    namedRanges: [],
    summary: `[Document: ${input.document.fileType.toUpperCase()}] ${input.document.summary}`,
  };

  const result: ExtractionResult = {
    id: generateId(),
    projectId: input.projectId,
    fileId: input.fileId,
    extractedAt: new Date().toISOString(),
    workbook: syntheticWorkbook,
    rules: parsed.rules ?? [],
    insights: parsed.insights ?? '',
    captivateiqConfig: parsed.captivateiqConfig ?? EMPTY_CONFIG,
  };

  console.log(`  [AI] Extracted ${result.rules.length} rules from ${input.document.filename}`);
  return result;
}

/**
 * Run AI extraction on ALL project files at once (bulk mode).
 * Feeds all workbooks + documents into a single AI call for cross-referencing.
 * Returns a single ExtractionResult representing the unified analysis.
 */
export async function extractRulesFromAll(
  input: BulkExtractorInput
): Promise<ExtractionResult> {
  const totalFiles = input.workbooks.length + input.documents.length;
  console.log(`  [AI] Bulk analyzing ${totalFiles} files for project ${input.projectId}`);
  console.log(`  [AI] Excel workbooks: ${input.workbooks.map(w => w.workbook.filename).join(', ') || 'none'}`);
  console.log(`  [AI] Documents: ${input.documents.map(d => d.document.filename).join(', ') || 'none'}`);
  console.log(`  [AI] Using Claude CLI (bulk mode)...`);

  const rawText = await runClaudeCli(SYSTEM_PROMPT, buildBulkUserPrompt(input));
  const parsed = parseAiResponse(rawText);

  // Use first workbook for the result, or create a synthetic one
  const primaryWorkbook = input.workbooks[0]?.workbook ?? {
    filename: `bulk-analysis-${totalFiles}-files`,
    sheetNames: [],
    sheets: [],
    namedRanges: [],
    summary: `Bulk analysis of ${totalFiles} files`,
  };

  const result: ExtractionResult = {
    id: generateId(),
    projectId: input.projectId,
    fileId: 'bulk', // Special marker for bulk extraction
    extractedAt: new Date().toISOString(),
    workbook: primaryWorkbook,
    rules: parsed.rules ?? [],
    insights: parsed.insights ?? '',
    captivateiqConfig: parsed.captivateiqConfig ?? EMPTY_CONFIG,
  };

  console.log(`  [AI] Bulk extraction complete: ${result.rules.length} rules from ${totalFiles} files`);
  return result;
}
