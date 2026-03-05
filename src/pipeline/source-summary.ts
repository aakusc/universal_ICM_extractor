/**
 * Deterministic source data summary generator.
 * Extracts verifiable numeric data from workbooks for Pass 3 validation.
 * No AI — pure data extraction based on header keyword matching.
 */

import type { ParsedWorkbook, ParsedSheet } from '../project/types.js';

const COMP_KEYWORDS = [
  'rate', 'tier', 'quota', 'target', 'cap', 'floor', 'commission',
  'percentage', 'payout', 'amount', 'split', 'territory', 'threshold',
  'accelerator', 'multiplier', 'bonus', 'spif', 'draw', 'base',
  'attainment', 'min', 'max', 'level', 'revenue', 'kicker',
];

function isCompHeader(header: string): boolean {
  const lower = header.toLowerCase();
  return COMP_KEYWORDS.some(kw => lower.includes(kw));
}

function isNumericColumn(sheet: ParsedSheet, colIdx: number): boolean {
  let numericCount = 0;
  const checkRows = Math.min(sheet.rowCount, 20);
  for (let r = 1; r < checkRows; r++) {
    const val = sheet.data[r]?.[colIdx];
    if (typeof val === 'number') numericCount++;
  }
  return numericCount >= Math.max(1, (checkRows - 1) * 0.5);
}

interface SheetSummary {
  sheetName: string;
  headers: string[];
  compColumns: Array<{ index: number; header: string; values: (string | number | boolean | null)[] }>;
  rowCount: number;
}

function summarizeSheet(sheet: ParsedSheet): SheetSummary | null {
  if (sheet.rowCount < 2 || sheet.colCount < 1) return null;

  const headers = (sheet.data[0] ?? []).map(h => String(h ?? '').trim());
  const compColumns: SheetSummary['compColumns'] = [];

  for (let c = 0; c < headers.length; c++) {
    if (isCompHeader(headers[c]) || isNumericColumn(sheet, c)) {
      const values: (string | number | boolean | null)[] = [];
      const maxRows = Math.min(sheet.rowCount, 50);
      for (let r = 1; r < maxRows; r++) {
        const val = sheet.data[r]?.[c];
        if (val !== null && val !== undefined && val !== '') {
          values.push(val);
        }
      }
      if (values.length > 0) {
        compColumns.push({ index: c, header: headers[c], values });
      }
    }
  }

  if (compColumns.length === 0) return null;

  return {
    sheetName: sheet.name,
    headers,
    compColumns,
    rowCount: sheet.rowCount,
  };
}

/**
 * Generate a compact, human-readable summary of all verifiable numeric data
 * in a workbook. Used as ground-truth reference for Pass 3 validation.
 */
export function generateSourceDataSummary(workbook: ParsedWorkbook): string {
  const parts: string[] = [];
  parts.push(`### ${workbook.filename}`);

  let foundData = false;

  for (const sheet of workbook.sheets) {
    const summary = summarizeSheet(sheet);
    if (!summary) continue;
    foundData = true;

    parts.push(`\n**${summary.sheetName}** (${summary.rowCount} rows)`);

    // Build compact table representation
    const compHeaders = summary.compColumns.map(c => c.header);
    parts.push(`Columns: ${compHeaders.join(' | ')}`);

    // Show first 20 data rows as reference
    const maxRows = Math.min(summary.compColumns[0]?.values.length ?? 0, 20);
    if (maxRows > 0) {
      parts.push('Data:');
      for (let r = 0; r < maxRows; r++) {
        const row = summary.compColumns.map(c => {
          const v = c.values[r];
          if (typeof v === 'number') {
            // Format percentages and currency nicely
            if (v > 0 && v < 1 && c.header.toLowerCase().match(/rate|percent|commission|split/)) {
              return `${(v * 100).toFixed(1)}%`;
            }
            if (v >= 1000) return v.toLocaleString();
            return String(v);
          }
          return String(v ?? '');
        });
        parts.push(`  ${row.join(' | ')}`);
      }
      if ((summary.compColumns[0]?.values.length ?? 0) > maxRows) {
        parts.push(`  ... (${summary.compColumns[0].values.length - maxRows} more rows)`);
      }
    }
  }

  // Include formulas if present
  for (const sheet of workbook.sheets) {
    if (sheet.formulas.length > 0) {
      parts.push(`\n**${sheet.name} — Formulas** (${sheet.formulas.length} total)`);
      const shown = sheet.formulas.slice(0, 10);
      for (const f of shown) {
        parts.push(`  ${f.address}: ${f.formula}`);
      }
      if (sheet.formulas.length > 10) {
        parts.push(`  ... (${sheet.formulas.length - 10} more)`);
      }
    }
  }

  if (!foundData) {
    parts.push('  (no compensation-relevant numeric data detected)');
  }

  return parts.join('\n');
}

/**
 * Generate source data summaries for all workbooks in a project.
 */
export function generateAllSourceSummaries(
  files: Array<{ fileId: string; workbook: ParsedWorkbook }>,
  maxChars: number = 30000,
): string {
  const parts = ['# Source Data Reference (Ground Truth)\n'];
  let totalLen = parts[0].length;
  for (const f of files) {
    const summary = generateSourceDataSummary(f.workbook);
    if (totalLen + summary.length > maxChars) {
      parts.push(`### ${f.workbook.filename}\n  (truncated — source data omitted to stay within prompt limits)\n`);
      continue;
    }
    parts.push(summary);
    parts.push('');
    totalLen += summary.length;
  }
  return parts.join('\n');
}
