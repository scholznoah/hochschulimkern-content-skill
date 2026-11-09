// Brand-independent light model and the mapping from a state to wire messages.
import * as gvm from './gvm.mjs';
import * as vx from './viltrox.mjs';
import * as sr from './smallrig.mjs';

export const DEFAULT_STATE = Object.freeze({
  on: false, brightness: 50, mode: 'cct', kelvin: 5600, hue: 0, saturation: 100, tint: 0,
});

export const BRANDS = Object.freeze({
  gvm: { label: 'GVM', kelvin: [2700, 7500], modes: ['cct', 'hsi'] },
  viltrox: { label: 'Viltrox', kelvin: [2700, 6500], modes: ['cct', 'hsi'] },
  smallrig: { label: 'SmallRig', kelvin: [2700, 6500], modes: ['cct', 'hsi'] },
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? +v : lo));

/** Validate and merge a partial state. Throws on unknown fields. */
export function mergeState(prev, patch) {
  const allowed = Object.keys(DEFAULT_STATE);
  for (const k of Object.keys(patch)) if (!allowed.includes(k)) throw new Error(`unknown field: ${k}`);
  const s = { ...prev, ...patch };
  if (!['cct', 'hsi'].includes(s.mode)) throw new Error('mode must be cct or hsi');
  s.on = !!s.on;
  s.brightness = clamp(s.brightness, 0, 100);
  s.kelvin = clamp(s.kelvin, 1700, 10000);
  s.hue = clamp(s.hue, 0, 359);
  s.saturation = clamp(s.saturation, 0, 100);
  s.tint = clamp(s.tint, -10, 10);
  return s;
}

/**
 * Wire messages for one light.
 * Returns [{ kind, bytes, ... }] kinds: 'gatt-write' (GVM), 'beacon' (Viltrox 16 byte command),
 * 'mesh-vendor' (SmallRig, transport not implemented).
 * `ctx.counter` is a viltrox PacketCounter, `light.dev` the GVM {devId,devType} from the hello reply.
 */
export function encode(light, state, ctx = {}) {
  const brand = BRANDS[light.brand];
  if (!brand) throw new Error(`unknown brand: ${light.brand}`);
  if (light.brand === 'gvm') {
    const dev = light.dev ?? { devId: 0, devType: 0x33 };
    const range = light.range ?? { min: brand.kelvin[0], max: brand.kelvin[1] };
    return gvm.planTransaction(dev, state, range).map((bytes) => ({ kind: 'gatt-write', bytes }));
  }
  if (light.brand === 'viltrox') {
    const channel = light.channel ?? 1;
    if (!state.on) return [{ kind: 'beacon', bytes: vx.power({ channel, on: false, id: ctx.counter.next() }) }];
    const out = [];
    // The official app sends a power-on packet on the off->on edge before the mode packet.
    if (ctx.wasOn === false) out.push({ kind: 'beacon', bytes: vx.power({ channel, on: true, id: ctx.counter.next() }) });
    const base = { channel, group: light.group ?? 0, brightness: state.brightness, id: ctx.counter.next() };
    out.push({ kind: 'beacon', bytes: state.mode === 'hsi'
      ? vx.hsi({ ...base, hue: state.hue, saturation: state.saturation })
      : vx.cct({ ...base, kelvin: state.kelvin, tint: state.tint }) });
    return out;
  }
  const cmds = [];
  if (!state.on) cmds.push(sr.lumOff());
  else {
    cmds.push(state.mode === 'hsi'
      ? sr.hsi({ hue: state.hue, saturation: state.saturation, intensity: state.brightness })
      : sr.cct({ kelvin: state.kelvin, intensity: state.brightness, tint: state.tint }));
    cmds.push(sr.lumOn());
  }
  return cmds.map((c) => ({ kind: 'mesh-vendor', bytes: sr.toPayload(c) }));
}
