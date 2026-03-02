/**
 * AI Rule Extractor — ParsedWorkbook + context → NormalizedRules + CaptivateIQ config
 *
 * Uses Claude Opus 4.6 with adaptive thinking to analyze Excel compensation
 * calculators and reverse-engineer the rules into structured CaptivateIQ configs.
 */

import Anthropic from '@anthropic-ai/sdk';
import { workbookToPromptString } from './parser.js';
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

const SYSTEM_PROMPT = `You are an expert in Sales Performance Management (SPM) and Incentive Compensation Management (ICM). You specialize in reverse-engineering Excel compensation calculators to understand the underlying business rules and translate them into structured ICM system configurations.

Your task is to analyze parsed Excel workbook data and:
1. Identify all compensation plan rules and business logic encoded in the spreadsheet
2. Extract each rule as a structured NormalizedRule object
3. Generate a complete CaptivateIQ implementation configuration

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
- Plans are structured around Period Groups and Payout Worksheets`;

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

  parts.push(`## Your Task

Analyze the workbook and return a JSON object with exactly this structure:

\`\`\`json
{
  "insights": "2-3 paragraph plain-English explanation of how this compensation plan works, what the key rules are, and any important observations",
  "rules": [
    {
      "id": "kebab-case-id",
      "concept": "rate-table|accelerator|decelerator|qualifier|split|territory|quota-target|draw|spif|cap|floor|clawback",
      "description": "Plain-English description of the rule",
      "parameters": { ...concept-specific parameters },
      "confidence": 0.0-1.0,
      "sourceRef": {
        "vendorRuleId": "excel-sheet-name-cell-range",
        "vendorRuleType": "EXCEL_FORMULA|EXCEL_TABLE|EXCEL_NAMED_RANGE",
        "rawSnapshot": { "sheet": "...", "cells": "..." }
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

Return only valid JSON — no markdown, no explanation outside the JSON.`);

  return parts.join('\n');
}

/**
 * Run AI extraction on a parsed workbook.
 * Uses Claude Opus 4.6 with adaptive thinking.
 */
export async function extractRulesFromWorkbook(
  input: ExtractorInput
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable not set');
  }

  const client = new Anthropic({ apiKey });

  console.log(`  [AI] Analyzing workbook: ${input.workbook.filename}`);
  console.log(`  [AI] Sheets: ${input.workbook.sheetNames.join(', ')}`);

  // Stream the response — workbooks can produce long output
  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildUserPrompt(input),
      },
    ],
  });

  // Log thinking progress
  stream.on('text', (delta) => process.stdout.write(delta.length > 0 ? '.' : ''));

  const message = await stream.finalMessage();
  console.log(''); // newline after dots

  // Extract JSON from response
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in AI response');
  }

  const rawText = textBlock.text.trim();

  // Strip markdown fences if present
  const jsonText = rawText.startsWith('```')
    ? rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    : rawText;

  let parsed: {
    insights: string;
    rules: NormalizedRule[];
    captivateiqConfig: CaptivateIQBuildConfig;
  };

  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    console.error('Failed to parse AI response as JSON:', jsonText.slice(0, 500));
    throw new Error(`AI response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const result: ExtractionResult = {
    id: generateId(),
    projectId: input.projectId,
    fileId: input.fileId,
    extractedAt: new Date().toISOString(),
    workbook: input.workbook,
    rules: parsed.rules ?? [],
    insights: parsed.insights ?? '',
    captivateiqConfig: parsed.captivateiqConfig ?? {
      planStructure: { planName: '', periodType: 'annual', payoutComponents: [], notes: '' },
      dataWorksheets: [],
      employeeAssumptionColumns: [],
      attributeWorksheets: [],
      formulaRecommendations: [],
    },
  };

  console.log(`  [AI] Extracted ${result.rules.length} rules from ${input.workbook.filename}`);
  return result;
}
