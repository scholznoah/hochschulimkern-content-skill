import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge } from '../bridge/server.mjs';
import { MockBackend } from '../bridge/backends/mock.mjs';
import { advDataArgs, advParamsArgs, ViltroxHciBackend } from '../bridge/backends/viltrox-hci.mjs';
import * as sr from '../src/smallrig.mjs';
import * as vx from '../src/viltrox.mjs';
import { encode, mergeState, DEFAULT_STATE } from '../src/lights.mjs';
import * as gvm from '../src/gvm.mjs';

const hex = (u8) => vx.toHex(u8);

test('SmallRig: encoders follow SmallGoGo class layout', () => {
  assert.equal(hex(sr.toPayload(sr.lumOn())), '42fe00');
  assert.equal(hex(sr.toPayload(sr.lumOff())), '42fc00');
  assert.equal(hex(sr.toPayload(sr.lum(50))), '420032');
  assert.equal(hex(sr.toPayload(sr.hsi({ hue: 300, saturation: 80, intensity: 60 }))), '33012c503c');
  assert.equal(hex(sr.toPayload(sr.cct({ kelvin: 5600, intensity: 70, tint: 0 }))), '3415e04632');
  assert.equal(hex(sr.toPayload(sr.rgbw({ r: 255, g: 0, b: 10, w: 300 }))), '36ff000aff');
});

test('Viltrox: scene index maps through the app table', () => {
  assert.equal(vx.sceneByIndex({ channel: 1, group: 0, index: 1, brightness: 100, id: 0 })[3], 17);
  assert.equal(vx.sceneByIndex({ channel: 1, group: 0, index: 17, brightness: 100, id: 0 })[3], 1);
});

test('lights.encode: viltrox sends power-on before mode on the off->on edge, counter ascending', () => {
  const counter = new vx.PacketCounter();
  const s = mergeState(DEFAULT_STATE, { on: true });
  const m = encode({ brand: 'viltrox', channel: 1, group: 0 }, s, { counter, wasOn: false });
  assert.equal(m.length, 2);
  assert.equal(m[0].bytes[2], 0x04); assert.equal(m[0].bytes[14], 0);
  assert.equal(m[1].bytes[2], 0x00); assert.equal(m[1].bytes[14], 1);
  assert.equal(encode({ brand: 'viltrox' }, s, { counter, wasOn: true }).length, 1);
  assert.equal(encode({ brand: 'viltrox' }, { ...s, on: false }, { counter })[0].bytes[2], 0x03);
});

test('lights.encode: gvm ends with power and every frame validates', () => {
  const m = encode({ brand: 'gvm', dev: { devId: 1, devType: 0x33 } }, mergeState(DEFAULT_STATE, { on: true, mode: 'hsi', hue: 120 }));
  assert.ok(m.every((x) => gvm.parseFrame(x.bytes)));
  assert.equal(gvm.parseFrame(m.at(-1).bytes).payload[1], gvm.CMD.power);
});

test('mergeState rejects unknown fields and clamps', () => {
  assert.throws(() => mergeState(DEFAULT_STATE, { evil: 1 }));
  assert.throws(() => mergeState(DEFAULT_STATE, { mode: 'x' }));
  assert.equal(mergeState(DEFAULT_STATE, { brightness: 500 }).brightness, 100);
});

test('HCI backend: advertising data is a 27 byte iBeacon AD structure, padded to 31', () => {
  const cmd = Uint8Array.from({ length: 16 }, (_, i) => i);
  const a = advDataArgs(cmd);
  assert.deepEqual(a.slice(0, 3), ['cmd', '0x08', '0x0008']);
  const bytes = a.slice(3);
  assert.equal(bytes.length, 32);                       // length byte + 31
  assert.equal(bytes[0], '1B');                         // 27 significant bytes
  assert.deepEqual(bytes.slice(1, 8), ['1A', 'FF', '4C', '00', '02', '15', '00']);
  assert.equal(bytes.slice(7, 23).join(''), Array.from(cmd, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(''));
  assert.equal(advParamsArgs().length, 3 + 15);
});

test('HCI backend: command sequence', async () => {
  const calls = [];
  const b = new ViltroxHciBackend({ exec: async (args) => { calls.push(args.slice(0, 3).join(' ')); } });
  await b.send({}, [{ kind: 'beacon', bytes: new Uint8Array(16) }]);
  assert.deepEqual(calls, ['cmd 0x08 0x000A', 'cmd 0x08 0x0006', 'cmd 0x08 0x0008', 'cmd 0x08 0x000A']);
});

async function withBridge(fn) {
  const mock = new MockBackend();
  const config = { lights: [{ id: 'a', name: 'A', brand: 'viltrox' }, { id: 'g', name: 'G', brand: 'gvm' }] };
  const { server } = createBridge({ config, backends: { gvm: mock, viltrox: mock, smallrig: mock } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, mock); } finally { await server.close_all(); server.close(); }
}
const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const settle = () => new Promise((r) => setTimeout(r, 50));

test('bridge: lists lights, applies state, sends via backend', async () => {
  await withBridge(async (base, mock) => {
    const list = await (await fetch(`${base}/api/lights`)).json();
    assert.equal(list.length, 2);
    const r = await post(`${base}/api/lights/a/state`, { on: true, brightness: 80 });
    assert.equal(r.status, 202);
    await settle();
    assert.equal(mock.sent.filter((s) => s.light === 'a').length, 2); // power-on + cct
    const after = await (await fetch(`${base}/api/lights`)).json();
    assert.equal(after[0].state.brightness, 80);
    assert.equal(after[0].status.ok, true);
  });
});

test('bridge: validation, unknown light, path traversal, static files', async () => {
  await withBridge(async (base) => {
    assert.equal((await post(`${base}/api/lights/a/state`, { evil: 1 })).status, 400);
    assert.equal((await post(`${base}/api/lights/zzz/state`, {})).status, 404);
    assert.equal((await fetch(`${base}/..%2Fpackage.json`)).status, 403);
    const idx = await fetch(`${base}/`);
    assert.equal(idx.status, 200);
    assert.match(await idx.text(), /Lightdeck/);
    assert.equal((await fetch(`${base}/manifest.webmanifest`)).headers.get('content-type'), 'application/manifest+json');
  });
});

test('bridge: backend errors are reported, not thrown', async () => {
  const bad = { send: async () => { throw new Error('boom'); } };
  const { server } = createBridge({ config: { lights: [{ id: 'a', name: 'A', brand: 'smallrig' }] }, backends: { smallrig: bad } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  await post(`${base}/api/lights/a/state`, { on: true });
  await settle();
  const l = (await (await fetch(`${base}/api/lights`)).json())[0];
  assert.deepEqual(l.status, { ok: false, error: 'boom' });
  await server.close_all(); server.close();
});
