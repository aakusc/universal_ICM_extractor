/**
 * Middleware that loads a project from the store and 404s if missing.
 * Sets the project on the context via c.set('project', project).
 */

import { createMiddleware } from 'hono/factory';
import * as store from '../project/store.js';
import type { Project } from '../project/types.js';

type ProjectEnv = {
  Variables: {
    project: Project;
  };
};

export const projectLoader = createMiddleware<ProjectEnv>(async (c, next) => {
  const id = c.req.param('projectId')!;
  if (!id) {
    return c.json({ error: 'Missing project ID' }, 400);
  }
  const project = store.getProject(id);
  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }
  c.set('project', project);
  await next();
});
