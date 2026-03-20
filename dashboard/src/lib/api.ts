/**
 * API client for ICM Services.
 * All requests proxy through Next.js rewrites to the Hono API on :3847.
 */

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Projects ──────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export const projects = {
  list: () => request<Project[]>('/projects'),
  get: (id: string) => request<Project>(`/projects/${id}`),
  create: (name: string, description?: string) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify({ name, description }) }),
  update: (id: string, data: Partial<Pick<Project, 'name' | 'description'>>) =>
    request<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/projects/${id}`, { method: 'DELETE' }),
};

// ── Files ─────────────────────────────────────────────

export interface ProjectFile {
  id: string;
  projectId: string;
  originalName: string;
  size: number;
  uploadedAt: string;
  parsedAt?: string;
  parseError?: string;
  category: string;
}

export const files = {
  list: (projectId: string) => request<ProjectFile[]>(`/projects/${projectId}/files`),
  upload: (projectId: string, name: string, data: string, type: string) =>
    request<ProjectFile>(`/projects/${projectId}/files`, {
      method: 'POST',
      body: JSON.stringify({ name, data, type }),
    }),
  delete: (projectId: string, fileId: string) =>
    request(`/projects/${projectId}/files/${fileId}`, { method: 'DELETE' }),
};

// ── Pipeline ──────────────────────────────────────────

export interface PipelineStatus {
  phase: string;
  progress?: { label: string; percent: number };
  error?: string;
}

export const pipeline = {
  status: (projectId: string) =>
    request<PipelineStatus>(`/projects/${projectId}/pipeline/status`),
};

/** Run pipeline via POST SSE. Returns abort handle. */
export function runPipeline(
  projectId: string,
  force: boolean,
  onEvent: (event: string, data: any) => void,
): { abort: () => void } {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        onEvent('error', { message: `HTTP ${res.status}` });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              onEvent(currentEvent, JSON.parse(line.slice(6)));
            } catch { /* ignore parse errors */ }
            currentEvent = '';
          }
        }
      }
      onEvent('done', {});
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onEvent('error', { message: err instanceof Error ? err.message : 'Pipeline failed' });
      }
    }
  })();
  return { abort: () => controller.abort() };
}

// ── Results ───────────────────────────────────────────

export const results = {
  get: (projectId: string) => request<any>(`/projects/${projectId}/results`),
  payloads: (projectId: string) => request<any>(`/projects/${projectId}/results/payloads`),
  completeness: (projectId: string) => request<any>(`/projects/${projectId}/results/completeness`),
  buildDoc: (projectId: string) => request<any>(`/projects/${projectId}/results/build-doc`),
};

// ── Context ───────────────────────────────────────────

export interface Requirement {
  id: string;
  text: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
}

export interface Note {
  id: string;
  text: string;
  createdAt: string;
}

export const context = {
  requirements: {
    list: (pid: string) => request<Requirement[]>(`/projects/${pid}/requirements`),
    add: (pid: string, text: string, priority?: string) =>
      request<Requirement>(`/projects/${pid}/requirements`, {
        method: 'POST', body: JSON.stringify({ text, priority }),
      }),
    delete: (pid: string, id: string) =>
      request(`/projects/${pid}/requirements/${id}`, { method: 'DELETE' }),
  },
  notes: {
    list: (pid: string) => request<Note[]>(`/projects/${pid}/notes`),
    add: (pid: string, text: string) =>
      request<Note>(`/projects/${pid}/notes`, {
        method: 'POST', body: JSON.stringify({ text }),
      }),
    delete: (pid: string, id: string) =>
      request(`/projects/${pid}/notes/${id}`, { method: 'DELETE' }),
  },
};

// ── BRD ───────────────────────────────────────────────

export const brd = {
  analyze: (projectId: string) =>
    request<any>(`/projects/${projectId}/brd/analyze`, { method: 'POST' }),
  generate: (projectId: string, answers: Array<{ questionId: string; answer: string }>) =>
    request<any>(`/projects/${projectId}/brd/generate`, {
      method: 'POST', body: JSON.stringify({ answers }),
    }),
  get: (projectId: string) => request<any>(`/projects/${projectId}/brd`),
  analysis: (projectId: string) => request<any>(`/projects/${projectId}/brd/analysis`),
};

// ── Tester (CaptivateIQ) ─────────────────────────────

export interface TesterConnectResult {
  connected: boolean;
  error?: string;
  authenticatedAs?: string;
  apiVersion?: string;
  plans: Array<{ id: string; name: string }>;
}

export interface TesterExtractResult {
  extractedAt: string;
  plans: any[];
  workbooks: any[];
  worksheets: any[];
  attributeWorksheets: any[];
  employeeCount: number;
}

export interface ComparisonItem {
  id: string;
  name: string;
  category: string;
  priority: 'required' | 'recommended' | 'informational';
  status: 'match' | 'partial' | 'mismatch' | 'missing-in-ciq' | 'extra-in-ciq' | 'not-applicable';
  planned: string | null;
  actual: string | null;
  details: string | null;
}

export interface ComparisonCategorySummary {
  category: string;
  displayName: string;
  total: number;
  matched: number;
  partial: number;
  mismatched: number;
  missingInCiq: number;
  extraInCiq: number;
  matchPercent: number;
}

export interface PlanTestResult {
  testedAt: string;
  projectId: string;
  ciqBaseUrl: string;
  trueToPlanScore: number;
  categorySummaries: ComparisonCategorySummary[];
  items: ComparisonItem[];
  mismatches: ComparisonItem[];
  missingInCiq: ComparisonItem[];
  extraInCiq: ComparisonItem[];
  liveSummary: {
    planCount: number;
    matchedPlanName: string | null;
    matchedPlanId: string | null;
    workbookCount: number;
    worksheetCount: number;
    attributeWorksheetCount: number;
    employeeCount: number;
  };
  counts: {
    total: number;
    matched: number;
    partial: number;
    mismatched: number;
    missingInCiq: number;
    extraInCiq: number;
    notApplicable: number;
  };
}

export const tester = {
  connect: (apiToken: string, baseUrl?: string) =>
    request<TesterConnectResult>('/tester/connect', {
      method: 'POST', body: JSON.stringify({ apiToken, baseUrl }),
    }),
  extract: (apiToken: string, baseUrl?: string) =>
    request<TesterExtractResult>('/tester/extract', {
      method: 'POST', body: JSON.stringify({ apiToken, baseUrl }),
    }),
  compare: (projectId: string, extractionData: any, selectedPlanIds: string[]) =>
    request<PlanTestResult>(`/projects/${projectId}/tester/compare`, {
      method: 'POST', body: JSON.stringify({ extractionData, selectedPlanIds }),
    }),
};

// ── Profiles ─────────────────────────────────────────

export interface Profile {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  data?: any;
}

export const profiles = {
  list: () => request<Profile[]>('/profiles'),
  get: (id: string) => request<Profile>(`/profiles/${id}`),
  save: (name: string, description?: string, data?: any) =>
    request<Profile>('/profiles', {
      method: 'POST', body: JSON.stringify({ name, description, data }),
    }),
  delete: (id: string) => request(`/profiles/${id}`, { method: 'DELETE' }),
};

// ── Helpers ───────────────────────────────────────────

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data:...;base64, prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** SWR fetcher */
export const fetcher = <T>(url: string) => request<T>(url.replace('/api', ''));
