# 📚 Lesezeit

**Lesezeit** ist eine Plattform zur Leseförderung für Kinder, Jugendliche und Erwachsene.
Sie hilft, eine tägliche Lesegewohnheit aufzubauen – mit Tagesziel, Lesebaum, Lese-Timer,
Bücherregal, Empfehlungen und Erfolgen. Viele kleine Animationen machen das Ganze lebendig.

## Funktionen

- **Intro** – der Lesepass mit Leinen-Einband und Goldprägung schlägt sich auf; innen stehen Datum und Zitat des Tages
- **Heute** – Tagesziel für Minuten und Seiten als zwei Lineale, Stempel „Ziel erreicht“, Zitat des Tages
- **Lesepass** – Monatsblatt, jeder Lesetag bekommt einen Stempel (voll = Tagesziel geschafft)
- **Lesebaum** – wächst mit jedem Lesetag in Folge
- **Wortschatz** – neue, schöne oder schwierige Wörter aus den Büchern sammeln
- **Lesetagebuch** – nach jeder Lesezeit ein Satz zum Gelesenen
- **Regal** – Bücher mit Autor/in, Seiten, Gattung, Startdatum, Bewertung und Notizen; *„liest seit X Tagen“*
- **Timer** – Countdown oder freies Lesen, danach Seite, Satz und neues Wort eintragen
- **Entdecken** – Buchempfehlungen und Lesetipps je Altersgruppe (Kinder, Jugendliche, Erwachsene)
- **Erfolge** – 18 Stempel und 6 Lese-Stufen
- Hell- und Dunkelmodus, Handy-Ansicht mit Navigationsleiste unten

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
