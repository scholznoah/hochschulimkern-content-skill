// Platform independent controller: light list, state, coalescing sender. Used by the Node bridge
// and by the iOS app (inside the WebView). `backends` = { gvm, viltrox, smallrig } each with send(light, messages).
import { BRANDS, DEFAULT_STATE, encode, mergeState } from './lights.mjs';
import { PacketCounter } from './viltrox.mjs';

export function createCore({ config, backends }) {
  const lights = new Map(config.lights.map((l) => [l.id, { ...l }]));
  const states = new Map(config.lights.map((l) => [l.id, { ...DEFAULT_STATE }]));
  const status = new Map(config.lights.map((l) => [l.id, { ok: null, error: null }]));
  const queues = new Map();
  const counters = new Map();
  const listeners = new Set();

  for (const l of lights.values()) if (!l.id || !BRANDS[l.brand]) throw new Error(`invalid light entry: ${JSON.stringify(l)}`);

  const view = (id) => ({ ...lights.get(id), dev: undefined, state: states.get(id), status: status.get(id) });
  const emit = (id) => { const v = view(id); for (const f of listeners) f(v); };

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
          const ch = light.channel ?? 1;
          if (!counters.has(ch)) counters.set(ch, new PacketCounter());
          await backends[light.brand].send(light, encode(light, state, { counter: counters.get(ch), wasOn: w }));
          status.set(id, { ok: true, error: null });
        } catch (e) { status.set(id, { ok: false, error: String(e.message ?? e) }); }
        emit(id);
      }
      q.running = false;
    })();
  }

  return {
    list: () => [...lights.keys()].map(view),
    has: (id) => lights.has(id),
    /** Merge a partial state, send it. Throws on invalid input. */
    setState(id, patch) {
      if (!lights.has(id)) throw Object.assign(new Error('unknown light'), { code: 404 });
      const prev = states.get(id);
      states.set(id, mergeState(prev, patch));
      enqueue(id, prev.on); emit(id);
      return view(id);
    },
    setAll(patch, brand) {
      for (const id of lights.keys()) if (!brand || lights.get(id).brand === brand) this.setState(id, patch);
      return this.list();
    },
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    async close() { for (const b of new Set(Object.values(backends))) await b.close?.(); },
  };
}
