/**
 * Context (requirements + notes) endpoint tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../../src/server.js';
import * as store from '../../src/project/store.js';

describe('Context API', () => {
  let projectId: string;

  beforeEach(() => {
    const project = store.createProject('Context Test');
    projectId = project.id;
  });

  afterEach(() => {
    store.deleteProject(projectId);
  });

  describe('Requirements', () => {
    it('GET returns empty array initially', async () => {
      const res = await app.request(`/api/projects/${projectId}/requirements`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('POST creates a requirement', async () => {
      const res = await app.request(`/api/projects/${projectId}/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Must support quarterly payouts', priority: 'high' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.text).toBe('Must support quarterly payouts');
      expect(body.priority).toBe('high');
    });

    it('DELETE removes a requirement', async () => {
      const req = store.addRequirement(projectId, 'Temp req');
      const res = await app.request(`/api/projects/${projectId}/requirements/${req.id}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
    });
  });

  describe('Notes', () => {
    it('GET returns empty array initially', async () => {
      const res = await app.request(`/api/projects/${projectId}/notes`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('POST creates a note', async () => {
      const res = await app.request(`/api/projects/${projectId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Check rate table structure' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.text).toBe('Check rate table structure');
    });

    it('DELETE removes a note', async () => {
      const note = store.addNote(projectId, 'Temp note');
      const res = await app.request(`/api/projects/${projectId}/notes/${note.id}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
    });
  });

  it('returns 404 for nonexistent project', async () => {
    const res = await app.request('/api/projects/nonexistent/requirements');
    expect(res.status).toBe(404);
  });
});
