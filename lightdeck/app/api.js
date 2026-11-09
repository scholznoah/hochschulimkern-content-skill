// Two ways to talk to the lamps: through a bridge (HTTP, when served by bridge/server.mjs) or
// directly through the native iOS shell (window.lightdeckNative). Same interface for the UI.
const json = (r) => { if (!r.ok) throw new Error(r.status); return r.json(); };
const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(json);

export async function connect({ onUpdate, onConn }) {
  if (window.lightdeckNative) {
    const { createCore } = await import('/src/core.mjs');
    const { createNativeBackends } = await import('/src/native-backend.mjs');
    const stored = (() => { try { return JSON.parse(localStorage.getItem('lightdeck.lights')); } catch { return null; } })();
    const config = stored?.lights ? stored : await fetch('lights.json').then(json);
    const core = createCore({ config, backends: createNativeBackends(window.lightdeckNative) });
    core.subscribe(onUpdate); onConn(true, 'Direkt per Bluetooth (kein Bridge-Gerät nötig)');
    return { mode: 'native', lights: core.list(), set: async (id, p) => core.setState(id, p), setAll: async (p) => core.setAll(p) };
  }
  const lights = await fetch('/api/lights').then(json);
  const es = new EventSource('/api/events');
  es.onmessage = (e) => { onConn(true, 'Mit Bridge verbunden'); onUpdate(JSON.parse(e.data)); };
  es.onerror = () => onConn(false, 'Bridge nicht erreichbar, versuche erneut ...');
  onConn(true, 'Mit Bridge verbunden');
  return { mode: 'http', lights, set: (id, p) => post(`/api/lights/${encodeURIComponent(id)}/state`, p), setAll: (p) => post('/api/all', p) };
}
