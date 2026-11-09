# Recherchestand (2026-11-09)

Ziel: eine App für GVM SD600D, SmallRig RC 120B (2x) und Viltrox K90 (2er-Pack), je Marke ein eigener Treiber.

Wichtig: Alle Protokollangaben stammen aus Hobbyprojekten, die die Hersteller-Apps analysiert haben. Es gibt keine Herstellerdokumentation. Nichts davon wurde von mir an echter Hardware geprüft (die Entwicklungsumgebung hat kein Bluetooth).

## Übersicht

| Lampe | App des Herstellers | Öffentliche Protokollinfo | Einstufung |
|---|---|---|---|
| GVM SD600D | GVM LED (`com.gvm.cloudphone`) | Ja, für die 800D3X-RGB: einfaches GATT ("BT_LED"). Für SD600D nicht bestätigt. | Wahrscheinlich machbar, Probe nötig |
| Viltrox K90 | ViltroxLink / WeeylitePro | Ja, für Weeylite/Viltrox-Panels: iBeacon-Broadcast ohne Verbindung. Für K90 nicht bestätigt. | Wahrscheinlich machbar, Probe nötig |
| SmallRig RC 120B | SmallGoGo (Leqi) | Nichts gefunden. Herstellerangabe: Mesh-Netzwerk bis 100 m. | Offen, braucht App-Analyse (APK) |

## GVM (Pfad A, einfach)

- Service `00010203-0405-0607-0809-0a0b0c0d1910`, Characteristic `...0d2b10` (write-without-response, notify).
- Frame: `4C 54 | LEN | DEVID | DEVTYPE | Body | CRC16/XMODEM (Big-Endian) | FF`.
- Befehle: Power, Pick, Helligkeit (0-100), CCT (K/100), Farbton (Grad/5), Sättigung, Modus (1 CCT, 2 HSI, 3 Szenen), Szene, Effektzeit.
- Reihenfolge: Modus zuerst, Werte, Helligkeit, Power zuletzt.
- Umgesetzt in `src/gvm.mjs`. Die dokumentierten Beispielframes (Hello `9474`, Hello-Antwort `F39B`) werden in den Tests reproduziert.
- Risiko: Dieselbe App enthält zusätzlich einen verschlüsselten Tuya-Mesh-Pfad. Falls die SD600D diesen nutzt, scheitert Pfad A. Das zeigt die Probe (`tools/probe.html`): Dienst `...1910` sichtbar = Pfad A, Dienst `0x1827`/`0x1828` = Mesh.
- Nicht verfolgt: Schlüssel aus dem Tuya-Cloudkonto ziehen. Das nutzt fremde OEM-Zugangsdaten und ist nicht sauber.

## Viltrox / Weeylite

- Kein GATT. Der Befehl (16 Byte) steckt in der Proximity-UUID einer iBeacon-Werbung (Major 10, Minor 110, TX -59 dBm, Intervall 100 ms).
- Frame: `EF | Kanal(1-19)<<3 | Gruppe A-F (+1) | Modus | Daten | FE | Paketzähler 0-222 | Helligkeit`.
- Modi: CCT, HSI, RGBW, Szenen (0-25), Power an/aus.
- Umgesetzt in `src/viltrox.mjs`.
- Offene Punkte: Die dokumentierten HSI/CCT/RGBW-Beispiele haben Helligkeitsbytes über 100 (0x96, 0xC8), was der eigenen Regel "0-100" widerspricht. Die Tests nutzen daher abgeleitete Vektoren mit 0x64. Die CCT-Kodierung als K/100 ist aus einem Beispiel abgeleitet. Ob die K90 überhaupt dieses Schema nutzt, ist nicht belegt (ViltroxLink beschreibt "Bluetooth networking").
- Technische Konsequenz: Ein Browser kann nicht senden (Web Bluetooth kann nicht werben). Senden geht nur aus einer nativen iOS-App (CoreLocation/CoreBluetooth) oder über eine ESP32-Brücke wie `esphome-viltrox`.

## SmallRig RC 120B

- Nichts Öffentliches gefunden. Laut Handbuch und Test: App SmallGoGo, Mesh-Gruppen und Szenen, Firmware-Updates über die App.
- Nutzerberichte zur App: instabil, mehrere Lampen gleichzeitig teils nicht steuerbar.
- Wenn es ein verschlüsseltes Mesh ist, hilft Mitschneiden nichts, weil die Nutzlast verschlüsselt ist. Dann bleibt: Lampe zurücksetzen und in ein eigenes Mesh einbinden, oder die App statisch analysieren.

## Wie komme ich an die Protokolle ohne Android

1. **APK-Analyse (bevorzugt):** APKs von GVM LED, ViltroxLink/WeeylitePro und SmallGoGo am PC herunterladen und in einen Ordner im Repo legen. Statische Analyse mit jadx ist ein reines Lesen des Apps-Codes und stellt nichts an Handy oder Lampe an. Meine Umgebung kann die APK-Seiten selbst nicht erreichen (Netzwerk gesperrt).
2. **Probe am PC:** `tools/probe.html` zeigt, welchen Pfad jede Lampe nutzt. Kein Android nötig.
3. **iPhone-Mitschnitt:** Mit Mac, Xcode-Profil "Bluetooth Logging" und PacketLogger oder `idevicebtlogger` ist ein HCI-Mitschnitt vom iPhone möglich. Verschlüsselte Mesh-Nachrichten bleiben dabei verschlüsselt.

## Quellen

- GVM Analyse: https://github.com/dirtyredz/gvm-led (docs/research/protocol.md)
- Viltrox/Weeylite Protokoll: https://github.com/dsluo/esphome-viltrox (PROTOCOL.md)
- GVM Homebridge-Plugin: https://github.com/Willian-Zhang/homebridge-gvm-ble-lights
- Weeylite PC-Controller (ungeprüft): https://github.com/fadhelgame/Weeylite-Lamp-Controller
- ViltroxLink / WeeylitePro: https://apps.apple.com/us/app/weeylitepro/id1589472770
- SmallGoGo: https://apps.apple.com/us/app/smallgogo/id1571101760
- RC 120B Handbuch (Mirror): https://manuals.plus/asin/B09SH7PRB5
- iOS HCI-Mitschnitt: https://www.mankier.com/1/idevicebtlogger
- Lizenzen der Referenzprojekte: nicht geprüft. Es wurde kein Code übernommen, nur Protokollfakten.

## Architekturentscheidung: PWA plus Bridge (wegen iOS)

Anforderung: Web-App, auf dem iPhone über Link zum Home-Bildschirm hinzufügbar, kein App Store.

Befund: Safari und alle iOS-Browser nutzen WebKit. WebKit hat kein Web Bluetooth. Eine PWA auf iOS kann deshalb keine Lampen direkt steuern. Für Viltrox kommt hinzu, dass Browser nicht werben (advertisen) können.

Gewählt:

```
iPhone (PWA, Home-Bildschirm)  --WLAN-->  Bridge (Bluetooth)  --BLE-->  Lampen
```

- Die Bridge ist ein kleines Gerät im Heim-/Studionetz, z. B. Raspberry Pi mit Bluetooth oder ESP32. Ein Mac/PC als Bridge geht für die Entwicklung.
- Die Bridge liefert die PWA selbst aus (http im LAN). "Zum Home-Bildschirm" funktioniert dann ohne Store. Eine https-Seite im Internet dürfte keine http-Geräte im LAN ansprechen (Mixed Content), deshalb liefert die Bridge die Oberfläche selbst.
- Die Treiber (`src/gvm.mjs`, `src/viltrox.mjs`) laufen in der Bridge. Sie sind reines JavaScript und damit auf Node und im Browser nutzbar.
- Alternative mit Mac und Xcode: native App per Capacitor. Mit kostenloser Apple-ID verfällt sie nach 7 Tagen, mit Entwicklerkonto (99 USD/Jahr) hält sie ein Jahr. Das wäre die Variante, wenn keine Bridge gewünscht ist.
- Nebeneffekt: Die Bridge hält die BLE-Verbindungen dauerhaft, statt dass das Handy bei jedem Start neu verbindet. Das ist bei den instabilen Hersteller-Apps ein Vorteil.
