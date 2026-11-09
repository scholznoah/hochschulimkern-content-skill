import test from 'node:test';
import assert from 'node:assert/strict';
import * as gvm from '../src/gvm.mjs';
import * as vx from '../src/viltrox.mjs';

const hx = (s) => s.replace(/[\s-]/g, '').toLowerCase();

// ---- GVM -----------------------------------------------------------------
test('GVM: hello frame matches documented sample (CRC 9474)', () => {
  assert.equal(vx.toHex(gvm.hello()), hx('4C 54 09 00 00 53 00 00 01 00 94 74 FF'));
});

test('GVM: documented hello REPLY has a valid CRC and decodes CCT range 3200-5600 K', () => {
  const f = gvm.parseFrame(Uint8Array.from([0x4c,0x54,0x0a,0x00,0x33,0x53,0x00,0x00,0x02,0x20,0x38,0xf3,0x9b]));
  assert.ok(f, 'frame must validate');
  assert.equal(f.type, 'hello');
  assert.deepEqual(f.range, { min: 3200, max: 5600 });
});

test('GVM: brightness 50% frame is well-formed and parses back', () => {
  const dev = { devId: 0, devType: 0x33 };
  const f = gvm.setCommand(dev, gvm.CMD.brightness, 50);
  assert.equal(vx.toHex(f).slice(0, 20), hx('4C 54 09 00 33 57 00 02 01 32'));
  assert.ok(gvm.parseFrame(f));
});

test('GVM: corrupted frame is rejected', () => {
  const f = Array.from(gvm.hello()); f[6] ^= 1;
  assert.equal(gvm.parseFrame(f), null);
});

test('GVM: transaction order is mode, values, brightness, power last', () => {
  const dev = { devId: 0, devType: 0x33 };
  const cmds = gvm.planTransaction(dev, { mode: 'hsi', hue: 180, saturation: 80, brightness: 30, on: true })
    .map((f) => gvm.parseFrame(f).payload);
  // payload = [00, CMD, 01, VAL] (kind byte 0x57 is not part of it)
  assert.deepEqual(cmds.map((p) => p[1]), [gvm.CMD.mode, gvm.CMD.hue, gvm.CMD.saturation, gvm.CMD.brightness, gvm.CMD.power]);
  assert.equal(cmds[1][3], 36); // 180 deg / 5
});

test('GVM: CCT is clamped to the range from the hello reply', () => {
  const dev = { devId: 0, devType: 0x33 };
  const f = gvm.planTransaction(dev, { mode: 'cct', kelvin: 9000, brightness: 10, on: false })[1];
  assert.equal(gvm.parseFrame(f).payload[3], 56); // 5600 K
});

// ---- Viltrox / Weeylite --------------------------------------------------
test('Viltrox: power on/off equal documented examples', () => {
  assert.equal(vx.toHex(vx.power({ channel: 1, on: true, id: 1 })), hx('EF080400-64FF-FFFF-0000-001122FE0164'));
  assert.equal(vx.toHex(vx.power({ channel: 1, on: false, id: 2 })), hx('EF080300-64FF-FFFF-0000-001122FE0264'));
});

test('Viltrox: scene equals documented example (Candlelight, speed 2, 100%)', () => {
  assert.equal(vx.toHex(vx.scene({ channel: 1, group: 0, scene: 6, speed: 2, brightness: 100, id: 6 })),
    hx('EF090206-6402-0600-0000-000202FE0664'));
});

// The documented HSI/CCT/RGBW examples carry PWR bytes 0x96/0xC8 (>100) which contradict the
// doc's own "0-100" rule. Vectors below are those examples with PWR replaced by 0x64.
test('Viltrox: HSI (derived from documented example, PWR=0x64)', () => {
  assert.equal(vx.toHex(vx.hsi({ channel: 1, group: 0, hue: 180, saturation: 80, brightness: 100, id: 3 })),
    hx('EF090100-6400-0000-00B4-500102FE0364'));
});

test('Viltrox: CCT (derived from documented example, PWR=0x64, neutral tint)', () => {
  assert.equal(vx.toHex(vx.cct({ channel: 1, group: 0, kelvin: 5500, brightness: 100, id: 4 })),
    hx('EF090037-6403-000A-0000-000002FE0464'));
});

test('Viltrox: RGBW (derived from documented example, PWR=0x64)', () => {
  assert.equal(vx.toHex(vx.rgbw({ channel: 1, group: 0, r: 100, g: 50, b: 25, w: 75, y: 0, brightness: 100, id: 5 })),
    hx('EF090500-6464-3219-4B00-000502FE0564'));
});

test('Viltrox: channel/group byte and packet counter wrap', () => {
  const c = vx.hsi({ channel: 19, group: 5, hue: 0, saturation: 0, brightness: 0, id: 0 });
  assert.equal(c[1], (19 << 3) | 6);
  const pc = new vx.PacketCounter(); let last;
  for (let i = 0; i < 224; i++) last = pc.next();
  assert.equal(last, 0);
});

test('Viltrox: iBeacon payload is 25 bytes with UUID = command', () => {
  const cmd = vx.power({ channel: 1, on: true, id: 1 });
  const m = vx.toIBeaconManufacturerData(cmd);
  assert.equal(m.length, 23);
  assert.deepEqual(Array.from(m.slice(2, 18)), Array.from(cmd));
  assert.equal(m[22], 0xc5); // -59 dBm
});
