# 📚 Lesezeit

**Lesezeit** ist eine Plattform zur Leseförderung für Kinder, Jugendliche und Erwachsene.
Sie hilft, eine tägliche Lesegewohnheit aufzubauen – mit Tagesziel, Lesebaum, Lese-Timer,
Bücherregal, Empfehlungen und Erfolgen. Viele kleine Animationen machen das Ganze lebendig.

## Funktionen

- **Intro** – der Lesepass mit Leinen-Einband und Goldprägung schlägt sich auf; innen stehen Datum und Zitat des Tages
- **Heute** – Tagesziel für Minuten und Seiten als zwei Lineale, Stempel „Ziel erreicht“, Zitat des Tages
- **Lesefaden** – Monatsansicht mit Blättern; jeder Lesetag ist ein Knoten im Faden (orange = gelesen, grün = Tagesziel erreicht), Folgetage werden verbunden; eine Lücke lässt den Faden reißen. Verpasste Tage der letzten 7 Tage lassen sich flicken: einmal das Tagesziel in Minuten nachlesen
- **Lesebaum** – wächst mit jedem Lesetag in Folge
- **Sammelheft** – Wörter sowie wichtige Sätze und Zitate (mit Buch und Seite) sammeln
- **Tages- und Wochenblick** – Tag im Lesefaden antippen: Minuten, Seiten, Notizen; Woche mit Durchschnitt, Lesetagen und Vergleich zur Vorwoche
- **Lesetagebuch** – nach jeder Lesezeit ein Satz zum Gelesenen
- **Regal** – Bücher mit Autor/in, Seiten, Gattung, Startdatum, Bewertung und Notizen; *„liest seit X Tagen“*
- **Timer** – Countdown oder freies Lesen, danach Seite, Satz und neues Wort eintragen
- **Entdecken** – Buchempfehlungen (bearbeiten, entfernen, eigene hinzufügen) und Lesetipps je Altersgruppe
- **Belohnungen** – Tagesziel: Knoten-Feier mit Lob · 7 Lesetage in Folge: ein Lesezeichen für die Sammlung · ab 20 Lesetagen im Monat: ein Quadrat für die Lesedecke (lückenlos = goldener Rand) mit Monatsbilanz · Seiten-Meilensteine
- **Erfolge** – Stempel, Lese-Stufen, Lesezeichen-Sammlung und Lesedecke
- **Sprachen:** Deutsch, English, Türkçe, Bosanski – Oberfläche, Tipps, Buchbeschreibungen und Datumsformate passen sich an; das Zitat des Tages bleibt im deutschen Original mit Übersetzung
- Hell- und Dunkelmodus, Handy-Ansicht mit Navigationsleiste unten

## Starten

Kein Build nötig – einfach `index.html` im Browser öffnen, oder lokal servieren:

```bash
python3 -m http.server 8000
```

Dann <http://localhost:8000> öffnen. Beim ersten Start kann man **Beispieldaten laden**, um alles auszuprobieren.

## Auf dem Handy (Android, z. B. Samsung)

**Link:** https://edutek2027-bot.github.io/Lesezeit/

Direkt im Samsung Internet öffnen (Link auf dem Handy antippen):
`intent://edutek2027-bot.github.io/Lesezeit/#Intent;scheme=https;package=com.sec.android.app.sbrowser;end`

![QR-Code](icons/qr-lesezeit.png)

1. QR-Code mit der Kamera scannen oder den Link öffnen (Samsung Internet oder Chrome).
2. **Samsung Internet:** Menü ☰ → „Seite hinzufügen zu“ → „Startbildschirm“.
   **Chrome:** Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.
   In der App gibt es unter Profil auch den Knopf „Als App installieren“, sobald der Browser es anbietet.
3. Lesezeit startet dann wie eine App im Vollbild mit eigenem Icon – und funktioniert auch offline.

Die Daten bleiben auf dem jeweiligen Gerät.

## Datenschutz

Alle Daten bleiben **nur im Browser** (localStorage). Es gibt keinen Server und kein Konto.

## Aufbau

```
index.html      Seitenstruktur & Dialoge
css/styles.css  Design & Animationen
js/data.js      Empfehlungen, Tipps, Sprüche, Stufen
js/app.js       App-Logik (Regal, Timer, Statistik, Erfolge)
manifest.webmanifest, sw.js, icons/   installierbare App (PWA), Offline-Betrieb, QR-Code
```
