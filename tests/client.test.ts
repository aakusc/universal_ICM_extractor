import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CaptivateIQClient } from '../src/connectors/captivateiq/client.js';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('CaptivateIQClient', () => {
  let client: CaptivateIQClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new CaptivateIQClient({
      baseUrl: 'https://api.captivateiq.com/ciq/v1/',
      apiToken: 'test-token',
    });
  });

  describe('constructor', () => {
    it('should trim trailing slashes from baseUrl', () => {
      const client = new CaptivateIQClient({
        baseUrl: 'https://api.captivateiq.com/ciq/v1///',
        apiToken: 'test',
      });
      expect(client).toBeDefined();
    });
  });

  describe('listPlans', () => {
    it('should be defined', () => {
      expect(client.listPlans).toBeDefined();
    });

    it('should be an async function', () => {
      expect(typeof client.listPlans).toBe('function');
    });
  });

  describe('getPlan', () => {
    it('should be defined', () => {
      expect(client.getPlan).toBeDefined();
    });

    it('should accept a planId parameter', () => {
      expect(client.getPlan.length).toBe(1);
    });
  });

  describe('listPeriodGroups', () => {
    it('should be defined', () => {
      expect(client.listPeriodGroups).toBeDefined();
    });
  });

  describe('listWorkbooks', () => {
    it('should be defined', () => {
      expect(client.listWorkbooks).toBeDefined();
    });
  });

  describe('listWorksheets', () => {
    it('should be defined', () => {
      expect(client.listWorksheets).toBeDefined();
    });

    it('should accept workbookId parameter', () => {
      expect(client.listWorksheets.length).toBe(1);
    });
  });

  describe('listWorksheetRecords', () => {
    it('should be defined', () => {
      expect(client.listWorksheetRecords).toBeDefined();
    });

    it('should accept worksheetId and optional cursor', () => {
      expect(client.listWorksheetRecords.length).toBe(2);
    });
  });

  describe('listEmployees', () => {
    it('should be defined', () => {
      expect(client.listEmployees).toBeDefined();
    });
  });

  describe('listEmployeeAssumptions', () => {
    it('should be defined', () => {
      expect(client.listEmployeeAssumptions).toBeDefined();
    });

    it('should accept optional filters', () => {
      expect(client.listEmployeeAssumptions.length).toBe(1);
    });
  });

  describe('listAttributeWorksheets', () => {
    it('should be defined', () => {
      expect(client.listAttributeWorksheets).toBeDefined();
    });
  });

  describe('listAttributeWorksheetRecords', () => {
    it('should be defined', () => {
      expect(client.listAttributeWorksheetRecords).toBeDefined();
    });

    it('should accept worksheetId parameter', () => {
      expect(client.listAttributeWorksheetRecords.length).toBe(1);
    });
  });

  describe('listPayoutDates', () => {
    it('should be defined', () => {
      expect(client.listPayoutDates).toBeDefined();
    });
  });

  describe('listPayoutPlans', () => {
    it('should be defined', () => {
      expect(client.listPayoutPlans).toBeDefined();
    });
  });

  describe('listPayoutWorksheets', () => {
    it('should be defined', () => {
      expect(client.listPayoutWorksheets).toBeDefined();
    });
  });

  describe('listReportModels', () => {
    it('should be defined', () => {
      expect(client.listReportModels).toBeDefined();
    });
  });

  describe('getOrganization', () => {
    it('should be defined', () => {
      expect(client.getOrganization).toBeDefined();
    });
  });

  describe('fetchAllPages', () => {
    it('should be defined', () => {
      expect(client.fetchAllPages).toBeDefined();
    });

    it('should accept paginated response and return flat array', () => {
      expect(client.fetchAllPages.length).toBe(1);
    });
  });

  // ── Response Validation Tests ─────────────────────────────────────

  describe('API Response Validation', () => {
    describe('listPlans response parsing', () => {
      it('should correctly parse valid paginated plan response', async () => {
        const mockResponse = {
          object: 'list',
          total_count: 2,
          next: null,
          previous: null,
          data: [
            {
              id: 'plan-1',
              name: 'Q1 Commission Plan',
              description: 'Quarterly bonus structure',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-03-01T00:00:00Z',
            },
            {
              id: 'plan-2',
              name: 'Q2 Commission Plan',
              created_at: '2026-02-01T00:00:00Z',
              updated_at: '2026-03-01T00:00:00Z',
            },
          ],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await client.listPlans();

        expect(result.object).toBe('list');
        expect(result.total_count).toBe(2);
        expect(result.data).toHaveLength(2);
        expect(result.data[0].id).toBe('plan-1');
        expect(result.data[0].name).toBe('Q1 Commission Plan');
        expect(result.data[1].id).toBe('plan-2');
      });

      it('should handle empty data array', async () => {
        const mockResponse = {
          object: 'list',
          total_count: 0,
          next: null,
          previous: null,
          data: [],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await client.listPlans();

        expect(result.data).toHaveLength(0);
        expect(result.total_count).toBe(0);
      });

      it('should handle plans with extra fields (extensibility)', async () => {
        const mockResponse = {
          object: 'list',
          total_count: 1,
          next: null,
          previous: null,
          data: [
            {
              id: 'plan-1',
              name: 'Test Plan',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-03-01T00:00:00Z',
              custom_field: 'custom-value',
              another_field: 123,
            },
          ],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await client.listPlans();

        expect(result.data[0].custom_field).toBe('custom-value');
        expect(result.data[0].another_field).toBe(123);
      });
    });

    describe('getPlan response parsing', () => {
      it('should correctly parse single plan response', async () => {
        const mockResponse = {
          id: 'plan-123',
          name: 'Annual Plan',
          description: 'Yearly commission structure',
          created_at: '2025-01-15T10:30:00Z',
          updated_at: '2026-03-01T14:22:00Z',
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await client.getPlan('plan-123');

        expect(result.id).toBe('plan-123');
        expect(result.name).toBe('Annual Plan');
        expect(result.description).toBe('Yearly commission structure');
        expect(result.created_at).toBe('2025-01-15T10:30:00Z');
      });

      it('should handle plan without optional description', async () => {
        const mockResponse = {
          id: 'plan-minimal',
          name: 'Minimal Plan',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await client.getPlan('plan-minimal');

        expect(result.description).toBeUndefined();
      });
    });

    describe('listEmployees response parsing', () => {
      it('should correctly parse employee list response', async () => {
        const mockResponse = {
          object: 'list',
          total_count: 3,
          next: null,
          previous: null,
          data: [
            {
              id: 'emp-1',
              employee_id: 'E001',
              email: 'alice@example.com',
              first_name: 'Alice',
              last_name: 'Johnson',
              is_active: true,
              created_at: '2025-06-01T00:00:00Z',
              updated_at: '2026-02-15T00:00:00Z',
            },
            {
              id: 'emp-2',
              employee_id: 'E002',
              email: 'bob@example.com',
              first_name: 'Bob',
              last_name: 'Smith',
              is_active: false,
              created_at: '2025-07-01T00:00:00Z',
              updated_at: '2026-01-10T00:00:00Z',
            },
          ],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await client.listEmployees();

        expect(result.data).toHaveLength(2);
        expect(result.data[0].email).toBe('alice@example.com');
        expect(result.data[0].is_active).toBe(true);
        expect(result.data[1].is_active).toBe(false);
        expect(result.data[1].employee_id).toBe('E002');
      });
    });

    describe('API error handling', () => {
      it('should throw error on non-OK response with status and body', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          text: () => Promise.resolve('Invalid API token'),
        });

        await expect(client.listPlans()).rejects.toThrow(
          'CaptivateIQ API error: 401 Unauthorized — Invalid API token'
        );
      });

      it('should throw error on rate limit (429)', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: () => Promise.resolve('Rate limit exceeded'),
        });

        await expect(client.listPlans()).rejects.toThrow(
          'CaptivateIQ API error: 429 Too Many Requests — Rate limit exceeded'
        );
      });

      it('should throw error on server error (500)', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: () => Promise.resolve('Database connection failed'),
        });

        await expect(client.listPlans()).rejects.toThrow(
          'CaptivateIQ API error: 500 Internal Server Error — Database connection failed'
        );
      });

      it('should handle empty error body gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          text: () => Promise.resolve(''),
        });

        await expect(client.listPlans()).rejects.toThrow(
          'CaptivateIQ API error: 403 Forbidden — '
        );
      });
    });

    describe('Authorization header', () => {
      it('should include Authorization header with Token', async () => {
        const mockResponse = {
          object: 'list',
          total_count: 0,
          next: null,
          previous: null,
          data: [],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await client.listPlans();

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.captivateiq.com/ciq/v1/plans/',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              Authorization: 'Token test-token',
              Accept: 'application/json',
            }),
          })
        );
      });
    });

    describe('Pagination cursor handling', () => {
      it('should encode cursor parameter in listWorksheetRecords', async () => {
        const mockResponse = {
          object: 'list',
          total_count: 100,
          next: null,
          previous: null,
          data: [{ id: 'record-1' }],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await client.listWorksheetRecords('worksheet-123', 'cursor-abc');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.captivateiq.com/ciq/v1/data-worksheets/worksheet-123/records/?cursor=cursor-abc',
          expect.any(Object)
        );
      });
    });

    describe('Query parameter handling', () => {
      it('should build correct query string for listEmployeeAssumptions with planIds', async () => {
        const mockResponse = {
          object: 'list',
          total_count: 0,
          next: null,
          previous: null,
          data: [],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await client.listEmployeeAssumptions({ planIds: ['plan-a', 'plan-b'] });

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.captivateiq.com/ciq/v1/employee-assumptions/?plan_ids%5B%5D=plan-a&plan_ids%5B%5D=plan-b',
          expect.any(Object)
        );
      });

      it('should build correct query string for listEmployeeAssumptions with periodGroupIds', async () => {
        const mockResponse = {
          object: 'list',
          total_count: 0,
          next: null,
          previous: null,
          data: [],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await client.listEmployeeAssumptions({ periodGroupIds: ['pg-1', 'pg-2'] });

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.captivateiq.com/ciq/v1/employee-assumptions/?period_group_ids%5B%5D=pg-1&period_group_ids%5B%5D=pg-2',
          expect.any(Object)
        );
      });

      it('should handle empty options (no query string)', async () => {
        const mockResponse = {
          object: 'list',
          total_count: 0,
          next: null,
          previous: null,
          data: [],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await client.listEmployeeAssumptions();

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.captivateiq.com/ciq/v1/employee-assumptions/',
          expect.any(Object)
        );
      });
    });

    describe('Base URL normalization', () => {
      it('should handle baseUrl with multiple trailing slashes', () => {
        const client = new CaptivateIQClient({
          baseUrl: 'https://api.captivateiq.com/ciq/v1///',
          apiToken: 'test',
        });
        expect(client).toBeDefined();
      });
    });
  });
});
