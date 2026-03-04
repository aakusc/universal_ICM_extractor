import { describe, it, expect } from 'vitest';
import {
  vendorIdSchema,
  ruleConceptSchema,
  sourceRefSchema,
  normalizedRuleSchema,
  effectivePeriodSchema,
  normalizedPlanSchema,
} from '../src/types/normalized-schema.js';

describe('vendorIdSchema', () => {
  it('should accept valid vendor IDs', () => {
    expect(vendorIdSchema.safeParse('varicent').success).toBe(true);
    expect(vendorIdSchema.safeParse('xactly').success).toBe(true);
    expect(vendorIdSchema.safeParse('captivateiq').success).toBe(true);
  });

  it('should reject invalid vendor IDs', () => {
    expect(vendorIdSchema.safeParse('invalid').success).toBe(false);
    expect(vendorIdSchema.safeParse('').success).toBe(false);
  });
});

describe('ruleConceptSchema', () => {
  it('should accept valid rule concepts', () => {
    expect(ruleConceptSchema.safeParse('rate-table').success).toBe(true);
    expect(ruleConceptSchema.safeParse('accelerator').success).toBe(true);
    expect(ruleConceptSchema.safeParse('spif').success).toBe(true);
  });

  it('should reject invalid concepts', () => {
    expect(ruleConceptSchema.safeParse('invalid-concept').success).toBe(false);
  });
});

describe('sourceRefSchema', () => {
  it('should accept valid source ref', () => {
    const valid = {
      vendorRuleId: 'rule-001',
      vendorRuleType: 'commission-rate',
      rawSnapshot: { rate: 0.1 },
    };
    expect(sourceRefSchema.safeParse(valid).success).toBe(true);
  });

  it('should reject missing required fields', () => {
    expect(sourceRefSchema.safeParse({ vendorRuleId: 'rule-001' }).success).toBe(false);
  });
});

describe('normalizedRuleSchema', () => {
  it('should accept valid normalized rule', () => {
    const valid = {
      id: 'rule-001',
      concept: 'rate-table',
      description: 'Test rule description',
      parameters: { rate: 0.1 },
      confidence: 0.95,
      sourceRef: {
        vendorRuleId: 'rule-001',
        vendorRuleType: 'commission-rate',
        rawSnapshot: null,
      },
    };
    expect(normalizedRuleSchema.safeParse(valid).success).toBe(true);
  });

  it('should reject confidence outside 0-1 range', () => {
    const invalid = {
      id: 'rule-001',
      concept: 'rate-table',
      description: 'Test',
      parameters: {},
      confidence: 1.5,
      sourceRef: {
        vendorRuleId: 'rule-001',
        vendorRuleType: 'rate',
        rawSnapshot: null,
      },
    };
    expect(normalizedRuleSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('effectivePeriodSchema', () => {
  it('should accept valid effective period', () => {
    const valid = {
      start: '2026-01-01',
      end: '2026-12-31',
    };
    expect(effectivePeriodSchema.safeParse(valid).success).toBe(true);
  });

  it('should reject invalid dates', () => {
    expect(effectivePeriodSchema.safeParse({ start: 'invalid' }).success).toBe(false);
  });
});

describe('normalizedPlanSchema', () => {
  it('should accept valid normalized plan', () => {
    const valid = {
      id: 'plan-001',
      sourceVendor: 'captivateiq',
      sourcePlanId: 'plan-123',
      extractedAt: '2026-03-03T00:00:00.000Z',
      planName: 'Test Plan',
      effectivePeriod: {
        start: '2026-01-01',
        end: '2026-12-31',
      },
      rules: [],
    };
    expect(normalizedPlanSchema.safeParse(valid).success).toBe(true);
  });

  it('should accept plan with rules', () => {
    const valid = {
      id: 'plan-001',
      sourceVendor: 'xactly',
      sourcePlanId: 'plan-123',
      extractedAt: '2026-03-03T00:00:00.000Z',
      planName: 'Test Plan',
      effectivePeriod: {
        start: '2026-01-01',
        end: '2026-12-31',
      },
      rules: [
        {
          id: 'rule-001',
          concept: 'accelerator',
          description: 'Test rule',
          parameters: {},
          confidence: 0.9,
          sourceRef: {
            vendorRuleId: 'rule-001',
            vendorRuleType: 'accelerator',
            rawSnapshot: null,
          },
        },
      ],
    };
    expect(normalizedPlanSchema.safeParse(valid).success).toBe(true);
  });

  it('should reject invalid vendor', () => {
    const invalid = {
      id: 'plan-001',
      sourceVendor: 'invalid-vendor',
      sourcePlanId: 'plan-123',
      extractedAt: '2026-03-03T00:00:00.000Z',
      planName: 'Test Plan',
      effectivePeriod: {
        start: '2026-01-01',
        end: '2026-12-31',
      },
      rules: [],
    };
    expect(normalizedPlanSchema.safeParse(invalid).success).toBe(false);
  });
});
