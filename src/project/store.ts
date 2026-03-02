/**
 * ICM Builder — File-based JSON store
 *
 * Simple persistence layer using:
 *   data/store.json            → project/file/requirement/note metadata
 *   data/files/<id>.xlsx       → uploaded Excel files (raw bytes)
 *   data/extractions/<id>.json → AI extraction results (large)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  StoreData, Project, ProjectFile, Requirement, Note, ExtractionResult,
} from './types.js';
import type { CaptivateIQApiPayloads } from '../generators/types.js';
import type { AggregatedProjectConfig } from '../generators/aggregator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const FILES_DIR = path.join(DATA_DIR, 'files');
const EXTRACTIONS_DIR = path.join(DATA_DIR, 'extractions');
const GENERATIONS_DIR = path.join(DATA_DIR, 'generations');

const EMPTY_STORE: StoreData = {
  projects: [], files: [], requirements: [], notes: [], extractionMeta: [],
};

function ensureDirs(): void {
  for (const dir of [DATA_DIR, FILES_DIR, EXTRACTIONS_DIR, GENERATIONS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function emptyStore(): StoreData {
  return { projects: [], files: [], requirements: [], notes: [], extractionMeta: [] };
}

function readStore(): StoreData {
  ensureDirs();
  if (!fs.existsSync(STORE_FILE)) return emptyStore();
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as StoreData;
  } catch {
    return emptyStore();
  }
}

function writeStore(data: StoreData): void {
  ensureDirs();
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Projects ──────────────────────────────────────────────────

export function listProjects(): Project[] {
  return readStore().projects.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getProject(id: string): Project | undefined {
  return readStore().projects.find((p) => p.id === id);
}

export function createProject(name: string, description?: string): Project {
  const store = readStore();
  const project: Project = {
    id: generateId(),
    name,
    description,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.projects.push(project);
  writeStore(store);
  return project;
}

export function updateProject(
  id: string,
  updates: Partial<Pick<Project, 'name' | 'description'>>
): Project | null {
  const store = readStore();
  const idx = store.projects.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  store.projects[idx] = {
    ...store.projects[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  return store.projects[idx];
}

export function deleteProject(id: string): boolean {
  const store = readStore();
  const before = store.projects.length;
  // Clean up all file blobs on disk
  store.files
    .filter((f) => f.projectId === id)
    .forEach((f) => {
      const fp = path.join(FILES_DIR, f.storedName);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
  // Clean up extraction files on disk
  store.extractionMeta
    .filter((e) => e.projectId === id)
    .forEach((e) => {
      const ep = path.join(EXTRACTIONS_DIR, `${e.id}.json`);
      if (fs.existsSync(ep)) fs.unlinkSync(ep);
    });
  store.projects = store.projects.filter((p) => p.id !== id);
  store.files = store.files.filter((f) => f.projectId !== id);
  store.requirements = store.requirements.filter((r) => r.projectId !== id);
  store.notes = store.notes.filter((n) => n.projectId !== id);
  store.extractionMeta = store.extractionMeta.filter((e) => e.projectId !== id);
  writeStore(store);
  return store.projects.length < before;
}

// ── Files ─────────────────────────────────────────────────────

export function listFiles(projectId: string): ProjectFile[] {
  return readStore().files.filter((f) => f.projectId === projectId);
}

export function getFile(id: string): ProjectFile | undefined {
  return readStore().files.find((f) => f.id === id);
}

export function saveFile(
  projectId: string,
  originalName: string,
  buffer: Buffer,
  mimeType: string
): ProjectFile {
  ensureDirs();
  const id = generateId();
  const ext = path.extname(originalName) || '.xlsx';
  const storedName = `${id}${ext}`;
  fs.writeFileSync(path.join(FILES_DIR, storedName), buffer);

  const store = readStore();
  const file: ProjectFile = {
    id,
    projectId,
    originalName,
    storedName,
    mimeType,
    size: buffer.length,
    uploadedAt: new Date().toISOString(),
  };
  store.files.push(file);
  writeStore(store);
  return file;
}

export function getFilePath(storedName: string): string {
  return path.join(FILES_DIR, storedName);
}

export function markFileParsed(id: string, error?: string): void {
  const store = readStore();
  const file = store.files.find((f) => f.id === id);
  if (!file) return;
  file.parsedAt = new Date().toISOString();
  if (error) file.parseError = error;
  writeStore(store);
}

export function deleteFile(id: string): boolean {
  const store = readStore();
  const file = store.files.find((f) => f.id === id);
  if (!file) return false;
  const fp = path.join(FILES_DIR, file.storedName);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  store.files = store.files.filter((f) => f.id !== id);
  // Also remove any extractions for this file
  store.extractionMeta
    .filter((e) => e.fileId === id)
    .forEach((e) => {
      const ep = path.join(EXTRACTIONS_DIR, `${e.id}.json`);
      if (fs.existsSync(ep)) fs.unlinkSync(ep);
    });
  store.extractionMeta = store.extractionMeta.filter((e) => e.fileId !== id);
  writeStore(store);
  return true;
}

// ── Requirements ──────────────────────────────────────────────

export function listRequirements(projectId: string): Requirement[] {
  return readStore().requirements.filter((r) => r.projectId === projectId);
}

export function addRequirement(
  projectId: string,
  text: string,
  priority: Requirement['priority'] = 'medium'
): Requirement {
  const store = readStore();
  const req: Requirement = {
    id: generateId(), projectId, text, priority,
    createdAt: new Date().toISOString(),
  };
  store.requirements.push(req);
  writeStore(store);
  return req;
}

export function deleteRequirement(id: string): boolean {
  const store = readStore();
  const before = store.requirements.length;
  store.requirements = store.requirements.filter((r) => r.id !== id);
  writeStore(store);
  return store.requirements.length < before;
}

// ── Notes ─────────────────────────────────────────────────────

export function listNotes(projectId: string): Note[] {
  return readStore().notes
    .filter((n) => n.projectId === projectId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function addNote(projectId: string, text: string): Note {
  const store = readStore();
  const note: Note = {
    id: generateId(), projectId, text,
    createdAt: new Date().toISOString(),
  };
  store.notes.push(note);
  writeStore(store);
  return note;
}

export function deleteNote(id: string): boolean {
  const store = readStore();
  const before = store.notes.length;
  store.notes = store.notes.filter((n) => n.id !== id);
  writeStore(store);
  return store.notes.length < before;
}

// ── Extractions ───────────────────────────────────────────────

export function saveExtraction(extraction: ExtractionResult): void {
  ensureDirs();
  const store = readStore();
  // Remove old extraction for the same (project, file) pair
  const oldMeta = store.extractionMeta.find(
    (e) => e.projectId === extraction.projectId && e.fileId === extraction.fileId
  );
  if (oldMeta) {
    const oldPath = path.join(EXTRACTIONS_DIR, `${oldMeta.id}.json`);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    store.extractionMeta = store.extractionMeta.filter((e) => e.id !== oldMeta.id);
  }
  fs.writeFileSync(
    path.join(EXTRACTIONS_DIR, `${extraction.id}.json`),
    JSON.stringify(extraction, null, 2)
  );
  store.extractionMeta.push({
    id: extraction.id,
    projectId: extraction.projectId,
    fileId: extraction.fileId,
    extractedAt: extraction.extractedAt,
  });
  writeStore(store);
}

export function getExtraction(projectId: string, fileId: string): ExtractionResult | null {
  const store = readStore();
  const meta = store.extractionMeta.find(
    (e) => e.projectId === projectId && e.fileId === fileId
  );
  if (!meta) return null;
  const ep = path.join(EXTRACTIONS_DIR, `${meta.id}.json`);
  if (!fs.existsSync(ep)) return null;
  try {
    return JSON.parse(fs.readFileSync(ep, 'utf-8')) as ExtractionResult;
  } catch {
    return null;
  }
}

export function listExtractionMeta(
  projectId: string
): Array<{ id: string; fileId: string; extractedAt: string }> {
  return readStore().extractionMeta.filter((e) => e.projectId === projectId);
}

// ── Generations ────────────────────────────────────────────────
// Stored as data/generations/<projectId>-<fileId>.json

function generationPath(projectId: string, fileId: string): string {
  return path.join(GENERATIONS_DIR, `${projectId}-${fileId}.json`);
}

export function saveGeneration(
  projectId: string,
  fileId: string,
  payloads: CaptivateIQApiPayloads
): void {
  ensureDirs();
  fs.writeFileSync(generationPath(projectId, fileId), JSON.stringify(payloads, null, 2));
}

export function getGeneration(
  projectId: string,
  fileId: string
): CaptivateIQApiPayloads | null {
  const p = generationPath(projectId, fileId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as CaptivateIQApiPayloads;
  } catch {
    return null;
  }
}

// ── Multi-file: load all extractions for a project ────

/**
 * Load all ExtractionResult objects for a project (one per extracted file).
 * Silently skips any extraction whose JSON file is missing or corrupt.
 */
export function getProjectExtractions(projectId: string): ExtractionResult[] {
  const store = readStore();
  const metas = store.extractionMeta.filter((e) => e.projectId === projectId);
  const results: ExtractionResult[] = [];
  for (const meta of metas) {
    const ep = path.join(EXTRACTIONS_DIR, `${meta.id}.json`);
    if (!fs.existsSync(ep)) continue;
    try {
      results.push(JSON.parse(fs.readFileSync(ep, 'utf-8')) as ExtractionResult);
    } catch {
      // skip corrupt file
    }
  }
  return results;
}

// ── Aggregated Generations ────────────────────────────
// Stored as data/generations/<projectId>-aggregated.json

interface SavedAggregation {
  aggregatedConfig: AggregatedProjectConfig;
  payloads: CaptivateIQApiPayloads;
}

function aggregationPath(projectId: string): string {
  return path.join(GENERATIONS_DIR, `${projectId}-aggregated.json`);
}

export function saveAggregatedGeneration(
  projectId: string,
  aggregatedConfig: AggregatedProjectConfig,
  payloads: CaptivateIQApiPayloads,
): void {
  ensureDirs();
  const data: SavedAggregation = { aggregatedConfig, payloads };
  fs.writeFileSync(aggregationPath(projectId), JSON.stringify(data, null, 2));
}

export function getAggregatedGeneration(
  projectId: string,
): SavedAggregation | null {
  const p = aggregationPath(projectId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as SavedAggregation;
  } catch {
    return null;
  }
}
