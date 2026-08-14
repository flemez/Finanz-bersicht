// Budget-Ansicht: Umschlag-Budgetierung für einen Monat.

import {
  computeBudget,
  setBudgeted,
  addCategory,
  currentMonth,
} from '../store.js';
import {
  formatCents,
  formatMonth,
  shiftMonth,
  parseAmountToCents,
  esc,
} from '../format.js';
import { openModal, toast } from '../ui.js';
import { icon } from '../icons.js';

let activeMonth = currentMonth();

export async function renderBudget(ctx) {
  const data = await computeBudget(activeMonth);

  ctx.setHeader({
    title: 'Budget',
    back: () => ctx.navigate('more'),
    sub: `
      <div class="monthnav">
        <button class="icon-btn" data-month="prev" aria-label="Vorheriger Monat">‹</button>
        <span class="monthnav__label">${esc(formatMonth(activeMonth))}</span>
        <button class="icon-btn" data-month="next" aria-label="Nächster Monat">›</button>
      </div>`,
    action: {
      label: 'Kategorien',
      aria: 'Kategorien verwalten',
      onClick: () => ctx.navigate('categories'),
    },
  });

  // Kategorien nach Gruppe bündeln.
  const groups = new Map();
  for (const row of data.rows) {
    const g = row.category.group || 'Allgemein';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(row);
  }

  const toAssignClass =
    data.toAssign > 0 ? 'is-positive' : data.toAssign < 0 ? 'is-negative' : 'is-zero';

  let html = `
    <section class="assign-card ${toAssignClass}">
      <div class="assign-card__label">Verfügbar zum Zuweisen</div>
      <div class="assign-card__value">${formatCents(data.toAssign)}</div>
    </section>`;

  if (data.rows.length === 0) {
    html += emptyState();
  } else {
    html += '<div class="budget-list">';
    for (const [group, rows] of groups) {
      const groupBudgeted = rows.reduce((s, r) => s + r.budgeted, 0);
      html += `
        <div class="budget-group">
          <div class="budget-group__head">
            <span class="budget-group__name">${esc(group)}</span>
            <span class="budget-group__sum">${formatCents(groupBudgeted)}</span>
          </div>`;
      for (const r of rows) {
        const availClass =
          r.available > 0 ? 'is-positive' : r.available < 0 ? 'is-negative' : 'is-zero';
        html += `
          <button class="budget-row" data-cat="${r.category.id}"
                  data-budgeted="${r.budgeted}">
            <span class="budget-row__info">
              <span class="budget-row__name">${esc(r.category.name)}</span>
              <span class="budget-row__meta">Budget ${formatCents(r.budgeted)} · Ausgegeben ${formatCents(r.activity)}</span>
            </span>
            <span class="budget-row__available badge ${availClass}">${formatCents(r.available)}</span>
          </button>`;
      }
      html += '</div>';
    }
    html += '</div>';

    html += `<p class="budget-hint">Tippe eine Kategorie an, um ihr Budget zu setzen. Rechts siehst du das verfügbare Guthaben.</p>`;
  }

  html += `<button class="btn btn--block btn--ghost" id="add-category">+ Kategorie hinzufügen</button>`;

  ctx.view.innerHTML = html;

  // Monatswechsel.
  ctx.view.parentElement.querySelector('[data-month="prev"]')?.addEventListener('click', () => {
    activeMonth = shiftMonth(activeMonth, -1);
    renderBudget(ctx);
  });
  ctx.view.parentElement.querySelector('[data-month="next"]')?.addEventListener('click', () => {
    activeMonth = shiftMonth(activeMonth, 1);
    renderBudget(ctx);
  });

  // Neue Kategorie anlegen.
  ctx.view.querySelector('#add-category')?.addEventListener('click', () => openCategoryModal(ctx));

  // Kategorie antippen -> Budget setzen.
  ctx.view.querySelectorAll('.budget-row').forEach((el) => {
    el.addEventListener('click', () => {
      const catId = el.dataset.cat;
      const name = el.querySelector('.budget-row__name').textContent;
      const current = Number(el.dataset.budgeted) / 100;
      openBudgetModal(ctx, catId, name, current);
    });
  });
}

function emptyState() {
  return `
    <div class="empty">
      <div class="empty__icon">${icon.budget}</div>
      <p class="empty__title">Noch keine Kategorien</p>
      <p class="empty__text">Lege Umschläge an, um dein Geld zu verteilen.</p>
    </div>`;
}

function openBudgetModal(ctx, catId, name, currentValue) {
  const m = openModal(
    esc(name),
    `<label class="field">
       <span class="field__label">Budget für diesen Monat</span>
       <input class="field__input" name="amount" inputmode="decimal"
              value="${currentValue ? currentValue.toString().replace('.', ',') : ''}"
              placeholder="0,00" />
     </label>`,
    [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: 'Speichern', value: 'ok', variant: 'primary' },
    ]
  );
  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    const cents = parseAmountToCents(data.amount) ?? 0;
    await setBudgeted(activeMonth, catId, cents);
    close();
    toast('Budget gespeichert');
    renderBudget(ctx);
  });
}

function openCategoryModal(ctx) {
  const m = openModal(
    'Neue Kategorie',
    `<label class="field">
       <span class="field__label">Name</span>
       <input class="field__input" name="name" placeholder="z. B. Lebensmittel" required />
     </label>
     <label class="field">
       <span class="field__label">Gruppe</span>
       <input class="field__input" name="group" placeholder="z. B. Alltag" value="Allgemein" />
     </label>`,
    [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: 'Anlegen', value: 'ok', variant: 'primary' },
    ]
  );
  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    if (!data.name || !data.name.trim()) return toast('Bitte einen Namen eingeben');
    await addCategory({ name: data.name, group: data.group });
    close();
    toast('Kategorie angelegt');
    renderBudget(ctx);
  });
}
