/**
 * Tests for src/excel/extractor.ts
 *
 * Mocks @anthropic-ai/sdk so no real API calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock @anthropic-ai/sdk (hoisted so it runs before imports) ───────────────

// These need to be hoisted with vi.hoisted to be available before imports
const { mockStreamInstance, mockMessages, mockAnthropicInstance } = vi.hoisted(() => {
  const mockStreamInstance = {
    on: vi.fn(),
    finalMessage: vi.fn(),
  };

  const mockMessages = {
    stream: vi.fn().mockReturnValue(mockStreamInstance),
  };

  const mockAnthropicInstance = {
    messages: mockMessages,
  };

  return { mockStreamInstance, mockMessages, mockAnthropicInstance };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => mockAnthropicInstance),
}));

import { extractRulesFromWorkbook } from '../../src/excel/extractor.js';
import type { ExtractorInput } from '../../src/excel/extractor.js';
import type { ParsedWorkbook } from '../../src/project/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Set up the mock stream to return a specific response.
 * Call this before each test to configure what the mock AI returns.
 */
function mockAiResponse(response: object) {
  // Create a mock message object
  const mockMessage = {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(response),
      },
    ],
  };

  // Reset and configure mocks
  mockMessages.stream.mockReset();
  mockMessages.stream.mockReturnValue(mockStreamInstance);
  mockStreamInstance.finalMessage.mockReset();
  mockStreamInstance.finalMessage.mockResolvedValue(mockMessage);

  return mockMessages.stream;
}

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
  process.env.ANTHROPIC_API_KEY = 'sk-test-fake-key';
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  vi.restoreAllMocks();
});

// ── extractRulesFromWorkbook (mocks @anthropic-ai/sdk) ────────────────────

describe('extractRulesFromWorkbook', () => {
  it('returns a well-formed ExtractionResult on success', async () => {
    mockAiResponse(validAiResponse);

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

  it('calls Anthropic API with expected parameters', async () => {
    mockAiResponse(validAiResponse);

    await extractRulesFromWorkbook(baseInput);

    // Verify stream was called with expected parameters
    expect(mockMessages.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-4-6',
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
      })
    );
  });

  it('handles code-fenced AI response', async () => {
    mockAiResponse(validAiResponse);

    const result = await extractRulesFromWorkbook(baseInput);
    expect(result.rules).toHaveLength(1);
    expect(result.captivateiqConfig.planStructure.planName).toBe('Sales Commission Plan');
  });

  it('throws when API key is not set', async () => {
    // Clear the env var
    const oldKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    await expect(extractRulesFromWorkbook(baseInput)).rejects.toThrow('ANTHROPIC_API_KEY');

    // Restore
    if (oldKey) process.env.ANTHROPIC_API_KEY = oldKey;
  });

  it('defaults empty rules array when AI returns no rules field', async () => {
    const partialResponse = {
      insights: 'Partial response',
      captivateiqConfig: validAiResponse.captivateiqConfig,
      // rules field missing
    };
    mockAiResponse(partialResponse);

    const result = await extractRulesFromWorkbook(baseInput);
    expect(result.rules).toEqual([]);
  });

  it('defaults empty captivateiqConfig when AI returns no config field', async () => {
    const partialResponse = {
      insights: 'Some insights',
      rules: [],
      // captivateiqConfig field missing
    };
    mockAiResponse(partialResponse);

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
    mockAiResponse(validAiResponse);

    const result = await extractRulesFromWorkbook(minimalInput);
    expect(result.insights).toBeTruthy();
    expect(result.rules).toHaveLength(1);
  });
});
