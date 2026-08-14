// Konten-Ansicht: Übersicht aller Konten mit Salden.

import {
  listAccounts,
  listTransactions,
  accountBalance,
  addAccount,
  deleteAccount,
  addTransaction,
} from '../store.js';
import { formatCents, esc, parseAmountToCents, todayISO } from '../format.js';
import { openModal, toast, confirmDialog } from '../ui.js';

const TYPES = {
  giro: 'Girokonto',
  bargeld: 'Bargeld',
  sparen: 'Sparkonto',
  kreditkarte: 'Kreditkarte',
  sonstiges: 'Sonstiges',
};

export async function renderAccounts(ctx) {
  const [accounts, transactions] = await Promise.all([
    listAccounts(),
    listTransactions(),
  ]);

  const total = accounts
    .filter((a) => a.onBudget)
    .reduce((sum, a) => sum + accountBalance(a.id, transactions), 0);

  ctx.setHeader({
    title: 'Konten',
    action: {
      label: '+ Konto',
      aria: 'Konto hinzufügen',
      onClick: () => openAccountModal(ctx),
    },
  });

  let html = `
    <section class="total-card">
      <div class="total-card__label">Gesamtvermögen (Budget-Konten)</div>
      <div class="total-card__value">${formatCents(total)}</div>
    </section>`;

  if (accounts.length === 0) {
    html += `
      <div class="empty">
        <div class="empty__icon">▤</div>
        <p class="empty__title">Noch keine Konten</p>
        <p class="empty__text">Lege dein erstes Konto an, um loszulegen.</p>
      </div>`;
  } else {
    html += '<div class="list">';
    for (const a of accounts) {
      const bal = accountBalance(a.id, transactions);
      const balClass = bal < 0 ? 'is-negative' : '';
      html += `
        <div class="list-row" data-account="${a.id}">
          <div class="list-row__main">
            <span class="list-row__title">${esc(a.name)}</span>
            <span class="list-row__sub">${esc(TYPES[a.type] || a.type)}${a.onBudget ? '' : ' · außerhalb Budget'}</span>
          </div>
          <div class="list-row__value ${balClass}">${formatCents(bal)}</div>
          <button class="icon-btn list-row__del" data-del="${a.id}" aria-label="Konto löschen">🗑</button>
        </div>`;
    }
    html += '</div>';
  }

  ctx.view.innerHTML = html;

  ctx.view.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.del;
      const ok = await confirmDialog(
        'Konto löschen?',
        'Alle Buchungen dieses Kontos werden ebenfalls gelöscht. Das kann nicht rückgängig gemacht werden.'
      );
      if (!ok) return;
      await deleteAccount(id);
      toast('Konto gelöscht');
      renderAccounts(ctx);
    });
  });
}

function openAccountModal(ctx) {
  const options = Object.entries(TYPES)
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join('');
  const m = openModal(
    'Neues Konto',
    `<label class="field">
       <span class="field__label">Name</span>
       <input class="field__input" name="name" placeholder="z. B. Girokonto" required />
     </label>
     <label class="field">
       <span class="field__label">Art</span>
       <select class="field__input" name="type">${options}</select>
     </label>
     <label class="field">
       <span class="field__label">Aktueller Kontostand (optional)</span>
       <input class="field__input field__input--amount" name="startBalance" inputmode="decimal" placeholder="0,00" />
       <span class="field__hint">Trägt deinen jetzigen Stand als Startsaldo ein. Bei Schulden (z. B. Kreditkarte) ein Minus davor.</span>
     </label>
     <label class="field field--check">
       <input type="checkbox" name="onBudget" checked />
       <span>Zum Budget zählen</span>
     </label>`,
    [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: 'Anlegen', value: 'ok', variant: 'primary' },
    ]
  );
  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    if (!data.name || !data.name.trim()) return toast('Bitte einen Namen eingeben');
    const account = await addAccount({
      name: data.name,
      type: data.type || 'giro',
      onBudget: data.onBudget === 'on',
    });
    // Optionalen Startsaldo als Eröffnungsbuchung anlegen.
    const startCents = parseAmountToCents(data.startBalance);
    if (startCents) {
      await addTransaction({
        accountId: account.id,
        date: todayISO(),
        payee: 'Startsaldo',
        categoryId: null,
        amount: startCents,
        note: 'Eröffnungssaldo',
      });
    }
    close();
    toast('Konto angelegt');
    renderAccounts(ctx);
  });
}
