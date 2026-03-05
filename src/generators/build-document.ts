/**
 * CaptivateIQ Build Document Generator
 *
 * Generates a formatted, human-readable build document that describes
 * how to implement the compensation plan in CaptivateIQ. This is the
 * "formatted description" output — distinct from the Excel numeric output.
 *
 * Output format: Structured markdown-like text suitable for rendering in UI
 * or exporting as a document.
 */

import type { ExtractionResult, CaptivateIQBuildConfig } from '../project/types.js';
import type { NormalizedRule } from '../types/normalized-schema.js';

export interface BuildDocument {
  /** Formatted build document as structured text */
  content: string;
  /** Sections for UI rendering */
  sections: BuildSection[];
  /** Generation metadata */
  generatedAt: string;
  planName: string;
}

export interface BuildSection {
  title: string;
  order: number;
  content: string;
  type: 'overview' | 'step' | 'reference' | 'notes';
}

/**
 * Generate a formatted CaptivateIQ build document from extraction results.
 */
export function generateBuildDocument(
  extraction: ExtractionResult,
  projectName?: string,
): BuildDocument {
  const config = extraction.captivateiqConfig;
  const sections: BuildSection[] = [];
  let order = 0;

  // Section 1: Overview
  sections.push({
    title: 'Plan Overview',
    order: order++,
    type: 'overview',
    content: buildOverviewSection(config, extraction.rules, projectName),
  });

  // Section 2: Insights
  sections.push({
    title: 'AI Analysis',
    order: order++,
    type: 'overview',
    content: extraction.insights,
  });

  // Section 3: Plan Creation
  sections.push({
    title: 'Step 1: Create Plan & Period Group',
    order: order++,
    type: 'step',
    content: buildPlanCreationSection(config),
  });

  // Section 4: Data Worksheets
  if (config.dataWorksheets.length > 0) {
    sections.push({
      title: 'Step 2: Build Data Worksheets',
      order: order++,
      type: 'step',
      content: buildDataWorksheetsSection(config),
    });
  }

  // Section 5: Employee Assumptions
  if (config.employeeAssumptionColumns.length > 0) {
    sections.push({
      title: `Step ${config.dataWorksheets.length > 0 ? 3 : 2}: Configure Employee Assumptions`,
      order: order++,
      type: 'step',
      content: buildEmployeeAssumptionsSection(config),
    });
  }

  // Section 6: Attribute Worksheets
  if (config.attributeWorksheets.length > 0) {
    sections.push({
      title: `Step ${calculateStep(config, 'attribute')}: Create Attribute Worksheets`,
      order: order++,
      type: 'step',
      content: buildAttributeWorksheetsSection(config),
    });
  }

  // Section 7: Formula Recommendations
  if (config.formulaRecommendations.length > 0) {
    sections.push({
      title: `Step ${calculateStep(config, 'formula')}: Build SmartGrid Formulas`,
      order: order++,
      type: 'step',
      content: buildFormulaSection(config),
    });
  }

  // Section 8: Rule Reference
  sections.push({
    title: 'Compensation Rule Reference',
    order: order++,
    type: 'reference',
    content: buildRuleReferenceSection(extraction.rules),
  });

  // Section 9: Implementation Notes
  sections.push({
    title: 'Implementation Notes & Caveats',
    order: order++,
    type: 'notes',
    content: buildNotesSection(config, extraction.rules),
  });

  // Combine all sections into full document
  const content = sections
    .map((s) => `# ${s.title}\n\n${s.content}`)
    .join('\n\n---\n\n');

  return {
    content,
    sections,
    generatedAt: new Date().toISOString(),
    planName: config.planStructure.planName,
  };
}

// ── Section Builders ─────────────────────────────────────────

function buildOverviewSection(
  config: CaptivateIQBuildConfig,
  rules: NormalizedRule[],
  projectName?: string,
): string {
  const lines: string[] = [];

  if (projectName) lines.push(`Project: ${projectName}`);
  lines.push(`Plan Name: ${config.planStructure.planName}`);
  lines.push(`Period Type: ${config.planStructure.periodType}`);
  lines.push('');
  lines.push(`Payout Components: ${config.planStructure.payoutComponents.join(', ') || 'None specified'}`);
  lines.push('');
  lines.push('## Summary Statistics');
  lines.push(`• ${rules.length} compensation rules identified`);
  lines.push(`• ${config.dataWorksheets.length} data worksheets to create`);
  lines.push(`• ${config.employeeAssumptionColumns.length} employee assumption columns`);
  lines.push(`• ${config.attributeWorksheets.length} attribute worksheets`);
  lines.push(`• ${config.formulaRecommendations.length} formula recommendations`);

  // Concept breakdown
  const concepts: Record<string, number> = {};
  for (const rule of rules) {
    concepts[rule.concept] = (concepts[rule.concept] ?? 0) + 1;
  }
  if (Object.keys(concepts).length > 0) {
    lines.push('');
    lines.push('## Rule Breakdown');
    for (const [concept, count] of Object.entries(concepts).sort((a, b) => b[1] - a[1])) {
      lines.push(`• ${concept}: ${count} rule(s)`);
    }
  }

  return lines.join('\n');
}

function buildPlanCreationSection(config: CaptivateIQBuildConfig): string {
  const lines: string[] = [
    '## Create the Plan',
    '',
    'API: POST /ciq/v1/plans',
    '```json',
    JSON.stringify({
      name: config.planStructure.planName,
      period_type: config.planStructure.periodType.toUpperCase(),
      status: 'draft',
    }, null, 2),
    '```',
    '',
    '## Create Period Group',
    '',
    'API: POST /ciq/v1/period_groups',
    `• Period Type: ${config.planStructure.periodType.toUpperCase()}`,
    '• Set start_date and end_date for the initial compensation period',
    '',
  ];

  if (config.planStructure.notes) {
    lines.push('## Notes');
    lines.push(config.planStructure.notes);
  }

  return lines.join('\n');
}

function buildDataWorksheetsSection(config: CaptivateIQBuildConfig): string {
  const lines: string[] = [
    'Create the following data worksheets in CaptivateIQ. Each worksheet stores',
    'reference data (rate tables, tier structures, etc.) used by SmartGrid formulas.',
    '',
  ];

  for (let i = 0; i < config.dataWorksheets.length; i++) {
    const dw = config.dataWorksheets[i];
    lines.push(`## ${i + 1}. ${dw.name}`);
    lines.push(`Concept: ${dw.concept}`);
    lines.push(`Description: ${dw.description}`);
    lines.push('');
    lines.push('Columns:');
    for (const col of dw.columns) {
      lines.push(`  • ${col.name} (${col.type})`);
    }
    if (dw.sampleRows.length > 0) {
      lines.push('');
      lines.push(`Sample Data (${dw.sampleRows.length} rows):`);
      // Show first 5 sample rows
      for (const row of dw.sampleRows.slice(0, 5)) {
        const vals = dw.columns.map((c) => `${c.name}=${row[c.name] ?? ''}`).join(', ');
        lines.push(`  ${vals}`);
      }
      if (dw.sampleRows.length > 5) {
        lines.push(`  ... and ${dw.sampleRows.length - 5} more rows`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildEmployeeAssumptionsSection(config: CaptivateIQBuildConfig): string {
  const lines: string[] = [
    'Configure these columns on the Employee Assumptions schema.',
    'These define per-rep quota targets, base values, and other employee-level parameters.',
    '',
    'API: PATCH /ciq/v1/plans/:planId/employee_assumptions/schema',
    '',
  ];

  for (const ea of config.employeeAssumptionColumns) {
    lines.push(`## ${ea.name}`);
    lines.push(`Type: ${ea.type}`);
    lines.push(`Concept: ${ea.concept}`);
    lines.push(`Description: ${ea.description}`);
    if (ea.exampleValue !== undefined) {
      lines.push(`Example Value: ${ea.exampleValue}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildAttributeWorksheetsSection(config: CaptivateIQBuildConfig): string {
  const lines: string[] = [
    'Create attribute worksheets for territory, role, and other mappings.',
    '',
  ];

  for (const aw of config.attributeWorksheets) {
    lines.push(`## ${aw.name}`);
    lines.push(`Primary Key Type: ${aw.pkType}`);
    lines.push(`Concept: ${aw.concept}`);
    lines.push(`Description: ${aw.description}`);
    lines.push('Columns:');
    for (const col of aw.columns) {
      lines.push(`  • ${col.name} (${col.type})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildFormulaSection(config: CaptivateIQBuildConfig): string {
  const lines: string[] = [
    'IMPORTANT: SmartGrid formulas are defined in the CaptivateIQ UI and cannot',
    'be set via the REST API. Use the following as a reference when building',
    'the calculation logic manually.',
    '',
  ];

  for (const f of config.formulaRecommendations) {
    lines.push(`## ${f.concept}`);
    lines.push(`Description: ${f.description}`);
    lines.push('');
    lines.push('Logic:');
    lines.push(f.logicExplanation);
    lines.push('');
    lines.push('Pseudo Formula:');
    lines.push(`  ${f.pseudoFormula}`);
    lines.push('');
    lines.push('CaptivateIQ Implementation Notes:');
    lines.push(f.captivateiqNotes);
    lines.push('');
  }

  return lines.join('\n');
}

function buildRuleReferenceSection(rules: NormalizedRule[]): string {
  const lines: string[] = [
    'Complete reference of all identified compensation rules.',
    '',
  ];

  // Group by concept
  const grouped: Record<string, NormalizedRule[]> = {};
  for (const rule of rules) {
    if (!grouped[rule.concept]) grouped[rule.concept] = [];
    grouped[rule.concept].push(rule);
  }

  for (const [concept, conceptRules] of Object.entries(grouped)) {
    lines.push(`## ${concept.toUpperCase()}`);
    for (const rule of conceptRules) {
      lines.push(`• ${rule.id} (confidence: ${(rule.confidence * 100).toFixed(0)}%)`);
      lines.push(`  ${rule.description}`);
      if (rule.sourceRef) {
        lines.push(`  Source: ${rule.sourceRef.vendorRuleId} (${rule.sourceRef.vendorRuleType})`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildNotesSection(config: CaptivateIQBuildConfig, rules: NormalizedRule[]): string {
  const lines: string[] = [];

  // Low confidence rules
  const lowConfidence = rules.filter((r) => r.confidence < 0.7);
  if (lowConfidence.length > 0) {
    lines.push('## Low Confidence Rules (< 70%)');
    lines.push('These rules may need manual verification:');
    for (const rule of lowConfidence) {
      lines.push(`• ${rule.id}: ${rule.description} (${(rule.confidence * 100).toFixed(0)}%)`);
    }
    lines.push('');
  }

  // General notes
  lines.push('## General Implementation Notes');
  lines.push('• Review all rate tables and tier structures for accuracy before loading into CaptivateIQ');
  lines.push('• Verify quota/target values with the compensation team');
  lines.push('• SmartGrid formulas must be built manually in the CaptivateIQ UI');
  lines.push('• Test with sample transactions before going live');
  lines.push('• Consider edge cases: mid-period hires, role changes, territory transfers');

  if (config.planStructure.notes) {
    lines.push('');
    lines.push('## Plan-Specific Notes');
    lines.push(config.planStructure.notes);
  }

  return lines.join('\n');
}

// ── Helpers ──────────────────────────────────────────────────

function calculateStep(config: CaptivateIQBuildConfig, section: 'attribute' | 'formula'): number {
  let step = 2; // Plan creation is always step 1
  if (config.dataWorksheets.length > 0) step++;
  if (section === 'attribute') {
    if (config.employeeAssumptionColumns.length > 0) step++;
    return step;
  }
  // formula
  if (config.employeeAssumptionColumns.length > 0) step++;
  if (config.attributeWorksheets.length > 0) step++;
  return step;
}
