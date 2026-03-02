/**
 * Employee Assumptions Generator — EmployeeAssumptionColumn[] → EmployeeAssumptionsPayload
 *
 * Employee assumption columns are per-employee variables (quotas, rates, targets)
 * uploaded to CaptivateIQ via the employee assumptions bulk endpoint.
 *
 * CaptivateIQ does not expose a direct "create assumption column" REST endpoint.
 * Instead, columns are defined by uploading a CSV/JSON with column headers, or by
 * PATCH-ing the plan's assumption schema. We produce the schema payload here.
 */

import type { EmployeeAssumptionColumn } from '../project/types.js';
import type { EmployeeAssumptionsPayload, AssumptionColumnDef } from './types.js';

type ConfigType = 'currency' | 'percent' | 'text' | 'number';
type CiqAssumptionType = 'currency' | 'percent' | 'text' | 'numeric';

function mapType(t: ConfigType): CiqAssumptionType {
  return t === 'number' ? 'numeric' : t;
}

export function generateEmployeeAssumptionsPayload(
  columns: EmployeeAssumptionColumn[]
): EmployeeAssumptionsPayload {
  const defs: AssumptionColumnDef[] = columns.map((col) => ({
    name: col.name,
    type: mapType(col.type),
    description: col.description || undefined,
    concept: col.concept || undefined,
    default_value: col.exampleValue !== undefined ? col.exampleValue : undefined,
  }));

  return {
    _note:
      'CaptivateIQ employee assumption columns are defined per-plan. ' +
      'Upload these column definitions via the plan settings UI or bulk CSV import. ' +
      'Each row in the uploaded file should have one column per employee identifier.',
    columns: defs,
  };
}
