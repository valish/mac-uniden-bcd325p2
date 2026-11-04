import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Store } from './store.mjs';
import { compilePlan, researchBrief, schema } from './plan.mjs';
import { importCSV } from './csv.mjs';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_DATA = path.join(ROOT, '.local');
const assets = new Map([
  ['/', ['web/index.html', 'text/html']],
  ['/app.mjs', ['web/app.mjs', 'text/javascript']],
  ['/style.css', ['web/style.css', 'text/css']],
  ['/icon.svg', ['web/icon.svg', 'image/svg+xml']],
  ...['Regular', 'SemiBold'].map((weight) => [
    `/fonts/IBMPlexSans-${weight}.woff2`,
    [`web/fonts/IBMPlexSans-${weight}.woff2`, 'font/woff2'],
  ]),
  ...['plan', 'schema', 'csv', 'protocol', 'transport'].map((n) => [
    `/src/${n}.mjs`,
    [`src/${n}.mjs`, 'text/javascript'],
  ]),
  ['/example.json', ['examples/weather.json', 'application/json']],
  ['/agent-start', ['docs/AGENT-START.md', 'text/plain']],
  ['/llms.txt', ['llms.txt', 'text/plain']],
]);
function respond(res, status, body, mime = 'application/json') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': mime.startsWith('font/') ? mime : mime + '; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'Permissions-Policy': 'serial=(self)',
  });
  res.end(data);
}
async function body(req) {
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 32 * 1024 * 1024) throw Error('Request exceeds 32 MB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function sameToken(a, b) {
  if (typeof a !== 'string') return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function createHandler({ store, token, getPort }) {
  return async (req, res) => {
    try {
      const origin = `http://127.0.0.1:${getPort()}`;
      if (req.headers.host !== `127.0.0.1:${getPort()}`)
        return respond(res, 403, { error: 'Use the local 127.0.0.1 address' });
      const url = new URL(req.url, origin);
      if (req.method === 'GET') {
        if (assets.has(url.pathname)) {
          const [file, mime] = assets.get(url.pathname);
          return respond(res, 200, await fs.readFile(path.join(ROOT, file)), mime);
        }
        if (url.pathname === '/api/session')
          return respond(res, 200, {
            app: 'mac-uniden-bcd325p2',
            version: '0.1.0',
            token,
            dataDirectory: store.directory,
            root: ROOT,
            nodeExecutable: process.execPath,
          });
        if (url.pathname === '/api/schema') return respond(res, 200, schema);
        if (url.pathname === '/api/plans') return respond(res, 200, await store.plans());
        if (url.pathname === '/api/record')
          return respond(res, 200, await store.read(url.searchParams.get('file')));
        if (url.pathname === '/api/history') return respond(res, 200, await store.history());
        if (url.pathname === '/api/recovery')
          return respond(res, 200, { resume: await store.recovery(url.searchParams.get('plan')) });
      } else if (req.method === 'POST') {
        if (req.headers.origin !== origin || !sameToken(req.headers['x-scanner-token'], token))
          return respond(res, 403, { error: 'Invalid local browser session' });
        if (!String(req.headers['content-type'] || '').startsWith('application/json'))
          return respond(res, 415, { error: 'Use application/json' });
        const data = await body(req);
        if (url.pathname === '/api/validate')
          return respond(res, 200, await compilePlan(data.plan));
        if (url.pathname === '/api/stage') return respond(res, 200, await store.stage(data.plan));
        if (url.pathname === '/api/import-csv')
          return respond(res, 200, { plan: importCSV(data.csv, data.options) });
        if (url.pathname === '/api/brief') return respond(res, 200, { brief: researchBrief(data) });
        if (url.pathname === '/api/save') {
          if (!['receipt', 'backup', 'verification', 'diagnostic'].includes(data.kind))
            throw Error('Invalid save type');
          return respond(res, 201, await store.save(data.kind, data.data));
        }
      }
      respond(res, 404, { error: 'Not found' });
    } catch (e) {
      respond(res, 400, { error: e.message, issues: e.issues });
    }
  };
}
export async function startServer({ port = 8326, directory = DEFAULT_DATA } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid local port');
  const store = await new Store(directory).init(),
    token = randomBytes(32).toString('hex');
  let server;
  server = http.createServer(
    createHandler({ store, token, getPort: () => server.address()?.port || port }),
  );
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return { server, store, url: `http://127.0.0.1:${server.address().port}/` };
}
