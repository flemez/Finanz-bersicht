// Fixkosten-Ansicht: wiederkehrende Buchungen festlegen, die jeden Monat
// automatisch (anteilig) einer Kategorie gebucht werden.

import {
  listRecurring,
  addRecurring,
  updateRecurring,
  deleteRecurring,
  postDueRecurring,
  listAccounts,
  INTERVALS,
  monthlyCents,
} from '../store.js';
import { formatCents, esc, parseAmountToCents } from '../format.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';

export async function renderRecurring(ctx) {
  const [recs, accounts] = await Promise.all([
    listRecurring(),
    listAccounts(),
  ]);
  const accById = Object.fromEntries(accounts.map((a) => [a.id, a]));

  ctx.setHeader({ title: 'Fixkosten' });

  const monthly = recs
    .filter((r) => r.active)
    .reduce((s, r) => s + (r.type === 'income' ? monthlyCents(r) : -monthlyCents(r)), 0);

  let html = `
    <section class="assign-card ${monthly < 0 ? 'is-negative' : 'is-positive'}">
      <div class="assign-card__label">Pro Monat (Saldo, anteilig)</div>
      <div class="assign-card__value">${formatCents(monthly)}</div>
    </section>
    <p class="settings-note">Einnahmen und Fixkosten werden ohne Kategorie verbucht: Einnahmen erhöhen den im Aufteilungs-Tab verteilbaren Betrag, Fixkosten mindern ihn. Nicht-monatliche Beträge werden anteilig auf den Monat heruntergerechnet – automatisch beim Öffnen der App, sobald der eingestellte Tag erreicht ist.</p>`;

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
      const perMonth = monthlyCents(r);
      const signedMonthly = r.type === 'income' ? perMonth : -perMonth;
      const amountClass = signedMonthly < 0 ? 'is-negative' : 'is-positive';
      const intervalLabel = (INTERVALS[r.interval] || INTERVALS.monthly).label;
      const isMonthly = !r.interval || r.interval === 'monthly';
      const typeText = r.type === 'income' ? 'Einnahme' : 'Fixkosten';
      const subLine = [
        typeText,
        isMonthly ? 'monatlich' : `${intervalLabel} (${formatCents(r.amount)})`,
        `am ${r.dayOfMonth}.`,
        acc ? acc.name : '',
      ].filter(Boolean).join(' · ');
      html += `
        <div class="list-row" data-edit="${r.id}">
          <div class="list-row__main">
            <span class="list-row__title">${esc(r.name)}${r.active ? '' : ' <span class="tag-muted">(pausiert)</span>'}</span>
            <span class="list-row__sub">${esc(subLine)}</span>
          </div>
          <div class="list-row__value ${amountClass}">${formatCents(signedMonthly)}<span class="value-unit">/Monat</span></div>
          <button class="icon-btn list-row__del" data-del="${r.id}" aria-label="Fixkosten löschen">${icon.trash}</button>
        </div>`;
    }
    html += '</div>';
  }

  html += `<button class="btn btn--block btn--ghost" id="add-recurring">+ Fixkosten hinzufügen</button>`;
  html += `<button class="btn btn--block btn--ghost" id="add-income">+ Einnahme hinzufügen</button>`;

  ctx.view.innerHTML = html;

  ctx.view.querySelector('#add-recurring').addEventListener('click', () => openRecurringModal(ctx, null, accounts, 'expense'));
  ctx.view.querySelector('#add-income').addEventListener('click', () => openRecurringModal(ctx, null, accounts, 'income'));

  ctx.view.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog('Fixkosten löschen?', 'Die Regel wird entfernt. Bereits gebuchte Beträge bleiben erhalten.');
      if (!ok) return;
      await deleteRecurring(btn.dataset.del);
      toast('Fixkosten gelöscht');
      renderRecurring(ctx);
    });
  });

  ctx.view.querySelectorAll('[data-edit]').forEach((row) => {
    row.addEventListener('click', () => {
      const rec = recs.find((r) => r.id === row.dataset.edit);
      if (rec) openRecurringModal(ctx, rec, accounts);
    });
  });
}

async function openRecurringModal(ctx, existing, accounts, initialType = 'expense') {
  if (accounts.length === 0) {
    toast('Bitte zuerst ein Konto anlegen');
    ctx.navigate('accounts');
    return;
  }
  const isEdit = !!existing;
  const r = existing || {};
  const type = r.type || initialType;

  const accOptions = accounts
    .map((a) => `<option value="${a.id}"${a.id === r.accountId ? ' selected' : ''}>${esc(a.name)}</option>`)
    .join('');
  const amountValue = r.amount ? (r.amount / 100).toString().replace('.', ',') : '';
  const curInterval = r.interval || 'monthly';
  const intervalOptions = Object.entries(INTERVALS)
    .map(([k, v]) => `<option value="${k}"${curInterval === k ? ' selected' : ''}>${v.label}</option>`)
    .join('');

  const title = isEdit
    ? type === 'income'
      ? 'Einnahme bearbeiten'
      : 'Fixkosten bearbeiten'
    : type === 'income'
      ? 'Neue Einnahme'
      : 'Neue Fixkosten';

  const m = openModal(
    title,
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
       <span class="field__label">Betrag (pro Zeitraum)</span>
       <input class="field__input field__input--amount" name="amount" inputmode="decimal" placeholder="0,00" value="${amountValue}" required />
     </label>
     <label class="field">
       <span class="field__label">Intervall</span>
       <select class="field__input" name="interval">${intervalOptions}</select>
       <span class="field__hint" id="rec-preview"></span>
     </label>
     <label class="field">
       <span class="field__label">Konto</span>
       <select class="field__input" name="accountId">${accOptions}</select>
     </label>
     <label class="field">
       <span class="field__label">Tag im Monat (1–28)</span>
       <input class="field__input" name="dayOfMonth" type="number" min="1" max="28" value="${r.dayOfMonth || 1}" />
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
  m.el.querySelectorAll('.segmented__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      m.el.querySelectorAll('.segmented__btn').forEach((b) => b.classList.remove('segmented__btn--active'));
      btn.classList.add('segmented__btn--active');
      kindInput.value = btn.dataset.kind;
    });
  });

  // Live-Vorschau: „= X €/Monat".
  const amountInput = m.el.querySelector('input[name="amount"]');
  const intervalSelect = m.el.querySelector('select[name="interval"]');
  const preview = m.el.querySelector('#rec-preview');
  const updatePreview = () => {
    const cents = parseAmountToCents(amountInput.value);
    const months = (INTERVALS[intervalSelect.value] || INTERVALS.monthly).months;
    if (cents == null || cents === 0) {
      preview.textContent = 'Wird anteilig pro Monat verbucht.';
      return;
    }
    const perMonth = Math.round(Math.abs(cents) / months);
    preview.textContent =
      months === 1
        ? `Wird monatlich verbucht: ${formatCents(perMonth)} pro Monat.`
        : `= ${formatCents(perMonth)} pro Monat (anteilig verbucht).`;
  };
  amountInput.addEventListener('input', updatePreview);
  intervalSelect.addEventListener('change', updatePreview);
  updatePreview();

  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    if (!data.name || !data.name.trim()) return toast('Bitte eine Bezeichnung eingeben');
    const cents = parseAmountToCents(data.amount);
    if (cents == null || cents === 0) return toast('Bitte einen gültigen Betrag eingeben');
    const day = Math.min(28, Math.max(1, parseInt(data.dayOfMonth, 10) || 1));
    const interval = INTERVALS[data.interval] ? data.interval : 'monthly';

    const isIncome = data.kind === 'income';
    if (isEdit) {
      await updateRecurring({
        ...existing,
        name: data.name.trim(),
        type: data.kind,
        amount: Math.abs(cents),
        interval,
        categoryId: null,
        subcategoryId: null,
        accountId: data.accountId,
        dayOfMonth: day,
        active: data.active === 'on',
      });
      toast(isIncome ? 'Einnahme gespeichert' : 'Fixkosten gespeichert');
    } else {
      await addRecurring({
        name: data.name.trim(),
        type: data.kind,
        amount: Math.abs(cents),
        interval,
        accountId: data.accountId,
        dayOfMonth: day,
      });
      const created = await postDueRecurring();
      const noun = isIncome ? 'Einnahme' : 'Fixkosten';
      toast(created > 0 ? `${noun} angelegt & für diesen Monat verbucht` : `${noun} angelegt`);
    }
    close();
    renderRecurring(ctx);
  });
}
