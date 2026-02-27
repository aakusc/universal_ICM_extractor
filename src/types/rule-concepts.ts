/**
 * Rule Concept Taxonomy
 *
 * Defines the parameter shapes for each rule concept type.
 * These represent the normalized, vendor-agnostic parameters
 * that downstream consumers (Commission Calculator, etc.) use.
 */

export interface IRateTableParams {
  method: 'flat' | 'tiered' | 'matrix';
  measure: string;
  tiers: Array<{
    min: number;
    max: number | null;
    rate: number;
    unit: 'percent' | 'fixed';
  }>;
}

export interface IAcceleratorParams {
  threshold: number;
  thresholdUnit: 'percent-of-quota' | 'absolute';
  multiplier?: number;
  tiers?: Array<{
    min: number;
    max: number | null;
    rate: number;
  }>;
}

export interface IDeceleratorParams {
  threshold: number;
  thresholdUnit: 'percent-of-quota' | 'absolute';
  multiplier?: number;
  tiers?: Array<{
    min: number;
    max: number | null;
    rate: number;
  }>;
}

export interface IQualifierParams {
  metric: string;
  operator: 'gte' | 'gt' | 'lte' | 'lt' | 'eq' | 'neq' | 'between';
  value: number | string;
  valueTo?: number | string;
  gate: boolean;
}

export interface ISplitParams {
  participants: Array<{
    role: string;
    ratio: number;
  }>;
  method: 'percentage' | 'fixed' | 'formula';
  totalBasis: string;
}

export interface ITerritoryParams {
  assignments: Array<{
    territoryId: string;
    territoryName: string;
    assignedTo: string[];
  }>;
  hierarchy?: string[];
  rules?: string[];
}

export interface IQuotaTargetParams {
  amount: number;
  currency: string;
  period: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
  allocation: 'top-down' | 'bottom-up' | 'hybrid';
  measure: string;
}

export interface IDrawParams {
  amount: number;
  currency: string;
  type: 'recoverable' | 'non-recoverable';
  period: 'monthly' | 'quarterly' | 'annual';
  recoveryMethod?: 'offset' | 'repayment';
}

export interface ISpifParams {
  criteria: string;
  reward: {
    type: 'fixed' | 'percent' | 'tiered';
    value: number;
  };
  duration: {
    start: string;
    end: string;
  };
}

export interface ICapParams {
  maxAmount: number;
  currency: string;
  period: 'monthly' | 'quarterly' | 'annual' | 'plan-year';
  scope: 'per-deal' | 'total-earnings' | 'per-component';
}

export interface IFloorParams {
  minAmount: number;
  currency: string;
  period: 'monthly' | 'quarterly' | 'annual' | 'plan-year';
  scope: 'total-earnings' | 'per-component';
}

export interface IClawbackParams {
  triggerEvent: string;
  lookbackPeriod: {
    value: number;
    unit: 'days' | 'months' | 'quarters';
  };
  method: 'full' | 'prorated' | 'tiered';
  conditions?: string[];
}

/**
 * Union of all concept parameter types.
 */
export type RuleConceptParams =
  | IRateTableParams
  | IAcceleratorParams
  | IDeceleratorParams
  | IQualifierParams
  | ISplitParams
  | ITerritoryParams
  | IQuotaTargetParams
  | IDrawParams
  | ISpifParams
  | ICapParams
  | IFloorParams
  | IClawbackParams;
