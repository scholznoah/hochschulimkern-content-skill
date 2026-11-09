# Lightdeck: Projektstand und Übergabe

Branch: `claude/hochschul-imkern-skill-stop-p8jeel` im Repo `scholznoah/hochschulimkern-content-skill` (Ordner `lightdeck/`). Stand: 2026-11-09.

## Ziel

Eine App für die Steuerung aller Lampen des Nutzers statt mehrerer Hersteller-Apps. Pro Marke ein eigener Treiber, in der App je ein Bereich. Soll als Web-App auf dem iPhone zum Home-Bildschirm hinzufügbar sein (kein App Store). Später eventuell als Tab in die App "LNT Media / Take One" des Nutzers (Repo bisher nicht zugänglich, Aufbau unbekannt).

## Arbeitsweise (Wünsche des Nutzers)

- Auf Deutsch, einfühlsam und lösungsorientiert, keine Gedankenstriche (Em-Dashes).
- Nur seriöse Quellen. Den Nutzer nicht in unklugen Entscheidungen bestätigen, sondern widersprechen.
- Erst selbst alles probieren, den Nutzer nur bei echten Blockaden fragen. Dauer ist zweitrangig.
- Nichts Illegales: nur Analyse der Apps und des Funkverkehrs der eigenen Geräte. Kein Hersteller-Code oder Schlüssel weitergeben.

## Lampen des Nutzers

| Lampe | Hersteller-App |
|---|---|
| GVM SD600D (sehr wichtig) | GVM LED, Android `com.gvm.cloudphone` |
| SmallRig RC 120B, 2 Stück (wichtig) | SmallGoGo (Leqi) |
| Viltrox K90, 2er-Pack | ViltroxLink bzw. WeeylitePro (Weeylite) |

Aperture/Amaran und Neewer sind vorerst nicht nötig. Der Nutzer besitzt kein Android-Handy (iPhone und ein Mac).

## Stand der Recherche (Details: `docs/RESEARCH.md`)

- **GVM**: Öffentliches Protokoll nur für die 800D3X-RGB (dirtyredz/gvm-led): GATT-Dienst `...1910`, Frame `4C 54 | LEN | ID | TYPE | Body | CRC16/XMODEM | FF`. Für die SD600D nicht bestätigt. Die App hat zusätzlich einen verschlüsselten Tuya-Mesh-Pfad.
- **Viltrox/Weeylite**: Befehle sind 16 Byte in einer iBeacon-Werbung (dsluo/esphome-viltrox). Für die K90 nicht bestätigt. Beispiele im Quelldokument widersprechen sich bei der Helligkeit (Bytes über 100).
- **SmallRig**: Keine öffentliche Info. Laut Hersteller Mesh bis 100 m, vermutlich verschlüsselt.

### Ergebnis der APK-Analyse (2026-11-09, Details: `docs/APK-ANALYSE.md`)

- **SmallGoGo**: Echtes Bluetooth-Mesh (Realtek-Stack, Vendor-Modell), Schlüssel entstehen lokal in der App, kein Cloud-Zwang. Befehle: Lum `0x42`, HSI `0x33`, CCT `0x34`, RGBW `0x36`, FX. Eigenes Netz nach Zurücksetzen der Lampe ist plausibel.
- **GVM**: App hat direktes GATT (Scan `BT_LED...`, Dienst `...1910`, 4C54-Frames) und einen Tuya-Mesh-Pfad für Gruppen. SD600D steht als `id 46` in der Geräteliste (Tuya-PID `glhmigqo`); welcher Pfad gilt, entscheidet die Probe. Vorsicht: Es gibt auch "SD600D-II".
- **WeeylitePro**: Beacon-Schema (iBeacon, Major 10, Minor 110) und alle Byte-Layouts bestätigt, `src/viltrox.mjs` deckt sich mit der App. K90 nicht belegt (ViltroxLink-APK lag nicht vor).
- Alle Angaben stammen aus Hobbyprojekten, nicht von Herstellern, und sind an echter Hardware nur teilweise (GVM 800D3X) geprüft.

## Entscheidungen

- **iOS-Web-Apps haben kein Web Bluetooth.** Deshalb: Web-App (Oberfläche) plus **Bridge** (Raspberry Pi, ESP32 oder Mac/PC mit Bluetooth) im WLAN, die die Lampen steuert und die Web-App selbst ausliefert. Viltrox braucht ohnehin Bluetooth-Senden, das Browser nicht können.
- Treiber sind reines JavaScript (ESM, ohne Abhängigkeiten), nutzbar in Node (Bridge) und im Browser.
- Keine Tuya-Cloud-Schlüssel ziehen (fremde OEM-Zugangsdaten).

## Dateien

- `src/gvm.mjs`: GVM-Frames, CRC, Parser, Befehlsreihenfolge (Modus, Werte, Helligkeit, Power zuletzt)
- `src/viltrox.mjs`: Viltrox-Befehle und iBeacon-Verpackung
- `test/protocols.test.mjs`: 13 Tests, alle grün (`npm test`). Die dokumentierten GVM-Beispiele (Hello `9474`, Reply `F39B`) werden reproduziert.
- `tools/probe.html`: Web-Bluetooth-Prüfwerkzeug (Chrome/Edge). Zeigt, ob eine Lampe Pfad A (GATT `...1910`) oder Mesh (`0x1827/0x1828`) nutzt. Nur auf Ladefehler getestet, nicht mit echter Lampe.
- `docs/RESEARCH.md`: Quellen, Einstufung, Architektur

## Grenzen der Umgebung

- Die Cloud-Sitzung hat kein Bluetooth: nichts an Lampen testbar.
- APK-Seiten (APKPure, APKMirror, Play Store) sind aus der Cloud-Sitzung gesperrt. GitHub, PyPI, npm sind erreichbar.
- Der Nutzer hat die APKs heruntergeladen (auf einer SSD, nicht iCloud). Sie müssen als Ordner für die Sitzung freigegeben werden, oder per Git in `lightdeck/apks/`, oder lokal mit einem Analyseskript ausgewertet werden.

## Stand der Umsetzung (2026-11-09, ohne Hardware gebaut)

- Bridge (`bridge/`), Web-App (`app/`), Treiber-Abbildung (`src/lights.mjs`), SmallRig-Encoder (`src/smallrig.mjs`, Entwurf), Viltrox-Szenentabelle. 23 Tests grün, Oberfläche im Mock-Modus bei 360 bis 2560 px geprüft.
- Ungetestet an Hardware: `gvm-noble`, `viltrox-hci` (nur Befehlsaufbau getestet), alles Funkseitige. Ablauf: `docs/TESTPLAN.md`.
- **Architektur-Änderung (Wunsch des Nutzers: kein Raspberry Pi):** native iOS-Hülle `ios/` (SwiftUI + WKWebView, Schema `lightdeck://`). Sie lädt `app/` und `src/` aus dem Bundle, die Treiber laufen in JS, Swift macht nur Bluetooth (GATT-Schreiben für GVM, iBeacon-Senden für Viltrox per CLBeaconRegion). iBeacon-Senden geht auf iOS nur im Vordergrund. Kostenlose Apple-ID: App verfällt nach 7 Tagen. Der Satz "Mac kann kein Viltrox senden" war falsch. Bridge (`bridge/`) bleibt optional (Entwicklung, Mac-Browser). Ungetestet: Lauf auf echtem iPhone (kein Simulator installiert), nur Build für Simulator und Tests mit simulierter Native-Schicht.
- SmallRig: Mesh-Transport fehlt (Schritt 3).

## Nächste Schritte

1. ~~APKs statisch analysieren~~ erledigt (2026-11-09), siehe `docs/APK-ANALYSE.md`. Offen: ViltroxLink-APK selbst (nur WeeylitePro lag vor).
2. Probe (`tools/probe.html`) mit SD600D und K90 am Mac laufen lassen und das Ergebnis auswerten.
3. Treiber für SmallRig ergänzen, sobald das Protokoll klar ist. Falls verschlüsseltes Mesh: Lampe zurücksetzen und in eigenes Mesh einbinden prüfen.
4. Bridge (Node, noble/bleak) mit HTTP/WebSocket-Schnittstelle bauen, dann die Oberfläche als installierbare Web-App (Manifest, Home-Bildschirm), ein Bereich pro Marke.
5. Integration als Tab in die Take-One-App: erst nach Zugriff auf deren Repo.
