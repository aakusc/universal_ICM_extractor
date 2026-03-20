/**
 * Profile CRUD endpoint tests.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { app } from '../../src/server.js';
import * as store from '../../src/project/store.js';

describe('Profiles API', () => {
  const createdIds: string[] = [];

  afterEach(() => {
    for (const id of createdIds) {
      try { store.deleteProfile(id); } catch { /* ok */ }
    }
    createdIds.length = 0;
  });

  it('GET /api/profiles returns array', async () => {
    const res = await app.request('/api/profiles');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /api/profiles saves a profile', async () => {
    const res = await app.request('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Profile', data: { key: 'value' } }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Test Profile');
    createdIds.push(body.id);
  });

  it('GET /api/profiles/:id returns profile', async () => {
    const meta = store.saveProfile('Profile Get', undefined, { foo: 'bar' });
    createdIds.push(meta.id);

    const res = await app.request(`/api/profiles/${meta.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.foo).toBe('bar');
  });

  it('DELETE /api/profiles/:id deletes profile', async () => {
    const meta = store.saveProfile('Profile Del', undefined, { x: 1 });

    const res = await app.request(`/api/profiles/${meta.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});
