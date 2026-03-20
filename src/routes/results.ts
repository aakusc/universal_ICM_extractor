/**
 * Results routes (scoped under /api/projects/:projectId/results).
 *
 * GET /              — full results payload (extraction, payloads, pipeline metadata)
 * GET /payloads      — CaptivateIQ API payloads
 * GET /excel         — download consolidated Excel
 * GET /build-doc     — get build document
 * GET /completeness  — CIQ build readiness checklist
 */

import { Hono } from 'hono';
import * as store from '../project/store.js';
import { generatePayloads } from '../generators/index.js';
import { generateBuildDocument } from '../generators/build-document.js';
import { generateConsolidatedExcel } from '../excel/exporter.js';
import type { Project } from '../project/types.js';

type Env = { Variables: { project: Project } };

const app = new Hono<Env>();

/** Find the best available extraction for a project */
function findExtraction(projectId: string) {
  let extraction = store.getExtraction(projectId, 'pipeline');
  if (!extraction) extraction = store.getExtraction(projectId, 'bulk');
  if (!extraction) {
    const all = store.getProjectExtractions(projectId);
    extraction = all.length > 0 ? all[0] : null;
  }
  return extraction;
}

// Full results
app.get('/', async (c) => {
  const projectId = c.req.param('projectId')!;
  const project = c.get('project');

  const extraction = findExtraction(projectId);
  if (!extraction) return c.json({ error: 'No results yet — run the pipeline first' }, 404);

  const payloads = store.getGeneration(projectId, 'pipeline') || store.getGeneration(projectId, 'bulk');
  const buildDoc = generateBuildDocument(extraction, project.name);
  const excelBuffer = await generateConsolidatedExcel(extraction, { projectName: project.name });

  const validation = store.loadValidationResult(projectId);
  const fileExtractions = store.loadAllFileExtractionResults(projectId);
  const synthesis = store.loadSynthesisResult(projectId);
  const completeness = store.loadCompletenessResult(projectId);

  return c.json({
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
        checksPassed: validation.checks.filter(ck => ck.passed).length,
        flaggedRules: validation.flaggedRules.length,
      },
    } : null,
    completeness: completeness || null,
  });
});

// CIQ payloads
app.get('/payloads', (c) => {
  const projectId = c.req.param('projectId')!;
  const payloads = store.getGeneration(projectId, 'pipeline') || store.getGeneration(projectId, 'bulk');
  if (!payloads) return c.json({ error: 'No payloads generated yet' }, 404);
  return c.json({ payloads });
});

// Excel download
app.get('/excel', async (c) => {
  const projectId = c.req.param('projectId')!;
  const project = c.get('project');

  const extraction = findExtraction(projectId);
  if (!extraction) return c.json({ error: 'No extraction results yet' }, 404);

  const excelBuffer = await generateConsolidatedExcel(extraction, { projectName: project.name });
  const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_ICM_Analysis.xlsx`;

  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  return c.body(new Uint8Array(excelBuffer));
});

// Build document
app.get('/build-doc', (c) => {
  const projectId = c.req.param('projectId')!;
  const project = c.get('project');

  const extraction = findExtraction(projectId);
  if (!extraction) return c.json({ error: 'No extraction results yet' }, 404);

  const buildDoc = generateBuildDocument(extraction, project.name);
  return c.json(buildDoc);
});

// Completeness
app.get('/completeness', (c) => {
  const projectId = c.req.param('projectId')!;
  const completeness = store.loadCompletenessResult(projectId);
  if (!completeness) return c.json({ error: 'No completeness analysis yet — run pipeline first' }, 404);
  return c.json(completeness);
});

export default app;
