# 📚 Lesezeit

**Lesezeit** ist eine Plattform zur Leseförderung für Kinder, Jugendliche und Erwachsene.
Sie hilft, eine tägliche Lesegewohnheit aufzubauen – mit Tagesziel, Lesebaum, Lese-Timer,
Bücherregal, Empfehlungen und Erfolgen. Viele kleine Animationen machen das Ganze lebendig.

## Funktionen

- **Übersicht** – Tagesziel für Minuten und Seiten (Doppelring), Lesebaum 🌳 (wächst mit jedem Lesetag in Folge), Statistik (Bücher, Seiten, Lesezeit), Wochen-Diagramm, „Gerade lese ich“ mit Fortschritt und *„liest seit X Tagen“*, Tipp des Tages
- **Mein Regal** – Bücher mit Titel, Autor/in, Seiten, Gattung, Startdatum, Bewertung und Notizen; Status *Lese ich / Gelesen / Wunschliste*; animierte Buchcover
- **Lese-Timer** – Countdown (10/20/30/45 Min.) oder freies Lesen, läuft auch nach Neuladen weiter; danach aktuelle Seite eintragen; manuelles Nachtragen möglich
- **Entdecken** – Buchempfehlungen und Lesetipps passend zur Altersgruppe (Kinder 6–10, Jugendliche 11–17, Erwachsene)
- **Erfolge** – 16 Abzeichen und 6 Lese-Stufen (Lesepunkte)
- Konfetti beim Tagesziel und bei beendeten Büchern, Hell-/Dunkelmodus, Handy-Ansicht mit Navigationsleiste unten

## Starten

Kein Build nötig – einfach `index.html` im Browser öffnen, oder lokal servieren:

```bash
python3 -m http.server 8000
```

Dann <http://localhost:8000> öffnen. Beim ersten Start kann man **Beispieldaten laden**, um alles auszuprobieren.

## Datenschutz

Alle Daten bleiben **nur im Browser** (localStorage). Es gibt keinen Server und kein Konto.

## Aufbau

```
index.html      Seitenstruktur & Dialoge
css/styles.css  Design & Animationen
js/data.js      Empfehlungen, Tipps, Sprüche, Stufen
js/app.js       App-Logik (Regal, Timer, Statistik, Erfolge)
```
