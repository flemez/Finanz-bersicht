// Einstiegspunkt der App: Service-Worker, Ersteinrichtung, Routing, Navigation.

import { register, setNotFound, startRouter, currentRoute, navigate } from './router.js';
import { seedIfEmpty, postDueRecurring } from './store.js';
import { renderBudget } from './views/budget.js';
import { renderAccounts } from './views/accounts.js';
import { renderErfassen } from './views/erfassen.js';
import { renderRecurring } from './views/recurring.js';
import { renderCategories } from './views/categories.js';
import { renderMore } from './views/more.js';
import { toast } from './ui.js';

const viewEl = document.getElementById('view');
const headerTitle = document.getElementById('header-title');
const headerSub = document.getElementById('header-sub');
const headerAction = document.getElementById('header-action');
const headerBack = document.getElementById('header-back');

/** Rahmen: Kopfzeile setzen und Inhalt in #view zeichnen. */
const ctx = {
  view: viewEl,
  setHeader({ title, sub = '', action = null, back = null }) {
    headerTitle.textContent = title;
    headerSub.innerHTML = sub || '';
    headerSub.hidden = !sub;

    if (action) {
      headerAction.hidden = false;
      headerAction.textContent = action.label;
      headerAction.setAttribute('aria-label', action.aria || action.label);
      headerAction.onclick = action.onClick;
    } else {
      headerAction.hidden = true;
      headerAction.onclick = null;
    }

    if (back) {
      headerBack.hidden = false;
      headerBack.onclick = back;
    } else {
      headerBack.hidden = true;
      headerBack.onclick = null;
    }
  },
  refresh() {
    const { name } = currentRoute();
    const handler = handlers[name] || handlers.erfassen;
    handler();
  },
  navigate,
};

const handlers = {
  erfassen: () => renderErfassen(ctx),
  categories: () => renderCategories(ctx),
  accounts: () => renderAccounts(ctx),
  recurring: () => renderRecurring(ctx),
  budget: () => renderBudget(ctx),
  more: () => renderMore(ctx),
};

for (const [name, handler] of Object.entries(handlers)) {
  register(name, handler);
}
setNotFound(handlers.erfassen);

// Aktiven Tab in der unteren Leiste markieren.
function updateTabbar() {
  const { name } = currentRoute();
  document.querySelectorAll('.tabbar__item').forEach((item) => {
    item.classList.toggle('tabbar__item--active', item.dataset.route === name);
  });
}
window.addEventListener('hashchange', updateTabbar);

async function boot() {
  // Service-Worker registrieren (offline-Fähigkeit).
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (e) {
      console.warn('Service-Worker konnte nicht registriert werden:', e);
    }
  }

  await seedIfEmpty();

  // Fällige Fixkosten automatisch nachbuchen.
  try {
    const created = await postDueRecurring();
    if (created > 0) {
      const label = created === 1 ? '1 Fixkosten-Buchung' : `${created} Fixkosten-Buchungen`;
      setTimeout(() => toast(`${label} automatisch eingetragen`), 400);
    }
  } catch (e) {
    console.warn('Fixkosten-Buchung fehlgeschlagen:', e);
  }

  if (!location.hash) navigate('erfassen');
  startRouter();
  updateTabbar();
}

boot();
