// Local-first Datenspeicher auf Basis von IndexedDB.
// Alle Daten bleiben ausschließlich auf dem Gerät des Nutzers.
//
// Objektspeicher (Tabellen):
//   accounts      { id, name, type, onBudget, sortOrder, createdAt }
//   categories    { id, name, group, sortOrder, createdAt }
//   transactions  { id, accountId, date, payee, categoryId, amount, note, createdAt }
//   categories    { id, name, sortOrder, createdAt }            (Budget-Einheit)
//   subcategories { id, categoryId, name, sortOrder, createdAt } (optional)
//   budgets       { id: "YYYY-MM:categoryId", month, categoryId, budgeted }
//   recurring     { id, name, type, amount, interval, categoryId, subcategoryId,
//                   accountId, dayOfMonth, active, startMonth, lastPosted, createdAt }
//
// Beträge (amount, budgeted) sind ganze Cent (Integer).

const DB_NAME = 'finanzuebersicht';
const DB_VERSION = 3;

// Alle Objektspeicher (für Backup, Merge, Reset).
const STORES = ['accounts', 'categories', 'subcategories', 'transactions', 'budgets', 'recurring'];

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
      if (!db.objectStoreNames.contains('subcategories')) {
        const s = db.createObjectStore('subcategories', { keyPath: 'id' });
        s.createIndex('by_category', 'categoryId');
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
  // Jede Änderung bekommt einen "zuletzt geändert"-Zeitstempel,
  // damit beim Zusammenführen (Merge) die neuere Version gewinnt.
  const v = { ...value, updatedAt: new Date().toISOString() };
  const os = await tx(store, 'readwrite');
  await reqToPromise(os.put(v));
  return v;
}

/** Schreibt den Datensatz unverändert (ohne Zeitstempel zu erneuern). */
export async function putRaw(store, value) {
  const os = await tx(store, 'readwrite');
  await reqToPromise(os.put(value));
  return value;
}

export async function remove(store, id) {
  const os = await tx(store, 'readwrite');
  return reqToPromise(os.delete(id));
}

/** Einen einzelnen Objektspeicher leeren. */
export async function clearStore(name) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(name, 'readwrite').objectStore(name).clear();
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

export async function clearAll() {
  for (const name of STORES) await clearStore(name);
}

/** Kompletten Datenbestand als einfaches Objekt exportieren (für Backups). */
export async function exportAll() {
  const data = {};
  for (const name of STORES) data[name] = await getAll(name);
  return {
    app: 'finanzuebersicht',
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

/** Backup einspielen (ersetzt den gesamten Bestand). */
export async function importAll(payload) {
  const data = payload && payload.data ? payload.data : {};
  await clearAll();
  for (const store of STORES) {
    const rows = Array.isArray(data[store]) ? data[store] : [];
    for (const row of rows) {
      await put(store, row);
    }
  }
}

/**
 * Daten von einem anderen Gerät ZUSAMMENFÜHREN (Merge), statt zu ersetzen.
 * - Fehlende Einträge (neue ID) werden ergänzt.
 * - Bei gleicher ID gewinnt die neuere Version (updatedAt bzw. createdAt).
 * - Nichts wird gelöscht (reines Zusammenführen überträgt keine Löschungen).
 * Liefert eine kleine Statistik { added, updated }.
 */
export async function mergeImport(payload) {
  const data = payload && payload.data ? payload.data : {};
  const stats = { added: 0, updated: 0 };

  for (const store of STORES) {
    const rows = Array.isArray(data[store]) ? data[store] : [];
    if (rows.length === 0) continue;
    const localRows = await getAll(store);
    const localById = new Map(localRows.map((r) => [r.id, r]));

    for (const row of rows) {
      if (!row || row.id == null) continue;
      const local = localById.get(row.id);
      if (!local) {
        await putRaw(store, row);
        stats.added++;
      } else {
        const incomingTs = row.updatedAt || row.createdAt || '';
        const localTs = local.updatedAt || local.createdAt || '';
        if (incomingTs > localTs) {
          await putRaw(store, row);
          stats.updated++;
        }
      }
    }
  }
  return stats;
}
