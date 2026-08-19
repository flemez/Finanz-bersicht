// Budget-Ansicht: Geld pro Monat auf Kategorien verteilen (Umschlag-Prinzip).

import { computeBudget, setBudgeted, moveBudget, addCategory, deleteCategory, currentMonth } from '../store.js';
import {
  formatCents,
  formatMonth,
  shiftMonth,
  parseAmountToCents,
  esc,
} from '../format.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';

let activeMonth = currentMonth();

export async function renderBudget(ctx) {
  const data = await computeBudget(activeMonth);

  ctx.setHeader({
    title: 'Aufteilung',
    sub: `
      <div class="monthnav">
        <button class="icon-btn" data-month="prev" aria-label="Vorheriger Monat">‹</button>
        <span class="monthnav__label">${esc(formatMonth(activeMonth))}</span>
        <button class="icon-btn" data-month="next" aria-label="Nächster Monat">›</button>
      </div>`,
    action: { label: '+', aria: 'Kategorie hinzufügen', onClick: () => openCategoryModal(ctx) },
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
        <div class="budget-row">
          <button class="budget-row__tap" data-cat="${r.category.id}" data-budgeted="${r.budgeted}">
            <span class="budget-row__info">
              <span class="budget-row__name">${esc(r.category.name)}</span>
              <span class="budget-row__meta">Budget ${formatCents(r.budgeted)} · Ausgegeben ${formatCents(r.activity)}</span>
            </span>
            <span class="budget-row__available badge ${availClass}">${formatCents(r.available)}</span>
          </button>
          <button class="icon-btn budget-row__del" data-del="${r.category.id}" aria-label="Kategorie löschen">${icon.trash}</button>
        </div>`;
    }
    html += '</div>';
    html += `<p class="budget-hint">Tippe eine Kategorie an, um ihr Budget für den Monat zu setzen. Der Papierkorb rechts löscht die Kategorie. Neue Kategorien legst du oben rechts über „+“ an.</p>`;
  }

  ctx.view.innerHTML = html;

  ctx.view.parentElement.querySelector('[data-month="prev"]')?.addEventListener('click', () => {
    activeMonth = shiftMonth(activeMonth, -1);
    renderBudget(ctx);
  });
  ctx.view.parentElement.querySelector('[data-month="next"]')?.addEventListener('click', () => {
    activeMonth = shiftMonth(activeMonth, 1);
    renderBudget(ctx);
  });

  ctx.view.querySelectorAll('.budget-row__tap').forEach((el) => {
    el.addEventListener('click', () => {
      const catId = el.dataset.cat;
      const name = el.querySelector('.budget-row__name').textContent;
      const current = Number(el.dataset.budgeted) / 100;
      openBudgetModal(ctx, catId, name, current, data.rows);
    });
  });

  ctx.view.querySelectorAll('.budget-row__del').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog(
        'Kategorie löschen?',
        'Die Kategorie und ihre Unterkategorien werden entfernt. Erfasste Buchungen bleiben erhalten, verlieren aber ihre Kategorie.'
      );
      if (!ok) return;
      await deleteCategory(btn.dataset.del);
      toast('Kategorie gelöscht');
      renderBudget(ctx);
    });
  });
}

function openBudgetModal(ctx, catId, name, currentValue, rows = []) {
  const row = rows.find((r) => r.category.id === catId);
  const available = row ? row.available : 0;
  const canMove = rows.length > 1;

  const m = openModal(
    esc(name),
    `<label class="field">
       <span class="field__label">Budget für diesen Monat</span>
       <input class="field__input field__input--amount" name="amount" inputmode="decimal"
              value="${currentValue ? currentValue.toString().replace('.', ',') : ''}"
              placeholder="0,00" />
     </label>
     <p class="modal__text">Verfügbar in dieser Kategorie: <strong>${formatCents(available)}</strong></p>
     ${canMove ? `<button type="button" class="btn btn--block btn--ghost" data-action="move">Guthaben verschieben …</button>` : ''}`,
    [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: 'Speichern', value: 'ok', variant: 'primary' },
    ]
  );

  if (canMove) {
    m.el.querySelector('[data-action="move"]').addEventListener('click', () => {
      m.close();
      openMoveModal(ctx, catId, rows);
    });
  }

  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    const cents = parseAmountToCents(data.amount) ?? 0;
    await setBudgeted(activeMonth, catId, cents);
    close();
    toast('Budget gespeichert');
    renderBudget(ctx);
  });
}

/** Verfügbares Guthaben von einer Kategorie auf eine andere verschieben. */
function openMoveModal(ctx, fromId, rows) {
  const fromRow = rows.find((r) => r.category.id === fromId);
  const fromName = fromRow ? fromRow.category.name : '';
  const available = fromRow ? fromRow.available : 0;

  const targetOptions = rows
    .filter((r) => r.category.id !== fromId)
    .map((r) => `<option value="${r.category.id}">${esc(r.category.name)} (${formatCents(r.available)})</option>`)
    .join('');

  const m = openModal(
    'Guthaben verschieben',
    `<p class="modal__text">Von <strong>${esc(fromName)}</strong> – verfügbar: <strong>${formatCents(available)}</strong></p>
     <label class="field">
       <span class="field__label">Betrag</span>
       <input class="field__input field__input--amount" name="amount" inputmode="decimal" placeholder="0,00" autofocus />
     </label>
     <label class="field">
       <span class="field__label">Auf Kategorie</span>
       <select class="field__input field__input--big" name="toId">${targetOptions}</select>
     </label>`,
    [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: 'Verschieben', value: 'ok', variant: 'primary' },
    ]
  );

  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    const cents = parseAmountToCents(data.amount);
    if (cents == null || cents <= 0) return toast('Bitte einen gültigen Betrag eingeben');
    if (!data.toId) return toast('Bitte eine Zielkategorie wählen');
    await moveBudget(activeMonth, fromId, data.toId, cents);
    close();
    const toRow = rows.find((r) => r.category.id === data.toId);
    toast(`${formatCents(cents)} → ${toRow ? toRow.category.name : 'Kategorie'}`);
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
