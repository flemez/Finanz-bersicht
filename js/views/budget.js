// Budget-Ansicht: Geld pro Monat auf Kategorien verteilen (Umschlag-Prinzip).

import { computeBudget, setBudgeted, addCategory, currentMonth } from '../store.js';
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
    sub: `
      <div class="monthnav">
        <button class="icon-btn" data-month="prev" aria-label="Vorheriger Monat">‹</button>
        <span class="monthnav__label">${esc(formatMonth(activeMonth))}</span>
        <button class="icon-btn" data-month="next" aria-label="Nächster Monat">›</button>
      </div>`,
  });

  const toAssignClass =
    data.toAssign > 0 ? 'is-positive' : data.toAssign < 0 ? 'is-negative' : 'is-zero';

  let html = `
    <section class="assign-card ${toAssignClass}">
      <div class="assign-card__label">Verfügbar zum Zuweisen</div>
      <div class="assign-card__value">${formatCents(data.toAssign)}</div>
    </section>`;

  if (data.rows.length === 0) {
    html += `
      <div class="empty">
        <div class="empty__icon">${icon.budget}</div>
        <p class="empty__title">Noch keine Kategorien</p>
        <p class="empty__text">Lege Kategorien an, um dein Geld zu verteilen.</p>
      </div>`;
  } else {
    html += '<div class="list">';
    for (const r of data.rows) {
      const availClass =
        r.available > 0 ? 'is-positive' : r.available < 0 ? 'is-negative' : 'is-zero';
      html += `
        <button class="budget-row" data-cat="${r.category.id}" data-budgeted="${r.budgeted}">
          <span class="budget-row__info">
            <span class="budget-row__name">${esc(r.category.name)}</span>
            <span class="budget-row__meta">Budget ${formatCents(r.budgeted)} · Ausgegeben ${formatCents(r.activity)}</span>
          </span>
          <span class="budget-row__available badge ${availClass}">${formatCents(r.available)}</span>
        </button>`;
    }
    html += '</div>';
    html += `<p class="budget-hint">Tippe eine Kategorie an, um ihr Budget für den Monat zu setzen. Rechts steht das verfügbare Guthaben.</p>`;
  }

  html += `<button class="btn btn--block btn--primary" id="add-category">+ Kategorie hinzufügen</button>`;

  ctx.view.innerHTML = html;

  ctx.view.parentElement.querySelector('[data-month="prev"]')?.addEventListener('click', () => {
    activeMonth = shiftMonth(activeMonth, -1);
    renderBudget(ctx);
  });
  ctx.view.parentElement.querySelector('[data-month="next"]')?.addEventListener('click', () => {
    activeMonth = shiftMonth(activeMonth, 1);
    renderBudget(ctx);
  });

  ctx.view.querySelector('#add-category')?.addEventListener('click', () => openCategoryModal(ctx));

  ctx.view.querySelectorAll('.budget-row').forEach((el) => {
    el.addEventListener('click', () => {
      const catId = el.dataset.cat;
      const name = el.querySelector('.budget-row__name').textContent;
      const current = Number(el.dataset.budgeted) / 100;
      openBudgetModal(ctx, catId, name, current);
    });
  });
}

function openBudgetModal(ctx, catId, name, currentValue) {
  const m = openModal(
    esc(name),
    `<label class="field">
       <span class="field__label">Budget für diesen Monat</span>
       <input class="field__input field__input--amount" name="amount" inputmode="decimal"
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
       <span class="field__label">Name der Kategorie</span>
       <input class="field__input" name="name" placeholder="z. B. Lebensmittel" required />
     </label>`,
    [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: 'Anlegen', value: 'ok', variant: 'primary' },
    ]
  );
  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    if (!data.name || !data.name.trim()) return toast('Bitte einen Namen eingeben');
    await addCategory({ name: data.name });
    close();
    toast('Kategorie angelegt');
    renderBudget(ctx);
  });
}
