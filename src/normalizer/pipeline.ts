import type { IConnector, IAuthConfig, IExtractOptions } from '../types/connector.js';
import type { NormalizedPlan } from '../types/normalized-schema.js';
import { normalizedPlanSchema } from '../types/normalized-schema.js';
import { ConceptExtractor, type IInterpreterConfig } from '../interpreter/concept-extractor.js';

/**
 * Pipeline configuration.
 */
export interface IPipelineConfig {
  auth: IAuthConfig;
  interpreter: IInterpreterConfig;
  extractOptions?: IExtractOptions;
  planName?: string;
}

/**
 * Pipeline result with validation status.
 */
export interface IPipelineResult {
  plan: NormalizedPlan;
  stats: {
    rawRulesExtracted: number;
    rulesNormalized: number;
    avgConfidence: number;
    duration: number;
  };
  valid: boolean;
  validationErrors?: string[];
}

/**
 * Pipeline — orchestrates the full Extract → Interpret → Normalize workflow.
 *
 * Usage:
 *   const result = await Pipeline.run(connector, config);
 */
export class Pipeline {
  /**
   * Run the full extraction pipeline.
   */
  static async run(connector: IConnector, config: IPipelineConfig): Promise<IPipelineResult> {
    const startTime = Date.now();

    // Stage 1: Connect
    const connectionStatus = await connector.connect(config.auth);
    if (!connectionStatus.connected) {
      throw new Error(
        `Failed to connect to ${connector.vendor}: ${connectionStatus.error ?? 'Unknown error'}`
      );
    }

    try {
      // Stage 2: Extract raw rules
      const rawRules = await connector.extractRules(config.extractOptions ?? {});

      // Stage 3: Interpret via AI
      const extractor = new ConceptExtractor(config.interpreter);
      const normalizedRules = await extractor.interpretRules(rawRules);

      // Stage 4: Assemble normalized plan
      const plan: NormalizedPlan = {
        id: `${connector.vendor}-${config.extractOptions?.planId ?? 'all'}-${Date.now()}`,
        sourceVendor: connector.vendor,
        sourcePlanId: config.extractOptions?.planId ?? 'all',
        extractedAt: new Date().toISOString(),
        planName: config.planName ?? `${connector.vendor} Plan`,
        effectivePeriod: {
          start: config.extractOptions?.effectiveDate ?? new Date().toISOString().split('T')[0],
          end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        rules: normalizedRules,
        metadata: {
          connectorVersion: '0.1.0',
          apiVersion: connectionStatus.apiVersion,
        },
      };

      // Validate output against schema
      const validation = normalizedPlanSchema.safeParse(plan);
      const avgConfidence =
        normalizedRules.length > 0
          ? normalizedRules.reduce((sum, r) => sum + r.confidence, 0) / normalizedRules.length
          : 0;

      return {
        plan,
        stats: {
          rawRulesExtracted: rawRules.length,
          rulesNormalized: normalizedRules.length,
          avgConfidence,
          duration: Date.now() - startTime,
        },
        valid: validation.success,
        validationErrors: validation.success
          ? undefined
          : validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      };
    } finally {
      await connector.disconnect();
    }
  }
}
