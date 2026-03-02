/**
 * Excel Parser — XLSX → ParsedWorkbook
 *
 * Extracts:
 *   - Sheet data (values and formulas)
 *   - Named ranges
 *   - Structural summary (for AI prompt)
 *
 * Uses SheetJS (xlsx) for parsing.
 */

import * as XLSX from 'xlsx';
import type { ParsedSheet, ParsedWorkbook } from '../project/types.js';

// Max rows/cols to include in the data array (keep AI prompt manageable)
const MAX_ROWS = 200;
const MAX_COLS = 50;

/**
 * Parse an Excel file buffer into a structured ParsedWorkbook.
 */
export function parseExcelBuffer(buffer: Buffer, filename: string): ParsedWorkbook {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellFormula: true,
    cellDates: true,
    dense: false,
  });

  const namedRanges = extractNamedRanges(workbook);
  const sheets = workbook.SheetNames.map((name) =>
    parseSheet(name, workbook.Sheets[name], namedRanges)
  );

  const parsedWorkbook: ParsedWorkbook = {
    filename,
    sheetNames: workbook.SheetNames,
    sheets,
    namedRanges,
    summary: buildSummary(filename, sheets, namedRanges),
  };

  return parsedWorkbook;
}

// ── Sheet Parser ──────────────────────────────────────────────

function parseSheet(
  name: string,
  sheet: XLSX.WorkSheet,
  globalNamedRanges: Array<{ name: string; ref: string }>
): ParsedSheet {
  if (!sheet || !sheet['!ref']) {
    return { name, rowCount: 0, colCount: 0, data: [], formulas: [], namedRanges: [] };
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const rowCount = Math.min(range.e.r - range.s.r + 1, MAX_ROWS);
  const colCount = Math.min(range.e.c - range.s.c + 1, MAX_COLS);

  // Build 2D data array
  const data: (string | number | boolean | null)[][] = [];
  const formulas: Array<{ address: string; formula: string }> = [];

  for (let r = range.s.r; r < range.s.r + rowCount; r++) {
    const row: (string | number | boolean | null)[] = [];
    for (let c = range.s.c; c < range.s.c + colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr] as XLSX.CellObject | undefined;

      if (!cell) {
        row.push(null);
        continue;
      }

      // Collect formula
      if (cell.f) {
        formulas.push({ address: addr, formula: cell.f });
      }

      // Get display value
      if (cell.t === 'd' && cell.v instanceof Date) {
        row.push(cell.v.toISOString().split('T')[0]);
      } else if (cell.t === 'n') {
        row.push(typeof cell.v === 'number' ? cell.v : null);
      } else if (cell.t === 'b') {
        row.push(typeof cell.v === 'boolean' ? cell.v : null);
      } else if (cell.t === 's' || (cell.t as string) === 'str') {
        row.push(cell.v != null ? String(cell.v) : null);
      } else {
        row.push(cell.v != null ? String(cell.v) : null);
      }
    }
    data.push(row);
  }

  // Named ranges that reference this sheet
  const sheetNamedRanges = globalNamedRanges.filter((nr) =>
    nr.ref.startsWith(`'${name}'!`) || nr.ref.startsWith(`${name}!`)
  );

  return { name, rowCount, colCount, data, formulas, namedRanges: sheetNamedRanges };
}

// ── Named Ranges ──────────────────────────────────────────────

function extractNamedRanges(
  workbook: XLSX.WorkBook
): Array<{ name: string; ref: string }> {
  const result: Array<{ name: string; ref: string }> = [];
  if (!workbook.Workbook?.Names) return result;
  for (const namedRange of workbook.Workbook.Names) {
    if (namedRange.Name && namedRange.Ref) {
      result.push({ name: namedRange.Name, ref: namedRange.Ref });
    }
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
