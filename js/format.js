// Formatierungs- und Kleinhelfer (Deutsch / Euro).

// Beträge werden intern immer als ganze Cent (Integer) gespeichert,
// damit keine Rundungsfehler durch Fließkommazahlen entstehen.

const eur = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

const eurSigned = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  signDisplay: 'always',
});

/** Cent (Integer) -> "1.234,56 €" */
export function formatCents(cents) {
  return eur.format((cents || 0) / 100);
}

/** Wie formatCents, aber mit erzwungenem +/- Vorzeichen. */
export function formatCentsSigned(cents) {
  return eurSigned.format((cents || 0) / 100);
}

/** Nutzer-Eingabe ("12,50", "12.50", "-3") -> Cent (Integer) oder null. */
export function parseAmountToCents(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (s === '') return null;
  // Tausenderpunkte entfernen, Komma zu Punkt.
  s = s.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const monthFmt = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
});

/** ISO "2026-08-14" -> "14.08.2026" */
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return dateFmt.format(d);
}

/** "2026-08" -> "August 2026" */
export function formatMonth(month) {
  const d = new Date(month + '-01T00:00:00');
  return monthFmt.format(d);
}

/** Heutiges Datum als ISO "YYYY-MM-DD" (lokale Zeitzone). */
export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

/** Aktueller Monat als "YYYY-MM". */
export function currentMonth() {
  return todayISO().slice(0, 7);
}

/** Monat verschieben: ("2026-08", -1) -> "2026-07". */
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Einfache eindeutige ID. */
export function uid() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

/** HTML escapen, damit Nutzertexte sicher eingefügt werden können. */
export function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
