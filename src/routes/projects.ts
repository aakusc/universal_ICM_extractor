/**
 * Project CRUD routes.
 *
 * GET    /api/projects          — list all projects
 * POST   /api/projects          — create a project
 * GET    /api/projects/:id      — get a single project
 * PUT    /api/projects/:id      — update a project
 * DELETE /api/projects/:id      — delete a project
 */

import { Hono } from 'hono';
import * as store from '../project/store.js';

const app = new Hono();

// List projects
app.get('/', (c) => {
  return c.json(store.listProjects());
});

// Create project
app.post('/', async (c) => {
  const body = await c.req.json<{ name?: string; description?: string }>();
  if (!body.name) {
    return c.json({ error: 'name is required' }, 400);
  }
  const project = store.createProject(body.name, body.description);
  return c.json(project, 201);
});

// Get project
app.get('/:id', (c) => {
  const project = store.getProject(c.req.param('id')!);
  if (!project) return c.json({ error: 'Project not found' }, 404);
  return c.json(project);
});

// Update project
app.put('/:id', async (c) => {
  const body = await c.req.json<{ name?: string; description?: string }>();
  const updated = store.updateProject(c.req.param('id')!, body);
  if (!updated) return c.json({ error: 'Project not found' }, 404);
  return c.json(updated);
});

// Delete project
app.delete('/:id', (c) => {
  const deleted = store.deleteProject(c.req.param('id')!);
  if (!deleted) return c.json({ error: 'Project not found' }, 404);
  return c.json({ ok: true });
});

export default app;
