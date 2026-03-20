/**
 * Pipeline routes (scoped under /api/projects/:projectId/pipeline).
 *
 * POST /              — run multi-pass pipeline (SSE streaming)
 * GET  /status        — get pipeline status (polling fallback)
 */

import fs from 'node:fs';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as store from '../project/store.js';
import { parseExcelBuffer } from '../excel/parser.js';
import { isExcelFile } from '../documents/parser.js';
import { runPipeline } from '../pipeline/runner.js';
import { generatePayloads } from '../generators/index.js';
import { generateBuildDocument } from '../generators/build-document.js';
import { generateConsolidatedExcel } from '../excel/exporter.js';
import type { PipelineEvent } from '../pipeline/types.js';
import type { ParsedWorkbook, Project } from '../project/types.js';

type Env = { Variables: { project: Project } };

const app = new Hono<Env>();

// Run pipeline with SSE streaming
app.post('/', async (c) => {
  const projectId = c.req.param('projectId')!;
  const project = c.get('project');

  let body: { force?: boolean } = {};
  try { body = await c.req.json(); } catch { /* empty body ok */ }

  return streamSSE(c, async (stream) => {
    const sendEvent = (eventName: string, data: unknown) => {
      stream.writeSSE({ event: eventName, data: JSON.stringify(data) });
    };

    try {
      const projectFiles = store.listFiles(projectId);
      if (projectFiles.length === 0) {
        await sendEvent('error', { message: 'No files uploaded', phase: 'error' });
        return;
      }

      const files: Array<{ fileId: string; workbook: ParsedWorkbook }> = [];
      for (const file of projectFiles) {
        const fp = store.getFilePath(file.storedName);
        if (!fs.existsSync(fp)) continue;
        const buf = fs.readFileSync(fp);
        if (isExcelFile(file.originalName)) {
          try {
            const wb = await parseExcelBuffer(buf, file.originalName);
            files.push({ fileId: file.id, workbook: wb });
          } catch (err) {
            console.warn(`[pipeline] Failed to parse ${file.originalName}:`, err);
          }
        }
      }

      if (files.length === 0) {
        await sendEvent('error', { message: 'No parseable files found', phase: 'error' });
        return;
      }

      const onEvent = (event: PipelineEvent) => { sendEvent(event.event, event.data); };
      const result = await runPipeline({ projectId, files, force: body.force ?? false }, onEvent);

      // Generate outputs
      const extractionResult: { id: string; projectId: string; fileId: string; extractedAt: string; workbook: ParsedWorkbook; rules: any; insights: string; captivateiqConfig: any } = {
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

      await sendEvent('result', {
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
            checksPassed: result.validation.checks.filter(ck => ck.passed).length,
            flaggedRules: result.validation.flaggedRules.length,
          },
        },
        completeness: result.completeness || null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await sendEvent('error', { message: msg, phase: 'error' });
    }
  });
});

// Get pipeline status (polling fallback)
app.get('/status', (c) => {
  const projectId = c.req.param('projectId')!;
  const status = store.loadPipelineStatus(projectId);
  return c.json(status ?? { phase: 'idle' });
});

export default app;
