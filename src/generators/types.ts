/**
 * Generator Output Types — CaptivateIQBuildConfig → API-ready payloads
 *
 * These types represent the structured JSON payloads ready to be POSTed
 * to the CaptivateIQ REST API to build out the compensation plan.
 */

// ── Plan ──────────────────────────────────────────────────────

/** POST /ciq/v1/plans */
export interface PlanPayload {
  name: string;
  description?: string;
  /** CaptivateIQ expects 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' */
  period_type: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  status: 'draft';
}

/** POST /ciq/v1/period_groups */
export interface PeriodGroupPayload {
  name: string;
  period_type: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  /** ISO date strings for the initial period window */
  start_date: string;
  end_date: string;
}

// ── Data Worksheets ───────────────────────────────────────────

/** Column definition for data/attribute worksheets */
export interface WorksheetColumnDef {
  name: string;
  /** CaptivateIQ column type */
  type: 'text' | 'numeric' | 'percent' | 'date' | 'currency';
}

/** POST /ciq/v1/workbooks/:workbookId/worksheets */
export interface WorksheetPayload {
  name: string;
  description?: string;
  columns: WorksheetColumnDef[];
}

/** POST /ciq/v1/workbooks/:workbookId/worksheets/:worksheetId/records */
export interface WorksheetRecordsPayload {
  records: Record<string, string | number | null>[];
}

/** Grouped bundle: one workbook → one worksheet → its records */
export interface DataWorksheetBundle {
  /** Label for this bundle in the UI */
  label: string;
  concept: string;
  description: string;
  /** Suggested workbook name (create/reuse as needed) */
  workbook: string;
  /** POST /ciq/v1/workbooks/:id/worksheets */
  worksheet: WorksheetPayload;
  /** POST /ciq/v1/workbooks/:id/worksheets/:id/records */
  records: WorksheetRecordsPayload;
}

// ── Employee Assumptions ──────────────────────────────────────

export interface AssumptionColumnDef {
  name: string;
  type: 'currency' | 'percent' | 'text' | 'numeric';
  description?: string;
  concept?: string;
  /** Example/default value shown to plan admins */
  default_value?: string | number;
}

/** PATCH /ciq/v1/plans/:planId/employee_assumptions/schema */
export interface EmployeeAssumptionsPayload {
  /** Human-readable note for the implementer */
  _note: string;
  columns: AssumptionColumnDef[];
}

// ── Attribute Worksheets ──────────────────────────────────────

/** POST /ciq/v1/attribute_worksheets */
export interface AttributeWorksheetPayload {
  name: string;
  description?: string;
  concept: string;
  /** Primary key type for rows */
  pk_type: 'employee' | 'opportunity' | 'account';
  columns: WorksheetColumnDef[];
}

// ── Formula Reference ─────────────────────────────────────────

export interface FormulaEntry {
  concept: string;
  description: string;
  logic_explanation: string;
  pseudo_formula: string;
  captivateiq_notes: string;
}

/** Not directly API-able — exported as implementation documentation */
export interface FormulaReferenceDoc {
  _note: string;
  formulas: FormulaEntry[];
}

// ── Top-level Output ──────────────────────────────────────────

export interface GenerationSummary {
  planName: string;
  periodType: string;
  dataWorksheetCount: number;
  employeeAssumptionCount: number;
  attributeWorksheetCount: number;
  formulaCount: number;
  generatedAt: string;
}

/** Complete set of API payloads generated from a CaptivateIQBuildConfig */
export interface CaptivateIQApiPayloads {
  /** POST /ciq/v1/plans */
  plan: PlanPayload;
  /** POST /ciq/v1/period_groups */
  periodGroup: PeriodGroupPayload;
  /** Each bundle = one worksheet with its records */
  dataWorksheets: DataWorksheetBundle[];
  /** PATCH /ciq/v1/plans/:id/employee_assumptions/schema */
  employeeAssumptions: EmployeeAssumptionsPayload;
  /** POST /ciq/v1/attribute_worksheets (one per entry) */
  attributeWorksheets: AttributeWorksheetPayload[];
  /** Not directly API-able — SmartGrid formulas are UI-only */
  formulaReference: FormulaReferenceDoc;
  /** High-level summary */
  summary: GenerationSummary;
}
