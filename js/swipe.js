// iOS-typisches „Swipe-to-Delete" für Listenzeilen.
//
// Erwartete Struktur einer wischbaren Zeile:
//   <div class="swipe">
//     <div class="swipe__delete">
//       <button class="swipe__delete-btn">Löschen</button>
//     </div>
//     <div class="swipe__content"> … sichtbarer Inhalt … </div>
//   </div>
//
// Der Inhalt wird nach links geschoben und gibt den roten Löschen-Button frei.
// Es ist immer nur eine Zeile gleichzeitig geöffnet.

// Muss zur Breite von .swipe__delete in styles.css passen.
const OPEN_WIDTH = 88;
// Ab dieser Wischstrecke schnappt die Zeile auf bzw. wieder zu.
const THRESHOLD = OPEN_WIDTH * 0.4;

let openRow = null; // aktuell geöffnete .swipe-Zeile (max. eine)

/** Eine bestimmte Zeile schließen. */
function closeRow(el) {
  const content = el.querySelector('.swipe__content');
  content.style.transition = 'transform .22s cubic-bezier(.25,.8,.35,1)';
  content.style.transform = 'translateX(0)';
  el.classList.remove('is-open');
  if (openRow === el) openRow = null;
}

/** Eine bestimmte Zeile öffnen (und eine ggf. andere schließen). */
function openRowEl(el) {
  if (openRow && openRow !== el) closeRow(openRow);
  const content = el.querySelector('.swipe__content');
  content.style.transition = 'transform .22s cubic-bezier(.25,.8,.35,1)';
  content.style.transform = `translateX(-${OPEN_WIDTH}px)`;
  el.classList.add('is-open');
  openRow = el;
}

/** Aktuell offene Zeile schließen (z. B. vor einem erneuten Render). */
export function closeOpenSwipe() {
  if (openRow) closeRow(openRow);
}

// Tippt man irgendwo außerhalb der geöffneten Zeile, schließt sie sich –
// wie bei nativen iOS-Listen. Nur einmal global registrieren.
if (!window.__swipeGlobalBound) {
  window.__swipeGlobalBound = true;
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!openRow) return;
      if (!openRow.contains(e.target)) closeOpenSwipe();
    },
    true
  );
}

/**
 * Swipe-to-Delete an eine Zeile hängen.
 * @param {HTMLElement} el       Das .swipe-Element.
 * @param {Function}    onDelete Wird beim Tippen auf „Löschen" aufgerufen.
 */
export function attachSwipe(el, onDelete) {
  const content = el.querySelector('.swipe__content');
  const delBtn = el.querySelector('.swipe__delete-btn');

  let startX = 0;
  let startY = 0;
  let base = 0; // Ausgangs-Offset (0 oder -OPEN_WIDTH)
  let dragging = false;
  let axisLocked = false;
  let horizontal = false;

  const setX = (x) => {
    content.style.transform = `translateX(${x}px)`;
  };

  content.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    base = el.classList.contains('is-open') ? -OPEN_WIDTH : 0;
    dragging = true;
    axisLocked = false;
    horizontal = false;
    content.style.transition = 'none';
  });

  content.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!axisLocked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axisLocked = true;
      horizontal = Math.abs(dx) > Math.abs(dy);
      if (horizontal) {
        content.setPointerCapture(e.pointerId);
      } else {
        // Vertikale Geste → dem normalen Scrollen überlassen.
        dragging = false;
        return;
      }
    }

    let x = base + dx;
    if (x > 0) x = 0; // nicht über die Ruhelage nach rechts
    if (x < -OPEN_WIDTH) x = -OPEN_WIDTH + (x + OPEN_WIDTH) * 0.2; // sanfter Widerstand
    setX(x);
  });

  const finish = (e) => {
    if (!dragging) return;
    dragging = false;
    if (!horizontal) return;
    const x = base + (e.clientX - startX);
    if (x < -THRESHOLD) openRowEl(el);
    else closeRow(el);
  };

  content.addEventListener('pointerup', finish);
  content.addEventListener('pointercancel', () => {
    if (!dragging) return;
    dragging = false;
    if (horizontal) {
      if (el.classList.contains('is-open')) openRowEl(el);
      else closeRow(el);
    }
  });

  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onDelete();
  });
}
