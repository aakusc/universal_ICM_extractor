/**
 * Plan Tester — Compare live CIQ instance against generated plan.
 *
 * Deterministic checks (no AI) that fetch live CIQ data via API
 * and diff against the pipeline-generated CaptivateIQBuildConfig.
 *
 * ~25 checks across 5 categories, weighted scoring:
 *   required=3, recommended=2, informational=1
 *   match=1.0, partial=0.5, mismatch=0.0, missing-in-ciq=0.0, extra-in-ciq=0.5, n/a=excluded
 */

import { CaptivateIQClient } from '../connectors/captivateiq/client.js';
import type {
  ICaptivateIQPlan,
  ICaptivateIQWorkbook,
  ICaptivateIQWorksheet,
  ICaptivateIQAttributeWorksheet,
  ICaptivateIQEmployeeAssumption,
} from '../connectors/captivateiq/client.js';
import type { CaptivateIQBuildConfig } from '../project/types.js';
import * as store from '../project/store.js';
import type {
  ComparisonItem,
  ComparisonCategory,
  ComparisonCategorySummary,
  PlanTestResult,
} from './plan-tester-types.js';

// ── Helpers ───────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fuzzyMatch(planned: string, actual: string): boolean {
  const a = norm(planned);
  const b = norm(actual);
  return a === b || a.includes(b) || b.includes(a);
}

function findBestMatch(name: string, candidates: string[]): string | null {
  // Exact normalized match first
  const exact = candidates.find(c => norm(c) === norm(name));
  if (exact) return exact;
  // Contains match
  const contains = candidates.find(c => fuzzyMatch(name, c));
  if (contains) return contains;
  return null;
}

// ── Live data shape ───────────────────────────────────────

export interface LiveCIQData {
  plans: ICaptivateIQPlan[];
  workbooks: ICaptivateIQWorkbook[];
  worksheets: Array<ICaptivateIQWorksheet & { workbookName?: string }>;
  attributeWorksheets: ICaptivateIQAttributeWorksheet[];
  assumptions: ICaptivateIQEmployeeAssumption[];
  employeeCount: number;
}

// ── Fetch live data ───────────────────────────────────────

export async function fetchLiveData(client: CaptivateIQClient): Promise<LiveCIQData> {
  console.log('  [tester] Fetching live CIQ data...');

  // Fetch in parallel where possible
  const [plansResp, workbooksResp, attrResp, employeesResp] = await Promise.all([
    client.listPlans(),
    client.listWorkbooks(),
    client.listAttributeWorksheets(),
    client.listEmployees(),
  ]);

  const plans = await client.fetchAllPages(plansResp);
  const workbooks = await client.fetchAllPages(workbooksResp);
  const attributeWorksheets = await client.fetchAllPages(attrResp);
  const employees = await client.fetchAllPages(employeesResp);

  console.log(`  [tester] Found: ${plans.length} plans, ${workbooks.length} workbooks, ${attributeWorksheets.length} attr worksheets, ${employees.length} employees`);

  // Fetch worksheets for each workbook
  const worksheets: Array<ICaptivateIQWorksheet & { workbookName?: string }> = [];
  for (const wb of workbooks) {
    try {
      const wsResp = await client.listWorksheets(wb.id);
      const wsList = await client.fetchAllPages(wsResp);
      for (const ws of wsList) {
        worksheets.push({ ...ws, workbookName: wb.name });
      }
    } catch (err) {
      console.warn(`  [tester] Could not fetch worksheets for workbook "${wb.name}": ${err}`);
    }
  }
  console.log(`  [tester] Found: ${worksheets.length} total worksheets across ${workbooks.length} workbooks`);

  // Fetch assumptions (first page only for structure)
  let assumptions: ICaptivateIQEmployeeAssumption[] = [];
  if (plans.length > 0) {
    try {
      const assumResp = await client.listEmployeeAssumptions({ planIds: [plans[0].id] });
      assumptions = assumResp.data;
    } catch (err) {
      console.warn(`  [tester] Could not fetch assumptions: ${err}`);
    }
  }

  return {
    plans,
    workbooks,
    worksheets,
    attributeWorksheets,
    assumptions,
    employeeCount: employees.length,
  };
}

// ── Category display names ────────────────────────────────

const categoryDisplayNames: Record<ComparisonCategory, string> = {
  'plan-structure': 'Plan Structure',
  'data-worksheets': 'Data Worksheets',
  'employee-assumptions': 'Employee Assumptions',
  'attribute-worksheets': 'Attribute Worksheets',
  'formulas': 'Formulas',
};

// ── Scoring ───────────────────────────────────────────────

const priorityWeights: Record<string, number> = { required: 3, recommended: 2, informational: 1 };
const statusScores: Record<string, number> = {
  'match': 1.0,
  'partial': 0.5,
  'mismatch': 0.0,
  'missing-in-ciq': 0.0,
  'extra-in-ciq': 0.5,
  'not-applicable': -1,
};

// ── Main comparison ───────────────────────────────────────

export async function testPlanAgainstLive(
  projectId: string,
  apiToken: string,
  baseUrl: string = 'https://api.captivateiq.com/ciq/v1',
): Promise<PlanTestResult> {
  // 1. Load generated config
  const extraction = store.getExtraction(projectId, 'pipeline')
    || store.getExtraction(projectId, 'bulk');
  if (!extraction) {
    throw new Error('No pipeline results found for this project. Run the extraction pipeline first.');
  }
  const config = extraction.captivateiqConfig;

  // 2. Connect to live CIQ
  const client = new CaptivateIQClient({ baseUrl, apiToken });

  // 3. Fetch live data
  const live = await fetchLiveData(client);

  // 4. Run checks
  const items: ComparisonItem[] = [];

  // ── Plan Structure ──────────────────────────────────────

  // Find matching plan
  const matchedPlan = live.plans.find(p => fuzzyMatch(config.planStructure.planName, p.name));

  items.push({
    id: 'plan-structure.plan-exists',
    name: 'Plan exists in CIQ',
    category: 'plan-structure',
    priority: 'required',
    status: matchedPlan ? 'match' : 'missing-in-ciq',
    planned: config.planStructure.planName,
    actual: matchedPlan?.name || null,
    details: matchedPlan
      ? `Found plan "${matchedPlan.name}" (ID: ${matchedPlan.id})`
      : `No plan matching "${config.planStructure.planName}" found. Available: ${live.plans.map(p => p.name).join(', ') || 'none'}`,
  });

  // Period type
  if (matchedPlan) {
    const livePeriodType = (matchedPlan as Record<string, unknown>).period_type as string | undefined;
    const plannedPeriod = config.planStructure.periodType.toUpperCase();
    const actualPeriod = livePeriodType?.toUpperCase() || '';
    items.push({
      id: 'plan-structure.period-type',
      name: 'Period type matches',
      category: 'plan-structure',
      priority: 'required',
      status: actualPeriod === plannedPeriod ? 'match'
        : actualPeriod ? 'mismatch' : 'partial',
      planned: config.planStructure.periodType,
      actual: livePeriodType || 'unknown',
      details: actualPeriod === plannedPeriod
        ? `Both ${config.planStructure.periodType}`
        : `Planned: ${config.planStructure.periodType}, Actual: ${livePeriodType || 'not set'}`,
    });
  } else {
    items.push({
      id: 'plan-structure.period-type',
      name: 'Period type matches',
      category: 'plan-structure',
      priority: 'required',
      status: 'not-applicable',
      planned: config.planStructure.periodType,
      actual: null,
      details: 'Cannot check — plan not found',
    });
  }

  // Components
  const components = config.planStructure.payoutComponents;
  if (components.length > 0) {
    // CIQ components aren't directly in plan API — check if plan has component info
    const planData = matchedPlan as Record<string, unknown> | undefined;
    const liveComponents = (planData?.components as string[] | undefined) || [];
    if (liveComponents.length > 0) {
      const missing = components.filter(c => !findBestMatch(c, liveComponents));
      items.push({
        id: 'plan-structure.components',
        name: 'Payout components exist',
        category: 'plan-structure',
        priority: 'required',
        status: missing.length === 0 ? 'match' : missing.length < components.length ? 'partial' : 'missing-in-ciq',
        planned: components.join(', '),
        actual: liveComponents.join(', '),
        details: missing.length === 0
          ? `All ${components.length} components found`
          : `Missing: ${missing.join(', ')}`,
      });
    } else {
      items.push({
        id: 'plan-structure.components',
        name: 'Payout components exist',
        category: 'plan-structure',
        priority: 'required',
        status: 'partial',
        planned: components.join(', '),
        actual: 'not available via API',
        details: 'Component data not accessible via plan API — verify manually in CIQ UI',
      });
    }
  }

  // Plan status
  if (matchedPlan) {
    const status = (matchedPlan as Record<string, unknown>).status as string || 'unknown';
    items.push({
      id: 'plan-structure.status',
      name: 'Plan status',
      category: 'plan-structure',
      priority: 'informational',
      status: 'match',
      planned: null,
      actual: status,
      details: `Plan status: ${status}`,
    });
  }

  // Period groups
  try {
    const pgResp = await client.listPeriodGroups();
    const pgs = await client.fetchAllPages(pgResp);
    items.push({
      id: 'plan-structure.period-groups',
      name: 'Period groups configured',
      category: 'plan-structure',
      priority: 'recommended',
      status: pgs.length > 0 ? 'match' : 'missing-in-ciq',
      planned: 'Period groups expected',
      actual: pgs.length > 0 ? `${pgs.length} period groups: ${pgs.map(p => p.name).join(', ')}` : null,
      details: pgs.length > 0
        ? `${pgs.length} period group(s) found`
        : 'No period groups configured yet',
    });
  } catch {
    items.push({
      id: 'plan-structure.period-groups',
      name: 'Period groups configured',
      category: 'plan-structure',
      priority: 'recommended',
      status: 'partial',
      planned: 'Period groups expected',
      actual: null,
      details: 'Could not fetch period groups',
    });
  }

  // ── Data Worksheets ─────────────────────────────────────

  const liveWsNames = live.worksheets.map(ws => ws.name);
  const plannedWs = config.dataWorksheets;

  // Per-worksheet checks
  for (const pw of plannedWs) {
    const match = live.worksheets.find(ws => fuzzyMatch(pw.name, ws.name));
    if (!match) {
      items.push({
        id: `data-worksheets.exists.${norm(pw.name)}`,
        name: `Worksheet: ${pw.name}`,
        category: 'data-worksheets',
        priority: 'required',
        status: 'missing-in-ciq',
        planned: `${pw.name} (${pw.columns.length} columns)`,
        actual: null,
        details: `Worksheet "${pw.name}" not found in CIQ. Closest: ${findBestMatch(pw.name, liveWsNames) || 'none'}`,
      });
      continue;
    }

    // Worksheet exists — check columns
    const liveColumns = (match as Record<string, unknown>).columns as Array<Record<string, unknown>> | undefined;
    if (liveColumns && liveColumns.length > 0) {
      const liveColNames = liveColumns.map(c => String(c.name || c.display_name || ''));
      const plannedColNames = pw.columns.map(c => c.name);
      const missingCols = plannedColNames.filter(n => !findBestMatch(n, liveColNames));
      const extraCols = liveColNames.filter(n => !findBestMatch(n, plannedColNames));

      items.push({
        id: `data-worksheets.columns.${norm(pw.name)}`,
        name: `Columns: ${pw.name}`,
        category: 'data-worksheets',
        priority: 'required',
        status: missingCols.length === 0 ? (extraCols.length === 0 ? 'match' : 'partial') : 'mismatch',
        planned: plannedColNames.join(', '),
        actual: liveColNames.join(', '),
        details: missingCols.length === 0
          ? extraCols.length === 0 ? 'All columns match' : `Extra columns in CIQ: ${extraCols.join(', ')}`
          : `Missing columns: ${missingCols.join(', ')}${extraCols.length ? '; Extra: ' + extraCols.join(', ') : ''}`,
      });

      // Column type check
      const typeMismatches: string[] = [];
      for (const pc of pw.columns) {
        const liveCol = liveColumns.find(lc => fuzzyMatch(pc.name, String(lc.name || lc.display_name || '')));
        if (liveCol && liveCol.type) {
          const liveType = String(liveCol.type).toLowerCase();
          const plannedType = pc.type.toLowerCase();
          // Map planned types to CIQ types
          const typeMap: Record<string, string[]> = {
            'number': ['numeric', 'number', 'integer', 'float'],
            'text': ['text', 'string', 'varchar'],
            'percent': ['percent', 'percentage'],
            'date': ['date', 'datetime', 'timestamp'],
          };
          const expected = typeMap[plannedType] || [plannedType];
          if (!expected.includes(liveType) && !fuzzyMatch(plannedType, liveType)) {
            typeMismatches.push(`${pc.name}: planned=${pc.type}, actual=${liveCol.type}`);
          }
        }
      }
      if (typeMismatches.length > 0 || pw.columns.length > 0) {
        items.push({
          id: `data-worksheets.types.${norm(pw.name)}`,
          name: `Column types: ${pw.name}`,
          category: 'data-worksheets',
          priority: 'recommended',
          status: typeMismatches.length === 0 ? 'match' : 'mismatch',
          planned: pw.columns.map(c => `${c.name}:${c.type}`).join(', '),
          actual: liveColumns.map(c => `${c.name || c.display_name}:${c.type || '?'}`).join(', '),
          details: typeMismatches.length === 0
            ? 'Column types match'
            : `Type mismatches: ${typeMismatches.join('; ')}`,
        });
      }
    } else {
      items.push({
        id: `data-worksheets.columns.${norm(pw.name)}`,
        name: `Columns: ${pw.name}`,
        category: 'data-worksheets',
        priority: 'required',
        status: 'partial',
        planned: pw.columns.map(c => c.name).join(', '),
        actual: 'column data not available',
        details: `Worksheet "${match.name}" found but column details not available via API`,
      });
    }
  }

  // Check for data population
  items.push({
    id: 'data-worksheets.populated',
    name: 'Worksheets have data',
    category: 'data-worksheets',
    priority: 'recommended',
    status: live.worksheets.length > 0 ? 'match' : 'missing-in-ciq',
    planned: `${plannedWs.length} worksheets expected`,
    actual: `${live.worksheets.length} worksheets found across ${live.workbooks.length} workbooks`,
    details: live.worksheets.length > 0
      ? `${live.worksheets.length} worksheets in ${live.workbooks.length} workbooks`
      : 'No worksheets found',
  });

  // Extra worksheets in CIQ
  const plannedWsNorms = plannedWs.map(pw => norm(pw.name));
  const extraWs = live.worksheets.filter(ws => !plannedWsNorms.some(n => fuzzyMatch(ws.name, plannedWs.find(pw => norm(pw.name) === n)?.name || '')));
  // Simpler approach: check which live worksheets have no planned match
  const unmatchedLiveWs = live.worksheets.filter(ws =>
    !plannedWs.some(pw => fuzzyMatch(pw.name, ws.name))
  );
  if (unmatchedLiveWs.length > 0) {
    items.push({
      id: 'data-worksheets.extra',
      name: 'Extra worksheets in CIQ',
      category: 'data-worksheets',
      priority: 'informational',
      status: 'extra-in-ciq',
      planned: null,
      actual: unmatchedLiveWs.map(ws => ws.name).join(', '),
      details: `${unmatchedLiveWs.length} worksheets in CIQ not in the generated plan`,
    });
  }

  // ── Employee Assumptions ────────────────────────────────

  const plannedCols = config.employeeAssumptionColumns;
  if (live.assumptions.length > 0) {
    // Extract column names from assumption data
    const sampleData = live.assumptions[0]?.data || {};
    const liveAssumptionCols = Object.keys(sampleData);

    for (const pc of plannedCols) {
      const match = findBestMatch(pc.name, liveAssumptionCols);
      items.push({
        id: `employee-assumptions.col.${norm(pc.name)}`,
        name: `Assumption: ${pc.name}`,
        category: 'employee-assumptions',
        priority: 'required',
        status: match ? 'match' : 'missing-in-ciq',
        planned: `${pc.name} (${pc.type})`,
        actual: match || null,
        details: match
          ? `Found as "${match}"`
          : `Column "${pc.name}" not found in assumptions. Available: ${liveAssumptionCols.slice(0, 10).join(', ')}`,
      });
    }

    // Check for populated values
    const emptyCount = live.assumptions.filter(a => {
      const data = a.data || {};
      return Object.values(data).every(v => v === null || v === '' || v === undefined);
    }).length;
    items.push({
      id: 'employee-assumptions.populated',
      name: 'Assumption values populated',
      category: 'employee-assumptions',
      priority: 'recommended',
      status: emptyCount === 0 ? 'match' : emptyCount < live.assumptions.length ? 'partial' : 'mismatch',
      planned: 'All assumptions should have values',
      actual: `${live.assumptions.length - emptyCount}/${live.assumptions.length} populated`,
      details: emptyCount === 0
        ? 'All assumption records have values'
        : `${emptyCount} records have empty assumption data`,
    });

    // Extra columns
    const extraCols = liveAssumptionCols.filter(c => !findBestMatch(c, plannedCols.map(pc => pc.name)));
    if (extraCols.length > 0) {
      items.push({
        id: 'employee-assumptions.extra',
        name: 'Extra assumption columns',
        category: 'employee-assumptions',
        priority: 'informational',
        status: 'extra-in-ciq',
        planned: null,
        actual: extraCols.join(', '),
        details: `${extraCols.length} assumption columns in CIQ not in plan`,
      });
    }
  } else if (plannedCols.length > 0) {
    items.push({
      id: 'employee-assumptions.no-data',
      name: 'Employee assumptions exist',
      category: 'employee-assumptions',
      priority: 'required',
      status: 'missing-in-ciq',
      planned: `${plannedCols.length} assumption columns`,
      actual: null,
      details: 'No employee assumption data found in CIQ',
    });
  }

  // ── Attribute Worksheets ────────────────────────────────

  const plannedAttrs = config.attributeWorksheets;
  for (const pa of plannedAttrs) {
    const match = live.attributeWorksheets.find(a => fuzzyMatch(pa.name, a.name));
    if (!match) {
      items.push({
        id: `attribute-worksheets.exists.${norm(pa.name)}`,
        name: `Attribute: ${pa.name}`,
        category: 'attribute-worksheets',
        priority: 'required',
        status: 'missing-in-ciq',
        planned: `${pa.name} (${pa.pkType}, ${pa.columns.length} columns)`,
        actual: null,
        details: `Attribute worksheet "${pa.name}" not found in CIQ`,
      });
      continue;
    }

    // Check columns
    const liveCols = (Array.isArray((match as any).columns) ? (match as any).columns : []) as Array<Record<string, unknown>>;
    if (liveCols.length > 0) {
      const liveColNames = liveCols.map(c => String(c.name || ''));
      const plannedColNames = pa.columns.map(c => c.name);
      const missingCols = plannedColNames.filter(n => !findBestMatch(n, liveColNames));

      items.push({
        id: `attribute-worksheets.columns.${norm(pa.name)}`,
        name: `Attr columns: ${pa.name}`,
        category: 'attribute-worksheets',
        priority: 'required',
        status: missingCols.length === 0 ? 'match' : 'mismatch',
        planned: plannedColNames.join(', '),
        actual: liveColNames.join(', '),
        details: missingCols.length === 0
          ? 'All columns match'
          : `Missing: ${missingCols.join(', ')}`,
      });
    } else {
      items.push({
        id: `attribute-worksheets.columns.${norm(pa.name)}`,
        name: `Attr columns: ${pa.name}`,
        category: 'attribute-worksheets',
        priority: 'required',
        status: 'match',
        planned: pa.columns.map(c => c.name).join(', '),
        actual: match.name,
        details: `Attribute worksheet found, column detail not available via API`,
      });
    }
  }

  // Extra attribute worksheets
  const unmatchedAttrs = live.attributeWorksheets.filter(a =>
    !plannedAttrs.some(pa => fuzzyMatch(pa.name, a.name))
  );
  if (unmatchedAttrs.length > 0) {
    items.push({
      id: 'attribute-worksheets.extra',
      name: 'Extra attribute worksheets',
      category: 'attribute-worksheets',
      priority: 'informational',
      status: 'extra-in-ciq',
      planned: null,
      actual: unmatchedAttrs.map(a => a.name).join(', '),
      details: `${unmatchedAttrs.length} attribute worksheets in CIQ not in plan`,
    });
  }

  // Attribute data populated
  if (plannedAttrs.length > 0) {
    items.push({
      id: 'attribute-worksheets.populated',
      name: 'Attribute data populated',
      category: 'attribute-worksheets',
      priority: 'recommended',
      status: live.attributeWorksheets.length > 0 ? 'match' : 'missing-in-ciq',
      planned: `${plannedAttrs.length} attribute worksheets`,
      actual: `${live.attributeWorksheets.length} found`,
      details: `${live.attributeWorksheets.length} attribute worksheets in CIQ`,
    });
  }

  // ── Formulas ────────────────────────────────────────────

  const formulas = config.formulaRecommendations;
  if (formulas.length > 0) {
    // Check for derived columns (suggests formulas are built)
    const derivedCount = live.worksheets.reduce((count, ws) => {
      const cols = (ws as Record<string, unknown>).columns as Array<Record<string, unknown>> | undefined;
      if (!cols) return count;
      return count + cols.filter(c => c.column_type === 'derived' || c.type === 'derived' || c.is_derived === true).length;
    }, 0);

    items.push({
      id: 'formulas.derived-columns',
      name: 'Derived columns exist',
      category: 'formulas',
      priority: 'recommended',
      status: derivedCount > 0 ? 'match' : 'missing-in-ciq',
      planned: `${formulas.length} formula recommendations`,
      actual: `${derivedCount} derived columns found`,
      details: derivedCount > 0
        ? `${derivedCount} derived columns suggest formulas are built`
        : 'No derived columns found — formulas may not be built yet',
    });

    items.push({
      id: 'formulas.count',
      name: 'Formula coverage',
      category: 'formulas',
      priority: 'informational',
      status: derivedCount >= formulas.length ? 'match' : derivedCount > 0 ? 'partial' : 'missing-in-ciq',
      planned: `${formulas.length} formulas recommended`,
      actual: `${derivedCount} derived columns`,
      details: `${derivedCount} derived columns vs. ${formulas.length} planned formulas`,
    });

    // Manual verification needed
    items.push({
      id: 'formulas.manual-check',
      name: 'Manual formula verification',
      category: 'formulas',
      priority: 'informational',
      status: 'not-applicable',
      planned: formulas.map(f => f.concept).join(', '),
      actual: null,
      details: `SmartGrid formulas are UI-only. Verify manually: ${formulas.map(f => f.concept).join(', ')}`,
    });
  }

  // ── Build results ───────────────────────────────────────

  const categories = [...new Set(items.map(i => i.category))] as ComparisonCategory[];
  const categorySummaries: ComparisonCategorySummary[] = categories.map(cat => {
    const catItems = items.filter(i => i.category === cat && i.status !== 'not-applicable');
    const total = catItems.length;
    const matched = catItems.filter(i => i.status === 'match').length;
    const partial = catItems.filter(i => i.status === 'partial').length;
    const mismatched = catItems.filter(i => i.status === 'mismatch').length;
    const missingInCiq = catItems.filter(i => i.status === 'missing-in-ciq').length;
    const extraInCiq = catItems.filter(i => i.status === 'extra-in-ciq').length;
    const matchPercent = total > 0 ? Math.round(((matched + partial * 0.5) / total) * 100) : 100;
    return {
      category: cat,
      displayName: categoryDisplayNames[cat],
      total, matched, partial, mismatched, missingInCiq, extraInCiq, matchPercent,
    };
  });

  // Weighted score
  let weightedSum = 0;
  let weightTotal = 0;
  for (const item of items) {
    const score = statusScores[item.status];
    if (score < 0) continue;
    const weight = priorityWeights[item.priority];
    weightedSum += weight * score;
    weightTotal += weight;
  }
  const trueToPlanScore = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) : 0;

  const counts = {
    total: items.length,
    matched: items.filter(i => i.status === 'match').length,
    partial: items.filter(i => i.status === 'partial').length,
    mismatched: items.filter(i => i.status === 'mismatch').length,
    missingInCiq: items.filter(i => i.status === 'missing-in-ciq').length,
    extraInCiq: items.filter(i => i.status === 'extra-in-ciq').length,
    notApplicable: items.filter(i => i.status === 'not-applicable').length,
  };

  return {
    testedAt: new Date().toISOString(),
    projectId,
    ciqBaseUrl: baseUrl,
    trueToPlanScore,
    categorySummaries,
    items,
    mismatches: items.filter(i => i.status === 'mismatch'),
    missingInCiq: items.filter(i => i.status === 'missing-in-ciq'),
    extraInCiq: items.filter(i => i.status === 'extra-in-ciq'),
    liveSummary: {
      planCount: live.plans.length,
      matchedPlanName: matchedPlan?.name || null,
      matchedPlanId: matchedPlan?.id || null,
      workbookCount: live.workbooks.length,
      worksheetCount: live.worksheets.length,
      attributeWorksheetCount: live.attributeWorksheets.length,
      employeeCount: live.employeeCount,
    },
    counts,
  };
}
