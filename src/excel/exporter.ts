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

import ExcelJS from 'exceljs';
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
export async function generateConsolidatedExcel(
  extraction: ExtractionResult,
  options: ExportOptions = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ICM Rule Extractor';
  workbook.created = new Date();

  const config = extraction.captivateiqConfig;

  // Sheet 1: Summary
  addSummarySheet(workbook, extraction, config, options);

  // Sheet 2: All Rules
  addRulesSheet(workbook, extraction.rules);

  // Sheet 3: Data Worksheets (Rate Tables etc.)
  if (config.dataWorksheets.length > 0) {
    addDataWorksheetsSheet(workbook, config);
  }

  // Sheet 4: Employee Assumptions
  if (config.employeeAssumptionColumns.length > 0) {
    addEmployeeAssumptionsSheet(workbook, config);
  }

  // Sheet 5: Attribute Worksheets
  if (config.attributeWorksheets.length > 0) {
    addAttributeWorksheetsSheet(workbook, config);
  }

  // Sheet 6: Formula Logic
  if (config.formulaRecommendations.length > 0) {
    addFormulaSheet(workbook, config);
  }

  // Sheet 7: CIQ Build Guide
  addBuildGuideSheet(workbook, extraction, config);

  // Sheet 8: Insights
  addInsightsSheet(workbook, extraction.insights);

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ── Sheet Builders ──────────────────────────────────────────

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  extraction: ExtractionResult,
  config: CaptivateIQBuildConfig,
  options: ExportOptions,
): void {
  const worksheet = workbook.addWorksheet('Summary');
  
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

  // Add rows to worksheet
  rows.forEach((row, idx) => {
    const excelRow = worksheet.getRow(idx + 1);
    row.forEach((value, colIdx) => {
      excelRow.getCell(colIdx + 1).value = value;
    });
  });

  // Set column widths
  worksheet.getColumn(1).width = 35;
  worksheet.getColumn(2).width = 50;
}

function addRulesSheet(workbook: ExcelJS.Workbook, rules: NormalizedRule[]): void {
  const worksheet = workbook.addWorksheet('Rules');
  
  const headers = ['ID', 'Concept', 'Description', 'Confidence', 'Source', 'Source Type', 'Parameters'];
  
  // Add header row
  const headerRow = worksheet.getRow(1);
  headers.forEach((header, idx) => {
    headerRow.getCell(idx + 1).value = header;
    headerRow.getCell(idx + 1).font = { bold: true };
  });

  // Add data rows
  rules.forEach((r, rowIdx) => {
    const row = worksheet.getRow(rowIdx + 2);
    row.getCell(1).value = r.id;
    row.getCell(2).value = r.concept;
    row.getCell(3).value = r.description;
    row.getCell(4).value = r.confidence;
    row.getCell(5).value = r.sourceRef?.vendorRuleId ?? '';
    row.getCell(6).value = r.sourceRef?.vendorRuleType ?? '';
    row.getCell(7).value = JSON.stringify(r.parameters ?? {}, null, 0);
  });

  // Set column widths
  worksheet.getColumn(1).width = 25;
  worksheet.getColumn(2).width = 15;
  worksheet.getColumn(3).width = 60;
  worksheet.getColumn(4).width = 12;
  worksheet.getColumn(5).width = 30;
  worksheet.getColumn(6).width = 20;
  worksheet.getColumn(7).width = 50;
}

function addDataWorksheetsSheet(workbook: ExcelJS.Workbook, config: CaptivateIQBuildConfig): void {
  const worksheet = workbook.addWorksheet('Data Worksheets');
  
  const summaryHeaders = ['Worksheet Name', 'Concept', 'Description', 'Column Count', 'Sample Row Count'];
  
  // Header
  const headerRow = worksheet.getRow(1);
  summaryHeaders.forEach((header, idx) => {
    headerRow.getCell(idx + 1).value = header;
    headerRow.getCell(idx + 1).font = { bold: true };
  });

  // Summary rows
  config.dataWorksheets.forEach((dw, rowIdx) => {
    const row = worksheet.getRow(rowIdx + 2);
    row.getCell(1).value = dw.name;
    row.getCell(2).value = dw.concept;
    row.getCell(3).value = dw.description;
    row.getCell(4).value = dw.columns.length;
    row.getCell(5).value = dw.sampleRows.length;
  });

  worksheet.getColumn(1).width = 25;
  worksheet.getColumn(2).width = 15;
  worksheet.getColumn(3).width = 40;
  worksheet.getColumn(4).width = 15;
  worksheet.getColumn(5).width = 18;

  // Add individual data tables as separate sheets
  for (const dw of config.dataWorksheets) {
    const sheetName = sanitizeSheetName(`DW-${dw.name}`);
    const dataWs = workbook.addWorksheet(sheetName);
    
    const colHeaders = dw.columns.map((c) => c.name);
    const colTypes = dw.columns.map((c) => `(${c.type})`);
    
    // Headers
    const headerRow = dataWs.getRow(1);
    colHeaders.forEach((header, idx) => {
      headerRow.getCell(idx + 1).value = header;
      headerRow.getCell(idx + 1).font = { bold: true };
    });
    
    // Type row
    const typeRow = dataWs.getRow(2);
    colTypes.forEach((type, idx) => {
      typeRow.getCell(idx + 1).value = type;
      typeRow.getCell(idx + 1).font = { italic: true, color: { argb: 'FF808080' } };
    });
    
    // Data rows
    dw.sampleRows.forEach((sampleRow, rowIdx) => {
      const row = dataWs.getRow(rowIdx + 3);
      dw.columns.forEach((col, colIdx) => {
        const val = sampleRow[col.name];
        row.getCell(colIdx + 1).value = val !== undefined && val !== null ? val : '';
      });
    });

    // Column widths
    colHeaders.forEach((_, idx) => {
      dataWs.getColumn(idx + 1).width = 18;
    });
  }
}

function addEmployeeAssumptionsSheet(workbook: ExcelJS.Workbook, config: CaptivateIQBuildConfig): void {
  const worksheet = workbook.addWorksheet('Employee Assumptions');
  
  const headers = ['Column Name', 'Type', 'Concept', 'Description', 'Example Value'];
  
  const headerRow = worksheet.getRow(1);
  headers.forEach((header, idx) => {
    headerRow.getCell(idx + 1).value = header;
    headerRow.getCell(idx + 1).font = { bold: true };
  });

  config.employeeAssumptionColumns.forEach((ea, rowIdx) => {
    const row = worksheet.getRow(rowIdx + 2);
    row.getCell(1).value = ea.name;
    row.getCell(2).value = ea.type;
    row.getCell(3).value = ea.concept;
    row.getCell(4).value = ea.description;
    row.getCell(5).value = ea.exampleValue ?? '';
  });

  worksheet.getColumn(1).width = 25;
  worksheet.getColumn(2).width = 12;
  worksheet.getColumn(3).width = 18;
  worksheet.getColumn(4).width = 50;
  worksheet.getColumn(5).width = 18;
}

function addAttributeWorksheetsSheet(workbook: ExcelJS.Workbook, config: CaptivateIQBuildConfig): void {
  const worksheet = workbook.addWorksheet('Attribute Worksheets');
  
  const headers = ['Worksheet Name', 'Concept', 'PK Type', 'Description', 'Columns'];
  
  const headerRow = worksheet.getRow(1);
  headers.forEach((header, idx) => {
    headerRow.getCell(idx + 1).value = header;
    headerRow.getCell(idx + 1).font = { bold: true };
  });

  config.attributeWorksheets.forEach((aw, rowIdx) => {
    const row = worksheet.getRow(rowIdx + 2);
    row.getCell(1).value = aw.name;
    row.getCell(2).value = aw.concept;
    row.getCell(3).value = aw.pkType;
    row.getCell(4).value = aw.description;
    row.getCell(5).value = aw.columns.map((c) => `${c.name} (${c.type})`).join(', ');
  });

  worksheet.getColumn(1).width = 25;
  worksheet.getColumn(2).width = 18;
  worksheet.getColumn(3).width = 12;
  worksheet.getColumn(4).width = 40;
  worksheet.getColumn(5).width = 50;
}

function addFormulaSheet(workbook: ExcelJS.Workbook, config: CaptivateIQBuildConfig): void {
  const worksheet = workbook.addWorksheet('Formula Logic');
  
  const headers = ['Concept', 'Description', 'Logic Explanation', 'Pseudo Formula', 'CaptivateIQ Notes'];
  
  const headerRow = worksheet.getRow(1);
  headers.forEach((header, idx) => {
    headerRow.getCell(idx + 1).value = header;
    headerRow.getCell(idx + 1).font = { bold: true };
  });

  config.formulaRecommendations.forEach((f, rowIdx) => {
    const row = worksheet.getRow(rowIdx + 2);
    row.getCell(1).value = f.concept;
    row.getCell(2).value = f.description;
    row.getCell(3).value = f.logicExplanation;
    row.getCell(4).value = f.pseudoFormula;
    row.getCell(5).value = f.captivateiqNotes;
  });

  worksheet.getColumn(1).width = 18;
  worksheet.getColumn(2).width = 30;
  worksheet.getColumn(3).width = 40;
  worksheet.getColumn(4).width = 50;
  worksheet.getColumn(5).width = 50;
}

function addBuildGuideSheet(
  workbook: ExcelJS.Workbook,
  extraction: ExtractionResult,
  config: CaptivateIQBuildConfig,
): void {
  const worksheet = workbook.addWorksheet('CIQ Build Guide');
  
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

  rows.forEach((row, idx) => {
    const excelRow = worksheet.getRow(idx + 1);
    row.forEach((value, colIdx) => {
      excelRow.getCell(colIdx + 1).value = value;
    });
  });

  worksheet.getColumn(1).width = 35;
  worksheet.getColumn(2).width = 70;
}

function addInsightsSheet(workbook: ExcelJS.Workbook, insights: string): void {
  const worksheet = workbook.addWorksheet('Insights');
  
  // Split insights into rows for readability
  const lines = insights.split('\n');
  
  const rows: (string | null)[][] = [
    ['AI Analysis & Insights'],
    [],
    ...lines.map((line) => [line] as [string]),
  ];

  rows.forEach((row, idx) => {
    const excelRow = worksheet.getRow(idx + 1);
    if (row[0] !== null) {
      excelRow.getCell(1).value = row[0];
    }
  });

  worksheet.getColumn(1).width = 120;
}

// ── Helpers ──────────────────────────────────────────────────

function sanitizeSheetName(name: string): string {
  // Excel sheet names: max 31 chars, no special chars
  return name
    .replace(/[\\/*?[\]:]/g, '-')
    .slice(0, 31);
}
