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
   */
  private async interpretSingleRule(rawRule: IRawRule): Promise<IInterpretedRule> {
    const prompt = this.buildPrompt(rawRule);

    try {
      const response = await this.callAiProvider(prompt);
      return this.parseResponse(response, rawRule);
    } catch (error) {
      console.error(`AI interpretation failed for rule ${rawRule.vendorRuleId}:`, error);
      return {
        concepts: [],
        description: `Uninterpreted rule: ${rawRule.vendorRuleType} (${rawRule.vendorRuleId})`,
        parameters: {},
        confidence: 0,
      };
    }
  }

  /**
   * Call the configured AI provider to interpret a rule.
   */
  private async callAiProvider(prompt: string): Promise<string> {
    switch (this.config.provider) {
      case 'claude':
        return this.callClaude(prompt);
      case 'aicr-gateway':
        return this.callAicrGateway(prompt);
      case 'openai':
        return this.callOpenAI(prompt);
      default:
        throw new Error(`Unknown AI provider: ${this.config.provider}`);
    }
  }

  /**
   * Call Anthropic Claude API.
   */
  private async callClaude(prompt: string): Promise<string> {
    const model = this.config.model || 'claude-sonnet-4-6';
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} ${error}`);
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content[0]?.text || '';
  }

  /**
   * Call AICR Gateway (custom endpoint).
   */
  private async callAicrGateway(prompt: string): Promise<string> {
    const url = this.config.gatewayUrl || 'http://localhost:3001/api/ai/interpret';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AICR Gateway error: ${response.status} ${error}`);
    }

    const data = await response.json() as { result: string };
    return data.result;
  }

  /**
   * Call OpenAI API (fallback).
   */
  private async callOpenAI(prompt: string): Promise<string> {
    const model = this.config.model || 'gpt-4o';
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Parse the AI response into an interpreted rule.
   */
  private parseResponse(response: string, rawRule: IRawRule): IInterpretedRule {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
                        response.match(/```\n([\s\S]*?)\n```/) ||
                        response.match(/\{[\s\S]*\}/);
      
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
      const parsed = JSON.parse(jsonStr);

      return {
        concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
        description: parsed.description || `Rule: ${rawRule.vendorRuleType}`,
        parameters: parsed.parameters || {},
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch (error) {
      console.error('Failed to parse AI response:', response.substring(0, 200));
      return {
        concepts: [],
        description: `Parse error for rule: ${rawRule.vendorRuleType} (${rawRule.vendorRuleId})`,
        parameters: {},
        confidence: 0,
      };
    }
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
