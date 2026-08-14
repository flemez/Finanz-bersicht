# Finanzübersicht 💶

Eine schlanke, private **Finanz- und Budget-App** – inspiriert von
[Actual Budget](https://github.com/actualbudget/actual). Sie nutzt das
**Umschlag-Prinzip** (Envelope Budgeting): Jeder Euro bekommt eine Aufgabe.

Die App läuft komplett im Browser als **PWA** (Progressive Web App) – also
auch **am Handy** installierbar und **offline** nutzbar. Es gibt **keinen
Server** und **kein Konto**: Alle Daten bleiben **lokal auf deinem Gerät**.

## Funktionen (Grundgerüst)

- 💰 **Konten** anlegen (Giro, Bargeld, Sparen, Kreditkarte …) mit Saldo
- 📥 **Buchungen** erfassen (Ausgaben & Einnahmen, mit Kategorie, Datum, Notiz)
- 📊 **Umschlag-Budget** pro Monat: budgetieren, Ausgaben sehen, „Verfügbar" rollt weiter
- 🗂 **Kategorien & Gruppen** frei anlegen
- 💾 **Backup**: Daten als Datei exportieren / importieren
- 📱 **Offline-fähig** dank Service-Worker, mobile-first Design (heller & dunkler Modus)

## Am Handy nutzen

Nach dem Hosten (siehe unten) die URL am Handy im Browser öffnen und
„**Zum Home-Bildschirm hinzufügen**" wählen. Dann startet die App wie eine
native App im Vollbild.

## Lokal ausprobieren

Weil es reines HTML/CSS/JavaScript ohne Build-Schritt ist, reicht ein
einfacher Webserver:

```bash
# Variante 1: Python
python3 -m http.server 8080

# Variante 2: Node
npx serve .
```

Dann `http://localhost:8080` öffnen.

> Hinweis: Der Service-Worker (Offline-Modus) braucht `http(s)://`. Das direkte
> Öffnen der `index.html` per Datei-Doppelklick funktioniert für die App
> selbst, aber die Offline-Installation nicht.

## Kostenlos hosten (GitHub Pages)

Dieses Repo bringt einen fertigen Workflow mit
(`.github/workflows/pages.yml`). So aktivierst du das Hosting:

1. In den **Repo-Einstellungen → Pages** unter „Build and deployment" die
   Quelle auf **„GitHub Actions"** stellen.
2. Auf den Branch `main` pushen/mergen – der Workflow veröffentlicht die App
   automatisch.
3. Die angezeigte Pages-URL am Handy öffnen und installieren.

## Projektstruktur

```
index.html              App-Gerüst (Kopf, Ansicht, Tab-Leiste)
manifest.webmanifest    PWA-Manifest (Name, Icons, Farben)
sw.js                   Service-Worker (Offline-Caching)
css/styles.css          Mobile-first Design
js/
  app.js                Start, Routing, Navigation
  router.js             Mini-Router (#/budget, #/accounts …)
  db.js                 IndexedDB-Speicher (local-first)
  store.js              Logik: Konten, Kategorien, Umschlag-Budget
  format.js             Euro-/Datumsformat, Helfer
  ui.js                 Dialoge & Meldungen
  views/                Ansichten: budget, accounts, transactions, more
icons/                  App-Icons (SVG + PNG)
```

## Datenschutz

100 % lokal. Es werden keine Daten an Server gesendet. Für einen
Geräte­wechsel oder als Sicherung nutze **Mehr → Sicherung exportieren**.

## Lizenz

MIT – siehe [LICENSE](LICENSE).
