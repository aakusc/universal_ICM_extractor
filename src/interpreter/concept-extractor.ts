import type { IRawRule } from '../types/connector.js';
import type { NormalizedRule, RuleConcept } from '../types/normalized-schema.js';

/**
 * AI interpretation result for a single raw rule.
 */
export interface IInterpretedRule {
  concepts: RuleConcept[];
  description: string;
  parameters: Record<string, unknown>;
  confidence: number;
}

/**
 * Configuration for the AI interpreter.
 */
export interface IInterpreterConfig {
  provider: 'claude' | 'aicr-gateway' | 'openai';
  apiKey: string;
  gatewayUrl?: string;
  model?: string;
  maxConcurrent?: number;
}

/**
 * ConceptExtractor — uses AI to interpret raw vendor rules into business concepts.
 *
 * This is the core innovation of the Universal ICM Connector.
 * Instead of brittle field mappings, the extractor uses LLM reasoning
 * to understand rule intent and classify it into the concept taxonomy.
 */
export class ConceptExtractor {
  private config: IInterpreterConfig;

  constructor(config: IInterpreterConfig) {
    this.config = config;
  }

  /**
   * Interpret a batch of raw vendor rules into normalized rule concepts.
   */
  async interpretRules(rawRules: IRawRule[]): Promise<NormalizedRule[]> {
    const results: NormalizedRule[] = [];

    for (const rawRule of rawRules) {
      const interpreted = await this.interpretSingleRule(rawRule);

      for (const concept of interpreted.concepts) {
        results.push({
          id: `${rawRule.planId}-${rawRule.vendorRuleId}-${concept}`,
          concept,
          description: interpreted.description,
          parameters: interpreted.parameters,
          confidence: interpreted.confidence,
          sourceRef: {
            vendorRuleId: rawRule.vendorRuleId,
            vendorRuleType: rawRule.vendorRuleType,
            rawSnapshot: rawRule.data,
          },
        });
      }
    }

    return results;
  }

  /**
   * Interpret a single raw rule. Uses the AI provider to analyze the rule
   * and extract business intent.
   *
   * TODO: Implement AI provider calls (Claude API, AICR Gateway, OpenAI fallback)
   */
  private async interpretSingleRule(rawRule: IRawRule): Promise<IInterpretedRule> {
    // Placeholder — will call AI provider with rule interpretation prompt
    // The prompt provides the rule concept taxonomy and asks the AI to:
    // 1. Identify which concept(s) the rule represents
    // 2. Generate a plain-English description of the rule intent
    // 3. Extract structured parameters matching the concept schema
    // 4. Assign a confidence score

    const _prompt = this.buildPrompt(rawRule);

    // TODO: Call AI provider
    // const response = await this.callAiProvider(prompt);
    // return this.parseResponse(response);

    return {
      concepts: [],
      description: `Uninterpreted rule: ${rawRule.vendorRuleType} (${rawRule.vendorRuleId})`,
      parameters: {},
      confidence: 0,
    };
  }

  /**
   * Build the interpretation prompt for a raw rule.
   */
  private buildPrompt(rawRule: IRawRule): string {
    return [
      'You are an expert in Sales Performance Management and Incentive Compensation Management.',
      'Analyze the following compensation rule extracted from a vendor ICM system.',
      '',
      'Rule data:',
      JSON.stringify(rawRule.data, null, 2),
      '',
      `Vendor rule type: ${rawRule.vendorRuleType}`,
      `Vendor rule ID: ${rawRule.vendorRuleId}`,
      '',
      'Classify this rule into one or more of the following concepts:',
      '- rate-table: Commission rate lookup (flat, tiered, matrix)',
      '- accelerator: Rate increase above quota threshold',
      '- decelerator: Rate decrease below quota threshold',
      '- qualifier: Gate condition for eligibility',
      '- split: Credit splitting between reps/roles',
      '- territory: Geographic or account assignment rules',
      '- quota-target: Quota definition and allocation',
      '- draw: Guaranteed minimum / recoverable draw',
      '- spif: Special incentive / bonus / contest',
      '- cap: Maximum earning limit',
      '- floor: Minimum earning guarantee',
      '- clawback: Commission recovery rule',
      '',
      'Respond with JSON:',
      '{',
      '  "concepts": ["concept-id", ...],',
      '  "description": "Plain-English description of the rule intent",',
      '  "parameters": { ...concept-specific parameters },',
      '  "confidence": 0.0-1.0',
      '}',
    ].join('\n');
  }
}
