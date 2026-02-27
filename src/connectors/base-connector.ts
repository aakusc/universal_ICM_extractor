import type {
  IAuthConfig,
  IConnectionStatus,
  IConnector,
  IExtractOptions,
  IRawRule,
} from '../types/connector.js';
import type { VendorId } from '../types/normalized-schema.js';

/**
 * BaseConnector — abstract base class for all vendor connectors.
 *
 * Provides common lifecycle management and logging.
 * Subclasses implement the vendor-specific connect/extract/disconnect logic.
 */
export abstract class BaseConnector implements IConnector {
  abstract readonly vendor: VendorId;

  protected authConfig: IAuthConfig | null = null;
  protected isConnected = false;

  async connect(auth: IAuthConfig): Promise<IConnectionStatus> {
    this.authConfig = auth;
    try {
      const status = await this.doConnect(auth);
      this.isConnected = status.connected;
      return status;
    } catch (error) {
      this.isConnected = false;
      return {
        connected: false,
        vendor: this.vendor,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async extractRules(options: IExtractOptions): Promise<IRawRule[]> {
    if (!this.isConnected) {
      throw new Error(`${this.vendor} connector is not connected. Call connect() first.`);
    }
    return this.doExtractRules(options);
  }

  async listPlans(): Promise<Array<{ id: string; name: string }>> {
    if (!this.isConnected) {
      throw new Error(`${this.vendor} connector is not connected. Call connect() first.`);
    }
    return this.doListPlans();
  }

  async disconnect(): Promise<void> {
    await this.doDisconnect();
    this.isConnected = false;
    this.authConfig = null;
  }

  /** Vendor-specific connection logic */
  protected abstract doConnect(auth: IAuthConfig): Promise<IConnectionStatus>;

  /** Vendor-specific rule extraction logic */
  protected abstract doExtractRules(options: IExtractOptions): Promise<IRawRule[]>;

  /** Vendor-specific plan listing logic */
  protected abstract doListPlans(): Promise<Array<{ id: string; name: string }>>;

  /** Vendor-specific disconnect logic */
  protected abstract doDisconnect(): Promise<void>;
}
