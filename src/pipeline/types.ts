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
}

export interface FileExtractionResult {
  id: string;
  projectId: string;
  fileId: string;
  fileName: string;
  extractedAt: string;
  classification: FileClassification;
  rules: NormalizedRule[];
  insights: string;
}

// ── Pass 2: Cross-Reference Synthesis ────────────────────

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

export interface ValidationResult {
  id: string;
  projectId: string;
  validatedAt: string;
  overallScore: number;
  checks: ValidationCheck[];
  flaggedRules: FlaggedRule[];
  validatedRules: NormalizedRule[];
  captivateiqConfig: CaptivateIQBuildConfig;
  insights: string;
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
  validation: ValidationResult;
  completeness?: CompletenessResult;
}

// ── SSE Event Types ──────────────────────────────────────

export type PipelineEvent =
  | { event: 'progress'; data: PipelineStatus }
  | { event: 'pass1_file'; data: { fileId: string; fileName: string; ruleCount: number } }
  | { event: 'pass2'; data: { ruleCount: number; conflictCount: number } }
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
