// GVM "BT_LED" legacy GATT protocol (e.g. 800D3X-RGB, rgb33 family).
// Source: third-party app analysis (dirtyredz/gvm-led, docs/research/protocol.md),
// NOT vendor documentation. Confirmed there on 800D3X-RGB only.
// UNVERIFIED for the SD600D: it may use the same path or a Tuya BLE mesh instead.

export const GVM_SERVICE = '00010203-0405-0607-0809-0a0b0c0d1910';
export const GVM_CHARACTERISTIC = '00010203-0405-0607-0809-0a0b0c0d2b10';

/** CRC16/XMODEM (poly 0x1021, init 0x0000). */
export function crc16xmodem(bytes) {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/**
 * Frame: 4C 54 | LEN | DEVID | DEVTYPE | body | CRC_hi CRC_lo | FF
 * LEN counts DEVID..CRC. CRC covers everything from 4C up to the end of body.
 */
export function buildFrame({ devId = 0x00, devType = 0x30, body, trailer = true }) {
  const len = 2 + body.length + 2; // devId + devType + body + crc
  const head = [0x4c, 0x54, len, devId, devType, ...body];
  const crc = crc16xmodem(head);
  const out = [...head, crc >> 8, crc & 0xff];
  if (trailer) out.push(0xff);
  return Uint8Array.from(out);
}

/** Hello, sent on connect. Uses DEVID 00 / DEVTYPE 00 as in the documented sample. */
export const hello = () => buildFrame({ devId: 0, devType: 0, body: [0x53, 0x00, 0x00, 0x01, 0x00] });

/** State query (documented, not used by the official app). */
export const queryState = (devId, devType) => buildFrame({ devId, devType, body: [0x52, 0x00, 0x00, 0x04] });

export const CMD = Object.freeze({
  power: 0x00, pick: 0x01, brightness: 0x02, cct: 0x03,
  hue: 0x04, saturation: 0x05, mode: 0x06, scene: 0x07, effectTime: 0x08,
});
export const MODE = Object.freeze({ cct: 1, hsi: 2, scene: 3 });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));

/** Single set command: body = 57 00 CMD 01 VAL */
export const setCommand = (dev, cmd, value) =>
  buildFrame({ ...dev, body: [0x57, 0x00, cmd, 0x01, clamp(value, 0, 255)] });

/**
 * Ordered transaction. Rule derived from the hardware proof in the source:
 * mode first, then mode values, brightness, power LAST (a mode change never
 * powers on; values set while off are stored).
 * `range` = {min,max} Kelvin from the hello reply, default 3200..5600.
 */
export function planTransaction(dev, s, range = { min: 3200, max: 5600 }) {
  const out = [];
  if (s.mode === 'cct') {
    out.push(setCommand(dev, CMD.mode, MODE.cct));
    out.push(setCommand(dev, CMD.cct, clamp(s.kelvin, range.min, range.max) / 100));
  } else if (s.mode === 'hsi') {
    out.push(setCommand(dev, CMD.mode, MODE.hsi));
    out.push(setCommand(dev, CMD.hue, clamp(s.hue % 360, 0, 359) / 5)); // 5 degree steps
    out.push(setCommand(dev, CMD.saturation, clamp(s.saturation, 0, 100)));
  } else {
    throw new Error(`unsupported mode: ${s.mode}`);
  }
  out.push(setCommand(dev, CMD.brightness, clamp(s.brightness, 0, 100)));
  out.push(setCommand(dev, CMD.power, s.on ? 1 : 0));
  return out;
}

/** Parse + validate an incoming frame (trailing FF optional). Returns null if invalid. */
export function parseFrame(bytes) {
  let b = Array.from(bytes);
  if (b.at(-1) === 0xff) b = b.slice(0, -1);
  if (b[0] !== 0x4c || b[1] !== 0x54) return null;
  const len = b[2];
  if (b.length !== 3 + len) return null;
  const crc = (b.at(-2) << 8) | b.at(-1);
  if (crc16xmodem(b.slice(0, -2)) !== crc) return null;
  const devId = b[3], devType = b[4], kind = b[5];
  const payload = b.slice(6, -2);
  const frame = { devId, devType, kind, payload };
  if (kind === 0x53) { // hello reply: kind 53, payload 00 00 02 MIN MAX (100 K units)
    frame.type = 'hello';
    frame.range = { min: payload[3] * 100, max: payload[4] * 100 };
  } else if (kind === 0x03 && payload.length >= 9) { // periodic state report
    const [power, pick, bright, cct, hue, sat, mode, scene, time] = payload;
    frame.type = 'state';
    frame.state = {
      on: power === 1, pick, brightness: bright, kelvin: cct * 100,
      hue: hue * 5, saturation: sat, mode: { 1: 'cct', 2: 'hsi', 3: 'scene' }[mode] ?? mode,
      scene, effectTime: time * 100,
    };
  } else frame.type = 'other';
  return frame;
}
