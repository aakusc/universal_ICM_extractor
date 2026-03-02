/**
 * ICM Builder — Project & Extraction Types
 *
 * Data model for the reversed platform:
 *   Excel calculator → AI analysis → CaptivateIQ rule configuration
 */

import type { NormalizedRule } from '../types/normalized-schema.js';

// ── Project ───────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Files ─────────────────────────────────────────────────────

export interface ProjectFile {
  id: string;
  projectId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  parsedAt?: string;
  parseError?: string;
}

// ── Context: Requirements & Notes ─────────────────────────────

export interface Requirement {
  id: string;
  projectId: string;
  text: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
}

export interface Note {
  id: string;
  projectId: string;
  text: string;
  createdAt: string;
}

// ── Excel Parsing ─────────────────────────────────────────────

export interface ParsedSheet {
  name: string;
  rowCount: number;
  colCount: number;
  /** 2D array: data[rowIndex][colIndex] = cell value */
  data: (string | number | boolean | null)[][];
  formulas: Array<{ address: string; formula: string }>;
  namedRanges: Array<{ name: string; ref: string }>;
}

export interface ParsedWorkbook {
  filename: string;
  sheetNames: string[];
  sheets: ParsedSheet[];
  namedRanges: Array<{ name: string; ref: string }>;
  /** Auto-generated structural summary for the AI prompt */
  summary: string;
}

// ── AI Extraction Result ──────────────────────────────────────

export interface ExtractionResult {
  id: string;
  projectId: string;
  fileId: string;
  extractedAt: string;
  workbook: ParsedWorkbook;
  rules: NormalizedRule[];
  insights: string;
  captivateiqConfig: CaptivateIQBuildConfig;
}

// ── CaptivateIQ Build Configuration ──────────────────────────

export interface CaptivateIQBuildConfig {
  planStructure: PlanStructureRecommendation;
  dataWorksheets: DataWorksheetConfig[];
  employeeAssumptionColumns: EmployeeAssumptionColumn[];
  attributeWorksheets: AttributeWorksheetConfig[];
  formulaRecommendations: FormulaRecommendation[];
}

export interface PlanStructureRecommendation {
  planName: string;
  periodType: 'monthly' | 'quarterly' | 'annual';
  payoutComponents: string[];
  notes: string;
}

export interface DataWorksheetConfig {
  name: string;
  description: string;
  concept: string;
  columns: Array<{ name: string; type: 'text' | 'number' | 'percent' | 'date' }>;
  sampleRows: Record<string, string | number>[];
  apiPayload: Record<string, unknown>;
}

export interface EmployeeAssumptionColumn {
  name: string;
  type: 'currency' | 'percent' | 'text' | 'number';
  description: string;
  concept: string;
  exampleValue?: string | number;
}

export interface AttributeWorksheetConfig {
  name: string;
  description: string;
  concept: string;
  pkType: 'employee' | 'opportunity' | 'account';
  columns: Array<{ name: string; type: 'text' | 'number' | 'date' }>;
  apiPayload: Record<string, unknown>;
}

export interface FormulaRecommendation {
  concept: string;
  description: string;
  logicExplanation: string;
  pseudoFormula: string;
  captivateiqNotes: string;
}

// ── Store Shape ───────────────────────────────────────────────

export interface StoreData {
  projects: Project[];
  files: ProjectFile[];
  requirements: Requirement[];
  notes: Note[];
  extractionMeta: Array<{
    id: string;
    projectId: string;
    fileId: string;
    extractedAt: string;
  }>;
}
