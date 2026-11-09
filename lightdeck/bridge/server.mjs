// Lightdeck bridge: serves the web app and a small JSON API, talks to the lamps through backends.
// Zero dependencies. Usage: node bridge/server.mjs [--mock] [--port 8787] [--config path]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRANDS, DEFAULT_STATE, encode, mergeState } from '../src/lights.mjs';
import { PacketCounter } from '../src/viltrox.mjs';
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

export function createBridge({ config, backends, staticDir = path.join(ROOT, 'app') }) {
  const lights = new Map(config.lights.map((l) => [l.id, { ...l }]));
  const states = new Map(config.lights.map((l) => [l.id, { ...DEFAULT_STATE }]));
  const status = new Map(config.lights.map((l) => [l.id, { ok: null, error: null }]));
  const queues = new Map(); // per light: latest pending state wins
  const counters = new Map();
  const sse = new Set();

  const view = (id) => ({ ...lights.get(id), dev: undefined, state: states.get(id), status: status.get(id) });
  const broadcast = (id) => { const msg = `data: ${JSON.stringify(view(id))}\n\n`; for (const r of sse) r.write(msg); };

  // Coalescing sender: while a send is running, newer states replace the waiting one.
  function enqueue(id, wasOn) {
    const q = queues.get(id) ?? { running: false, pending: null };
    queues.set(id, q);
    q.pending = { state: { ...states.get(id) }, wasOn };
    if (q.running) return;
    q.running = true;
    (async () => {
      while (q.pending) {
        const { state, wasOn: w } = q.pending; q.pending = null;
        const light = lights.get(id);
        try {
          if (!counters.has(light.channel ?? 1)) counters.set(light.channel ?? 1, new PacketCounter());
          const msgs = encode(light, state, { counter: counters.get(light.channel ?? 1), wasOn: w });
          await backends[light.brand].send(light, msgs);
          status.set(id, { ok: true, error: null });
        } catch (e) { status.set(id, { ok: false, error: String(e.message ?? e) }); }
        broadcast(id);
      }
      q.running = false;
    })();
  }

  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  const readBody = (req) => new Promise((resolve, reject) => {
    let b = ''; req.on('data', (c) => { b += c; if (b.length > 10_000) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error('invalid JSON')); } });
  });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/api/lights' && req.method === 'GET') return json(res, 200, [...lights.keys()].map(view));
      if (url.pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': hi\n\n'); sse.add(res); req.on('close', () => sse.delete(res)); return;
      }
      const m = url.pathname.match(/^\/api\/lights\/([^/]+)\/state$/);
      if (m && req.method === 'POST') {
        const id = decodeURIComponent(m[1]);
        if (!lights.has(id)) return json(res, 404, { error: 'unknown light' });
        const prev = states.get(id);
        let next;
        try { next = mergeState(prev, await readBody(req)); } catch (e) { return json(res, 400, { error: e.message }); }
        states.set(id, next); enqueue(id, prev.on); broadcast(id);
        return json(res, 202, view(id));
      }
      if (url.pathname === '/api/all' && req.method === 'POST') { // body: { on: bool }, optional brand
        let patch; try { patch = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
        const { brand, ...rest } = patch;
        for (const id of lights.keys()) {
          if (brand && lights.get(id).brand !== brand) continue;
          const prev = states.get(id); states.set(id, mergeState(prev, rest)); enqueue(id, prev.on); broadcast(id);
        }
        return json(res, 202, [...lights.keys()].map(view));
      }
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
      let rel = decodeURIComponent(url.pathname); if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(staticDir, rel);
      if (!file.startsWith(staticDir + path.sep)) return json(res, 403, { error: 'forbidden' });
      const data = await readFile(file).catch(() => null);
      if (!data) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': rel === '/sw.js' ? 'no-cache' : 'no-cache' });
      res.end(data);
    } catch (e) { json(res, 500, { error: String(e.message ?? e) }); }
  });
  server.close_all = async () => { for (const r of sse) r.end(); for (const b of new Set(Object.values(backends))) await b.close?.(); };
  return { server, states, lights };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
  const mock = process.argv.includes('--mock');
  const { server } = createBridge({ config: loadConfig(arg('--config')), backends: await defaultBackends({ mock }) });
  const port = Number(arg('--port', 8787));
  server.listen(port, '0.0.0.0', () => console.log(`Lightdeck bridge${mock ? ' (MOCK)' : ''}: http://localhost:${port}`));
  process.on('SIGINT', async () => { await server.close_all(); process.exit(0); });
}
