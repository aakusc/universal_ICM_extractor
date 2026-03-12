import { describe, it, expect } from 'vitest';
import { normalizedRuleSchema, normalizedPlanSchema, ruleConceptSchema, sourceRefSchema, type NormalizedRule, type NormalizedPlan } from '../src/types/normalized-schema.js';

describe('Edge Cases - Empty and Null Handling', () => {
  describe('NormalizedRule schema', () => {
    it('should handle rule with all valid fields', () => {
      const rule = {
        id: 'rule-1',
        concept: 'rate-table',
        description: 'Test description',
        parameters: {},
        confidence: 0.9,
        sourceRef: {
          vendorRuleId: 'VR-001',
          vendorRuleType: 'flat',
          rawSnapshot: null,
        },
      };
      const result = normalizedRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });

    it('should handle rule with empty parameters object', () => {
      const rule = {
        id: 'rule-1',
        concept: 'rate-table',
        description: 'Test description',
        parameters: {},
        confidence: 0.9,
        sourceRef: {
          vendorRuleId: 'VR-001',
          vendorRuleType: 'flat',
          rawSnapshot: null,
        },
      };
      const result = normalizedRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });

    it('should handle rule with confidence of 0', () => {
      const rule = {
        id: 'rule-1',
        concept: 'rate-table',
        description: 'Test description',
        parameters: {},
        confidence: 0,
        sourceRef: {
          vendorRuleId: 'VR-001',
          vendorRuleType: 'flat',
          rawSnapshot: null,
        },
      };
      const result = normalizedRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });

    it('should handle rule with confidence of 1', () => {
      const rule = {
        id: 'rule-1',
        concept: 'rate-table',
        description: 'Test description',
        parameters: {},
        confidence: 1,
        sourceRef: {
          vendorRuleId: 'VR-001',
          vendorRuleType: 'flat',
          rawSnapshot: null,
        },
      };
      const result = normalizedRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });

    it('should reject rule with confidence above 1', () => {
      const rule = {
        id: 'rule-1',
        concept: 'rate-table',
        description: 'Test description',
        parameters: {},
        confidence: 1.5,
        sourceRef: {
          vendorRuleId: 'VR-001',
          vendorRuleType: 'flat',
          rawSnapshot: null,
        },
      };
      const result = normalizedRuleSchema.safeParse(rule);
      expect(result.success).toBe(false);
    });

    it('should reject rule with negative confidence', () => {
      const rule = {
        id: 'rule-1',
        concept: 'rate-table',
        description: 'Test description',
        parameters: {},
        confidence: -0.1,
        sourceRef: {
          vendorRuleId: 'VR-001',
          vendorRuleType: 'flat',
          rawSnapshot: null,
        },
      };
      const result = normalizedRuleSchema.safeParse(rule);
      expect(result.success).toBe(false);
    });

    it('should handle rule with null rawSnapshot', () => {
      const rule = {
        id: 'rule-1',
        concept: 'rate-table',
        description: 'Test description',
        parameters: {},
        confidence: 0.9,
        sourceRef: {
          vendorRuleId: 'VR-001',
          vendorRuleType: 'flat',
          rawSnapshot: null,
        },
      };
      const result = normalizedRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });

    it('should handle rule with object rawSnapshot', () => {
      const rule = {
        id: 'rule-1',
        concept: 'rate-table',
        description: 'Test description',
        parameters: {},
        confidence: 0.9,
        sourceRef: {
          vendorRuleId: 'VR-001',
          vendorRuleType: 'flat',
          rawSnapshot: { key: 'value', nested: { data: 123 } },
        },
      };
      const result = normalizedRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });

    it('should handle rule with all concept types', () => {
      const concepts = ['rate-table', 'accelerator', 'decelerator', 'qualifier', 'split', 'territory', 'quota-target', 'draw', 'spif', 'cap', 'floor', 'clawback'];
      
      for (const concept of concepts) {
        const rule = {
          id: 'rule-1',
          concept,
          description: 'Test description',
          parameters: {},
          confidence: 0.9,
          sourceRef: {
            vendorRuleId: 'VR-001',
            vendorRuleType: 'flat',
            rawSnapshot: null,
          },
        };
        const result = normalizedRuleSchema.safeParse(rule);
        expect(result.success).toBe(true, `Concept ${concept} should be valid`);
      }
    });

    it('should reject rule with invalid concept', () => {
      const rule = {
        id: 'rule-1',
        concept: 'invalid-concept',
        description: 'Test description',
        parameters: {},
        confidence: 0.9,
        sourceRef: {
          vendorRuleId: 'VR-001',
          vendorRuleType: 'flat',
          rawSnapshot: null,
        },
      };
      const result = normalizedRuleSchema.safeParse(rule);
      expect(result.success).toBe(false);
    });

    it('should reject rule with missing required fields', () => {
      const rule = {
        id: 'rule-1',
        // missing concept, description, parameters, confidence, sourceRef
      };
      const result = normalizedRuleSchema.safeParse(rule);
      expect(result.success).toBe(false);
    });
  });

  describe('NormalizedPlan schema', () => {
    it('should handle plan with very long planName', () => {
      const plan = {
        id: 'test-plan-1',
        sourceVendor: 'xactly',
        sourcePlanId: 'plan-123',
        extractedAt: '2026-03-03T10:00:00.000Z',
        planName: 'A'.repeat(1000),
        effectivePeriod: {
          start: '2026-01-01',
          end: '2026-12-31',
        },
        rules: [],
        metadata: {
          connectorVersion: '0.1.0',
          apiVersion: '1.0',
        },
      };
      const result = normalizedPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it('should handle plan with unicode in planName', () => {
      const plan = {
        id: 'test-plan-1',
        sourceVendor: 'xactly',
        sourcePlanId: 'plan-123',
        extractedAt: '2026-03-03T10:00:00.000Z',
        planName: 'Test Plan with émoji 🎉 and unicode 你好',
        effectivePeriod: {
          start: '2026-01-01',
          end: '2026-12-31',
        },
        rules: [],
        metadata: {
          connectorVersion: '0.1.0',
          apiVersion: '1.0',
        },
      };
      const result = normalizedPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it('should handle plan with special characters in sourcePlanId', () => {
      const plan = {
        id: 'test-plan-1',
        sourceVendor: 'xactly',
        sourcePlanId: 'plan-id-with-special_Chars-123',
        extractedAt: '2026-03-03T10:00:00.000Z',
        planName: 'Test Plan',
        effectivePeriod: {
          start: '2026-01-01',
          end: '2026-12-31',
        },
        rules: [],
        metadata: {
          connectorVersion: '0.1.0',
          apiVersion: '1.0',
        },
      };
      const result = normalizedPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it('should handle plan with empty rules array', () => {
      const plan = {
        id: 'test-plan-1',
        sourceVendor: 'xactly',
        sourcePlanId: 'plan-123',
        extractedAt: '2026-03-03T10:00:00.000Z',
        planName: 'Test Plan',
        effectivePeriod: {
          start: '2026-01-01',
          end: '2026-12-31',
        },
        rules: [],
        metadata: {
          connectorVersion: '0.1.0',
          apiVersion: '1.0',
        },
      };
      const result = normalizedPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it('should reject plan with invalid sourceVendor', () => {
      const plan = {
        id: 'test-plan-1',
        sourceVendor: 'invalid-vendor',
        sourcePlanId: 'plan-123',
        extractedAt: '2026-03-03T10:00:00.000Z',
        planName: 'Test Plan',
        effectivePeriod: {
          start: '2026-01-01',
          end: '2026-12-31',
        },
        rules: [],
        metadata: {
          connectorVersion: '0.1.0',
          apiVersion: '1.0',
        },
      };
      const result = normalizedPlanSchema.safeParse(plan);
      expect(result.success).toBe(false);
    });

    it('should handle plan with non-ISO date format in extractedAt', () => {
      const plan = {
        id: 'test-plan-1',
        sourceVendor: 'xactly',
        sourcePlanId: 'plan-123',
        extractedAt: 'not-a-date',
        planName: 'Test Plan',
        effectivePeriod: {
          start: '2026-01-01',
          end: '2026-12-31',
        },
        rules: [],
        metadata: {
          connectorVersion: '0.1.0',
          apiVersion: '1.0',
        },
      };
      // Schema uses string type so this passes
      const result = normalizedPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it('should handle plan with no metadata', () => {
      const plan = {
        id: 'test-plan-1',
        sourceVendor: 'xactly',
        sourcePlanId: 'plan-123',
        extractedAt: '2026-03-03T10:00:00.000Z',
        planName: 'Test Plan',
        effectivePeriod: {
          start: '2026-01-01',
          end: '2026-12-31',
        },
        rules: [],
      };
      const result = normalizedPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it('should handle plan with empty string planName', () => {
      const plan = {
        id: 'test-plan-1',
        sourceVendor: 'xactly',
        sourcePlanId: 'plan-123',
        extractedAt: '2026-03-03T10:00:00.000Z',
        planName: '',
        effectivePeriod: {
          start: '2026-01-01',
          end: '2026-12-31',
        },
        rules: [],
        metadata: {
          connectorVersion: '0.1.0',
          apiVersion: '1.0',
        },
      };
      const result = normalizedPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it('should reject plan with missing required fields', () => {
      const plan = {
        sourceVendor: 'xactly',
        // missing id, sourcePlanId, extractedAt, planName, effectivePeriod, rules
      };
      const result = normalizedPlanSchema.safeParse(plan);
      expect(result.success).toBe(false);
    });
  });
});
