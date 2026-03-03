import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pipeline, type IPipelineConfig } from '../src/normalizer/pipeline.js';
import type { IConnector, IAuthConfig, IExtractOptions, ConnectionStatus } from '../src/types/connector.js';
import type { NormalizedRule } from '../src/types/normalized-schema.js';

describe('Pipeline', () => {
  let mockConnector: IConnector;
  let mockConfig: IPipelineConfig;

  beforeEach(() => {
    // Mock connector
    mockConnector = {
      vendor: 'TestVendor',
      connect: vi.fn().mockResolvedValue({
        connected: true,
        apiVersion: '1.0',
      } as ConnectionStatus),
      disconnect: vi.fn().mockResolvedValue(undefined),
      extractRules: vi.fn().mockResolvedValue([
        { id: 'rule-1', name: 'Test Rule', raw: 'Some raw rule text' },
        { id: 'rule-2', name: 'Another Rule', raw: 'More raw text' },
      ]),
      getPlans: vi.fn().mockResolvedValue([]),
    };

    // Mock config
    mockConfig = {
      auth: {
        apiKey: 'test-key',
        baseUrl: 'https://test.example.com',
      },
      interpreter: {
        provider: 'openai',
        model: 'gpt-4',
      },
      extractOptions: {},
      planName: 'Test Plan',
    };
  });

  describe('run', () => {
    it('should connect to the connector', async () => {
      await Pipeline.run(mockConnector, mockConfig);
      expect(mockConnector.connect).toHaveBeenCalledWith(mockConfig.auth);
    });

    it('should extract rules from the connector', async () => {
      await Pipeline.run(mockConnector, mockConfig);
      expect(mockConnector.extractRules).toHaveBeenCalledWith(mockConfig.extractOptions ?? {});
    });

    it('should disconnect after processing', async () => {
      await Pipeline.run(mockConnector, mockConfig);
      expect(mockConnector.disconnect).toHaveBeenCalled();
    });

    it('should throw error when connection fails', async () => {
      (mockConnector.connect as ReturnType<typeof vi.fn>).mockResolvedValue({
        connected: false,
        error: 'Connection refused',
      } as ConnectionStatus);

      await expect(Pipeline.run(mockConnector, mockConfig)).rejects.toThrow(
        'Failed to connect to TestVendor: Connection refused'
      );
    });

    it('should return valid pipeline result with stats', async () => {
      const result = await Pipeline.run(mockConnector, mockConfig);

      expect(result).toHaveProperty('plan');
      expect(result).toHaveProperty('stats');
      expect(result).toHaveProperty('valid');
      expect(result.stats).toHaveProperty('rawRulesExtracted');
      expect(result.stats).toHaveProperty('rulesNormalized');
      expect(result.stats).toHaveProperty('avgConfidence');
      expect(result.stats).toHaveProperty('duration');
    });

    it('should include correct vendor in plan', async () => {
      const result = await Pipeline.run(mockConnector, mockConfig);
      expect(result.plan.sourceVendor).toBe('TestVendor');
    });

    it('should use planName from config', async () => {
      const result = await Pipeline.run(mockConnector, mockConfig);
      expect(result.plan.planName).toBe('Test Plan');
    });

    it('should use default planName when not provided', async () => {
      const configWithoutName = { ...mockConfig };
      delete configWithoutName.planName;
      
      const result = await Pipeline.run(mockConnector, configWithoutName);
      expect(result.plan.planName).toBe('TestVendor Plan');
    });

    it('should set effective period with start date', async () => {
      const result = await Pipeline.run(mockConnector, mockConfig);
      expect(result.plan.effectivePeriod).toHaveProperty('start');
      expect(result.plan.effectivePeriod).toHaveProperty('end');
    });

    it('should include metadata in plan', async () => {
      const result = await Pipeline.run(mockConnector, mockConfig);
      expect(result.plan.metadata).toHaveProperty('connectorVersion');
      expect(result.plan.metadata).toHaveProperty('apiVersion');
    });
  });
});
