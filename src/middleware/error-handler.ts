/**
 * Global error handler middleware for the Hono API.
 */

import type { Context } from 'hono';

export function errorHandler(err: Error, c: Context) {
  console.error(`[api] Error: ${err.message}`, err.stack);

  const status = (err as any).status ?? 500;
  return c.json(
    { error: err.message || 'Internal Server Error' },
    status,
  );
}
