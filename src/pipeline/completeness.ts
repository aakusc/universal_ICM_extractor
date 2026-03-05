/**
 * CIQ Build Readiness — Completeness Analyzer
 *
 * Deterministic checks (no AI calls) that inspect pipeline output
 * and score readiness for a CaptivateIQ build.
 *
 * 38 checks across 8 categories, weighted scoring:
 *   required=3, recommended=2, optional=1
 *   complete=1.0, partial=0.5, missing=0.0, n/a=excluded
 */

import type { NormalizedRule, RuleConcept } from '../types/normalized-schema.js';
import type {
  CaptivateIQBuildConfig,
  DataWorksheetConfig,
  EmployeeAssumptionColumn,
  AttributeWorksheetConfig,
  FormulaRecommendation,
} from '../project/types.js';
import type {
  SynthesisResult,
  ValidationResult,
  ChecklistItem,
  ChecklistCategory,
  CategorySummary,
  CompletenessResult,
} from './types.js';

// ── Check definition ──────────────────────────────────────

interface CheckDef {
  id: string;
  name: string;
  category: ChecklistCategory;
  priority: 'required' | 'recommended' | 'optional';
  run: (ctx: CheckContext) => CheckOutput;
}

interface CheckContext {
  rules: NormalizedRule[];
  config: CaptivateIQBuildConfig;
  synthesis: SynthesisResult;
  validation: ValidationResult | null;
}

interface CheckOutput {
  status: 'complete' | 'partial' | 'missing' | 'not-applicable';
  evidence: string | null;
  gapDescription: string | null;
  suggestedAction: string | null;
  sourceRuleIds: string[];
}

// ── Helpers ───────────────────────────────────────────────

function rulesByConcept(rules: NormalizedRule[], concept: RuleConcept): NormalizedRule[] {
  return rules.filter(r => r.concept === concept);
}

function hasPlaceholder(val: unknown): boolean {
  if (typeof val === 'string') {
    const lower = val.toLowerCase();
    return ['tbd', 'todo', 'wip', 'n/a', 'placeholder', 'xxx', 'tbc'].some(p => lower.includes(p));
  }
  return false;
}

function scanForPlaceholders(obj: unknown, path = ''): string[] {
  const hits: string[] = [];
  if (obj == null) return hits;
  if (typeof obj === 'string') {
    if (hasPlaceholder(obj)) hits.push(path || obj);
  } else if (Array.isArray(obj)) {
    obj.forEach((item, i) => hits.push(...scanForPlaceholders(item, `${path}[${i}]`)));
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      hits.push(...scanForPlaceholders(v, path ? `${path}.${k}` : k));
    }
  }
  return hits;
}

function distinctRoles(rules: NormalizedRule[]): string[] {
  const roles = new Set<string>();
  for (const r of rules) {
    const params = r.parameters as Record<string, unknown>;
    if (params.role) roles.add(String(params.role));
    if (params.roles && Array.isArray(params.roles)) {
      (params.roles as string[]).forEach(role => roles.add(role));
    }
    if (params.applicableRoles && Array.isArray(params.applicableRoles)) {
      (params.applicableRoles as string[]).forEach(role => roles.add(role));
    }
    // Check description for role mentions
    const rolePatterns = /\b(AE|SDR|BDR|Account Executive|Sales Rep|Manager|Director|VP|TSR)\b/gi;
    const matches = r.description.match(rolePatterns);
    if (matches) matches.forEach(m => roles.add(m));
  }
  return [...roles];
}

// ── Check Registry ────────────────────────────────────────

const checks: CheckDef[] = [
  // ── Plan Setup (6) ──────────────────────────────────────

  {
    id: 'plan-setup.plan-name',
    name: 'Plan name defined',
    category: 'plan-setup',
    priority: 'required',
    run: (ctx) => {
      const name = ctx.config.planStructure.planName;
      if (name && name.trim() && !hasPlaceholder(name)) {
        return { status: 'complete', evidence: `Plan: "${name}"`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return { status: 'missing', evidence: null, gapDescription: 'No plan name defined', suggestedAction: 'Provide a descriptive plan name (e.g., "FY26 Sales Commission Plan")', sourceRuleIds: [] };
    },
  },
  {
    id: 'plan-setup.period-type',
    name: 'Period type defined',
    category: 'plan-setup',
    priority: 'required',
    run: (ctx) => {
      const pt = ctx.config.planStructure.periodType;
      if (pt) return { status: 'complete', evidence: `Period: ${pt}`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      return { status: 'missing', evidence: null, gapDescription: 'No period type set', suggestedAction: 'Specify monthly, quarterly, or annual period type', sourceRuleIds: [] };
    },
  },
  {
    id: 'plan-setup.effective-dates',
    name: 'Effective dates identified',
    category: 'plan-setup',
    priority: 'required',
    run: (ctx) => {
      // Check rules and insights for date references
      const datePatterns = /\b(FY\d{2,4}|Q[1-4]\s*\d{4}|20\d{2}|effective\s+date|start\s+date|plan\s+year)\b/gi;
      const allText = ctx.rules.map(r => r.description).join(' ') + ' ' + ctx.synthesis.insights;
      const matches = allText.match(datePatterns);
      if (matches && matches.length > 0) {
        return { status: 'complete', evidence: `Date refs: ${[...new Set(matches)].slice(0, 3).join(', ')}`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return { status: 'partial', evidence: null, gapDescription: 'No explicit effective dates found in source data', suggestedAction: 'Confirm plan effective dates (start/end) for the compensation period', sourceRuleIds: [] };
    },
  },
  {
    id: 'plan-setup.components',
    name: 'Payout components defined',
    category: 'plan-setup',
    priority: 'required',
    run: (ctx) => {
      const comps = ctx.config.planStructure.payoutComponents;
      if (comps && comps.length > 0) {
        return { status: 'complete', evidence: `Components: ${comps.join(', ')}`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return { status: 'missing', evidence: null, gapDescription: 'No payout components defined', suggestedAction: 'Define at least one payout component (e.g., "Commission", "Bonus")', sourceRuleIds: [] };
    },
  },
  {
    id: 'plan-setup.multi-plan-decision',
    name: 'Multi-plan structure decided',
    category: 'plan-setup',
    priority: 'recommended',
    run: (ctx) => {
      const roles = distinctRoles(ctx.rules);
      if (roles.length <= 1) {
        return { status: 'complete', evidence: `Single role plan: ${roles[0] || 'general'}`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      // Multiple roles — check if plan notes address this
      const notes = ctx.config.planStructure.notes || '';
      const mentionsMulti = /separate\s+plan|multi[- ]plan|per[- ]role/i.test(notes + ' ' + ctx.synthesis.insights);
      if (mentionsMulti) {
        return { status: 'complete', evidence: `${roles.length} roles, multi-plan addressed in insights`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return { status: 'partial', evidence: `${roles.length} roles detected: ${roles.slice(0, 5).join(', ')}`, gapDescription: 'Multiple roles found but no decision on single vs. multi-plan structure', suggestedAction: `Decide: single plan with role-based components, or separate plans per role (${roles.join(', ')})`, sourceRuleIds: [] };
    },
  },
  {
    id: 'plan-setup.roles-per-component',
    name: 'Roles mapped to components',
    category: 'plan-setup',
    priority: 'recommended',
    run: (ctx) => {
      const roles = distinctRoles(ctx.rules);
      const comps = ctx.config.planStructure.payoutComponents;
      if (roles.length === 0 || comps.length === 0) {
        return { status: 'not-applicable', evidence: null, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      // If only one role or role count matches component count, likely mapped
      if (roles.length <= 1 || comps.length >= roles.length) {
        return { status: 'complete', evidence: `${roles.length} roles, ${comps.length} components`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return { status: 'partial', evidence: `${roles.length} roles but only ${comps.length} components`, gapDescription: 'More roles than components — some roles may share components', suggestedAction: 'Clarify which roles use which payout components', sourceRuleIds: [] };
    },
  },

  // ── Data Workbooks (5) ──────────────────────────────────

  {
    id: 'data-workbooks.rate-tables-exist',
    name: 'Rate tables defined',
    category: 'data-workbooks',
    priority: 'required',
    run: (ctx) => {
      const rateTables = ctx.config.dataWorksheets.filter(d => /rate[- ]?table/i.test(d.concept) || /rate/i.test(d.name));
      const rateRules = rulesByConcept(ctx.rules, 'rate-table');
      if (rateTables.length > 0 || rateRules.length > 0) {
        return { status: 'complete', evidence: `${rateTables.length} rate table worksheets, ${rateRules.length} rate rules`, gapDescription: null, suggestedAction: null, sourceRuleIds: rateRules.map(r => r.id) };
      }
      return { status: 'missing', evidence: null, gapDescription: 'No rate tables found in extracted data', suggestedAction: 'Provide commission rate tables (tiers, rates, thresholds)', sourceRuleIds: [] };
    },
  },
  {
    id: 'data-workbooks.tier-completeness',
    name: 'Rate tier data complete',
    category: 'data-workbooks',
    priority: 'required',
    run: (ctx) => {
      const rateRules = rulesByConcept(ctx.rules, 'rate-table');
      if (rateRules.length === 0) {
        return { status: 'not-applicable', evidence: null, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      const issues: string[] = [];
      for (const rule of rateRules) {
        const params = rule.parameters as Record<string, unknown>;
        const tiers = params.tiers as Array<Record<string, unknown>> | undefined;
        if (!tiers || tiers.length === 0) {
          issues.push(`${rule.id}: no tiers`);
          continue;
        }
        for (let i = 0; i < tiers.length; i++) {
          const tier = tiers[i];
          if (tier.rate == null) issues.push(`${rule.id}: tier ${i + 1} missing rate`);
          if (tier.min == null && tier.threshold == null && tier.lower == null) {
            if (i > 0) issues.push(`${rule.id}: tier ${i + 1} missing threshold`);
          }
        }
      }
      if (issues.length === 0) {
        return { status: 'complete', evidence: `All ${rateRules.length} rate tables have complete tier data`, gapDescription: null, suggestedAction: null, sourceRuleIds: rateRules.map(r => r.id) };
      }
      return { status: 'partial', evidence: `${issues.length} tier issues found`, gapDescription: issues.join('; '), suggestedAction: 'Fill in missing rate values and tier thresholds', sourceRuleIds: rateRules.map(r => r.id) };
    },
  },
  {
    id: 'data-workbooks.column-definitions',
    name: 'Worksheet columns typed',
    category: 'data-workbooks',
    priority: 'required',
    run: (ctx) => {
      const worksheets = ctx.config.dataWorksheets;
      if (worksheets.length === 0) {
        return { status: 'missing', evidence: null, gapDescription: 'No data worksheets defined', suggestedAction: 'Define at least one data worksheet with typed columns', sourceRuleIds: [] };
      }
      const noColumns = worksheets.filter(w => !w.columns || w.columns.length === 0);
      if (noColumns.length === 0) {
        return { status: 'complete', evidence: `${worksheets.length} worksheets all have typed columns`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return { status: 'partial', evidence: `${noColumns.length}/${worksheets.length} worksheets missing column definitions`, gapDescription: `Missing columns: ${noColumns.map(w => w.name).join(', ')}`, suggestedAction: 'Add column definitions (name + type) to all data worksheets', sourceRuleIds: [] };
    },
  },
  {
    id: 'data-workbooks.lookup-tables',
    name: 'Lookup/mapping tables exist',
    category: 'data-workbooks',
    priority: 'recommended',
    run: (ctx) => {
      const lookups = ctx.config.dataWorksheets.filter(d =>
        /lookup|mapping|map|reference|xref/i.test(d.concept) || /lookup|mapping/i.test(d.name)
      );
      const attrs = ctx.config.attributeWorksheets;
      if (lookups.length > 0 || attrs.length > 0) {
        return { status: 'complete', evidence: `${lookups.length} lookup worksheets, ${attrs.length} attribute worksheets`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      // Check if any formulas reference lookups
      const hasLookupFormulas = ctx.config.formulaRecommendations.some(f => /vlookup|lookup|match/i.test(f.pseudoFormula || f.description));
      if (hasLookupFormulas) {
        return { status: 'partial', evidence: 'Formula references to lookups but no dedicated lookup worksheets', gapDescription: 'Formulas reference lookups but no lookup data worksheets defined', suggestedAction: 'Create attribute or data worksheets for lookup tables', sourceRuleIds: [] };
      }
      return { status: 'not-applicable', evidence: 'No lookup patterns detected', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
    },
  },
  {
    id: 'data-workbooks.sample-data',
    name: 'Sample data available',
    category: 'data-workbooks',
    priority: 'recommended',
    run: (ctx) => {
      const withSamples = ctx.config.dataWorksheets.filter(w => w.sampleRows && w.sampleRows.length > 0);
      if (withSamples.length === ctx.config.dataWorksheets.length && ctx.config.dataWorksheets.length > 0) {
        return { status: 'complete', evidence: `All ${withSamples.length} worksheets have sample data`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      if (withSamples.length > 0) {
        const missing = ctx.config.dataWorksheets.filter(w => !w.sampleRows || w.sampleRows.length === 0);
        return { status: 'partial', evidence: `${withSamples.length}/${ctx.config.dataWorksheets.length} have samples`, gapDescription: `Missing samples: ${missing.map(w => w.name).join(', ')}`, suggestedAction: 'Add sample rows to remaining worksheets for validation', sourceRuleIds: [] };
      }
      return { status: 'missing', evidence: null, gapDescription: 'No worksheets have sample data', suggestedAction: 'Provide sample data rows for each worksheet to validate formulas', sourceRuleIds: [] };
    },
  },

  // ── Employee Assumptions (5) ────────────────────────────

  {
    id: 'employee-assumptions.quota-defined',
    name: 'Quota targets defined',
    category: 'employee-assumptions',
    priority: 'required',
    run: (ctx) => {
      const quotaCols = ctx.config.employeeAssumptionColumns.filter(c => /quota/i.test(c.concept) || /quota|target/i.test(c.name));
      const quotaRules = rulesByConcept(ctx.rules, 'quota-target');
      if (quotaCols.length > 0 || quotaRules.length > 0) {
        return { status: 'complete', evidence: `${quotaCols.length} quota columns, ${quotaRules.length} quota rules`, gapDescription: null, suggestedAction: null, sourceRuleIds: quotaRules.map(r => r.id) };
      }
      return { status: 'missing', evidence: null, gapDescription: 'No quota/target definitions found', suggestedAction: 'Define quota targets per employee or role in employee assumptions', sourceRuleIds: [] };
    },
  },
  {
    id: 'employee-assumptions.tsi-defined',
    name: 'TSI/OTE/variable comp defined',
    category: 'employee-assumptions',
    priority: 'required',
    run: (ctx) => {
      const tsiCols = ctx.config.employeeAssumptionColumns.filter(c =>
        /tsi|ote|variable|incentive/i.test(c.concept) || /tsi|ote|variable/i.test(c.name)
      );
      if (tsiCols.length > 0) {
        return { status: 'complete', evidence: `TSI/OTE columns: ${tsiCols.map(c => c.name).join(', ')}`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      // Check if derivable from other data
      const hasBase = ctx.config.employeeAssumptionColumns.some(c => /base|salary/i.test(c.name));
      if (hasBase) {
        return { status: 'partial', evidence: 'Base salary found but no explicit TSI/OTE column', gapDescription: 'TSI/OTE not explicitly defined — may be derivable from base + quota', suggestedAction: 'Add explicit TSI (Total Sales Incentive) or OTE (On-Target Earnings) column', sourceRuleIds: [] };
      }
      return { status: 'missing', evidence: null, gapDescription: 'No TSI, OTE, or variable compensation target found', suggestedAction: 'Define TSI or OTE amounts per employee/role', sourceRuleIds: [] };
    },
  },
  {
    id: 'employee-assumptions.base-rate-derivable',
    name: 'Base commission rate derivable',
    category: 'employee-assumptions',
    priority: 'recommended',
    run: (ctx) => {
      const rateCols = ctx.config.employeeAssumptionColumns.filter(c =>
        /rate|commission/i.test(c.name) && /percent|rate/i.test(c.type || c.concept)
      );
      const rateRules = rulesByConcept(ctx.rules, 'rate-table');
      if (rateCols.length > 0 || rateRules.length > 0) {
        return { status: 'complete', evidence: `Rate derivable from ${rateCols.length} columns + ${rateRules.length} rate rules`, gapDescription: null, suggestedAction: null, sourceRuleIds: rateRules.map(r => r.id) };
      }
      return { status: 'partial', evidence: null, gapDescription: 'No explicit base commission rate found', suggestedAction: 'Verify base commission rate is derivable from TSI/quota or provide explicit rate column', sourceRuleIds: [] };
    },
  },
  {
    id: 'employee-assumptions.all-roles-covered',
    name: 'All roles have assumptions',
    category: 'employee-assumptions',
    priority: 'required',
    run: (ctx) => {
      const roles = distinctRoles(ctx.rules);
      if (roles.length === 0) {
        return { status: 'not-applicable', evidence: 'No distinct roles identified', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      // Check if assumption columns reference roles or have per-role values
      const assumptionText = ctx.config.employeeAssumptionColumns.map(c => `${c.name} ${c.description} ${c.exampleValue || ''}`).join(' ');
      const coveredRoles = roles.filter(r => new RegExp(r, 'i').test(assumptionText));
      if (coveredRoles.length >= roles.length) {
        return { status: 'complete', evidence: `All ${roles.length} roles covered in assumptions`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      if (coveredRoles.length > 0) {
        const missing = roles.filter(r => !coveredRoles.includes(r));
        return { status: 'partial', evidence: `${coveredRoles.length}/${roles.length} roles covered`, gapDescription: `Missing assumptions for: ${missing.join(', ')}`, suggestedAction: `Provide quota/TSI/rate assumptions for: ${missing.join(', ')}`, sourceRuleIds: [] };
      }
      return { status: 'missing', evidence: `${roles.length} roles found but no role-specific assumptions`, gapDescription: 'Employee assumptions not broken down by role', suggestedAction: `Define per-role assumptions for: ${roles.join(', ')}`, sourceRuleIds: [] };
    },
  },
  {
    id: 'employee-assumptions.no-missing-values',
    name: 'No TBD/placeholder values',
    category: 'employee-assumptions',
    priority: 'recommended',
    run: (ctx) => {
      const placeholders: string[] = [];
      for (const col of ctx.config.employeeAssumptionColumns) {
        if (hasPlaceholder(col.exampleValue)) placeholders.push(`${col.name}: "${col.exampleValue}"`);
        if (hasPlaceholder(col.description)) placeholders.push(`${col.name} desc: "${col.description}"`);
      }
      if (placeholders.length === 0) {
        return { status: 'complete', evidence: 'No placeholder values in assumptions', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return { status: 'partial', evidence: `${placeholders.length} placeholders found`, gapDescription: placeholders.join('; '), suggestedAction: 'Replace placeholder values with actual data', sourceRuleIds: [] };
    },
  },

  // ── Global Attributes (4) ──────────────────────────────

  {
    id: 'global-attributes.territory-mapping',
    name: 'Territory mapping defined',
    category: 'global-attributes',
    priority: 'recommended',
    run: (ctx) => {
      const territoryRules = rulesByConcept(ctx.rules, 'territory');
      const territoryAttrs = ctx.config.attributeWorksheets.filter(a => /territory|geo|region/i.test(a.concept) || /territory/i.test(a.name));
      if (territoryAttrs.length > 0 || territoryRules.length > 0) {
        return { status: 'complete', evidence: `${territoryAttrs.length} territory worksheets, ${territoryRules.length} territory rules`, gapDescription: null, suggestedAction: null, sourceRuleIds: territoryRules.map(r => r.id) };
      }
      // Check if territory is referenced at all
      const mentionsTerritory = ctx.rules.some(r => /territory|geo|region/i.test(r.description));
      if (!mentionsTerritory) {
        return { status: 'not-applicable', evidence: 'No territory references in plan', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return { status: 'missing', evidence: 'Territory referenced in rules but no mapping defined', gapDescription: 'Rules reference territories but no territory mapping worksheet exists', suggestedAction: 'Create a territory mapping attribute worksheet', sourceRuleIds: territoryRules.map(r => r.id) };
    },
  },
  {
    id: 'global-attributes.partner-mapping',
    name: 'Partner/channel mapping',
    category: 'global-attributes',
    priority: 'optional',
    run: (ctx) => {
      const hasPartnerRefs = ctx.rules.some(r => /partner|channel|reseller|indirect/i.test(r.description));
      if (!hasPartnerRefs) {
        return { status: 'not-applicable', evidence: 'No partner/channel references', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      const partnerAttrs = ctx.config.attributeWorksheets.filter(a => /partner|channel/i.test(a.concept) || /partner|channel/i.test(a.name));
      if (partnerAttrs.length > 0) {
        return { status: 'complete', evidence: `Partner worksheets: ${partnerAttrs.map(a => a.name).join(', ')}`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return { status: 'missing', evidence: 'Partner/channel referenced but no mapping', gapDescription: 'Plan mentions partners but no partner mapping worksheet defined', suggestedAction: 'Create partner/channel mapping attribute worksheet', sourceRuleIds: [] };
    },
  },
  {
    id: 'global-attributes.product-mapping',
    name: 'Product mapping defined',
    category: 'global-attributes',
    priority: 'recommended',
    run: (ctx) => {
      const hasProductRefs = ctx.rules.some(r => /product|sku|service|solution|offering/i.test(r.description));
      if (!hasProductRefs) {
        return { status: 'not-applicable', evidence: 'No product references', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      const productAttrs = ctx.config.attributeWorksheets.filter(a => /product|sku|catalog/i.test(a.concept) || /product/i.test(a.name));
      const productWorksheets = ctx.config.dataWorksheets.filter(d => /product/i.test(d.concept) || /product/i.test(d.name));
      if (productAttrs.length > 0 || productWorksheets.length > 0) {
        return { status: 'complete', evidence: `Product data: ${[...productAttrs, ...productWorksheets].map(a => a.name).join(', ')}`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return { status: 'partial', evidence: 'Products referenced but no dedicated mapping', gapDescription: 'Rules reference products but no product mapping worksheet', suggestedAction: 'Create product mapping worksheet for rate differentiation', sourceRuleIds: [] };
    },
  },
  {
    id: 'global-attributes.role-hierarchy',
    name: 'Role/org hierarchy defined',
    category: 'global-attributes',
    priority: 'recommended',
    run: (ctx) => {
      const roles = distinctRoles(ctx.rules);
      if (roles.length <= 1) {
        return { status: 'not-applicable', evidence: 'Single role plan, no hierarchy needed', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      const hierarchyAttrs = ctx.config.attributeWorksheets.filter(a => /hierarchy|org|manager|reporting/i.test(a.concept));
      const mentionsHierarchy = ctx.synthesis.insights && /hierarchy|manager|report|roll[- ]?up/i.test(ctx.synthesis.insights);
      if (hierarchyAttrs.length > 0) {
        return { status: 'complete', evidence: `Hierarchy worksheets: ${hierarchyAttrs.map(a => a.name).join(', ')}`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      if (mentionsHierarchy) {
        return { status: 'partial', evidence: 'Hierarchy referenced in insights but no formal structure', gapDescription: 'Manager/hierarchy references exist but no formal hierarchy worksheet', suggestedAction: 'Create org hierarchy attribute worksheet for roll-up calculations', sourceRuleIds: [] };
      }
      return { status: 'partial', evidence: `${roles.length} roles but no hierarchy defined`, gapDescription: 'Multiple roles without explicit hierarchy', suggestedAction: 'Define reporting hierarchy for multi-role plan', sourceRuleIds: [] };
    },
  },

  // ── Formulas / SmartGrid (7) ────────────────────────────

  {
    id: 'formulas.commission-calc',
    name: 'Commission calculation logic',
    category: 'formulas',
    priority: 'required',
    run: (ctx) => {
      const commFormulas = ctx.config.formulaRecommendations.filter(f => /commission|rate|payout|earning/i.test(f.concept));
      const rateRules = rulesByConcept(ctx.rules, 'rate-table');
      if (commFormulas.length > 0 && rateRules.length > 0) {
        return { status: 'complete', evidence: `${commFormulas.length} commission formulas, ${rateRules.length} rate rules`, gapDescription: null, suggestedAction: null, sourceRuleIds: rateRules.map(r => r.id) };
      }
      if (commFormulas.length > 0 || rateRules.length > 0) {
        return { status: 'partial', evidence: `Formulas: ${commFormulas.length}, Rate rules: ${rateRules.length}`, gapDescription: 'Commission logic partially defined', suggestedAction: 'Ensure rate tables have corresponding formula recommendations', sourceRuleIds: rateRules.map(r => r.id) };
      }
      return { status: 'missing', evidence: null, gapDescription: 'No commission calculation logic found', suggestedAction: 'Define commission calculation formula using rate tables and attainment', sourceRuleIds: [] };
    },
  },
  {
    id: 'formulas.attainment-calc',
    name: 'Attainment calculation defined',
    category: 'formulas',
    priority: 'required',
    run: (ctx) => {
      const attFormulas = ctx.config.formulaRecommendations.filter(f => /attainment|achievement|percent|quota/i.test(f.concept) || /attainment/i.test(f.description));
      const quotaRules = rulesByConcept(ctx.rules, 'quota-target');
      if (attFormulas.length > 0) {
        return { status: 'complete', evidence: `Attainment formulas: ${attFormulas.map(f => f.concept).join(', ')}`, gapDescription: null, suggestedAction: null, sourceRuleIds: quotaRules.map(r => r.id) };
      }
      if (quotaRules.length > 0) {
        return { status: 'partial', evidence: 'Quotas defined but no explicit attainment formula', gapDescription: 'Quota targets exist but attainment calculation formula not specified', suggestedAction: 'Add attainment formula: Attainment % = Actual Revenue / Quota Target', sourceRuleIds: quotaRules.map(r => r.id) };
      }
      return { status: 'missing', evidence: null, gapDescription: 'No attainment calculation — need quotas and achievement formula', suggestedAction: 'Define quota targets and attainment formula', sourceRuleIds: [] };
    },
  },
  {
    id: 'formulas.accelerator',
    name: 'Accelerator/decelerator logic',
    category: 'formulas',
    priority: 'recommended',
    run: (ctx) => {
      const accelRules = [...rulesByConcept(ctx.rules, 'accelerator'), ...rulesByConcept(ctx.rules, 'decelerator')];
      if (accelRules.length === 0) {
        // Check if plan mentions accelerators
        const mentions = ctx.rules.some(r => /accelerat|deceler|kicker|multiplier/i.test(r.description));
        if (!mentions) return { status: 'not-applicable', evidence: 'No accelerator/decelerator in plan', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
        return { status: 'missing', evidence: 'Accelerator mentioned but no rules extracted', gapDescription: 'Plan mentions accelerators but no structured rules found', suggestedAction: 'Define accelerator tiers with multipliers and thresholds', sourceRuleIds: [] };
      }
      const accelFormulas = ctx.config.formulaRecommendations.filter(f => /accelerat|deceler|multiplier/i.test(f.concept));
      if (accelFormulas.length > 0) {
        return { status: 'complete', evidence: `${accelRules.length} accel rules + ${accelFormulas.length} formulas`, gapDescription: null, suggestedAction: null, sourceRuleIds: accelRules.map(r => r.id) };
      }
      return { status: 'partial', evidence: `${accelRules.length} rules but no formula recommendation`, gapDescription: 'Accelerator rules exist but no formula recommendation', suggestedAction: 'Add formula recommendation for accelerator calculation', sourceRuleIds: accelRules.map(r => r.id) };
    },
  },
  {
    id: 'formulas.qualifier-gates',
    name: 'Qualifier/gate logic',
    category: 'formulas',
    priority: 'recommended',
    run: (ctx) => {
      const qualRules = rulesByConcept(ctx.rules, 'qualifier');
      if (qualRules.length === 0) {
        const mentions = ctx.rules.some(r => /qualifier|gate|eligib|prerequisite/i.test(r.description));
        if (!mentions) return { status: 'not-applicable', evidence: 'No qualifiers in plan', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
        return { status: 'missing', evidence: 'Qualifiers mentioned but not extracted', gapDescription: 'Plan mentions qualifiers/gates but no rules found', suggestedAction: 'Define qualifier conditions and their effect on payouts', sourceRuleIds: [] };
      }
      return { status: 'complete', evidence: `${qualRules.length} qualifier rules`, gapDescription: null, suggestedAction: null, sourceRuleIds: qualRules.map(r => r.id) };
    },
  },
  {
    id: 'formulas.clawback',
    name: 'Clawback logic',
    category: 'formulas',
    priority: 'optional',
    run: (ctx) => {
      const clawRules = rulesByConcept(ctx.rules, 'clawback');
      if (clawRules.length === 0) {
        const mentions = ctx.rules.some(r => /clawback|claw[- ]back|chargeback|reversal/i.test(r.description));
        if (!mentions) return { status: 'not-applicable', evidence: 'No clawback in plan', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
        return { status: 'missing', evidence: 'Clawback mentioned but no rules', gapDescription: 'Plan mentions clawback but no structured rules', suggestedAction: 'Define clawback period, conditions, and calculation method', sourceRuleIds: [] };
      }
      return { status: 'complete', evidence: `${clawRules.length} clawback rules`, gapDescription: null, suggestedAction: null, sourceRuleIds: clawRules.map(r => r.id) };
    },
  },
  {
    id: 'formulas.cap-floor',
    name: 'Cap/floor limits defined',
    category: 'formulas',
    priority: 'recommended',
    run: (ctx) => {
      const capRules = [...rulesByConcept(ctx.rules, 'cap'), ...rulesByConcept(ctx.rules, 'floor')];
      if (capRules.length === 0) {
        const mentions = ctx.rules.some(r => /\bcap\b|floor|ceiling|maximum|minimum.*payout/i.test(r.description));
        if (!mentions) return { status: 'not-applicable', evidence: 'No caps/floors in plan', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
        return { status: 'missing', evidence: 'Cap/floor mentioned but no rules', gapDescription: 'Plan references caps/floors but no structured rules', suggestedAction: 'Define cap and floor amounts per role/component', sourceRuleIds: [] };
      }
      return { status: 'complete', evidence: `${capRules.length} cap/floor rules`, gapDescription: null, suggestedAction: null, sourceRuleIds: capRules.map(r => r.id) };
    },
  },
  {
    id: 'formulas.crediting-basis',
    name: 'Crediting basis defined',
    category: 'formulas',
    priority: 'required',
    run: (ctx) => {
      // Look for crediting/basis references
      const creditFormulas = ctx.config.formulaRecommendations.filter(f => /credit|basis|issued|installed|booked|recognized/i.test(f.concept) || /credit|basis/i.test(f.description));
      const mentions = ctx.rules.some(r => /credit|basis|issued|installed|booked|recognized|revenue recognition/i.test(r.description));
      if (creditFormulas.length > 0) {
        return { status: 'complete', evidence: `Crediting: ${creditFormulas.map(f => f.concept).join(', ')}`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      if (mentions) {
        return { status: 'partial', evidence: 'Crediting referenced in rules but no explicit formula', gapDescription: 'Crediting basis mentioned but not formally defined', suggestedAction: 'Explicitly define crediting basis (booked, recognized, installed, etc.)', sourceRuleIds: [] };
      }
      return { status: 'missing', evidence: null, gapDescription: 'No crediting basis defined — unclear when revenue is credited', suggestedAction: 'Define crediting basis: when does a transaction count toward commission (booked? installed? recognized?)', sourceRuleIds: [] };
    },
  },

  // ── Payouts (3) ─────────────────────────────────────────

  {
    id: 'payouts.processing-period',
    name: 'Processing period defined',
    category: 'payouts',
    priority: 'required',
    run: (ctx) => {
      if (ctx.config.planStructure.periodType) {
        return { status: 'complete', evidence: `Period: ${ctx.config.planStructure.periodType}`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return { status: 'missing', evidence: null, gapDescription: 'No processing period defined', suggestedAction: 'Specify monthly, quarterly, or annual processing period', sourceRuleIds: [] };
    },
  },
  {
    id: 'payouts.payment-timing',
    name: 'Payment timing/frequency',
    category: 'payouts',
    priority: 'recommended',
    run: (ctx) => {
      const mentions = /payment|payout\s+(frequency|timing|schedule)|pay\s+date|payroll/i.test(
        ctx.rules.map(r => r.description).join(' ') + ' ' + ctx.synthesis.insights + ' ' + (ctx.config.planStructure.notes || '')
      );
      if (mentions) {
        return { status: 'complete', evidence: 'Payment timing referenced in plan data', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return { status: 'partial', evidence: null, gapDescription: 'No explicit payment timing defined', suggestedAction: 'Specify when commissions are paid (with payroll? separate cycle? arrears?)', sourceRuleIds: [] };
    },
  },
  {
    id: 'payouts.payout-components',
    name: 'Components map to plan',
    category: 'payouts',
    priority: 'recommended',
    run: (ctx) => {
      const comps = ctx.config.planStructure.payoutComponents;
      if (!comps || comps.length === 0) {
        return { status: 'missing', evidence: null, gapDescription: 'No payout components defined', suggestedAction: 'Define payout components', sourceRuleIds: [] };
      }
      // Check if components have corresponding formulas
      const formulaConcepts = ctx.config.formulaRecommendations.map(f => f.concept.toLowerCase());
      const mapped = comps.filter(c => formulaConcepts.some(fc => fc.includes(c.toLowerCase()) || c.toLowerCase().includes(fc)));
      if (mapped.length >= comps.length) {
        return { status: 'complete', evidence: `All ${comps.length} components have formula coverage`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      if (mapped.length > 0) {
        return { status: 'partial', evidence: `${mapped.length}/${comps.length} components mapped to formulas`, gapDescription: `Unmapped components: ${comps.filter(c => !mapped.includes(c)).join(', ')}`, suggestedAction: 'Add formula recommendations for all payout components', sourceRuleIds: [] };
      }
      return { status: 'partial', evidence: `${comps.length} components defined but no formula mapping`, gapDescription: 'Components exist but no formulas map to them', suggestedAction: 'Create formula recommendations that reference payout components', sourceRuleIds: [] };
    },
  },

  // ── Organization (3) ────────────────────────────────────

  {
    id: 'organization.roles-identified',
    name: 'Roles identified',
    category: 'organization',
    priority: 'required',
    run: (ctx) => {
      const roles = distinctRoles(ctx.rules);
      if (roles.length > 0) {
        return { status: 'complete', evidence: `Roles: ${roles.join(', ')}`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return { status: 'missing', evidence: null, gapDescription: 'No distinct roles identified in rules', suggestedAction: 'Identify which roles/titles are covered by this plan', sourceRuleIds: [] };
    },
  },
  {
    id: 'organization.hierarchy',
    name: 'Management hierarchy',
    category: 'organization',
    priority: 'recommended',
    run: (ctx) => {
      const roles = distinctRoles(ctx.rules);
      if (roles.length <= 1) {
        return { status: 'not-applicable', evidence: 'Single role, no hierarchy needed', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      const hasMgmt = roles.some(r => /manager|director|vp|lead|head/i.test(r));
      const hierarchyMentioned = /hierarchy|reporting|roll[- ]?up|manager/i.test(ctx.synthesis.insights || '');
      if (hasMgmt && hierarchyMentioned) {
        return { status: 'partial', evidence: `Management roles found: ${roles.filter(r => /manager|director|vp|lead|head/i.test(r)).join(', ')}`, gapDescription: 'Management roles exist but formal hierarchy not structured', suggestedAction: 'Define formal reporting hierarchy for roll-up calculations', sourceRuleIds: [] };
      }
      if (hasMgmt) {
        return { status: 'partial', evidence: 'Management roles detected but hierarchy not defined', gapDescription: 'Roles include management levels but no hierarchy structure', suggestedAction: 'Create hierarchy: who reports to whom, for roll-up calculations', sourceRuleIds: [] };
      }
      return { status: 'not-applicable', evidence: 'No management roles detected', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
    },
  },
  {
    id: 'organization.user-groups',
    name: 'User groups/segments',
    category: 'organization',
    priority: 'optional',
    run: (ctx) => {
      const mentions = ctx.rules.some(r => /group|segment|team|division|channel|business\s+unit/i.test(r.description));
      const groupAttrs = ctx.config.attributeWorksheets.filter(a => /group|segment|team|division/i.test(a.concept));
      if (!mentions && groupAttrs.length === 0) {
        return { status: 'not-applicable', evidence: 'No user group/segment references', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      if (groupAttrs.length > 0) {
        return { status: 'complete', evidence: `Groups: ${groupAttrs.map(a => a.name).join(', ')}`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return { status: 'partial', evidence: 'Groups referenced but no dedicated attribute', gapDescription: 'User groups mentioned but no structured group mapping', suggestedAction: 'Create user group/segment attribute worksheet', sourceRuleIds: [] };
    },
  },

  // ── Data Quality (5) ────────────────────────────────────

  {
    id: 'data-quality.no-placeholders',
    name: 'No placeholder values',
    category: 'data-quality',
    priority: 'required',
    run: (ctx) => {
      const allPlaceholders: { ruleId: string; path: string }[] = [];
      for (const rule of ctx.rules) {
        const hits = scanForPlaceholders(rule.parameters);
        for (const h of hits) allPlaceholders.push({ ruleId: rule.id, path: h });
      }
      if (allPlaceholders.length === 0) {
        return { status: 'complete', evidence: 'No placeholder values found', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      const byRule = new Map<string, string[]>();
      for (const p of allPlaceholders) {
        if (!byRule.has(p.ruleId)) byRule.set(p.ruleId, []);
        byRule.get(p.ruleId)!.push(p.path);
      }
      const details = [...byRule.entries()].map(([id, paths]) => `${id}: ${paths.join(', ')}`).join('; ');
      return {
        status: allPlaceholders.length > 3 ? 'missing' : 'partial',
        evidence: `${allPlaceholders.length} placeholders in ${byRule.size} rules`,
        gapDescription: details.slice(0, 300),
        suggestedAction: `Resolve ${allPlaceholders.length} placeholder values with actual data`,
        sourceRuleIds: [...byRule.keys()],
      };
    },
  },
  {
    id: 'data-quality.no-contradictions',
    name: 'No rule contradictions',
    category: 'data-quality',
    priority: 'required',
    run: (ctx) => {
      if (!ctx.validation) {
        // Check synthesis conflicts instead
        if (ctx.synthesis.conflicts.length === 0) {
          return { status: 'complete', evidence: 'No conflicts in synthesis', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
        }
        return {
          status: 'partial',
          evidence: `${ctx.synthesis.conflicts.length} conflicts detected`,
          gapDescription: ctx.synthesis.conflicts.map(c => c.description).join('; ').slice(0, 300),
          suggestedAction: 'Review and resolve rule conflicts',
          sourceRuleIds: ctx.synthesis.conflicts.flatMap(c => c.ruleIds),
        };
      }
      const contradictions = ctx.validation.flaggedRules.filter(f => f.severity === 'contradiction');
      if (contradictions.length === 0) {
        return { status: 'complete', evidence: 'No contradictions flagged in validation', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return {
        status: 'missing',
        evidence: `${contradictions.length} contradictions`,
        gapDescription: contradictions.map(c => `${c.ruleId}: ${c.reason}`).join('; ').slice(0, 300),
        suggestedAction: 'Resolve contradicting rules before building',
        sourceRuleIds: contradictions.map(c => c.ruleId),
      };
    },
  },
  {
    id: 'data-quality.cross-refs-resolved',
    name: 'Cross-references resolved',
    category: 'data-quality',
    priority: 'recommended',
    run: (ctx) => {
      const refs = ctx.synthesis.crossReferences;
      if (refs.length === 0) {
        return { status: 'complete', evidence: 'No cross-references (single-file plan)', gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      // All cross-references are "resolved" if they were produced during synthesis
      return { status: 'complete', evidence: `${refs.length} cross-references established`, gapDescription: null, suggestedAction: null, sourceRuleIds: refs.map(r => r.ruleId) };
    },
  },
  {
    id: 'data-quality.low-confidence',
    name: 'No low-confidence rules',
    category: 'data-quality',
    priority: 'required',
    run: (ctx) => {
      const lowConf = ctx.rules.filter(r => r.confidence < 0.7);
      if (lowConf.length === 0) {
        return { status: 'complete', evidence: `All ${ctx.rules.length} rules >= 0.7 confidence`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return {
        status: lowConf.length > 3 ? 'missing' : 'partial',
        evidence: `${lowConf.length} rules below 0.7 confidence`,
        gapDescription: lowConf.map(r => `${r.id} (${r.confidence}): ${r.description.slice(0, 60)}`).join('; '),
        suggestedAction: 'Review low-confidence rules — provide clearer source data or confirm correctness',
        sourceRuleIds: lowConf.map(r => r.id),
      };
    },
  },
  {
    id: 'data-quality.source-verified',
    name: 'Source data verified',
    category: 'data-quality',
    priority: 'recommended',
    run: (ctx) => {
      if (!ctx.validation) {
        return { status: 'partial', evidence: 'Validation not yet run', gapDescription: 'Pass 3 validation has not been completed', suggestedAction: 'Run pipeline validation pass', sourceRuleIds: [] };
      }
      const rateChecks = ctx.validation.checks.filter(c => /rate|accuracy|source/i.test(c.name));
      const failedChecks = rateChecks.filter(c => !c.passed);
      if (rateChecks.length === 0) {
        return { status: 'partial', evidence: 'No source verification checks in validation', gapDescription: 'Validation did not include source accuracy checks', suggestedAction: 'Verify extracted values match original source documents', sourceRuleIds: [] };
      }
      if (failedChecks.length === 0) {
        return { status: 'complete', evidence: `${rateChecks.length} source checks passed`, gapDescription: null, suggestedAction: null, sourceRuleIds: [] };
      }
      return {
        status: 'partial',
        evidence: `${failedChecks.length}/${rateChecks.length} source checks failed`,
        gapDescription: failedChecks.map(c => `${c.name}: ${c.details}`).join('; ').slice(0, 300),
        suggestedAction: 'Review and correct source data mismatches',
        sourceRuleIds: [],
      };
    },
  },
];

// ── Category display names ────────────────────────────────

const categoryDisplayNames: Record<ChecklistCategory, string> = {
  'plan-setup': 'Plan Setup',
  'data-workbooks': 'Data Workbooks',
  'employee-assumptions': 'Employee Assumptions',
  'global-attributes': 'Global Attributes',
  'formulas': 'Formulas / SmartGrid',
  'payouts': 'Payouts',
  'organization': 'Organization',
  'data-quality': 'Data Quality',
};

// ── Scoring weights ───────────────────────────────────────

const priorityWeights: Record<string, number> = {
  required: 3,
  recommended: 2,
  optional: 1,
};

const statusScores: Record<string, number> = {
  complete: 1.0,
  partial: 0.5,
  missing: 0.0,
  'not-applicable': -1, // excluded
};

// ── Main analyzer ─────────────────────────────────────────

export function analyzeCompleteness(
  synthesis: SynthesisResult,
  validation: ValidationResult | null,
): CompletenessResult {
  const ctx: CheckContext = {
    rules: synthesis.rules,
    config: synthesis.captivateiqConfig,
    synthesis,
    validation,
  };

  // Run all checks
  const items: ChecklistItem[] = checks.map(check => {
    const output = check.run(ctx);
    return {
      id: check.id,
      name: check.name,
      category: check.category,
      priority: check.priority,
      ...output,
    };
  });

  // Build category summaries
  const categories = [...new Set(checks.map(c => c.category))] as ChecklistCategory[];
  const categorySummaries: CategorySummary[] = categories.map(cat => {
    const catItems = items.filter(i => i.category === cat && i.status !== 'not-applicable');
    const total = catItems.length;
    const complete = catItems.filter(i => i.status === 'complete').length;
    const partial = catItems.filter(i => i.status === 'partial').length;
    const missing = catItems.filter(i => i.status === 'missing').length;
    return {
      category: cat,
      displayName: categoryDisplayNames[cat],
      total,
      complete,
      partial,
      missing,
      completionPercent: total > 0 ? Math.round(((complete + partial * 0.5) / total) * 100) : 100,
    };
  });

  // Calculate weighted overall score
  let weightedSum = 0;
  let weightTotal = 0;
  for (const item of items) {
    const score = statusScores[item.status];
    if (score < 0) continue; // skip n/a
    const weight = priorityWeights[item.priority];
    weightedSum += weight * score;
    weightTotal += weight;
  }
  const overallReadiness = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) : 0;

  // Identify blockers (required + missing/partial)
  const blockers = items.filter(i => i.priority === 'required' && (i.status === 'missing' || i.status === 'partial'));

  // Identify quick wins (partial items — close to complete)
  const quickWins = items.filter(i => i.status === 'partial' && i.priority !== 'required');

  // Counts
  const counts = {
    total: items.length,
    complete: items.filter(i => i.status === 'complete').length,
    partial: items.filter(i => i.status === 'partial').length,
    missing: items.filter(i => i.status === 'missing').length,
    notApplicable: items.filter(i => i.status === 'not-applicable').length,
  };

  return {
    analyzedAt: new Date().toISOString(),
    overallReadiness,
    categorySummaries,
    items,
    blockers,
    quickWins,
    counts,
  };
}
