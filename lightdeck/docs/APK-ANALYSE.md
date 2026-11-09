# Statische APK-Analyse (2026-11-09)

Methode: jadx 1.5.6, nur Lesen des App-Codes. Es wurde nichts ausgeführt, kein Hersteller-Code und keine Schlüssel in dieses Repo übernommen. Es stehen hier nur Protokollfakten.

Analysierte Pakete:

| App | Version | Paket |
|---|---|---|
| SmallGoGo | 2.2.8 | `com.zzcyi.bluetoothled` (Mesh-Bibliothek `com.iton.meshlib.rtk`, native `libcoreMesh.so`, Realtek-SDK `com.realsil.sdk.mesh`) |
| GVM LED | 1.8.0 | `com.gvm.cloudphone` |
| WeeylitePro | 3.29.0108 | `com.ruitianzhixin.weeylite2` |

Hinweis: ViltroxLink selbst lag nicht vor, nur WeeylitePro (gleicher OEM). Ob die K90 mit dem Weeylite-Schema arbeitet, belegt die Analyse nicht (in der App kommt weder "Viltrox" noch "K90" vor).

## 1. SmallGoGo (SmallRig RC 120B): echtes Bluetooth-Mesh, Schlüssel lokal

- Die App nutzt einen Bluetooth-Mesh-Stack von Realtek (`libcoreMesh.so`) mit Vendor-Modell. Die Gruppenadresse "alle Lampen" ist `0xC000` (`ALL_GROUP_ADDRESS = 49152`).
- **Wichtig: Netz- und App-Schlüssel entstehen lokal** mit `SecureRandom` (`data/r.java`, Netzname "LED"). Es gibt keinen Cloud-Schlüssel wie bei Tuya. Das Netz lässt sich in der App exportieren und importieren (`ExportImportMesh`, JSON mit `NetKey`/`AppKey`). Damit ist ein eigenes Netz mit eigenen Schlüsseln möglich, wenn die Lampe zurückgesetzt und neu provisioniert wird.
- Vendor-Transport: Modell `MESH_MODEL_DATATRANS_CLIENT = 0x5005D` (Company-ID `0x005D` Realtek, Modell `0x0005`). `VendorClient` sendet über dieses Modell mit einem Ein-Byte-Opcode je Funktion (z. B. `0x24` allgemeine Vendor-Daten, `0x28` Heartbeat, `0x2A` Zeit, `0x30` Spannung, `0x33`). Ein zweites Modell (`MESH_MODEL_LIGHT_CWRGB_CLIENT`) nutzt den Opcode `C5 5D 00` für CW/RGB-Farbwerte. Welches Modell die Lq-Befehle (CCT/HSI/RGBW) in der Praxis trägt, ist aus der Statik nicht endgültig geklärt.
- Nutzlast: `[Befehls-ID][Daten...]`. Befehls-IDs (`lq/*.java`):

| Befehl | ID | Daten |
|---|---|---|
| Helligkeit / Power (`LqLum`) | `0x42` | 2 Byte: `0xFE00` = an, `0xFC00` = aus, sonst 0 bis 100 als `00 vv` |
| CCT (`LqCct`) | `0x34` | `[K hi][K lo][Helligkeit][(GM+10)*5]`, K in Kelvin als 16 Bit, GM -10 bis +10 |
| HSI (`LqHsi`) | `0x33` | `[Hue hi][Hue lo][Sättigung 0-100][Intensität 0-100]`, Hue 0 bis 360 |
| RGBW (`LqRgbw`) | `0x36` | `[R][G][B][W]`, je 0 bis 255 |
| FX (`LqFx`) | siehe Klasse | Effekt-IDs: Paparazzi 1, Cycle 2, Lightning 3, Pulsing 4, SOS 5, Welding 6, Alarm 7, Fireworks 8, Random 9, Fire 10, TV 11, Fault Bulb 12 |
| Statusabfrage | vermutlich `0x31`, `0x32`, `0x43` | Version, Kapazität, Online-Check (Opcode 14); aus Vergleichen in `LqVendorClient` abgeleitet, nicht sicher |

- Unsicher: Wie die Befehls-ID und die Daten genau im Mesh-Opcode-Bereich landen (die Hilfsklasse `lq/LqVendorClient` fasst mehrere Befehle zusammen und sendet über `VendorClient`/`CoreMeshAdapter.meshSendVendorModelData`). Die Bytes oben stammen aus den Encoder-Klassen, nicht aus einem Mitschnitt. Ohne Lampe ungeprüft.
- Konsequenz für den Treiber: Es ist ein vollständiges Mesh (Provisionierung, AES-CCM, Sequenznummern, Proxy-Dienst `0x1828`). Das ist deutlich mehr Aufwand als GVM/Viltrox. Plan: Lampe zurücksetzen, per Bridge (Node/Python mit einer vorhandenen Mesh-Bibliothek) provisionieren, danach Vendor-Nachrichten senden. Vor dem Bau erst mit Probe prüfen, ob die Lampe beim Zurücksetzen als unprovisioniertes Mesh-Gerät (`0x1827`) erscheint.

## 2. GVM LED (SD600D): zwei Pfade in der App

- **Pfad A (direktes GATT)** in `Service/BLEService.java`: Scan nach Namen mit Präfix `BT` bzw. `BT_LED` (`DeviceActivity`), Dienst `00010203-0405-0607-0809-0a0b0c0d1910`, Characteristic `...0d2b10` zum Schreiben und für Notify, Descriptor `0x2901`. Frameformat in `Util/ControlUtil.java`: `4C 54 | LEN | DevID | DevType | Befehl... | CRC16 | (FF)`. Das passt zum bekannten Format für die 800D3X (`src/gvm.mjs`).
- **Pfad B (Tuya SIG-Mesh)** in `Util/ThingUtil.java` (Thing/Tuya SDK, `ThingSigMeshActivatorBuilder`): wird für Gruppen und Mesh-Steuerung genutzt (`LedActivity`, `GroupDeviceActivity`).
- Geräteliste (76 Modelle) steckt in `SplashActivity`. Die SD600D hat dort `id 46`, `cateId 4`, `type 2` (Bi-Color), CCT 2700 bis 7500 K, `deviceMode 00C3`, `rgbType 00`, `blueType glhmigqo` (das ist eine Tuya-Produkt-ID, kein GATT-Name). Es gibt zusätzlich "GVM-SD600D-II" (CCT 2700 bis 6800 K, `lcadb06g`). Nutzer: bitte Modellbezeichnung auf dem Typenschild prüfen (mit oder ohne "-II").
- Statisch lässt sich nicht entscheiden, ob die SD600D im Einzelbetrieb Pfad A ausspielt. Die App enthält Pfad A für Einzelgeräte (`BT_LED...`), also ist er für ältere und viele aktuelle Modelle vorgesehen. **Die Probe (Scan nach Gerätename und Diensten) bleibt der Beleg.** Erscheint die Lampe als `BT_LED...` mit Dienst `...1910`, gilt `src/gvm.mjs`.
- DevID und DevType aus der Antwort: `DataUtil.mDevID = str.substring(6, 8)`, `mDevType = str.substring(8, 10)` (Hex-Zeichen, also Bytes 3 und 4 der Notify-Antwort). Der Treiber sollte sie aus der Hello-Antwort übernehmen, statt feste Werte zu verwenden.

## 3. WeeylitePro (Weeylite/Viltrox): Beacon-Schema bestätigt

Der Code (`ble/BeaconManager.java`, `ble/BleLed.java`) bestätigt das Schema aus `esphome-viltrox`:

- iBeacon-Werbung, nicht verbindbar, Major 10, Minor 110, TX -59 dBm, Intervall ca. 100 ms (Neusenden nur bei Änderung, mindestens 100 ms Abstand).
- 16 Byte: `EF | Kanal<<3 | Gruppe+1 | Modus | ... | FE | Paketzähler | Helligkeit`. Zähler startet bei 1, läuft bis 222 und springt dann auf 0.
- Die Byte-Layouts für Power, CCT, HSI, Szene und RGBW stimmen mit `src/viltrox.mjs` überein (Feld für Feld gegen die `String.format`-Vorlagen in `BleLed.getAdvertisingData()` geprüft).
- Helligkeit: Das Feld "Power" wird an zwei Stellen geschrieben (Byte 4 und letztes Byte). Der Wertebereich kommt aus den Schiebereglern der Oberfläche; die Werte 0x96/0xC8 aus dem Quelldokument sind demnach kein Bug des Treibers, sondern wahrscheinlich ein anderer Reglerbereich (offen, siehe Abschnitt "Offene Punkte").
- Zusätzliche Modi in der App, die `src/viltrox.mjs` noch nicht hat: Modus 6 (XY-Farbe, `xPos`/`yPos`, 2 Byte je), Modus 7 (Chip-Typ/Chip-ID, Pixel-Lampen), Modus 8 (feste CCT 153 mit HSI-Feldern).
- Szenen-IDs: Die App wandelt den Listenindex über eine Tabelle um (`SCENE_ID = {0,17..32,1..16}`), der Treiber reicht die Nummer roh durch. Zuordnung Index zu Wire-ID muss in den Treiber.
- CCT-Typ-Tabelle: `{30,40,52,55,60,70,60,65,70,75}` (vermutlich Kelvin-Obergrenzen/100 je Lampentyp, nicht eindeutig).

## Offene Punkte (brauchen Hardware oder Doku)

1. K90: nutzt sie wirklich dieses Schema oder ein eigenes? Test: Bridge sendet Power-Beacon an die K90.
2. Welcher Wertebereich für Power/Helligkeit gilt (0 bis 100 laut Regler?). In `CCTActivity` etc. den `SeekBar`-Maximalwert aus den Layout-Ressourcen nachlesen (diese Analyse lief mit `--no-res`).
3. SD600D: Pfad A oder Pfad B, per Probe.
4. SmallRig: Zurücksetzen und eigenes Netz, per Probe und Mesh-Stack in der Bridge.
