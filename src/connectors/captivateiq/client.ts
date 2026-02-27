/**
 * CaptivateIQ API Client
 *
 * Low-level HTTP client for the CaptivateIQ REST API.
 * Base URL: https://api.captivateiq.com/ciq/v1/
 * Auth: Token-based via Authorization header
 * Rate limits: Standard tier = 5 req/s burst, 1500 req/hr sustained
 *
 * Docs: https://developers.captivateiq.com/docs
 */

export interface ICaptivateIQClientConfig {
  baseUrl: string;
  apiToken: string;
}

export interface ICaptivateIQPaginatedResponse<T> {
  object: 'list';
  total_count: number;
  next: string | null;
  previous: string | null;
  data: T[];
}

export interface ICaptivateIQPlan {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface ICaptivateIQPeriodGroup {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface ICaptivateIQWorkbook {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface ICaptivateIQWorksheet {
  id: string;
  name: string;
  workbook_id: string;
  [key: string]: unknown;
}

export interface ICaptivateIQWorksheetRecord {
  id: string;
  [key: string]: unknown;
}

export interface ICaptivateIQEmployee {
  id: string;
  employee_id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface ICaptivateIQEmployeeAssumption {
  id: string;
  employee: string;
  display_value: string;
  period_group: string;
  start_date: string;
  end_date: string;
  data: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ICaptivateIQAttributeWorksheet {
  id: string;
  name: string;
  description?: string;
  type: string;
  pk_type: string;
  columns?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ICaptivateIQPayoutWorksheet {
  id: string;
  name: string;
  [key: string]: unknown;
}

export class CaptivateIQClient {
  private baseUrl: string;
  private apiToken: string;

  constructor(config: ICaptivateIQClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiToken = config.apiToken;
  }

  // ── Commission Plans ──────────────────────────────────────

  async listPlans(): Promise<ICaptivateIQPaginatedResponse<ICaptivateIQPlan>> {
    return this.get<ICaptivateIQPaginatedResponse<ICaptivateIQPlan>>('/plans/');
  }

  async getPlan(planId: string): Promise<ICaptivateIQPlan> {
    return this.get<ICaptivateIQPlan>(`/plans/${planId}/`);
  }

  async listPeriodGroups(): Promise<ICaptivateIQPaginatedResponse<ICaptivateIQPeriodGroup>> {
    return this.get<ICaptivateIQPaginatedResponse<ICaptivateIQPeriodGroup>>(
      '/period-groups/'
    );
  }

  // ── Data Workbooks & Worksheets ───────────────────────────

  async listWorkbooks(): Promise<ICaptivateIQPaginatedResponse<ICaptivateIQWorkbook>> {
    return this.get<ICaptivateIQPaginatedResponse<ICaptivateIQWorkbook>>('/data-workbooks/');
  }

  async listWorksheets(workbookId: string): Promise<ICaptivateIQPaginatedResponse<ICaptivateIQWorksheet>> {
    return this.get<ICaptivateIQPaginatedResponse<ICaptivateIQWorksheet>>(
      `/data-workbooks/${workbookId}/worksheets/`
    );
  }

  async listWorksheetRecords(
    worksheetId: string,
    cursor?: string
  ): Promise<ICaptivateIQPaginatedResponse<ICaptivateIQWorksheetRecord>> {
    const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return this.get<ICaptivateIQPaginatedResponse<ICaptivateIQWorksheetRecord>>(
      `/data-worksheets/${worksheetId}/records/${params}`
    );
  }

  // ── Employees ─────────────────────────────────────────────

  async listEmployees(): Promise<ICaptivateIQPaginatedResponse<ICaptivateIQEmployee>> {
    return this.get<ICaptivateIQPaginatedResponse<ICaptivateIQEmployee>>('/employees/');
  }

  // ── Employee Assumptions (quotas, rates, targets per rep) ─

  async listEmployeeAssumptions(
    options?: { planIds?: string[]; periodGroupIds?: string[] }
  ): Promise<ICaptivateIQPaginatedResponse<ICaptivateIQEmployeeAssumption>> {
    const params = new URLSearchParams();
    if (options?.planIds) {
      for (const id of options.planIds) params.append('plan_ids[]', id);
    }
    if (options?.periodGroupIds) {
      for (const id of options.periodGroupIds) params.append('period_group_ids[]', id);
    }
    const qs = params.toString();
    return this.get<ICaptivateIQPaginatedResponse<ICaptivateIQEmployeeAssumption>>(
      `/employee-assumptions/${qs ? '?' + qs : ''}`
    );
  }

  // ── Attribute Worksheets (roles, teams, territories) ──────

  async listAttributeWorksheets(): Promise<ICaptivateIQPaginatedResponse<ICaptivateIQAttributeWorksheet>> {
    return this.get<ICaptivateIQPaginatedResponse<ICaptivateIQAttributeWorksheet>>(
      '/attribute-worksheets/'
    );
  }

  async listAttributeWorksheetRecords(
    worksheetId: string
  ): Promise<ICaptivateIQPaginatedResponse<ICaptivateIQWorksheetRecord>> {
    return this.get<ICaptivateIQPaginatedResponse<ICaptivateIQWorksheetRecord>>(
      `/attribute-worksheets/${worksheetId}/records/`
    );
  }

  // ── Payouts (calculation results, component breakdowns) ───

  async listPayoutDates(): Promise<ICaptivateIQPaginatedResponse<unknown>> {
    return this.get<ICaptivateIQPaginatedResponse<unknown>>('/payouts/payout-dates/');
  }

  async listPayoutPlans(): Promise<ICaptivateIQPaginatedResponse<unknown>> {
    return this.get<ICaptivateIQPaginatedResponse<unknown>>('/payouts/plans/');
  }

  async listPayoutWorksheets(): Promise<ICaptivateIQPaginatedResponse<ICaptivateIQPayoutWorksheet>> {
    return this.get<ICaptivateIQPaginatedResponse<ICaptivateIQPayoutWorksheet>>(
      '/payouts/worksheets/'
    );
  }

  // ── Report Models ─────────────────────────────────────────

  async listReportModels(): Promise<ICaptivateIQPaginatedResponse<unknown>> {
    return this.get<ICaptivateIQPaginatedResponse<unknown>>('/report-models/');
  }

  // ── Metadata ──────────────────────────────────────────────

  async getOrganization(): Promise<unknown> {
    return this.get('/me/organizations/');
  }

  // ── Pagination Helper ─────────────────────────────────────

  async fetchAllPages<T>(
    firstPage: ICaptivateIQPaginatedResponse<T>
  ): Promise<T[]> {
    const allData = [...firstPage.data];
    let nextUrl = firstPage.next;

    while (nextUrl) {
      const page = await this.getAbsolute<ICaptivateIQPaginatedResponse<T>>(nextUrl);
      allData.push(...page.data);
      nextUrl = page.next;
    }

    return allData;
  }

  // ── HTTP ──────────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.getAbsolute<T>(url);
  }

  private async getAbsolute<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Token ${this.apiToken}`,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `CaptivateIQ API error: ${response.status} ${response.statusText} — ${body}`
      );
    }

    return response.json() as Promise<T>;
  }
}
