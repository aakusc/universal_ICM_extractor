/**
 * Excel Parser — XLSX → ParsedWorkbook
 *
 * Extracts:
 *   - Sheet data (values and formulas)
 *   - Named ranges
 *   - Structural summary (for AI prompt)
 *
 * Uses exceljs for parsing (async).
 */

import ExcelJS from 'exceljs';
import type { ParsedSheet, ParsedWorkbook } from '../project/types.js';

// Max rows/cols to include in the data array (keep AI prompt manageable)
const MAX_ROWS = 200;
const MAX_COLS = 50;

/**
 * Parse an Excel file buffer into a structured ParsedWorkbook.
 * Async function - use await or .then() to get result.
 */
export async function parseExcelBuffer(buffer: ArrayBuffer | Buffer, filename: string): Promise<ParsedWorkbook> {
  // Convert Buffer to ArrayBuffer if needed - use type assertion for older TS configs
  const arrayBuffer = Buffer.isBuffer(buffer) 
    ? (buffer as unknown as { buffer: ArrayBuffer }).buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    : buffer;
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const sheetNames = workbook.worksheets.map(ws => ws.name);
  
  const sheets: ParsedSheet[] = [];
  for (const sheetName of sheetNames) {
    const ws = workbook.getWorksheet(sheetName);
    if (ws) {
      sheets.push(parseWorksheet(ws));
    }
  }

  // Named ranges (exceljs approach)
  const namedRanges = extractNamedRanges(workbook);

  const parsedWorkbook: ParsedWorkbook = {
    filename,
    sheetNames,
    sheets,
    namedRanges,
    summary: buildSummary(filename, sheets, namedRanges),
  };

  return parsedWorkbook;
}

// ── Sheet Parser ──────────────────────────────────────────────

function parseWorksheet(worksheet: ExcelJS.Worksheet): ParsedSheet {
  const name = worksheet.name;
  
  // Get dimensions
  const rowCount = worksheet.rowCount;
  const colCount = worksheet.columnCount;
  
  if (rowCount === 0 || colCount === 0) {
    return { name, rowCount: 0, colCount: 0, data: [], formulas: [], namedRanges: [] };
  }

  // Build 2D data array
  const data: (string | number | boolean | null)[][] = [];
  const formulas: Array<{ address: string; formula: string }> = [];

  const actualRowCount = Math.min(rowCount, MAX_ROWS);
  const actualColCount = Math.min(colCount, MAX_COLS);

  for (let r = 1; r <= actualRowCount; r++) {
    const row: (string | number | boolean | null)[] = [];
    for (let c = 1; c <= actualColCount; c++) {
      const cell = worksheet.getCell(r, c);
      
      // Collect formula
      if (cell.formula) {
        const addr = cell.address;
        formulas.push({ address: addr, formula: cell.formula });
      }

      // Get value based on type
      const value = cell.value;
      if (value === null || value === undefined) {
        row.push(null);
      } else if (typeof value === 'number') {
        row.push(value);
      } else if (typeof value === 'boolean') {
        row.push(value);
      } else if (value instanceof Date) {
        row.push(value.toISOString().split('T')[0]);
      } else if (typeof value === 'string') {
        row.push(value);
      } else if (typeof value === 'object' && 'text' in value) {
        // Hyperlink or formula result object
        row.push(String((value as any).text));
      } else {
        row.push(String(value));
      }
    }
    data.push(row);
  }

  return { 
    name, 
    rowCount: actualRowCount, 
    colCount: actualColCount, 
    data, 
    formulas, 
    namedRanges: [] 
  };
}

// ── Named Ranges ──────────────────────────────────────────────

function extractNamedRanges(
  workbook: ExcelJS.Workbook
): Array<{ name: string; ref: string }> {
  const result: Array<{ name: string; ref: string }> = [];
  
  // ExcelJS named ranges are accessed via workbook.model.definedNames
  // The structure varies, so we use a safe approach
  try {
    if (workbook.model) {
      const model = workbook.model as any;
      if (model.definedNames && typeof model.definedNames === 'object') {
        for (const name in model.definedNames) {
          const def = model.definedNames[name];
          if (def && Array.isArray(def) && def.length > 0) {
            result.push({ name, ref: String(def[0]) });
          } else if (typeof def === 'string') {
            result.push({ name, ref: def });
          }
        }
      }
    }
  } catch (e) {
    // Ignore errors accessing named ranges
  }
  
  return result;
}

// ── Structural Summary ─────────────────────────────────────────

/**
 * Build a concise structural summary used in the AI prompt.
 * Gives Claude a high-level map of the workbook without flooding tokens.
 */
function buildSummary(
  filename: string,
  sheets: ParsedSheet[],
  namedRanges: Array<{ name: string; ref: string }>
): string {
  const lines: string[] = [
    `File: ${filename}`,
    `Sheets (${sheets.length}): ${sheets.map((s) => `"${s.name}" (${s.rowCount}R × ${s.colCount}C)`).join(', ')}`,
  ];

  if (namedRanges.length > 0) {
    lines.push(
      `Named ranges (${namedRanges.length}): ${namedRanges.map((nr) => `${nr.name}=${nr.ref}`).join(', ')}`
    );
  }

  // Per-sheet: column headers + formula count
  for (const sheet of sheets) {
    if (sheet.rowCount === 0) continue;

    // First non-empty row as headers
    const headerRow = sheet.data[0]?.filter((v) => v !== null && v !== '') ?? [];
    if (headerRow.length > 0) {
      lines.push(
        `  Sheet "${sheet.name}" headers: [${headerRow.slice(0, 20).join(' | ')}]`
      );
    }

    if (sheet.formulas.length > 0) {
      const sampleFormulas = sheet.formulas.slice(0, 5).map((f) => `${f.address}=${f.formula}`);
      lines.push(
        `  Sheet "${sheet.name}" formulas (${sheet.formulas.length} total, sample): ${sampleFormulas.join('; ')}`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Convert a ParsedWorkbook to a compact string for inclusion in an AI prompt.
 * Limits each sheet to the first 50 data rows to control token usage.
 */
export function workbookToPromptString(workbook: ParsedWorkbook): string {
  const parts: string[] = [`## Workbook: ${workbook.filename}`, '', workbook.summary, ''];

  for (const sheet of workbook.sheets) {
    if (sheet.rowCount === 0) continue;
    parts.push(`### Sheet: "${sheet.name}" (${sheet.rowCount} rows × ${sheet.colCount} cols)`);

    // Data (first 50 rows)
    const displayRows = sheet.data.slice(0, 50);
    parts.push('```');
    for (const row of displayRows) {
      parts.push(row.map((v) => (v === null ? '' : String(v))).join('\t'));
    }
    parts.push('```');

    // Formulas (first 20)
    if (sheet.formulas.length > 0) {
      parts.push(`**Formulas (${sheet.formulas.length} total):**`);
      for (const f of sheet.formulas.slice(0, 20)) {
        parts.push(`  ${f.address}: =${f.formula}`);
      }
    }
    parts.push('');
  }

  if (workbook.namedRanges.length > 0) {
    parts.push('### Named Ranges');
    for (const nr of workbook.namedRanges) {
      parts.push(`  ${nr.name} → ${nr.ref}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}
