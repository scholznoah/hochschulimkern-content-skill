---
name: hochschulimkern-content-generator
description: |
  Wöchentliches Content-Research und Ideation für Hochschulimkern Social Media.

  Triggert automatisch jeden Montag 8 Uhr ODER manuell auf Anfrage.

  Durchsucht aktuelle Imker-Trends (Reddit, YouTube, Blogs), generiert 10 konkrete
  Content-Ideen basierend auf Stil der bestehenden Reels (@ansbacher_hochschulbienen),
  mit Sprechertexten (Varianten A+B) und Umsetzungstipps (Kameraeinstellung, Schnitt,
  Bewegungen). Trackt alle geposteten/vorgeschlagenen Ideen, um Duplikate zu vermeiden.

  Zeigt alles in interaktivem Artifact: Trends, Content-Ideen, Umsetzungsdetails.

  Nutze diesen Skill, wenn du:
  - Imker-Content-Vorschläge für die Hochschulwoche brauchst
  - Trends in der Imker-Community checken willst
  - Inspiration für neue Video-Konzepte suchst
  - Konkrete Umsetzungstipps fürs Videodreh brauchst

compatibility: Scheduled Tasks, Artifacts, Web Search, File System Access
---

# Hochschulimkern Content Generator

Dieser Skill recherchiert wöchentlich aktuelle Imker-Trends und generiert konkrete,
ausgearbeitete Content-Ideen für die Hochschulimkern Social Media Accounts.

## Workflow

### 1. Trend-Recherche
- Durchsuche Reddit (r/beekeeping, deutschsprachige Imker-Communities)
- Durchsuche YouTube für aktuelle Imker-Content
- Checke Imker-Blogs und News-Seiten
- Identifiziere: Häufige Fragen, Saisonal-Themen, Mythen, Tipps & Tricks
- Berücksichtige die aktuelle Jahreszeit/Bienensaison (Datum beim Ausführen prüfen)

### 2. Stil-Analyse (Basis: Bestehende Reels)
Aus den bisherigen Videos gelernter Stil:
- **Formate:** Mythos oder Wahrheit, Info/Erklärvideo, Prozess-Tutorial, Fragen-Format
- **Ton:** Naturalistisch, informativ, leicht humorvoll
- **Ästhetik:** Close-ups + Makro, Naturfarben (Grün, Gold, Braun), mittlerer Schnittrhythmus
- **Besetzung:** Zwei Frauen vor Kamera, Noah als Kameramann
- **Länge:** 30-60 Sekunden

Bereits behandelte Themen/Projekte (aus Projektordnern ableitbar, vor Ideenfindung prüfen):
Vorstellungsreel, Schwarmkontrolle, Honig schleudern. Neue Ideen sollen entweder ein
neues Format/neuen Blickwinkel auf ein Thema bringen oder ein noch unbehandeltes Thema.

### 3. Ideen-Generierung
Generiere 10 neue Content-Ideen:
- **5-6 Ideen:** Variationen bestehender Formate ("Mythos oder Wahrheit" Part 3-8, neue "Woran erkennt man..."-Videos)
- **4-5 Ideen:** Neue Formate basierend auf aktuellen Trends

### 4. Jede Idee muss enthalten:
- **Titel/Format** (z.B. "Mythos oder Wahrheit #4")
- **Kurzkonzept** (1-2 Sätze: worum geht's, was ist der Hook)
- **Sprechertext Variante A** (vollständiger Text zum Einsprechen)
- **Sprechertext Variante B** (alternativer Ton/Winkel für denselben Inhalt)
- **Umsetzungstipps:**
  - Kameraeinstellung (z.B. Close-up, Makro, Weitwinkel, Über-die-Schulter)
  - Schnitt-Rhythmus (schnell/mittel/langsam, Schnittanzahl grob)
  - Bewegungen/Blocking (wer steht wo, welche Handbewegungen, Requisiten)
- **Geschätzte Länge** (Sekunden)
- **Warum jetzt** (Bezug zu Trend, Saison oder Community-Frage)

### 5. Duplikat-Tracking
- Führe eine Log-Datei `content-ideas-log.md` im Skill-Ordner mit allen bisher
  vorgeschlagenen und geposteten Ideen (Datum, Titel, Status: vorgeschlagen/gedreht/gepostet)
- Vor jeder neuen Ideengenerierung: Log lesen und Themen-Überschneidungen vermeiden
- Nach Ausgabe: neue Vorschläge mit Status "vorgeschlagen" an das Log anhängen

### 6. Ausgabe
- Alles in einem interaktiven HTML-Artifact darstellen:
  - Abschnitt "Trends diese Woche" (kurze Zusammenfassung der Recherche)
  - 10 Ideen-Karten mit allen Details aus Schritt 4, aufklappbar/übersichtlich
- Kurze Textzusammenfassung im Chat (Titel-Liste), Details im Artifact
