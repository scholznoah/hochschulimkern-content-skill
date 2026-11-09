// Lightdeck bridge: serves the web app and a small JSON API, talks to the lamps through backends.
// Zero dependencies. Usage: node bridge/server.mjs [--mock] [--port 8787] [--config path]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRANDS } from '../src/lights.mjs';
import { createCore } from '../src/core.mjs';
import { MockBackend } from './backends/mock.mjs';
import { SmallrigStubBackend } from './backends/smallrig-stub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png' };

export function loadConfig(file) {
  const p = file ?? [path.join(ROOT, 'config/lights.json'), path.join(ROOT, 'config/lights.example.json')].find(existsSync);
  const cfg = JSON.parse(readFileSync(p, 'utf8'));
  for (const l of cfg.lights) if (!l.id || !BRANDS[l.brand]) throw new Error(`invalid light entry: ${JSON.stringify(l)}`);
  return cfg;
}

export async function defaultBackends({ mock }) {
  if (mock) { const m = new MockBackend(); return { gvm: m, viltrox: m, smallrig: m, mock: m }; }
  const { GvmNobleBackend } = await import('./backends/gvm-noble.mjs');
  const { ViltroxHciBackend } = await import('./backends/viltrox-hci.mjs');
  return { gvm: new GvmNobleBackend(), viltrox: new ViltroxHciBackend(), smallrig: new SmallrigStubBackend() };
}

export function createBridge({ config, backends, staticDir = path.join(ROOT, 'app'), srcDir = path.join(ROOT, 'src') }) {
  const core = createCore({ config, backends });
  const sse = new Set();
  core.subscribe((v) => { const msg = `data: ${JSON.stringify(v)}\n\n`; for (const r of sse) r.write(msg); });

  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  const readBody = (req) => new Promise((resolve, reject) => {
    let b = ''; req.on('data', (c) => { b += c; if (b.length > 10_000) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error('invalid JSON')); } });
  });
  const serve = async (res, dir, rel) => {
    const file = path.join(dir, rel);
    if (!file.startsWith(dir + path.sep)) return json(res, 403, { error: 'forbidden' });
    const data = await readFile(file).catch(() => null);
    if (!data) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/api/lights' && req.method === 'GET') return json(res, 200, core.list());
      if (url.pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': hi\n\n'); sse.add(res); req.on('close', () => sse.delete(res)); return;
      }
      const m = url.pathname.match(/^\/api\/lights\/([^/]+)\/state$/);
      if (m && req.method === 'POST') {
        try { return json(res, 202, core.setState(decodeURIComponent(m[1]), await readBody(req))); }
        catch (e) { return json(res, e.code === 404 ? 404 : 400, { error: e.message }); }
      }
      if (url.pathname === '/api/all' && req.method === 'POST') { // body: patch, optional brand
        try { const { brand, ...rest } = await readBody(req); return json(res, 202, core.setAll(rest, brand)); }
        catch (e) { return json(res, 400, { error: e.message }); }
      }
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
      let rel = decodeURIComponent(url.pathname); if (rel.endsWith('/')) rel += 'index.html';
      if (rel.startsWith('/src/')) return serve(res, srcDir, rel.slice(4)); // shared modules for the web app
      return serve(res, staticDir, rel);
    } catch (e) { json(res, 500, { error: String(e.message ?? e) }); }
  });
  server.close_all = async () => { for (const r of sse) r.end(); await core.close(); };
  return { server, core };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
  const mock = process.argv.includes('--mock');
  const { server } = createBridge({ config: loadConfig(arg('--config')), backends: await defaultBackends({ mock }) });
  const port = Number(arg('--port', 8787));
  server.listen(port, '0.0.0.0', () => console.log(`Lightdeck bridge${mock ? ' (MOCK)' : ''}: http://localhost:${port}`));
  process.on('SIGINT', async () => { await server.close_all(); process.exit(0); });
}
