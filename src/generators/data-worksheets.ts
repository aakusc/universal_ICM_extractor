/**
 * Data Worksheet Generator — DataWorksheetConfig[] → DataWorksheetBundle[]
 *
 * Each DataWorksheetConfig becomes a bundle containing:
 *   - worksheet definition (POST /workbooks/:id/worksheets)
 *   - records payload (POST /worksheets/:id/records)
 */

import type { DataWorksheetConfig } from '../project/types.js';
import type { DataWorksheetBundle, WorksheetColumnDef } from './types.js';

type ConfigColType = 'text' | 'number' | 'percent' | 'date';
type CiqColType = 'text' | 'numeric' | 'percent' | 'date' | 'currency';

function mapColumnType(t: ConfigColType): CiqColType {
  switch (t) {
    case 'number':  return 'numeric';
    case 'percent': return 'percent';
    case 'date':    return 'date';
    default:        return 'text';
  }
}

/** Suggest a workbook name based on the concept — groups related worksheets */
function suggestWorkbook(concept: string): string {
  switch (concept.toLowerCase()) {
    case 'rate-table':
    case 'accelerator':
    case 'decelerator':
      return 'Rate Tables';
    case 'spif':
      return 'SPIFs & Bonuses';
    case 'qualifier':
      return 'Qualifiers';
    case 'territory':
    case 'split':
      return 'Territory & Splits';
    default:
      return 'Compensation Data';
  }
}

export function generateDataWorksheetBundles(
  configs: DataWorksheetConfig[]
): DataWorksheetBundle[] {
  return configs.map((cfg) => {
    const columns: WorksheetColumnDef[] = cfg.columns.map((col) => ({
      name: col.name,
      type: mapColumnType(col.type),
    }));

    // Normalize sample rows to match declared columns (fill missing fields with null)
    const records = cfg.sampleRows.map((row) => {
      const normalized: Record<string, string | number | null> = {};
      for (const col of cfg.columns) {
        const val = row[col.name];
        normalized[col.name] = val !== undefined ? val : null;
      }
      return normalized;
    });

    return {
      label: cfg.name,
      concept: cfg.concept,
      description: cfg.description,
      workbook: suggestWorkbook(cfg.concept),
      worksheet: {
        name: cfg.name,
        description: cfg.description,
        columns,
      },
      records: { records },
    };
  });
}
