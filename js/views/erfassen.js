// "Erfassen"-Ansicht: Einnahmen/Ausgaben eingeben (Kategorie -> Unterkategorie)
// und bereits erfasste Buchungen bearbeiten oder löschen.

import {
  listTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  listAccounts,
  listGroups,
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

// ---- kleine Helfer für die zweistufige Auswahl ------------------------------

function groupOptions(groups, selName) {
  return groups
    .map((g) => `<option value="${esc(g.name)}"${g.name === selName ? ' selected' : ''}>${esc(g.name)}</option>`)
    .join('');
}
function subOptions(subs, selId) {
  return subs
    .map((c) => `<option value="${c.id}"${c.id === selId ? ' selected' : ''}>${esc(c.name)}</option>`)
    .join('');
}
function groupOfCategory(groups, categoryId) {
  return groups.find((g) => g.subs.some((c) => c.id === categoryId));
}

// ---- Ansicht ----------------------------------------------------------------

export async function renderErfassen(ctx) {
  const [transactions, accounts, groups] = await Promise.all([
    listTransactions(),
    listAccounts(),
    listGroups(),
  ]);

  ctx.setHeader({ title: 'Erfassen' });

  if (accounts.length === 0) {
    ctx.view.innerHTML = `
      <div class="empty">
        <div class="empty__icon">${icon.accounts}</div>
        <p class="empty__title">Zuerst ein Konto anlegen</p>
        <p class="empty__text">Lege ein Konto an, dann kannst du hier Einnahmen und Ausgaben erfassen.</p>
        <button class="btn btn--primary" id="go-accounts">Zu den Konten</button>
      </div>`;
    ctx.view.querySelector('#go-accounts').addEventListener('click', () => ctx.navigate('accounts'));
    return;
  }

  const firstGroup = groups[0];
  const accOptions = accounts
    .map((a) => `<option value="${a.id}">${esc(a.name)}</option>`)
    .join('');

  const noCats = groups.length === 0;

  let html = `
    <section class="entry-card">
      <div class="segmented" role="tablist">
        <button type="button" class="segmented__btn segmented__btn--active" data-kind="expense">Ausgabe</button>
        <button type="button" class="segmented__btn" data-kind="income">Einnahme</button>
      </div>
      <form id="entry-form">
        <input type="hidden" name="kind" value="expense" />
        <label class="field">
          <span class="field__label">Betrag</span>
          <input class="field__input field__input--amount" name="amount" inputmode="decimal" placeholder="0,00" required />
        </label>
        <div class="cat-fields">
          ${noCats ? `<p class="settings-note">Noch keine Kategorien. Lege sie im Reiter „Kategorien" an.</p>` : `
          <label class="field">
            <span class="field__label">Kategorie</span>
            <select class="field__input field__input--big" name="group">${groupOptions(groups, firstGroup.name)}</select>
          </label>
          <label class="field">
            <span class="field__label">Unterkategorie</span>
            <select class="field__input field__input--big" name="categoryId">${subOptions(firstGroup.subs, firstGroup.subs[0]?.id)}</select>
          </label>`}
        </div>
        <div class="entry-row">
          <label class="field">
            <span class="field__label">Datum</span>
            <input class="field__input" type="date" name="date" value="${todayISO()}" />
          </label>
          <label class="field">
            <span class="field__label">Konto</span>
            <select class="field__input" name="accountId">${accOptions}</select>
          </label>
        </div>
        <label class="field">
          <span class="field__label">Notiz / Empfänger (optional)</span>
          <input class="field__input" name="payee" placeholder="z. B. Supermarkt" />
        </label>
        <button type="submit" class="btn btn--primary btn--block">Speichern</button>
      </form>
    </section>`;

  // Liste bereits erfasster Buchungen
  html += renderList(transactions, accounts, groups);

  ctx.view.innerHTML = html;

  wireEntryForm(ctx, ctx.view.querySelector('#entry-form'), groups);
  wireList(ctx, transactions, accounts, groups);
}

function renderList(transactions, accounts, groups) {
  if (transactions.length === 0) {
    return `<p class="list-title">Noch keine Buchungen erfasst.</p>`;
  }
  const accById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const catById = {};
  for (const g of groups) for (const c of g.subs) catById[c.id] = { ...c, group: g.name };

  const byDate = new Map();
  for (const t of transactions) {
    const key = t.date || '—';
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(t);
  }

  let html = `<p class="list-title">Erfasste Buchungen</p><div class="list">`;
  for (const [date, rows] of byDate) {
    html += `<div class="list-daydivider">${esc(formatDate(date))}</div>`;
    for (const t of rows) {
      const acc = accById[t.accountId];
      const cat = t.categoryId ? catById[t.categoryId] : null;
      const amountClass = t.amount < 0 ? 'is-negative' : 'is-positive';
      const title = t.payee || (t.amount >= 0 ? 'Einnahme' : 'Ausgabe');
      const sub = [
        cat ? `${cat.group} › ${cat.name}` : (t.amount >= 0 ? 'Einnahme' : 'Ohne Kategorie'),
        acc ? acc.name : '',
      ].filter(Boolean).join(' · ');
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
  return html;
}

// ---- Formular-Logik ---------------------------------------------------------

function wireCatSelects(container, groups) {
  const groupSel = container.querySelector('select[name="group"]');
  const subSel = container.querySelector('select[name="categoryId"]');
  if (!groupSel || !subSel) return;
  groupSel.addEventListener('change', () => {
    const g = groups.find((x) => x.name === groupSel.value);
    subSel.innerHTML = subOptions(g ? g.subs : [], g && g.subs[0] ? g.subs[0].id : null);
  });
}

function wireEntryForm(ctx, form, groups) {
  if (!form) return;
  const kindInput = form.querySelector('input[name="kind"]');
  const catFields = form.querySelector('.cat-fields');

  form.querySelectorAll('.segmented__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      form.querySelectorAll('.segmented__btn').forEach((b) => b.classList.remove('segmented__btn--active'));
      btn.classList.add('segmented__btn--active');
      kindInput.value = btn.dataset.kind;
      // Bei Einnahmen keine Kategorie nötig.
      catFields.style.display = btn.dataset.kind === 'income' ? 'none' : '';
    });
  });

  wireCatSelects(form, groups);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const cents = parseAmountToCents(data.amount);
    if (cents == null || cents === 0) return toast('Bitte einen gültigen Betrag eingeben');
    const signed = data.kind === 'income' ? Math.abs(cents) : -Math.abs(cents);
    await addTransaction({
      accountId: data.accountId,
      date: data.date || todayISO(),
      payee: data.payee || '',
      categoryId: data.kind === 'income' ? null : data.categoryId || null,
      amount: signed,
      note: '',
    });
    toast('Gespeichert');
    renderErfassen(ctx);
  });
}

// ---- Bearbeiten -------------------------------------------------------------

function wireList(ctx, transactions, accounts, groups) {
  ctx.view.querySelectorAll('[data-edit]').forEach((row) => {
    row.addEventListener('click', () => {
      const t = transactions.find((x) => x.id === row.dataset.edit);
      if (t) openEditor(ctx, t, accounts, groups);
    });
  });
}

function openEditor(ctx, t, accounts, groups) {
  const isIncome = t.amount >= 0 && !t.categoryId;
  const kind = t.amount >= 0 ? 'income' : 'expense';
  const curGroup = groupOfCategory(groups, t.categoryId);
  const accOptions = accounts
    .map((a) => `<option value="${a.id}"${a.id === t.accountId ? ' selected' : ''}>${esc(a.name)}</option>`)
    .join('');
  const amountValue = (Math.abs(t.amount) / 100).toString().replace('.', ',');

  const m = openModal(
    'Buchung bearbeiten',
    `<div class="segmented" role="tablist">
       <button type="button" class="segmented__btn ${kind === 'expense' ? 'segmented__btn--active' : ''}" data-kind="expense">Ausgabe</button>
       <button type="button" class="segmented__btn ${kind === 'income' ? 'segmented__btn--active' : ''}" data-kind="income">Einnahme</button>
     </div>
     <input type="hidden" name="kind" value="${kind}" />
     <label class="field">
       <span class="field__label">Betrag</span>
       <input class="field__input field__input--amount" name="amount" inputmode="decimal" value="${amountValue}" required />
     </label>
     <div class="cat-fields" ${kind === 'income' ? 'style="display:none"' : ''}>
       <label class="field">
         <span class="field__label">Kategorie</span>
         <select class="field__input field__input--big" name="group">${groupOptions(groups, curGroup ? curGroup.name : (groups[0] && groups[0].name))}</select>
       </label>
       <label class="field">
         <span class="field__label">Unterkategorie</span>
         <select class="field__input field__input--big" name="categoryId">${subOptions(curGroup ? curGroup.subs : (groups[0] ? groups[0].subs : []), t.categoryId)}</select>
       </label>
     </div>
     <label class="field">
       <span class="field__label">Datum</span>
       <input class="field__input" type="date" name="date" value="${t.date || todayISO()}" />
     </label>
     <label class="field">
       <span class="field__label">Konto</span>
       <select class="field__input" name="accountId">${accOptions}</select>
     </label>
     <label class="field">
       <span class="field__label">Notiz / Empfänger</span>
       <input class="field__input" name="payee" value="${esc(t.payee || '')}" placeholder="optional" />
     </label>
     <button type="button" class="btn btn--block btn--danger" data-action="delete">Buchung löschen</button>`,
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
  wireCatSelects(m.el, groups);

  m.el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    const ok = await confirmDialog('Buchung löschen?', 'Diese Buchung wird entfernt.');
    if (!ok) return;
    await deleteTransaction(t.id);
    m.close();
    toast('Buchung gelöscht');
    renderErfassen(ctx);
  });

  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    const cents = parseAmountToCents(data.amount);
    if (cents == null || cents === 0) return toast('Bitte einen gültigen Betrag eingeben');
    const signed = data.kind === 'income' ? Math.abs(cents) : -Math.abs(cents);
    await updateTransaction({
      ...t,
      accountId: data.accountId,
      date: data.date || todayISO(),
      payee: (data.payee || '').trim(),
      categoryId: data.kind === 'income' ? null : data.categoryId || null,
      amount: signed,
    });
    close();
    toast('Buchung aktualisiert');
    renderErfassen(ctx);
  });
}
