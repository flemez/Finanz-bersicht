// Geschäftslogik: Konten, Kategorien, Buchungen und die
// Umschlag-Budgetierung ("Envelope Budgeting", inspiriert von Actual Budget).
//
// Grundidee des Umschlag-Budgets:
//  - Einnahmen (positive Buchung ohne Kategorie auf einem Budget-Konto)
//    landen im Topf "Verfügbar zum Zuweisen".
//  - Von dort verteilst du Geld pro Monat auf Kategorien (Umschläge).
//  - Jede Kategorie hat ein "Verfügbar", das von Monat zu Monat übertragen wird.

import * as db from './db.js';
import { uid, currentMonth, todayISO, shiftMonth } from './format.js';

// ---- Konten -----------------------------------------------------------------

export async function listAccounts() {
  const rows = await db.getAll('accounts');
  return rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function addAccount({ name, type = 'giro', onBudget = true }) {
  const account = {
    id: uid(),
    name: String(name).trim(),
    type,
    onBudget: !!onBudget,
    sortOrder: Date.now(),
    createdAt: new Date().toISOString(),
  };
  return db.put('accounts', account);
}

export async function updateAccount(account) {
  return db.put('accounts', account);
}

export async function deleteAccount(id) {
  // Zugehörige Buchungen mitlöschen.
  const txns = await db.getAll('transactions');
  for (const t of txns.filter((t) => t.accountId === id)) {
    await db.remove('transactions', t.id);
  }
  return db.remove('accounts', id);
}

/** Kontostand (Summe aller Buchungen des Kontos) in Cent. */
export function accountBalance(accountId, transactions) {
  return transactions
    .filter((t) => t.accountId === accountId)
    .reduce((sum, t) => sum + (t.amount || 0), 0);
}

// ---- Kategorien (Umschläge) -------------------------------------------------

export async function listCategories() {
  const rows = await db.getAll('categories');
  return rows.sort(
    (a, b) =>
      (a.group || '').localeCompare(b.group || '') ||
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  );
}

export async function addCategory({ name, group = 'Allgemein' }) {
  const category = {
    id: uid(),
    name: String(name).trim(),
    group: String(group).trim() || 'Allgemein',
    sortOrder: Date.now(),
    createdAt: new Date().toISOString(),
  };
  return db.put('categories', category);
}

export async function updateCategory(category) {
  return db.put('categories', category);
}

export async function deleteCategory(id) {
  // Buchungen behalten, aber Kategorie entfernen.
  const txns = await db.getAll('transactions');
  for (const t of txns.filter((t) => t.categoryId === id)) {
    await db.put('transactions', { ...t, categoryId: null });
  }
  const budgets = await db.getAll('budgets');
  for (const b of budgets.filter((b) => b.categoryId === id)) {
    await db.remove('budgets', b.id);
  }
  return db.remove('categories', id);
}

// ---- Buchungen --------------------------------------------------------------

export async function listTransactions() {
  const rows = await db.getAll('transactions');
  return rows.sort(
    (a, b) =>
      (b.date || '').localeCompare(a.date || '') ||
      (b.createdAt || '').localeCompare(a.createdAt || '')
  );
}

export async function addTransaction({
  accountId,
  date,
  payee = '',
  categoryId = null,
  amount,
  note = '',
}) {
  const t = {
    id: uid(),
    accountId,
    date,
    payee: String(payee).trim(),
    categoryId: categoryId || null,
    amount: amount | 0,
    note: String(note).trim(),
    createdAt: new Date().toISOString(),
  };
  return db.put('transactions', t);
}

export async function updateTransaction(t) {
  return db.put('transactions', t);
}

export async function deleteTransaction(id) {
  return db.remove('transactions', id);
}

// ---- Budget (Umschlag-Logik) ------------------------------------------------

function budgetId(month, categoryId) {
  return `${month}:${categoryId}`;
}

export async function getBudgeted(month, categoryId) {
  const row = await db.get('budgets', budgetId(month, categoryId));
  return row ? row.budgeted : 0;
}

export async function setBudgeted(month, categoryId, cents) {
  return db.put('budgets', {
    id: budgetId(month, categoryId),
    month,
    categoryId,
    budgeted: cents | 0,
  });
}

/**
 * Vollständige Budget-Übersicht für einen Monat berechnen.
 * Liefert pro Kategorie: budgeted, activity (Ausgaben/Einnahmen des Monats),
 * available (übertragener Umschlag-Stand) – und den Gesamttopf
 * "Verfügbar zum Zuweisen".
 */
export async function computeBudget(month) {
  const [accounts, categories, transactions, budgets] = await Promise.all([
    db.getAll('accounts'),
    listCategories(),
    db.getAll('transactions'),
    db.getAll('budgets'),
  ]);

  const onBudgetIds = new Set(
    accounts.filter((a) => a.onBudget).map((a) => a.id)
  );

  const monthActivity = (categoryId, m) =>
    transactions
      .filter(
        (t) =>
          t.categoryId === categoryId &&
          (t.date || '').slice(0, 7) === m &&
          onBudgetIds.has(t.accountId)
      )
      .reduce((sum, t) => sum + (t.amount || 0), 0);

  const budgetedFor = (categoryId, m) => {
    const row = budgets.find((b) => b.categoryId === categoryId && b.month === m);
    return row ? row.budgeted : 0;
  };

  // Alle relevanten Monate bis einschließlich des gewählten sammeln.
  const months = new Set([month]);
  for (const b of budgets) if (b.month <= month) months.add(b.month);
  for (const t of transactions) {
    const m = (t.date || '').slice(0, 7);
    if (m && m <= month) months.add(m);
  }
  const sortedMonths = [...months].sort();

  const rows = categories.map((cat) => {
    // Verfügbar = kumuliert (budgetiert + Aktivität) über alle Monate <= month.
    let available = 0;
    for (const m of sortedMonths) {
      available += budgetedFor(cat.id, m) + monthActivity(cat.id, m);
    }
    return {
      category: cat,
      budgeted: budgetedFor(cat.id, month),
      activity: monthActivity(cat.id, month),
      available,
    };
  });

  // "Verfügbar zum Zuweisen" = Einnahmen (bis Monat) − insgesamt budgetiert (bis Monat).
  let incomeToDate = 0;
  for (const t of transactions) {
    const m = (t.date || '').slice(0, 7);
    if (
      m &&
      m <= month &&
      !t.categoryId &&
      (t.amount || 0) > 0 &&
      onBudgetIds.has(t.accountId)
    ) {
      incomeToDate += t.amount;
    }
  }
  let budgetedToDate = 0;
  for (const b of budgets) if (b.month <= month) budgetedToDate += b.budgeted || 0;

  const toAssign = incomeToDate - budgetedToDate;

  const totals = {
    budgeted: rows.reduce((s, r) => s + r.budgeted, 0),
    activity: rows.reduce((s, r) => s + r.activity, 0),
    available: rows.reduce((s, r) => s + r.available, 0),
  };

  return { month, rows, toAssign, totals };
}

// ---- Fixkosten / wiederkehrende Buchungen -----------------------------------
//
// Da die App lokal ohne Server läuft, werden fällige Fixkosten beim Öffnen
// der App automatisch nachgebucht (siehe postDueRecurring).

export async function listRecurring() {
  const rows = await db.getAll('recurring');
  return rows.sort(
    (a, b) => (a.dayOfMonth ?? 1) - (b.dayOfMonth ?? 1) ||
      (a.name || '').localeCompare(b.name || '')
  );
}

export async function addRecurring({
  name,
  type = 'expense',
  amount,
  categoryId = null,
  accountId,
  dayOfMonth = 1,
}) {
  const rec = {
    id: uid(),
    name: String(name).trim(),
    type,
    amount: Math.abs(amount | 0),
    categoryId: type === 'income' ? null : categoryId || null,
    accountId,
    dayOfMonth: Math.min(28, Math.max(1, dayOfMonth | 0)),
    active: true,
    startMonth: currentMonth(),
    lastPosted: null,
    createdAt: new Date().toISOString(),
  };
  return db.put('recurring', rec);
}

export async function updateRecurring(rec) {
  return db.put('recurring', rec);
}

export async function deleteRecurring(id) {
  return db.remove('recurring', id);
}

/**
 * Alle fälligen Fixkosten automatisch als Buchung nachtragen.
 * Wird beim App-Start aufgerufen. Bucht jeden ausstehenden Monat vom
 * Startmonat bis zum aktuellen Monat (aktueller Monat erst ab dem
 * eingestellten Tag). Liefert die Anzahl neu erstellter Buchungen.
 */
export async function postDueRecurring() {
  const recs = await db.getAll('recurring');
  const curMonth = currentMonth();
  const curDay = Number(todayISO().slice(8, 10));
  let created = 0;

  for (const rec of recs) {
    if (!rec.active) continue;
    let month = rec.lastPosted ? shiftMonth(rec.lastPosted, 1) : rec.startMonth || curMonth;
    let changed = false;

    // Sicherheitsgrenze gegen Endlosschleifen.
    let guard = 0;
    while (month <= curMonth && guard++ < 600) {
      const isCurrent = month === curMonth;
      // Aktuellen Monat nur buchen, wenn der Fälligkeitstag erreicht ist.
      if (isCurrent && curDay < rec.dayOfMonth) break;

      const day = String(Math.min(28, rec.dayOfMonth)).padStart(2, '0');
      await addTransaction({
        accountId: rec.accountId,
        date: `${month}-${day}`,
        payee: rec.name,
        categoryId: rec.type === 'income' ? null : rec.categoryId || null,
        amount: rec.type === 'income' ? Math.abs(rec.amount) : -Math.abs(rec.amount),
        note: 'Automatische Fixkosten-Buchung',
      });
      rec.lastPosted = month;
      changed = true;
      created++;
      month = shiftMonth(month, 1);
    }

    if (changed) await db.put('recurring', rec);
  }
  return created;
}

// ---- Ersteinrichtung --------------------------------------------------------

/** Beim allerersten Start sinnvolle Beispieldaten anlegen. */
export async function seedIfEmpty() {
  const accounts = await db.getAll('accounts');
  const categories = await db.getAll('categories');
  if (accounts.length > 0 || categories.length > 0) return false;

  await addAccount({ name: 'Girokonto', type: 'giro', onBudget: true });
  await addAccount({ name: 'Bargeld', type: 'bargeld', onBudget: true });

  const defaults = [
    { group: 'Fixkosten', names: ['Miete', 'Strom', 'Internet & Handy', 'Versicherungen'] },
    { group: 'Alltag', names: ['Lebensmittel', 'Restaurant', 'Mobilität', 'Freizeit'] },
    { group: 'Sparziele', names: ['Notgroschen', 'Urlaub'] },
  ];
  for (const grp of defaults) {
    for (const name of grp.names) {
      await addCategory({ name, group: grp.group });
    }
  }
  return true;
}

export { currentMonth };
