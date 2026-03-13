/**
 * BRD (Business Requirements Document) Generator
 *
 * Converts ICM pipeline extraction results into a structured BRD
 * modeled on the BHG BRD template. Uses a multi-turn AI flow:
 *   1. analyze() — inspect pipeline output, identify gaps, return questions
 *   2. generate() — given answers, produce the full BRD document
 */

import { runClaudeCli } from '../excel/extractor.js';
import type { ValidationResult, SynthesisResult, FileExtractionResult, CompletenessResult, FieldAuditEntry } from './types.js';
import type { CaptivateIQBuildConfig, DataWorksheetConfig, AttributeWorksheetConfig } from '../project/types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BrdQuestion {
  id: string;
  section: string;    // which BRD section it feeds
  question: string;
  hint: string;
  required: boolean;
}

export interface BrdAnswer {
  questionId: string;
  answer: string;
}

export interface BrdFunctionalRequirement {
  planId: string;
  planCategory: string;
  category: string;
  ciqPlanName: string;
  channelName: string;
  componentProduct: string;
  weight: string;
  achievementBands: string;
  multiplierRates: string;
  eligibilityPeriod: string;
  payoutFrequency: string;
  creditingType: string;
  datasource: string;
  eligibilityCriteria: string;
  eligibilityLogic: string;
  rateRules: string;
  hasQuota: string;
  rateStructureDescription: string;
  rateNotes: string;
  hasDraw: string;
  drawDetails: string;
  acceleratorDeceleratorDetails: string;
  payoutCap: string;
  effectiveDates: string;
  planChangeNotes: string;
  miscNotes: string;
}

export interface BrdDataRequirement {
  tableOrData: string;
  plan: string;
  dataType: string;
  automatedOrManual: string;
  updateFrequency: string;
  effectiveDated: string;
  level: string;
  description: string;
  fields: string;
}

export interface BrdBusinessRequirement {
  id: number;
  requirement: string;
  details: string;
  priority: string;
  status: string;
  notes: string;
}

export interface BrdReport {
  id: string;
  reportName: string;
  frequency: string;
  priority: string;
  description: string;
  summaryLevel: string;
  fields: string;
  comments: string;
}

export interface BrdQuestion2 {
  id: number;
  status: string;
  requestor: string;
  question: string;
  answer: string;
  notes: string;
}

export interface BrdDocument {
  // Summary
  clientName: string;
  fiscalYear: string;
  projectStartDate: string;
  targetDeploymentDate: string;
  revisionHistory: Array<{ version: string; date: string; user: string; changes: string }>;

  // Checklist (plan matrix)
  planMatrix: Array<{
    planGroup: string;
    planName: string;
    period: string;
    hasSpiff: boolean;
  }>;

  // Functional Requirements
  functionalRequirements: BrdFunctionalRequirement[];

  // Business Requirements (access, permissions, workflows)
  businessRequirements: BrdBusinessRequirement[];

  // Data Requirements
  dataRequirements: BrdDataRequirement[];

  // Reports
  reports: BrdReport[];

  // Open Questions
  openQuestions: BrdQuestion2[];

  // Meta
  generatedAt: string;
  projectId: string;
  analysisInsights: string;
}

export interface BrdAnalysisResult {
  questions: BrdQuestion[];
  knownFields: Record<string, string>;   // what the AI already extracted
  summary: string;                        // brief analysis for user display
}

export interface BrdGenerationInput {
  projectId: string;
  validation: ValidationResult;
  synthesis: SynthesisResult;
  fileResults: FileExtractionResult[];
  completeness?: CompletenessResult | null;
  answers: BrdAnswer[];                   // user-supplied answers from clarification
}

// ── System Prompts ─────────────────────────────────────────────────────────────

const BRD_ANALYSIS_SYSTEM = `You are an ICM (Incentive Compensation Management) implementation expert specializing in CaptivateIQ deployments. You analyze pipeline extraction results and prepare Business Requirements Documents (BRDs) for ICM system implementations.

Your BRD template has these sections:
1. Summary — client info, project dates, revision history
2. Checklist / Plan Matrix — plan groups, plan names, periods, SPIFF flag
3. Functional Requirements — detailed per-plan: rates, quotas, payout logic, eligibility, crediting, draws, accelerators, caps
4. Business Requirements — system access, roles, workflows, governance
5. Data Requirements — data feeds, update frequencies, automation level
6. Reports — standard reports needed (payout statement, transaction detail, dashboards)
7. Open Questions — gaps that need client clarification

Your job: analyze the extraction results and identify EXACTLY which BRD fields can be populated from the data vs. which need additional input from the user.

Be precise. Do not ask for things you already know. Do not hallucinate data.`;

const BRD_GENERATE_SYSTEM = `You are an ICM implementation expert writing a Business Requirements Document for a CaptivateIQ implementation.

You will receive:
- ICM pipeline extraction results (rules, configurations, field audits, conflicts, scores)
- User-supplied answers to clarifying questions

Your job: produce a COMPLETE, PROFESSIONAL BRD document in structured JSON format.

Rules:
- Fill in every field. Use "TBD" only when no information exists.
- Write in professional business language, not technical jargon.
- Each functional requirement row should describe ONE plan's ONE component.
- Business requirements should cover access control, approval workflows, dispute resolution, and timeline.
- Data requirements should list every data feed identified plus standard CIQ tables.
- Include standard reports: Payout Statement, Transaction Detail Report, Payee Dashboard, Manager Summary.
- Open questions should list all AMBIGUOUS or CONFLICTED fields from the extraction.

Output ONLY valid JSON matching the BrdDocument schema.`;

// ── Analysis Pass ─────────────────────────────────────────────────────────────

export async function analyzePipelineForBrd(
  projectId: string,
  validation: ValidationResult,
  synthesis: SynthesisResult,
  fileResults: FileExtractionResult[],
  completeness?: CompletenessResult | null,
): Promise<BrdAnalysisResult> {
  const userPrompt = buildAnalysisPrompt(projectId, validation, synthesis, fileResults, completeness);
  const raw = await runClaudeCli(BRD_ANALYSIS_SYSTEM, userPrompt, 'claude-sonnet-4-6');

  // Parse response
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    throw new Error('AI did not return valid JSON for BRD analysis');
  }
  const parsed = JSON.parse(jsonMatch[1]);
  return parsed as BrdAnalysisResult;
}

function buildAnalysisPrompt(
  projectId: string,
  validation: ValidationResult,
  synthesis: SynthesisResult,
  fileResults: FileExtractionResult[],
  completeness?: CompletenessResult | null,
): string {
  const parts: string[] = [];

  parts.push('## ICM Extraction Results — BRD Analysis Request');
  parts.push('');
  parts.push('Project ID: ' + projectId);
  parts.push('Extraction Score: ' + validation.overallScore + '/100');
  parts.push('Rules Extracted: ' + validation.validatedRules.length);
  parts.push('');

  // File classification summary
  parts.push('### Files Processed');
  for (const fr of fileResults) {
    parts.push('- ' + fr.fileName + ' [' + fr.classification.fileType + '] score=' + (fr.field_audit ? Object.values(fr.field_audit).filter((v: FieldAuditEntry) => v.status === 'FOUND').length : '?') + ' fields found');
  }
  parts.push('');

  // Unified fields from synthesis
  if (synthesis.unified_fields) {
    parts.push('### Unified Field Resolutions');
    for (const [fieldId, field] of Object.entries(synthesis.unified_fields)) {
      const v = field as any;
      parts.push('- ' + fieldId + ': ' + v.resolution + ' | value=' + JSON.stringify(v.value) + ' | confidence=' + v.confidence);
    }
    parts.push('');
  }

  // Conflicts
  if (synthesis.conflicts.length > 0) {
    parts.push('### Conflicts Detected');
    for (const c of synthesis.conflicts) {
      parts.push('- ' + c.description + (c.field_or_rule ? ' [field: ' + c.field_or_rule + ']' : ''));
    }
    parts.push('');
  }

  // Project gaps
  if (synthesis.project_gaps && synthesis.project_gaps.length > 0) {
    parts.push('### Project Gaps');
    for (const g of synthesis.project_gaps) {
      parts.push('- [' + g.severity + '] ' + g.field_id + ': ' + g.impact);
    }
    parts.push('');
  }

  // CaptivateIQ config
  const cfg = synthesis.captivateiqConfig;
  if (cfg) {
    parts.push('### CaptivateIQ Configuration');
    if (cfg.dataWorksheets?.length) {
      parts.push('Data Worksheets: ' + cfg.dataWorksheets.map((d: DataWorksheetConfig) => d.name + ' (' + d.concept + ')').join(', '));
    }
    if (cfg.attributeWorksheets?.length) {
      parts.push('Attribute Worksheets: ' + cfg.attributeWorksheets.map((a: AttributeWorksheetConfig) => a.name).join(', '));
    }
    if (cfg.formulaRecommendations?.length) {
      parts.push('Formula Recommendations: ' + cfg.formulaRecommendations.length + ' formulas');
    }
    parts.push('');
  }

  // Completeness blockers
  if (completeness?.blockers?.length) {
    parts.push('### Completeness Blockers (' + completeness.blockers.length + ')');
    for (const b of completeness.blockers.slice(0, 20)) {
      parts.push('- [' + b.priority + '] ' + b.id + ': ' + b.name + (b.gapDescription ? ' — ' + b.gapDescription : ''));
    }
    parts.push('');
  }

  // Validation flags
  if (validation.flaggedFields?.length) {
    parts.push('### Flagged Fields');
    for (const f of validation.flaggedFields.slice(0, 15)) {
      parts.push('- ' + f.field_id + ': ' + f.reason + ' [' + f.severity + ']');
    }
    parts.push('');
  }

  // Insights
  parts.push('### Pipeline Insights');
  parts.push(validation.insights || '(none)');
  parts.push('');

  parts.push('---');
  parts.push('');
  parts.push('Based on the above extraction results, analyze what is known vs. unknown for each BRD section and return a JSON object with this EXACT schema:');
  parts.push('');

  const schema = [
    '{',
    '  "summary": "2-3 sentence summary of what was extracted and what gaps remain",',
    '  "knownFields": {',
    '    "clientName": "...",',
    '    "planCount": "...",',
    '    "planTypes": "...",',
    '    "payoutFrequency": "...",',
    '    "rateStructure": "...",',
    '    "quotaTypes": "...",',
    '    "dataWorksheets": "...",',
    '    "reportingNeeds": "..."',
    '  },',
    '  "questions": [',
    '    {',
    '      "id": "q1",',
    '      "section": "Summary",',
    '      "question": "What is the client organization name?",',
    '      "hint": "The legal entity or brand name for the BRD header",',
    '      "required": true',
    '    },',
    '    ...',
    '  ]',
    '}',
  ].join('\n');
  parts.push('```json');
  parts.push(schema);
  parts.push('```');
  parts.push('');
  parts.push('Generate questions for ALL information not extractable from the pipeline results. Cover: client name, fiscal year, project dates, deployment target, roles/access levels, approval workflow, dispute process, historical data requirements, custom report needs, and any AMBIGUOUS or CONFLICTED fields.');
  parts.push('Return ONLY the JSON object, no other text.');

  return parts.join('\n');
}

// ── Generation Pass ───────────────────────────────────────────────────────────

export async function generateBrd(input: BrdGenerationInput): Promise<BrdDocument> {
  const userPrompt = buildGenerationPrompt(input);
  const raw = await runClaudeCli(BRD_GENERATE_SYSTEM, userPrompt, 'claude-opus-4-6');

  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    throw new Error('AI did not return valid JSON for BRD generation');
  }
  return JSON.parse(jsonMatch[1]) as BrdDocument;
}

function buildGenerationPrompt(input: BrdGenerationInput): string {
  const { projectId, validation, synthesis, fileResults, completeness, answers } = input;
  const parts: string[] = [];

  parts.push('## Generate BRD Document');
  parts.push('');
  parts.push('Project ID: ' + projectId);
  parts.push('Generated: ' + new Date().toISOString());
  parts.push('');

  // User-supplied answers
  if (answers.length > 0) {
    parts.push('### User Answers to Clarifying Questions');
    for (const a of answers) {
      parts.push('- [' + a.questionId + '] ' + a.answer);
    }
    parts.push('');
  }

  // Rules summary
  parts.push('### Validated Rules (' + validation.validatedRules.length + ')');
  for (const rule of validation.validatedRules.slice(0, 50)) {
    const r = rule as any;
    parts.push('- ' + (r.name || r.id) + ': type=' + (r.type || '?') + ' | ' + JSON.stringify(r.value ?? r.conditions ?? '').slice(0, 120));
  }
  if (validation.validatedRules.length > 50) {
    parts.push('  ... (' + (validation.validatedRules.length - 50) + ' more rules)');
  }
  parts.push('');

  // Unified fields
  if (synthesis.unified_fields) {
    parts.push('### Resolved Fields');
    for (const [id, f] of Object.entries(synthesis.unified_fields)) {
      const field = f as any;
      if (field.resolution === 'RESOLVED') {
        parts.push('- ' + id + ': ' + JSON.stringify(field.value));
      }
    }
    parts.push('');
  }

  // Conflicts → open questions
  const conflictedFields: string[] = [];
  if (synthesis.unified_fields) {
    for (const [id, f] of Object.entries(synthesis.unified_fields)) {
      if ((f as any).resolution === 'CONFLICTED') conflictedFields.push(id);
    }
  }
  if (conflictedFields.length > 0) {
    parts.push('### Conflicted Fields (→ Open Questions in BRD)');
    parts.push(conflictedFields.join(', '));
    parts.push('');
  }

  // CIQ config
  const cfg = synthesis.captivateiqConfig;
  if (cfg) {
    parts.push('### CaptivateIQ Configuration (source for Data Requirements)');
    parts.push(JSON.stringify(cfg, null, 2).slice(0, 3000));
    parts.push('');
  }

  // Completeness
  if (completeness) {
    parts.push('### Completeness Assessment: ' + completeness.overallReadiness + '% ready');
    parts.push('Blockers: ' + completeness.blockers.length);
    parts.push('');
  }

  // Insights
  parts.push('### Extraction Insights');
  parts.push(validation.insights || synthesis.insights || '(none)');
  parts.push('');

  parts.push('---');
  parts.push('');
  parts.push('Generate a COMPLETE BRD document. Return ONLY a JSON object matching this schema EXACTLY:');
  parts.push('');

  const schemaLines = [
    '{',
    '  "clientName": "string",',
    '  "fiscalYear": "string",',
    '  "projectStartDate": "string (YYYY-MM-DD or TBD)",',
    '  "targetDeploymentDate": "string (YYYY-MM-DD or TBD)",',
    '  "revisionHistory": [{"version":"1.0","date":"YYYY-MM-DD","user":"ICM Extractor AI","changes":"Initial draft"}],',
    '  "planMatrix": [{"planGroup":"string","planName":"string","period":"string","hasSpiff":false}],',
    '  "functionalRequirements": [{',
    '    "planId": "FR-001",',
    '    "planCategory": "string",',
    '    "category": "string",',
    '    "ciqPlanName": "string",',
    '    "channelName": "string",',
    '    "componentProduct": "string",',
    '    "weight": "string",',
    '    "achievementBands": "string",',
    '    "multiplierRates": "string",',
    '    "eligibilityPeriod": "string",',
    '    "payoutFrequency": "string",',
    '    "creditingType": "string",',
    '    "datasource": "string",',
    '    "eligibilityCriteria": "string",',
    '    "eligibilityLogic": "string",',
    '    "rateRules": "string",',
    '    "hasQuota": "Y/N",',
    '    "rateStructureDescription": "string",',
    '    "rateNotes": "string",',
    '    "hasDraw": "Y/N",',
    '    "drawDetails": "string",',
    '    "acceleratorDeceleratorDetails": "string",',
    '    "payoutCap": "string",',
    '    "effectiveDates": "string",',
    '    "planChangeNotes": "string",',
    '    "miscNotes": "string"',
    '  }],',
    '  "businessRequirements": [{"id":1,"requirement":"string","details":"string","priority":"High/Medium/Low","status":"Open","notes":"string"}],',
    '  "dataRequirements": [{"tableOrData":"string","plan":"string","dataType":"string","automatedOrManual":"string","updateFrequency":"string","effectiveDated":"Y/N","level":"string","description":"string","fields":"string"}],',
    '  "reports": [{"id":"string","reportName":"string","frequency":"string","priority":"string","description":"string","summaryLevel":"string","fields":"string","comments":"string"}],',
    '  "openQuestions": [{"id":1,"status":"Open","requestor":"ICM Extractor","question":"string","answer":"","notes":"string"}],',
    '  "generatedAt": "ISO timestamp",',
    '  "projectId": "string",',
    '  "analysisInsights": "string — 3-5 sentence narrative summary of the ICM plan structure and implementation readiness"',
    '}',
  ];
  parts.push('```json');
  parts.push(schemaLines.join('\n'));
  parts.push('```');
  parts.push('');
  parts.push('Be thorough. Every plan/channel/component combination should have its own functionalRequirements row. Business requirements must cover: system roles, approval workflows, dispute resolution, timeline milestones, data governance. Open questions must list all conflicted/ambiguous fields.');

  return parts.join('\n');
}
