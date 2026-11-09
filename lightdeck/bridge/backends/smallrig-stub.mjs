// SmallRig needs a Bluetooth Mesh stack (provisioning + encryption), not implemented yet.
export class SmallrigStubBackend {
  constructor() { this.name = 'smallrig-stub'; }
  async send() { throw new Error('SmallRig: Mesh-Transport noch nicht implementiert (siehe docs/APK-ANALYSE.md)'); }
  async close() {}
}
