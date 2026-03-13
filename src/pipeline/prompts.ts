/**
 * Prompt templates for each pipeline pass.
 *
 * Design principles (grounded in ICM best practices + LLM extraction research):
 *
 * 1. MANDATORY FIELD AUDIT — every pass 1 extraction audits each of 25 required ICM
 *    fields and must explicitly report FOUND / MISSING / AMBIGUOUS with exact evidence.
 *    Silent omissions are the #1 cause of inaccurate extractions.
 *
 * 2. EVIDENCE-TIED CONFIDENCE — confidence scores must be justified by citation count,
 *    not AI intuition. High confidence requires ≥2 independent source references.
 *
 * 3. ADVERSARIAL CONCERN PASS — a dedicated pass 2b that reads as a skeptical auditor,
 *    specifically hunting for red flags: ambiguous language, internal contradictions,
 *    missing definitions, and referenced-but-not-uploaded documents.
 *
 * 4. CROSS-DOCUMENT CONFLICT DETECTION — synthesis explicitly reconciles value
 *    discrepancies across files and requires a documented resolution rationale.
 *
 * 5. NEGATIVE ASSERTIONS — the model must state "NOT FOUND IN ANY DOCUMENT" rather
 *    than silently omitting a field. This makes gaps visible and auditable.
 *
 * ICM plan completeness framework based on:
 * - WorldatWork Certified Sales Compensation Professional (CSCP) standards
 * - CaptivateIQ plan structure requirements (period groups, worksheets, assumptions)
 * - Cygnalgroup sales compensation plan document component taxonomy
 * - Vanderbilt/William & Mary prompt patterns for structured extraction research
 */

import { workbookToPromptString } from '../excel/parser.js';
import type { ParsedWorkbook, DataWorksheetConfig, AttributeWorksheetConfig, EmployeeAssumptionColumn, FormulaRecommendation } from '../project/types.js';
import type { FileExtractionResult, SynthesisResult, FileConcern } from './types.js';

// ─────────────────────────────────────────────────────────────
// ICM COMPLETENESS FRAMEWORK
// 25 fields organized into 6 categories, each with priority.
// This is the canonical checklist used across all passes.
// ─────────────────────────────────────────────────────────────

export const ICM_COMPLETENESS_FRAMEWORK = `
## ICM Plan Completeness Framework (25 Required Fields)

### CATEGORY A — Plan Identity & Governance (Required)
A1. plan_name          — Official name of the compensation plan
A2. effective_dates    — Start and end date / plan term (e.g., Jan 1–Dec 31 2025)
A3. eligible_roles     — Job titles / roles covered by this plan
A4. plan_document_owner — Who administers / owns the plan (e.g., Sales Ops, HR)
A5. amendment_clause   — Process for plan changes mid-period; who has authority

### CATEGORY B — Earnings Structure (Required)
B1. ote                — On-Target Earnings: total comp at 100% quota (base + variable)
B2. base_salary        — Fixed salary component (or draw amount if draw-based)
B3. variable_target    — Target variable / commission amount at 100% quota
B4. pay_mix            — Base:Variable ratio (e.g., 60:40, 70:30)
B5. draw_type          — None / Non-recoverable / Recoverable (if draw exists, recovery terms)

### CATEGORY C — Quota & Targets (Required)
C1. quota_amount       — Dollar/unit quota value per period per role
C2. quota_period       — Period type: monthly / quarterly / annual
C3. quota_metric       — What is measured: ARR, TCV, bookings, revenue, units, etc.
C4. quota_allocation   — How quota is split across roles, regions, products if applicable
C5. ramp_schedule      — New hire ramp: reduced quota months 1–N with specific percentages

### CATEGORY D — Commission & Rate Logic (Required)
D1. base_commission_rate — Rate at 100% quota attainment (e.g., 10% of ACV)
D2. rate_table         — Full tier structure: thresholds + rates for each attainment band
D3. accelerators       — Rate multipliers above quota: threshold %, multiplier/rate at each tier
D4. decelerators       — Rate reductions below quota threshold (if applicable)
D5. cap                — Maximum earnings limit (absolute $ or % of OTE); or explicit "no cap"

### CATEGORY E — Plan Mechanics (Recommended)
E1. qualifiers_gates   — Conditions that must be met before any commission pays (e.g., must hit 50% of quota)
E2. spif_bonuses       — Special incentives, contests, product bonuses outside the main rate table
E3. splits_overlays    — Credit split rules when multiple reps touch a deal
E4. clawback_policy    — Recovery terms: trigger events, recovery period, recovery method

### CATEGORY F — Administration (Recommended)
F1. payment_frequency  — When commissions are paid: monthly / quarterly / upon close
F2. dispute_resolution — Process for contesting a commission calculation
`;

// ─────────────────────────────────────────────────────────────
// RULE CONCEPTS TAXONOMY
// ─────────────────────────────────────────────────────────────

const RULE_CONCEPTS = `## Rule Concept Taxonomy
- rate-table: Commission rate lookup (flat, tiered, matrix) mapping attainment % → commission rate
- accelerator: Rate increase above a quota threshold (e.g., 1.5× rate above 100% attainment)
- decelerator: Rate decrease below a quota threshold (e.g., 0.5× rate below 75% attainment)
- qualifier: Gate condition that must be satisfied before commission is earned (e.g., must hit product mix target)
- split: Credit splitting rules between reps, roles, or overlays on a single deal
- territory: Geographic or account-based assignment rules that determine which rep gets credit
- quota-target: Quota / target definition — the number a rep is measured against
- draw: Guaranteed minimum payment (recoverable or non-recoverable) against future commissions
- spif: Special Performance Incentive Fund — bonus outside the main rate structure (product, contest, etc.)
- cap: Maximum earning limit — absolute dollar amount or percentage of OTE
- floor: Minimum earning guarantee below which a rep cannot fall
- clawback: Commission recovery provision — trigger events, recovery period, and method`;

// ─────────────────────────────────────────────────────────────
// PASS 1: PER-FILE EXTRACTION WITH MANDATORY FIELD AUDIT
// ─────────────────────────────────────────────────────────────

// ─── JSON schema strings extracted to constants to avoid TS 5.9 template literal parsing issues ───

const PASS1_JSON_SCHEMA = [
  'Respond with ONLY this JSON structure:',
  '',
  '{',
  '  "classification": {',
  '    "fileType": "comp-plan|rate-table|quota-sheet|territory-map|deal-data|payout-schedule|policy-doc|unknown",',
  '    "summary": "one sentence describing what this document contains",',
  '    "relevantSheets": ["sheet names with comp rules"],',
  '    "irrelevantSheets": ["cover pages, formatting, etc."],',
  '    "documentCompleteness": "full-plan|partial-plan|supporting-data|reference-only"',
  '  },',
  '  "rules": [',
  '    {',
  '      "id": "unique-kebab-case-id",',
  '      "concept": "rate-table|accelerator|decelerator|qualifier|split|territory|quota-target|draw|spif|cap|floor|clawback",',
  '      "description": "Exact plain English description — do not paraphrase, use document language where possible",',
  '      "parameters": {},',
  '      "confidence": 0.0,',
  '      "evidence_count": 1,',
  '      "sourceRef": {',
  '        "vendorRuleId": "SheetName!CellRange",',
  '        "vendorRuleType": "EXCEL_FORMULA|EXCEL_TABLE|EXCEL_NAMED_RANGE|DOCUMENT_TEXT|CSV_DATA",',
  '        "rawSnapshot": { "sheet": "...", "evidence": "exact quote up to 40 words from source" }',
  '      }',
  '    }',
  '  ],',
  '  "field_audit": {',
  '    "A1_plan_name":         { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "A2_effective_dates":   { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "A3_eligible_roles":    { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "A4_plan_doc_owner":    { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "A5_amendment_clause":  { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "B1_ote":               { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "B2_base_salary":       { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "B3_variable_target":   { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "B4_pay_mix":           { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "B5_draw_type":         { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "C1_quota_amount":      { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "C2_quota_period":      { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "C3_quota_metric":      { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "C4_quota_allocation":  { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "C5_ramp_schedule":     { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "D1_base_rate":         { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "D2_rate_table":        { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "D3_accelerators":      { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "D4_decelerators":      { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "D5_cap":               { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "E1_qualifiers_gates":  { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "E2_spif_bonuses":      { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "E3_splits_overlays":   { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "E4_clawback_policy":   { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "F1_payment_freq":      { "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null },',
  '    "F2_dispute_resolution":{ "status": "FOUND|MISSING|AMBIGUOUS", "value": null, "evidence": null, "source_ref": null, "confidence": 0.0, "concern": null }',
  '  },',
  '  "concerns": [',
  '    {',
  '      "severity": "critical|high|medium|low",',
  '      "category": "ambiguous-language|internal-contradiction|missing-reference|placeholder|logical-error|incomplete-definition",',
  '      "description": "Specific description of the concern",',
  '      "location": "SheetName!CellRange or page reference",',
  '      "recommendation": "What is needed to resolve this"',
  '    }',
  '  ],',
  '  "missing_documents": ["Names of documents referenced in this file that were not provided"],',
  '  "insights": "2-3 sentences: what this document covers, what is notably absent, and overall reliability"',
  '}',
].join('\n');

export const PASS1_SYSTEM_PROMPT = `You are a senior Incentive Compensation Management (ICM) analyst with 15 years of experience auditing compensation plans for accuracy and completeness. You are meticulous, skeptical, and adversarial by nature — you do not give the benefit of the doubt.

${RULE_CONCEPTS}

Your job has two parts:
1. Extract every compensation rule from the document with exact values and source citations.
2. Audit the document against a 25-field ICM completeness framework — reporting FOUND, MISSING, or AMBIGUOUS for every single field with exact evidence quotes.

CRITICAL RULES:
- You NEVER omit a field from the audit. All 25 fields must appear in field_audit, even if NOT_FOUND.
- You NEVER infer or assume values that are not explicitly stated. If a field is implied but not written, mark it AMBIGUOUS, not FOUND.
- You NEVER assign confidence > 0.85 unless you found the value stated explicitly in ≥2 independent locations.
- You ALWAYS quote the exact text (≤40 words) that supports a FOUND status.
- You ALWAYS respond with a single valid JSON object. No prose, no markdown, no explanation outside the JSON.`;

export function buildPass1UserPrompt(workbook: ParsedWorkbook): string {
  const parts: string[] = [];

  parts.push(`Analyze this compensation plan document. Perform BOTH a rule extraction AND a full field audit.`);
  parts.push('');
  parts.push(workbookToPromptString(workbook));
  parts.push('');
  parts.push(`## Task 1: Document Classification

Classify this document and identify which sheets contain compensation rules vs. non-rule content.`);
  parts.push('');
  parts.push(`## Task 2: Rule Extraction

Extract every compensation rule with EXACT values:
- For rate tables: EVERY tier row — exact min/max threshold and exact rate/multiplier
- For quota-targets: exact dollar or unit amount per role per period
- For accelerators/decelerators: exact threshold % and exact rate change
- For qualifiers: exact condition text (do not paraphrase)
- For caps: exact dollar amount or "no cap" if explicitly stated
- For clawbacks: exact trigger events and recovery period in months
- Source reference: exact sheet name and cell range

Rate confidence as follows:
- 0.9–1.0: value stated explicitly in ≥2 independent locations
- 0.7–0.89: value stated explicitly once, unambiguous
- 0.5–0.69: value implied or requires interpretation
- 0.0–0.49: uncertain — multiple plausible readings`);
  parts.push('');
  parts.push(`## Task 3: Mandatory Field Audit (ALL 25 fields required)

${ICM_COMPLETENESS_FRAMEWORK}

For EVERY field in the framework above, output an audit entry with:
- status: "FOUND" | "MISSING" | "AMBIGUOUS"
  - FOUND: value is explicitly stated in the document
  - AMBIGUOUS: value can be inferred but is not explicitly stated, or there are multiple possible readings
  - MISSING: no information found in this document
- value: the extracted value (null if MISSING)
- evidence: exact quote ≤40 words from the document (null if MISSING)
- source_ref: "SheetName!CellRange" or "page N" (null if MISSING)
- confidence: 0.0–1.0 (0.0 if MISSING)
- concern: optional — flag if value seems unusual, contradicts another field, or is vague`);
  parts.push('');
  parts.push(`## Task 4: Document-Level Concerns

List specific concerns about this document:
- Ambiguous language ("approximately", "at manager's discretion", "subject to change")
- Internal contradictions (two places with different values for the same field)
- Referenced documents, sheets, or attachments that are NOT in this file
- Fields that appear to be placeholders (TBD, TBC, XXX, blank cells where values expected)
- Logical impossibilities (e.g., floor > cap, accelerator threshold < base rate threshold)`);
  parts.push('');
  parts.push(PASS1_JSON_SCHEMA);

  return parts.join('\n');
}

// ─────────────────────────────────────────────────────────────
// PASS 2A: CROSS-DOCUMENT SYNTHESIS
// ─────────────────────────────────────────────────────────────

const PASS2_JSON_SCHEMA = [
  'Respond with ONLY this JSON:',
  '',
  '{',
  '  "unified_fields": {',
  '    "A1_plan_name":         { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "A2_effective_dates":   { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "A3_eligible_roles":    { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "A4_plan_doc_owner":    { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "A5_amendment_clause":  { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "B1_ote":               { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "B2_base_salary":       { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "B3_variable_target":   { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "B4_pay_mix":           { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "B5_draw_type":         { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "C1_quota_amount":      { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "C2_quota_period":      { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "C3_quota_metric":      { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "C4_quota_allocation":  { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "C5_ramp_schedule":     { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "D1_base_rate":         { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "D2_rate_table":        { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "D3_accelerators":      { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "D4_decelerators":      { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "D5_cap":               { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "E1_qualifiers_gates":  { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "E2_spif_bonuses":      { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "E3_splits_overlays":   { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "E4_clawback_policy":   { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "F1_payment_freq":      { "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null },',
  '    "F2_dispute_resolution":{ "resolution": "RESOLVED|CONFLICTED|PROJECT_MISSING", "value": null, "confidence": 0.0, "sources": ["filename"], "conflict_note": null }',
  '  },',
  '  "project_gaps": [',
  '    { "field_id": "A1_plan_name", "severity": "critical|high|medium|low", "impact": "What CIQ build work is blocked without this field", "recommendation": "What document or information is needed" }',
  '  ],',
  '  "rules": [',
  '    { "id": "unique-kebab-case-id", "concept": "rate-table|accelerator|...", "description": "...", "parameters": {}, "confidence": 0.0, "evidence_count": 1, "sourceRef": { "vendorRuleId": "...", "vendorRuleType": "...", "rawSnapshot": {} } }',
  '  ],',
  '  "crossReferences": [{ "ruleId": "...", "relatedRuleIds": ["..."], "relationship": "..." }],',
  '  "conflicts": [',
  '    { "field_or_rule": "...", "file_a": "filename", "value_a": "...", "file_b": "filename", "value_b": "...", "resolution": "which value was used and why", "confidence": 0.0 }',
  '  ],',
  '  "captivateiqConfig": {',
  '    "planStructure": { "planName": "...", "periodType": "monthly|quarterly|annual", "payoutComponents": [], "notes": "List CIQ config sections left empty due to PROJECT_MISSING fields" },',
  '    "dataWorksheets": [{ "name": "...", "description": "...", "concept": "...", "columns": [{ "name": "...", "type": "text|number|percent|date" }], "sampleRows": [{}], "apiPayload": {}, "source_field_ids": ["D2_rate_table"] }],',
  '    "employeeAssumptionColumns": [{ "name": "...", "type": "currency|percent|text|number", "description": "...", "concept": "...", "exampleValue": 0, "source_field_ids": ["C1_quota_amount"] }],',
  '    "attributeWorksheets": [{ "name": "...", "description": "...", "concept": "...", "pkType": "employee|opportunity|account", "columns": [{ "name": "...", "type": "text|number|date" }], "apiPayload": {}, "source_field_ids": [] }],',
  '    "formulaRecommendations": [{ "concept": "...", "description": "...", "logicExplanation": "...", "pseudoFormula": "...", "captivateiqNotes": "...", "depends_on_fields": ["D1_base_rate", "D2_rate_table"] }]',
  '  },',
  '  "insights": "3-4 sentences: summary of what was unified, major conflicts found, critical gaps that block CIQ build, overall data quality assessment"',
  '}',
].join('\n');

export const PASS2_SYSTEM_PROMPT = `You are a senior ICM implementation analyst building a unified CaptivateIQ compensation configuration from multiple extracted source files.

${RULE_CONCEPTS}

Your job:
1. Merge per-file field audits into a single authoritative field value for each of the 25 ICM fields.
2. Detect and resolve conflicts — where two files show different values for the same field.
3. Build the CaptivateIQ configuration from the unified, validated field set.
4. Surface any fields that remain MISSING or AMBIGUOUS across ALL files — these are project-level gaps.

CRITICAL RULES:
- A field is RESOLVED only when you can point to explicit evidence in ≥1 document.
- A field is CONFLICTED when two or more documents contain different explicit values — document both and explain your resolution.
- A field is PROJECT_MISSING when it is MISSING or AMBIGUOUS in every single file.
- Never invent values. Never assume industry defaults ("typically 10%") unless the document says so.
- You ALWAYS respond with a single valid JSON object.`;

export function buildPass2UserPrompt(fileResults: FileExtractionResult[]): string {
  const parts: string[] = [];

  parts.push(`Synthesize compensation rules from ${fileResults.length} files into a unified CaptivateIQ plan configuration.`);
  parts.push('');
  parts.push('## Per-File Extraction Results');
  parts.push('');

  for (const fr of fileResults) {
    parts.push(`### ${fr.fileName} (${fr.classification.fileType})`);
    parts.push(`Summary: ${fr.classification.summary}`);
    parts.push(`Document completeness: ${(fr.classification as any).documentCompleteness ?? 'unknown'}`);
    parts.push(`Rules extracted: ${fr.rules.length}`);

    // Field audit summary — compact representation
    const audit = (fr as any).field_audit;
    if (audit) {
      const found = Object.entries(audit).filter(([, v]: [string, any]) => v.status === 'FOUND').map(([k, v]: [string, any]) => k + '=' + JSON.stringify(v.value));
      const ambiguous = Object.entries(audit).filter(([, v]: [string, any]) => v.status === 'AMBIGUOUS').map(([k]: [string, any]) => k);
      const missing = Object.entries(audit).filter(([, v]: [string, any]) => v.status === 'MISSING').map(([k]: [string, any]) => k);
      if (found.length) parts.push('FOUND (' + found.length + '): ' + found.slice(0, 12).join(' | ') + (found.length > 12 ? ' +' + (found.length - 12) + ' more' : ''));
      if (ambiguous.length) parts.push('AMBIGUOUS (' + ambiguous.length + '): ' + ambiguous.join(', '));
      if (missing.length) parts.push('MISSING (' + missing.length + '): ' + missing.join(', '));
    }

    // Concerns summary
    const concerns = (fr as any).concerns ?? [];
    const criticalConcerns = concerns.filter((c: FileConcern) => c.severity === 'critical' || c.severity === 'high');
    if (criticalConcerns.length > 0) {
      parts.push(`CRITICAL/HIGH CONCERNS (${criticalConcerns.length}):`);
      for (const c of criticalConcerns.slice(0, 5)) {
        parts.push(`  [${c.severity.toUpperCase()}] ${c.category}: ${c.description}`);
      }
    }

    // Rules (compact)
    const trimmedRules = fr.rules.map(r => ({
      id: r.id,
      concept: r.concept,
      description: r.description,
      parameters: r.parameters,
      confidence: r.confidence,
      sourceRef: r.sourceRef ? { vendorRuleId: r.sourceRef.vendorRuleId } : undefined,
    }));
    parts.push('Rules:');
    parts.push('```json');
    parts.push(JSON.stringify(trimmedRules, null, 1));
    parts.push('```');

    if ((fr as any).missing_documents?.length > 0) {
      parts.push(`Referenced but not uploaded: ${(fr as any).missing_documents.join(', ')}`);
    }
    if (fr.insights) parts.push(`Insights: ${fr.insights}`);
    parts.push('');
  }

  parts.push(`## Synthesis Instructions

### Step 1: Resolve each of the 25 ICM fields
For every field in the framework, determine:
- RESOLVED: one or more documents contain this value explicitly — use the highest-confidence source
- CONFLICTED: two or more documents contain different explicit values — document both, pick most authoritative, explain why
- PROJECT_MISSING: all documents are MISSING or AMBIGUOUS for this field

### Step 2: Merge rules
- Merge rules that describe the same compensation mechanic (deduplicate by concept + parameters)
- Where multiple files describe the same rate table, merge tiers and flag discrepancies
- Assign final confidence: multiply by 1.2 if found in ≥2 files (cap at 1.0), reduce by 0.2 for each conflict

### Step 3: Build CaptivateIQ configuration
Build the full CIQ config from the RESOLVED field set only. Do not populate config sections from CONFLICTED or PROJECT_MISSING fields — leave them empty with a note.

IMPORTANT — keep response concise to stay within token limits:
- sampleRows: max 2 rows per worksheet
- apiPayload: use {} (payloads generated separately)
- rawSnapshot: omit from sourceRef

` + PASS2_JSON_SCHEMA);

  return parts.join('\n');
}

// ─────────────────────────────────────────────────────────────
// PASS 2B: ADVERSARIAL CONCERN AUDIT (new pass)
// ─────────────────────────────────────────────────────────────

const PASS2B_AUDIT_INSTRUCTIONS = '## Audit Instructions\n\nCheck ALL of the following:\n\nMATH VALIDATION:\n- OTE = base_salary + variable_target (verify if all three are present)\n- pay_mix ratio = base_salary / OTE (verify matches stated ratio)\n- Rate table tiers: are they contiguous? Do they cover attainment from 0% to ∞?\n- Accelerator rate must be > base commission rate\n- If floor and cap both exist: floor < cap\n- Ramp percentages must sum reasonably (e.g., month 1=50%, month 2=75%, month 3=100%)\n\nSTRUCTURAL GAPS:\n- Are all referenced rate tables actually present with full tier data?\n- Are quota amounts specified per role, or only in aggregate?\n- If splits/overlays mentioned, are split percentages specified for each role?\n- Is payment trigger defined (e.g., on invoice, on cash receipt, on close)?\n- If clawback exists, is the recovery period in months/years explicitly stated?\n\nAMBIGUITY HUNT — flag any instance of these patterns:\n- Vague qualifiers: "approximately", "roughly", "generally", "typically", "competitive"\n- Discretionary language: "at management\'s discretion", "subject to approval", "may be adjusted"\n- Undefined acronyms or terms used without definition\n- Passive voice that hides the subject: "will be determined", "shall be set"\n- Time references without anchors: "end of period" (which period?), "upon achievement" (when measured?)\n\nPOLICY RISKS:\n- Clawbacks: is there a statute of limitations? Unlimited clawback periods are legally problematic in some jurisdictions.\n- Caps: does the cap apply before or after accelerators? This must be explicit.\n- Draws: are recovery terms (when, how, from what income) explicitly stated?\n- Qualifiers/gates: if a rep misses a gate, do they get $0 or a reduced payout?\n\nRespond with ONLY this JSON:\n\n{\n  "math_validation": [\n    {\n      "check": "ote_consistency|pay_mix|rate_table_contiguous|accelerator_vs_base|floor_vs_cap|ramp_sum",\n      "passed": true,\n      "detail": "Exact calculation or comparison performed",\n      "severity": "critical|high|medium|low"\n    }\n  ],\n  "concerns": [\n    {\n      "id": "concern-001",\n      "severity": "critical|high|medium|low",\n      "category": "ambiguous-language|internal-contradiction|missing-definition|structural-gap|math-error|policy-risk|missing-reference",\n      "description": "Precise description of the problem with specific values/locations",\n      "location": "field_id or rule_id or filename reference",\n      "impact": "What goes wrong in CIQ or in practice if this is not resolved",\n      "recommendation": "Specific action needed to resolve"\n    }\n  ],\n  "blocking_issues": [\n    "List of concerns by id that would prevent a CaptivateIQ build from being accurate"\n  ],\n  "overall_risk": "low|medium|high|critical",\n  "risk_summary": "2-3 sentences: overall assessment of the extraction quality and primary risks to CIQ build accuracy"\n}';

export const PASS2B_SYSTEM_PROMPT = `You are an adversarial ICM auditor. Your job is to find every problem, ambiguity, risk, and gap in a compensation plan extraction before it gets built in CaptivateIQ. You are paid to be skeptical.

You look for:
1. LOGICAL ERRORS — numbers that don't add up, impossible structures (e.g., floor > cap, accelerator threshold below base rate threshold)
2. AMBIGUOUS LANGUAGE — vague terms that create disputes ("approximately", "at discretion", "subject to adjustment", "competitive rate")
3. INTERNAL CONTRADICTIONS — the same field with different values across sections or documents
4. MISSING DEFINITIONS — referenced concepts with no definition (e.g., "ARR" used but never defined, "manager approval" required but approver not named)
5. STRUCTURAL GAPS — plan mechanics that can't be implemented without additional information
6. MATH VALIDATION — verify: OTE = base + variable_target; pay_mix = base/OTE; rate_table tiers should be contiguous and cover 0–∞; accelerator rate > base rate
7. POLICY RISKS — clawbacks with no time limit, caps that may violate comp laws, draws with unclear recovery terms

You ALWAYS respond with a single valid JSON object.`;

export function buildPass2BUserPrompt(
  fileResults: FileExtractionResult[],
  synthesis: SynthesisResult,
): string {
  const parts: string[] = [];

  parts.push(`Conduct an adversarial audit of this compensation plan extraction. Find every problem.`);
  parts.push('');

  // Unified field summary
  const unifiedFields = (synthesis as any).unified_fields ?? {};
  const resolvedFields = Object.entries(unifiedFields)
    .filter(([, v]: [string, any]) => v.resolution === 'RESOLVED')
    .map(([k, v]: [string, any]) => `${k}: ${JSON.stringify(v.value)} (conf: ${v.confidence})`);
  const conflictedFields = Object.entries(unifiedFields)
    .filter(([, v]: [string, any]) => v.resolution === 'CONFLICTED')
    .map(([k, v]: [string, any]) => `${k}: ${v.conflict_note}`);
  const missingFields = Object.entries(unifiedFields)
    .filter(([, v]: [string, any]) => v.resolution === 'PROJECT_MISSING')
    .map(([k]: [string, any]) => k);

  parts.push('## Resolved Fields (what was extracted)');
  parts.push(resolvedFields.join('\n') || 'none');
  parts.push('');
  parts.push('## Conflicted Fields (needs resolution)');
  parts.push(conflictedFields.join('\n') || 'none');
  parts.push('');
  parts.push('## Project-Missing Fields (not found anywhere)');
  parts.push(missingFields.join(', ') || 'none');
  parts.push('');

  // Rules summary
  parts.push(`## Extracted Rules (${synthesis.rules.length} total)`);
  for (const rule of synthesis.rules) {
    parts.push(`- [${rule.concept}] ${rule.id}: ${rule.description} (conf: ${rule.confidence})`);
    if (rule.parameters && Object.keys(rule.parameters).length > 0) {
      parts.push(`  params: ${JSON.stringify(rule.parameters).slice(0, 200)}`);
    }
  }
  parts.push('');

  // Per-file concerns already raised
  const allPriorConcerns: (FileConcern & { file: string })[] = [];
  for (const fr of fileResults) {
    const concerns = (fr as any).concerns ?? [];
    for (const c of concerns) {
      allPriorConcerns.push({ file: fr.fileName, ...c });
    }
  }
  if (allPriorConcerns.length > 0) {
    parts.push('## Concerns Already Raised (per-file)');
    for (const c of allPriorConcerns) {
      parts.push(`[${c.severity}] ${c.file} — ${c.category}: ${c.description}`);
    }
    parts.push('');
  }

  // Conflicts from synthesis
  if (synthesis.conflicts.length > 0) {
    parts.push('## Conflicts Found During Synthesis');
    for (const c of synthesis.conflicts) {
      parts.push(`- ${(c as any).field_or_rule ?? ''}: ${(c as any).value_a} (${(c as any).file_a}) vs ${(c as any).value_b} (${(c as any).file_b}) → resolved as: ${c.resolution}`);
    }
    parts.push('');
  }

  parts.push(PASS2B_AUDIT_INSTRUCTIONS);

  return parts.join('\n');
}

// ─────────────────────────────────────────────────────────────
// PASS 3: VALIDATION (tightened — value-level verification)
// ─────────────────────────────────────────────────────────────

const PASS3_VALIDATION_INSTRUCTIONS = '## Validation Instructions\n\n1. RATE ACCURACY: Do rate values in extracted rate-table rules match the source data sample? Check at least 2 tier values.\n2. QUOTA CONSISTENCY: Do quota-target amounts match across all sources that reference them?\n3. MATH RE-CHECK: Spot-check the math validation items — do OTE, base, and variable add up correctly?\n4. FORMULA FEASIBILITY: Do formula recommendations reference column names that exist in the proposed data worksheets?\n5. CONCERN ACCOUNTING: For each blocking concern from the audit, confirm it is reflected in flaggedRules or flaggedFields — not silently ignored.\n6. COMPLETENESS SCORE: Score 0–100. Deduct points:\n   - 15 pts per CONFLICTED field not resolved with high confidence\n   - 10 pts per PROJECT_MISSING required field (Category A–D)\n   - 5 pts per PROJECT_MISSING recommended field (Category E–F)\n   - 5 pts per blocking concern from audit\n   - 3 pts per high-severity concern from audit\n   - Do NOT inflate the score. A plan missing quota amounts is not 90/100.\n\nRespond with ONLY this JSON:\n\n{\n  "overallScore": 0,\n  "score_breakdown": {\n    "base_score": 100,\n    "deductions": [\n      { "reason": "...", "points": 0 }\n    ]\n  },\n  "checks": [\n    { "name": "...", "passed": true, "details": "...", "severity": "info|warning|error" }\n  ],\n  "flaggedRules": [\n    { "ruleId": "...", "reason": "...", "severity": "low-confidence|contradiction|missing-data|mismatch", "suggestion": "..." }\n  ],\n  "flaggedFields": [\n    { "field_id": "...", "reason": "...", "severity": "critical|high|medium|low", "concern_ref": "concern-id or null" }\n  ],\n  "corrections": [\n    { "ruleId": "...", "field": "...", "oldValue": null, "newValue": null, "reason": "..." }\n  ],\n  "open_concerns_carried": [\n    { "concern_id": "...", "severity": "...", "status": "confirmed|disputed|needs-human-review" }\n  ],\n  "insights": "Overall quality assessment: what is reliable, what needs human review before CIQ build, and what cannot be built at all without additional documents"\n}';

export const PASS3_SYSTEM_PROMPT = `You are a compensation plan QA analyst performing final validation. Your job is to verify that specific extracted values match the source documents — not to re-read the documents, but to cross-check the extraction against the evidence that was already cited.

You check:
1. That every RESOLVED field has cited evidence that actually supports the stated value
2. That every rule's parameters match what the evidence quote says
3. That the CIQ config components are correctly derived from the resolved fields
4. That concerns raised in the audit pass have been noted and are not silently overridden

You ALWAYS respond with a single valid JSON object.`;

export function buildPass3UserPrompt(
  synthesis: SynthesisResult,
  sourceDataSummary: string,
  deterministicChecks: Array<{ name: string; passed: boolean; details: string; severity: string }>,
  auditResult?: {
    concerns: Array<{ id: string; severity: string; category: string; description: string; impact: string; recommendation: string }>;
    blocking_issues: string[];
    overall_risk: string;
    math_validation: Array<{ check: string; passed: boolean; detail: string; severity: string }>;
  },
): string {
  const parts: string[] = [];

  parts.push(`Validate the compensation plan extraction. Cross-check extracted values against cited evidence.`);
  parts.push('');

  // Unified fields with evidence
  const unifiedFields = (synthesis as any).unified_fields ?? {};
  parts.push('## Resolved Fields with Evidence');
  for (const [fieldId, field] of Object.entries(unifiedFields) as [string, any][]) {
    if (field.resolution === 'RESOLVED') {
      parts.push(`${fieldId}: ${JSON.stringify(field.value)} (conf: ${field.confidence}, sources: ${field.sources?.join(', ')})`);
    }
  }
  parts.push('');

  // Rules compact
  parts.push(`## Extracted Rules (${synthesis.rules.length})`);
  for (const rule of synthesis.rules) {
    const params = JSON.stringify(rule.parameters);
    parts.push(`- ${rule.id} [${rule.concept}] conf=${rule.confidence}`);
    parts.push(`  desc: ${rule.description}`);
    if (params.length < 200) parts.push(`  params: ${params}`);
    if (rule.sourceRef?.vendorRuleId) parts.push(`  source: ${rule.sourceRef.vendorRuleId}`);
  }
  parts.push('');

  // CIQ config summary
  parts.push('## CaptivateIQ Config Summary');
  const cfg = synthesis.captivateiqConfig;
  parts.push(`Plan: ${cfg.planStructure.planName} (${cfg.planStructure.periodType})`);
  parts.push(`Components: ${cfg.planStructure.payoutComponents.join(', ')}`);
  parts.push('Data Worksheets: ' + cfg.dataWorksheets.map((d: DataWorksheetConfig) => d.name + ' (' + d.concept + ')').join(', '));
  parts.push('Employee Assumptions: ' + cfg.employeeAssumptionColumns.map((e: EmployeeAssumptionColumn) => e.name + ' (' + e.type + ')').join(', '));
  parts.push('Attribute Worksheets: ' + cfg.attributeWorksheets.map((a: AttributeWorksheetConfig) => a.name).join(', '));
  parts.push('Formulas: ' + cfg.formulaRecommendations.map((f: FormulaRecommendation) => f.concept + ': ' + String(f.description).slice(0, 60)).join('; '));
  parts.push('');

  // Audit concerns (carry forward)
  if (auditResult && auditResult.concerns.length > 0) {
    parts.push(`## Open Concerns from Audit Pass (${auditResult.concerns.length} total, ${auditResult.blocking_issues.length} blocking)`);
    parts.push(`Overall risk: ${auditResult.overall_risk}`);
    for (const c of auditResult.concerns.slice(0, 10)) {
      parts.push(`[${c.severity}] ${c.id} — ${c.category}: ${c.description.slice(0, 120)}`);
    }
    if (auditResult.concerns.length > 10) {
      parts.push(`... +${auditResult.concerns.length - 10} more concerns`);
    }
    parts.push('');
  }

  if (synthesis.conflicts.length > 0) {
    parts.push('## Conflicts Found During Synthesis');
    for (const c of synthesis.conflicts) {
      parts.push(`- ${(c as any).field_or_rule ?? ''}: resolved as ${c.resolution} (conf: ${c.confidence})`);
    }
    parts.push('');
  }

  parts.push('## Source Data (Ground Truth Sample)');
  parts.push(sourceDataSummary);
  parts.push('');

  if (deterministicChecks.length > 0) {
    parts.push('## Deterministic Checks');
    for (const c of deterministicChecks) {
      parts.push(`- ${c.passed ? 'PASS' : 'FAIL'} [${c.severity}] ${c.name}: ${c.details}`);
    }
    parts.push('');
  }

  parts.push(PASS3_VALIDATION_INSTRUCTIONS);

  return parts.join('\n');
}
