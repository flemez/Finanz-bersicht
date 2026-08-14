// Einstiegspunkt der App: Service-Worker, Ersteinrichtung, Routing, Navigation.

import { register, setNotFound, startRouter, currentRoute, navigate } from './router.js';
import { seedIfEmpty } from './store.js';
import { renderBudget } from './views/budget.js';
import { renderAccounts } from './views/accounts.js';
import { renderTransactions, openTransactionModal } from './views/transactions.js';
import { renderMore } from './views/more.js';

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
    const handler = handlers[name] || handlers.budget;
    handler();
  },
  navigate,
  openTransactionModal: (opts) => openTransactionModal(ctx, opts),
};

const handlers = {
  budget: () => renderBudget(ctx),
  accounts: () => renderAccounts(ctx),
  transactions: () => renderTransactions(ctx),
  more: () => renderMore(ctx),
};

for (const [name, handler] of Object.entries(handlers)) {
  register(name, handler);
}
setNotFound(handlers.budget);

// Aktiven Tab in der unteren Leiste markieren.
function updateTabbar() {
  const { name } = currentRoute();
  document.querySelectorAll('.tabbar__item').forEach((item) => {
    item.classList.toggle('tabbar__item--active', item.dataset.route === name);
  });
}
window.addEventListener('hashchange', updateTabbar);

// Schwebender Knopf: neue Buchung.
document.getElementById('fab-add').addEventListener('click', () => {
  openTransactionModal(ctx, {});
});

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

  if (!location.hash) navigate('budget');
  startRouter();
  updateTabbar();
}

boot();
