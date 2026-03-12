import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getVendorAuth, getInterpreterConfig } from '../src/config/index.js';
import type { VendorId } from '../src/types/normalized-schema.js';

describe('Config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('getVendorAuth', () => {
    it('should return varicent auth config', () => {
      const originalEnv = { ...process.env };
      process.env.VARICENT_BASE_URL = 'https://api.varicent.com';
      process.env.VARICENT_CLIENT_ID = 'test-client';
      process.env.VARICENT_CLIENT_SECRET = 'test-secret';

      const auth = getVendorAuth('varicent');

      expect(auth.baseUrl).toBe('https://api.varicent.com');
      expect(auth.clientId).toBe('test-client');
      expect(auth.clientSecret).toBe('test-secret');

      process.env = originalEnv;
    });

    it('should return xactly auth config', () => {
      const originalEnv = { ...process.env };
      process.env.XACTLY_BASE_URL = 'https://api.xactlycorp.com';
      process.env.XACTLY_API_KEY = 'test-key';
      process.env.XACTLY_API_SECRET = 'test-secret';

      const auth = getVendorAuth('xactly');

      expect(auth.baseUrl).toBe('https://api.xactlycorp.com');
      expect(auth.apiKey).toBe('test-key');
      expect(auth.apiSecret).toBe('test-secret');

      process.env = originalEnv;
    });

    it('should return captivateiq auth config with default URL', () => {
      const originalEnv = { ...process.env };
      process.env.CAPTIVATEIQ_API_TOKEN = 'test-token';

      const auth = getVendorAuth('captivateiq');

      expect(auth.baseUrl).toBe('https://api.captivateiq.com/ciq/v1');
      expect(auth.apiKey).toBe('test-token');

      process.env = originalEnv;
    });

    it('should throw for missing required env var', () => {
      const originalEnv = { ...process.env };
      delete process.env.VARICENT_BASE_URL;
      delete process.env.VARICENT_CLIENT_ID;
      delete process.env.VARICENT_CLIENT_SECRET;

      expect(() => getVendorAuth('varicent')).toThrow(
        'Missing required environment variable: VARICENT_BASE_URL'
      );

      process.env = originalEnv;
    });
  });

  describe('getInterpreterConfig', () => {
    it('should use AICR Gateway when configured', () => {
      const originalEnv = { ...process.env };
      process.env.AICR_GATEWAY_URL = 'https://gateway.example.com';
      process.env.AICR_API_KEY = 'gateway-key';
      process.env.GATEWAY_MODEL = 'custom-model';

      const config = getInterpreterConfig();

      expect(config.provider).toBe('aicr-gateway');
      expect(config.apiKey).toBe('gateway-key');
      expect(config.gatewayUrl).toBe('https://gateway.example.com');
      expect(config.model).toBe('custom-model');

      process.env = originalEnv;
    });

    it('should use Claude when AICR not configured', () => {
      const originalEnv = { ...process.env };
      process.env.ANTHROPIC_API_KEY = 'claude-key';
      process.env.CLAUDE_MODEL = 'claude-sonnet-4-5';

      const config = getInterpreterConfig();

      expect(config.provider).toBe('claude');
      expect(config.apiKey).toBe('claude-key');
      expect(config.model).toBe('claude-sonnet-4-5');

      process.env = originalEnv;
    });

    it('should default Claude model when not specified', () => {
      const originalEnv = { ...process.env };
      process.env.ANTHROPIC_API_KEY = 'claude-key';
      delete process.env.CLAUDE_MODEL;

      const config = getInterpreterConfig();

      expect(config.model).toBe('claude-sonnet-4-6');

      process.env = originalEnv;
    });

    it('should use OpenAI as fallback', () => {
      const originalEnv = { ...process.env };
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.OPENAI_MODEL = 'gpt-4o-mini';

      const config = getInterpreterConfig();

      expect(config.provider).toBe('openai');
      expect(config.apiKey).toBe('openai-key');
      expect(config.model).toBe('gpt-4o-mini');

      process.env = originalEnv;
    });

    it.skip('should fallback to Claude CLI when no API keys configured', () => {
      // This test is skipped because the code now explicitly requires ANTHROPIC_API_KEY
      // before calling Claude CLI. The CLI no longer falls back silently.
      // See src/excel/extractor.ts runClaudeCli() function.
    });
  });
});
