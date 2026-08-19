// Einstiegspunkt der App: Service-Worker, Ersteinrichtung, Routing, Navigation.

import { register, setNotFound, startRouter, currentRoute, navigate } from './router.js';
import { seedIfEmpty, postDueRecurring, migrateModel, normalizeRecurringUncategorized } from './store.js';
import { renderBudget } from './views/budget.js';
import { renderAccounts } from './views/accounts.js';
import { renderBuchungen, openTransactionModal } from './views/buchungen.js';
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
    const handler = handlers[name] || handlers.budget;
    handler();
  },
  navigate,
};

const handlers = {
  budget: () => renderBudget(ctx),        // Reiter "Aufteilung"
  recurring: () => renderRecurring(ctx),  // Reiter "Fixkosten"
  more: () => renderMore(ctx),
  // Unteransichten (über "Mehr" bzw. das schwebende "+")
  accounts: () => renderAccounts(ctx),
  transactions: () => renderBuchungen(ctx),
  categories: () => renderCategories(ctx),
};

for (const [name, handler] of Object.entries(handlers)) {
  register(name, handler);
}
setNotFound(handlers.budget);

// Aktiven Reiter in der unteren Leiste markieren (auch Unteransichten
// ihrem zugehörigen Reiter zuordnen).
const TAB_OF = { budget: 'budget', recurring: 'recurring', more: 'more', accounts: 'more', transactions: 'more', categories: 'budget' };
function updateTabbar() {
  const { name } = currentRoute();
  const active = TAB_OF[name] || name;
  document.querySelectorAll('.tabbar__item').forEach((item) => {
    item.classList.toggle('tabbar__item--active', item.dataset.route === active);
  });
}
window.addEventListener('hashchange', updateTabbar);

// Schwebendes "+" – schnelles Hinzufügen einer Buchung.
document.getElementById('fab-add').addEventListener('click', () => openTransactionModal(ctx));

async function boot() {
  // Service-Worker registrieren (offline-Fähigkeit) und Updates zuverlässig
  // ausliefern: sobald ein neuer Worker die Kontrolle übernimmt, wird die Seite
  // einmal automatisch neu geladen, damit der neue Code auch am Handy greift.
  if ('serviceWorker' in navigator) {
    try {
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
      const reg = await navigator.serviceWorker.register('./sw.js');
      reg.update();
      // Regelmäßig auf einen neuen Stand prüfen (z. B. beim App-Start).
      setInterval(() => reg.update(), 60 * 60 * 1000);
    } catch (e) {
      console.warn('Service-Worker konnte nicht registriert werden:', e);
    }
  }

  // Vorhandene Daten aus altem Modell (falls nötig) migrieren.
  try {
    await migrateModel();
  } catch (e) {
    console.warn('Migration fehlgeschlagen:', e);
  }

  await seedIfEmpty();

  // Fixkosten/Einnahmen sind kategorielos – vorhandene Daten angleichen.
  try {
    await normalizeRecurringUncategorized();
  } catch (e) {
    console.warn('Angleichen der Fixkosten fehlgeschlagen:', e);
  }

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

  if (!location.hash) navigate('budget');
  startRouter();
  updateTabbar();
}

boot();
