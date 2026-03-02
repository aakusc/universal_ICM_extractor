/**
 * Tests for src/excel/extractor.ts
 *
 * Mocks @anthropic-ai/sdk entirely — no real API calls made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock Anthropic SDK (hoisted so it runs before imports) ───────────────────

const anthropicMocks = vi.hoisted(() => {
  const mockFinalMessage = vi.fn();
  // stream.on() is a fluent API — return `this`
  const mockOn = vi.fn().mockReturnThis();
  const mockStreamInstance = { on: mockOn, finalMessage: mockFinalMessage };
  const mockStream = vi.fn().mockReturnValue(mockStreamInstance);
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: { stream: mockStream },
  }));
  return { MockAnthropic, mockStream, mockFinalMessage, mockOn, mockStreamInstance };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: anthropicMocks.MockAnthropic,
}));

import { extractRulesFromWorkbook } from '../../src/excel/extractor.js';
import type { ExtractorInput } from '../../src/excel/extractor.js';
import type { ParsedWorkbook } from '../../src/project/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockWorkbook: ParsedWorkbook = {
  filename: 'commission_calculator.xlsx',
  sheetNames: ['Rates', 'Quotas'],
  sheets: [
    {
      name: 'Rates',
      rowCount: 3,
      colCount: 2,
      data: [['Tier', 'Rate'], ['Bronze', 0.05], ['Gold', 0.1]],
      formulas: [],
      namedRanges: [],
    },
    {
      name: 'Quotas',
      rowCount: 2,
      colCount: 1,
      data: [['Quota'], [50000]],
      formulas: [],
      namedRanges: [],
    },
  ],
  namedRanges: [],
  summary: 'File: commission_calculator.xlsx',
};

const baseInput: ExtractorInput = {
  projectId: 'proj-123',
  fileId: 'file-456',
  workbook: mockWorkbook,
  requirements: [{ text: 'Must support quarterly periods', priority: 'high' }],
  notes: [{ text: 'Accelerator kicks in at 110%', createdAt: '2025-01-01T00:00:00.000Z' }],
};

const validAiResponse = {
  insights: 'This compensation plan uses a tiered rate table with two tiers.',
  rules: [
    {
      id: 'tier-rate-table',
      concept: 'rate-table',
      description: 'Commission rate lookup by tier',
      parameters: { tiers: [{ min: 0, max: 100, rate: 0.05 }] },
      confidence: 0.9,
      sourceRef: {
        vendorRuleId: 'Rates!A1:B3',
        vendorRuleType: 'EXCEL_TABLE',
        rawSnapshot: { sheet: 'Rates', cells: 'A1:B3' },
      },
    },
  ],
  captivateiqConfig: {
    planStructure: {
      planName: 'Sales Commission Plan',
      periodType: 'quarterly',
      payoutComponents: ['base commission', 'accelerator'],
      notes: 'Quarterly payout with tiered rates',
    },
    dataWorksheets: [
      {
        name: 'Commission Rates',
        description: 'Rate lookup table',
        concept: 'rate-table',
        columns: [{ name: 'Tier', type: 'text' }, { name: 'Rate', type: 'percent' }],
        sampleRows: [{ Tier: 'Bronze', Rate: 0.05 }],
        apiPayload: {},
      },
    ],
    employeeAssumptionColumns: [
      { name: 'Annual Quota', type: 'currency', description: 'Rep quota', concept: 'quota-target', exampleValue: 50000 },
    ],
    attributeWorksheets: [],
    formulaRecommendations: [
      {
        concept: 'accelerator',
        description: 'Rate multiplier above 110% attainment',
        logicExplanation: 'If attainment > 110%, apply 1.5x multiplier',
        pseudoFormula: 'IF(attainment > 1.1, base_rate * 1.5, base_rate)',
        captivateiqNotes: 'Use SmartGrid IF formula on attainment column',
      },
    ],
  },
};

// ── Setup/Teardown ────────────────────────────────────────────────────────────

beforeEach(() => {
  // Set a fake API key so the function doesn't throw immediately
  process.env.ANTHROPIC_API_KEY = 'sk-test-fake-key';

  // Suppress console output during tests
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

  // Reset mock call counts
  vi.clearAllMocks();

  // Restore mock implementations after clearAllMocks wipes them
  anthropicMocks.MockAnthropic.mockImplementation(() => ({
    messages: { stream: anthropicMocks.mockStream },
  }));
  anthropicMocks.mockStream.mockReturnValue(anthropicMocks.mockStreamInstance);
  anthropicMocks.mockOn.mockReturnThis();
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('extractRulesFromWorkbook', () => {
  it('returns a well-formed ExtractionResult on success', async () => {
    anthropicMocks.mockFinalMessage.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validAiResponse) }],
    });

    const result = await extractRulesFromWorkbook(baseInput);

    expect(result.projectId).toBe('proj-123');
    expect(result.fileId).toBe('file-456');
    expect(result.id).toBeTruthy();
    expect(result.extractedAt).toBeTruthy();
    expect(result.workbook.filename).toBe('commission_calculator.xlsx');
    expect(result.insights).toContain('tiered rate table');
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].concept).toBe('rate-table');
    expect(result.captivateiqConfig.planStructure.planName).toBe('Sales Commission Plan');
    expect(result.captivateiqConfig.dataWorksheets).toHaveLength(1);
    expect(result.captivateiqConfig.employeeAssumptionColumns).toHaveLength(1);
    expect(result.captivateiqConfig.formulaRecommendations).toHaveLength(1);
  });

  it('constructs the Anthropic client with the API key', async () => {
    anthropicMocks.mockFinalMessage.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validAiResponse) }],
    });

    await extractRulesFromWorkbook(baseInput);

    expect(anthropicMocks.MockAnthropic).toHaveBeenCalledWith({ apiKey: 'sk-test-fake-key' });
  });

  it('calls messages.stream with expected parameters', async () => {
    anthropicMocks.mockFinalMessage.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validAiResponse) }],
    });

    await extractRulesFromWorkbook(baseInput);

    expect(anthropicMocks.mockStream).toHaveBeenCalledOnce();
    const [callArgs] = anthropicMocks.mockStream.mock.calls[0];
    expect(callArgs.model).toBe('claude-opus-4-6');
    expect(callArgs.max_tokens).toBeGreaterThan(0);
    expect(callArgs.messages[0].role).toBe('user');
    // Prompt should reference the workbook filename
    expect(callArgs.messages[0].content).toContain('commission_calculator.xlsx');
    // Prompt should include project requirements and notes
    expect(callArgs.messages[0].content).toContain('Must support quarterly periods');
    expect(callArgs.messages[0].content).toContain('Accelerator kicks in at 110%');
  });

  it('strips markdown code fences from the AI response', async () => {
    const fencedJson = `\`\`\`json\n${JSON.stringify(validAiResponse)}\n\`\`\``;
    anthropicMocks.mockFinalMessage.mockResolvedValue({
      content: [{ type: 'text', text: fencedJson }],
    });

    const result = await extractRulesFromWorkbook(baseInput);
    expect(result.rules).toHaveLength(1);
    expect(result.captivateiqConfig.planStructure.planName).toBe('Sales Commission Plan');
  });

  it('strips plain ``` code fences (without language tag)', async () => {
    const fencedJson = `\`\`\`\n${JSON.stringify(validAiResponse)}\n\`\`\``;
    anthropicMocks.mockFinalMessage.mockResolvedValue({
      content: [{ type: 'text', text: fencedJson }],
    });

    const result = await extractRulesFromWorkbook(baseInput);
    expect(result.insights).toBeTruthy();
  });

  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(extractRulesFromWorkbook(baseInput)).rejects.toThrow('ANTHROPIC_API_KEY');
  });

  it('throws when the AI response contains no text block', async () => {
    anthropicMocks.mockFinalMessage.mockResolvedValue({
      // Only a thinking block, no text
      content: [{ type: 'thinking', thinking: 'some chain of thought' }],
    });

    await expect(extractRulesFromWorkbook(baseInput)).rejects.toThrow('No text content');
  });

  it('throws when the AI response text is not valid JSON', async () => {
    anthropicMocks.mockFinalMessage.mockResolvedValue({
      content: [{ type: 'text', text: 'Here is my analysis: NOT JSON {}{{' }],
    });

    await expect(extractRulesFromWorkbook(baseInput)).rejects.toThrow('not valid JSON');
  });

  it('defaults empty rules array when AI returns no rules field', async () => {
    const partialResponse = {
      insights: 'Partial response',
      captivateiqConfig: validAiResponse.captivateiqConfig,
      // rules field missing
    };
    anthropicMocks.mockFinalMessage.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(partialResponse) }],
    });

    const result = await extractRulesFromWorkbook(baseInput);
    expect(result.rules).toEqual([]);
  });

  it('defaults empty captivateiqConfig when AI returns no config field', async () => {
    const partialResponse = {
      insights: 'Some insights',
      rules: [],
      // captivateiqConfig field missing
    };
    anthropicMocks.mockFinalMessage.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(partialResponse) }],
    });

    const result = await extractRulesFromWorkbook(baseInput);
    expect(result.captivateiqConfig.dataWorksheets).toEqual([]);
    expect(result.captivateiqConfig.formulaRecommendations).toEqual([]);
  });

  it('works with no requirements or notes', async () => {
    const minimalInput: ExtractorInput = {
      ...baseInput,
      requirements: [],
      notes: [],
    };
    anthropicMocks.mockFinalMessage.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validAiResponse) }],
    });

    const result = await extractRulesFromWorkbook(minimalInput);
    expect(result.insights).toBeTruthy();

    // Prompt should NOT include the requirements/notes headers
    const [callArgs] = anthropicMocks.mockStream.mock.calls[0];
    expect(callArgs.messages[0].content).not.toContain('## Project Requirements');
    expect(callArgs.messages[0].content).not.toContain('## Project Notes');
  });
});
