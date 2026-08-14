// Local-first Datenspeicher auf Basis von IndexedDB.
// Alle Daten bleiben ausschließlich auf dem Gerät des Nutzers.
//
// Objektspeicher (Tabellen):
//   accounts      { id, name, type, onBudget, sortOrder, createdAt }
//   categories    { id, name, group, sortOrder, createdAt }
//   transactions  { id, accountId, date, payee, categoryId, amount, note, createdAt }
//   budgets       { id: "YYYY-MM:categoryId", month, categoryId, budgeted }
//   recurring     { id, name, type, amount, categoryId, accountId, dayOfMonth,
//                   active, startMonth, lastPosted, createdAt }
//
// Beträge (amount, budgeted) sind ganze Cent (Integer).

const DB_NAME = 'finanzuebersicht';
const DB_VERSION = 2;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('accounts')) {
        db.createObjectStore('accounts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('transactions')) {
        const s = db.createObjectStore('transactions', { keyPath: 'id' });
        s.createIndex('by_account', 'accountId');
        s.createIndex('by_date', 'date');
        s.createIndex('by_category', 'categoryId');
      }
      if (!db.objectStoreNames.contains('budgets')) {
        const s = db.createObjectStore('budgets', { keyPath: 'id' });
        s.createIndex('by_month', 'month');
      }
      if (!db.objectStoreNames.contains('recurring')) {
        db.createObjectStore('recurring', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(store) {
  const os = await tx(store);
  return reqToPromise(os.getAll());
}

export async function get(store, id) {
  const os = await tx(store);
  return reqToPromise(os.get(id));
}

export async function put(store, value) {
  const os = await tx(store, 'readwrite');
  await reqToPromise(os.put(value));
  return value;
}

export async function remove(store, id) {
  const os = await tx(store, 'readwrite');
  return reqToPromise(os.delete(id));
}

export async function clearAll() {
  const db = await openDB();
  await Promise.all(
    ['accounts', 'categories', 'transactions', 'budgets', 'recurring'].map(
      (name) =>
        new Promise((resolve, reject) => {
          const r = db.transaction(name, 'readwrite').objectStore(name).clear();
          r.onsuccess = () => resolve();
          r.onerror = () => reject(r.error);
        })
    )
  );
}

/** Kompletten Datenbestand als einfaches Objekt exportieren (für Backups). */
export async function exportAll() {
  const [accounts, categories, transactions, budgets, recurring] = await Promise.all([
    getAll('accounts'),
    getAll('categories'),
    getAll('transactions'),
    getAll('budgets'),
    getAll('recurring'),
  ]);
  return {
    app: 'finanzuebersicht',
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    data: { accounts, categories, transactions, budgets, recurring },
  };
}

/** Backup einspielen (ersetzt den gesamten Bestand). */
export async function importAll(payload) {
  const data = payload && payload.data ? payload.data : {};
  await clearAll();
  const stores = ['accounts', 'categories', 'transactions', 'budgets', 'recurring'];
  for (const store of stores) {
    const rows = Array.isArray(data[store]) ? data[store] : [];
    for (const row of rows) {
      await put(store, row);
    }
  }
}
