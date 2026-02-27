export type {
  IAuthConfig,
  IRawRule,
  IExtractOptions,
  IConnectionStatus,
  IConnector,
} from './connector.js';

export {
  vendorIdSchema,
  ruleConceptSchema,
  sourceRefSchema,
  normalizedRuleSchema,
  effectivePeriodSchema,
  normalizedPlanSchema,
} from './normalized-schema.js';

export type {
  VendorId,
  RuleConcept,
  SourceRef,
  NormalizedRule,
  EffectivePeriod,
  NormalizedPlan,
} from './normalized-schema.js';

export type {
  IRateTableParams,
  IAcceleratorParams,
  IDeceleratorParams,
  IQualifierParams,
  ISplitParams,
  ITerritoryParams,
  IQuotaTargetParams,
  IDrawParams,
  ISpifParams,
  ICapParams,
  IFloorParams,
  IClawbackParams,
  RuleConceptParams,
} from './rule-concepts.js';
