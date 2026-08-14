// Kategorien-Verwaltung: umbenennen, in andere Gruppe verschieben,
// innerhalb der Gruppe sortieren und löschen.

import {
  listCategories,
  addCategory,
  updateCategory,
  deleteCategory,
} from '../store.js';
import { esc } from '../format.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';

export async function renderCategories(ctx) {
  const categories = await listCategories();

  ctx.setHeader({
    title: 'Kategorien',
    back: () => ctx.navigate('budget'),
  });

  // Nach Gruppe bündeln (Reihenfolge innerhalb der Gruppe = sortOrder).
  const groups = new Map();
  for (const c of categories) {
    const g = c.group || 'Allgemein';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  }

  let html = '';

  if (categories.length === 0) {
    html += `
      <div class="empty">
        <div class="empty__icon">${icon.budget}</div>
        <p class="empty__title">Noch keine Kategorien</p>
        <p class="empty__text">Lege deine erste Kategorie an.</p>
      </div>`;
  } else {
    html += '<div class="budget-list">';
    for (const [group, cats] of groups) {
      html += `
        <div class="budget-group">
          <div class="budget-group__head">
            <span class="budget-group__name">${esc(group)}</span>
            <span class="budget-group__sum">${cats.length}</span>
          </div>`;
      cats.forEach((c, i) => {
        html += `
          <div class="cat-row">
            <span class="cat-row__name">${esc(c.name)}</span>
            <span class="cat-row__tools">
              <button class="icon-btn" data-move="up" data-id="${c.id}" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">${icon.up}</button>
              <button class="icon-btn" data-move="down" data-id="${c.id}" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="Nach unten">${icon.down}</button>
              <button class="icon-btn" data-edit="${c.id}" aria-label="Bearbeiten">${icon.edit}</button>
            </span>
          </div>`;
      });
      html += '</div>';
    }
    html += '</div>';
    html += `<p class="budget-hint">Mit den Pfeilen sortierst du innerhalb einer Gruppe. Über das Stift-Symbol kannst du umbenennen, die Gruppe wechseln oder löschen.</p>`;
  }

  html += `<button class="btn btn--block btn--ghost" id="add-category">+ Kategorie hinzufügen</button>`;

  ctx.view.innerHTML = html;

  const allGroups = [...groups.keys()];

  ctx.view.querySelector('#add-category').addEventListener('click', () =>
    openCategoryEditor(ctx, null, allGroups)
  );

  ctx.view.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = categories.find((c) => c.id === btn.dataset.edit);
      if (cat) openCategoryEditor(ctx, cat, allGroups);
    });
  });

  ctx.view.querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await moveCategory(categories, btn.dataset.id, btn.dataset.move === 'up' ? -1 : 1);
      renderCategories(ctx);
    });
  });
}

/** Kategorie innerhalb ihrer Gruppe eine Position verschieben. */
async function moveCategory(categories, id, dir) {
  const cat = categories.find((c) => c.id === id);
  if (!cat) return;
  const group = cat.group || 'Allgemein';
  const inGroup = categories
    .filter((c) => (c.group || 'Allgemein') === group)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const idx = inGroup.findIndex((c) => c.id === id);
  const target = idx + dir;
  if (target < 0 || target >= inGroup.length) return;
  // Tauschen und Reihenfolge sauber neu durchnummerieren.
  [inGroup[idx], inGroup[target]] = [inGroup[target], inGroup[idx]];
  for (let i = 0; i < inGroup.length; i++) {
    if (inGroup[i].sortOrder !== i) {
      await updateCategory({ ...inGroup[i], sortOrder: i });
    }
  }
}

function openCategoryEditor(ctx, existing, allGroups) {
  const isEdit = !!existing;
  const c = existing || {};
  const datalist = allGroups
    .map((g) => `<option value="${esc(g)}"></option>`)
    .join('');

  const body = `
    <label class="field">
      <span class="field__label">Name</span>
      <input class="field__input" name="name" value="${esc(c.name || '')}" placeholder="z. B. Lebensmittel" required />
    </label>
    <label class="field">
      <span class="field__label">Gruppe</span>
      <input class="field__input" name="group" list="cat-groups" value="${esc(c.group || 'Allgemein')}" placeholder="z. B. Alltag" />
      <datalist id="cat-groups">${datalist}</datalist>
      <span class="field__hint">Tippe einen bestehenden oder neuen Gruppennamen, um die Kategorie dorthin zu verschieben.</span>
    </label>
    ${isEdit ? `<button type="button" class="btn btn--block btn--danger" data-action="delete">Kategorie löschen</button>` : ''}`;

  const m = openModal(
    isEdit ? 'Kategorie bearbeiten' : 'Neue Kategorie',
    body,
    [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: isEdit ? 'Speichern' : 'Anlegen', value: 'ok', variant: 'primary' },
    ]
  );

  if (isEdit) {
    m.el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      const ok = await confirmDialog(
        'Kategorie löschen?',
        'Die Kategorie wird entfernt. Bereits erfasste Buchungen bleiben erhalten, verlieren aber ihre Kategorie.'
      );
      if (!ok) return;
      await deleteCategory(existing.id);
      m.close();
      toast('Kategorie gelöscht');
      renderCategories(ctx);
    });
  }

  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    if (!data.name || !data.name.trim()) return toast('Bitte einen Namen eingeben');
    const group = (data.group || '').trim() || 'Allgemein';
    if (isEdit) {
      await updateCategory({ ...existing, name: data.name.trim(), group });
      toast('Kategorie gespeichert');
    } else {
      await addCategory({ name: data.name.trim(), group });
      toast('Kategorie angelegt');
    }
    close();
    renderCategories(ctx);
  });
}
