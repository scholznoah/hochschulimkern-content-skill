// Records what would be sent. Default for development and tests.
import { toHex } from '../../src/viltrox.mjs';

export class MockBackend {
  constructor(name = 'mock') { this.name = name; this.sent = []; }
  async send(light, messages) {
    for (const m of messages) this.sent.push({ light: light.id, kind: m.kind, hex: toHex(m.bytes) });
  }
  async close() {}
}
