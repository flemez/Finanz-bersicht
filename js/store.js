// Geschäftslogik: Konten, Kategorien (mit optionalen Unterkategorien),
// Buchungen und die Umschlag-Budgetierung.
//
// Modell:
//  - Kategorie (categories) = die Budget-Einheit. Hier wird Geld zugewiesen,
//    und die Übersicht zeigt pro Kategorie budgetiert / ausgegeben / verfügbar.
//  - Unterkategorie (subcategories) = optionales Detail unter einer Kategorie.
//  - Eine Buchung wird einer Kategorie zugeordnet; eine Unterkategorie ist
//    optional.

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

// ---- Kategorien (Budget-Einheit) --------------------------------------------

export async function listCategories() {
  const rows = await db.getAll('categories');
  return rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function addCategory({ name }) {
  const cat = {
    id: uid(),
    name: String(name).trim(),
    sortOrder: Date.now(),
    createdAt: new Date().toISOString(),
  };
  return db.put('categories', cat);
}

export async function updateCategory(cat) {
  return db.put('categories', cat);
}

export async function deleteCategory(id) {
  // Unterkategorien der Kategorie entfernen.
  const subs = await db.getAll('subcategories');
  for (const s of subs.filter((s) => s.categoryId === id)) {
    await db.remove('subcategories', s.id);
  }
  // Buchungen behalten, aber Kategorie/Unterkategorie lösen.
  const txns = await db.getAll('transactions');
  for (const t of txns.filter((t) => t.categoryId === id)) {
    await db.put('transactions', { ...t, categoryId: null, subcategoryId: null });
  }
  const recs = await db.getAll('recurring');
  for (const r of recs.filter((r) => r.categoryId === id)) {
    await db.put('recurring', { ...r, categoryId: null, subcategoryId: null });
  }
  const budgets = await db.getAll('budgets');
  for (const b of budgets.filter((b) => b.categoryId === id)) {
    await db.remove('budgets', b.id);
  }
  return db.remove('categories', id);
}

// ---- Unterkategorien (optional) ---------------------------------------------

export async function listSubcategories() {
  const rows = await db.getAll('subcategories');
  return rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function addSubcategory({ categoryId, name }) {
  const sub = {
    id: uid(),
    categoryId,
    name: String(name).trim(),
    sortOrder: Date.now(),
    createdAt: new Date().toISOString(),
  };
  return db.put('subcategories', sub);
}

export async function updateSubcategory(sub) {
  return db.put('subcategories', sub);
}

export async function deleteSubcategory(id) {
  const txns = await db.getAll('transactions');
  for (const t of txns.filter((t) => t.subcategoryId === id)) {
    await db.put('transactions', { ...t, subcategoryId: null });
  }
  const recs = await db.getAll('recurring');
  for (const r of recs.filter((r) => r.subcategoryId === id)) {
    await db.put('recurring', { ...r, subcategoryId: null });
  }
  return db.remove('subcategories', id);
}

/** Kategorien mit ihren Unterkategorien: [{ ...cat, subs:[...] }]. */
export async function listCategoriesWithSubs() {
  const [cats, subs] = await Promise.all([listCategories(), listSubcategories()]);
  return cats.map((c) => ({
    ...c,
    subs: subs.filter((s) => s.categoryId === c.id),
  }));
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
  subcategoryId = null,
  amount,
  note = '',
}) {
  const t = {
    id: uid(),
    accountId,
    date,
    payee: String(payee).trim(),
    categoryId: categoryId || null,
    subcategoryId: subcategoryId || null,
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

// ---- Budget (Umschlag-Logik, pro Kategorie) ---------------------------------

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
 * Budget-Übersicht für einen Monat (pro Kategorie): budgeted, activity,
 * available (rollierend) und "Verfügbar zum Zuweisen".
 */
export async function computeBudget(month) {
  const [accounts, categories, transactions, budgets] = await Promise.all([
    db.getAll('accounts'),
    listCategories(),
    db.getAll('transactions'),
    db.getAll('budgets'),
  ]);

  const onBudgetIds = new Set(accounts.filter((a) => a.onBudget).map((a) => a.id));

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

  const months = new Set([month]);
  for (const b of budgets) if (b.month <= month) months.add(b.month);
  for (const t of transactions) {
    const m = (t.date || '').slice(0, 7);
    if (m && m <= month) months.add(m);
  }
  const sortedMonths = [...months].sort();

  const rows = categories.map((cat) => {
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

  // "Verfügbar zum Zuweisen" = alle kategorielosen Beträge (Einnahmen wie
  // Gehalt erhöhen ihn, kategorielose Fixkosten/Ausgaben mindern ihn) abzüglich
  // dessen, was bereits auf Kategorien aufgeteilt wurde.
  let unassignedToDate = 0;
  for (const t of transactions) {
    const m = (t.date || '').slice(0, 7);
    if (m && m <= month && !t.categoryId && onBudgetIds.has(t.accountId)) {
      unassignedToDate += t.amount || 0;
    }
  }
  let budgetedToDate = 0;
  for (const b of budgets) if (b.month <= month) budgetedToDate += b.budgeted || 0;

  const toAssign = unassignedToDate - budgetedToDate;

  const totals = {
    budgeted: rows.reduce((s, r) => s + r.budgeted, 0),
    activity: rows.reduce((s, r) => s + r.activity, 0),
    available: rows.reduce((s, r) => s + r.available, 0),
  };

  return { month, rows, toAssign, totals };
}

// ---- Fixkosten / wiederkehrende Buchungen -----------------------------------

export const INTERVALS = {
  monthly: { label: 'Monatlich', months: 1 },
  quarterly: { label: 'Vierteljährlich', months: 3 },
  halfyearly: { label: 'Halbjährlich', months: 6 },
  yearly: { label: 'Jährlich', months: 12 },
};

export function intervalMonths(interval) {
  return (INTERVALS[interval] || INTERVALS.monthly).months;
}

/** Auf den Monat heruntergerechneter Betrag (in Cent). */
export function monthlyCents(rec) {
  return Math.round(Math.abs(rec.amount || 0) / intervalMonths(rec.interval || 'monthly'));
}

export async function listRecurring() {
  const rows = await db.getAll('recurring');
  return rows.sort(
    (a, b) => (a.dayOfMonth ?? 1) - (b.dayOfMonth ?? 1) || (a.name || '').localeCompare(b.name || '')
  );
}

export async function addRecurring({
  name,
  type = 'expense',
  amount,
  interval = 'monthly',
  accountId,
  dayOfMonth = 1,
}) {
  // Fixkosten und Einnahmen sind bewusst kategorielos: Einnahmen erhöhen den
  // im Aufteilungs-Tab verteilbaren Betrag, Fixkosten mindern ihn.
  const rec = {
    id: uid(),
    name: String(name).trim(),
    type,
    amount: Math.abs(amount | 0),
    interval: INTERVALS[interval] ? interval : 'monthly',
    categoryId: null,
    subcategoryId: null,
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
 * Einmalige, idempotente Anpassung an das neue Modell: Fixkosten und
 * Einnahmen sind jetzt kategorielos. Entfernt daher die Kategorie von
 * vorhandenen Fixkosten-Regeln und von den automatisch daraus erzeugten
 * Buchungen, damit "Verfügbar zum Zuweisen" korrekt (Einnahmen − Fixkosten)
 * rechnet. Manuell erfasste Buchungen bleiben unberührt.
 */
export async function normalizeRecurringUncategorized() {
  const recs = await db.getAll('recurring');
  for (const r of recs) {
    if (r.categoryId || r.subcategoryId) {
      await db.put('recurring', { ...r, categoryId: null, subcategoryId: null });
    }
  }
  const txns = await db.getAll('transactions');
  const isAutoFixkosten = (note) =>
    typeof note === 'string' &&
    (note.startsWith('Automatische Fixkosten') || note.startsWith('Fixkosten anteilig'));
  for (const t of txns) {
    if (t.categoryId && isAutoFixkosten(t.note)) {
      await db.put('transactions', { ...t, categoryId: null, subcategoryId: null });
    }
  }
}

export async function postDueRecurring() {
  const recs = await db.getAll('recurring');
  const curMonth = currentMonth();
  const curDay = Number(todayISO().slice(8, 10));
  let created = 0;

  for (const rec of recs) {
    if (!rec.active) continue;
    let month = rec.lastPosted ? shiftMonth(rec.lastPosted, 1) : rec.startMonth || curMonth;
    let changed = false;

    let guard = 0;
    while (month <= curMonth && guard++ < 600) {
      const isCurrent = month === curMonth;
      if (isCurrent && curDay < rec.dayOfMonth) break;

      const day = String(Math.min(28, rec.dayOfMonth)).padStart(2, '0');
      const perMonth = monthlyCents(rec);
      const label = (INTERVALS[rec.interval] || INTERVALS.monthly).label.toLowerCase();
      await addTransaction({
        accountId: rec.accountId,
        date: `${month}-${day}`,
        payee: rec.name,
        categoryId: null,
        subcategoryId: null,
        amount: rec.type === 'income' ? perMonth : -perMonth,
        note:
          rec.interval && rec.interval !== 'monthly'
            ? `Fixkosten anteilig (${label})`
            : 'Automatische Fixkosten-Buchung',
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

// ---- Migration alter Daten --------------------------------------------------
//
// Frühere Versionen speicherten Kategorien flach mit einem "group"-Feld
// (group = Kategorie, category = Unterkategorie). Diese Funktion wandelt das
// einmalig in das neue Modell (Kategorie + optionale Unterkategorie) um.

export async function migrateModel() {
  const cats = await db.getAll('categories');
  const needs = cats.some((c) => c && Object.prototype.hasOwnProperty.call(c, 'group'));
  if (!needs) return false;

  const oldLeaves = cats;
  const [oldTx, oldBudgets, oldRecurring] = await Promise.all([
    db.getAll('transactions'),
    db.getAll('budgets'),
    db.getAll('recurring'),
  ]);

  // Kategorien (oben) aus den vorkommenden Gruppen bilden – Reihenfolge erhalten.
  const groupNames = [];
  for (const l of oldLeaves) {
    const g = l.group || 'Allgemein';
    if (!groupNames.includes(g)) groupNames.push(g);
  }
  const topByGroup = new Map();
  const now = new Date().toISOString();
  const topCats = groupNames.map((g, i) => {
    const id = uid();
    topByGroup.set(g, id);
    return { id, name: g, sortOrder: i, createdAt: now, updatedAt: now };
  });

  // Alte Blatt-Kategorien werden Unterkategorien (ID bleibt erhalten).
  const subs = oldLeaves.map((l, i) => ({
    id: l.id,
    categoryId: topByGroup.get(l.group || 'Allgemein'),
    name: l.name,
    sortOrder: l.sortOrder ?? i,
    createdAt: l.createdAt || now,
    updatedAt: now,
  }));
  const leafToTop = new Map(oldLeaves.map((l) => [l.id, topByGroup.get(l.group || 'Allgemein')]));

  // Kategorien-Store neu aufbauen.
  await db.clearStore('categories');
  for (const c of topCats) await db.putRaw('categories', c);
  for (const s of subs) await db.putRaw('subcategories', s);

  // Buchungen umschreiben: alte categoryId (Blatt) -> categoryId (oben) + subcategoryId.
  for (const t of oldTx) {
    if (t.categoryId && leafToTop.has(t.categoryId)) {
      await db.putRaw('transactions', {
        ...t,
        categoryId: leafToTop.get(t.categoryId),
        subcategoryId: t.categoryId,
      });
    } else if (t.subcategoryId === undefined) {
      await db.putRaw('transactions', { ...t, subcategoryId: null });
    }
  }

  // Fixkosten umschreiben.
  for (const r of oldRecurring) {
    if (r.categoryId && leafToTop.has(r.categoryId)) {
      await db.putRaw('recurring', {
        ...r,
        categoryId: leafToTop.get(r.categoryId),
        subcategoryId: r.categoryId,
      });
    } else if (r.subcategoryId === undefined) {
      await db.putRaw('recurring', { ...r, subcategoryId: null });
    }
  }

  // Budgets auf Kategorie-Ebene zusammenfassen.
  const agg = new Map();
  for (const b of oldBudgets) {
    const top = leafToTop.get(b.categoryId);
    if (!top) continue;
    const key = `${b.month}:${top}`;
    agg.set(key, (agg.get(key) || 0) + (b.budgeted || 0));
  }
  await db.clearStore('budgets');
  for (const [key, cents] of agg) {
    const [month, topId] = key.split(':');
    await db.putRaw('budgets', { id: key, month, categoryId: topId, budgeted: cents });
  }

  return true;
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
    { name: 'Fixkosten', subs: ['Miete', 'Strom', 'Internet & Handy', 'Versicherungen'] },
    { name: 'Alltag', subs: ['Lebensmittel', 'Restaurant', 'Mobilität', 'Freizeit'] },
    { name: 'Sparziele', subs: ['Notgroschen', 'Urlaub'] },
  ];
  for (const d of defaults) {
    const cat = await addCategory({ name: d.name });
    for (const s of d.subs) await addSubcategory({ categoryId: cat.id, name: s });
  }
  return true;
}

export { currentMonth };
