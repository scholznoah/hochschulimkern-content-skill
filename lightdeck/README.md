# Lightdeck

Eine App, ein Treiber pro Marke: GVM, Viltrox/Weeylite, SmallRig.

## Schnellstart

```bash
npm test        # 23 Tests
npm run dev     # Bridge im Mock-Modus, Oberfläche auf http://localhost:8787
npm start       # echte Lampen (siehe docs/TESTPLAN.md)
```

Auf dem iPhone: Safari, `http://<IP der Bridge>:8787`, Teilen, "Zum Home-Bildschirm".

## Aufbau

- `src/`: Treiber (`gvm`, `viltrox`, `smallrig`) und `lights.mjs` (Zustand zu Funkbefehlen)
- `bridge/server.mjs`: HTTP-API und Auslieferung der Web-App, keine Abhängigkeiten
- `bridge/backends/`: `mock`, `gvm-noble` (GATT), `viltrox-hci` (Linux, BlueZ), `smallrig-stub`
- `app/`: installierbare Web-App (Manifest, Service Worker)
- `config/lights.example.json`: Lampenliste (Kopie als `config/lights.json` anpassen)
- `docs/APK-ANALYSE.md`, `docs/TESTPLAN.md`

## Stand

- `src/gvm.mjs`: GVM-Treiber (Frames, CRC, Parser, Befehlsreihenfolge)
- `src/viltrox.mjs`: Viltrox/Weeylite-Befehle und iBeacon-Verpackung
- `test/`: 13 Tests (`npm test`)
- `tools/probe.html`: Prüfwerkzeug, das zeigt, welches Protokoll deine Lampen sprechen
- `docs/RESEARCH.md`: Quellen, Einstufung, offene Punkte

## Probe benutzen (Mac/Windows, Chrome oder Edge)

```bash
cd lightdeck
python3 -m http.server 8000
```

Dann `http://localhost:8000/tools/probe.html` öffnen. Hersteller-App vorher komplett schließen, Lampe einschalten, Schritt 1 klicken und die Ausgabe (Schritt 3) weitergeben.
