/**
 * Multi-file aggregator — merges CaptivateIQBuildConfig from multiple ExtractionResults
 *
 * When a project has several Excel files (quota tables, rate tables, commission schedules)
 * each is extracted individually. This module merges all extracted configs into a single
 * unified CaptivateIQBuildConfig with provenance tracking.
 *
 * Merge strategy:
 *   - planStructure:              majority-vote on periodType; union payoutComponents; longest planName wins
 *   - dataWorksheets:             union, deduplicated by name (richer item wins on collision)
 *   - employeeAssumptionColumns:  union, deduplicated by name
 *   - attributeWorksheets:        union, deduplicated by name
 *   - formulaRecommendations:     union, deduplicated by concept
 *   - insights:                   concatenated with per-file attribution headers
 */

import type {
  ExtractionResult,
  CaptivateIQBuildConfig,
  PlanStructureRecommendation,
  DataWorksheetConfig,
  EmployeeAssumptionColumn,
  AttributeWorksheetConfig,
  FormulaRecommendation,
} from '../project/types.js';

// ── Public Types ──────────────────────────────────────

export interface FileSource {
  fileId: string;
  fileName: string;
  extractedAt: string;
}

export interface AggregatedProjectConfig {
  projectId: string;
  /** One entry per source extraction that was merged */
  sources: FileSource[];
  aggregatedAt: string;
  /** Merged, deduplicated CaptivateIQ build configuration */
  mergedConfig: CaptivateIQBuildConfig;
  /** All per-file insights concatenated with attribution headers */
  combinedInsights: string;
  stats: {
    fileCount: number;
    dataWorksheetCount: number;
    employeeAssumptionCount: number;
    attributeWorksheetCount: number;
    formulaCount: number;
  };
}

// ── Plan Structure Merge ──────────────────────────────

function mergePlanStructure(structs: PlanStructureRecommendation[]): PlanStructureRecommendation {
  if (structs.length === 0) {
    return { planName: 'Unnamed Plan', periodType: 'monthly', payoutComponents: [], notes: '' };
  }
  if (structs.length === 1) return structs[0];

  // Longest plan name is usually more descriptive
  const planName = structs.reduce((best, s) =>
    s.planName.length > best.planName.length ? s : best
  ).planName;

  // Majority vote on period type
  const counts: Record<string, number> = {};
  for (const s of structs) counts[s.periodType] = (counts[s.periodType] ?? 0) + 1;
  const periodType = (
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  ) as PlanStructureRecommendation['periodType'];

  // Union all payout components, deduped
  const payoutComponents = [...new Set(structs.flatMap((s) => s.payoutComponents))];

  // Merge notes with file attribution
  const notes = structs
    .map((s, i) => `[File ${i + 1}: ${s.planName}]\n${s.notes}`)
    .filter((n) => n.trim().length > 20)
    .join('\n\n');

  return { planName, periodType, payoutComponents, notes };
}

// ── Deduplication ─────────────────────────────────────

/**
 * Deduplicate by `name`. On collision, keep the richer item (longer JSON = more fields).
 */
function deduplicateByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const key = item.name.toLowerCase().trim();
    const existing = seen.get(key);
    if (!existing || JSON.stringify(item).length > JSON.stringify(existing).length) {
      seen.set(key, item);
    }
  }
  return [...seen.values()];
}

/**
 * Deduplicate by `concept`. On collision, keep the richer item.
 */
function deduplicateByConcept<T extends { concept: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const key = item.concept.toLowerCase().trim();
    const existing = seen.get(key);
    if (!existing || JSON.stringify(item).length > JSON.stringify(existing).length) {
      seen.set(key, item);
    }
  }
  return [...seen.values()];
}

// ── Main Aggregator ───────────────────────────────────

/**
 * Merge multiple ExtractionResults into a single AggregatedProjectConfig.
 * Pass all extractions for a project; the function handles deduplication and merging.
 */
export function aggregateExtractions(
  projectId: string,
  extractions: ExtractionResult[],
): AggregatedProjectConfig {
  if (extractions.length === 0) {
    throw new Error('Cannot aggregate zero extractions');
  }

  const sources: FileSource[] = extractions.map((e) => ({
    fileId: e.fileId,
    fileName: e.workbook.filename,
    extractedAt: e.extractedAt,
  }));

  const configs = extractions.map((e) => e.captivateiqConfig);

  const mergedConfig: CaptivateIQBuildConfig = {
    planStructure: mergePlanStructure(configs.map((c) => c.planStructure)),
    dataWorksheets: deduplicateByName<DataWorksheetConfig>(
      configs.flatMap((c) => c.dataWorksheets ?? [])
    ),
    employeeAssumptionColumns: deduplicateByName<EmployeeAssumptionColumn>(
      configs.flatMap((c) => c.employeeAssumptionColumns ?? [])
    ),
    attributeWorksheets: deduplicateByName<AttributeWorksheetConfig>(
      configs.flatMap((c) => c.attributeWorksheets ?? [])
    ),
    formulaRecommendations: deduplicateByConcept<FormulaRecommendation>(
      configs.flatMap((c) => c.formulaRecommendations ?? [])
    ),
  };

  const combinedInsights = extractions
    .map((e, i) => `## File ${i + 1}: ${e.workbook.filename}\n\n${e.insights}`)
    .join('\n\n---\n\n');

  return {
    projectId,
    sources,
    aggregatedAt: new Date().toISOString(),
    mergedConfig,
    combinedInsights,
    stats: {
      fileCount: extractions.length,
      dataWorksheetCount: mergedConfig.dataWorksheets.length,
      employeeAssumptionCount: mergedConfig.employeeAssumptionColumns.length,
      attributeWorksheetCount: mergedConfig.attributeWorksheets.length,
      formulaCount: mergedConfig.formulaRecommendations.length,
    },
  };
}
