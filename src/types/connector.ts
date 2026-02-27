import type { VendorId } from './normalized-schema.js';

/**
 * Authentication configuration for vendor connectors.
 */
export interface IAuthConfig {
  baseUrl: string;
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  [key: string]: unknown;
}

/**
 * Raw rule extracted from a vendor system — vendor-specific format.
 */
export interface IRawRule {
  vendorRuleId: string;
  vendorRuleType: string;
  planId: string;
  data: unknown;
}

/**
 * Extraction options passed to the connector.
 */
export interface IExtractOptions {
  planId?: string;
  planIds?: string[];
  effectiveDate?: string;
  includeInactive?: boolean;
}

/**
 * Connection status returned by the connector.
 */
export interface IConnectionStatus {
  connected: boolean;
  vendor: VendorId;
  authenticatedAs?: string;
  apiVersion?: string;
  error?: string;
}

/**
 * IConnector — the interface every vendor connector must implement.
 *
 * Lifecycle: connect() → extractRules() → disconnect()
 */
export interface IConnector {
  /** Which vendor this connector targets */
  readonly vendor: VendorId;

  /** Authenticate and establish connection to the vendor API */
  connect(auth: IAuthConfig): Promise<IConnectionStatus>;

  /** Extract raw rules from the vendor system */
  extractRules(options: IExtractOptions): Promise<IRawRule[]>;

  /** List available plan IDs in the vendor system */
  listPlans(): Promise<Array<{ id: string; name: string }>>;

  /** Clean up connection resources */
  disconnect(): Promise<void>;
}
