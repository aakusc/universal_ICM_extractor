/**
 * Excel Exporter — Generates consolidated output Excel workbook
 *
 * Takes extraction results (rules, CaptivateIQ config, insights) and produces
 * a multi-sheet Excel workbook with:
 *   1. Summary — Plan overview and key metrics
 *   2. Rules — All identified compensation rules with parameters
 *   3. Rate Tables — Data worksheet configs with sample data
 *   4. Employee Assumptions — Quota/target definitions
 *   5. Attribute Mappings — Territory/split/role assignments
 *   6. Formula Logic — Calculation recommendations
 *   7. CIQ Build Guide — Formatted CaptivateIQ implementation steps
 */

import * as XLSX from 'xlsx';
import type { ExtractionResult, CaptivateIQBuildConfig } from '../project/types.js';
import type { NormalizedRule } from '../types/normalized-schema.js';

export interface ExportOptions {
  /** Include source file details */
  includeSources?: boolean;
  /** Project name for header */
  projectName?: string;
}

/**
 * Generate a consolidated Excel workbook buffer from extraction results.
 */
export function generateConsolidatedExcel(
  extraction: ExtractionResult,
  options: ExportOptions = {},
): Buffer {
  const wb = XLSX.utils.book_new();
  const config = extraction.captivateiqConfig;

  // Sheet 1: Summary
  addSummarySheet(wb, extraction, config, options);

  // Sheet 2: All Rules
  addRulesSheet(wb, extraction.rules);

  // Sheet 3: Data Worksheets (Rate Tables etc.)
  if (config.dataWorksheets.length > 0) {
    addDataWorksheetsSheet(wb, config);
  }

  // Sheet 4: Employee Assumptions
  if (config.employeeAssumptionColumns.length > 0) {
    addEmployeeAssumptionsSheet(wb, config);
  }

  // Sheet 5: Attribute Worksheets
  if (config.attributeWorksheets.length > 0) {
    addAttributeWorksheetsSheet(wb, config);
  }

  // Sheet 6: Formula Logic
  if (config.formulaRecommendations.length > 0) {
    addFormulaSheet(wb, config);
  }

  // Sheet 7: CIQ Build Guide
  addBuildGuideSheet(wb, extraction, config);

  // Sheet 8: Insights
  addInsightsSheet(wb, extraction.insights);

  // Generate buffer
  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(xlsxBuffer);
}

// ── Sheet Builders ──────────────────────────────────────────

function addSummarySheet(
  wb: XLSX.WorkBook,
  extraction: ExtractionResult,
  config: CaptivateIQBuildConfig,
  options: ExportOptions,
): void {
  const rows: (string | number)[][] = [
    ['ICM Rule Analysis — Consolidated Report'],
    [],
    ['Plan Name', config.planStructure.planName],
    ['Period Type', config.planStructure.periodType],
    ['Generated', extraction.extractedAt],
    ['Project', options.projectName ?? 'N/A'],
    [],
    ['Metrics', 'Count'],
    ['Total Rules Identified', extraction.rules.length],
    ['Data Worksheets', config.dataWorksheets.length],
    ['Employee Assumptions', config.employeeAssumptionColumns.length],
    ['Attribute Worksheets', config.attributeWorksheets.length],
    ['Formula Recommendations', config.formulaRecommendations.length],
    [],
    ['Payout Components'],
    ...config.planStructure.payoutComponents.map((c) => ['  • ' + c]),
    [],
    ['Implementation Notes'],
    [config.planStructure.notes || 'None'],
  ];

  // Rule breakdown by concept
  const conceptCounts: Record<string, number> = {};
  for (const rule of extraction.rules) {
    conceptCounts[rule.concept] = (conceptCounts[rule.concept] ?? 0) + 1;
  }
  rows.push([]);
  rows.push(['Rule Breakdown by Concept', 'Count']);
  for (const [concept, count] of Object.entries(conceptCounts).sort((a, b) => b[1] - a[1])) {
    rows.push([concept, count]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Set column widths
  ws['!cols'] = [{ wch: 35 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Summary');
}

function addRulesSheet(wb: XLSX.WorkBook, rules: NormalizedRule[]): void {
  const headers = ['ID', 'Concept', 'Description', 'Confidence', 'Source', 'Source Type', 'Parameters'];
  const rows = rules.map((r) => [
    r.id,
    r.concept,
    r.description,
    r.confidence,
    r.sourceRef?.vendorRuleId ?? '',
    r.sourceRef?.vendorRuleType ?? '',
    JSON.stringify(r.parameters ?? {}, null, 0),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 25 }, { wch: 15 }, { wch: 60 }, { wch: 12 },
    { wch: 30 }, { wch: 20 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Rules');
}

function addDataWorksheetsSheet(wb: XLSX.WorkBook, config: CaptivateIQBuildConfig): void {
  // Create a sheet per data worksheet config, plus a summary
  const summaryHeaders = ['Worksheet Name', 'Concept', 'Description', 'Column Count', 'Sample Row Count'];
  const summaryRows = config.dataWorksheets.map((dw) => [
    dw.name, dw.concept, dw.description, dw.columns.length, dw.sampleRows.length,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
  ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 40 }, { wch: 15 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Data Worksheets');

  // Add individual data tables as separate sheets
  for (const dw of config.dataWorksheets) {
    const sheetName = sanitizeSheetName(`DW-${dw.name}`);
    const colHeaders = dw.columns.map((c) => c.name);
    const colTypes = dw.columns.map((c) => `(${c.type})`);
    const dataRows = dw.sampleRows.map((row) =>
      dw.columns.map((c) => {
        const val = row[c.name];
        return val !== undefined && val !== null ? val : '';
      })
    );

    const dataWs = XLSX.utils.aoa_to_sheet([colHeaders, colTypes, ...dataRows]);
    dataWs['!cols'] = colHeaders.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, dataWs, sheetName);
  }
}

function addEmployeeAssumptionsSheet(wb: XLSX.WorkBook, config: CaptivateIQBuildConfig): void {
  const headers = ['Column Name', 'Type', 'Concept', 'Description', 'Example Value'];
  const rows = config.employeeAssumptionColumns.map((ea) => [
    ea.name, ea.type, ea.concept, ea.description, ea.exampleValue ?? '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 50 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Employee Assumptions');
}

function addAttributeWorksheetsSheet(wb: XLSX.WorkBook, config: CaptivateIQBuildConfig): void {
  const headers = ['Worksheet Name', 'Concept', 'PK Type', 'Description', 'Columns'];
  const rows = config.attributeWorksheets.map((aw) => [
    aw.name, aw.concept, aw.pkType, aw.description,
    aw.columns.map((c) => `${c.name} (${c.type})`).join(', '),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 40 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Attribute Worksheets');
}

function addFormulaSheet(wb: XLSX.WorkBook, config: CaptivateIQBuildConfig): void {
  const headers = ['Concept', 'Description', 'Logic Explanation', 'Pseudo Formula', 'CaptivateIQ Notes'];
  const rows = config.formulaRecommendations.map((f) => [
    f.concept, f.description, f.logicExplanation, f.pseudoFormula, f.captivateiqNotes,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 40 }, { wch: 50 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Formula Logic');
}

function addBuildGuideSheet(
  wb: XLSX.WorkBook,
  extraction: ExtractionResult,
  config: CaptivateIQBuildConfig,
): void {
  const rows: (string | number)[][] = [
    ['CaptivateIQ Build Guide'],
    [],
    ['This sheet provides step-by-step instructions for building this compensation plan in CaptivateIQ.'],
    [],
    ['STEP 1: Create Plan'],
    ['Action', 'POST /ciq/v1/plans'],
    ['Plan Name', config.planStructure.planName],
    ['Period Type', config.planStructure.periodType.toUpperCase()],
    ['Status', 'draft'],
    [],
    ['STEP 2: Create Period Group'],
    ['Action', 'POST /ciq/v1/period_groups'],
    ['Period Type', config.planStructure.periodType.toUpperCase()],
    [],
  ];

  // Step 3: Data Worksheets
  if (config.dataWorksheets.length > 0) {
    rows.push(['STEP 3: Create Data Worksheets']);
    for (let i = 0; i < config.dataWorksheets.length; i++) {
      const dw = config.dataWorksheets[i];
      rows.push([`  3.${i + 1}: ${dw.name}`, dw.description]);
      rows.push(['    Concept', dw.concept]);
      rows.push(['    Columns', dw.columns.map((c) => `${c.name} (${c.type})`).join(', ')]);
      rows.push([]);
    }
  }

  // Step 4: Employee Assumptions
  if (config.employeeAssumptionColumns.length > 0) {
    rows.push(['STEP 4: Configure Employee Assumptions']);
    rows.push(['Action', 'PATCH /ciq/v1/plans/:planId/employee_assumptions/schema']);
    for (const ea of config.employeeAssumptionColumns) {
      rows.push([`  • ${ea.name}`, `${ea.type} — ${ea.description}`]);
    }
    rows.push([]);
  }

  // Step 5: Attribute Worksheets
  if (config.attributeWorksheets.length > 0) {
    rows.push(['STEP 5: Create Attribute Worksheets']);
    for (const aw of config.attributeWorksheets) {
      rows.push([`  • ${aw.name}`, `${aw.pkType} — ${aw.description}`]);
    }
    rows.push([]);
  }

  // Step 6: Formula Logic
  if (config.formulaRecommendations.length > 0) {
    rows.push(['STEP 6: Build SmartGrid Formulas (Manual — UI Only)']);
    rows.push(['Note: SmartGrid formulas cannot be set via API. Build these in the CaptivateIQ UI.']);
    for (const f of config.formulaRecommendations) {
      rows.push([`  • ${f.concept}`, f.description]);
      rows.push(['    Formula', f.pseudoFormula]);
      rows.push(['    CIQ Notes', f.captivateiqNotes]);
      rows.push([]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 35 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, ws, 'CIQ Build Guide');
}

function addInsightsSheet(wb: XLSX.WorkBook, insights: string): void {
  // Split insights into rows for readability
  const lines = insights.split('\n');
  const rows = [
    ['AI Analysis & Insights'],
    [],
    ...lines.map((line) => [line]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Insights');
}

// ── Helpers ──────────────────────────────────────────────────

function sanitizeSheetName(name: string): string {
  // Excel sheet names: max 31 chars, no special chars
  return name
    .replace(/[\\/*?[\]:]/g, '-')
    .slice(0, 31);
}
