/**
 * Tests for src/excel/parser.ts
 *
 * Uses SheetJS to build real XLSX buffers in memory — no disk I/O required.
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelBuffer, workbookToPromptString } from '../../src/excel/parser.js';
import type { ParsedWorkbook } from '../../src/project/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal XLSX buffer from an array-of-arrays for a single sheet. */
function makeXlsxBuffer(data: (string | number | boolean | null)[][], sheetName = 'Sheet1'): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ── parseExcelBuffer ──────────────────────────────────────────────────────────

describe('parseExcelBuffer', () => {
  it('parses a simple single-sheet workbook', () => {
    const data = [
      ['Name', 'Amount', 'Rate'],
      ['Alice', 50000, 0.05],
      ['Bob', 75000, 0.08],
    ];
    const buf = makeXlsxBuffer(data, 'Sales');
    const wb = parseExcelBuffer(buf, 'test.xlsx');

    expect(wb.filename).toBe('test.xlsx');
    expect(wb.sheetNames).toEqual(['Sales']);
    expect(wb.sheets).toHaveLength(1);

    const sheet = wb.sheets[0];
    expect(sheet.name).toBe('Sales');
    expect(sheet.rowCount).toBe(3);
    expect(sheet.colCount).toBe(3);
    expect(sheet.data[0]).toEqual(['Name', 'Amount', 'Rate']);
    expect(sheet.data[1][0]).toBe('Alice');
    expect(sheet.data[1][1]).toBe(50000);
    expect(sheet.data[2][2]).toBe(0.08);
  });

  it('parses multiple sheets', () => {
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([['A', 'B'], [1, 2]]), 'Rates');
    XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([['X', 'Y'], [3, 4]]), 'Quotas');
    const buf = XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const wb = parseExcelBuffer(buf, 'multi.xlsx');

    expect(wb.sheetNames).toEqual(['Rates', 'Quotas']);
    expect(wb.sheets).toHaveLength(2);
    expect(wb.sheets[0].name).toBe('Rates');
    expect(wb.sheets[1].name).toBe('Quotas');
  });

  it('returns rowCount 0 for an empty / ref-less sheet', () => {
    const wb2 = XLSX.utils.book_new();
    // Add a completely empty sheet (no !ref)
    const emptyWs: XLSX.WorkSheet = {};
    XLSX.utils.book_append_sheet(wb2, emptyWs, 'Empty');
    const buf = XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const wb = parseExcelBuffer(buf, 'empty.xlsx');
    const sheet = wb.sheets[0];
    expect(sheet.rowCount).toBe(0);
    expect(sheet.colCount).toBe(0);
    expect(sheet.data).toEqual([]);
    expect(sheet.formulas).toEqual([]);
  });

  it('caps rows at MAX_ROWS (200)', () => {
    // Build 250 rows
    const rows: (string | number)[][] = [['Header']];
    for (let i = 1; i <= 249; i++) rows.push([i]);
    const buf = makeXlsxBuffer(rows, 'Big');
    const wb = parseExcelBuffer(buf, 'big.xlsx');

    expect(wb.sheets[0].rowCount).toBe(200);
    expect(wb.sheets[0].data).toHaveLength(200);
  });

  it('caps columns at MAX_COLS (50)', () => {
    // Build 1 row with 60 columns
    const row = Array.from({ length: 60 }, (_, i) => `Col${i}`);
    const buf = makeXlsxBuffer([row], 'Wide');
    const wb = parseExcelBuffer(buf, 'wide.xlsx');

    expect(wb.sheets[0].colCount).toBe(50);
    expect(wb.sheets[0].data[0]).toHaveLength(50);
  });

  it('extracts formula cells', () => {
    const wb2 = XLSX.utils.book_new();
    // Build sheet manually so we can add formula cells
    const ws: XLSX.WorkSheet = {
      'A1': { t: 'n', v: 10 },
      'A2': { t: 'n', v: 20 },
      'A3': { t: 'n', v: 30, f: 'SUM(A1:A2)' },
      'B1': { t: 's', v: 'Label' },
      'B3': { t: 'n', v: 200, f: 'A3*2' },
      '!ref': 'A1:B3',
    };
    XLSX.utils.book_append_sheet(wb2, ws, 'Formulas');
    const buf = XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const wb = parseExcelBuffer(buf, 'formulas.xlsx');
    const sheet = wb.sheets[0];

    // Should have extracted 2 formula cells
    expect(sheet.formulas.length).toBeGreaterThanOrEqual(2);
    const addresses = sheet.formulas.map((f) => f.address);
    expect(addresses).toContain('A3');
    expect(addresses).toContain('B3');
  });

  it('generates a non-empty summary string', () => {
    const buf = makeXlsxBuffer([['Quota', 'Rate'], [50000, 0.05]], 'Plan');
    const wb = parseExcelBuffer(buf, 'plan.xlsx');

    expect(wb.summary).toContain('plan.xlsx');
    expect(wb.summary).toContain('Plan');
    expect(wb.summary).toMatch(/\d+R × \d+C/);
  });

  it('includes header row in summary', () => {
    const buf = makeXlsxBuffer([['Commission Rate', 'Tier', 'Min'], [1, 'Bronze', 0]], 'Rates');
    const wb = parseExcelBuffer(buf, 'rates.xlsx');

    expect(wb.summary).toContain('Commission Rate');
    expect(wb.summary).toContain('Tier');
  });

  it('handles boolean cell values', () => {
    const wb2 = XLSX.utils.book_new();
    const ws: XLSX.WorkSheet = {
      'A1': { t: 'b', v: true },
      'A2': { t: 'b', v: false },
      '!ref': 'A1:A2',
    };
    XLSX.utils.book_append_sheet(wb2, ws, 'Booleans');
    const buf = XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const wb = parseExcelBuffer(buf, 'bool.xlsx');
    expect(wb.sheets[0].data[0][0]).toBe(true);
    expect(wb.sheets[0].data[1][0]).toBe(false);
  });
});

// ── workbookToPromptString ────────────────────────────────────────────────────

describe('workbookToPromptString', () => {
  const mockWorkbook: ParsedWorkbook = {
    filename: 'commission.xlsx',
    sheetNames: ['Rates', 'Summary'],
    sheets: [
      {
        name: 'Rates',
        rowCount: 3,
        colCount: 2,
        data: [
          ['Tier', 'Rate'],
          ['Bronze', 0.05],
          ['Gold', 0.1],
        ],
        formulas: [{ address: 'B3', formula: 'B2*2' }],
        namedRanges: [{ name: 'RateTable', ref: 'Rates!$A$1:$B$3' }],
      },
      {
        name: 'Summary',
        rowCount: 1,
        colCount: 1,
        data: [['Total']],
        formulas: [],
        namedRanges: [],
      },
    ],
    namedRanges: [
      { name: 'RateTable', ref: 'Rates!$A$1:$B$3' },
      { name: 'GlobalRange', ref: 'Summary!$A$1' },
    ],
    summary: 'File: commission.xlsx\nSheets (2): "Rates" (3R × 2C), "Summary" (1R × 1C)',
  };

  it('includes the filename in the output', () => {
    const result = workbookToPromptString(mockWorkbook);
    expect(result).toContain('commission.xlsx');
  });

  it('includes all sheet names and their data', () => {
    const result = workbookToPromptString(mockWorkbook);
    expect(result).toContain('Rates');
    expect(result).toContain('Summary');
    expect(result).toContain('Bronze');
    expect(result).toContain('0.05');
  });

  it('includes formula entries', () => {
    const result = workbookToPromptString(mockWorkbook);
    expect(result).toContain('B3');
    expect(result).toContain('B2*2');
  });

  it('includes named ranges section', () => {
    const result = workbookToPromptString(mockWorkbook);
    expect(result).toContain('Named Ranges');
    expect(result).toContain('RateTable');
    expect(result).toContain('GlobalRange');
  });

  it('wraps data in code fences', () => {
    const result = workbookToPromptString(mockWorkbook);
    // Data blocks are wrapped in backtick fences
    expect(result).toContain('```');
  });

  it('skips empty sheets', () => {
    const wbWithEmpty: ParsedWorkbook = {
      ...mockWorkbook,
      sheets: [
        { name: 'Empty', rowCount: 0, colCount: 0, data: [], formulas: [], namedRanges: [] },
        ...mockWorkbook.sheets,
      ],
    };
    const result = workbookToPromptString(wbWithEmpty);
    // Empty sheet should not add a section header
    const emptyCount = (result.match(/### Sheet: "Empty"/g) ?? []).length;
    expect(emptyCount).toBe(0);
  });

  it('limits data display to first 50 rows', () => {
    const bigSheet = {
      name: 'Big',
      rowCount: 100,
      colCount: 1,
      data: Array.from({ length: 100 }, (_, i) => [i]),
      formulas: [],
      namedRanges: [],
    };
    const wb: ParsedWorkbook = { ...mockWorkbook, sheets: [bigSheet], namedRanges: [] };
    const result = workbookToPromptString(wb);
    // Row 51 (value 50) should NOT appear but row 50 (value 49) should
    expect(result).toContain('49');
    expect(result).not.toContain('\n50\n');
  });
});
