// Backends that use the native iOS shell (Swift) for Bluetooth. `native` = window.lightdeckNative:
//   native.call(method, params) -> Promise, native.on(event, fn).
// Methods: gattConnect {lightId,name,id}, gattWrite {lightId,hex}, beacon {hex}.
import * as gvm from './gvm.mjs';
import { toHex } from './viltrox.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fromHex = (h) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

export function createNativeBackends(native) {
  const lightsById = new Map();
  const connected = new Set();

  native.on('notify', ({ lightId, hex }) => {
    const f = gvm.parseFrame(fromHex(hex));
    const light = lightsById.get(lightId);
    if (f?.type === 'hello' && light) { light.dev = { devId: f.devId, devType: f.devType }; light.range = f.range; }
  });
  native.on('disconnected', ({ lightId }) => connected.delete(lightId));

  const gvmBackend = {
    name: 'gvm-native',
    async send(light, messages) {
      lightsById.set(light.id, light);
      if (!connected.has(light.id)) {
        await native.call('gattConnect', { lightId: light.id, name: light.bleName ?? 'BT', id: light.bleId ?? null });
        connected.add(light.id);
        await native.call('gattWrite', { lightId: light.id, hex: toHex(gvm.hello()) });
        await sleep(400); // hello reply sets light.dev / light.range
      }
      for (const m of messages) { await native.call('gattWrite', { lightId: light.id, hex: toHex(m.bytes) }); await sleep(40); }
    },
  };
  const viltroxBackend = {
    name: 'viltrox-native',
    async send(_light, messages) {
      for (const m of messages) { await native.call('beacon', { hex: toHex(m.bytes) }); await sleep(120); }
    },
  };
  const smallrigBackend = { name: 'smallrig-stub', async send() { throw new Error('SmallRig: Mesh-Transport noch nicht implementiert'); } };
  return { gvm: gvmBackend, viltrox: viltroxBackend, smallrig: smallrigBackend };
}
