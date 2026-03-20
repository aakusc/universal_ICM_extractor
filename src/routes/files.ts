/**
 * File management routes (scoped under /api/projects/:projectId/files).
 *
 * GET    /                — list files for project
 * POST   /                — upload a file (base64-encoded body)
 * DELETE /:fileId         — delete a file
 */

import { Hono } from 'hono';
import * as store from '../project/store.js';
import { parseExcelBuffer } from '../excel/parser.js';
import { parseDocumentBuffer, isExcelFile, getFileType } from '../documents/parser.js';

type Env = { Variables: { project: import('../project/types.js').Project } };

const app = new Hono<Env>();

// List files
app.get('/', (c) => {
  const projectId = c.req.param('projectId')!;
  return c.json(store.listFiles(projectId));
});

// Upload file (base64 encoded)
app.post('/', async (c) => {
  const projectId = c.req.param('projectId')!;
  const body = await c.req.json<{ name: string; data: string; type: string }>();
  if (!body.name || !body.data) {
    return c.json({ error: 'name and data (base64) are required' }, 400);
  }

  const buffer = Buffer.from(body.data, 'base64');
  const fileType = getFileType(body.name);
  const category = isExcelFile(body.name)
    ? 'excel' as const
    : (fileType === 'pdf' || fileType === 'docx')
      ? 'document' as const
      : 'unknown' as const;

  const file = store.saveFile(projectId, body.name, buffer, body.type || 'application/octet-stream', category);

  // Auto-parse in background
  try {
    if (category === 'excel') {
      await parseExcelBuffer(buffer, body.name);
      store.markFileParsed(file.id);
    } else if (category === 'document') {
      await parseDocumentBuffer(buffer, body.name);
      store.markFileParsed(file.id);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    store.markFileParsed(file.id, msg);
  }

  return c.json(file, 201);
});

// Delete file
app.delete('/:fileId', (c) => {
  const deleted = store.deleteFile(c.req.param('fileId')!);
  if (!deleted) return c.json({ error: 'File not found' }, 404);
  return c.json({ ok: true });
});

export default app;
