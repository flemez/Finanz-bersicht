// "Erfassen"-Ansicht: Einnahmen/Ausgaben eingeben und einer Kategorie
// zuordnen (Unterkategorie optional) sowie Buchungen bearbeiten/löschen.

import {
  listTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  listAccounts,
  listCategoriesWithSubs,
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
function subOptions(cat, selId) {
  if (!cat || cat.subs.length === 0) return NONE;
  return NONE + cat.subs
    .map((s) => `<option value="${s.id}"${s.id === selId ? ' selected' : ''}>${esc(s.name)}</option>`)
    .join('');
}

export async function renderErfassen(ctx) {
  const [transactions, accounts, cats] = await Promise.all([
    listTransactions(),
    listAccounts(),
    listCategoriesWithSubs(),
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

  const firstCat = cats[0];
  const accOptions = accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('');

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
          ${cats.length === 0 ? `<p class="settings-note">Noch keine Kategorien. Lege sie im Reiter „Kategorien" oder „Budget" an.</p>` : `
          <label class="field">
            <span class="field__label">Kategorie</span>
            <select class="field__input field__input--big" name="categoryId">${categoryOptions(cats, firstCat.id)}</select>
          </label>
          <label class="field">
            <span class="field__label">Unterkategorie (optional)</span>
            <select class="field__input field__input--big" name="subcategoryId">${subOptions(firstCat, null)}</select>
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

  html += renderList(transactions, accounts, cats);

  ctx.view.innerHTML = html;

  wireEntryForm(ctx, ctx.view.querySelector('#entry-form'), cats);
  ctx.view.querySelectorAll('[data-edit]').forEach((row) => {
    row.addEventListener('click', () => {
      const t = transactions.find((x) => x.id === row.dataset.edit);
      if (t) openEditor(ctx, t, accounts, cats);
    });
  });
}

function renderList(transactions, accounts, cats) {
  if (transactions.length === 0) return `<p class="list-title">Noch keine Buchungen erfasst.</p>`;
  const accById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
  const subById = {};
  for (const c of cats) for (const s of c.subs) subById[s.id] = s;

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
      const sub = t.subcategoryId ? subById[t.subcategoryId] : null;
      const amountClass = t.amount < 0 ? 'is-negative' : 'is-positive';
      const title = t.payee || (t.amount >= 0 ? 'Einnahme' : 'Ausgabe');
      const catText = cat ? (sub ? `${cat.name} › ${sub.name}` : cat.name) : (t.amount >= 0 ? 'Einnahme' : 'Ohne Kategorie');
      const subLine = [catText, acc ? acc.name : ''].filter(Boolean).join(' · ');
      html += `
        <div class="list-row" data-edit="${t.id}">
          <div class="list-row__main">
            <span class="list-row__title">${esc(title)}</span>
            <span class="list-row__sub">${esc(subLine)}</span>
          </div>
          <div class="list-row__value ${amountClass}">${formatCents(t.amount)}</div>
        </div>`;
    }
  }
  html += '</div>';
  return html;
}

function wireCatSelects(container, cats) {
  const catSel = container.querySelector('select[name="categoryId"]');
  const subSel = container.querySelector('select[name="subcategoryId"]');
  if (!catSel || !subSel) return;
  catSel.addEventListener('change', () => {
    const c = cats.find((x) => x.id === catSel.value);
    subSel.innerHTML = subOptions(c, null);
  });
}

function wireEntryForm(ctx, form, cats) {
  if (!form) return;
  const kindInput = form.querySelector('input[name="kind"]');
  const catFields = form.querySelector('.cat-fields');
  form.querySelectorAll('.segmented__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      form.querySelectorAll('.segmented__btn').forEach((b) => b.classList.remove('segmented__btn--active'));
      btn.classList.add('segmented__btn--active');
      kindInput.value = btn.dataset.kind;
      catFields.style.display = btn.dataset.kind === 'income' ? 'none' : '';
    });
  });
  wireCatSelects(form, cats);

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
      subcategoryId: data.kind === 'income' ? null : data.subcategoryId || null,
      amount: signed,
    });
    toast('Gespeichert');
    renderErfassen(ctx);
  });
}

function openEditor(ctx, t, accounts, cats) {
  const kind = t.amount >= 0 ? 'income' : 'expense';
  const curCat = t.categoryId ? cats.find((c) => c.id === t.categoryId) : null;
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
         <select class="field__input field__input--big" name="categoryId">${categoryOptions(cats, t.categoryId)}</select>
       </label>
       <label class="field">
         <span class="field__label">Unterkategorie (optional)</span>
         <select class="field__input field__input--big" name="subcategoryId">${subOptions(curCat, t.subcategoryId)}</select>
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
  wireCatSelects(m.el, cats);

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
      subcategoryId: data.kind === 'income' ? null : data.subcategoryId || null,
      amount: signed,
    });
    close();
    toast('Buchung aktualisiert');
    renderErfassen(ctx);
  });
}
