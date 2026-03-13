import { BaseConnector } from '../base-connector.js';
import type { IAuthConfig, IConnectionStatus, IExtractOptions, IRawRule } from '../../types/connector.js';
import type { VendorId } from '../../types/normalized-schema.js';
import { CaptivateIQClient } from './client.js';

/**
 * CaptivateIQ Connector
 *
 * Extracts compensation plan data from CaptivateIQ via their REST API.
 *
 * CaptivateIQ's API is a data I/O layer — it exposes data inputs and
 * calculated outputs, but NOT the SmartGrid formula definitions. We extract
 * the richest available data and let the AI interpreter infer rule concepts.
 *
 * Extraction strategy (5 data sources):
 * 1. Commission plans + period groups → plan structure and timing
 * 2. Employee assumptions → quotas, rates, targets per rep (rule inputs)
 * 3. Data worksheets → raw data tables (may contain rate tiers, deal data)
 * 4. Attribute worksheets → roles, teams, territories, hierarchies
 * 5. Payout worksheets → component-level commission results (rule outputs)
 *
 * The AI interpreter can infer concepts from these signals:
 * - Employee assumption with "quota" column → quota-target concept
 * - Worksheet named "Rate Table" with tier columns → rate-table concept
 * - Payout showing accelerated amounts above quota → accelerator concept
 *
 * Auth: Token-based (generate in CaptivateIQ → User Profile → API Tokens)
 * Base URL: https://api.captivateiq.com/ciq/v1/
 * Rate limits: 5 req/s burst, 1500 req/hr (Standard tier)
 */
export class CaptivateIQConnector extends BaseConnector {
  readonly vendor: VendorId = 'captivateiq';
  private client: CaptivateIQClient | null = null;

  protected async doConnect(auth: IAuthConfig): Promise<IConnectionStatus> {
    const apiToken = auth.apiKey;
    if (!apiToken) {
      return {
        connected: false,
        vendor: this.vendor,
        error: 'Missing API token. Generate one in CaptivateIQ → User Profile → API Tokens.',
      };
    }

    this.client = new CaptivateIQClient({
      baseUrl: auth.baseUrl || 'https://api.captivateiq.com/ciq/v1',
      apiToken,
    });

    // Verify connection by fetching organization metadata
    try {
      const orgResponse = (await this.client.getOrganization()) as {
        data?: Array<Record<string, unknown>>;
        name?: string;
        [key: string]: unknown;
      };
      // /me/organizations/ returns a paginated list
      const orgName = orgResponse.data?.[0]?.name ?? orgResponse.name ?? 'CaptivateIQ User';
      return {
        connected: true,
        vendor: this.vendor,
        authenticatedAs: String(orgName),
        apiVersion: 'v1',
      };
    } catch (error: unknown) {
      // Fallback: try listing employees as a connectivity check
      try {
        await this.client.listEmployees();
        return {
          connected: true,
          vendor: this.vendor,
          authenticatedAs: 'CaptivateIQ API Token',
          apiVersion: 'v1',
        };
      } catch (fallbackError) {
        return {
          connected: false,
          vendor: this.vendor,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        };
      }
    }
  }

  protected async doExtractRules(options: IExtractOptions): Promise<IRawRule[]> {
    if (!this.client) throw new Error('Not connected');

    const rules: IRawRule[] = [];
    const defaultPlanId = 'all';

    // ── Source 1: Commission Plans + Period Groups (structure & timing) ──

    const plansPage = await this.client.listPlans();
    const plans = await this.client.fetchAllPages(plansPage);

    const targetPlans = options.planId
      ? plans.filter((p) => p.id === options.planId || p.name === options.planId)
      : options.planIds
        ? plans.filter((p) => options.planIds!.includes(p.id) || options.planIds!.includes(p.name))
        : plans;

    const planId = targetPlans[0]?.id ?? defaultPlanId;
    const planIds = targetPlans.map((p) => p.id);

    for (const plan of targetPlans) {
      rules.push({
        vendorRuleId: `ciq-plan-${plan.id}`,
        vendorRuleType: 'COMMISSION_PLAN',
        planId: plan.id,
        data: plan,
      });
    }

    try {
      const periodsPage = await this.client.listPeriodGroups();
      const periods = await this.client.fetchAllPages(periodsPage);
      for (const period of periods) {
        rules.push({
          vendorRuleId: `ciq-period-${period.id}`,
          vendorRuleType: 'PERIOD_GROUP',
          planId,
          data: period,
        });
      }
    } catch {
      // Period groups may not be accessible
    }

    // ── Source 2: Employee Assumptions (quotas, rates, targets per rep) ──
    // These are the variable inputs to calculations — quotas, rate overrides,
    // territory assignments. Key signal for quota-target and rate-table concepts.

    try {
      const assumptionsPage = await this.client.listEmployeeAssumptions(
        planIds.length > 0 ? { planIds } : undefined
      );
      const assumptions = await this.client.fetchAllPages(assumptionsPage);

      if (assumptions.length > 0) {
        rules.push({
          vendorRuleId: `ciq-assumptions-batch`,
          vendorRuleType: 'EMPLOYEE_ASSUMPTIONS',
          planId,
          data: {
            totalAssumptions: assumptions.length,
            // Include up to 50 sample records for AI interpretation
            sampleRecords: assumptions.slice(0, 50),
            // Extract unique column names across all assumptions for schema insight
            columnNames: [
              ...new Set(
                assumptions.flatMap((a) => Object.keys(a.data ?? {}))
              ),
            ],
          },
        });
      }
    } catch {
      // Employee assumptions may not be accessible
    }

    // ── Source 3: Data Worksheets (raw data tables, rate tiers, deal data) ──
    // Worksheets named things like "Rate Table" with tier columns contain
    // implicit rule structure even though formulas aren't exposed.

    try {
      const workbooksPage = await this.client.listWorkbooks();
      const workbooks = await this.client.fetchAllPages(workbooksPage);

      for (const workbook of workbooks) {
        try {
          const worksheetsPage = await this.client.listWorksheets(workbook.id);
          const worksheets = await this.client.fetchAllPages(worksheetsPage);

          for (const worksheet of worksheets) {
            try {
              const recordsPage = await this.client.listWorksheetRecords(worksheet.id);
              const records = await this.client.fetchAllPages(recordsPage);

              if (records.length > 0) {
                rules.push({
                  vendorRuleId: `ciq-ws-${worksheet.id}`,
                  vendorRuleType: 'DATA_WORKSHEET',
                  planId,
                  data: {
                    workbookId: workbook.id,
                    workbookName: workbook.name,
                    worksheetId: worksheet.id,
                    worksheetName: worksheet.name,
                    recordCount: records.length,
                    // Include up to 50 sample records for AI interpretation
                    sampleRecords: records.slice(0, 50),
                    columnNames: [
                      ...new Set(
                        records.flatMap((r) => Object.keys(r))
                      ),
                    ],
                  },
                });
              }
            } catch {
              // Some worksheets may not be accessible
            }
          }
        } catch {
          // Some workbooks may not be accessible
        }
      }
    } catch {
      // Workbook access may be restricted
    }

    // ── Source 4: Attribute Worksheets (roles, teams, territories) ──
    // These define organizational structure used in territory and split rules.

    try {
      const attrPage = await this.client.listAttributeWorksheets();
      const attrWorksheets = await this.client.fetchAllPages(attrPage);

      for (const attrWs of attrWorksheets) {
        try {
          const recordsPage = await this.client.listAttributeWorksheetRecords(attrWs.id);
          const records = await this.client.fetchAllPages(recordsPage);

          if (records.length > 0) {
            rules.push({
              vendorRuleId: `ciq-attr-${attrWs.id}`,
              vendorRuleType: 'ATTRIBUTE_WORKSHEET',
              planId,
              data: {
                worksheetId: attrWs.id,
                worksheetName: attrWs.name,
                worksheetType: attrWs.type,
                pkType: attrWs.pk_type,
                columns: attrWs.columns,
                recordCount: records.length,
                sampleRecords: records.slice(0, 50),
              },
            });
          }
        } catch {
          // Some attribute worksheets may not be accessible
        }
      }
    } catch {
      // Attribute worksheets may not be accessible
    }

    // ── Source 5: Payout Worksheets (calculation results per component) ──
    // These show what the calculation engine produced — component-level
    // breakdowns that reveal accelerators, caps, floors, clawbacks etc.

    try {
      const payoutWsPage = await this.client.listPayoutWorksheets();
      const payoutWorksheets = await this.client.fetchAllPages(payoutWsPage);

      for (const pws of payoutWorksheets) {
        rules.push({
          vendorRuleId: `ciq-payout-ws-${pws.id}`,
          vendorRuleType: 'PAYOUT_WORKSHEET',
          planId,
          data: pws,
        });
      }
    } catch {
      // Payout worksheets may not be accessible
    }

    // ── Source 5b: Report Models (aggregated commission views) ──

    try {
      const reportsPage = await this.client.listReportModels();
      const reports = await this.client.fetchAllPages(reportsPage);

      for (const report of reports) {
        rules.push({
          vendorRuleId: `ciq-report-${(report as Record<string, unknown>).id}`,
          vendorRuleType: 'REPORT_MODEL',
          planId,
          data: report,
        });
      }
    } catch {
      // Reports may not be accessible
    }

    return rules;
  }

  protected async doListPlans(): Promise<Array<{ id: string; name: string }>> {
    if (!this.client) throw new Error('Not connected');

    const plansPage = await this.client.listPlans();
    const plans = await this.client.fetchAllPages(plansPage);

    return plans.map((p) => ({ id: p.id, name: p.name }));
  }

  protected async doDisconnect(): Promise<void> {
    this.client = null;
  }
}
