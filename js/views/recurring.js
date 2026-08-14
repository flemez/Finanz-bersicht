// Fixkosten-Ansicht: wiederkehrende Buchungen festlegen, die jeden Monat
// automatisch eingetragen werden.

import {
  listRecurring,
  addRecurring,
  updateRecurring,
  deleteRecurring,
  postDueRecurring,
  listAccounts,
  listCategories,
} from '../store.js';
import { formatCents, esc, parseAmountToCents } from '../format.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';

export async function renderRecurring(ctx) {
  const [recs, accounts, categories] = await Promise.all([
    listRecurring(),
    listAccounts(),
    listCategories(),
  ]);
  const accById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));

  ctx.setHeader({
    title: 'Fixkosten',
    back: () => ctx.navigate('more'),
  });

  // Monatliche Summe (Ausgaben negativ, Einnahmen positiv), nur aktive.
  const monthly = recs
    .filter((r) => r.active)
    .reduce((s, r) => s + (r.type === 'income' ? r.amount : -r.amount), 0);

  let html = `
    <section class="assign-card ${monthly < 0 ? 'is-negative' : 'is-positive'}">
      <div class="assign-card__label">Monatliche Fixkosten (Saldo)</div>
      <div class="assign-card__value">${formatCents(monthly)}</div>
    </section>
    <p class="settings-note">Diese Buchungen trägt die App automatisch jeden Monat für dich ein – beim Öffnen der App, sobald der eingestellte Tag erreicht ist.</p>`;

  if (recs.length === 0) {
    html += `
      <div class="empty">
        <div class="empty__icon">${icon.recurring}</div>
        <p class="empty__title">Noch keine Fixkosten</p>
        <p class="empty__text">Lege z. B. Miete, Strom oder Abos an – sie werden dann monatlich automatisch gebucht.</p>
      </div>`;
  } else {
    html += '<div class="list">';
    for (const r of recs) {
      const acc = accById[r.accountId];
      const cat = r.categoryId ? catById[r.categoryId] : null;
      const signedAmount = r.type === 'income' ? r.amount : -r.amount;
      const amountClass = signedAmount < 0 ? 'is-negative' : 'is-positive';
      const sub = [
        `am ${r.dayOfMonth}. jeden Monats`,
        cat ? cat.name : (r.type === 'income' ? 'Einnahme' : 'Ohne Kategorie'),
        acc ? acc.name : '',
      ].filter(Boolean).join(' · ');
      html += `
        <div class="list-row" data-edit="${r.id}">
          <div class="list-row__main">
            <span class="list-row__title">${esc(r.name)}${r.active ? '' : ' <span class="tag-muted">(pausiert)</span>'}</span>
            <span class="list-row__sub">${esc(sub)}</span>
          </div>
          <div class="list-row__value ${amountClass}">${formatCents(signedAmount)}</div>
          <button class="icon-btn list-row__del" data-del="${r.id}" aria-label="Fixkosten löschen">${icon.trash}</button>
        </div>`;
    }
    html += '</div>';
  }

  html += `<button class="btn btn--block btn--ghost" id="add-recurring">+ Fixkosten hinzufügen</button>`;

  ctx.view.innerHTML = html;

  ctx.view.querySelector('#add-recurring').addEventListener('click', () =>
    openRecurringModal(ctx, null, accounts, categories)
  );

  ctx.view.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog(
        'Fixkosten löschen?',
        'Die Regel wird entfernt. Bereits gebuchte Beträge bleiben erhalten.'
      );
      if (!ok) return;
      await deleteRecurring(btn.dataset.del);
      toast('Fixkosten gelöscht');
      renderRecurring(ctx);
    });
  });

  ctx.view.querySelectorAll('[data-edit]').forEach((row) => {
    row.addEventListener('click', () => {
      const rec = recs.find((r) => r.id === row.dataset.edit);
      if (rec) openRecurringModal(ctx, rec, accounts, categories);
    });
  });
}

function buildCategoryOptions(categories, selectedId) {
  const groups = new Map();
  for (const c of categories) {
    const g = c.group || 'Allgemein';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  }
  let out = '<option value="">– Noch nicht zuordnen –</option>';
  for (const [g, cs] of groups) {
    out += `<optgroup label="${esc(g)}">`;
    out += cs
      .map((c) => `<option value="${c.id}"${c.id === selectedId ? ' selected' : ''}>${esc(c.name)}</option>`)
      .join('');
    out += '</optgroup>';
  }
  return out;
}

async function openRecurringModal(ctx, existing, accounts, categories) {
  if (accounts.length === 0) {
    toast('Bitte zuerst ein Konto anlegen');
    ctx.navigate('accounts');
    return;
  }
  const isEdit = !!existing;
  const r = existing || {};
  const type = r.type || 'expense';

  const accOptions = accounts
    .map((a) => `<option value="${a.id}"${a.id === r.accountId ? ' selected' : ''}>${esc(a.name)}</option>`)
    .join('');
  const catOptions = buildCategoryOptions(categories, r.categoryId);
  const amountValue = r.amount ? (r.amount / 100).toString().replace('.', ',') : '';

  const m = openModal(
    isEdit ? 'Fixkosten bearbeiten' : 'Neue Fixkosten',
    `<div class="segmented" role="tablist">
       <button type="button" class="segmented__btn ${type === 'expense' ? 'segmented__btn--active' : ''}" data-kind="expense">Ausgabe</button>
       <button type="button" class="segmented__btn ${type === 'income' ? 'segmented__btn--active' : ''}" data-kind="income">Einnahme</button>
     </div>
     <input type="hidden" name="kind" value="${type}" />
     <label class="field">
       <span class="field__label">Bezeichnung</span>
       <input class="field__input" name="name" placeholder="z. B. Miete" value="${esc(r.name || '')}" required />
     </label>
     <label class="field">
       <span class="field__label">Betrag</span>
       <input class="field__input field__input--amount" name="amount" inputmode="decimal"
              placeholder="0,00" value="${amountValue}" required />
     </label>
     <label class="field field--category" ${type === 'income' ? 'style="display:none"' : ''}>
       <span class="field__label">Wohin einsortieren? (Kategorie)</span>
       <select class="field__input field__input--big" name="categoryId">${catOptions}</select>
     </label>
     <label class="field">
       <span class="field__label">Konto</span>
       <select class="field__input" name="accountId">${accOptions}</select>
     </label>
     <label class="field">
       <span class="field__label">Tag im Monat (1–28)</span>
       <input class="field__input" name="dayOfMonth" type="number" min="1" max="28"
              value="${r.dayOfMonth || 1}" />
     </label>
     ${isEdit ? `<label class="field field--check">
       <input type="checkbox" name="active" ${r.active ? 'checked' : ''} />
       <span>Aktiv (monatlich automatisch buchen)</span>
     </label>` : ''}`,
    [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: isEdit ? 'Speichern' : 'Anlegen', value: 'ok', variant: 'primary' },
    ]
  );

  const kindInput = m.el.querySelector('input[name="kind"]');
  const catField = m.el.querySelector('.field--category');
  m.el.querySelectorAll('.segmented__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      m.el.querySelectorAll('.segmented__btn').forEach((b) => b.classList.remove('segmented__btn--active'));
      btn.classList.add('segmented__btn--active');
      kindInput.value = btn.dataset.kind;
      catField.style.display = btn.dataset.kind === 'income' ? 'none' : '';
    });
  });

  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    if (!data.name || !data.name.trim()) return toast('Bitte eine Bezeichnung eingeben');
    const cents = parseAmountToCents(data.amount);
    if (cents == null || cents === 0) return toast('Bitte einen gültigen Betrag eingeben');
    const day = Math.min(28, Math.max(1, parseInt(data.dayOfMonth, 10) || 1));

    if (isEdit) {
      await updateRecurring({
        ...existing,
        name: data.name.trim(),
        type: data.kind,
        amount: Math.abs(cents),
        categoryId: data.kind === 'income' ? null : data.categoryId || null,
        accountId: data.accountId,
        dayOfMonth: day,
        active: data.active === 'on',
      });
      toast('Fixkosten gespeichert');
    } else {
      await addRecurring({
        name: data.name.trim(),
        type: data.kind,
        amount: Math.abs(cents),
        categoryId: data.categoryId || null,
        accountId: data.accountId,
        dayOfMonth: day,
      });
      // Falls der Fälligkeitstag diesen Monat schon erreicht ist, direkt buchen.
      const created = await postDueRecurring();
      toast(created > 0 ? 'Fixkosten angelegt & für diesen Monat gebucht' : 'Fixkosten angelegt');
    }
    close();
    renderRecurring(ctx);
  });
}
