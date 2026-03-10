import { config as loadDotenv } from 'dotenv';
import type { VendorId } from '../types/normalized-schema.js';
import type { IAuthConfig } from '../types/connector.js';
import type { IInterpreterConfig } from '../interpreter/concept-extractor.js';

loadDotenv();

/**
 * Require an environment variable to be set, throwing if missing.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Get authentication config for a vendor from environment variables.
 */
export function getVendorAuth(vendor: VendorId): IAuthConfig {
  switch (vendor) {
    case 'varicent':
      return {
        baseUrl: requireEnv('VARICENT_BASE_URL'),
        clientId: process.env.VARICENT_CLIENT_ID,
        clientSecret: process.env.VARICENT_CLIENT_SECRET,
      };
    case 'xactly':
      return {
        baseUrl: requireEnv('XACTLY_BASE_URL'),
        apiKey: process.env.XACTLY_API_KEY,
        apiSecret: process.env.XACTLY_API_SECRET,
      };
    case 'sap-successfactors':
      return {
        baseUrl: requireEnv('SAP_SF_BASE_URL'),
        clientId: process.env.SAP_SF_CLIENT_ID,
        clientSecret: process.env.SAP_SF_CLIENT_SECRET,
      };
    case 'captivateiq':
      return {
        baseUrl: 'https://api.captivateiq.com/ciq/v1',
        apiKey: requireEnv('CAPTIVATEIQ_API_TOKEN'),
      };
    case 'salesforce':
      return {
        baseUrl: requireEnv('SALESFORCE_BASE_URL'),
        clientId: process.env.SALESFORCE_CLIENT_ID,
        clientSecret: process.env.SALESFORCE_CLIENT_SECRET,
      };
  }
}

/**
 * Get AI interpreter configuration from environment variables.
 * Falls back to Claude CLI (no API key needed) if no env vars set.
 */
export function getInterpreterConfig(): IInterpreterConfig {
  if (process.env.AICR_GATEWAY_URL && process.env.AICR_API_KEY) {
    return {
      provider: 'aicr-gateway',
      apiKey: process.env.AICR_API_KEY,
      gatewayUrl: process.env.AICR_GATEWAY_URL,
      model: process.env.GATEWAY_MODEL ?? 'claude-sonnet-4-6',
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'claude',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    };
  }

  // Default: throw error - need at least one API provider configured
  throw new Error(
    'No AI provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or AICR_GATEWAY_URL+AICR_API_KEY'
  );
}

