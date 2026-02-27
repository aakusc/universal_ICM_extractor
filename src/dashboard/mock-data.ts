import type { NormalizedPlan, NormalizedRule, RuleConcept } from '../types/normalized-schema.js';
import type { IConnectionStatus } from '../types/connector.js';

export interface IPipelineStats {
  rawRulesExtracted: number;
  rulesNormalized: number;
  avgConfidence: number;
  duration: number;
}

export interface IMockPipelineResult {
  plan: NormalizedPlan;
  stats: IPipelineStats;
  valid: boolean;
  validationErrors?: string[];
}

export interface ILogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  stage: 'connect' | 'extract' | 'interpret' | 'normalize' | 'system';
  message: string;
}

export interface IConceptMeta {
  id: RuleConcept;
  label: string;
  color: string;
}

// ── Vendor connector statuses ──────────────────────────────

export function getMockConnectorStatuses(): Array<IConnectionStatus & { latencyMs: number }> {
  return [
    { connected: true, vendor: 'varicent', authenticatedAs: 'svc-varicent@bhg.com', apiVersion: 'v2.4.1', latencyMs: 142 },
    { connected: true, vendor: 'xactly', authenticatedAs: 'api-xactly@bhg.com', apiVersion: 'v3.1.0', latencyMs: 203 },
    { connected: false, vendor: 'sap-successfactors', error: 'OAuth token expired — refresh pending', latencyMs: 0 },
    { connected: true, vendor: 'captivateiq', authenticatedAs: 'api-token@bhg.com', apiVersion: 'v1', latencyMs: 95 },
    { connected: true, vendor: 'salesforce', authenticatedAs: 'integration@bhg.com', apiVersion: 'v59.0', latencyMs: 178 },
  ];
}

// ── Mock normalized rules (Mattress Firm FY2026) ───────────

export function getMockNormalizedRules(): NormalizedRule[] {
  return [
    {
      id: 'var-fy26-rt-001',
      concept: 'rate-table',
      description: 'Tiered commission rate: 3% on first $50K revenue, 5% from $50K–$150K, 7% above $150K per quarter.',
      parameters: {
        method: 'tiered', measure: 'net-revenue',
        tiers: [
          { min: 0, max: 50000, rate: 0.03, unit: 'percent' },
          { min: 50000, max: 150000, rate: 0.05, unit: 'percent' },
          { min: 150000, max: null, rate: 0.07, unit: 'percent' },
        ],
      },
      confidence: 0.94,
      sourceRef: { vendorRuleId: 'VAR-RT-4401', vendorRuleType: 'COMM_TABLE', rawSnapshot: {} },
    },
    {
      id: 'var-fy26-acc-001',
      concept: 'accelerator',
      description: 'Accelerator: 1.5x rate multiplier when rep exceeds 100% of quarterly quota.',
      parameters: { threshold: 100, thresholdUnit: 'percent-of-quota', multiplier: 1.5 },
      confidence: 0.91,
      sourceRef: { vendorRuleId: 'VAR-ACC-4402', vendorRuleType: 'ACCELERATOR', rawSnapshot: {} },
    },
    {
      id: 'var-fy26-qual-001',
      concept: 'qualifier',
      description: 'Gate: Rep must achieve ≥ 80% of quota to qualify for any commission payout.',
      parameters: { metric: 'quota-attainment', operator: 'gte', value: 80, gate: true },
      confidence: 0.97,
      sourceRef: { vendorRuleId: 'VAR-QUAL-4403', vendorRuleType: 'QUALIFIER', rawSnapshot: {} },
    },
    {
      id: 'xac-fy26-split-001',
      concept: 'split',
      description: 'Credit split: 60% to territory rep, 40% to overlay specialist on enterprise deals.',
      parameters: {
        participants: [{ role: 'Territory Rep', ratio: 0.6 }, { role: 'Overlay Specialist', ratio: 0.4 }],
        method: 'percentage', totalBasis: 'deal-revenue',
      },
      confidence: 0.89,
      sourceRef: { vendorRuleId: 'XAC-SPL-2201', vendorRuleType: 'CREDIT_SPLIT', rawSnapshot: {} },
    },
    {
      id: 'var-fy26-cap-001',
      concept: 'cap',
      description: 'Earnings cap: Maximum $250,000 total commission per plan year.',
      parameters: { maxAmount: 250000, currency: 'USD', period: 'plan-year', scope: 'total-earnings' },
      confidence: 0.96,
      sourceRef: { vendorRuleId: 'VAR-CAP-4404', vendorRuleType: 'EARNING_CAP', rawSnapshot: {} },
    },
    {
      id: 'sf-fy26-spif-001',
      concept: 'spif',
      description: 'Q1 Mattress Blitz SPIF: $500 bonus per premium mattress unit sold, Jan 1 – Mar 31.',
      parameters: {
        criteria: 'premium-mattress-unit-sold',
        reward: { type: 'fixed', value: 500 },
        duration: { start: '2026-01-01', end: '2026-03-31' },
      },
      confidence: 0.93,
      sourceRef: { vendorRuleId: 'SF-SPIF-8801', vendorRuleType: 'SPIF_BONUS', rawSnapshot: {} },
    },
    {
      id: 'var-fy26-quota-001',
      concept: 'quota-target',
      description: 'Quarterly quota target: $200,000 net revenue, top-down allocation from regional target.',
      parameters: { amount: 200000, currency: 'USD', period: 'quarterly', allocation: 'top-down', measure: 'net-revenue' },
      confidence: 0.95,
      sourceRef: { vendorRuleId: 'VAR-QT-4405', vendorRuleType: 'QUOTA_TARGET', rawSnapshot: {} },
    },
    {
      id: 'var-fy26-claw-001',
      concept: 'clawback',
      description: 'Clawback: Full commission recovery if customer cancels within 90 days of delivery.',
      parameters: {
        triggerEvent: 'customer-cancellation',
        lookbackPeriod: { value: 90, unit: 'days' },
        method: 'full', conditions: ['within-delivery-window'],
      },
      confidence: 0.88,
      sourceRef: { vendorRuleId: 'VAR-CLW-4406', vendorRuleType: 'CLAWBACK', rawSnapshot: {} },
    },
  ];
}

// ── Mock pipeline result ───────────────────────────────────

export function getMockPipelineResult(): IMockPipelineResult {
  const rules = getMockNormalizedRules();
  const avgConfidence = rules.reduce((s, r) => s + r.confidence, 0) / rules.length;
  return {
    plan: {
      id: 'varicent-FY2026-MATTRESS-FIRM',
      sourceVendor: 'varicent',
      sourcePlanId: 'FY2026-MATTRESS-FIRM',
      extractedAt: new Date().toISOString(),
      planName: 'Mattress Firm FY2026 Sales Compensation Plan',
      effectivePeriod: { start: '2026-01-01', end: '2026-12-31' },
      rules,
      metadata: { connectorVersion: '0.1.0', apiVersion: 'v2.4.1' },
    },
    stats: {
      rawRulesExtracted: 12,
      rulesNormalized: rules.length,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      duration: 3847,
    },
    valid: true,
  };
}

// ── Activity log ───────────────────────────────────────────

export function getMockActivityLog(): ILogEntry[] {
  const now = Date.now();
  const t = (offset: number) => new Date(now - offset).toISOString();
  return [
    { timestamp: t(40000), level: 'info',    stage: 'system',    message: 'Universal ICM Connector v0.1.0 initialized' },
    { timestamp: t(38000), level: 'info',    stage: 'system',    message: 'Pipeline initiated for vendor: varicent' },
    { timestamp: t(37500), level: 'info',    stage: 'connect',   message: 'Authenticating to Varicent API (OAuth2)...' },
    { timestamp: t(37200), level: 'success', stage: 'connect',   message: 'Connected to Varicent v2.4.1 as svc-varicent@bhg.com (142ms)' },
    { timestamp: t(36000), level: 'info',    stage: 'extract',   message: 'Extracting rules for plan FY2026-MATTRESS-FIRM...' },
    { timestamp: t(35000), level: 'info',    stage: 'extract',   message: 'Scanning rule types: COMM_TABLE, ACCELERATOR, QUALIFIER, CREDIT_SPLIT, EARNING_CAP, SPIF_BONUS, QUOTA_TARGET, CLAWBACK' },
    { timestamp: t(34000), level: 'info',    stage: 'extract',   message: 'Found 12 raw rules across 8 rule types' },
    { timestamp: t(33000), level: 'success', stage: 'extract',   message: 'Extraction complete: 12 rules in 3.2s' },
    { timestamp: t(32000), level: 'info',    stage: 'interpret', message: 'Sending rules to AI interpreter (Claude claude-sonnet-4-6)...' },
    { timestamp: t(30000), level: 'info',    stage: 'interpret', message: 'Interpreting rule 1/12: COMM_TABLE → rate-table (0.94)' },
    { timestamp: t(28000), level: 'info',    stage: 'interpret', message: 'Interpreting rule 4/12: CREDIT_SPLIT → split (0.89)' },
    { timestamp: t(25000), level: 'warn',    stage: 'interpret', message: 'Low confidence (0.62) on rule VAR-MISC-4407 — flagged for manual review' },
    { timestamp: t(22000), level: 'info',    stage: 'interpret', message: 'Interpreting rule 8/12: SPIF_BONUS → spif (0.93)' },
    { timestamp: t(18000), level: 'info',    stage: 'interpret', message: 'Interpreting rule 12/12: CLAWBACK → clawback (0.88)' },
    { timestamp: t(15000), level: 'success', stage: 'interpret', message: 'Interpretation complete: 8 concepts from 12 rules (avg confidence: 0.93)' },
    { timestamp: t(12000), level: 'info',    stage: 'normalize', message: 'Normalizing 8 rules to vendor-agnostic schema...' },
    { timestamp: t(10000), level: 'info',    stage: 'normalize', message: 'Validating output against NormalizedPlan Zod schema...' },
    { timestamp: t(8000),  level: 'success', stage: 'normalize', message: 'Schema validation passed — all rules conform' },
    { timestamp: t(5000),  level: 'success', stage: 'system',    message: 'Pipeline complete: 8 normalized rules in 3.85s' },
    { timestamp: t(3000),  level: 'info',    stage: 'connect',   message: 'Xactly: connected (203ms) | SAP SF: token expired | CaptivateIQ: connected (95ms) | Salesforce: connected (178ms)' },
    { timestamp: t(1000),  level: 'info',    stage: 'system',    message: 'Ready for downstream consumers (Commission Calculator, SGM/SPARCC)' },
  ];
}

// ── Concept taxonomy display metadata ──────────────────────

export const CONCEPT_TAXONOMY: IConceptMeta[] = [
  { id: 'rate-table',   label: 'Rate Table',   color: '#0ea5e9' },
  { id: 'accelerator',  label: 'Accelerator',  color: '#10b981' },
  { id: 'decelerator',  label: 'Decelerator',  color: '#f59e0b' },
  { id: 'qualifier',    label: 'Qualifier',     color: '#6366f1' },
  { id: 'split',        label: 'Split',         color: '#8b5cf6' },
  { id: 'territory',    label: 'Territory',     color: '#06b6d4' },
  { id: 'quota-target', label: 'Quota Target',  color: '#3b82f6' },
  { id: 'draw',         label: 'Draw',          color: '#ec4899' },
  { id: 'spif',         label: 'SPIF',          color: '#f97316' },
  { id: 'cap',          label: 'Cap',           color: '#ef4444' },
  { id: 'floor',        label: 'Floor',         color: '#14b8a6' },
  { id: 'clawback',     label: 'Clawback',      color: '#dc2626' },
];
