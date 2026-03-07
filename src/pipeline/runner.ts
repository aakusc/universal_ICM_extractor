/**
 * Multi-pass extraction pipeline runner.
 *
 * Pass 1: Per-file extraction with mandatory 25-field ICM audit (parallel, concurrency-limited)
 * Pass 2A: Cross-document synthesis — unify fields, resolve conflicts, build CIQ config
 * Pass 2B: Adversarial concern audit — math validation, ambiguity hunt, policy risks
 * Pass 3: Final validation — value-level cross-check, score with deductions
 * Pass 4: Output generation (deterministic)
 */

import { runClaudeCli, parseAiResponse } from '../excel/extractor.js';
import { workbookToPromptString } from '../excel/parser.js';
import { generatePayloads } from '../generators/index.js';
import { generateBuildDocument } from '../generators/build-document.js';
import { generateConsolidatedExcel } from '../excel/exporter.js';
import { generateAllSourceSummaries } from './source-summary.js';
import { analyzeCompleteness } from './completeness.js';
import {
  PASS1_SYSTEM_PROMPT, buildPass1UserPrompt,
  PASS2_SYSTEM_PROMPT, buildPass2UserPrompt,
  PASS2B_SYSTEM_PROMPT, buildPass2BUserPrompt,
  PASS3_SYSTEM_PROMPT, buildPass3UserPrompt,
} from './prompts.js';
import * as store from '../project/store.js';
import type { ParsedWorkbook, ExtractionResult, CaptivateIQBuildConfig } from '../project/types.js';
import type { NormalizedRule } from '../types/normalized-schema.js';
import type {
  PipelineStatus, PipelinePhase, FileExtractionStatus,
  FileExtractionResult, FileClassification,
  SynthesisResult, ValidationResult, ValidationCheck,
  AuditResult,
  PipelineInput, PipelineOutput, PipelineEvent, CompletenessResult,
} from './types.js';

// ── Concurrency Control ──────────────────────────────────

class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(() => { this.active++; resolve(); });
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// ── JSON Retry Wrapper ───────────────────────────────────

async function callClaudeForJson<T>(
  systemPrompt: string,
  userPrompt: string,
  maxRetries: number = 2,
  model: string = 'claude-opus-4-6',
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let effectivePrompt: string;
    if (attempt === 0) {
      effectivePrompt = userPrompt;
    } else {
      // Stronger retry: prepend the JSON requirement to make it unmissable
      effectivePrompt = `CRITICAL INSTRUCTION: You MUST respond with ONLY a raw JSON object. No XML tags, no <handoff> tags, no prose, no markdown fences, no status messages. Start your response with { and end with }. Do not wrap in any tags.\n\n` + userPrompt;
    }

    const raw = await runClaudeCli(systemPrompt, effectivePrompt, model);

    // Detect handoff/summary responses that contain no JSON at all
    const stripped = raw.replace(/<\/?[a-z][^>]*>/gi, '').trim();
    if (!stripped.includes('{')) {
      console.warn(`  [pipeline] Response contained no JSON (attempt ${attempt + 1}/${maxRetries + 1}), got handoff/summary. Preview: ${raw.slice(0, 200)}`);
      if (attempt === maxRetries) {
        throw new Error(`Claude returned non-JSON after ${maxRetries + 1} attempts. Preview: ${raw.slice(0, 300)}`);
      }
      continue;
    }

    // Try parsing
    try {
      const parsed = parseAiResponse(raw) as T;
      return parsed;
    } catch (err) {
      console.warn(`  [pipeline] JSON parse failed (attempt ${attempt + 1}/${maxRetries + 1}): ${err instanceof Error ? err.message : String(err)}`);
      if (attempt === maxRetries) {
        throw new Error(`Claude returned non-JSON after ${maxRetries + 1} attempts. Preview: ${raw.slice(0, 300)}`);
      }
    }
  }
  throw new Error('Unreachable');
}

// ── Pass 1: Per-File Extraction ──────────────────────────

async function extractFilePass1(
  projectId: string,
  fileId: string,
  workbook: ParsedWorkbook,
): Promise<FileExtractionResult> {
  console.log(`  [pass1] Extracting: ${workbook.filename} (${workbook.sheetNames.length} sheets)`);

  const userPrompt = buildPass1UserPrompt(workbook);

  const parsed = await callClaudeForJson<{
    classification: FileClassification;
    rules: NormalizedRule[];
    field_audit?: Record<string, unknown>;
    concerns?: unknown[];
    missing_documents?: string[];
    insights: string;
  }>(PASS1_SYSTEM_PROMPT, userPrompt);

  const result: FileExtractionResult = {
    id: store.generateId(),
    projectId,
    fileId,
    fileName: workbook.filename,
    extractedAt: new Date().toISOString(),
    classification: parsed.classification ?? { fileType: 'unknown', summary: '', relevantSheets: [], irrelevantSheets: [] },
    rules: parsed.rules ?? [],
    field_audit: parsed.field_audit as any ?? undefined,
    concerns: parsed.concerns as any ?? [],
    missing_documents: parsed.missing_documents ?? [],
    insights: parsed.insights ?? '',
  };

  store.saveFileExtractionResult(projectId, fileId, result);
  console.log(`  [pass1] ✓ ${workbook.filename}: ${result.rules.length} rules (${result.classification.fileType})`);
  return result;
}

export async function extractAllFilesPass1(
  projectId: string,
  files: Array<{ fileId: string; workbook: ParsedWorkbook }>,
  concurrency: number = 3,
  onEvent?: (event: PipelineEvent) => void,
): Promise<FileExtractionResult[]> {
  const sem = new Semaphore(concurrency);
  const results: FileExtractionResult[] = [];

  const fileStatuses: FileExtractionStatus[] = files.map(f => ({
    fileId: f.fileId,
    fileName: f.workbook.filename,
    status: 'pending' as const,
  }));

  const emitProgress = () => {
    const done = fileStatuses.filter(s => s.status === 'done').length;
    const total = files.length;
    onEvent?.({
      event: 'progress',
      data: {
        projectId,
        phase: 'extracting',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        progress: {
          label: `${done}/${total} files extracted`,
          percent: Math.round((done / total) * 30), // Pass 1 = 0-30%
        },
        fileStatuses,
      },
    });
  };

  emitProgress();

  const promises = files.map(async (file, idx) => {
    await sem.acquire();
    try {
      fileStatuses[idx].status = 'running';
      emitProgress();

      const result = await extractFilePass1(projectId, file.fileId, file.workbook);

      fileStatuses[idx].status = 'done';
      fileStatuses[idx].ruleCount = result.rules.length;
      results.push(result);

      onEvent?.({
        event: 'pass1_file',
        data: { fileId: file.fileId, fileName: file.workbook.filename, ruleCount: result.rules.length },
      });

      emitProgress();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [pass1] ✗ ${file.workbook.filename}: ${msg}`);
      fileStatuses[idx].status = 'error';
      fileStatuses[idx].error = msg;
      emitProgress();
    } finally {
      sem.release();
    }
  });

  await Promise.all(promises);

  const succeeded = results.length;
  const failed = files.length - succeeded;
  console.log(`  [pass1] Complete: ${succeeded} succeeded, ${failed} failed`);

  return results;
}

// ── Pass 2: Cross-Reference Synthesis ────────────────────

export async function synthesizePass2(
  projectId: string,
  fileResults: FileExtractionResult[],
  onEvent?: (event: PipelineEvent) => void,
): Promise<SynthesisResult> {
  console.log(`  [pass2] Synthesizing ${fileResults.length} file results...`);

  onEvent?.({
    event: 'progress',
    data: {
      projectId,
      phase: 'synthesizing',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: { label: 'Synthesizing rules across files...', percent: 40 },
      fileStatuses: fileResults.map(fr => ({
        fileId: fr.fileId,
        fileName: fr.fileName,
        status: 'done' as const,
        ruleCount: fr.rules.length,
      })),
    },
  });

  const userPrompt = buildPass2UserPrompt(fileResults);

  const parsed = await callClaudeForJson<{
    unified_fields?: Record<string, unknown>;
    project_gaps?: unknown[];
    rules: NormalizedRule[];
    crossReferences: SynthesisResult['crossReferences'];
    conflicts: SynthesisResult['conflicts'];
    captivateiqConfig: CaptivateIQBuildConfig;
    insights: string;
  }>(PASS2_SYSTEM_PROMPT, userPrompt);

  const result: SynthesisResult = {
    id: store.generateId(),
    projectId,
    synthesizedAt: new Date().toISOString(),
    rules: parsed.rules ?? [],
    crossReferences: parsed.crossReferences ?? [],
    conflicts: parsed.conflicts ?? [],
    captivateiqConfig: parsed.captivateiqConfig ?? {
      planStructure: { planName: '', periodType: 'annual', payoutComponents: [], notes: '' },
      dataWorksheets: [],
      employeeAssumptionColumns: [],
      attributeWorksheets: [],
      formulaRecommendations: [],
    },
    unified_fields: parsed.unified_fields as any ?? undefined,
    project_gaps: parsed.project_gaps as any ?? [],
    insights: parsed.insights ?? '',
  };

  store.saveSynthesisResult(projectId, result);
  const gapCount = result.project_gaps?.length ?? 0;
  console.log(`  [pass2] ✓ Synthesized: ${result.rules.length} rules, ${result.conflicts.length} conflicts, ${gapCount} project gaps`);

  onEvent?.({
    event: 'pass2',
    data: { ruleCount: result.rules.length, conflictCount: result.conflicts.length, gapCount },
  });

  return result;
}

// ── Pass 2B: Adversarial Concern Audit ───────────────────

export async function auditPass2B(
  projectId: string,
  fileResults: FileExtractionResult[],
  synthesis: SynthesisResult,
  onEvent?: (event: PipelineEvent) => void,
): Promise<AuditResult> {
  console.log(`  [pass2b] Running adversarial concern audit...`);

  onEvent?.({
    event: 'progress',
    data: {
      projectId,
      phase: 'synthesizing',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: { label: 'Auditing for concerns, ambiguities, and math errors...', percent: 55 },
      fileStatuses: [],
    },
  });

  const userPrompt = buildPass2BUserPrompt(fileResults, synthesis);

  const parsed = await callClaudeForJson<AuditResult>(
    PASS2B_SYSTEM_PROMPT,
    userPrompt,
    2,
    'claude-sonnet-4-6',
  );

  const result: AuditResult = {
    math_validation: parsed.math_validation ?? [],
    concerns: parsed.concerns ?? [],
    blocking_issues: parsed.blocking_issues ?? [],
    overall_risk: parsed.overall_risk ?? 'medium',
    risk_summary: parsed.risk_summary ?? '',
  };

  const blockingCount = result.blocking_issues.length;
  const concernCount = result.concerns.length;
  console.log(`  [pass2b] ✓ Audit: ${concernCount} concerns (${blockingCount} blocking), risk=${result.overall_risk}`);

  onEvent?.({
    event: 'pass2b',
    data: { concernCount, blockingCount, overall_risk: result.overall_risk },
  });

  return result;
}

// ── Pass 3: Validation ───────────────────────────────────

function runDeterministicChecks(synthesis: SynthesisResult): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  // Check 1: Low-confidence rules
  const lowConf = synthesis.rules.filter(r => r.confidence < 0.7);
  checks.push({
    name: 'confidence-threshold',
    passed: lowConf.length === 0,
    details: lowConf.length === 0
      ? 'All rules have confidence >= 0.7'
      : `${lowConf.length} rule(s) have confidence < 0.7: ${lowConf.map(r => r.id).join(', ')}`,
    severity: lowConf.length > 0 ? 'warning' : 'info',
  });

  // Check 2: Duplicate rule IDs
  const ids = synthesis.rules.map(r => r.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  checks.push({
    name: 'duplicate-ids',
    passed: dupes.length === 0,
    details: dupes.length === 0 ? 'No duplicate rule IDs' : `Duplicate IDs: ${[...new Set(dupes)].join(', ')}`,
    severity: dupes.length > 0 ? 'error' : 'info',
  });

  // Check 3: Empty parameters
  const emptyParams = synthesis.rules.filter(r => !r.parameters || Object.keys(r.parameters).length === 0);
  checks.push({
    name: 'empty-parameters',
    passed: emptyParams.length === 0,
    details: emptyParams.length === 0
      ? 'All rules have non-empty parameters'
      : `${emptyParams.length} rule(s) have empty parameters: ${emptyParams.map(r => r.id).join(', ')}`,
    severity: emptyParams.length > 0 ? 'warning' : 'info',
  });

  // Check 4: Concept coverage
  const concepts = new Set(synthesis.rules.map(r => r.concept));
  const missing: string[] = [];
  if (!concepts.has('rate-table')) missing.push('rate-table');
  if (!concepts.has('quota-target')) missing.push('quota-target');
  checks.push({
    name: 'concept-coverage',
    passed: missing.length === 0,
    details: missing.length === 0
      ? 'Core concepts (rate-table, quota-target) are covered'
      : `Missing common concepts: ${missing.join(', ')}`,
    severity: missing.length > 0 ? 'warning' : 'info',
  });

  // Check 5: CIQ config completeness
  const cfg = synthesis.captivateiqConfig;
  const cfgIssues: string[] = [];
  if (!cfg.planStructure.planName) cfgIssues.push('missing planName');
  if (cfg.dataWorksheets.length === 0) cfgIssues.push('no data worksheets');
  if (cfg.formulaRecommendations.length === 0) cfgIssues.push('no formula recommendations');
  checks.push({
    name: 'config-completeness',
    passed: cfgIssues.length === 0,
    details: cfgIssues.length === 0 ? 'CIQ config is complete' : `Config issues: ${cfgIssues.join(', ')}`,
    severity: cfgIssues.length > 0 ? 'warning' : 'info',
  });

  return checks;
}

export async function validatePass3(
  projectId: string,
  synthesis: SynthesisResult,
  files: Array<{ fileId: string; workbook: ParsedWorkbook }>,
  auditResult?: AuditResult,
  onEvent?: (event: PipelineEvent) => void,
): Promise<ValidationResult> {
  console.log(`  [pass3] Validating ${synthesis.rules.length} rules against ${files.length} source files...`);

  onEvent?.({
    event: 'progress',
    data: {
      projectId,
      phase: 'validating',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: { label: 'Validating rules against source data...', percent: 70 },
      fileStatuses: [],
    },
  });

  // Run deterministic checks first
  const deterministicChecks = runDeterministicChecks(synthesis);
  console.log(`  [pass3] Deterministic checks: ${deterministicChecks.filter(c => c.passed).length}/${deterministicChecks.length} passed`);

  // Generate source data summaries
  const sourceDataSummary = generateAllSourceSummaries(files, 15000);

  // AI validation — now includes audit result so concerns are carried forward
  const userPrompt = buildPass3UserPrompt(synthesis, sourceDataSummary, deterministicChecks, auditResult);

  const parsed = await callClaudeForJson<{
    overallScore: number;
    score_breakdown?: { base_score: number; deductions: Array<{ reason: string; points: number }> };
    checks: ValidationCheck[];
    flaggedRules: Array<{ ruleId: string; reason: string; severity: string; suggestion?: string }>;
    flaggedFields?: Array<{ field_id: string; reason: string; severity: string; concern_ref: string | null }>;
    open_concerns_carried?: Array<{ concern_id: string; severity: string; status: string }>;
    corrections: Array<{ ruleId: string; field: string; oldValue: unknown; newValue: unknown; reason: string }>;
    insights: string;
  }>(PASS3_SYSTEM_PROMPT, userPrompt, 2, 'claude-sonnet-4-6');

  // Apply high-confidence corrections to rules
  let validatedRules = [...synthesis.rules];
  let validatedConfig = synthesis.captivateiqConfig;

  if (parsed.corrections && parsed.corrections.length > 0) {
    console.log(`  [pass3] Applying ${parsed.corrections.length} corrections...`);
    for (const correction of parsed.corrections) {
      const ruleIdx = validatedRules.findIndex(r => r.id === correction.ruleId);
      if (ruleIdx !== -1 && correction.field === 'parameters') {
        // Apply parameter corrections
        validatedRules[ruleIdx] = {
          ...validatedRules[ruleIdx],
          parameters: { ...validatedRules[ruleIdx].parameters, ...(correction.newValue as Record<string, unknown>) },
        };
      }
    }
  }

  const allChecks = [
    ...deterministicChecks,
    ...(parsed.checks ?? []),
  ];

  const result: ValidationResult = {
    id: store.generateId(),
    projectId,
    validatedAt: new Date().toISOString(),
    overallScore: parsed.overallScore ?? 0,
    score_breakdown: parsed.score_breakdown,
    checks: allChecks,
    flaggedRules: (parsed.flaggedRules ?? []).map(f => ({
      ...f,
      severity: f.severity as 'low-confidence' | 'contradiction' | 'missing-data' | 'mismatch',
    })),
    flaggedFields: parsed.flaggedFields as any ?? [],
    open_concerns_carried: parsed.open_concerns_carried ?? [],
    validatedRules,
    captivateiqConfig: validatedConfig,
    insights: parsed.insights ?? '',
    auditResult,
  };

  store.saveValidationResult(projectId, result);
  console.log(`  [pass3] ✓ Validation complete: score=${result.overallScore}/100, ${result.flaggedRules.length} flagged, ${allChecks.filter(c => !c.passed).length} failed checks`);

  onEvent?.({
    event: 'pass3',
    data: { overallScore: result.overallScore, flaggedCount: result.flaggedRules.length },
  });

  return result;
}

// ── Pipeline Orchestrator ────────────────────────────────

export async function runPipeline(
  input: PipelineInput,
  onEvent?: (event: PipelineEvent) => void,
): Promise<PipelineOutput> {
  const { projectId, files, force } = input;
  const startedAt = new Date().toISOString();

  console.log(`[pipeline] ════════════════════════════════════════`);
  console.log(`[pipeline] Starting multi-pass pipeline: ${files.length} files`);
  console.log(`[pipeline] ════════════════════════════════════════`);

  // Clear previous results if force re-run
  if (force) {
    console.log(`[pipeline] Force mode — clearing previous results`);
    store.clearPipelineResults(projectId);
  }

  const updateStatus = (phase: PipelinePhase, label: string, percent: number, error?: string) => {
    const status: PipelineStatus = {
      projectId,
      phase,
      startedAt,
      updatedAt: new Date().toISOString(),
      progress: { label, percent },
      fileStatuses: [],
      error,
    };
    store.savePipelineStatus(projectId, status);
  };

  try {
    // ── Pass 1: Per-File Extraction ────────────────────

    let fileResults = store.loadAllFileExtractionResults(projectId);
    const alreadyExtracted = new Set(fileResults.map(r => r.fileId));
    const remaining = files.filter(f => !alreadyExtracted.has(f.fileId));

    if (remaining.length > 0) {
      console.log(`[pipeline] Pass 1: Extracting ${remaining.length} files (${alreadyExtracted.size} cached)`);
      updateStatus('extracting', `Extracting ${remaining.length} files...`, 5);

      const newResults = await extractAllFilesPass1(projectId, remaining, 3, onEvent);
      fileResults = [...fileResults, ...newResults];
    } else {
      console.log(`[pipeline] Pass 1: All ${files.length} files already extracted (cached)`);
    }

    if (fileResults.length === 0) {
      throw new Error('Pass 1 failed: no files could be extracted');
    }

    // ── Pass 2: Cross-Reference Synthesis ──────────────

    let synthesis = force ? null : store.loadSynthesisResult(projectId);

    if (!synthesis) {
      console.log(`[pipeline] Pass 2: Synthesizing ${fileResults.length} file results`);
      updateStatus('synthesizing', 'Synthesizing rules across files...', 35);
      synthesis = await synthesizePass2(projectId, fileResults, onEvent);
    } else {
      console.log(`[pipeline] Pass 2: Using cached synthesis`);
    }

    // ── Pass 2B: Adversarial Concern Audit ────────────

    let auditResult: AuditResult | undefined;
    if (!force) {
      // No caching for audit — always re-run alongside synthesis if synthesis changed
      try {
        const stored = store.loadValidationResult(projectId);
        auditResult = stored?.auditResult;
      } catch { /* no cached audit */ }
    }

    if (!auditResult) {
      console.log(`[pipeline] Pass 2B: Adversarial concern audit`);
      updateStatus('synthesizing', 'Auditing for concerns, ambiguities, and conflicts...', 55);
      auditResult = await auditPass2B(projectId, fileResults, synthesis, onEvent);
    } else {
      console.log(`[pipeline] Pass 2B: Using cached audit (${auditResult.concerns.length} concerns)`);
    }

    // ── Pass 3: Validation ─────────────────────────────

    let validation = force ? null : store.loadValidationResult(projectId);

    if (!validation) {
      console.log(`[pipeline] Pass 3: Validating against source data`);
      updateStatus('validating', 'Validating rules against source data...', 70);
      validation = await validatePass3(projectId, synthesis, files, auditResult, onEvent);
    } else {
      console.log(`[pipeline] Pass 3: Using cached validation`);
    }

    // ── Completeness Analysis ───────────────────────────

    console.log(`[pipeline] Analyzing CIQ build readiness...`);
    const completeness = analyzeCompleteness(synthesis, validation, auditResult);
    store.saveCompletenessResult(projectId, completeness);
    console.log(`[pipeline] ✓ Readiness: ${completeness.overallReadiness}% (${completeness.counts.complete}/${completeness.counts.total - completeness.counts.notApplicable} items, ${completeness.blockers.length} blockers)`);

    onEvent?.({
      event: 'progress',
      data: {
        projectId,
        phase: 'validating',
        startedAt,
        updatedAt: new Date().toISOString(),
        progress: { label: `Readiness: ${completeness.overallReadiness}% — ${completeness.blockers.length} blockers`, percent: 80 },
        fileStatuses: [],
      },
    });

    // ── Pass 4: Output Generation ──────────────────────

    console.log(`[pipeline] Pass 4: Generating outputs`);
    updateStatus('generating', 'Generating CaptivateIQ configuration...', 85);

    onEvent?.({
      event: 'progress',
      data: {
        projectId,
        phase: 'generating',
        startedAt,
        updatedAt: new Date().toISOString(),
        progress: { label: 'Generating outputs...', percent: 85 },
        fileStatuses: [],
      },
    });

    // Build ExtractionResult compatible with existing generators
    const primaryWorkbook = files[0]?.workbook ?? {
      filename: `pipeline-${files.length}-files`,
      sheetNames: [],
      sheets: [],
      namedRanges: [],
      summary: `Multi-pass pipeline extraction of ${files.length} files`,
    };

    const extractionResult: ExtractionResult = {
      id: store.generateId(),
      projectId,
      fileId: 'pipeline',
      extractedAt: new Date().toISOString(),
      workbook: primaryWorkbook,
      rules: validation.validatedRules,
      insights: validation.insights,
      captivateiqConfig: validation.captivateiqConfig,
    };

    // Save as a standard extraction for backward compat
    store.saveExtraction(extractionResult);

    // Generate payloads
    const payloads = generatePayloads(validation.captivateiqConfig);
    store.saveGeneration(projectId, 'pipeline', payloads);

    updateStatus('complete', 'Pipeline complete', 100);

    const output: PipelineOutput = { fileResults, synthesis, auditResult, validation, completeness };

    onEvent?.({ event: 'complete', data: output });

    console.log(`[pipeline] ════════════════════════════════════════`);
    console.log(`[pipeline] COMPLETE: ${validation.validatedRules.length} rules, score ${validation.overallScore}/100`);
    console.log(`[pipeline] ════════════════════════════════════════`);

    return output;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] FAILED: ${msg}`);
    updateStatus('error', msg, 0, msg);
    onEvent?.({ event: 'error', data: { message: msg, phase: 'error' } });
    throw err;
  }
}
