/**
 * Plan Tester — Types for live CIQ vs. generated plan comparison.
 */

export type ComparisonCategory =
  | 'plan-structure' | 'data-worksheets' | 'employee-assumptions'
  | 'attribute-worksheets' | 'formulas';

export interface ComparisonItem {
  id: string;
  name: string;
  category: ComparisonCategory;
  priority: 'required' | 'recommended' | 'informational';
  status: 'match' | 'partial' | 'mismatch' | 'missing-in-ciq' | 'extra-in-ciq' | 'not-applicable';
  planned: string | null;
  actual: string | null;
  details: string | null;
}

export interface ComparisonCategorySummary {
  category: ComparisonCategory;
  displayName: string;
  total: number;
  matched: number;
  partial: number;
  mismatched: number;
  missingInCiq: number;
  extraInCiq: number;
  matchPercent: number;
}

export interface PlanTestResult {
  testedAt: string;
  projectId: string;
  ciqBaseUrl: string;
  trueToPlanScore: number;
  categorySummaries: ComparisonCategorySummary[];
  items: ComparisonItem[];
  mismatches: ComparisonItem[];
  missingInCiq: ComparisonItem[];
  extraInCiq: ComparisonItem[];
  liveSummary: {
    planCount: number;
    matchedPlanName: string | null;
    matchedPlanId: string | null;
    workbookCount: number;
    worksheetCount: number;
    attributeWorksheetCount: number;
    employeeCount: number;
  };
  counts: {
    total: number;
    matched: number;
    partial: number;
    mismatched: number;
    missingInCiq: number;
    extraInCiq: number;
    notApplicable: number;
  };
}
