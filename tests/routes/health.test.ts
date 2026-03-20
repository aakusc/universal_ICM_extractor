/**
 * Health endpoint tests for the Hono API.
 */

import { describe, it, expect } from 'vitest';
import { app } from '../../src/server.js';

describe('GET /api/health', () => {
  it('should return ok status', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('icm-services');
    expect(body.timestamp).toBeDefined();
  });
});

describe('GET /api/openapi.json', () => {
  it('should return valid OpenAPI spec', async () => {
    const res = await app.request('/api/openapi.json');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe('3.1.0');
    expect(body.info.title).toBe('ICM Services API');
    expect(body.paths).toBeDefined();
    expect(Object.keys(body.paths).length).toBeGreaterThan(10);
    expect(body.tags.length).toBeGreaterThan(5);
  });
});
