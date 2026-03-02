/**
 * Plan Generator — PlanStructureRecommendation → CaptivateIQ plan + period group payloads
 */

import type { PlanStructureRecommendation } from '../project/types.js';
import type { PlanPayload, PeriodGroupPayload } from './types.js';

type CiqPeriodType = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

function toCiqPeriodType(periodType: string): CiqPeriodType {
  switch (periodType.toLowerCase()) {
    case 'monthly':   return 'MONTHLY';
    case 'quarterly': return 'QUARTERLY';
    default:          return 'ANNUAL';
  }
}

/** Generate the initial period window dates based on period type */
function periodDates(periodType: CiqPeriodType): { start_date: string; end_date: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  switch (periodType) {
    case 'MONTHLY': {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0); // last day of month
      return {
        start_date: start.toISOString().split('T')[0],
        end_date: end.toISOString().split('T')[0],
      };
    }
    case 'QUARTERLY': {
      const quarter = Math.floor(month / 3);
      const qStart = new Date(year, quarter * 3, 1);
      const qEnd = new Date(year, quarter * 3 + 3, 0);
      return {
        start_date: qStart.toISOString().split('T')[0],
        end_date: qEnd.toISOString().split('T')[0],
      };
    }
    case 'ANNUAL':
    default: {
      return {
        start_date: `${year}-01-01`,
        end_date: `${year}-12-31`,
      };
    }
  }
}

export function generatePlanPayload(rec: PlanStructureRecommendation): PlanPayload {
  return {
    name: rec.planName || 'New Compensation Plan',
    description: rec.notes || undefined,
    period_type: toCiqPeriodType(rec.periodType),
    status: 'draft',
  };
}

export function generatePeriodGroupPayload(rec: PlanStructureRecommendation): PeriodGroupPayload {
  const periodType = toCiqPeriodType(rec.periodType);
  const { start_date, end_date } = periodDates(periodType);

  return {
    name: `${rec.planName || 'Plan'} — ${periodType.charAt(0) + periodType.slice(1).toLowerCase()} Period Group`,
    period_type: periodType,
    start_date,
    end_date,
  };
}
