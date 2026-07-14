# Doppelkopf-Friends

Eine kleine, installierbare Web-App (PWA) zum Zählen von Doppelkopf-Runden –
mit Solo-Kennzeichnung, Bockrunden und Auswertung. Läuft komplett offline,
speichert lokal auf dem Gerät und lässt sich per Datei sichern/übertragen.

## Funktionen

- **Spieler** anlegen, umbenennen, löschen.
- **Runden erfassen:** Punktwert eingeben, auf Namen tippen
  (1× = Gewonnen, 2× = Verloren, 3× = neutral) und speichern.
- **Nullsummen-Wertung (echtes DoKo):** Verlierer bekommen −Wert, die Gewinner
  teilen sich den Pott. Ein Solo (genau ein Gewinner gegen drei) ergibt so
  automatisch das Dreifache.
- **Bockrunde** starten: Anzahl frei wählbar, vorbelegt mit der Spielerzahl;
  betroffene Runden zählen doppelt (×2) und werden mit 🐏 markiert.
- **Überlappende Bockrunden:** Wird eine Bockrunde gestartet, während bereits
  eine läuft, erscheint eine Auswahl – *Anhängen* (nacheinander, bleibt ×2) oder
  *Doppelbock* (überschneidende Runden zählen ×4). Die Abfrage kommt nur, wenn
  sich die Bockrunden tatsächlich überschneiden.
- **Solo** kennzeichnen (nur bei genau einem Gewinner) mit Kürzel-Badge:
  Bubensolo (B), Damensolo (D), Verdecktes Solo (V), Fleischloser (F),
  Trumpfsolo (T).
- **Verlauf** je Runde mit Punkten pro Spieler und Gesamtsumme.
- **Auswertung:** Punkteverlauf als Diagramm plus Rangliste und Statistik
  (Siege, Niederlagen, Solos).
- **Daten:** Export/Import als JSON-Datei, komplettes Zurücksetzen.

## Als App auf den Homescreen

1. Repository auf **GitHub Pages** veröffentlichen:
   *Settings → Pages → Build and deployment → Source: „Deploy from a branch" →
   Branch `main`, Ordner `/ (root)` → Save.*
2. Nach ein bis zwei Minuten ist die App unter
   `https://<dein-name>.github.io/Doppelkopf-Friends/` erreichbar.
3. Auf dem Handy die Seite öffnen und **„Zum Home-Bildschirm hinzufügen"**
   wählen (iOS: Teilen-Menü; Android/Chrome: Menü → App installieren).

Danach startet die App wie eine native App im Vollbild und funktioniert offline.

## Speicherung / Backup

Alle Daten liegen im `localStorage` des Browsers auf dem jeweiligen Gerät.
Über den Tab **Daten** kannst du:

- **Exportieren** → lädt eine Datei `doppelkopf-JJJJ-MM-TT.json` herunter
  (inklusive Zeitstempel `exportedAt`).
- **Importieren** → **mehrere Dateien gleichzeitig** wählbar. Die Daten werden
  an die vorhandenen **angehängt** (nicht ersetzt): Spieler mit gleichem Namen
  werden zusammengeführt, Runden per id dedupliziert und chronologisch sortiert.
  Jeder Import wird mit **Zeitstempel** in einer Import-Historie protokolliert.

So lassen sich mehrere Spielabende sichern, zusammenführen und zwischen Geräten
übertragen. Zum kompletten Ersetzen vorher „Alles zurücksetzen".

## Technik

Reines HTML/CSS/JavaScript (ES-Module), **kein Build-Schritt**, keine externen
Abhängigkeiten. Ein Service Worker (`sw.js`) cacht die App-Shell für den
Offline-Betrieb.

```
index.html            App-Shell + Tabs
manifest.webmanifest  PWA-Manifest
sw.js                 Service Worker (Offline-Cache)
css/styles.css        Styling (Light/Dark)
js/app.js             UI & Events
js/storage.js         Persistenz + Export/Import
js/scoring.js         Nullsummen-Berechnung
js/charts.js          SVG-Diagramm
icons/                App-Icons
```

## Lokal testen

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```
