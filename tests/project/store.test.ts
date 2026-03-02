/**
 * Tests for src/project/store.ts
 *
 * Mocks node:fs entirely with an in-memory Map so tests don't touch the disk.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── In-memory fs state (hoisted so the vi.mock factory can reference it) ─────

const fsState = vi.hoisted(() => ({
  files: new Map<string, string | Buffer>(),
  dirs: new Set<string>(),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: (p: string) => fsState.files.has(p) || fsState.dirs.has(p),
    mkdirSync: (p: string) => { fsState.dirs.add(p); },
    readFileSync: (p: string, enc?: string): string | Buffer => {
      const data = fsState.files.get(p);
      if (data === undefined) {
        const e = new Error(`ENOENT: no such file or directory '${p}'`) as NodeJS.ErrnoException;
        e.code = 'ENOENT';
        throw e;
      }
      if (typeof enc === 'string') {
        return typeof data === 'string' ? data : data.toString('utf-8');
      }
      return data;
    },
    writeFileSync: (p: string, data: string | Buffer) => { fsState.files.set(p, data); },
    unlinkSync: (p: string) => { fsState.files.delete(p); },
  },
}));

// Import store AFTER mock is set up
import {
  generateId,
  createProject, listProjects, getProject, updateProject, deleteProject,
  saveFile, getFile, listFiles, markFileParsed, deleteFile,
  addRequirement, listRequirements, deleteRequirement,
  addNote, listNotes, deleteNote,
  saveExtraction, getExtraction, listExtractionMeta, getProjectExtractions,
  saveGeneration, getGeneration,
  saveAggregatedGeneration, getAggregatedGeneration,
  DATA_DIR,
} from '../../src/project/store.js';
import type { ExtractionResult } from '../../src/project/types.js';
import type { CaptivateIQApiPayloads } from '../../src/generators/types.js';
import type { AggregatedProjectConfig } from '../../src/generators/aggregator.js';

// ── Reset in-memory fs before each test ──────────────────────────────────────

beforeEach(() => {
  fsState.files.clear();
  fsState.dirs.clear();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeExtractionResult(projectId: string, fileId: string): ExtractionResult {
  return {
    id: generateId(),
    projectId,
    fileId,
    extractedAt: new Date().toISOString(),
    workbook: {
      filename: 'test.xlsx',
      sheetNames: ['Sheet1'],
      sheets: [{ name: 'Sheet1', rowCount: 2, colCount: 2, data: [['A', 'B'], [1, 2]], formulas: [], namedRanges: [] }],
      namedRanges: [],
      summary: 'test summary',
    },
    rules: [],
    insights: 'Test insights',
    captivateiqConfig: {
      planStructure: { planName: 'Test Plan', periodType: 'annual', payoutComponents: ['base'], notes: '' },
      dataWorksheets: [],
      employeeAssumptionColumns: [],
      attributeWorksheets: [],
      formulaRecommendations: [],
    },
  };
}

function makePayloads(): CaptivateIQApiPayloads {
  return {
    plan: { name: 'Test', period_type: 'ANNUAL', status: 'draft' },
    periodGroup: { name: 'FY2025', period_type: 'ANNUAL', start_date: '2025-01-01', end_date: '2025-12-31' },
    dataWorksheets: [],
    employeeAssumptions: { _note: 'test', columns: [] },
    attributeWorksheets: [],
    formulaReference: { _note: 'test', formulas: [] },
    summary: {
      planName: 'Test', periodType: 'ANNUAL',
      dataWorksheetCount: 0, employeeAssumptionCount: 0,
      attributeWorksheetCount: 0, formulaCount: 0,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ── generateId ────────────────────────────────────────────────────────────────

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateId()).toBe('string');
    expect(generateId().length).toBeGreaterThan(0);
  });

  it('generates unique IDs on consecutive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateId()));
    expect(ids.size).toBe(20);
  });
});

// ── Projects ──────────────────────────────────────────────────────────────────

describe('projects', () => {
  it('creates and retrieves a project', () => {
    const p = createProject('Test Project', 'A description');
    expect(p.id).toBeTruthy();
    expect(p.name).toBe('Test Project');
    expect(p.description).toBe('A description');
    expect(p.createdAt).toBeTruthy();
    expect(p.updatedAt).toBeTruthy();

    const found = getProject(p.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('Test Project');
  });

  it('creates a project without description', () => {
    const p = createProject('No-desc project');
    expect(p.description).toBeUndefined();
  });

  it('lists projects sorted by updatedAt descending', () => {
    const p1 = createProject('First');
    const p2 = createProject('Second');
    const projects = listProjects();

    expect(projects).toHaveLength(2);
    const ids = projects.map((p) => p.id);
    expect(ids).toContain(p1.id);
    expect(ids).toContain(p2.id);
    // Verify descending invariant: each item's updatedAt >= the next
    for (let i = 0; i < projects.length - 1; i++) {
      expect(new Date(projects[i].updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(projects[i + 1].updatedAt).getTime()
      );
    }
  });

  it('returns undefined for unknown project id', () => {
    expect(getProject('nonexistent')).toBeUndefined();
  });

  it('updates a project name and description', () => {
    const p = createProject('Old Name');
    const updated = updateProject(p.id, { name: 'New Name', description: 'Updated' });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('New Name');
    expect(updated!.description).toBe('Updated');

    const fetched = getProject(p.id);
    expect(fetched!.name).toBe('New Name');
  });

  it('returns null when updating a non-existent project', () => {
    const result = updateProject('ghost-id', { name: 'X' });
    expect(result).toBeNull();
  });

  it('deletes a project and all its associated data', () => {
    const p = createProject('To Delete');
    const buf = Buffer.from('fake excel');
    const f = saveFile(p.id, 'file.xlsx', buf, 'application/octet-stream');

    const deleted = deleteProject(p.id);
    expect(deleted).toBe(true);
    expect(getProject(p.id)).toBeUndefined();
    expect(listFiles(p.id)).toHaveLength(0);
  });

  it('returns false when deleting a non-existent project', () => {
    expect(deleteProject('nonexistent')).toBe(false);
  });
});

// ── Files ─────────────────────────────────────────────────────────────────────

describe('files', () => {
  it('saves and retrieves a file', () => {
    const p = createProject('File Test');
    const buf = Buffer.from('dummy xlsx content');
    const f = saveFile(p.id, 'data.xlsx', buf, 'application/vnd.ms-excel');

    expect(f.id).toBeTruthy();
    expect(f.projectId).toBe(p.id);
    expect(f.originalName).toBe('data.xlsx');
    expect(f.size).toBe(buf.length);

    const fetched = getFile(f.id);
    expect(fetched).toBeDefined();
    expect(fetched!.originalName).toBe('data.xlsx');
  });

  it('lists files for a project', () => {
    const p = createProject('List Files');
    saveFile(p.id, 'a.xlsx', Buffer.from('a'), 'application/octet-stream');
    saveFile(p.id, 'b.xlsx', Buffer.from('b'), 'application/octet-stream');

    const files = listFiles(p.id);
    expect(files).toHaveLength(2);
    const names = files.map((f) => f.originalName);
    expect(names).toContain('a.xlsx');
    expect(names).toContain('b.xlsx');
  });

  it('lists only files for the given project', () => {
    const p1 = createProject('P1');
    const p2 = createProject('P2');
    saveFile(p1.id, 'a.xlsx', Buffer.from('x'), 'application/octet-stream');
    saveFile(p2.id, 'b.xlsx', Buffer.from('y'), 'application/octet-stream');

    expect(listFiles(p1.id)).toHaveLength(1);
    expect(listFiles(p2.id)).toHaveLength(1);
  });

  it('marks a file as parsed', () => {
    const p = createProject('Mark Parsed');
    const f = saveFile(p.id, 'test.xlsx', Buffer.from('x'), 'application/octet-stream');

    expect(getFile(f.id)!.parsedAt).toBeUndefined();
    markFileParsed(f.id);
    expect(getFile(f.id)!.parsedAt).toBeTruthy();
  });

  it('records a parse error on the file', () => {
    const p = createProject('Parse Error');
    const f = saveFile(p.id, 'bad.xlsx', Buffer.from('x'), 'application/octet-stream');

    markFileParsed(f.id, 'Failed to parse sheet');
    const fetched = getFile(f.id)!;
    expect(fetched.parsedAt).toBeTruthy();
    expect(fetched.parseError).toBe('Failed to parse sheet');
  });

  it('deletes a file and removes it from the list', () => {
    const p = createProject('Delete File');
    const f = saveFile(p.id, 'del.xlsx', Buffer.from('content'), 'application/octet-stream');

    expect(deleteFile(f.id)).toBe(true);
    expect(getFile(f.id)).toBeUndefined();
    expect(listFiles(p.id)).toHaveLength(0);
  });

  it('returns false when deleting a non-existent file', () => {
    expect(deleteFile('nonexistent')).toBe(false);
  });

  it('uses file extension from originalName', () => {
    const p = createProject('Ext Test');
    const f = saveFile(p.id, 'report.csv', Buffer.from('x'), 'text/csv');
    expect(f.storedName).toMatch(/\.csv$/);
  });
});

// ── Requirements ──────────────────────────────────────────────────────────────

describe('requirements', () => {
  it('adds and lists requirements for a project', () => {
    const p = createProject('Req Test');
    const r = addRequirement(p.id, 'Must support tiered rates', 'high');

    expect(r.id).toBeTruthy();
    expect(r.projectId).toBe(p.id);
    expect(r.text).toBe('Must support tiered rates');
    expect(r.priority).toBe('high');

    const reqs = listRequirements(p.id);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].text).toBe('Must support tiered rates');
  });

  it('defaults priority to medium', () => {
    const p = createProject('Default Priority');
    const r = addRequirement(p.id, 'Some requirement');
    expect(r.priority).toBe('medium');
  });

  it('lists only requirements for the given project', () => {
    const p1 = createProject('P1');
    const p2 = createProject('P2');
    addRequirement(p1.id, 'Req A');
    addRequirement(p2.id, 'Req B');

    expect(listRequirements(p1.id)).toHaveLength(1);
    expect(listRequirements(p2.id)).toHaveLength(1);
    expect(listRequirements(p1.id)[0].text).toBe('Req A');
  });

  it('deletes a requirement', () => {
    const p = createProject('Del Req');
    const r = addRequirement(p.id, 'Temp req');

    expect(deleteRequirement(r.id)).toBe(true);
    expect(listRequirements(p.id)).toHaveLength(0);
  });

  it('returns false when deleting non-existent requirement', () => {
    expect(deleteRequirement('ghost')).toBe(false);
  });
});

// ── Notes ─────────────────────────────────────────────────────────────────────

describe('notes', () => {
  it('adds and lists notes for a project', () => {
    const p = createProject('Note Test');
    const n = addNote(p.id, 'This plan uses an accelerator above 110%');

    expect(n.id).toBeTruthy();
    expect(n.projectId).toBe(p.id);
    expect(n.text).toBe('This plan uses an accelerator above 110%');
    expect(n.createdAt).toBeTruthy();

    const notes = listNotes(p.id);
    expect(notes).toHaveLength(1);
  });

  it('lists notes sorted by createdAt descending', () => {
    const p = createProject('Note Sort');
    const n1 = addNote(p.id, 'First note');
    const n2 = addNote(p.id, 'Second note');
    const notes = listNotes(p.id);

    expect(notes).toHaveLength(2);
    // Verify descending invariant: each item's createdAt >= the next
    for (let i = 0; i < notes.length - 1; i++) {
      expect(new Date(notes[i].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(notes[i + 1].createdAt).getTime()
      );
    }
  });

  it('deletes a note', () => {
    const p = createProject('Del Note');
    const n = addNote(p.id, 'Temp');
    expect(deleteNote(n.id)).toBe(true);
    expect(listNotes(p.id)).toHaveLength(0);
  });

  it('returns false when deleting a non-existent note', () => {
    expect(deleteNote('ghost')).toBe(false);
  });
});

// ── Extractions ───────────────────────────────────────────────────────────────

describe('extractions', () => {
  it('saves and retrieves an extraction', () => {
    const p = createProject('Extraction Test');
    const f = saveFile(p.id, 'plan.xlsx', Buffer.from('x'), 'application/octet-stream');
    const extraction = makeExtractionResult(p.id, f.id);

    saveExtraction(extraction);

    const fetched = getExtraction(p.id, f.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(extraction.id);
    expect(fetched!.insights).toBe('Test insights');
  });

  it('returns null for a missing extraction', () => {
    const p = createProject('No Extract');
    expect(getExtraction(p.id, 'file-id-123')).toBeNull();
  });

  it('replaces an old extraction when saving again for the same file', () => {
    const p = createProject('Replace Extract');
    const f = saveFile(p.id, 'plan.xlsx', Buffer.from('x'), 'application/octet-stream');

    const e1 = makeExtractionResult(p.id, f.id);
    e1.insights = 'Old insights';
    saveExtraction(e1);

    const e2 = makeExtractionResult(p.id, f.id);
    e2.insights = 'New insights';
    saveExtraction(e2);

    const fetched = getExtraction(p.id, f.id);
    expect(fetched!.insights).toBe('New insights');

    // Only one meta entry should exist
    const metas = listExtractionMeta(p.id);
    expect(metas).toHaveLength(1);
  });

  it('lists extraction metadata for a project', () => {
    const p = createProject('Meta List');
    const f1 = saveFile(p.id, 'a.xlsx', Buffer.from('a'), 'application/octet-stream');
    const f2 = saveFile(p.id, 'b.xlsx', Buffer.from('b'), 'application/octet-stream');

    saveExtraction(makeExtractionResult(p.id, f1.id));
    saveExtraction(makeExtractionResult(p.id, f2.id));

    const metas = listExtractionMeta(p.id);
    expect(metas).toHaveLength(2);
    const fileIds = metas.map((m) => m.fileId);
    expect(fileIds).toContain(f1.id);
    expect(fileIds).toContain(f2.id);
  });

  it('loads all extractions for a project via getProjectExtractions', () => {
    const p = createProject('All Extractions');
    const f1 = saveFile(p.id, 'a.xlsx', Buffer.from('a'), 'application/octet-stream');
    const f2 = saveFile(p.id, 'b.xlsx', Buffer.from('b'), 'application/octet-stream');

    const e1 = makeExtractionResult(p.id, f1.id);
    const e2 = makeExtractionResult(p.id, f2.id);
    e1.insights = 'Insights A';
    e2.insights = 'Insights B';
    saveExtraction(e1);
    saveExtraction(e2);

    const all = getProjectExtractions(p.id);
    expect(all).toHaveLength(2);
    const insights = all.map((e) => e.insights);
    expect(insights).toContain('Insights A');
    expect(insights).toContain('Insights B');
  });

  it('returns empty array for project with no extractions', () => {
    const p = createProject('Empty Extractions');
    expect(getProjectExtractions(p.id)).toEqual([]);
  });
});

// ── Generations ───────────────────────────────────────────────────────────────

describe('generations', () => {
  it('saves and retrieves a generation payload', () => {
    const p = createProject('Gen Test');
    const f = saveFile(p.id, 'rates.xlsx', Buffer.from('x'), 'application/octet-stream');
    const payloads = makePayloads();

    saveGeneration(p.id, f.id, payloads);

    const fetched = getGeneration(p.id, f.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.plan.name).toBe('Test');
  });

  it('returns null when no generation exists', () => {
    const p = createProject('No Gen');
    expect(getGeneration(p.id, 'file-x')).toBeNull();
  });

  it('overwrites an existing generation on re-save', () => {
    const p = createProject('Overwrite Gen');
    const f = saveFile(p.id, 'r.xlsx', Buffer.from('x'), 'application/octet-stream');

    const p1 = makePayloads();
    p1.plan.name = 'First';
    saveGeneration(p.id, f.id, p1);

    const p2 = makePayloads();
    p2.plan.name = 'Second';
    saveGeneration(p.id, f.id, p2);

    expect(getGeneration(p.id, f.id)!.plan.name).toBe('Second');
  });
});

// ── Aggregated Generations ────────────────────────────────────────────────────

describe('aggregated generations', () => {
  it('saves and retrieves an aggregated generation', () => {
    const p = createProject('Agg Gen Test');
    const payloads = makePayloads();
    const aggConfig: AggregatedProjectConfig = {
      projectId: p.id,
      sources: [{ fileId: 'f1', fileName: 'file1.xlsx', extractedAt: new Date().toISOString() }],
      aggregatedAt: new Date().toISOString(),
      mergedConfig: {
        planStructure: { planName: 'Agg Plan', periodType: 'annual', payoutComponents: [], notes: '' },
        dataWorksheets: [],
        employeeAssumptionColumns: [],
        attributeWorksheets: [],
        formulaRecommendations: [],
      },
      combinedInsights: 'Combined insights here',
      stats: { fileCount: 1, dataWorksheetCount: 0, employeeAssumptionCount: 0, attributeWorksheetCount: 0, formulaCount: 0 },
    };

    saveAggregatedGeneration(p.id, aggConfig, payloads);

    const fetched = getAggregatedGeneration(p.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.aggregatedConfig.combinedInsights).toBe('Combined insights here');
    expect(fetched!.payloads.plan.name).toBe('Test');
  });

  it('returns null when no aggregated generation exists', () => {
    const p = createProject('No Agg');
    expect(getAggregatedGeneration(p.id)).toBeNull();
  });
});
