# Projekt-Hinweise für Claude

## Wichtige Arbeitsvorgabe: immer nach `main` mergen

**Nach jeder abgeschlossenen Änderung wird nach `main` gemergt.**

Grund: Die App wird über **GitHub Pages** aus dem `main`-Branch gehostet
(Workflow `.github/workflows/pages.yml`). Nur was in `main` liegt, kann der
Nutzer **auf dem Handy** in der installierten PWA testen.

Ablauf pro Änderung:

1. Änderung wie üblich auf dem Arbeits-/Feature-Branch entwickeln und committen.
2. Branch nach `main` mergen und `main` pushen.
3. Kurz bestätigen, dass gepusht wurde (Pages deployt dann automatisch, ~1–2 Min.).

### Service-Worker nicht vergessen

Die App cacht sich offline über `sw.js`. Bei **jeder** Änderung an Dateien
aus der `ASSETS`-Liste:

- neue Dateien zur `ASSETS`-Liste in `sw.js` hinzufügen und
- die Cache-Version (`const CACHE = 'finanzuebersicht-vN'`) **hochzählen**,

sonst sieht der Nutzer die Änderung auf dem Handy nicht (alter Cache).

## Kurzüberblick zum Projekt

Reine Browser-PWA ohne Build-Schritt (HTML/CSS/JS, ES-Module). Daten liegen
lokal via IndexedDB (`js/db.js`, `js/store.js`). Ansichten unter `js/views/`,
Routing in `js/router.js`/`js/app.js`. Design mobile-first, iOS-nah
(`css/styles.css`).

Lokal testen: `python3 -m http.server 8080` → http://localhost:8080
