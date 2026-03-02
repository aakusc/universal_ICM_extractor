import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { exec } from 'node:child_process';
import { CaptivateIQConnector } from '../connectors/captivateiq/connector.js';
import type { IAuthConfig, IConnectionStatus, IRawRule } from '../types/connector.js';
import * as store from '../project/store.js';
import type { Requirement } from '../project/types.js';
import { parseExcelBuffer } from '../excel/parser.js';
import { extractRulesFromWorkbook } from '../excel/extractor.js';
import { generatePayloads } from '../generators/index.js';

const PORT = 3847;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, 'index.html');

// ── Helpers ───────────────────────────────────────────────────

function parseJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function cors(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  cors(res);
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

function matchRoute(
  url: string,
  method: string,
  pattern: string,
  patMethod: string
): Record<string, string> | null {
  if (method !== patMethod) return null;
  const patParts = pattern.split('/');
  const urlParts = url.split('?')[0].split('/');
  if (patParts.length !== urlParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(':')) {
      params[patParts[i].slice(1)] = decodeURIComponent(urlParts[i]);
    } else if (patParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return params;
}

// ── Server ────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';

  // OPTIONS — CORS preflight
  if (method === 'OPTIONS' && url.startsWith('/api/')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    // ── Connector endpoints (original) ────────────────────────

    if (url === '/api/test-connection' && method === 'POST') {
      const body = (await parseJsonBody(req)) as { vendor: string; auth: Record<string, string> };
      let status: IConnectionStatus;
      if (body.vendor === 'captivateiq') {
        const connector = new CaptivateIQConnector();
        const authConfig: IAuthConfig = {
          baseUrl: body.auth.baseUrl || 'https://api.captivateiq.com/ciq/v1',
          apiKey: body.auth.apiKey,
        };
        status = await connector.connect(authConfig);
        await connector.disconnect();
      } else {
        status = { connected: false, vendor: body.vendor as IConnectionStatus['vendor'], error: `${body.vendor} not yet implemented` };
      }
      json(res, 200, status);
      return;
    }

    if (url === '/api/list-plans' && method === 'POST') {
      const body = (await parseJsonBody(req)) as { vendor: string; auth: Record<string, string> };
      if (body.vendor === 'captivateiq') {
        const connector = new CaptivateIQConnector();
        const connStatus = await connector.connect({
          baseUrl: body.auth.baseUrl || 'https://api.captivateiq.com/ciq/v1',
          apiKey: body.auth.apiKey,
        });
        if (!connStatus.connected) { json(res, 401, { error: connStatus.error || 'Connection failed' }); return; }
        const plans = await connector.listPlans();
        await connector.disconnect();
        json(res, 200, { plans });
      } else {
        json(res, 400, { error: `${body.vendor} not yet implemented` });
      }
      return;
    }

    if (url === '/api/extract-rules' && method === 'POST') {
      const body = (await parseJsonBody(req)) as { vendor: string; auth: Record<string, string>; planId?: string };
      if (body.vendor === 'captivateiq') {
        const connector = new CaptivateIQConnector();
        const connStatus = await connector.connect({
          baseUrl: body.auth.baseUrl || 'https://api.captivateiq.com/ciq/v1',
          apiKey: body.auth.apiKey,
        });
        if (!connStatus.connected) { json(res, 401, { error: connStatus.error || 'Connection failed' }); return; }
        const rules: IRawRule[] = await connector.extractRules({ planId: body.planId });
        await connector.disconnect();
        json(res, 200, { rules, count: rules.length });
      } else {
        json(res, 400, { error: `${body.vendor} not yet implemented` });
      }
      return;
    }

    // ── ICM Builder: Projects ─────────────────────────────────

    if (url === '/api/builder/projects' && method === 'GET') {
      json(res, 200, { projects: store.listProjects() });
      return;
    }

    if (url === '/api/builder/projects' && method === 'POST') {
      const body = (await parseJsonBody(req)) as { name: string; description?: string };
      if (!body.name?.trim()) { json(res, 400, { error: 'name is required' }); return; }
      const project = store.createProject(body.name.trim(), body.description?.trim());
      json(res, 201, { project });
      return;
    }

    let params = matchRoute(url, method, '/api/builder/projects/:id', 'PATCH');
    if (params) {
      const body = (await parseJsonBody(req)) as { name?: string; description?: string };
      const updated = store.updateProject(params.id, body);
      if (!updated) { json(res, 404, { error: 'Project not found' }); return; }
      json(res, 200, { project: updated });
      return;
    }

    params = matchRoute(url, method, '/api/builder/projects/:id', 'DELETE');
    if (params) {
      const ok = store.deleteProject(params.id);
      json(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'Project not found' });
      return;
    }

    // ── ICM Builder: Files ────────────────────────────────────

    params = matchRoute(url, method, '/api/builder/projects/:id/files', 'GET');
    if (params) {
      json(res, 200, { files: store.listFiles(params.id) });
      return;
    }

    // POST /api/builder/projects/:id/files — upload Excel (base64-encoded JSON body)
    params = matchRoute(url, method, '/api/builder/projects/:id/files', 'POST');
    if (params) {
      const projectId = params.id;
      if (!store.getProject(projectId)) { json(res, 404, { error: 'Project not found' }); return; }

      const body = (await parseJsonBody(req)) as {
        filename: string;
        data: string; // base64
        mimeType?: string;
      };
      if (!body.filename || !body.data) { json(res, 400, { error: 'filename and data (base64) required' }); return; }

      const buffer = Buffer.from(body.data, 'base64');
      const mimeType = body.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const file = store.saveFile(projectId, body.filename, buffer, mimeType);

      // Parse immediately so metadata is available
      try {
        const workbook = parseExcelBuffer(buffer, body.filename);
        store.markFileParsed(file.id);
        json(res, 201, { file, workbook: { sheetNames: workbook.sheetNames, summary: workbook.summary } });
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        store.markFileParsed(file.id, msg);
        json(res, 201, { file, parseError: msg });
      }
      return;
    }

    params = matchRoute(url, method, '/api/builder/projects/:projectId/files/:fileId', 'DELETE');
    if (params) {
      const ok = store.deleteFile(params.fileId);
      json(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'File not found' });
      return;
    }

    // POST /api/builder/projects/:projectId/files/:fileId/extract — run AI extraction
    params = matchRoute(url, method, '/api/builder/projects/:projectId/files/:fileId/extract', 'POST');
    if (params) {
      const { projectId, fileId } = params;
      const project = store.getProject(projectId);
      if (!project) { json(res, 404, { error: 'Project not found' }); return; }
      const fileRecord = store.getFile(fileId);
      if (!fileRecord) { json(res, 404, { error: 'File not found' }); return; }

      const filePath = store.getFilePath(fileRecord.storedName);
      if (!fs.existsSync(filePath)) { json(res, 404, { error: 'File blob not found on disk' }); return; }

      const buffer = fs.readFileSync(filePath);
      const workbook = parseExcelBuffer(buffer, fileRecord.originalName);

      const requirements = store.listRequirements(projectId);
      const notes = store.listNotes(projectId);

      console.log(`[builder] Starting AI extraction: project=${projectId} file=${fileId}`);
      const result = await extractRulesFromWorkbook({ projectId, fileId, workbook, requirements, notes });
      store.saveExtraction(result);

      json(res, 200, {
        extractionId: result.id,
        extractedAt: result.extractedAt,
        ruleCount: result.rules.length,
        insights: result.insights,
        captivateiqConfig: result.captivateiqConfig,
        rules: result.rules,
      });
      return;
    }

    // GET /api/builder/projects/:projectId/files/:fileId/extraction
    params = matchRoute(url, method, '/api/builder/projects/:projectId/files/:fileId/extraction', 'GET');
    if (params) {
      const extraction = store.getExtraction(params.projectId, params.fileId);
      if (!extraction) { json(res, 404, { error: 'No extraction found for this file' }); return; }
      json(res, 200, {
        extractionId: extraction.id,
        extractedAt: extraction.extractedAt,
        ruleCount: extraction.rules.length,
        insights: extraction.insights,
        captivateiqConfig: extraction.captivateiqConfig,
        rules: extraction.rules,
      });
      return;
    }

    // POST /api/builder/projects/:projectId/files/:fileId/generate — generate API payloads
    params = matchRoute(url, method, '/api/builder/projects/:projectId/files/:fileId/generate', 'POST');
    if (params) {
      const { projectId, fileId } = params;
      const extraction = store.getExtraction(projectId, fileId);
      if (!extraction) {
        json(res, 404, { error: 'No extraction found — run /extract first' });
        return;
      }

      console.log(`[builder] Generating API payloads: project=${projectId} file=${fileId}`);
      const payloads = generatePayloads(extraction.captivateiqConfig);
      store.saveGeneration(projectId, fileId, payloads);

      json(res, 200, { payloads });
      return;
    }

    // GET /api/builder/projects/:projectId/files/:fileId/generation — retrieve saved payloads
    params = matchRoute(url, method, '/api/builder/projects/:projectId/files/:fileId/generation', 'GET');
    if (params) {
      const generation = store.getGeneration(params.projectId, params.fileId);
      if (!generation) { json(res, 404, { error: 'No generation found for this file' }); return; }
      json(res, 200, { payloads: generation });
      return;
    }

    // ── ICM Builder: Requirements ─────────────────────────────

    params = matchRoute(url, method, '/api/builder/projects/:id/requirements', 'GET');
    if (params) {
      json(res, 200, { requirements: store.listRequirements(params.id) });
      return;
    }

    params = matchRoute(url, method, '/api/builder/projects/:id/requirements', 'POST');
    if (params) {
      const body = (await parseJsonBody(req)) as { text: string; priority?: string };
      if (!body.text?.trim()) { json(res, 400, { error: 'text is required' }); return; }
      const validPriorities = ['high', 'medium', 'low'];
      const priority = validPriorities.includes(body.priority ?? '') ? body.priority as Requirement['priority'] : 'medium';
      const req2 = store.addRequirement(params.id, body.text.trim(), priority);
      json(res, 201, { requirement: req2 });
      return;
    }

    params = matchRoute(url, method, '/api/builder/projects/:projectId/requirements/:reqId', 'DELETE');
    if (params) {
      const ok = store.deleteRequirement(params.reqId);
      json(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'Requirement not found' });
      return;
    }

    // ── ICM Builder: Notes ────────────────────────────────────

    params = matchRoute(url, method, '/api/builder/projects/:id/notes', 'GET');
    if (params) {
      json(res, 200, { notes: store.listNotes(params.id) });
      return;
    }

    params = matchRoute(url, method, '/api/builder/projects/:id/notes', 'POST');
    if (params) {
      const body = (await parseJsonBody(req)) as { text: string };
      if (!body.text?.trim()) { json(res, 400, { error: 'text is required' }); return; }
      const note = store.addNote(params.id, body.text.trim());
      json(res, 201, { note });
      return;
    }

    params = matchRoute(url, method, '/api/builder/projects/:projectId/notes/:noteId', 'DELETE');
    if (params) {
      const ok = store.deleteNote(params.noteId);
      json(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'Note not found' });
      return;
    }

    // ── Static: serve HTML ────────────────────────────────────

    const html = fs.readFileSync(HTML_PATH, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);

  } catch (err) {
    console.error('[server] Unhandled error:', err);
    json(res, 500, { error: err instanceof Error ? err.message : 'Internal server error' });
  }
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │   Universal ICM Connector + Builder         │');
  console.log(`  │   ${url}                       │`);
  console.log('  │   Press Ctrl+C to stop                      │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
  exec(`open ${url}`);
});
