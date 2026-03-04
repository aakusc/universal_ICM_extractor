import { describe, it, expect } from 'vitest';
import { normalizedPlanSchema, type NormalizedPlan } from '../src/types/normalized-schema.js';

describe('Normalizer', () => {
  describe('normalizedPlanSchema', () => {
    it('should validate a complete normalized plan', () => {
      const validPlan: NormalizedPlan = {
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

      const result = normalizedPlanSchema.safeParse(validPlan);
      expect(result.success).toBe(true);
    });

    it('should reject plan without id', () => {
      const invalidPlan = {
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

      const result = normalizedPlanSchema.safeParse(invalidPlan);
      expect(result.success).toBe(false);
    });

    it('should reject plan without sourceVendor', () => {
      const invalidPlan = {
        id: 'test-plan-1',
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

      const result = normalizedPlanSchema.safeParse(invalidPlan);
      expect(result.success).toBe(false);
    });

    it('should accept empty rules array', () => {
      const validPlan: NormalizedPlan = {
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

      const result = normalizedPlanSchema.safeParse(validPlan);
      expect(result.success).toBe(true);
    });

    it('should validate effectivePeriod date format', () => {
      const validPlan: NormalizedPlan = {
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

      const result = normalizedPlanSchema.safeParse(validPlan);
      expect(result.success).toBe(true);
    });
  });
});
