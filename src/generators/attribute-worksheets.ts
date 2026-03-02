/**
 * Attribute Worksheet Generator — AttributeWorksheetConfig[] → AttributeWorksheetPayload[]
 *
 * Attribute worksheets in CaptivateIQ define organizational mappings:
 * territories, roles, teams, account hierarchies, etc.
 *
 * Each config produces a POST /ciq/v1/attribute_worksheets payload.
 */

import type { AttributeWorksheetConfig } from '../project/types.js';
import type { AttributeWorksheetPayload, WorksheetColumnDef } from './types.js';

type ConfigColType = 'text' | 'number' | 'date';
type CiqColType = 'text' | 'numeric' | 'percent' | 'date' | 'currency';

function mapColumnType(t: ConfigColType): CiqColType {
  return t === 'number' ? 'numeric' : t;
}

export function generateAttributeWorksheetPayloads(
  configs: AttributeWorksheetConfig[]
): AttributeWorksheetPayload[] {
  return configs.map((cfg) => {
    const columns: WorksheetColumnDef[] = cfg.columns.map((col) => ({
      name: col.name,
      type: mapColumnType(col.type),
    }));

    return {
      name: cfg.name,
      description: cfg.description || undefined,
      concept: cfg.concept,
      pk_type: cfg.pkType,
      columns,
    };
  });
}
