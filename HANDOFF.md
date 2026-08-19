# Handoff: Wischen zum Löschen (Kategorien & Unterkategorien)

**Branch:** `claude/ios-swipe-delete-categories-uzlu2e`
**Status:** fertig implementiert, gepusht – **noch nicht in `main` gemerged**

---

## Ziel

In der Ansicht **Mehr → Kategorien** sollen sich Kategorien und
Unterkategorien wie in einer nativen iOS-Liste löschen lassen:

1. Zeile **nach links wischen** → ein roter **„Löschen"**-Button erscheint.
2. Auf **„Löschen"** tippen → **Rückfrage** *„… löschen?"* mit
   *Abbrechen / Löschen*.
3. Erst nach Bestätigung wird tatsächlich gelöscht.

Die bisherigen Wege (Löschen über den Bearbeiten-Dialog, Sortier-Pfeile,
„+" für Unterkategorie) bleiben unverändert erhalten – die Wisch-Geste ist
eine zusätzliche, schnellere Alternative.

---

## Was geändert wurde

| Datei | Änderung |
|-------|----------|
| `js/swipe.js` | **Neu.** Wiederverwendbare Swipe-to-Delete-Logik. |
| `js/views/categories.js` | Zeilen als Swipe-Container umgebaut, Lösch-Bestätigungen ergänzt. |
| `css/styles.css` | Styles für Wisch-Zustand und roten Löschen-Button. |
| `sw.js` | `js/swipe.js` in den Offline-Cache aufgenommen, Cache-Version `v13 → v14`. |

---

## Funktionsweise / Architektur

### `js/swipe.js`

Kapselt die komplette Gesten-Logik, damit sie später auch an anderen Listen
(z. B. Konten, Buchungen) wiederverwendet werden kann.

- **Erwartete DOM-Struktur** pro wischbarer Zeile:

  ```html
  <div class="swipe">
    <div class="swipe__delete">
      <button class="swipe__delete-btn">Löschen</button>
    </div>
    <div class="swipe__content"> … sichtbarer Inhalt … </div>
  </div>
  ```

  Der `swipe__content` liegt über dem Button und wird per `translateX`
  verschoben; `.swipe` hat `overflow: hidden`, sodass der Button erst beim
  Wischen sichtbar wird.

- **Exportierte Funktionen:**
  - `attachSwipe(el, onDelete)` – hängt die Geste an eine `.swipe`-Zeile;
    `onDelete` wird beim Tippen auf „Löschen" aufgerufen.
  - `closeOpenSwipe()` – schließt eine ggf. offene Zeile (wird vor jedem
    Re-Render aufgerufen).

- **Verhalten (bewusst nah an iOS):**
  - Pointer-Events (funktioniert für Touch **und** Maus).
  - **Achsen-Erkennung:** erst ab ~6 px Bewegung wird entschieden, ob es
    eine horizontale (Wischen) oder vertikale (Scrollen) Geste ist.
    `touch-action: pan-y` lässt vertikales Scrollen normal zu.
  - **Konstante `OPEN_WIDTH = 88`** – muss zur Breite von `.swipe__delete`
    in `styles.css` passen. Bei Änderung **beide** Stellen anpassen.
  - Sanfter Widerstand beim Über-Wischen, Auf-/Zuschnappen ab 40 % der
    Breite.
  - Es ist **immer nur eine Zeile gleichzeitig offen**; Tippen außerhalb
    schließt sie (ein einmalig registrierter globaler `pointerdown`-Listener).

### `js/views/categories.js`

- Kategorie-Kopf (`budget-group__head`) und Unterkategorie-Zeilen
  (`cat-row`) sind jetzt in einen `.swipe`-Container gewickelt; die
  bisherige Klasse liegt auf dem `.swipe__content`.
- Neue Helfer `confirmDeleteCategory(ctx, c)` und
  `confirmDeleteSubcategory(ctx, s)`: zeigen `confirmDialog(...)`, löschen
  über den Store (`deleteCategory` / `deleteSubcategory`) und rendern neu.
  Bei *Abbrechen* wird die Zeile wieder zugeschnappt (`closeOpenSwipe()`).
- `renderCategories()` ruft am Anfang `closeOpenSwipe()`, um beim Re-Render
  keinen veralteten Zustand zu behalten.

### `css/styles.css`

- Abschnitt **„Swipe-to-Delete (iOS-Stil)"** mit `.swipe`,
  `.swipe__delete`, `.swipe__delete-btn`, `.swipe__content`.
- Der Kategorie-Kopf behält seine dunklere Hintergrundfarbe über die
  spezifischere Regel `.budget-group__head.swipe__content`.
- Farben nutzen die vorhandenen Design-Tokens (`--danger`, `--surface`,
  `--bg-elev-2`) und funktionieren in hellem wie dunklem Modus.

### `sw.js`

- Neue Datei `./js/swipe.js` zur `ASSETS`-Liste hinzugefügt (sonst offline
  nicht verfügbar).
- **Cache-Version erhöht** (`finanzuebersicht-v14`) – zwingend nötig, damit
  Clients den neuen Stand laden.

---

## Lokal testen

Kein Build-Schritt nötig:

```bash
python3 -m http.server 8080
# dann http://localhost:8080 öffnen
```

Am besten im mobilen/Touch-Modus (z. B. Browser-DevTools → Responsive)
unter **Mehr → Kategorien** eine Zeile nach links ziehen.

Checkliste:
- [ ] Kategorie nach links wischen → roter „Löschen"-Button erscheint.
- [ ] „Löschen" → Rückfrage; *Abbrechen* schließt die Zeile ohne Löschen.
- [ ] *Löschen* entfernt Kategorie **inkl. Unterkategorien**.
- [ ] Unterkategorie einzeln löschen funktioniert genauso.
- [ ] Vertikales Scrollen der Liste bleibt normal möglich.
- [ ] Nur eine Zeile gleichzeitig offen; Tippen daneben schließt sie.
- [ ] Sortier-Pfeile, Stift (Bearbeiten) und „+" funktionieren weiterhin.

---

## Deployment & Update auf dem Handy

1. Branch nach **`main` mergen**.
2. Der Workflow `.github/workflows/pages.yml` veröffentlicht automatisch
   (ca. 1–2 Min.).
3. Auf dem Handy die App **komplett schließen** und **mit Internet** neu
   öffnen. Dank der erhöhten Cache-Version aktualisiert sich der
   Service-Worker; unter iOS gelegentlich erst beim **zweiten** Start.

> Solange nichts in `main` liegt, ist auf der gehosteten App nichts
> sichtbar – Neustart allein genügt nicht.

---

## Mögliche nächste Schritte (optional)

- Gleiche Swipe-Geste auf **Konten** und **Buchungen** anwenden – die Logik
  in `js/swipe.js` ist dafür schon generisch.
- Kleine haptische Rückmeldung (`navigator.vibrate`) beim Aufschnappen.
- „Voll durchwischen" (weit nach links) als sofortiges Löschen mit
  Bestätigung, wie bei iOS Mail.
