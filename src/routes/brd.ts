/**
 * BRD (Business Requirements Document) routes
 * (scoped under /api/projects/:projectId/brd).
 *
 * POST /analyze     — analyze pipeline output, return clarification questions
 * POST /generate    — generate full BRD from answers
 * GET  /            — get saved BRD
 * GET  /analysis    — get saved analysis (questions + known fields)
 */

import { Hono } from 'hono';
import * as store from '../project/store.js';
import { analyzePipelineForBrd, generateBrd } from '../pipeline/brd-generator.js';
import type { BrdAnswer } from '../pipeline/brd-generator.js';
import type { Project } from '../project/types.js';

type Env = { Variables: { project: Project } };

const app = new Hono<Env>();

// Analyze pipeline for BRD questions
app.post('/analyze', async (c) => {
  const projectId = c.req.param('projectId')!;

  const validation = store.loadValidationResult(projectId);
  const synthesis = store.loadSynthesisResult(projectId);
  if (!validation || !synthesis) {
    return c.json({ error: 'No pipeline results — run the pipeline first' }, 404);
  }

  const fileResults = store.loadAllFileExtractionResults(projectId);
  const completeness = store.loadCompletenessResult(projectId);

  const analysis = await analyzePipelineForBrd(
    projectId, validation, synthesis, fileResults, completeness,
  );

  store.saveBrdAnalysis(projectId, analysis);
  return c.json(analysis);
});

// Generate full BRD
app.post('/generate', async (c) => {
  const projectId = c.req.param('projectId')!;
  const body = await c.req.json<{ answers: BrdAnswer[] }>();

  const validation = store.loadValidationResult(projectId);
  const synthesis = store.loadSynthesisResult(projectId);
  if (!validation || !synthesis) {
    return c.json({ error: 'No pipeline results — run the pipeline first' }, 404);
  }

  const fileResults = store.loadAllFileExtractionResults(projectId);
  const completeness = store.loadCompletenessResult(projectId);

  const brd = await generateBrd({
    projectId,
    validation,
    synthesis,
    fileResults,
    completeness,
    answers: body.answers || [],
  });

  store.saveBrd(projectId, brd);
  return c.json(brd);
});

// Get saved BRD
app.get('/', (c) => {
  const projectId = c.req.param('projectId')!;
  const brd = store.loadBrd(projectId);
  if (!brd) return c.json({ error: 'No BRD generated yet' }, 404);
  return c.json(brd);
});

// Get saved analysis
app.get('/analysis', (c) => {
  const projectId = c.req.param('projectId')!;
  const analysis = store.loadBrdAnalysis(projectId);
  if (!analysis) return c.json({ error: 'No BRD analysis yet — run POST /analyze first' }, 404);
  return c.json(analysis);
});

export default app;
