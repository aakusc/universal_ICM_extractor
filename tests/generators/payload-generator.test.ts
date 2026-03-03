/**
 * Tests for src/generators/index.ts - Payload Generator
 */

import { describe, it, expect } from 'vitest';
import type { CaptivateIQBuildConfig } from '../../src/project/types.js';
import { generatePayloads } from '../../src/generators/index.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<CaptivateIQBuildConfig> = {}): CaptivateIQBuildConfig {
  return {
    planStructure: {
      planName: 'Test Plan Q1 2026',
      periodType: 'monthly',
      payoutComponents: ['Base Salary', 'Commission', 'Bonus'],
      notes: 'Q1 compensation plan',
    },
    dataWorksheets: [
      {
        name: 'Sales Data',
        description: 'Monthly sales figures',
        concept: 'rate-table',
        columns: [
          { name: 'Tier', type: 'text' },
          { name: 'Rate', type: 'percent' },
        ],
        sampleRows: [
          { Tier: 'Gold', Rate: 0.10 },
          { Tier: 'Silver', Rate: 0.05 },
        ],
        apiPayload: {},
      },
    ],
    employeeAssumptionColumns: [
      {
        name: 'Base Salary',
        type: 'currency',
        description: 'Employee base salary',
        concept: 'draw',
        exampleValue: 50000,
      },
      {
        name: 'Quota',
        type: 'currency',
        description: 'Sales quota',
        concept: 'quota-target',
        exampleValue: 100000,
      },
    ],
    attributeWorksheets: [
      {
        name: 'Territories',
        description: 'Sales territory assignments',
        concept: 'territory',
        pkType: 'employee',
        columns: [
          { name: 'Region', type: 'text' },
          { name: 'Territory Code', type: 'text' },
        ],
        apiPayload: {},
      },
    ],
    formulaRecommendations: [
      {
        concept: 'commission',
        description: 'Calculate commission based on tier',
        logicExplanation: 'Multiply sales by tier rate',
        pseudo_formula: 'sales * tier_rate',
        captivateiqNotes: 'Use SmartGrid tier lookup',
      },
    ],
    ...overrides,
  };
}

// ── generatePayloads ─────────────────────────────────────────────────────────

describe('generatePayloads', () => {
  it('generates a complete payload structure', () => {
    const config = makeConfig();
    const result = generatePayloads(config);

    expect(result).toHaveProperty('plan');
    expect(result).toHaveProperty('periodGroup');
    expect(result).toHaveProperty('dataWorksheets');
    expect(result).toHaveProperty('employeeAssumptions');
    expect(result).toHaveProperty('attributeWorksheets');
    expect(result).toHaveProperty('formulaReference');
    expect(result).toHaveProperty('summary');
  });

  it('creates plan payload with correct structure', () => {
    const config = makeConfig();
    const result = generatePayloads(config);

    expect(result.plan).toEqual({
      name: 'Test Plan Q1 2026',
      description: 'Q1 compensation plan',
      period_type: 'MONTHLY',
      status: 'draft',
    });
  });

  it('maps periodType to uppercase MONTHLY', () => {
    const config = makeConfig({ planStructure: { ...makeConfig().planStructure, periodType: 'monthly' } });
    const result = generatePayloads(config);

    expect(result.plan.period_type).toBe('MONTHLY');
  });

  it('maps periodType to uppercase QUARTERLY', () => {
    const config = makeConfig({ planStructure: { ...makeConfig().planStructure, periodType: 'quarterly' } });
    const result = generatePayloads(config);

    expect(result.plan.period_type).toBe('QUARTERLY');
  });

  it('maps periodType to uppercase ANNUAL', () => {
    const config = makeConfig({ planStructure: { ...makeConfig().planStructure, periodType: 'annual' } });
    const result = generatePayloads(config);

    expect(result.plan.period_type).toBe('ANNUAL');
  });

  it('creates period group payload', () => {
    const config = makeConfig();
    const result = generatePayloads(config);

    expect(result.periodGroup).toHaveProperty('name');
    expect(result.periodGroup).toHaveProperty('period_type');
    expect(result.periodGroup).toHaveProperty('start_date');
    expect(result.periodGroup).toHaveProperty('end_date');
  });

  it('generates data worksheets from config', () => {
    const config = makeConfig();
    const result = generatePayloads(config);

    expect(result.dataWorksheets).toHaveLength(1);
    expect(result.dataWorksheets[0]).toHaveProperty('worksheet');
    expect(result.dataWorksheets[0]).toHaveProperty('records');
  });

  it('generates employee assumptions payload', () => {
    const config = makeConfig();
    const result = generatePayloads(config);

    expect(result.employeeAssumptions).toHaveProperty('_note');
    expect(result.employeeAssumptions).toHaveProperty('columns');
    expect(result.employeeAssumptions.columns).toHaveLength(2);
  });

  it('generates attribute worksheets payload', () => {
    const config = makeConfig();
    const result = generatePayloads(config);

    expect(result.attributeWorksheets).toHaveLength(1);
    expect(result.attributeWorksheets[0]).toHaveProperty('name');
    expect(result.attributeWorksheets[0]).toHaveProperty('pk_type');
  });

  it('builds formula reference from recommendations', () => {
    const config = makeConfig();
    const result = generatePayloads(config);

    expect(result.formulaReference).toHaveProperty('_note');
    expect(result.formulaReference).toHaveProperty('formulas');
    expect(result.formulaReference.formulas).toHaveLength(1);
    expect(result.formulaReference.formulas[0].concept).toBe('commission');
  });

  it('generates summary with correct counts', () => {
    const config = makeConfig();
    const result = generatePayloads(config);

    expect(result.summary).toEqual({
      planName: 'Test Plan Q1 2026',
      periodType: 'MONTHLY',
      dataWorksheetCount: 1,
      employeeAssumptionCount: 2,
      attributeWorksheetCount: 1,
      formulaCount: 1,
      generatedAt: expect.any(String),
    });
  });

  it('handles empty dataWorksheets array', () => {
    const config = makeConfig({ dataWorksheets: [] });
    const result = generatePayloads(config);

    expect(result.dataWorksheets).toEqual([]);
    expect(result.summary.dataWorksheetCount).toBe(0);
  });

  it('handles empty employeeAssumptionColumns array', () => {
    const config = makeConfig({ employeeAssumptionColumns: [] });
    const result = generatePayloads(config);

    expect(result.employeeAssumptions.columns).toEqual([]);
    expect(result.summary.employeeAssumptionCount).toBe(0);
  });

  it('handles empty attributeWorksheets array', () => {
    const config = makeConfig({ attributeWorksheets: [] });
    const result = generatePayloads(config);

    expect(result.attributeWorksheets).toEqual([]);
    expect(result.summary.attributeWorksheetCount).toBe(0);
  });

  it('handles empty formulaRecommendations array', () => {
    const config = makeConfig({ formulaRecommendations: [] });
    const result = generatePayloads(config);

    expect(result.formulaReference.formulas).toEqual([]);
    expect(result.summary.formulaCount).toBe(0);
  });
});
