// SmallRig RC 120B (SmallGoGo / Leqi) vendor payload encoders.
// Source: static analysis of SmallGoGo 2.2.8 (com.iton.meshlib.rtk.lq.*), see docs/APK-ANALYSE.md.
// DRAFT: payloads are read from the encoder classes, never checked against a real lamp.
// Transport (Bluetooth Mesh provisioning, encryption, vendor model 0x005D:0x0005) is NOT implemented here.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));

export const CMD_ID = Object.freeze({ hsi: 0x33, cct: 0x34, rgbw: 0x36, lum: 0x42 });
export const MESH = Object.freeze({ allGroupAddress: 0xc000, companyId: 0x005d, modelId: 0x0005 });

const be16 = (n) => [(n >> 8) & 0xff, n & 0xff];

/** Brightness / power. 0xFE00 = on, 0xFC00 = off, else 0..100 as 00 vv. */
export const lum = (percent) => ({ id: CMD_ID.lum, data: Uint8Array.from(be16(clamp(percent, 0, 100))) });
export const lumOn = () => ({ id: CMD_ID.lum, data: Uint8Array.from([0xfe, 0x00]) });
export const lumOff = () => ({ id: CMD_ID.lum, data: Uint8Array.from([0xfc, 0x00]) });

/** CCT: kelvin (16 bit), second value (intensity, assumed 0..100), green/magenta -10..10. */
export const cct = ({ kelvin, intensity = 100, tint = 0 }) => ({
  id: CMD_ID.cct,
  data: Uint8Array.from([...be16(clamp(kelvin, 0, 65535)), clamp(intensity, 0, 255), (clamp(tint, -10, 10) + 10) * 5]),
});

/** HSI: hue 0..360, saturation 0..100, intensity 0..100. */
export const hsi = ({ hue, saturation, intensity }) => ({
  id: CMD_ID.hsi,
  data: Uint8Array.from([...be16(clamp(hue, 0, 360)), clamp(saturation, 0, 100), clamp(intensity, 0, 100)]),
});

export const rgbw = ({ r, g, b, w = 0 }) => ({
  id: CMD_ID.rgbw,
  data: Uint8Array.from([r, g, b, w].map((v) => clamp(v, 0, 255))),
});

/** [commandId, ...data] as carried in the vendor model. */
export const toPayload = (cmd) => Uint8Array.from([cmd.id, ...cmd.data]);
