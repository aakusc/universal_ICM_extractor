import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { exec } from 'node:child_process';
import {
  getMockPipelineResult,
  getMockConnectorStatuses,
  getMockActivityLog,
  CONCEPT_TAXONOMY,
} from './mock-data.js';
import { CaptivateIQConnector } from '../connectors/captivateiq/connector.js';
import type { IAuthConfig, IConnectionStatus, IRawRule } from '../types/connector.js';

const PORT = 3847;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, 'index.html');

function parseJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // GET /api/data — mock dashboard data
  if (req.url === '/api/data') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(
      JSON.stringify({
        pipeline: getMockPipelineResult(),
        connectors: getMockConnectorStatuses(),
        log: getMockActivityLog(),
        taxonomy: CONCEPT_TAXONOMY,
      })
    );
    return;
  }

  // OPTIONS — CORS preflight for all POST endpoints
  if (req.method === 'OPTIONS' && req.url?.startsWith('/api/')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // POST /api/test-connection — test a real vendor connection
  if (req.url === '/api/test-connection' && req.method === 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    try {
      const body = (await parseJsonBody(req)) as {
        vendor: string;
        auth: Record<string, string>;
      };

      if (!body.vendor || !body.auth) {
        res.writeHead(400);
        res.end(
          JSON.stringify({
            connected: false,
            error: 'Missing vendor or auth in request body',
          })
        );
        return;
      }

      let status: IConnectionStatus;

      if (body.vendor === 'captivateiq') {
        const connector = new CaptivateIQConnector();
        const authConfig: IAuthConfig = {
          baseUrl:
            body.auth.baseUrl || 'https://api.captivateiq.com/ciq/v1',
          apiKey: body.auth.apiKey,
        };
        status = await connector.connect(authConfig);
        await connector.disconnect();
      } else {
        status = {
          connected: false,
          vendor: body.vendor as IConnectionStatus['vendor'],
          error: `${body.vendor} connector is not yet implemented. Coming soon.`,
        };
      }

      res.writeHead(200);
      res.end(JSON.stringify(status));
    } catch (err) {
      res.writeHead(500);
      res.end(
        JSON.stringify({
          connected: false,
          error:
            err instanceof Error ? err.message : 'Internal server error',
        })
      );
    }
    return;
  }

  // POST /api/list-plans — list plans from a connected vendor
  if (req.url === '/api/list-plans' && req.method === 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    try {
      const body = (await parseJsonBody(req)) as {
        vendor: string;
        auth: Record<string, string>;
      };

      if (body.vendor === 'captivateiq') {
        const connector = new CaptivateIQConnector();
        const connStatus = await connector.connect({
          baseUrl: body.auth.baseUrl || 'https://api.captivateiq.com/ciq/v1',
          apiKey: body.auth.apiKey,
        });
        if (!connStatus.connected) {
          res.writeHead(401);
          res.end(JSON.stringify({ error: connStatus.error || 'Connection failed' }));
          return;
        }
        const plans = await connector.listPlans();
        await connector.disconnect();
        res.writeHead(200);
        res.end(JSON.stringify({ plans }));
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ error: `${body.vendor} connector not yet implemented.` }));
      }
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }));
    }
    return;
  }

  // POST /api/extract-rules — extract raw rules from a vendor
  if (req.url === '/api/extract-rules' && req.method === 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    try {
      const body = (await parseJsonBody(req)) as {
        vendor: string;
        auth: Record<string, string>;
        planId?: string;
      };

      if (body.vendor === 'captivateiq') {
        const connector = new CaptivateIQConnector();
        const connStatus = await connector.connect({
          baseUrl: body.auth.baseUrl || 'https://api.captivateiq.com/ciq/v1',
          apiKey: body.auth.apiKey,
        });
        if (!connStatus.connected) {
          res.writeHead(401);
          res.end(JSON.stringify({ error: connStatus.error || 'Connection failed' }));
          return;
        }
        const rules: IRawRule[] = await connector.extractRules({
          planId: body.planId,
        });
        await connector.disconnect();
        res.writeHead(200);
        res.end(JSON.stringify({ rules, count: rules.length }));
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ error: `${body.vendor} connector not yet implemented.` }));
      }
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }));
    }
    return;
  }

  // Serve HTML for all other routes
  try {
    const html = fs.readFileSync(HTML_PATH, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Failed to load dashboard HTML');
  }
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │   Universal ICM Connector Dashboard          │');
  console.log(`  │   ${url}                       │`);
  console.log('  │   Press Ctrl+C to stop                       │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
  exec(`open ${url}`);
});
