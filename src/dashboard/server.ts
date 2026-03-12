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
import { extractRulesFromWorkbook, extractRulesFromAll } from '../excel/extractor.js';
import { generatePayloads } from '../generators/index.js';
import { aggregateExtractions } from '../generators/aggregator.js';
import { generateConsolidatedExcel } from '../excel/exporter.js';
import { generateBuildDocument } from '../generators/build-document.js';
import { parseDocumentBuffer, isExcelFile, getFileType } from '../documents/parser.js';
import { runPipeline } from '../pipeline/runner.js';
import type { PipelineEvent } from '../pipeline/types.js';
import { testPlanAgainstLive, fetchLiveData } from '../pipeline/plan-tester.js';
import { CaptivateIQClient } from '../connectors/captivateiq/client.js';
import { compareOffline } from '../pipeline/offline-comparator.js';
import type { ExtractionData } from '../pipeline/offline-comparator.js';
import { analyzePipelineForBrd, generateBrd } from '../pipeline/brd-generator.js';
import type { BrdAnswer } from '../pipeline/brd-generator.js';

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

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.csv': 'text/csv',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function fileCategoryFromName(filename: string): import('../project/types.js').FileCategory {
  const type = getFileType(filename);
  if (type === 'excel') return 'excel';
  if (type === 'csv') return 'csv';
  if (type === 'pdf' || type === 'docx' || type === 'txt') return 'document';
  return 'unknown';
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

    // ── ICM Builder: Files (multi-format) ─────────────────────

    params = matchRoute(url, method, '/api/builder/projects/:id/files', 'GET');
    if (params) {
      json(res, 200, { files: store.listFiles(params.id) });
      return;
    }

    // POST /api/builder/projects/:id/files — upload ANY file (base64-encoded JSON body)
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
      const mimeType = body.mimeType || getMimeType(body.filename);
      const category = fileCategoryFromName(body.filename);
      const file = store.saveFile(projectId, body.filename, buffer, mimeType, category);

      // Parse immediately based on file type
      if (isExcelFile(body.filename)) {
        try {
          const workbook = await parseExcelBuffer(buffer, body.filename);
          store.markFileParsed(file.id);
          json(res, 201, { file, category, workbook: { sheetNames: workbook.sheetNames, summary: workbook.summary } });
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          store.markFileParsed(file.id, msg);
          json(res, 201, { file, category, parseError: msg });
        }
      } else {
        // Parse document (PDF, Word, CSV, text)
        try {
          const doc = await parseDocumentBuffer(buffer, body.filename);
          store.markFileParsed(file.id);
          json(res, 201, { file, category, document: { fileType: doc.fileType, summary: doc.summary, lineCount: doc.pageOrLineCount } });
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          store.markFileParsed(file.id, msg);
          json(res, 201, { file, category, parseError: msg });
        }
      }
      return;
    }

    params = matchRoute(url, method, '/api/builder/projects/:projectId/files/:fileId', 'DELETE');
    if (params) {
      const ok = store.deleteFile(params.fileId);
      json(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'File not found' });
      return;
    }

    // POST /api/builder/projects/:projectId/files/:fileId/extract — run AI extraction (single file)
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
      const workbook = await parseExcelBuffer(buffer, fileRecord.originalName);

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

    // POST /api/builder/projects/:projectId/aggregate — merge all extracted files
    params = matchRoute(url, method, '/api/builder/projects/:projectId/aggregate', 'POST');
    if (params) {
      const { projectId } = params;
      if (!store.getProject(projectId)) { json(res, 404, { error: 'Project not found' }); return; }

      const extractions = store.getProjectExtractions(projectId);
      if (extractions.length < 2) {
        json(res, 400, {
          error: `Need at least 2 extracted files to aggregate (found ${extractions.length})`,
        });
        return;
      }

      console.log(`[builder] Aggregating ${extractions.length} extractions for project=${projectId}`);
      const aggregatedConfig = aggregateExtractions(projectId, extractions);
      const payloads = generatePayloads(aggregatedConfig.mergedConfig);
      store.saveAggregatedGeneration(projectId, aggregatedConfig, payloads);

      json(res, 200, { aggregatedConfig, payloads });
      return;
    }

    // GET /api/builder/projects/:projectId/aggregate — retrieve saved aggregation
    params = matchRoute(url, method, '/api/builder/projects/:projectId/aggregate', 'GET');
    if (params) {
      const saved = store.getAggregatedGeneration(params.projectId);
      if (!saved) { json(res, 404, { error: 'No aggregation found — run POST /aggregate first' }); return; }
      json(res, 200, saved);
      return;
    }

    // ══════════════════════════════════════════════════════════════
    // ══ NEW: Process All — Bulk ingest + AI analysis + outputs ══
    // ══════════════════════════════════════════════════════════════

    // ══════════════════════════════════════════════════════════════
    // ══ Multi-Pass Pipeline (SSE streaming)                     ══
    // ══════════════════════════════════════════════════════════════

    // POST /api/run-pipeline — run multi-pass extraction with SSE progress
    if (url === '/api/run-pipeline' && method === 'POST') {
      const body = (await parseJsonBody(req)) as { projectId: string; force?: boolean };
      const { projectId } = body;

      if (!projectId || !store.getProject(projectId)) {
        json(res, 404, { error: 'Project not found' });
        return;
      }

      // SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const sendEvent = (eventName: string, data: unknown) => {
        try {
          res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch {
          // Stream already closed, ignore
        }
      };

      const onEvent = (event: PipelineEvent) => {
        sendEvent(event.event, event.data);
      };

      try {
        // Load all parsed files
        const projectFiles = store.listFiles(projectId);
        if (projectFiles.length === 0) {
          sendEvent('error', { message: 'No files uploaded', phase: 'error' });
          res.end();
          return;
        }

        const files: Array<{ fileId: string; workbook: import('../project/types.js').ParsedWorkbook }> = [];
        for (const file of projectFiles) {
          const filePath = store.getFilePath(file.storedName);
          if (!fs.existsSync(filePath)) continue;
          const buffer = fs.readFileSync(filePath);
          if (isExcelFile(file.originalName)) {
            try {
              const workbook = await parseExcelBuffer(buffer, file.originalName);
              files.push({ fileId: file.id, workbook });
            } catch (err) {
              console.warn(`[pipeline] Failed to parse ${file.originalName}:`, err);
            }
          }
          // TODO: support document files in pipeline
        }

        if (files.length === 0) {
          sendEvent('error', { message: 'No parseable files found', phase: 'error' });
          res.end();
          return;
        }

        const result = await runPipeline({
          projectId,
          files,
          force: body.force ?? false,
        }, onEvent);

        // Generate outputs for backward compat with existing results display
        const project = store.getProject(projectId)!;
        const extractionResult = {
          id: store.generateId(),
          projectId,
          fileId: 'pipeline',
          extractedAt: new Date().toISOString(),
          workbook: files[0].workbook,
          rules: result.validation.validatedRules,
          insights: result.validation.insights,
          captivateiqConfig: result.validation.captivateiqConfig,
        };

        const payloads = generatePayloads(result.validation.captivateiqConfig);
        const buildDoc = generateBuildDocument(extractionResult as any, project.name);
        const excelBuffer = await generateConsolidatedExcel(extractionResult as any, { projectName: project.name });

        sendEvent('result', {
          extraction: {
            extractionId: extractionResult.id,
            extractedAt: extractionResult.extractedAt,
            ruleCount: result.validation.validatedRules.length,
            insights: result.validation.insights,
            captivateiqConfig: result.validation.captivateiqConfig,
            rules: result.validation.validatedRules,
          },
          payloads,
          buildDocument: buildDoc,
          excelBase64: excelBuffer.toString('base64'),
          excelFilename: `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_ICM_Analysis.xlsx`,
          stats: {
            filesProcessed: files.length,
            excelFiles: files.length,
            documentFiles: 0,
            parseErrors: 0,
            rulesExtracted: result.validation.validatedRules.length,
          },
          pipeline: {
            fileResults: result.fileResults.map(fr => ({
              fileId: fr.fileId,
              fileName: fr.fileName,
              classification: fr.classification,
              ruleCount: fr.rules.length,
            })),
            synthesis: {
              ruleCount: result.synthesis.rules.length,
              conflictCount: result.synthesis.conflicts.length,
              crossRefCount: result.synthesis.crossReferences.length,
            },
            validation: {
              overallScore: result.validation.overallScore,
              checksRun: result.validation.checks.length,
              checksPassed: result.validation.checks.filter(c => c.passed).length,
              flaggedRules: result.validation.flaggedRules.length,
            },
          },
          completeness: result.completeness || null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendEvent('error', { message: msg, phase: 'error' });
      } finally {
        res.end();
      }
      return;
    }

    // GET /api/pipeline-status — polling fallback
    if (url?.startsWith('/api/pipeline-status') && method === 'GET') {
      const urlObj = new URL(url, `http://${req.headers.host}`);
      const pid = urlObj.searchParams.get('projectId');
      if (!pid) { json(res, 400, { error: 'projectId required' }); return; }
      const status = store.loadPipelineStatus(pid);
      json(res, 200, status ?? { phase: 'idle' });
      return;
    }

    // POST /api/builder/projects/:projectId/process-all — dump everything, churn, get results
    params = matchRoute(url, method, '/api/builder/projects/:projectId/process-all', 'POST');
    if (params) {
      const { projectId } = params;
      const project = store.getProject(projectId);
      if (!project) { json(res, 404, { error: 'Project not found' }); return; }

      const files = store.listFiles(projectId);
      if (files.length === 0) {
        json(res, 400, { error: 'No files uploaded — upload files first' });
        return;
      }

      console.log(`[builder] ════════════════════════════════════════`);
      console.log(`[builder] PROCESS ALL: project="${project.name}" (${files.length} files)`);
      console.log(`[builder] ════════════════════════════════════════`);

      // 1. Parse all files into workbooks and documents
      const workbooks: Array<{ fileId: string; workbook: import('../project/types.js').ParsedWorkbook }> = [];
      const documents: Array<{ fileId: string; document: import('../documents/parser.js').ParsedDocument }> = [];
      const parseErrors: Array<{ fileId: string; filename: string; error: string }> = [];

      for (const file of files) {
        const filePath = store.getFilePath(file.storedName);
        if (!fs.existsSync(filePath)) {
          parseErrors.push({ fileId: file.id, filename: file.originalName, error: 'File blob missing' });
          continue;
        }
        const buffer = fs.readFileSync(filePath);

        if (isExcelFile(file.originalName)) {
          try {
            const wb = await parseExcelBuffer(buffer, file.originalName);
            workbooks.push({ fileId: file.id, workbook: wb });
            console.log(`  [parse] ✓ Excel: ${file.originalName} (${wb.sheetNames.length} sheets)`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            parseErrors.push({ fileId: file.id, filename: file.originalName, error: msg });
            console.log(`  [parse] ✗ Excel: ${file.originalName} — ${msg}`);
          }
        } else {
          try {
            const doc = await parseDocumentBuffer(buffer, file.originalName);
            documents.push({ fileId: file.id, document: doc });
            console.log(`  [parse] ✓ Document: ${file.originalName} (${doc.fileType}, ${doc.pageOrLineCount} pages/lines)`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            parseErrors.push({ fileId: file.id, filename: file.originalName, error: msg });
            console.log(`  [parse] ✗ Document: ${file.originalName} — ${msg}`);
          }
        }
      }

      if (workbooks.length === 0 && documents.length === 0) {
        json(res, 400, { error: 'No files could be parsed', parseErrors });
        return;
      }

      // 2. Bulk AI extraction — all files in one shot
      const requirements = store.listRequirements(projectId);
      const notes = store.listNotes(projectId);

      console.log(`  [AI] Starting bulk extraction: ${workbooks.length} workbooks + ${documents.length} documents`);
      const extraction = await extractRulesFromAll({
        projectId,
        workbooks,
        documents,
        requirements,
        notes,
      });
      store.saveExtraction(extraction);

      // 3. Generate API payloads
      const payloads = generatePayloads(extraction.captivateiqConfig);
      store.saveGeneration(projectId, 'bulk', payloads);

      // 4. Generate build document
      const buildDoc = generateBuildDocument(extraction, project.name);

      // 5. Generate consolidated Excel (base64 for JSON response)
      const excelBuffer = await generateConsolidatedExcel(extraction, { projectName: project.name });
      const excelBase64 = excelBuffer.toString('base64');

      console.log(`[builder] ════════════════════════════════════════`);
      console.log(`[builder] PROCESS ALL COMPLETE: ${extraction.rules.length} rules extracted`);
      console.log(`[builder] ════════════════════════════════════════`);

      json(res, 200, {
        extraction: {
          extractionId: extraction.id,
          extractedAt: extraction.extractedAt,
          ruleCount: extraction.rules.length,
          insights: extraction.insights,
          captivateiqConfig: extraction.captivateiqConfig,
          rules: extraction.rules,
        },
        payloads,
        buildDocument: buildDoc,
        excelBase64,
        excelFilename: `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_ICM_Analysis.xlsx`,
        stats: {
          filesProcessed: workbooks.length + documents.length,
          excelFiles: workbooks.length,
          documentFiles: documents.length,
          parseErrors: parseErrors.length,
          rulesExtracted: extraction.rules.length,
        },
        parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
      });
      return;
    }

    // GET /api/builder/projects/:projectId/results — load last pipeline results for page render
    params = matchRoute(url, method, '/api/builder/projects/:projectId/results', 'GET');
    if (params) {
      const { projectId } = params;
      const project = store.getProject(projectId);
      if (!project) { json(res, 404, { error: 'Project not found' }); return; }

      // Try pipeline extraction first, then bulk, then any individual
      let extraction = store.getExtraction(projectId, 'pipeline');
      if (!extraction) extraction = store.getExtraction(projectId, 'bulk');
      if (!extraction) {
        const extractions = store.getProjectExtractions(projectId);
        extraction = extractions.length > 0 ? extractions[0] : null;
      }
      if (!extraction) { json(res, 404, { error: 'No results yet' }); return; }

      const payloads = store.getGeneration(projectId, 'pipeline') || store.getGeneration(projectId, 'bulk');
      const buildDoc = generateBuildDocument(extraction, project.name);
      const excelBuffer = await generateConsolidatedExcel(extraction, { projectName: project.name });

      // Load pipeline metadata if available
      const validation = store.loadValidationResult(projectId);
      const pipelineStatus = store.loadPipelineStatus(projectId);
      const fileExtractions = store.loadAllFileExtractionResults(projectId);
      const synthesis = store.loadSynthesisResult(projectId);
      const completeness = store.loadCompletenessResult(projectId);

      json(res, 200, {
        extraction: {
          extractionId: extraction.id,
          extractedAt: extraction.extractedAt,
          ruleCount: extraction.rules.length,
          insights: extraction.insights,
          captivateiqConfig: extraction.captivateiqConfig,
          rules: extraction.rules,
        },
        payloads: payloads || null,
        buildDocument: buildDoc,
        excelBase64: excelBuffer.toString('base64'),
        excelFilename: `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_ICM_Analysis.xlsx`,
        stats: {
          filesProcessed: fileExtractions.length || 1,
          excelFiles: fileExtractions.length || 1,
          documentFiles: 0,
          parseErrors: 0,
          rulesExtracted: extraction.rules.length,
        },
        pipeline: validation ? {
          fileResults: fileExtractions.map(fr => ({
            fileId: fr.fileId,
            fileName: fr.fileName,
            classification: fr.classification,
            ruleCount: fr.rules.length,
          })),
          synthesis: synthesis ? {
            ruleCount: synthesis.rules.length,
            conflictCount: synthesis.conflicts.length,
            crossRefCount: synthesis.crossReferences.length,
          } : null,
          validation: {
            overallScore: validation.overallScore,
            checksRun: validation.checks.length,
            checksPassed: validation.checks.filter((c: any) => c.passed).length,
            flaggedRules: validation.flaggedRules.length,
          },
        } : null,
        completeness: completeness || null,
      });
      return;
    }

    // GET /api/builder/projects/:projectId/export-excel — download consolidated Excel
    params = matchRoute(url, method, '/api/builder/projects/:projectId/export-excel', 'GET');
    if (params) {
      const { projectId } = params;
      const project = store.getProject(projectId);
      if (!project) { json(res, 404, { error: 'Project not found' }); return; }

      // Try bulk extraction first, then individual extractions
      let extraction = store.getExtraction(projectId, 'bulk');
      if (!extraction) {
        const extractions = store.getProjectExtractions(projectId);
        if (extractions.length === 0) {
          json(res, 404, { error: 'No extraction results — run Process All first' });
          return;
        }
        extraction = extractions[0]; // Use first available
      }

      const excelBuffer = await generateConsolidatedExcel(extraction, { projectName: project.name });
      const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_ICM_Analysis.xlsx`;

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.writeHead(200);
      res.end(excelBuffer);
      return;
    }

    // GET /api/builder/projects/:projectId/build-document — get CIQ build document
    params = matchRoute(url, method, '/api/builder/projects/:projectId/build-document', 'GET');
    if (params) {
      const { projectId } = params;
      const project = store.getProject(projectId);
      if (!project) { json(res, 404, { error: 'Project not found' }); return; }

      let extraction = store.getExtraction(projectId, 'bulk');
      if (!extraction) {
        const extractions = store.getProjectExtractions(projectId);
        if (extractions.length === 0) {
          json(res, 404, { error: 'No extraction results — run Process All first' });
          return;
        }
        extraction = extractions[0];
      }

      const buildDoc = generateBuildDocument(extraction, project.name);
      json(res, 200, { buildDocument: buildDoc });
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

    // ── Rule Tester Endpoints ──────────────────────────────────

    // POST /api/tester/list-plans — test connection + list available plans
    params = matchRoute(url, method, '/api/tester/list-plans', 'POST');
    if (params) {
      const body = await parseJsonBody(req) as { apiToken: string; baseUrl?: string };
      if (!body.apiToken) { json(res, 400, { error: 'apiToken required' }); return; }
      try {
        const client = new CaptivateIQClient({
          baseUrl: body.baseUrl || 'https://api.captivateiq.com/ciq/v1',
          apiToken: body.apiToken,
        });
        const plansResp = await client.listPlans();
        const plans = await client.fetchAllPages(plansResp);
        json(res, 200, {
          connected: true,
          plans: plans.map((p: any) => ({
            id: p.id,
            name: p.name,
            periodType: p.period_type || null,
            status: p.status || null,
          })),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        json(res, 200, { connected: false, error: msg, plans: [] });
      }
      return;
    }

    // POST /api/tester/extract — extract structured CIQ config (no project needed)
    params = matchRoute(url, method, '/api/tester/extract', 'POST');
    if (params) {
      const body = await parseJsonBody(req) as { apiToken: string; baseUrl?: string };
      if (!body.apiToken) { json(res, 400, { error: 'apiToken required' }); return; }
      try {
        const client = new CaptivateIQClient({
          baseUrl: body.baseUrl || 'https://api.captivateiq.com/ciq/v1',
          apiToken: body.apiToken,
        });
        const live = await fetchLiveData(client);

        // Parse into structured sections
        const parsed = {
          extractedAt: new Date().toISOString(),
          summary: {
            planCount: live.plans.length,
            workbookCount: live.workbooks.length,
            worksheetCount: live.worksheets.length,
            attributeWorksheetCount: live.attributeWorksheets.length,
            assumptionRecords: live.assumptions.length,
            employeeCount: live.employeeCount,
          },
          plans: live.plans.map((p: any) => ({
            id: p.id,
            name: p.name,
            description: p.description || null,
            periodType: p.period_type || null,
            status: p.status || null,
            createdAt: p.created_at || null,
          })),
          workbooks: live.workbooks.map((wb: any) => {
            const wbSheets = live.worksheets.filter(ws => ws.workbook_id === wb.id);
            return {
              id: wb.id,
              name: wb.name,
              description: wb.description || null,
              worksheetCount: wbSheets.length,
              worksheets: wbSheets.map((ws: any) => ({
                id: ws.id,
                name: ws.name,
                columns: ((Array.isArray(ws.columns) ? ws.columns : []) as any[]).map((c: any) => ({
                  name: c.name || c.display_name || 'unnamed',
                  type: c.type || c.column_type || 'unknown',
                  isDerived: c.column_type === 'derived' || c.is_derived === true,
                })),
              })),
            };
          }),
          attributeWorksheets: live.attributeWorksheets.map((a: any) => ({
            id: a.id,
            name: a.name,
            description: a.description || null,
            type: a.type || null,
            pkType: a.pk_type || null,
            columns: ((Array.isArray(a.columns) ? a.columns : []) as any[]).map((c: any) => ({
              name: c.name || 'unnamed',
              type: c.type || 'unknown',
            })),
          })),
          employeeAssumptions: {
            recordCount: live.assumptions.length,
            columns: live.assumptions.length > 0
              ? Object.keys(live.assumptions[0]?.data || {})
              : [],
            sampleValues: live.assumptions.length > 0
              ? live.assumptions.slice(0, 3).map((a: any) => ({
                  employee: a.display_value || a.employee || 'unknown',
                  period: a.start_date && a.end_date ? a.start_date + ' - ' + a.end_date : null,
                  data: a.data || {},
                }))
              : [],
          },
        };
        json(res, 200, parsed);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        json(res, 500, { error: msg });
      }
      return;
    }

    // POST /api/tester/projects/:projectId/compare — run comparison
    params = matchRoute(url, method, '/api/tester/projects/:projectId/compare', 'POST');
    if (params) {
      const { projectId } = params;
      const body = await parseJsonBody(req) as { apiToken: string; baseUrl?: string };
      if (!body.apiToken) { json(res, 400, { error: 'apiToken required' }); return; }
      try {
        const result = await testPlanAgainstLive(
          projectId,
          body.apiToken,
          body.baseUrl || 'https://api.captivateiq.com/ciq/v1',
        );
        store.savePlanTestResult(projectId, result);
        json(res, 200, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        json(res, 500, { error: msg });
      }
      return;
    }

    // GET /api/tester/projects/:projectId/result — load cached result
    params = matchRoute(url, method, '/api/tester/projects/:projectId/result', 'GET');
    if (params) {
      const result = store.loadPlanTestResult(params.projectId);
      if (!result) { json(res, 404, { error: 'No test result yet' }); return; }
      json(res, 200, result);
      return;
    }


    // ── Profile Endpoints ──────────────────────────────────

    // GET /api/profiles
    if (url === '/api/profiles' && method === 'GET') {
      json(res, 200, { profiles: store.listProfiles() });
      return;
    }

    // POST /api/profiles
    if (url === '/api/profiles' && method === 'POST') {
      const body = await parseJsonBody(req) as { name: string; description?: string; data: unknown };
      if (!body.name?.trim()) { json(res, 400, { error: 'name is required' }); return; }
      if (!body.data) { json(res, 400, { error: 'data is required' }); return; }
      const profile = store.saveProfile(body.name.trim(), body.description?.trim(), body.data);
      json(res, 201, { profile });
      return;
    }

    // GET /api/profiles/:id
    params = matchRoute(url, method, '/api/profiles/:id', 'GET');
    if (params) {
      const data = store.getProfile(params.id);
      if (!data) { json(res, 404, { error: 'Profile not found' }); return; }
      const meta = store.listProfiles().find(p => p.id === params!.id);
      json(res, 200, { profile: meta, data });
      return;
    }

    // DELETE /api/profiles/:id
    params = matchRoute(url, method, '/api/profiles/:id', 'DELETE');
    if (params) {
      const ok = store.deleteProfile(params.id);
      json(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'Profile not found' });
      return;
    }

    // ── Offline Comparison Endpoint ────────────────────────

    // POST /api/compare
    if (url === '/api/compare' && method === 'POST') {
      const body = await parseJsonBody(req) as {
        projectId: string;
        profileId?: string;
        extractionData?: ExtractionData;
        selectedPlanIds: string[];
      };

      if (!body.projectId) { json(res, 400, { error: 'projectId required' }); return; }
      if (!body.selectedPlanIds?.length) { json(res, 400, { error: 'selectedPlanIds required' }); return; }

      // Load builder config (try pass3 first, then pass2)
      const pass3 = store.loadValidationResult(body.projectId);
      const pass2 = store.loadSynthesisResult(body.projectId);
      const config = pass3?.captivateiqConfig || pass2?.captivateiqConfig;
      if (!config) {
        json(res, 404, { error: 'No pipeline results (pass2/pass3) found for this project' });
        return;
      }

      // Load extraction data
      let extraction: ExtractionData;
      if (body.profileId) {
        const profileData = store.getProfile(body.profileId);
        if (!profileData) { json(res, 404, { error: 'Profile not found' }); return; }
        extraction = profileData as ExtractionData;
      } else if (body.extractionData) {
        extraction = body.extractionData;
      } else {
        json(res, 400, { error: 'Either profileId or extractionData required' });
        return;
      }

      try {
        const result = compareOffline(config, extraction, body.selectedPlanIds, body.projectId);
        json(res, 200, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        json(res, 500, { error: msg });
      }
      return;
    }

    // ── BRD Generator Endpoints ───────────────────────────────

    // POST /api/brd/projects/:projectId/analyze — analyze pipeline results, return questions
    params = matchRoute(url, method, '/api/brd/projects/:projectId/analyze', 'POST');
    if (params) {
      const { projectId } = params;
      const project = store.getProject(projectId);
      if (!project) { json(res, 404, { error: 'Project not found' }); return; }

      const validation = store.loadValidationResult(projectId);
      const synthesis = store.loadSynthesisResult(projectId);
      if (!validation || !synthesis) {
        json(res, 400, { error: 'Run the extraction pipeline first (Pass 3 results required)' });
        return;
      }

      const fileResults = store.loadAllFileExtractionResults(projectId);
      const completeness = store.loadCompletenessResult(projectId);

      try {
        const analysis = await analyzePipelineForBrd(projectId, validation, synthesis, fileResults, completeness);
        store.saveBrdAnalysis(projectId, analysis);
        json(res, 200, analysis);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        json(res, 500, { error: msg });
      }
      return;
    }

    // GET /api/brd/projects/:projectId/analysis — load saved analysis (questions)
    params = matchRoute(url, method, '/api/brd/projects/:projectId/analysis', 'GET');
    if (params) {
      const { projectId } = params;
      const analysis = store.loadBrdAnalysis(projectId);
      if (!analysis) { json(res, 404, { error: 'No analysis saved' }); return; }
      json(res, 200, analysis);
      return;
    }

    // POST /api/brd/projects/:projectId/generate — generate full BRD with user answers
    params = matchRoute(url, method, '/api/brd/projects/:projectId/generate', 'POST');
    if (params) {
      const { projectId } = params;
      const project = store.getProject(projectId);
      if (!project) { json(res, 404, { error: 'Project not found' }); return; }

      const validation = store.loadValidationResult(projectId);
      const synthesis = store.loadSynthesisResult(projectId);
      if (!validation || !synthesis) {
        json(res, 400, { error: 'Run the extraction pipeline first (Pass 3 results required)' });
        return;
      }

      const body = (await parseJsonBody(req)) as { answers?: BrdAnswer[] };
      const fileResults = store.loadAllFileExtractionResults(projectId);
      const completeness = store.loadCompletenessResult(projectId);

      try {
        const brd = await generateBrd({
          projectId,
          validation,
          synthesis,
          fileResults,
          completeness,
          answers: body.answers || [],
        });
        // Save the BRD to project store
        store.saveBrd(projectId, brd);
        json(res, 200, { brd });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        json(res, 500, { error: msg });
      }
      return;
    }

    // GET /api/brd/projects/:projectId — load saved BRD
    params = matchRoute(url, method, '/api/brd/projects/:projectId', 'GET');
    if (params) {
      const { projectId } = params;
      const brd = store.loadBrd(projectId);
      if (!brd) { json(res, 404, { error: 'No BRD generated yet' }); return; }
      json(res, 200, { brd });
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
  console.log('  ┌──────────────────────────────────────────────────┐');
  console.log('  │   Universal ICM Connector + Rule Builder v2      │');
  console.log(`  │   ${url}                            │`);
  console.log('  │   Multi-format: Excel, PDF, Word, CSV, Text      │');
  console.log('  │   Press Ctrl+C to stop                           │');
  console.log('  └──────────────────────────────────────────────────┘');
  console.log('');
  exec(`open ${url}`);
});
