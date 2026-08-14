// Kleine UI-Bausteine: Toast-Meldungen und modale Dialoge.

/** Kurze Einblend-Meldung am unteren Rand. */
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('toast--show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('toast--show'), 2200);
}

/**
 * Modalen Dialog öffnen.
 * @param {string} title  Überschrift
 * @param {string} bodyHTML  Inhalt als HTML-String
 * @param {Array<{label:string, value:string, variant?:string}>} buttons
 * @returns {{ el: HTMLElement, close: Function, onSubmit: Function }}
 */
export function openModal(title, bodyHTML, buttons = []) {
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const btnHTML = buttons
    .map(
      (b) =>
        `<button type="submit" class="btn ${b.variant ? 'btn--' + b.variant : ''}" value="${b.value}">${b.label}</button>`
    )
    .join('');

  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
      <form class="modal__form" method="dialog">
        <div class="modal__header">
          <h2 class="modal__title">${title}</h2>
          <button type="button" class="icon-btn modal__close" aria-label="Schließen">×</button>
        </div>
        <div class="modal__body">${bodyHTML}</div>
        <div class="modal__footer">${btnHTML}</div>
      </form>
    </div>`;

  root.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const form = overlay.querySelector('form');
  const close = () => {
    overlay.classList.add('modal-overlay--closing');
    setTimeout(() => {
      overlay.remove();
      if (!document.querySelector('.modal-overlay')) {
        document.body.classList.remove('no-scroll');
      }
    }, 150);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.modal__close').addEventListener('click', close);

  // Ersten Eingabewert fokussieren.
  requestAnimationFrame(() => {
    const first = overlay.querySelector('input, select, textarea');
    if (first) first.focus();
  });

  let submitHandler = null;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = (e.submitter && e.submitter.value) || 'ok';
    const data = Object.fromEntries(new FormData(form).entries());
    if (submitHandler) submitHandler(value, data, close);
  });

  return {
    el: overlay,
    close,
    onSubmit(fn) {
      submitHandler = fn;
    },
  };
}

/** Einfacher Bestätigungsdialog. */
export function confirmDialog(title, message) {
  return new Promise((resolve) => {
    const m = openModal(title, `<p class="modal__text">${message}</p>`, [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: 'Löschen', value: 'ok', variant: 'danger' },
    ]);
    m.onSubmit((value, _data, close) => {
      close();
      resolve(value === 'ok');
    });
  });
}
