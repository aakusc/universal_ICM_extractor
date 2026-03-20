/**
 * CaptivateIQ tester routes.
 *
 * POST /api/tester/connect              — test connection + list plans
 * POST /api/tester/extract              — extract live CIQ data
 * POST /api/projects/:projectId/tester/compare — offline compare against extraction data
 */

import { Hono } from 'hono';
import { CaptivateIQConnector } from '../connectors/captivateiq/connector.js';
import { CaptivateIQClient } from '../connectors/captivateiq/client.js';
import { testPlanAgainstLive, fetchLiveData } from '../pipeline/plan-tester.js';
import { compareOffline } from '../pipeline/offline-comparator.js';
import type { ExtractionData } from '../pipeline/offline-comparator.js';
import * as store from '../project/store.js';

const app = new Hono();

// Test connection and list plans
app.post('/connect', async (c) => {
  const body = await c.req.json<{ apiToken: string; baseUrl?: string }>();
  if (!body.apiToken) {
    return c.json({ error: 'apiToken is required' }, 400);
  }

  const connector = new CaptivateIQConnector();
  const status = await connector.connect({
    baseUrl: body.baseUrl || 'https://api.captivateiq.com/ciq/v1',
    apiToken: body.apiToken,
  });

  if (!status.connected) {
    return c.json({ connected: false, error: status.error }, 401);
  }

  // Also list plans
  let plans: Array<{ id: string; name: string }> = [];
  try {
    plans = await connector.listPlans();
  } catch { /* ignore */ }

  await connector.disconnect();

  return c.json({
    connected: true,
    authenticatedAs: status.authenticatedAs,
    apiVersion: status.apiVersion,
    plans,
  });
});

// Extract live CIQ data
app.post('/extract', async (c) => {
  const body = await c.req.json<{ apiToken: string; baseUrl?: string }>();
  if (!body.apiToken) {
    return c.json({ error: 'apiToken is required' }, 400);
  }

  const client = new CaptivateIQClient({
    baseUrl: body.baseUrl || 'https://api.captivateiq.com/ciq/v1',
    apiToken: body.apiToken,
  });

  const liveData = await fetchLiveData(client);

  return c.json({
    extractedAt: new Date().toISOString(),
    plans: liveData.plans,
    workbooks: liveData.workbooks,
    worksheets: liveData.worksheets,
    attributeWorksheets: liveData.attributeWorksheets,
    employeeCount: liveData.employeeCount,
  });
});

// Offline compare (project-scoped — mounted at /api/projects/:projectId/tester)
app.post('/compare', async (c) => {
  const projectId = c.req.param('projectId')!;
  if (!projectId) return c.json({ error: 'Project ID required' }, 400);
  const project = store.getProject(projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const body = await c.req.json<{
    extractionData: ExtractionData;
    selectedPlanIds: string[];
  }>();

  if (!body.extractionData || !body.selectedPlanIds) {
    return c.json({ error: 'extractionData and selectedPlanIds are required' }, 400);
  }

  // Load the generated config
  const extraction = store.getExtraction(projectId, 'pipeline')
    || store.getExtraction(projectId, 'bulk');
  if (!extraction) {
    return c.json({ error: 'No pipeline results — run the pipeline first' }, 404);
  }

  const result = compareOffline(
    extraction.captivateiqConfig,
    body.extractionData,
    body.selectedPlanIds,
    projectId,
  );

  store.savePlanTestResult(projectId, result);
  return c.json(result);
});

export default app;
