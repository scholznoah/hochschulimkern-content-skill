// Viltrox / Weeylite broadcast protocol: 16-byte command carried as the
// proximity UUID of an iBeacon advertisement (no connection, one-way).
// Source: third-party app analysis (dsluo/esphome-viltrox, PROTOCOL.md).
// Not vendor documentation. UNVERIFIED for the K90 (it may use ViltroxLink with another scheme).
// Browsers (Web Bluetooth) cannot advertise, so transmitting needs native code
// (iOS CLBeaconRegion / CBPeripheralManager) or an ESP32 bridge.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));

export const IBEACON = Object.freeze({ major: 10, minor: 110, txPower: -59, intervalMs: 100 });
export const MIN_SEND_INTERVAL_MS = 100; // faster commands are ignored by the panel

/** Wire value for byte 1: channel (1..19) in bits 7-3, group A..F (0..5) +1 in bits 2-0. 0 = all groups (power). */
const chGroup = (channel, group) => (clamp(channel, 1, 19) << 3) | (group === null ? 0 : clamp(group, 0, 5) + 1);

/** Rolling packet id 0..222, wraps to 0 at 223. */
export class PacketCounter {
  #n = 0;
  next() { const v = this.#n; this.#n = (this.#n + 1) % 223; return v; }
}

const fin = (a) => Uint8Array.from(a);

export function power({ channel, on, id, brightness = 100 }) {
  const pwr = clamp(brightness, 0, 100);
  return fin([0xef, chGroup(channel, null), on ? 0x04 : 0x03, 0x00, 0x64, 0xff, 0xff, 0xff,
    0x00, 0x00, 0x00, 0x11, 0x22, 0xfe, id, pwr]);
}

/** CCT mode. `kelvin` encoding as K/100 is an ASSUMPTION from the doc example (0x37 = 55). tint -10..+10. */
export function cct({ channel, group, kelvin, brightness, id, type = 3, tint = 0 }) {
  const pwr = clamp(brightness, 0, 100);
  return fin([0xef, chGroup(channel, group), 0x00, clamp(kelvin / 100, 0, 255), pwr, clamp(type, 0, 9),
    0x00, clamp(tint + 10, 0, 20), 0x00, 0x00, 0x00, 0x00, 0x02, 0xfe, id, pwr]);
}

export function hsi({ channel, group, hue, saturation, brightness, id }) {
  const pwr = clamp(brightness, 0, 100);
  const h = clamp(hue, 0, 359);
  return fin([0xef, chGroup(channel, group), 0x01, 0x00, pwr, 0x00, 0x00, 0x00,
    h >> 8, h & 0xff, clamp(saturation, 0, 100), 0x01, 0x02, 0xfe, id, pwr]);
}

export function rgbw({ channel, group, r, g, b, w = 0, y = 0, brightness, id }) {
  const pwr = clamp(brightness, 0, 100);
  return fin([0xef, chGroup(channel, group), 0x05, 0x00, pwr, clamp(r, 0, 100), clamp(g, 0, 100),
    clamp(b, 0, 100), clamp(w, 0, 100), clamp(y, 0, 100), 0x00, 0x05, 0x02, 0xfe, id, pwr]);
}

/** Scene 0..25, speed 1..3. */
export function scene({ channel, group, scene: sc, speed = 2, brightness, id }) {
  const pwr = clamp(brightness, 0, 100);
  const s = clamp(sc, 0, 25);
  return fin([0xef, chGroup(channel, group), 0x02, s, pwr, clamp(speed, 1, 3), s,
    0x00, 0x00, 0x00, 0x00, 0x02, 0x02, 0xfe, id, pwr]);
}

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

/** Command bytes -> iBeacon manufacturer data (Apple company id 0x004C). */
export function toIBeaconManufacturerData(cmd, beacon = IBEACON) {
  if (cmd.length !== 16) throw new Error('command must be 16 bytes');
  const tx = beacon.txPower & 0xff;
  return Uint8Array.from([0x02, 0x15, ...cmd, beacon.major >> 8, beacon.major & 0xff,
    beacon.minor >> 8, beacon.minor & 0xff, tx]);
}

export const toHex = hex;
