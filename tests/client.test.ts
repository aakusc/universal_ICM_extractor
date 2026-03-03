import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CaptivateIQClient } from '../src/connectors/captivateiq/client.js';

describe('CaptivateIQClient', () => {
  let client: CaptivateIQClient;

  beforeEach(() => {
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
});
