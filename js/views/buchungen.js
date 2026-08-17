// Buchungen: Liste erfasster Buchungen ansehen/bearbeiten sowie der
// Schnell-Dialog zum Hinzufügen (per schwebendem "+").

import {
  listTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  listAccounts,
  listCategories,
} from '../store.js';
import {
  formatCents,
  formatDate,
  todayISO,
  esc,
  parseAmountToCents,
} from '../format.js';
import { toast, confirmDialog, openModal } from '../ui.js';
import { icon } from '../icons.js';

const NONE = '<option value="">– keine –</option>';

function categoryOptions(cats, selId) {
  return NONE + cats
    .map((c) => `<option value="${c.id}"${c.id === selId ? ' selected' : ''}>${esc(c.name)}</option>`)
    .join('');
}

export async function renderBuchungen(ctx) {
  const [transactions, accounts, cats] = await Promise.all([
    listTransactions(),
    listAccounts(),
    listCategories(),
  ]);

  ctx.setHeader({
    title: 'Buchungen',
    back: () => ctx.navigate('more'),
    action: { label: '+', aria: 'Buchung hinzufügen', onClick: () => openTransactionModal(ctx) },
  });

  if (transactions.length === 0) {
    ctx.view.innerHTML = `
      <div class="empty">
        <div class="empty__icon">${icon.transactions}</div>
        <p class="empty__title">Noch keine Buchungen</p>
        <p class="empty__text">Tippe unten auf „+“, um eine Einnahme oder Ausgabe zu erfassen.</p>
      </div>`;
    return;
  }

  const accById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const catById = Object.fromEntries(cats.map((c) => [c.id, c]));

  const byDate = new Map();
  for (const t of transactions) {
    const k = t.date || '—';
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k).push(t);
  }

  let html = '<div class="list">';
  for (const [date, rows] of byDate) {
    html += `<div class="list-daydivider">${esc(formatDate(date))}</div>`;
    for (const t of rows) {
      const acc = accById[t.accountId];
      const cat = t.categoryId ? catById[t.categoryId] : null;
      const amountClass = t.amount < 0 ? 'is-negative' : 'is-positive';
      const title = t.payee || (t.amount >= 0 ? 'Einnahme' : 'Ausgabe');
      const sub = [cat ? cat.name : (t.amount >= 0 ? 'Einnahme' : 'Ohne Kategorie'), acc ? acc.name : '']
        .filter(Boolean).join(' · ');
      html += `
        <div class="list-row" data-edit="${t.id}">
          <div class="list-row__main">
            <span class="list-row__title">${esc(title)}</span>
            <span class="list-row__sub">${esc(sub)}</span>
          </div>
          <div class="list-row__value ${amountClass}">${formatCents(t.amount)}</div>
        </div>`;
    }
  }
  html += '</div>';
  ctx.view.innerHTML = html;

  ctx.view.querySelectorAll('[data-edit]').forEach((row) => {
    row.addEventListener('click', () => {
      const t = transactions.find((x) => x.id === row.dataset.edit);
      if (t) openTransactionModal(ctx, t);
    });
  });
}

/** Dialog zum Hinzufügen (existing = null) oder Bearbeiten einer Buchung. */
export async function openTransactionModal(ctx, existing = null) {
  const [accounts, cats] = await Promise.all([listAccounts(), listCategories()]);
  if (accounts.length === 0) {
    toast('Bitte zuerst ein Konto anlegen');
    ctx.navigate('accounts');
    return;
  }
  const isEdit = !!existing;
  const t = existing || {};
  const kind = isEdit ? (t.amount >= 0 ? 'income' : 'expense') : 'expense';
  const accOptions = accounts
    .map((a) => `<option value="${a.id}"${a.id === t.accountId ? ' selected' : ''}>${esc(a.name)}</option>`)
    .join('');
  const amountValue = isEdit ? (Math.abs(t.amount) / 100).toString().replace('.', ',') : '';

  const m = openModal(
    isEdit ? 'Buchung bearbeiten' : 'Neue Buchung',
    `<div class="segmented" role="tablist">
       <button type="button" class="segmented__btn ${kind === 'expense' ? 'segmented__btn--active' : ''}" data-kind="expense">Ausgabe</button>
       <button type="button" class="segmented__btn ${kind === 'income' ? 'segmented__btn--active' : ''}" data-kind="income">Einnahme</button>
     </div>
     <input type="hidden" name="kind" value="${kind}" />
     <label class="field">
       <span class="field__label">Betrag</span>
       <input class="field__input field__input--amount" name="amount" inputmode="decimal" value="${amountValue}" placeholder="0,00" required autofocus />
     </label>
     <div class="cat-fields" ${kind === 'income' ? 'style="display:none"' : ''}>
       <label class="field">
         <span class="field__label">Kategorie</span>
         <select class="field__input field__input--big" name="categoryId">${categoryOptions(cats, t.categoryId)}</select>
       </label>
     </div>
     <div class="entry-row">
       <label class="field">
         <span class="field__label">Datum</span>
         <input class="field__input" type="date" name="date" value="${t.date || todayISO()}" />
       </label>
       <label class="field">
         <span class="field__label">Konto</span>
         <select class="field__input" name="accountId">${accOptions}</select>
       </label>
     </div>
     <label class="field">
       <span class="field__label">Notiz / Empfänger (optional)</span>
       <input class="field__input" name="payee" value="${esc(t.payee || '')}" placeholder="z. B. Supermarkt" />
     </label>
     ${isEdit ? `<button type="button" class="btn btn--block btn--danger" data-action="delete">Buchung löschen</button>` : ''}`,
    [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: 'Speichern', value: 'ok', variant: 'primary' },
    ]
  );

  const kindInput = m.el.querySelector('input[name="kind"]');
  const catFields = m.el.querySelector('.cat-fields');
  m.el.querySelectorAll('.segmented__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      m.el.querySelectorAll('.segmented__btn').forEach((b) => b.classList.remove('segmented__btn--active'));
      btn.classList.add('segmented__btn--active');
      kindInput.value = btn.dataset.kind;
      catFields.style.display = btn.dataset.kind === 'income' ? 'none' : '';
    });
  });

  if (isEdit) {
    m.el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      const ok = await confirmDialog('Buchung löschen?', 'Diese Buchung wird entfernt.');
      if (!ok) return;
      await deleteTransaction(t.id);
      m.close();
      toast('Buchung gelöscht');
      ctx.refresh();
    });
  }

  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    const cents = parseAmountToCents(data.amount);
    if (cents == null || cents === 0) return toast('Bitte einen gültigen Betrag eingeben');
    const signed = data.kind === 'income' ? Math.abs(cents) : -Math.abs(cents);
    const newCat = data.kind === 'income' ? null : data.categoryId || null;
    if (isEdit) {
      await updateTransaction({
        ...t,
        accountId: data.accountId,
        date: data.date || todayISO(),
        payee: (data.payee || '').trim(),
        categoryId: newCat,
        subcategoryId: newCat && newCat === t.categoryId ? t.subcategoryId || null : null,
        amount: signed,
      });
      toast('Buchung aktualisiert');
    } else {
      await addTransaction({
        accountId: data.accountId,
        date: data.date || todayISO(),
        payee: data.payee || '',
        categoryId: newCat,
        subcategoryId: null,
        amount: signed,
      });
      toast('Gespeichert');
    }
    close();
    ctx.refresh();
  });
}
