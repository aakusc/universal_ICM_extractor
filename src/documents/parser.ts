/**
 * Document Parser — Multi-format document ingestion
 *
 * Supports:
 *   - PDF (.pdf) → text extraction via pdf-parse
 *   - Word (.docx) → text extraction via mammoth
 *   - Text (.txt, .md, .csv) → direct read
 *   - CSV (.csv) → parsed as tabular data via exceljs
 *
 * Each document is converted to a ParsedDocument with extracted text content
 * that gets fed into the AI extractor alongside Excel workbooks.
 */

import path from 'node:path';
import ExcelJS from 'exceljs';

export interface ParsedDocument {
  filename: string;
  fileType: 'pdf' | 'docx' | 'txt' | 'csv' | 'md' | 'unknown';
  /** Extracted plain text content */
  textContent: string;
  /** Page count (for PDFs) or line count */
  pageOrLineCount: number;
  /** For CSV: parsed tabular data */
  tables?: Array<{
    headers: string[];
    rows: (string | number | null)[][];
  }>;
  /** Brief structural summary for AI prompt */
  summary: string;
}

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.text', '.log', '.notes']);
const EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls', '.xlsm', '.xlsb']);

/**
 * Determine file type from extension.
 */
export function getFileType(filename: string): 'excel' | 'pdf' | 'docx' | 'csv' | 'txt' | 'unknown' {
  const ext = path.extname(filename).toLowerCase();
  if (EXCEL_EXTENSIONS.has(ext)) return 'excel';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx' || ext === '.doc') return 'docx';
  if (ext === '.csv') return 'csv';
  if (TEXT_EXTENSIONS.has(ext)) return 'txt';
  return 'unknown';
}

/**
 * Check if a file is an Excel workbook (should use excel/parser.ts).
 */
export function isExcelFile(filename: string): boolean {
  return getFileType(filename) === 'excel';
}

/**
 * Parse a non-Excel document buffer into a ParsedDocument.
 */
export async function parseDocumentBuffer(
  buffer: Buffer,
  filename: string,
): Promise<ParsedDocument> {
  const fileType = getFileType(filename);

  switch (fileType) {
    case 'pdf':
      return parsePdf(buffer, filename);
    case 'docx':
      return parseDocx(buffer, filename);
    case 'csv':
      return parseCsv(buffer, filename);
    case 'txt':
    case 'unknown':
      return parsePlainText(buffer, filename, fileType === 'unknown' ? 'unknown' : 'txt');
    default:
      return parsePlainText(buffer, filename, 'unknown');
  }
}

// ── PDF Parser ──────────────────────────────────────────────

async function parsePdf(buffer: Buffer, filename: string): Promise<ParsedDocument> {
  // Dynamic import to avoid issues if pdf-parse isn't installed
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  const textResult = await parser.getText();
  await parser.destroy();

  const textContent = textResult.text.trim();
  const lineCount = textContent.split('\n').length;
  const pageCount = textResult.pages.length;

  return {
    filename,
    fileType: 'pdf',
    textContent,
    pageOrLineCount: pageCount,
    summary: buildDocSummary(filename, 'pdf', pageCount, lineCount, textContent),
  };
}

// ── Word (.docx) Parser ─────────────────────────────────────

async function parseDocx(buffer: Buffer, filename: string): Promise<ParsedDocument> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });

  const textContent = result.value.trim();
  const lineCount = textContent.split('\n').length;

  return {
    filename,
    fileType: 'docx',
    textContent,
    pageOrLineCount: lineCount,
    summary: buildDocSummary(filename, 'docx', 1, lineCount, textContent),
  };
}

// ── CSV Parser ──────────────────────────────────────────────

async function parseCsv(buffer: Buffer, filename: string): Promise<ParsedDocument> {
  // Use ExcelJS to parse CSV into structured data
  const workbook = new ExcelJS.Workbook();
  // Convert Buffer to ArrayBuffer using slice
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  await workbook.xlsx.load(arrayBuffer);
  
  const worksheet = workbook.getWorksheet(1);
  if (!worksheet) {
    return {
      filename,
      fileType: 'csv',
      textContent: buffer.toString('utf-8'),
      pageOrLineCount: 0,
      summary: `CSV file "${filename}" — empty`,
    };
  }

  // Get headers from first row
  const headers: string[] = [];
  const firstRow = worksheet.getRow(1);
  firstRow.eachCell((cell) => {
    if (cell.value !== null && cell.value !== undefined) {
      headers.push(String(cell.value));
    }
  });

  // Get data rows
  const rows: (string | number | null)[][] = [];
  worksheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // Skip header row
    const rowData: (string | number | null)[] = [];
    row.eachCell((cell) => {
      const val = cell.value;
      if (val === null || val === undefined) {
        rowData.push(null);
      } else if (typeof val === 'number') {
        rowData.push(val);
      } else if (typeof val === 'string') {
        rowData.push(val);
      } else {
        rowData.push(String(val));
      }
    });
    rows.push(rowData);
  });

  // Also produce text representation
  const textContent = buffer.toString('utf-8').trim();
  const lineCount = textContent.split('\n').length;

  return {
    filename,
    fileType: 'csv',
    textContent: textContent.slice(0, 50000), // Cap for AI prompt
    pageOrLineCount: lineCount,
    tables: [{ headers, rows: rows.slice(0, 200) }], // Cap rows for AI
    summary: buildDocSummary(filename, 'csv', 1, lineCount, textContent, headers),
  };
}

// ── Plain Text Parser ───────────────────────────────────────

function parsePlainText(
  buffer: Buffer,
  filename: string,
  fileType: 'txt' | 'md' | 'unknown',
): ParsedDocument {
  const textContent = buffer.toString('utf-8').trim();
  const lineCount = textContent.split('\n').length;

  return {
    filename,
    fileType: fileType === 'unknown' ? 'unknown' : fileType,
    textContent: textContent.slice(0, 50000), // Cap for AI prompt
    pageOrLineCount: lineCount,
    summary: buildDocSummary(filename, fileType, 1, lineCount, textContent),
  };
}

// ── Summary Builder ─────────────────────────────────────────

function buildDocSummary(
  filename: string,
  type: string,
  pages: number,
  lines: number,
  content: string,
  csvHeaders?: string[],
): string {
  const parts: string[] = [
    `Document: ${filename} (${type.toUpperCase()})`,
    `Size: ${content.length} chars, ${lines} lines${type === 'pdf' ? `, ${pages} pages` : ''}`,
  ];

  if (csvHeaders && csvHeaders.length > 0) {
    parts.push(`CSV columns: [${csvHeaders.join(' | ')}]`);
  }

  // First 200 chars as preview
  const preview = content.slice(0, 200).replace(/\n/g, ' ');
  parts.push(`Preview: "${preview}..."`);

  return parts.join('\n');
}

/**
 * Convert a ParsedDocument to a string for inclusion in an AI prompt.
 */
export function documentToPromptString(doc: ParsedDocument): string {
  const parts: string[] = [
    `## Document: ${doc.filename} (${doc.fileType.toUpperCase()})`,
    '',
    doc.summary,
    '',
  ];

  if (doc.tables && doc.tables.length > 0) {
    for (const table of doc.tables) {
      parts.push('### Tabular Data');
      parts.push('```');
      parts.push(table.headers.join('\t'));
      for (const row of table.rows.slice(0, 100)) {
        parts.push(row.map((v) => (v === null ? '' : String(v))).join('\t'));
      }
      parts.push('```');
      parts.push('');
    }
  }

  // Include text content (capped)
  const maxChars = 30000;
  const text = doc.textContent.length > maxChars
    ? doc.textContent.slice(0, maxChars) + '\n\n[... truncated ...]'
    : doc.textContent;

  parts.push('### Content');
  parts.push('```');
  parts.push(text);
  parts.push('```');
  parts.push('');

  return parts.join('\n');
}
