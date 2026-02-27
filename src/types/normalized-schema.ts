import { z } from 'zod';

/**
 * Vendor identifiers for supported ICM systems.
 */
export const vendorIdSchema = z.enum([
  'varicent',
  'xactly',
  'sap-successfactors',
  'captivateiq',
  'salesforce',
]);
export type VendorId = z.infer<typeof vendorIdSchema>;

/**
 * Rule concept taxonomy — the classification of compensation rule intent.
 */
export const ruleConceptSchema = z.enum([
  'rate-table',
  'accelerator',
  'decelerator',
  'qualifier',
  'split',
  'territory',
  'quota-target',
  'draw',
  'spif',
  'cap',
  'floor',
  'clawback',
]);
export type RuleConcept = z.infer<typeof ruleConceptSchema>;

/**
 * Source reference — traceability back to the original vendor rule.
 */
export const sourceRefSchema = z.object({
  vendorRuleId: z.string(),
  vendorRuleType: z.string(),
  rawSnapshot: z.unknown(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

/**
 * A single normalized rule — one business concept extracted and classified.
 */
export const normalizedRuleSchema = z.object({
  id: z.string(),
  concept: ruleConceptSchema,
  description: z.string().describe('AI-generated plain-English description of rule intent'),
  parameters: z.record(z.unknown()).describe('Concept-specific parameters'),
  confidence: z.number().min(0).max(1).describe('AI interpretation confidence score'),
  sourceRef: sourceRefSchema,
});
export type NormalizedRule = z.infer<typeof normalizedRuleSchema>;

/**
 * Effective period for a compensation plan.
 */
export const effectivePeriodSchema = z.object({
  start: z.string().describe('ISO date string'),
  end: z.string().describe('ISO date string'),
});
export type EffectivePeriod = z.infer<typeof effectivePeriodSchema>;

/**
 * Top-level normalized plan — the complete output of the extraction pipeline.
 */
export const normalizedPlanSchema = z.object({
  id: z.string(),
  sourceVendor: vendorIdSchema,
  sourcePlanId: z.string(),
  extractedAt: z.string().describe('ISO timestamp of extraction'),
  planName: z.string(),
  effectivePeriod: effectivePeriodSchema,
  rules: z.array(normalizedRuleSchema),
  metadata: z.record(z.unknown()).optional(),
});
export type NormalizedPlan = z.infer<typeof normalizedPlanSchema>;
