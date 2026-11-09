# Lightdeck

Eine App, ein Treiber pro Marke: GVM, Viltrox/Weeylite, SmallRig.

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
