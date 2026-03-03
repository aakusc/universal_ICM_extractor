import { describe, it, expect, beforeEach } from 'vitest';
import { ConceptExtractor } from '../src/interpreter/concept-extractor.js';
import type { IRawRule } from '../src/types/connector.js';

describe('ConceptExtractor', () => {
  let extractor: ConceptExtractor;

  beforeEach(() => {
    extractor = new ConceptExtractor({
      provider: 'claude',
      apiKey: 'test-key',
    });
  });

  describe('constructor', () => {
    it('should create instance with config', () => {
      expect(extractor).toBeDefined();
    });
  });

  describe('interpretRules', () => {
    it('should return empty array for empty input', async () => {
      const result = await extractor.interpretRules([]);
      expect(result).toEqual([]);
    });

    it('should return uninterpreted result for single rule', async () => {
      const rawRules: IRawRule[] = [
        {
          vendorRuleId: 'rule-001',
          vendorRuleType: 'commission-rate',
          planId: 'plan-001',
          data: { rate: 0.1, threshold: 1000 },
        },
      ];

      const result = await extractor.interpretRules(rawRules);

      // Current implementation returns empty array when concepts is empty
      // (placeholder implementation with no AI provider)
      expect(result).toHaveLength(0);
    });

    it('should return empty when no concepts identified', async () => {
      // This documents current behavior: empty concepts = no results
      const rawRules: IRawRule[] = [
        {
          vendorRuleId: 'rule-002',
          vendorRuleType: 'tiered-rate',
          planId: 'plan-002',
          data: { tiers: [{ min: 0, rate: 0.05 }] },
        },
      ];

      const result = await extractor.interpretRules(rawRules);

      // Should have 0 results (no concepts identified)
      expect(result).toHaveLength(0);
    });

    it('should handle multiple rules in batch', async () => {
      const rawRules: IRawRule[] = [
        {
          vendorRuleId: 'rule-a',
          vendorRuleType: 'rate',
          planId: 'plan-a',
          data: { value: 10 },
        },
        {
          vendorRuleId: 'rule-b',
          vendorRuleType: 'accelerator',
          planId: 'plan-b',
          data: { threshold: 5000 },
        },
      ];

      const result = await extractor.interpretRules(rawRules);

      // Current: empty concepts = empty results
      expect(result).toHaveLength(0);
    });
  });
});
