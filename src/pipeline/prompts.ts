/**
 * Prompt templates for each pipeline pass.
 */

import { workbookToPromptString } from '../excel/parser.js';
import type { ParsedWorkbook } from '../project/types.js';
import type { FileExtractionResult, SynthesisResult } from './types.js';

// ── Shared Rule Concepts ─────────────────────────────────

const RULE_CONCEPTS = `Rule concepts to identify:
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
- clawback: Commission recovery rule`;

// ── Pass 1: Per-File Extraction ──────────────────────────

export const PASS1_SYSTEM_PROMPT = `You are an expert in Incentive Compensation Management (ICM). You analyze compensation plan files and extract structured rules.

${RULE_CONCEPTS}

You ALWAYS respond with a single valid JSON object. No prose, no markdown, no explanation outside the JSON.`;

export function buildPass1UserPrompt(workbook: ParsedWorkbook): string {
  const parts: string[] = [];

  parts.push(`Analyze this compensation plan file and extract all compensation rules.`);
  parts.push('');
  parts.push(workbookToPromptString(workbook));
  parts.push('');
  parts.push(`## Instructions

1. **Classify** what type of compensation document this is
2. **Identify** which sheets contain compensation rules vs. formatting/instructions/cover pages
3. **Extract every compensation rule** you can identify with exact values:
   - For rate tables: extract EVERY tier with exact min/max thresholds and rate values
   - For qualifiers: extract exact threshold values and conditions
   - For quota targets: extract exact amounts per role/period
   - For accelerators/decelerators: extract exact multipliers and thresholds
4. **Source reference**: note the exact sheet name and cell range where each rule was found

Respond with ONLY this JSON structure:

{
  "classification": {
    "fileType": "comp-plan|rate-table|quota-sheet|territory-map|deal-data|payout-schedule|policy-doc|unknown",
    "summary": "one-line description of what this file contains",
    "relevantSheets": ["sheets with comp rules"],
    "irrelevantSheets": ["cover pages, formatting, etc."]
  },
  "rules": [
    {
      "id": "unique-kebab-case-id",
      "concept": "rate-table|accelerator|decelerator|qualifier|split|territory|quota-target|draw|spif|cap|floor|clawback",
      "description": "Plain English description of the rule",
      "parameters": { },
      "confidence": 0.0-1.0,
      "sourceRef": {
        "vendorRuleId": "SheetName!CellRange",
        "vendorRuleType": "EXCEL_FORMULA|EXCEL_TABLE|EXCEL_NAMED_RANGE|DOCUMENT_TEXT|CSV_DATA",
        "rawSnapshot": { "sheet": "...", "evidence": "brief quote from data" }
      }
    }
  ],
  "insights": "observations about ambiguities or items needing cross-referencing with other files"
}`);

  return parts.join('\n');
}

// ── Pass 2: Cross-Reference Synthesis ────────────────────

export const PASS2_SYSTEM_PROMPT = `You are an expert ICM analyst synthesizing compensation rules extracted from multiple files into a unified plan configuration for CaptivateIQ.

${RULE_CONCEPTS}

For CaptivateIQ configuration:
- Rate tables → Data Worksheets with tier rows
- Quotas/targets → Employee Assumption columns
- Territory/role mappings → Attribute Worksheets
- Calculation logic → Formula Recommendations (pseudocode for SmartGrid)
- Plans are structured around Period Groups and Payout Worksheets

You ALWAYS respond with a single valid JSON object. No prose, no markdown, no explanation outside the JSON.`;

export function buildPass2UserPrompt(fileResults: FileExtractionResult[]): string {
  const parts: string[] = [];

  parts.push(`Synthesize compensation rules from ${fileResults.length} files into a unified plan.`);
  parts.push('');
  parts.push('## Per-File Extraction Results');
  parts.push('');

  for (const fr of fileResults) {
    parts.push(`### ${fr.fileName} (${fr.classification.fileType})`);
    parts.push(`Classification: ${fr.classification.summary}`);
    parts.push(`Relevant sheets: ${fr.classification.relevantSheets.join(', ')}`);
    parts.push(`Rules extracted: ${fr.rules.length}`);
    // Trim bulky fields to keep prompt + output within token limits
    const trimmedRules = fr.rules.map(r => ({
      id: r.id,
      concept: r.concept,
      description: r.description,
      parameters: r.parameters,
      confidence: r.confidence,
      sourceRef: r.sourceRef ? { vendorRuleId: r.sourceRef.vendorRuleId, vendorRuleType: r.sourceRef.vendorRuleType } : undefined,
    }));
    parts.push('```json');
    parts.push(JSON.stringify(trimmedRules, null, 1));
    parts.push('```');
    if (fr.insights) {
      parts.push(`Insights: ${fr.insights}`);
    }
    parts.push('');
  }

  parts.push(`## Instructions

1. **Merge** rules that describe the same concept from different files (deduplicate)
2. **Resolve conflicts** — if two files show different values for the same rule, pick the most authoritative source and document the conflict
3. **Find cross-references** — rate tables referenced by plan documents, quota sheets linked to territory maps, etc.
4. **Build CaptivateIQ configuration** from the unified rule set
5. **Assign final confidence scores** based on how well-supported each rule is across files

IMPORTANT: Keep your response concise to stay within output limits:
- sampleRows: include at most 1-2 rows per worksheet
- apiPayload: use empty object {} (payloads are generated separately)
- sourceRef.rawSnapshot: omit entirely (use empty object {})
- descriptions: keep to 1 sentence each

Respond with ONLY this JSON structure:

{
  "rules": [
    {
      "id": "unique-kebab-case-id",
      "concept": "rate-table|accelerator|...",
      "description": "...",
      "parameters": { },
      "confidence": 0.0-1.0,
      "sourceRef": { "vendorRuleId": "...", "vendorRuleType": "...", "rawSnapshot": {} }
    }
  ],
  "crossReferences": [
    { "ruleId": "...", "relatedRuleIds": ["..."], "relationship": "describes how these rules connect" }
  ],
  "conflicts": [
    { "description": "what conflicted", "ruleIds": ["..."], "resolution": "how it was resolved", "confidence": 0.0-1.0 }
  ],
  "captivateiqConfig": {
    "planStructure": {
      "planName": "...",
      "periodType": "monthly|quarterly|annual",
      "payoutComponents": ["..."],
      "notes": "..."
    },
    "dataWorksheets": [
      {
        "name": "...", "description": "...", "concept": "...",
        "columns": [{ "name": "...", "type": "text|number|percent|date" }],
        "sampleRows": [{}],
        "apiPayload": {}
      }
    ],
    "employeeAssumptionColumns": [
      { "name": "...", "type": "currency|percent|text|number", "description": "...", "concept": "...", "exampleValue": 0 }
    ],
    "attributeWorksheets": [
      {
        "name": "...", "description": "...", "concept": "...", "pkType": "employee|opportunity|account",
        "columns": [{ "name": "...", "type": "text|number|date" }],
        "apiPayload": {}
      }
    ],
    "formulaRecommendations": [
      { "concept": "...", "description": "...", "logicExplanation": "...", "pseudoFormula": "...", "captivateiqNotes": "..." }
    ]
  },
  "insights": "2-3 paragraph summary of the unified compensation plan"
}`);

  return parts.join('\n');
}

// ── Pass 3: Validation ───────────────────────────────────

export const PASS3_SYSTEM_PROMPT = `You are a compensation plan QA analyst. You validate extracted ICM rules against source data to catch errors, contradictions, and gaps.

You ALWAYS respond with a single valid JSON object. No prose, no markdown, no explanation outside the JSON.`;

export function buildPass3UserPrompt(
  synthesis: SynthesisResult,
  sourceDataSummary: string,
  deterministicChecks: Array<{ name: string; passed: boolean; details: string; severity: string }>,
): string {
  const parts: string[] = [];

  parts.push(`Validate these extracted compensation rules against the original source data.`);
  parts.push('');

  // Compact rule representation — strip rawSnapshot and verbose sourceRef to reduce prompt size
  parts.push('## Extracted Rules (compact)');
  for (const rule of synthesis.rules) {
    parts.push(`- **${rule.id}** [${rule.concept}] (confidence: ${rule.confidence})`);
    parts.push(`  ${rule.description}`);
    const params = rule.parameters;
    if (params && Object.keys(params).length > 0) {
      const paramStr = JSON.stringify(params);
      if (paramStr.length < 300) {
        parts.push(`  params: ${paramStr}`);
      } else {
        parts.push(`  params: ${paramStr.slice(0, 300)}...`);
      }
    }
    if (rule.sourceRef?.vendorRuleId) {
      parts.push(`  source: ${rule.sourceRef.vendorRuleId}`);
    }
  }
  parts.push('');

  // CIQ config summary — just the structure, not full JSON payloads
  parts.push('## CaptivateIQ Config Summary');
  const cfg = synthesis.captivateiqConfig;
  parts.push(`Plan: ${cfg.planStructure.planName} (${cfg.planStructure.periodType})`);
  parts.push(`Components: ${cfg.planStructure.payoutComponents.join(', ')}`);
  parts.push(`Data Worksheets: ${cfg.dataWorksheets.map((d: any) => `${d.name} (${d.concept})`).join(', ')}`);
  parts.push(`Employee Assumptions: ${cfg.employeeAssumptionColumns.map((e: any) => `${e.name} (${e.type})`).join(', ')}`);
  parts.push(`Attribute Worksheets: ${cfg.attributeWorksheets.map((a: any) => `${a.name} (${a.concept})`).join(', ')}`);
  parts.push(`Formulas: ${cfg.formulaRecommendations.map((f: any) => `${f.concept}: ${f.description}`).join('; ')}`);
  parts.push('');

  if (synthesis.conflicts.length > 0) {
    parts.push('## Conflicts Found During Synthesis');
    for (const c of synthesis.conflicts) {
      parts.push(`- ${c.description} (rules: ${c.ruleIds.join(', ')}, resolution: ${c.resolution})`);
    }
    parts.push('');
  }

  parts.push('## Source Data (Ground Truth)');
  parts.push(sourceDataSummary);
  parts.push('');

  if (deterministicChecks.length > 0) {
    parts.push('## Automated Checks Already Run');
    for (const c of deterministicChecks) {
      parts.push(`- ${c.passed ? 'PASS' : 'FAIL'} **${c.name}** [${c.severity}]: ${c.details}`);
    }
    parts.push('');
  }

  parts.push(`## Validation Instructions

Check these items:
1. **RATE ACCURACY**: Do rate values and tier thresholds in rules match the source data?
2. **QUOTA CONSISTENCY**: Do quota-target amounts match across source files?
3. **COMPLETENESS**: Were any source data tables missed as rules?
4. **CONTRADICTIONS**: Do any rules contradict each other?
5. **FORMULA FEASIBILITY**: Do formula recommendations reference columns that exist in proposed worksheets?

Respond with ONLY this JSON:

{
  "overallScore": 0-100,
  "checks": [
    { "name": "check-name", "passed": true, "details": "...", "severity": "info|warning|error" }
  ],
  "flaggedRules": [
    { "ruleId": "...", "reason": "...", "severity": "low-confidence|contradiction|missing-data|mismatch", "suggestion": "..." }
  ],
  "corrections": [
    { "ruleId": "...", "field": "...", "oldValue": "...", "newValue": "...", "reason": "..." }
  ],
  "insights": "overall assessment of extraction quality"
}`);

  return parts.join('\n');
}
