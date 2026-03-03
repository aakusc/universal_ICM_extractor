import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CaptivateIQConnector } from '../src/connectors/captivateiq/connector.js';

// Create mock instance - vi.fn defined in hoisted to be available for vi.mock
const { mockClientInstance } = vi.hoisted(() => {
  return {
    mockClientInstance: {
      getOrganization: vi.fn(),
      listEmployees: vi.fn(),
      listPlans: vi.fn(),
      fetchAllPages: vi.fn(),
      listPeriodGroups: vi.fn(),
      listEmployeeAssumptions: vi.fn(),
      listWorkbooks: vi.fn(),
      listWorksheets: vi.fn(),
      listWorksheetRecords: vi.fn(),
      listAttributeWorksheets: vi.fn(),
      listAttributeWorksheetRecords: vi.fn(),
      listPayoutWorksheets: vi.fn(),
      listReportModels: vi.fn(),
    },
  };
});

// Mock the client module
vi.mock('../src/connectors/captivateiq/client.js', () => ({
  CaptivateIQClient: class {
    constructor() {
      return mockClientInstance;
    }
  },
}));

describe('CaptivateIQConnector', () => {
  let connector: CaptivateIQConnector;

  beforeEach(() => {
    connector = new CaptivateIQConnector();
    vi.clearAllMocks();
  });

  describe('vendor', () => {
    it('should have correct vendor id', () => {
      expect(connector.vendor).toBe('captivateiq');
    });
  });

  describe('connect', () => {
    it('should fail when API token is missing', async () => {
      const result = await connector.connect({ apiKey: '' });

      expect(result.connected).toBe(false);
      expect(result.error).toContain('Missing API token');
    });

    it('should connect successfully with valid token', async () => {
      const mockOrgResponse = {
        data: [{ name: 'Test Company' }],
      };

      vi.spyOn(mockClientInstance, 'getOrganization').mockResolvedValue(mockOrgResponse);

      const result = await connector.connect({ apiKey: 'test-token' });

      expect(result.connected).toBe(true);
      expect(result.vendor).toBe('captivateiq');
      expect(result.authenticatedAs).toBe('Test Company');
    });

    it('should fallback to listEmployees if org fetch fails', async () => {
      vi.spyOn(mockClientInstance, 'getOrganization').mockRejectedValue(new Error('Org fetch failed'));
      vi.spyOn(mockClientInstance, 'listEmployees').mockResolvedValue({ data: [] });

      const result = await connector.connect({ apiKey: 'test-token' });

      expect(result.connected).toBe(true);
      expect(result.authenticatedAs).toBe('CaptivateIQ API Token');
    });

    it('should fail when both org and employee fetch fail', async () => {
      vi.spyOn(mockClientInstance, 'getOrganization').mockRejectedValue(new Error('Org fetch failed'));
      vi.spyOn(mockClientInstance, 'listEmployees').mockRejectedValue(new Error('Employee fetch failed'));

      const result = await connector.connect({ apiKey: 'test-token' });

      expect(result.connected).toBe(false);
      expect(result.error).toBe('Employee fetch failed');
    });
  });

  describe('extractRules', () => {
    beforeEach(async () => {
      // Setup connected state
      const mockOrgResponse = { data: [{ name: 'Test Company' }] };
      vi.spyOn(mockClientInstance, 'getOrganization').mockResolvedValue(mockOrgResponse);
      await connector.connect({ apiKey: 'test-token' });
    });

    it('should extract commission plans', async () => {
      const mockPlans = [
        { id: 'plan-1', name: 'Sales Plan 2024' },
        { id: 'plan-2', name: 'AE Plan 2024' },
      ];

      vi.spyOn(mockClientInstance, 'listPlans').mockResolvedValue({ data: mockPlans });
      vi.spyOn(mockClientInstance, 'fetchAllPages').mockImplementation((page: { data?: unknown[] }) =>
        Promise.resolve(page.data || [])
      );
      vi.spyOn(mockClientInstance, 'listPeriodGroups').mockRejectedValue(new Error('Not accessible'));

      const rules = await connector.extractRules({});

      const planRules = rules.filter((r) => r.vendorRuleType === 'COMMISSION_PLAN');
      expect(planRules).toHaveLength(2);
      expect(planRules[0].vendorRuleId).toBe('ciq-plan-plan-1');
      expect(planRules[0].data.name).toBe('Sales Plan 2024');
    });

    it('should filter plans by planId option', async () => {
      const mockPlans = [
        { id: 'plan-1', name: 'Sales Plan 2024' },
        { id: 'plan-2', name: 'AE Plan 2024' },
      ];

      vi.spyOn(mockClientInstance, 'listPlans').mockResolvedValue({ data: mockPlans });
      vi.spyOn(mockClientInstance, 'fetchAllPages').mockImplementation((page: { data?: unknown[] }) =>
        Promise.resolve(page.data || [])
      );
      vi.spyOn(mockClientInstance, 'listPeriodGroups').mockRejectedValue(new Error('Not accessible'));

      const rules = await connector.extractRules({ planId: 'plan-1' });

      const planRules = rules.filter((r) => r.vendorRuleType === 'COMMISSION_PLAN');
      expect(planRules).toHaveLength(1);
      expect(planRules[0].data.name).toBe('Sales Plan 2024');
    });

    it('should extract employee assumptions when available', async () => {
      const mockPlans = [{ id: 'plan-1', name: 'Sales Plan 2024' }];
      const mockAssumptions = [
        { id: 'a1', data: { quota: 100000, rate: 0.1 } },
        { id: 'a2', data: { quota: 150000, rate: 0.12 } },
      ];

      vi.spyOn(mockClientInstance, 'listPlans').mockResolvedValue({ data: mockPlans });
      vi.spyOn(mockClientInstance, 'fetchAllPages').mockImplementation((page: { data?: unknown[] }) =>
        Promise.resolve(page.data || [])
      );
      vi.spyOn(mockClientInstance, 'listEmployeeAssumptions').mockResolvedValue({ data: mockAssumptions });

      const rules = await connector.extractRules({});

      const assumptionRules = rules.filter(
        (r) => r.vendorRuleType === 'EMPLOYEE_ASSUMPTIONS'
      );
      expect(assumptionRules).toHaveLength(1);
      expect(assumptionRules[0].data.totalAssumptions).toBe(2);
      expect(assumptionRules[0].data.sampleRecords).toHaveLength(2);
    });

    it('should handle worksheet extraction', async () => {
      const mockPlans = [{ id: 'plan-1', name: 'Sales Plan 2024' }];
      const mockWorkbooks = [{ id: 'wb-1', name: 'Rate Tables' }];
      const mockWorksheets = [{ id: 'ws-1', name: 'Tier Rates' }];
      const mockRecords = [
        { tier: 'Tier 1', rate: 0.1 },
        { tier: 'Tier 2', rate: 0.15 },
      ];

      vi.spyOn(mockClientInstance, 'listPlans').mockResolvedValue({ data: mockPlans });
      vi.spyOn(mockClientInstance, 'fetchAllPages').mockImplementation((page: { data?: unknown[] }) =>
        Promise.resolve(page.data || [])
      );
      vi.spyOn(mockClientInstance, 'listWorkbooks').mockResolvedValue({ data: mockWorkbooks });
      vi.spyOn(mockClientInstance, 'listWorksheets').mockResolvedValue({ data: mockWorksheets });
      vi.spyOn(mockClientInstance, 'listWorksheetRecords').mockResolvedValue({ data: mockRecords });

      const rules = await connector.extractRules({});

      const worksheetRules = rules.filter((r) => r.vendorRuleType === 'DATA_WORKSHEET');
      expect(worksheetRules).toHaveLength(1);
      expect(worksheetRules[0].data.worksheetName).toBe('Tier Rates');
      expect(worksheetRules[0].data.columnNames).toContain('tier');
    });

    it('should extract payout worksheets', async () => {
      const mockPlans = [{ id: 'plan-1', name: 'Sales Plan 2024' }];
      const mockPayouts = [
        { id: 'payout-1', name: 'Q1 Commission' },
        { id: 'payout-2', name: 'Q2 Commission' },
      ];

      vi.spyOn(mockClientInstance, 'listPlans').mockResolvedValue({ data: mockPlans });
      vi.spyOn(mockClientInstance, 'fetchAllPages').mockImplementation((page: { data?: unknown[] }) =>
        Promise.resolve(page.data || [])
      );
      vi.spyOn(mockClientInstance, 'listPayoutWorksheets').mockResolvedValue({ data: mockPayouts });

      const rules = await connector.extractRules({});

      const payoutRules = rules.filter((r) => r.vendorRuleType === 'PAYOUT_WORKSHEET');
      expect(payoutRules).toHaveLength(2);
    });

    it('should throw error when not connected', async () => {
      const disconnectedConnector = new CaptivateIQConnector();

      await expect(disconnectedConnector.extractRules({})).rejects.toThrow('not connected');
    });
  });

  describe('listPlans', () => {
    it('should list all available plans', async () => {
      const mockPlans = [{ id: 'plan-1', name: 'Sales Plan 2024' }];

      vi.spyOn(mockClientInstance, 'listPlans').mockResolvedValue({ data: mockPlans });
      vi.spyOn(mockClientInstance, 'fetchAllPages').mockImplementation((page: { data?: unknown[] }) =>
        Promise.resolve(page.data || [])
      );

      // Connect first
      vi.spyOn(mockClientInstance, 'getOrganization').mockResolvedValue({ data: [{ name: 'Test' }] });
      await connector.connect({ apiKey: 'test-token' });

      const plans = await connector.listPlans();

      expect(plans).toHaveLength(1);
      expect(plans[0].id).toBe('plan-1');
      expect(plans[0].name).toBe('Sales Plan 2024');
    });
  });

  describe('disconnect', () => {
    it('should clear the client on disconnect', async () => {
      vi.spyOn(mockClientInstance, 'getOrganization').mockResolvedValue({ data: [{ name: 'Test' }] });
      await connector.connect({ apiKey: 'test-token' });

      await connector.disconnect();

      // After disconnect, client should be null
      const result = await connector.connect({ apiKey: 'test-token' });
      expect(result.connected).toBe(true);
    });
  });
});
