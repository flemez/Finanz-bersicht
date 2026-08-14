// Buchungen-Ansicht: Liste aller Buchungen + Dialog zum Erfassen.

import {
  listTransactions,
  listAccounts,
  listCategories,
  addTransaction,
  deleteTransaction,
} from '../store.js';
import {
  formatCents,
  formatDate,
  todayISO,
  esc,
  parseAmountToCents,
} from '../format.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';

export async function renderTransactions(ctx) {
  const [transactions, accounts, categories] = await Promise.all([
    listTransactions(),
    listAccounts(),
    listCategories(),
  ]);

  const accById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));

  ctx.setHeader({
    title: 'Buchungen',
    action: {
      label: '+ Neu',
      aria: 'Buchung hinzufügen',
      onClick: () => openTransactionModal(ctx, {}),
    },
  });

  if (transactions.length === 0) {
    ctx.view.innerHTML = `
      <div class="empty">
        <div class="empty__icon">${icon.transactions}</div>
        <p class="empty__title">Noch keine Buchungen</p>
        <p class="empty__text">Tippe auf „+“, um deine erste Buchung zu erfassen.</p>
      </div>`;
    return;
  }

  // Nach Datum gruppieren.
  const groups = new Map();
  for (const t of transactions) {
    const key = t.date || '—';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  let html = '<div class="list">';
  for (const [date, rows] of groups) {
    html += `<div class="list-daydivider">${esc(formatDate(date))}</div>`;
    for (const t of rows) {
      const acc = accById[t.accountId];
      const cat = t.categoryId ? catById[t.categoryId] : null;
      const amountClass = t.amount < 0 ? 'is-negative' : 'is-positive';
      const title = t.payee || (t.amount >= 0 ? 'Einnahme' : 'Ausgabe');
      const sub = [cat ? cat.name : (t.amount >= 0 ? 'Einnahme' : 'Ohne Kategorie'), acc ? acc.name : '']
        .filter(Boolean)
        .join(' · ');
      html += `
        <div class="list-row" data-tx="${t.id}">
          <div class="list-row__main">
            <span class="list-row__title">${esc(title)}</span>
            <span class="list-row__sub">${esc(sub)}</span>
          </div>
          <div class="list-row__value ${amountClass}">${formatCents(t.amount)}</div>
          <button class="icon-btn list-row__del" data-del="${t.id}" aria-label="Buchung löschen">${icon.trash}</button>
        </div>`;
    }
  }
  html += '</div>';

  ctx.view.innerHTML = html;

  ctx.view.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog('Buchung löschen?', 'Diese Buchung wird entfernt.');
      if (!ok) return;
      await deleteTransaction(btn.dataset.del);
      toast('Buchung gelöscht');
      renderTransactions(ctx);
    });
  });
}

/**
 * Dialog zum Erfassen einer Buchung.
 * Wird von der Ansicht und vom schwebenden "+"-Knopf genutzt.
 */
export async function openTransactionModal(ctx, opts = {}) {
  const [accounts, categories] = await Promise.all([
    listAccounts(),
    listCategories(),
  ]);

  if (accounts.length === 0) {
    toast('Bitte zuerst ein Konto anlegen');
    ctx.navigate('accounts');
    return;
  }

  const accOptions = accounts
    .map((a) => `<option value="${a.id}">${esc(a.name)}</option>`)
    .join('');

  const catGroups = new Map();
  for (const c of categories) {
    const g = c.group || 'Allgemein';
    if (!catGroups.has(g)) catGroups.set(g, []);
    catGroups.get(g).push(c);
  }
  let catOptions = '<option value="">– Noch nicht zuordnen –</option>';
  for (const [g, cs] of catGroups) {
    catOptions += `<optgroup label="${esc(g)}">`;
    catOptions += cs.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    catOptions += '</optgroup>';
  }

  const m = openModal(
    'Schnell erfassen',
    `<div class="segmented" role="tablist">
       <button type="button" class="segmented__btn segmented__btn--active" data-kind="expense">Ausgabe</button>
       <button type="button" class="segmented__btn" data-kind="income">Einnahme</button>
     </div>
     <input type="hidden" name="kind" value="expense" />
     <label class="field">
       <span class="field__label">Betrag</span>
       <input class="field__input field__input--amount" name="amount" inputmode="decimal"
              placeholder="0,00" required autofocus />
     </label>
     <label class="field field--category">
       <span class="field__label">Wohin einsortieren? (Kategorie)</span>
       <select class="field__input field__input--big" name="categoryId">${catOptions}</select>
     </label>
     <details class="more-details">
       <summary>Mehr Details (Konto, Empfänger, Datum, Notiz)</summary>
       <label class="field">
         <span class="field__label">Konto</span>
         <select class="field__input" name="accountId">${accOptions}</select>
       </label>
       <label class="field">
         <span class="field__label">Empfänger / Zweck</span>
         <input class="field__input" name="payee" placeholder="z. B. Supermarkt" />
       </label>
       <label class="field">
         <span class="field__label">Datum</span>
         <input class="field__input" type="date" name="date" value="${todayISO()}" />
       </label>
       <label class="field">
         <span class="field__label">Notiz</span>
         <input class="field__input" name="note" placeholder="optional" />
       </label>
     </details>`,
    [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: 'Speichern', value: 'ok', variant: 'primary' },
    ]
  );

  // Umschalter Ausgabe/Einnahme.
  const kindInput = m.el.querySelector('input[name="kind"]');
  const catField = m.el.querySelector('.field--category');
  m.el.querySelectorAll('.segmented__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      m.el.querySelectorAll('.segmented__btn').forEach((b) =>
        b.classList.remove('segmented__btn--active')
      );
      btn.classList.add('segmented__btn--active');
      kindInput.value = btn.dataset.kind;
      // Bei Einnahmen ist die Kategorie optional/ausgeblendet (geht in "zum Zuweisen").
      catField.style.display = btn.dataset.kind === 'income' ? 'none' : '';
    });
  });

  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    const cents = parseAmountToCents(data.amount);
    if (cents == null || cents === 0) return toast('Bitte einen gültigen Betrag eingeben');

    const signed = data.kind === 'income' ? Math.abs(cents) : -Math.abs(cents);
    await addTransaction({
      accountId: data.accountId,
      date: data.date || todayISO(),
      payee: data.payee || '',
      categoryId: data.kind === 'income' ? null : data.categoryId || null,
      amount: signed,
      note: data.note || '',
    });
    close();
    toast('Buchung gespeichert');
    ctx.refresh();
  });
}
