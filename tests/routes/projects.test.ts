/**
 * Project CRUD endpoint tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../../src/server.js';
import * as store from '../../src/project/store.js';

describe('Projects API', () => {
  let createdId: string;

  afterEach(() => {
    // Clean up any created projects
    if (createdId) {
      try { store.deleteProject(createdId); } catch { /* ok */ }
      createdId = '';
    }
  });

  it('GET /api/projects returns array', async () => {
    const res = await app.request('/api/projects');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /api/projects creates a project', async () => {
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Project', description: 'For testing' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Test Project');
    expect(body.id).toBeDefined();
    createdId = body.id;
  });

  it('POST /api/projects requires name', async () => {
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/projects/:id returns project', async () => {
    const project = store.createProject('Get Test');
    createdId = project.id;

    const res = await app.request(`/api/projects/${project.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Get Test');
  });

  it('GET /api/projects/:id returns 404 for unknown', async () => {
    const res = await app.request('/api/projects/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PUT /api/projects/:id updates project', async () => {
    const project = store.createProject('Update Test');
    createdId = project.id;

    const res = await app.request(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Name' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Updated Name');
  });

  it('DELETE /api/projects/:id deletes project', async () => {
    const project = store.createProject('Delete Test');

    const res = await app.request(`/api/projects/${project.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);

    // Verify deleted
    const getRes = await app.request(`/api/projects/${project.id}`);
    expect(getRes.status).toBe(404);
  });
});
