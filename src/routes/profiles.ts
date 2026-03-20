/**
 * Profile CRUD routes.
 *
 * GET    /api/profiles          — list all profiles
 * GET    /api/profiles/:id      — get a profile
 * POST   /api/profiles          — save a profile
 * DELETE /api/profiles/:id      — delete a profile
 */

import { Hono } from 'hono';
import * as store from '../project/store.js';

const app = new Hono();

// List profiles
app.get('/', (c) => {
  return c.json(store.listProfiles());
});

// Get profile
app.get('/:id', (c) => {
  const profile = store.getProfile(c.req.param('id')!);
  if (!profile) return c.json({ error: 'Profile not found' }, 404);
  return c.json(profile);
});

// Save profile
app.post('/', async (c) => {
  const body = await c.req.json<{ name: string; description?: string; data: unknown }>();
  if (!body.name) {
    return c.json({ error: 'name is required' }, 400);
  }
  const meta = store.saveProfile(body.name, body.description, body.data);
  return c.json(meta, 201);
});

// Delete profile
app.delete('/:id', (c) => {
  const deleted = store.deleteProfile(c.req.param('id')!);
  if (!deleted) return c.json({ error: 'Profile not found' }, 404);
  return c.json({ ok: true });
});

export default app;
