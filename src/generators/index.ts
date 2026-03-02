/**
 * CaptivateIQ Payload Generator — orchestrates all sub-generators
 *
 * Input:  CaptivateIQBuildConfig (produced by AI extractor)
 * Output: CaptivateIQApiPayloads (structured, API-ready JSON)
 *
 * Usage:
 *   import { generatePayloads } from './generators/index.js';
 *   const payloads = generatePayloads(extraction.captivateiqConfig);
 */

import type { CaptivateIQBuildConfig, FormulaRecommendation } from '../project/types.js';
import type { CaptivateIQApiPayloads, FormulaReferenceDoc, FormulaEntry } from './types.js';
import { generatePlanPayload, generatePeriodGroupPayload } from './plan.js';
import { generateDataWorksheetBundles } from './data-worksheets.js';
import { generateEmployeeAssumptionsPayload } from './employee-assumptions.js';
import { generateAttributeWorksheetPayloads } from './attribute-worksheets.js';

function buildFormulaReference(formulas: FormulaRecommendation[]): FormulaReferenceDoc {
  const entries: FormulaEntry[] = formulas.map((f) => ({
    concept: f.concept,
    description: f.description,
    logic_explanation: f.logicExplanation,
    pseudo_formula: f.pseudoFormula,
    captivateiq_notes: f.captivateiqNotes,
  }));

  return {
    _note:
      'CaptivateIQ SmartGrid formulas are defined in the UI and are NOT accessible via the REST API. ' +
      'Use the pseudo-formulas and CaptivateIQ notes below as a reference when manually building ' +
      'the calculation logic in the plan builder.',
    formulas: entries,
  };
}

/**
 * Transform a CaptivateIQBuildConfig into a complete set of API-ready payloads.
 */
export function generatePayloads(config: CaptivateIQBuildConfig): CaptivateIQApiPayloads {
  const plan = generatePlanPayload(config.planStructure);
  const periodGroup = generatePeriodGroupPayload(config.planStructure);
  const dataWorksheets = generateDataWorksheetBundles(config.dataWorksheets);
  const employeeAssumptions = generateEmployeeAssumptionsPayload(config.employeeAssumptionColumns);
  const attributeWorksheets = generateAttributeWorksheetPayloads(config.attributeWorksheets);
  const formulaReference = buildFormulaReference(config.formulaRecommendations);

  return {
    plan,
    periodGroup,
    dataWorksheets,
    employeeAssumptions,
    attributeWorksheets,
    formulaReference,
    summary: {
      planName: plan.name,
      periodType: plan.period_type,
      dataWorksheetCount: dataWorksheets.length,
      employeeAssumptionCount: employeeAssumptions.columns.length,
      attributeWorksheetCount: attributeWorksheets.length,
      formulaCount: formulaReference.formulas.length,
      generatedAt: new Date().toISOString(),
    },
  };
}

export type { CaptivateIQApiPayloads } from './types.js';
