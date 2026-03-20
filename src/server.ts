/**
 * ICM Services — Hono API Server
 *
 * Modular REST API on port 3847 with OpenAPI spec generation.
 * Replaces the monolithic src/dashboard/server.ts.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { errorHandler } from './middleware/error-handler.js';
import { projectLoader } from './middleware/project-loader.js';
import projectRoutes from './routes/projects.js';
import fileRoutes from './routes/files.js';
import pipelineRoutes from './routes/pipeline.js';
import resultRoutes from './routes/results.js';
import contextRoutes from './routes/context.js';
import brdRoutes from './routes/brd.js';
import testerRoutes from './routes/tester.js';
import profileRoutes from './routes/profiles.js';

const app = new Hono();

// ── Global middleware ────────────────────────────────────

app.use('*', cors());
app.onError(errorHandler);

// ── Health ───────────────────────────────────────────────

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'icm-services',
    timestamp: new Date().toISOString(),
  });
});

// ── OpenAPI spec ──────────────────────────────────────────

app.get('/api/openapi.json', (c) => {
  return c.json(openApiSpec());
});

// ── Routes ───────────────────────────────────────────────

// Projects CRUD (no project loader needed)
app.route('/api/projects', projectRoutes);

// Project-scoped middleware — only applies to sub-resource paths
app.use('/api/projects/:projectId/*', projectLoader);

// Project-scoped sub-routes
app.route('/api/projects/:projectId/files', fileRoutes);
app.route('/api/projects/:projectId/pipeline', pipelineRoutes);
app.route('/api/projects/:projectId/results', resultRoutes);
app.route('/api/projects/:projectId', contextRoutes);   // handles /requirements/* and /notes/*
app.route('/api/projects/:projectId/brd', brdRoutes);
app.route('/api/projects/:projectId/tester', testerRoutes);  // project-scoped compare

// Tester (global routes — connect, extract)
app.route('/api/tester', testerRoutes);

// Profiles
app.route('/api/profiles', profileRoutes);

// ── OpenAPI spec builder ─────────────────────────────────

function openApiSpec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'ICM Services API',
      description: 'REST API for ICM extraction pipeline, CaptivateIQ configuration generation, and project management.',
      version: '2.0.0',
    },
    servers: [{ url: 'http://localhost:3847', description: 'Development' }],
    paths: {
      '/api/health': {
        get: {
          summary: 'Health check',
          tags: ['Health'],
          responses: { 200: { description: 'Service is healthy', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, service: { type: 'string' }, timestamp: { type: 'string' } } } } } } },
        },
      },
      '/api/projects': {
        get: { summary: 'List all projects', tags: ['Projects'], responses: { 200: { description: 'Array of projects' } } },
        post: { summary: 'Create a project', tags: ['Projects'], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' } } } } } }, responses: { 201: { description: 'Created project' } } },
      },
      '/api/projects/{id}': {
        get: { summary: 'Get a project', tags: ['Projects'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Project details' }, 404: { description: 'Not found' } } },
        put: { summary: 'Update a project', tags: ['Projects'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated project' } } },
        delete: { summary: 'Delete a project', tags: ['Projects'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } },
      },
      '/api/projects/{projectId}/files': {
        get: { summary: 'List project files', tags: ['Files'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Array of files' } } },
        post: { summary: 'Upload a file (base64)', tags: ['Files'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['name', 'data'], properties: { name: { type: 'string' }, data: { type: 'string', description: 'Base64-encoded file content' }, type: { type: 'string' } } } } } }, responses: { 201: { description: 'Uploaded file metadata' } } },
      },
      '/api/projects/{projectId}/files/{fileId}': {
        delete: { summary: 'Delete a file', tags: ['Files'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'fileId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } },
      },
      '/api/projects/{projectId}/pipeline': {
        post: { summary: 'Run extraction pipeline (SSE)', tags: ['Pipeline'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { force: { type: 'boolean', description: 'Force re-run, clearing cached results' } } } } } }, responses: { 200: { description: 'SSE event stream' } } },
      },
      '/api/projects/{projectId}/pipeline/status': {
        get: { summary: 'Get pipeline status', tags: ['Pipeline'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Pipeline status' } } },
      },
      '/api/projects/{projectId}/results': {
        get: { summary: 'Get full results', tags: ['Results'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Extraction results, payloads, pipeline metadata' } } },
      },
      '/api/projects/{projectId}/results/payloads': {
        get: { summary: 'Get CaptivateIQ API payloads', tags: ['Results'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'CIQ payloads' } } },
      },
      '/api/projects/{projectId}/results/excel': {
        get: { summary: 'Download consolidated Excel', tags: ['Results'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Excel file download' } } },
      },
      '/api/projects/{projectId}/results/build-doc': {
        get: { summary: 'Get build document', tags: ['Results'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Build document JSON' } } },
      },
      '/api/projects/{projectId}/results/completeness': {
        get: { summary: 'Get CIQ build readiness', tags: ['Results'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Completeness checklist' } } },
      },
      '/api/projects/{projectId}/requirements': {
        get: { summary: 'List requirements', tags: ['Context'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Array of requirements' } } },
        post: { summary: 'Add a requirement', tags: ['Context'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 201: { description: 'Created requirement' } } },
      },
      '/api/projects/{projectId}/requirements/{reqId}': {
        delete: { summary: 'Delete a requirement', tags: ['Context'], responses: { 200: { description: 'Deleted' } } },
      },
      '/api/projects/{projectId}/notes': {
        get: { summary: 'List notes', tags: ['Context'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Array of notes' } } },
        post: { summary: 'Add a note', tags: ['Context'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 201: { description: 'Created note' } } },
      },
      '/api/projects/{projectId}/notes/{noteId}': {
        delete: { summary: 'Delete a note', tags: ['Context'], responses: { 200: { description: 'Deleted' } } },
      },
      '/api/projects/{projectId}/brd': {
        get: { summary: 'Get saved BRD', tags: ['BRD'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'BRD document' } } },
      },
      '/api/projects/{projectId}/brd/analyze': {
        post: { summary: 'Analyze pipeline for BRD', tags: ['BRD'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Analysis with questions' } } },
      },
      '/api/projects/{projectId}/brd/generate': {
        post: { summary: 'Generate full BRD', tags: ['BRD'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { answers: { type: 'array', items: { type: 'object', properties: { questionId: { type: 'string' }, answer: { type: 'string' } } } } } } } } }, responses: { 200: { description: 'Generated BRD' } } },
      },
      '/api/projects/{projectId}/brd/analysis': {
        get: { summary: 'Get saved BRD analysis', tags: ['BRD'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Saved analysis' } } },
      },
      '/api/tester/connect': {
        post: { summary: 'Test CIQ connection + list plans', tags: ['Tester'], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['apiToken'], properties: { apiToken: { type: 'string' }, baseUrl: { type: 'string' } } } } } }, responses: { 200: { description: 'Connection status and plans' } } },
      },
      '/api/tester/extract': {
        post: { summary: 'Extract live CIQ data', tags: ['Tester'], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['apiToken'], properties: { apiToken: { type: 'string' }, baseUrl: { type: 'string' } } } } } }, responses: { 200: { description: 'Live CIQ extraction data' } } },
      },
      '/api/projects/{projectId}/tester/compare': {
        post: { summary: 'Offline compare against extraction', tags: ['Tester'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Comparison result' } } },
      },
      '/api/profiles': {
        get: { summary: 'List profiles', tags: ['Profiles'], responses: { 200: { description: 'Array of profiles' } } },
        post: { summary: 'Save a profile', tags: ['Profiles'], responses: { 201: { description: 'Created profile' } } },
      },
      '/api/profiles/{id}': {
        get: { summary: 'Get a profile', tags: ['Profiles'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Profile data' } } },
        delete: { summary: 'Delete a profile', tags: ['Profiles'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } },
      },
    },
    tags: [
      { name: 'Health', description: 'Service health' },
      { name: 'Projects', description: 'Project CRUD' },
      { name: 'Files', description: 'File upload and management' },
      { name: 'Pipeline', description: 'Multi-pass extraction pipeline' },
      { name: 'Results', description: 'Extraction results, payloads, exports' },
      { name: 'Context', description: 'Requirements and notes' },
      { name: 'BRD', description: 'Business Requirements Document generation' },
      { name: 'Tester', description: 'CaptivateIQ live testing and comparison' },
      { name: 'Profiles', description: 'Saved profile management' },
    ],
  };
}

// ── Start server ──────────────────────────────────────────

export { app };

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;

if (!isTest) {
  const PORT = Number(process.env.PORT) || 3847;
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`[icm-api] Server running on http://localhost:${info.port}`);
    console.log(`[icm-api] OpenAPI spec: http://localhost:${info.port}/api/openapi.json`);
  });
}
