import test from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/core.mjs';
import { createNativeBackends } from '../src/native-backend.mjs';
import * as gvm from '../src/gvm.mjs';
import { toHex } from '../src/viltrox.mjs';

function fakeNative() {
  const calls = []; const listeners = {};
  return {
    calls,
    call: async (method, params) => { calls.push({ method, ...params });
      if (method === 'gattWrite' && params.hex === toHex(gvm.hello())) // lamp answers hello
        setTimeout(() => listeners.notify?.forEach((f) => f({ lightId: params.lightId, hex: '4c540a003353000002203 8f39b'.replace(/ /g, '') })), 5);
    },
    on: (n, f) => (listeners[n] ??= []).push(f),
  };
}
const config = { lights: [{ id: 'g', name: 'G', brand: 'gvm' }, { id: 'v', name: 'V', brand: 'viltrox' }, { id: 's', name: 'S', brand: 'smallrig' }] };
const settle = () => new Promise((r) => setTimeout(r, 900));

test('native: GVM connects once, says hello, learns dev/range, then writes frames', async () => {
  const n = fakeNative();
  const core = createCore({ config, backends: createNativeBackends(n) });
  core.setState('g', { on: true, mode: 'cct', kelvin: 4000 });
  await settle();
  assert.equal(n.calls[0].method, 'gattConnect');
  assert.equal(n.calls[1].hex, toHex(gvm.hello()));
  const frames = n.calls.slice(2).map((c) => gvm.parseFrame(Uint8Array.from(c.hex.match(/../g).map((x) => parseInt(x, 16)))));
  assert.ok(frames.length >= 4 && frames.every(Boolean));
  assert.equal(frames[0].devType, 0x33);                       // from hello reply
  core.setState('g', { brightness: 10 }); await settle();
  assert.equal(n.calls.filter((c) => c.method === 'gattConnect').length, 1);
  assert.equal(core.list()[0].status.ok, true);
});

test('native: Viltrox sends 16 byte beacons, SmallRig reports missing mesh', async () => {
  const n = fakeNative();
  const core = createCore({ config, backends: createNativeBackends(n) });
  core.setState('v', { on: true }); core.setState('s', { on: true });
  await settle();
  const beacons = n.calls.filter((c) => c.method === 'beacon');
  assert.equal(beacons.length, 2);                              // power-on + cct
  assert.ok(beacons.every((b) => b.hex.length === 32));
  const s = core.list().find((l) => l.id === 's');
  assert.equal(s.status.ok, false);
  assert.match(s.status.error, /Mesh/);
});
