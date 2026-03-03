import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vendorIdSchema, type VendorId } from '../src/types/normalized-schema.js';
import type { IConnector } from '../src/types/connector.js';

// Mock the CLI module functions - we test the logic by recreating the helper functions
// since the actual CLI reads directly from process.argv

describe('CLI Logic', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('vendorIdSchema', () => {
    it('should parse valid vendor IDs', () => {
      expect(vendorIdSchema.parse('varicent')).toBe('varicent');
      expect(vendorIdSchema.parse('xactly')).toBe('xactly');
      expect(vendorIdSchema.parse('captivateiq')).toBe('captivateiq');
      expect(vendorIdSchema.parse('sap-successfactors')).toBe('sap-successfactors');
      expect(vendorIdSchema.parse('salesforce')).toBe('salesforce');
    });

    it('should reject invalid vendor IDs', () => {
      expect(() => vendorIdSchema.parse('invalid')).toThrow();
      expect(() => vendorIdSchema.parse('')).toThrow();
    });
  });

  describe('getArg helper', () => {
    // Simulates the CLI getArg function logic
    function getArg(args: string[], name: string): string | undefined {
      const index = args.indexOf(`--${name}`);
      return index !== -1 ? args[index + 1] : undefined;
    }

    it('should return value for existing argument', () => {
      const args = ['--vendor', 'captivateiq', '--plan', 'FY2026'];
      expect(getArg(args, 'vendor')).toBe('captivateiq');
      expect(getArg(args, 'plan')).toBe('FY2026');
    });

    it('should return undefined for missing argument', () => {
      const args = ['--vendor', 'captivateiq'];
      expect(getArg(args, 'plan')).toBeUndefined();
      expect(getArg(args, 'output')).toBeUndefined();
    });

    it('should return undefined for argument without value', () => {
      const args = ['--vendor'];
      expect(getArg(args, 'vendor')).toBeUndefined();
    });

    it('should handle empty args', () => {
      const args: string[] = [];
      expect(getArg(args, 'vendor')).toBeUndefined();
    });
  });

  describe('requireArg helper', () => {
    // Simulates the CLI requireArg function logic
    function requireArg(args: string[], name: string): string {
      const index = args.indexOf(`--${name}`);
      const value = index !== -1 ? args[index + 1] : undefined;
      if (!value) {
        throw new Error(`Missing required argument: --${name}`);
      }
      return value;
    }

    it('should return value for existing required argument', () => {
      const args = ['--vendor', 'captivateiq'];
      expect(requireArg(args, 'vendor')).toBe('captivateiq');
    });

    it('should throw for missing required argument', () => {
      const args = ['--vendor', 'captivateiq'];
      expect(() => requireArg(args, 'plan')).toThrow(
        'Missing required argument: --plan'
      );
    });

    it('should throw for argument without value', () => {
      const args = ['--vendor'];
      expect(() => requireArg(args, 'vendor')).toThrow(
        'Missing required argument: --vendor'
      );
    });
  });

  describe('Connector loading', () => {
    // Simulates loadConnector logic
    function loadConnector(vendor: VendorId): string {
      switch (vendor) {
        case 'captivateiq':
          return 'CaptivateIQConnector';
        case 'varicent':
          return 'VaricentConnector';
        case 'xactly':
          return 'XactlyConnector';
        case 'sap-successfactors':
          return 'SAPSuccessFactorsConnector';
        case 'salesforce':
          return 'SalesforceConnector';
        default:
          throw new Error(`Connector not yet implemented for vendor: ${vendor}`);
      }
    }

    it('should load captivateiq connector', () => {
      expect(loadConnector('captivateiq')).toBe('CaptivateIQConnector');
    });

    it('should load varicent connector', () => {
      expect(loadConnector('varicent')).toBe('VaricentConnector');
    });

    it('should load xactly connector', () => {
      expect(loadConnector('xactly')).toBe('XactlyConnector');
    });

    it('should load sap-successfactors connector', () => {
      expect(loadConnector('sap-successfactors')).toBe('SAPSuccessFactorsConnector');
    });

    it('should load salesforce connector', () => {
      expect(loadConnector('salesforce')).toBe('SalesforceConnector');
    });

    it('should throw for unsupported vendor', () => {
      expect(() => loadConnector('unknown' as VendorId)).toThrow(
        'Connector not yet implemented for vendor: unknown'
      );
    });
  });

  describe('Command routing', () => {
    type Command = 'extract' | 'normalize' | 'pipeline' | 'list-plans' | undefined;

    function getCommand(args: string[]): Command {
      const validCommands = ['extract', 'normalize', 'pipeline', 'list-plans'];
      const cmd = args[0];
      return validCommands.includes(cmd) ? cmd as Command : undefined;
    }

    it('should route extract command', () => {
      expect(getCommand(['extract', '--vendor', 'captivateiq'])).toBe('extract');
    });

    it('should route normalize command', () => {
      expect(getCommand(['normalize', '--input', 'raw.json'])).toBe('normalize');
    });

    it('should route pipeline command', () => {
      expect(getCommand(['pipeline', '--vendor', 'captivateiq'])).toBe('pipeline');
    });

    it('should route list-plans command', () => {
      expect(getCommand(['list-plans', '--vendor', 'captivateiq'])).toBe('list-plans');
    });

    it('should return undefined for invalid command', () => {
      expect(getCommand(['invalid', '--vendor', 'captivateiq'])).toBeUndefined();
    });

    it('should return undefined for empty args', () => {
      expect(getCommand([])).toBeUndefined();
    });
  });
});
