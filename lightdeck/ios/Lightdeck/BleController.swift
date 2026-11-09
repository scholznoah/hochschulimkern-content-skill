import CoreBluetooth
import CoreLocation

enum BleError: LocalizedError {
    case unavailable(String), notFound, noService, notConnected, badInput
    var errorDescription: String? {
        switch self {
        case .unavailable(let s): return "Bluetooth nicht verfügbar: \(s)"
        case .notFound: return "Lampe nicht gefunden (Hersteller-App schließen, Lampe einschalten)"
        case .noService: return "Dienst …1910 fehlt: Die Lampe nutzt wohl den Mesh-Pfad (Probe ausführen)"
        case .notConnected: return "Lampe nicht verbunden"
        case .badInput: return "Ungültige Eingabe"
        }
    }
}

/// CoreBluetooth side: GATT for GVM ("BT_LED", service …1910) and iBeacon advertising for Viltrox/Weeylite.
final class BleController: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate, CBPeripheralManagerDelegate {
    static let service = CBUUID(string: "00010203-0405-0607-0809-0a0b0c0d1910")
    static let characteristic = CBUUID(string: "00010203-0405-0607-0809-0a0b0c0d2b10")

    var emit: (String, [String: Any]) -> Void = { _, _ in }

    private lazy var central = CBCentralManager(delegate: self, queue: .main)
    private lazy var peripheralManager = CBPeripheralManager(delegate: self, queue: .main)

    private struct Conn { let peripheral: CBPeripheral; var characteristic: CBCharacteristic? }
    private var conns: [String: Conn] = [:]
    private var byPeripheral: [UUID: String] = [:]
    private var scans: [String: (name: String, id: String?, cont: CheckedContinuation<CBPeripheral, Error>)] = [:]
    private var connectConts: [UUID: CheckedContinuation<Void, Error>] = [:]
    private var readyConts: [UUID: CheckedContinuation<Void, Error>] = [:]

    // MARK: JS entry
    func handle(_ method: String, _ p: [String: Any]) async throws -> Any {
        switch method {
        case "gattConnect":
            guard let lightId = p["lightId"] as? String else { throw BleError.badInput }
            try await connect(lightId: lightId, name: p["name"] as? String ?? "BT", id: p["id"] as? String)
        case "gattWrite":
            guard let lightId = p["lightId"] as? String, let hex = p["hex"] as? String, let data = Self.data(hex: hex) else { throw BleError.badInput }
            guard let c = conns[lightId], let ch = c.characteristic else { throw BleError.notConnected }
            c.peripheral.writeValue(data, for: ch, type: .withoutResponse)
        case "beacon":
            guard let hex = p["hex"] as? String, let data = Self.data(hex: hex), data.count == 16 else { throw BleError.badInput }
            try await advertiseBeacon(command: data, major: p["major"] as? Int ?? 10, minor: p["minor"] as? Int ?? 110)
        default: throw BleError.badInput
        }
        return NSNull()
    }

    // MARK: GATT (GVM)
    private func waitPoweredOn(_ state: @escaping () -> CBManagerState) async throws {
        for _ in 0..<50 {
            switch state() {
            case .poweredOn: return
            case .unauthorized: throw BleError.unavailable("Zugriff verweigert (Einstellungen > Lightdeck > Bluetooth)")
            case .unsupported: throw BleError.unavailable("nicht unterstützt (Simulator?)")
            case .poweredOff: throw BleError.unavailable("Bluetooth ist aus")
            default: try await Task.sleep(nanoseconds: 100_000_000)
            }
        }
        throw BleError.unavailable("Zeitüberschreitung")
    }

    private func connect(lightId: String, name: String, id: String?) async throws {
        try await waitPoweredOn { self.central.state }
        if let c = conns[lightId], c.peripheral.state == .connected, c.characteristic != nil { return }
        let peripheral: CBPeripheral = try await withCheckedThrowingContinuation { cont in
            scans[lightId] = (name, id, cont)
            central.scanForPeripherals(withServices: nil, options: nil)
            DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
                guard let self, let s = self.scans.removeValue(forKey: lightId) else { return }
                if self.scans.isEmpty { self.central.stopScan() }
                s.cont.resume(throwing: BleError.notFound)
            }
        }
        conns[lightId] = Conn(peripheral: peripheral, characteristic: nil)
        byPeripheral[peripheral.identifier] = lightId
        peripheral.delegate = self
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            connectConts[peripheral.identifier] = cont
            central.connect(peripheral, options: nil)
        }
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            readyConts[peripheral.identifier] = cont
            peripheral.discoverServices([Self.service])
        }
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {}

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? peripheral.name ?? ""
        for (lightId, s) in scans {
            let match = s.id != nil ? peripheral.identifier.uuidString == s.id : name.hasPrefix(s.name)
            guard match else { continue }
            scans.removeValue(forKey: lightId)
            if scans.isEmpty { central.stopScan() }
            s.cont.resume(returning: peripheral)
            return
        }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) { connectConts.removeValue(forKey: peripheral.identifier)?.resume() }
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        connectConts.removeValue(forKey: peripheral.identifier)?.resume(throwing: error ?? BleError.notFound)
    }
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        if let lightId = byPeripheral.removeValue(forKey: peripheral.identifier) { conns.removeValue(forKey: lightId); emit("disconnected", ["lightId": lightId]) }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let s = peripheral.services?.first(where: { $0.uuid == Self.service }) else {
            readyConts.removeValue(forKey: peripheral.identifier)?.resume(throwing: error ?? BleError.noService); return
        }
        peripheral.discoverCharacteristics([Self.characteristic], for: s)
    }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil, let ch = service.characteristics?.first(where: { $0.uuid == Self.characteristic }), let lightId = byPeripheral[peripheral.identifier] else {
            readyConts.removeValue(forKey: peripheral.identifier)?.resume(throwing: error ?? BleError.noService); return
        }
        conns[lightId]?.characteristic = ch
        peripheral.setNotifyValue(true, for: ch)
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        if let error { readyConts.removeValue(forKey: peripheral.identifier)?.resume(throwing: error) }
        else { readyConts.removeValue(forKey: peripheral.identifier)?.resume() }
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let data = characteristic.value, let lightId = byPeripheral[peripheral.identifier] else { return }
        emit("notify", ["lightId": lightId, "hex": data.map { String(format: "%02x", $0) }.joined()])
    }

    // MARK: iBeacon (Viltrox / Weeylite): the 16 byte command is the proximity UUID
    private func advertiseBeacon(command: Data, major: Int, minor: Int) async throws {
        try await waitPoweredOn { self.peripheralManager.state }
        let bytes = [UInt8](command)
        let uuid = UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                               bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]))
        let region = CLBeaconRegion(uuid: uuid, major: CLBeaconMajorValue(major), minor: CLBeaconMinorValue(minor), identifier: "lightdeck")
        guard let adv = region.peripheralData(withMeasuredPower: -59) as? [String: Any] else { throw BleError.badInput }
        if peripheralManager.isAdvertising { peripheralManager.stopAdvertising() }
        peripheralManager.startAdvertising(adv)
    }
    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {}

    static func data(hex: String) -> Data? {
        guard hex.count % 2 == 0 else { return nil }
        var out = Data(); var i = hex.startIndex
        while i < hex.endIndex { let j = hex.index(i, offsetBy: 2); guard let b = UInt8(hex[i..<j], radix: 16) else { return nil }; out.append(b); i = j }
        return out
    }
}
