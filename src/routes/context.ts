/**
 * Context routes — requirements + notes (scoped under /api/projects/:projectId).
 *
 * GET    /requirements              — list requirements
 * POST   /requirements              — add requirement
 * DELETE /requirements/:reqId       — delete requirement
 * GET    /notes                     — list notes
 * POST   /notes                     — add note
 * DELETE /notes/:noteId             — delete note
 */

import { Hono } from 'hono';
import * as store from '../project/store.js';
import type { Requirement } from '../project/types.js';

type Env = { Variables: { project: import('../project/types.js').Project } };

const app = new Hono<Env>();

// ── Requirements ──────────────────────────────────────────

app.get('/requirements', (c) => {
  return c.json(store.listRequirements(c.req.param('projectId')!));
});

app.post('/requirements', async (c) => {
  const projectId = c.req.param('projectId')!;
  const body = await c.req.json<{ text: string; priority?: Requirement['priority'] }>();
  if (!body.text) {
    return c.json({ error: 'text is required' }, 400);
  }
  const req = store.addRequirement(projectId, body.text, body.priority);
  return c.json(req, 201);
});

app.delete('/requirements/:reqId', (c) => {
  const deleted = store.deleteRequirement(c.req.param('reqId')!);
  if (!deleted) return c.json({ error: 'Requirement not found' }, 404);
  return c.json({ ok: true });
});

// ── Notes ─────────────────────────────────────────────────

app.get('/notes', (c) => {
  return c.json(store.listNotes(c.req.param('projectId')!));
});

app.post('/notes', async (c) => {
  const projectId = c.req.param('projectId')!;
  const body = await c.req.json<{ text: string }>();
  if (!body.text) {
    return c.json({ error: 'text is required' }, 400);
  }
  const note = store.addNote(projectId, body.text);
  return c.json(note, 201);
});

app.delete('/notes/:noteId', (c) => {
  const deleted = store.deleteNote(c.req.param('noteId')!);
  if (!deleted) return c.json({ error: 'Note not found' }, 404);
  return c.json({ ok: true });
});

export default app;
