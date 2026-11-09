// Viltrox/Weeylite transmitter for Linux (Raspberry Pi etc.) using BlueZ raw HCI via `hcitool`.
// Needs root (or setcap on hcitool). The 16 byte command is the iBeacon proximity UUID,
// advertised non-connectable, ~100 ms interval, Major 10 / Minor 110 / TX -59 (see src/viltrox.mjs).
// macOS cannot do this (CoreBluetooth forbids arbitrary iBeacon payloads): use a Pi or an ESP32.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { toIBeaconManufacturerData } from '../../src/viltrox.mjs';

const run = promisify(execFile);
const hexBytes = (arr) => Array.from(arr, (b) => b.toString(16).padStart(2, '0').toUpperCase());

/** LE Set Advertising Data (OGF 0x08, OCF 0x0008) arguments: length + 31 bytes. No flags, like the Android app. */
export function advDataArgs(cmd16) {
  const mfg = toIBeaconManufacturerData(cmd16); // 02 15 UUID major minor tx (23 bytes)
  const ad = [mfg.length + 3, 0xff, 0x4c, 0x00, ...mfg]; // AD length, type FF, company 004C (little endian)
  const padded = [...ad, ...new Array(31 - ad.length).fill(0)];
  return ['cmd', '0x08', '0x0008', ...hexBytes([ad.length, ...padded])];
}
/** LE Set Advertising Parameters: 100 ms min/max (0x00A0), ADV_NONCONN_IND, all channels. */
export const advParamsArgs = () => ['cmd', '0x08', '0x0006', 'A0', '00', 'A0', '00', '03', '00', '00',
  '00', '00', '00', '00', '00', '00', '07', '00'];
export const advEnableArgs = (on) => ['cmd', '0x08', '0x000A', on ? '01' : '00'];

export class ViltroxHciBackend {
  constructor({ hci = 'hci0', exec = (args) => run('hcitool', ['-i', hci, ...args]) } = {}) {
    this.name = 'viltrox-hci'; this.exec = exec; this.started = false;
  }
  async send(_light, messages) {
    for (const m of messages) {
      if (m.kind !== 'beacon') throw new Error('viltrox backend only sends beacons');
      await this.exec(advEnableArgs(false)).catch(() => {});
      if (!this.started) { await this.exec(advParamsArgs()); this.started = true; }
      await this.exec(advDataArgs(m.bytes));
      await this.exec(advEnableArgs(true));
      await new Promise((r) => setTimeout(r, 120)); // panels ignore commands faster than 100 ms
    }
  }
  async close() { await this.exec(advEnableArgs(false)).catch(() => {}); }
}
