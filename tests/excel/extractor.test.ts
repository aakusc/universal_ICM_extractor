/**
 * Tests for src/excel/extractor.ts
 *
 * Mocks node:child_process so no real Claude CLI calls are made.
 * Also tests parseAiResponse directly as a pure function.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ── Mock child_process (hoisted so it runs before imports) ───────────────────

const cpMock = vi.hoisted(() => {
  const mockSpawn = vi.fn();
  return { mockSpawn };
});

vi.mock('node:child_process', () => ({
  spawn: cpMock.mockSpawn,
}));

import { extractRulesFromWorkbook, parseAiResponse } from '../../src/excel/extractor.js';
import type { ExtractorInput } from '../../src/excel/extractor.js';
import type { ParsedWorkbook } from '../../src/project/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Create a fake child process that emits stdout/stderr data then exits.
 * Uses process.nextTick so listeners are attached before events fire.
 */
function fakeChild(stdout: string, exitCode = 0, stderr = '') {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.kill = vi.fn();

  process.nextTick(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    child.emit('close', exitCode);
  });

  return child;
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

// ── parseAiResponse (pure function — no mocking needed) ──────────────────────

describe('parseAiResponse', () => {
  it('parses valid JSON response', () => {
    const result = parseAiResponse(JSON.stringify(validAiResponse));
    expect(result.insights).toContain('tiered rate table');
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].concept).toBe('rate-table');
    expect(result.captivateiqConfig.planStructure.planName).toBe('Sales Commission Plan');
  });

  it('strips ```json code fences', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(validAiResponse)}\n\`\`\``;
    const result = parseAiResponse(fenced);
    expect(result.rules).toHaveLength(1);
    expect(result.captivateiqConfig.planStructure.planName).toBe('Sales Commission Plan');
  });

  it('strips plain ``` code fences (without language tag)', () => {
    const fenced = `\`\`\`\n${JSON.stringify(validAiResponse)}\n\`\`\``;
    const result = parseAiResponse(fenced);
    expect(result.insights).toBeTruthy();
  });

  it('extracts JSON from prose wrapper', () => {
    const withProse = `Here is the analysis:\n${JSON.stringify(validAiResponse)}\nEnd of analysis.`;
    const result = parseAiResponse(withProse);
    expect(result.insights).toContain('tiered rate table');
  });

  it('throws when text contains no JSON object', () => {
    expect(() => parseAiResponse('No JSON here at all')).toThrow();
  });

  it('throws when JSON is malformed', () => {
    expect(() => parseAiResponse('{not valid json{{')).toThrow();
  });
});

// ── extractRulesFromWorkbook (mocks child_process.spawn) ─────────────────────

describe('extractRulesFromWorkbook', () => {
  it('returns a well-formed ExtractionResult on success', async () => {
    cpMock.mockSpawn.mockReturnValue(fakeChild(JSON.stringify(validAiResponse)));

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

  it('spawns Claude CLI with expected arguments', async () => {
    cpMock.mockSpawn.mockReturnValue(fakeChild(JSON.stringify(validAiResponse)));

    await extractRulesFromWorkbook(baseInput);

    expect(cpMock.mockSpawn).toHaveBeenCalledOnce();
    const [bin, args] = cpMock.mockSpawn.mock.calls[0];
    expect(bin).toContain('claude');
    expect(args).toContain('--print');
    expect(args).toContain('--model');
    expect(args).toContain('claude-opus-4-6');
  });

  it('passes the prompt via stdin', async () => {
    const child = fakeChild(JSON.stringify(validAiResponse));
    cpMock.mockSpawn.mockReturnValue(child);

    await extractRulesFromWorkbook(baseInput);

    expect(child.stdin.write).toHaveBeenCalledOnce();
    const stdinContent = child.stdin.write.mock.calls[0][0];
    // Prompt should reference the workbook filename
    expect(stdinContent).toContain('commission_calculator.xlsx');
    // Prompt should include project requirements and notes
    expect(stdinContent).toContain('Must support quarterly periods');
    expect(stdinContent).toContain('Accelerator kicks in at 110%');
    expect(child.stdin.end).toHaveBeenCalledOnce();
  });

  it('handles code-fenced AI response', async () => {
    const fencedJson = `\`\`\`json\n${JSON.stringify(validAiResponse)}\n\`\`\``;
    cpMock.mockSpawn.mockReturnValue(fakeChild(fencedJson));

    const result = await extractRulesFromWorkbook(baseInput);
    expect(result.rules).toHaveLength(1);
    expect(result.captivateiqConfig.planStructure.planName).toBe('Sales Commission Plan');
  });

  it('throws when Claude CLI exits with non-zero code', async () => {
    cpMock.mockSpawn.mockReturnValue(fakeChild('', 1, 'Something went wrong'));

    await expect(extractRulesFromWorkbook(baseInput)).rejects.toThrow('Claude CLI exited with code 1');
  });

  it('throws when Claude CLI returns empty output', async () => {
    cpMock.mockSpawn.mockReturnValue(fakeChild('', 0));

    await expect(extractRulesFromWorkbook(baseInput)).rejects.toThrow('empty output');
  });

  it('defaults empty rules array when AI returns no rules field', async () => {
    const partialResponse = {
      insights: 'Partial response',
      captivateiqConfig: validAiResponse.captivateiqConfig,
      // rules field missing
    };
    cpMock.mockSpawn.mockReturnValue(fakeChild(JSON.stringify(partialResponse)));

    const result = await extractRulesFromWorkbook(baseInput);
    expect(result.rules).toEqual([]);
  });

  it('defaults empty captivateiqConfig when AI returns no config field', async () => {
    const partialResponse = {
      insights: 'Some insights',
      rules: [],
      // captivateiqConfig field missing
    };
    cpMock.mockSpawn.mockReturnValue(fakeChild(JSON.stringify(partialResponse)));

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
    cpMock.mockSpawn.mockReturnValue(fakeChild(JSON.stringify(validAiResponse)));

    const result = await extractRulesFromWorkbook(minimalInput);
    expect(result.insights).toBeTruthy();

    // Prompt should NOT include the requirements/notes headers
    const stdinContent = cpMock.mockSpawn.mock.calls[0]?.[2]?.stdin ??
      // stdin content was written to child.stdin.write
      (cpMock.mockSpawn.mock.results[0]?.value?.stdin?.write?.mock?.calls[0]?.[0] ?? '');
    // Fallback: read from the child mock
    const child = cpMock.mockSpawn.mock.results[0]?.value;
    const prompt = child?.stdin?.write?.mock?.calls?.[0]?.[0] ?? '';
    expect(prompt).not.toContain('## Project Requirements');
    expect(prompt).not.toContain('## Project Notes');
  });
});
