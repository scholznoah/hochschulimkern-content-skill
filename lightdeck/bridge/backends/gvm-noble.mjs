// GVM "BT_LED" GATT backend using @abandonware/noble (optional dependency, run `npm i @abandonware/noble`).
// Not tested against a real lamp. Scans for a peripheral whose name starts with `BT` (or matches
// light.bleName / light.bleId), sends the hello frame, reads DevID/DevType/CCT range from the reply.
import * as gvm from '../../src/gvm.mjs';

const norm = (u) => u.replace(/-/g, '').toLowerCase();

export class GvmNobleBackend {
  constructor({ log = console.log } = {}) { this.name = 'gvm-noble'; this.log = log; this.conns = new Map(); this.noble = null; }

  async #nobleLib() {
    if (!this.noble) {
      try { this.noble = (await import('@abandonware/noble')).default; }
      catch { throw new Error('Paket @abandonware/noble fehlt (npm i @abandonware/noble)'); }
      if (this.noble.state !== 'poweredOn') await new Promise((r) => this.noble.once('stateChange', r));
    }
    return this.noble;
  }

  async #connect(light) {
    const noble = await this.#nobleLib();
    const match = (p) => (light.bleId ? p.id === light.bleId || p.address === light.bleId
      : p.advertisement.localName?.startsWith(light.bleName ?? 'BT'));
    const peripheral = await new Promise((resolve, reject) => {
      const t = setTimeout(() => { noble.stopScanning(); reject(new Error('Lampe nicht gefunden (Hersteller-App schliessen?)')); }, 15000);
      noble.on('discover', function onFound(p) {
        if (!match(p)) return;
        clearTimeout(t); noble.removeListener('discover', onFound); noble.stopScanning(); resolve(p);
      });
      noble.startScanning([], false);
    });
    await peripheral.connectAsync();
    const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync([norm(gvm.GVM_SERVICE)], [norm(gvm.GVM_CHARACTERISTIC)]);
    const ch = characteristics[0];
    if (!ch) throw new Error('Dienst ...1910 fehlt: Lampe nutzt wohl den Mesh-Pfad (Probe ausfuehren)');
    const conn = { peripheral, ch };
    await ch.subscribeAsync();
    ch.on('data', (buf) => {
      const f = gvm.parseFrame(buf);
      if (f?.type === 'hello') { light.dev = { devId: f.devId, devType: f.devType }; light.range = f.range; this.log(`GVM ${light.id}: hello`, light.dev, f.range); }
    });
    peripheral.once('disconnect', () => this.conns.delete(light.id));
    await ch.writeAsync(Buffer.from(gvm.hello()), true);
    await new Promise((r) => setTimeout(r, 400));
    this.conns.set(light.id, conn);
    return conn;
  }

  async send(light, messages) {
    const conn = this.conns.get(light.id) ?? await this.#connect(light);
    for (const m of messages) {
      await conn.ch.writeAsync(Buffer.from(m.bytes), true);
      await new Promise((r) => setTimeout(r, 40));
    }
  }
  async close() { for (const c of this.conns.values()) await c.peripheral.disconnectAsync().catch(() => {}); }
}
