/**
 * Multi-pass extraction pipeline types.
 */

import type { NormalizedRule } from '../types/normalized-schema.js';
import type { CaptivateIQBuildConfig, ParsedWorkbook } from '../project/types.js';

// ── Pipeline Status ──────────────────────────────────────

export type PipelinePhase = 'extracting' | 'synthesizing' | 'validating' | 'generating' | 'complete' | 'error';

export interface PipelineStatus {
  projectId: string;
  phase: PipelinePhase;
  startedAt: string;
  updatedAt: string;
  progress: { label: string; percent: number };
  fileStatuses: FileExtractionStatus[];
  error?: string;
}

export interface FileExtractionStatus {
  fileId: string;
  fileName: string;
  status: 'pending' | 'running' | 'done' | 'error';
  ruleCount?: number;
  error?: string;
}

// ── Pass 1: Per-File Extraction ──────────────────────────

export interface FileClassification {
  fileType: 'comp-plan' | 'rate-table' | 'quota-sheet' | 'territory-map' |
            'deal-data' | 'payout-schedule' | 'policy-doc' | 'unknown';
  summary: string;
  relevantSheets: string[];
  irrelevantSheets: string[];
  documentCompleteness?: 'full-plan' | 'partial-plan' | 'supporting-data' | 'reference-only';
}

export type FieldAuditStatus = 'FOUND' | 'MISSING' | 'AMBIGUOUS';

export interface FieldAuditEntry {
  status: FieldAuditStatus;
  value: unknown;
  evidence: string | null;
  source_ref: string | null;
  confidence: number;
  concern: string | null;
}

export type FieldAudit = Record<string, FieldAuditEntry>;

export interface FileConcern {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'ambiguous-language' | 'internal-contradiction' | 'missing-reference' |
            'placeholder' | 'logical-error' | 'incomplete-definition';
  description: string;
  location: string;
  recommendation: string;
}

export interface FileExtractionResult {
  id: string;
  projectId: string;
  fileId: string;
  fileName: string;
  extractedAt: string;
  classification: FileClassification;
  rules: NormalizedRule[];
  field_audit?: FieldAudit;
  concerns?: FileConcern[];
  missing_documents?: string[];
  insights: string;
}

// ── Pass 2A: Cross-Reference Synthesis ───────────────────

export interface CrossReference {
  ruleId: string;
  relatedRuleIds: string[];
  relationship: string;
}

export interface RuleConflict {
  description: string;
  ruleIds: string[];
  resolution: string;
  confidence: number;
  // extended fields from new synthesis format
  field_or_rule?: string;
  file_a?: string;
  value_a?: string;
  file_b?: string;
  value_b?: string;
}

export type FieldResolution = 'RESOLVED' | 'CONFLICTED' | 'PROJECT_MISSING';

export interface UnifiedField {
  resolution: FieldResolution;
  value: unknown;
  confidence: number;
  sources: string[];
  conflict_note: string | null;
}

export type UnifiedFields = Record<string, UnifiedField>;

export interface ProjectGap {
  field_id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  impact: string;
  recommendation: string;
}

export interface SynthesisResult {
  id: string;
  projectId: string;
  synthesizedAt: string;
  rules: NormalizedRule[];
  crossReferences: CrossReference[];
  conflicts: RuleConflict[];
  captivateiqConfig: CaptivateIQBuildConfig;
  insights: string;
  // extended fields from new synthesis format
  unified_fields?: UnifiedFields;
  project_gaps?: ProjectGap[];
}

// ── Pass 2B: Adversarial Concern Audit ───────────────────

export interface AuditMathCheck {
  check: string;
  passed: boolean;
  detail: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface AuditConcern {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'ambiguous-language' | 'internal-contradiction' | 'missing-definition' |
            'structural-gap' | 'math-error' | 'policy-risk' | 'missing-reference';
  description: string;
  location: string;
  impact: string;
  recommendation: string;
}

export interface AuditResult {
  math_validation: AuditMathCheck[];
  concerns: AuditConcern[];
  blocking_issues: string[];
  overall_risk: 'low' | 'medium' | 'high' | 'critical';
  risk_summary: string;
}

// ── Pass 3: Validation ───────────────────────────────────

export interface ValidationCheck {
  name: string;
  passed: boolean;
  details: string;
  severity: 'info' | 'warning' | 'error';
}

export interface FlaggedRule {
  ruleId: string;
  reason: string;
  severity: 'low-confidence' | 'contradiction' | 'missing-data' | 'mismatch';
  suggestion?: string;
}

export interface FlaggedField {
  field_id: string;
  reason: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  concern_ref: string | null;
}

export interface ScoreDeduction {
  reason: string;
  points: number;
}

export interface ValidationResult {
  id: string;
  projectId: string;
  validatedAt: string;
  overallScore: number;
  score_breakdown?: { base_score: number; deductions: ScoreDeduction[] };
  checks: ValidationCheck[];
  flaggedRules: FlaggedRule[];
  flaggedFields?: FlaggedField[];
  open_concerns_carried?: Array<{ concern_id: string; severity: string; status: string }>;
  validatedRules: NormalizedRule[];
  captivateiqConfig: CaptivateIQBuildConfig;
  insights: string;
  auditResult?: AuditResult;
}

// ── Pipeline Input/Output ────────────────────────────────

export interface PipelineInput {
  projectId: string;
  files: Array<{ fileId: string; workbook: ParsedWorkbook }>;
  documents?: Array<{ fileId: string; document: { filename: string; textContent: string } }>;
  requirements?: Array<{ text: string; priority: string }>;
  notes?: Array<{ text: string; createdAt: string }>;
  force?: boolean;
}

export interface PipelineOutput {
  fileResults: FileExtractionResult[];
  synthesis: SynthesisResult;
  auditResult?: AuditResult;
  validation: ValidationResult;
  completeness?: CompletenessResult;
}

// ── SSE Event Types ──────────────────────────────────────

export type PipelineEvent =
  | { event: 'progress'; data: PipelineStatus }
  | { event: 'pass1_file'; data: { fileId: string; fileName: string; ruleCount: number } }
  | { event: 'pass2'; data: { ruleCount: number; conflictCount: number; gapCount: number } }
  | { event: 'pass2b'; data: { concernCount: number; blockingCount: number; overall_risk: string } }
  | { event: 'pass3'; data: { overallScore: number; flaggedCount: number } }
  | { event: 'complete'; data: PipelineOutput }
  | { event: 'completeness'; data: { overallReadiness: number; blockerCount: number; counts: CompletenessResult['counts'] } }
  | { event: 'error'; data: { message: string; phase: PipelinePhase } };

// ── Completeness Checklist ───────────────────────────────

export type ChecklistCategory =
  | 'plan-setup' | 'data-workbooks' | 'employee-assumptions'
  | 'global-attributes' | 'formulas' | 'payouts'
  | 'organization' | 'data-quality';

export interface ChecklistItem {
  id: string;                   // "plan-setup.plan-name"
  name: string;                 // "Plan name defined"
  category: ChecklistCategory;
  priority: 'required' | 'recommended' | 'optional';
  status: 'complete' | 'partial' | 'missing' | 'not-applicable';
  evidence: string | null;
  gapDescription: string | null;
  suggestedAction: string | null;
  sourceRuleIds: string[];
}

export interface CategorySummary {
  category: ChecklistCategory;
  displayName: string;
  total: number;
  complete: number;
  partial: number;
  missing: number;
  completionPercent: number;
}

export interface CompletenessResult {
  analyzedAt: string;
  overallReadiness: number;     // 0-100 weighted
  categorySummaries: CategorySummary[];
  items: ChecklistItem[];
  blockers: ChecklistItem[];    // required + missing/partial
  quickWins: ChecklistItem[];   // partial items close to complete
  counts: { total: number; complete: number; partial: number; missing: number; notApplicable: number };
}
