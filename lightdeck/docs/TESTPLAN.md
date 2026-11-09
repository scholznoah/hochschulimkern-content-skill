# Testplan für die Hardware-Tests (wenn Lampen und Mac/Pi bereitstehen)

Reihenfolge nach Wichtigkeit. Jeder Schritt sagt, was als Erfolg zählt und was ich danach anpasse. Hersteller-Apps vorher komplett schließen.

## 0. Vorbereitung (Mac, 5 Minuten)

```bash
cd lightdeck && npm test          # 23 Tests müssen grün sein
npm run dev                       # Bridge im Mock-Modus, http://localhost:8787
```

## 1. GVM SD600D (wichtig)

1. Probe: `python3 -m http.server 8000`, dann `http://localhost:8000/tools/probe.html` in Chrome, Lampe einschalten, Schritt 1.
   - Erfolg A: Gerät heißt `BT_LED...`, Dienst `...1910` sichtbar. Dann gilt `src/gvm.mjs`.
   - Erfolg B: nur Dienst `0x1827`/`0x1828` (Mesh). Dann Pfad B, Treiber nicht nutzbar, ich plane Alternative.
2. Bei A: `npm i @abandonware/noble`, `config/lights.example.json` nach `config/lights.json` kopieren, `npm start`, Web-App öffnen, SD600D an/aus, Helligkeit, Farbtemperatur.
   - Erfolg: Lampe reagiert. Das Log der Bridge zeigt `GVM ...: hello` mit DevID, DevType und Kelvin-Bereich.
   - Rückmeldung an mich: Gerätename, Hello-Ausgabe, ob Helligkeit und Kelvin stimmen. Modell auf dem Typenschild (mit oder ohne "II").

## 2. Viltrox K90

Wichtig: Senden geht nur mit Linux-Bluetooth (Raspberry Pi) oder ESP32, nicht vom Mac. Auf dem Pi: `sudo node bridge/server.mjs` (hcitool braucht Root).
1. Lampe in der Weeylite-/Viltrox-App auf Kanal 1, Gruppe A stellen (Merken).
2. Web-App: K90 an/aus.
   - Erfolg: reagiert. Dann gilt das Beacon-Schema für die K90.
   - Keine Reaktion: Kanal/Gruppe in `config/lights.json` anpassen (`channel` 1 bis 19, `group` 0 bis 5), sonst nutzt die K90 ein anderes Schema, dann bitte die ViltroxLink-APK in den Ordner legen.
3. Helligkeit prüfen (0 bis 100). Wenn die Lampe bei 100 % nicht voll hell wird oder zu schnell hell: melden, dann ändere ich den Wertebereich.

## 3. SmallRig RC 120B

Der Treiber sendet noch nicht (Mesh-Transport fehlt). Test vorher:
1. Probe mit zurückgesetzter Lampe: erscheint ein unprovisioniertes Mesh-Gerät (Dienst `0x1827`)?
2. Erst danach baue ich die Provisionierung. Lampe dazu in der SmallGoGo-App ausräumen/zurücksetzen (merken, welche Lampe welche ist).

## 4. iPhone

1. Bridge auf dem Mac/Pi starten, IP herausfinden (`ipconfig getifaddr en0`).
2. Safari: `http://<IP>:8787`, Teilen, "Zum Home-Bildschirm".
3. Prüfen: öffnet als eigene App, Schieberegler flüssig, zeigt "Mit Bridge verbunden".
