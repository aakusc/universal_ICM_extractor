/**
 * Tests for src/excel/parser.ts
 *
 * Uses exceljs to build real XLSX buffers in memory for testing — no disk I/O required.
 */

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseExcelBuffer, workbookToPromptString } from '../../src/excel/parser.js';
import type { ParsedWorkbook } from '../../src/project/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal XLSX buffer from an array-of-arrays for a single sheet. */
function makeXlsxBuffer(data: (string | number | boolean | null)[][], sheetName = 'Sheet1'): Buffer {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  
  data.forEach(row => {
    worksheet.addRow(row);
  });
  
  return workbook.xlsx.writeBuffer() as Promise<Buffer>;
}

// ── parseExcelBuffer ──────────────────────────────────────────────────────────

describe('parseExcelBuffer', () => {
  it('parses a simple single-sheet workbook', async () => {
    const data = [
      ['Name', 'Amount', 'Rate'],
      ['Alice', 50000, 0.05],
      ['Bob', 75000, 0.08],
    ];
    const buf = makeXlsxBuffer(data, 'Sales');
    const wb = await parseExcelBuffer(buf, 'test.xlsx');

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

  it('parses multiple sheets', async () => {
    const workbook = new ExcelJS.Workbook();
    
    const ws1 = workbook.addWorksheet('Rates');
    ws1.addRows([['A', 'B'], [1, 2]]);
    
    const ws2 = workbook.addWorksheet('Quotas');
    ws2.addRows([['X', 'Y'], [3, 4]]);
    
    const buf = await workbook.xlsx.writeBuffer() as Buffer;
    const wb = await parseExcelBuffer(buf, 'multi.xlsx');

    expect(wb.sheetNames).toEqual(['Rates', 'Quotas']);
    expect(wb.sheets).toHaveLength(2);
    expect(wb.sheets[0].name).toBe('Rates');
    expect(wb.sheets[1].name).toBe('Quotas');
  });

  it('returns rowCount 0 for an empty / ref-less sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    // Add an empty worksheet (no rows added = no !ref)
    workbook.addWorksheet('Empty');
    const buf = await workbook.xlsx.writeBuffer() as Buffer;

    const wb = await parseExcelBuffer(buf, 'empty.xlsx');
    const sheet = wb.sheets[0];
    expect(sheet.rowCount).toBe(0);
    expect(sheet.colCount).toBe(0);
    expect(sheet.data).toEqual([]);
    expect(sheet.formulas).toEqual([]);
  });

  it('caps rows at MAX_ROWS (200)', async () => {
    // Build 250 rows
    const rows: (string | number)[][] = [['Header']];
    for (let i = 1; i <= 249; i++) rows.push([i]);
    const buf = makeXlsxBuffer(rows, 'Big');
    const wb = await parseExcelBuffer(buf, 'big.xlsx');

    expect(wb.sheets[0].rowCount).toBe(200);
    expect(wb.sheets[0].data).toHaveLength(200);
  });

  it('caps columns at MAX_COLS (50)', async () => {
    // Build 1 row with 60 columns
    const row = Array.from({ length: 60 }, (_, i) => `Col${i}`);
    const buf = makeXlsxBuffer([row], 'Wide');
    const wb = await parseExcelBuffer(buf, 'wide.xlsx');

    expect(wb.sheets[0].colCount).toBe(50);
    expect(wb.sheets[0].data[0]).toHaveLength(50);
  });

  it('extracts formula cells', async () => {
    // Note: ExcelJS formula roundtrip requires specific setup
    // This test verifies the parser can handle workbooks with formulas
    // Skip for now - formula extraction works in production but test buffer format differs
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Formulas');
    
    worksheet.getCell('A1').value = 10;
    worksheet.getCell('A2').value = 20;
    // ExcelJS formulas need result value set alongside formula
    worksheet.getCell('A3').value = { formula: 'SUM(A1:A2)', result: 30 };
    worksheet.getCell('B1').value = 'Label';
    worksheet.getCell('B3').value = { formula: 'A3*2', result: 60 };
    
    const buf = await workbook.xlsx.writeBuffer() as Buffer;

    const wb = await parseExcelBuffer(buf, 'formulas.xlsx');
    const sheet = wb.sheets[0];

    // Should have extracted 2 formula cells
    expect(sheet.formulas.length).toBeGreaterThanOrEqual(2);
    const addresses = sheet.formulas.map((f) => f.address);
    expect(addresses).toContain('A3');
    expect(addresses).toContain('B3');
  });

  it('generates a non-empty summary string', async () => {
    const buf = makeXlsxBuffer([['Quota', 'Rate'], [50000, 0.05]], 'Plan');
    const wb = await parseExcelBuffer(buf, 'plan.xlsx');

    expect(wb.summary).toContain('plan.xlsx');
    expect(wb.summary).toContain('Plan');
    expect(wb.summary).toMatch(/\d+R × \d+C/);
  });

  it('includes header row in summary', async () => {
    const buf = makeXlsxBuffer([['Commission Rate', 'Tier', 'Min'], [1, 'Bronze', 0]], 'Rates');
    const wb = await parseExcelBuffer(buf, 'rates.xlsx');

    expect(wb.summary).toContain('Commission Rate');
    expect(wb.summary).toContain('Tier');
  });

  it('handles boolean cell values', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Booleans');
    
    worksheet.getCell('A1').value = true;
    worksheet.getCell('A2').value = false;
    
    const buf = await workbook.xlsx.writeBuffer() as Buffer;

    const wb = await parseExcelBuffer(buf, 'bool.xlsx');
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
