// Kategorien-Ansicht (zweistufig): Kategorien und ihre Unterkategorien
// anlegen, umbenennen, verschieben, sortieren und löschen.

import {
  listGroups,
  listCategories,
  addGroup,
  renameGroup,
  deleteGroup,
  addCategory,
  updateCategory,
  deleteCategory,
} from '../store.js';
import { esc } from '../format.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';

export async function renderCategories(ctx) {
  const groups = await listGroups();

  ctx.setHeader({ title: 'Kategorien' });

  let html = '';

  if (groups.length === 0) {
    html += `
      <div class="empty">
        <div class="empty__icon">${icon.budget}</div>
        <p class="empty__title">Noch keine Kategorien</p>
        <p class="empty__text">Lege deine erste Kategorie mit einer Unterkategorie an.</p>
      </div>`;
  } else {
    html += '<div class="budget-list">';
    for (const g of groups) {
      html += `
        <div class="budget-group">
          <div class="budget-group__head">
            <span class="budget-group__name">${esc(g.name)}</span>
            <span class="cat-row__tools">
              <button class="icon-btn" data-addsub="${esc(g.name)}" aria-label="Unterkategorie hinzufügen">+</button>
              <button class="icon-btn" data-editgroup="${esc(g.name)}" aria-label="Kategorie bearbeiten">${icon.edit}</button>
            </span>
          </div>`;
      g.subs.forEach((c, i) => {
        html += `
          <div class="cat-row">
            <span class="cat-row__name">${esc(c.name)}</span>
            <span class="cat-row__tools">
              <button class="icon-btn" data-move="up" data-id="${c.id}" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">${icon.up}</button>
              <button class="icon-btn" data-move="down" data-id="${c.id}" ${i === g.subs.length - 1 ? 'disabled' : ''} aria-label="Nach unten">${icon.down}</button>
              <button class="icon-btn" data-editsub="${c.id}" aria-label="Unterkategorie bearbeiten">${icon.edit}</button>
            </span>
          </div>`;
      });
      html += '</div>';
    }
    html += '</div>';
    html += `<p class="budget-hint">Über das Stift-Symbol kannst du umbenennen, verschieben oder löschen. Mit den Pfeilen sortierst du Unterkategorien.</p>`;
  }

  html += `<button class="btn btn--block btn--primary" id="add-group">+ Neue Kategorie</button>`;

  ctx.view.innerHTML = html;

  const groupNames = groups.map((g) => g.name);
  const allCats = await listCategories();

  ctx.view.querySelector('#add-group').addEventListener('click', () => openGroupCreate(ctx));

  ctx.view.querySelectorAll('[data-addsub]').forEach((btn) => {
    btn.addEventListener('click', () => openSubEditor(ctx, null, btn.dataset.addsub, groupNames));
  });
  ctx.view.querySelectorAll('[data-editgroup]').forEach((btn) => {
    btn.addEventListener('click', () => openGroupEditor(ctx, btn.dataset.editgroup));
  });
  ctx.view.querySelectorAll('[data-editsub]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = allCats.find((c) => c.id === btn.dataset.editsub);
      if (cat) openSubEditor(ctx, cat, cat.group || 'Allgemein', groupNames);
    });
  });
  ctx.view.querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await moveSub(allCats, btn.dataset.id, btn.dataset.move === 'up' ? -1 : 1);
      renderCategories(ctx);
    });
  });
}

async function moveSub(allCats, id, dir) {
  const cat = allCats.find((c) => c.id === id);
  if (!cat) return;
  const group = cat.group || 'Allgemein';
  const inGroup = allCats
    .filter((c) => (c.group || 'Allgemein') === group)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const idx = inGroup.findIndex((c) => c.id === id);
  const target = idx + dir;
  if (target < 0 || target >= inGroup.length) return;
  [inGroup[idx], inGroup[target]] = [inGroup[target], inGroup[idx]];
  for (let i = 0; i < inGroup.length; i++) {
    if (inGroup[i].sortOrder !== i) await updateCategory({ ...inGroup[i], sortOrder: i });
  }
}

// ---- Kategorie (Gruppe) -----------------------------------------------------

function openGroupCreate(ctx) {
  const m = openModal(
    'Neue Kategorie',
    `<label class="field">
       <span class="field__label">Name der Kategorie</span>
       <input class="field__input" name="group" placeholder="z. B. Wohnen" required />
     </label>
     <label class="field">
       <span class="field__label">Erste Unterkategorie</span>
       <input class="field__input" name="sub" placeholder="z. B. Miete" required />
       <span class="field__hint">Jede Kategorie hat mindestens eine Unterkategorie. Weitere kannst du danach hinzufügen.</span>
     </label>`,
    [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: 'Anlegen', value: 'ok', variant: 'primary' },
    ]
  );
  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    if (!data.group || !data.group.trim()) return toast('Bitte einen Kategorie-Namen eingeben');
    if (!data.sub || !data.sub.trim()) return toast('Bitte eine Unterkategorie eingeben');
    await addGroup(data.group, data.sub);
    close();
    toast('Kategorie angelegt');
    renderCategories(ctx);
  });
}

function openGroupEditor(ctx, name) {
  const m = openModal(
    'Kategorie bearbeiten',
    `<label class="field">
       <span class="field__label">Name der Kategorie</span>
       <input class="field__input" name="group" value="${esc(name)}" required />
     </label>
     <button type="button" class="btn btn--block btn--danger" data-action="delete">Kategorie inkl. Unterkategorien löschen</button>`,
    [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: 'Speichern', value: 'ok', variant: 'primary' },
    ]
  );
  m.el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    const ok = await confirmDialog(
      'Kategorie löschen?',
      'Die Kategorie und alle ihre Unterkategorien werden entfernt. Erfasste Buchungen bleiben erhalten, verlieren aber ihre Kategorie.'
    );
    if (!ok) return;
    await deleteGroup(name);
    m.close();
    toast('Kategorie gelöscht');
    renderCategories(ctx);
  });
  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    if (!data.group || !data.group.trim()) return toast('Bitte einen Namen eingeben');
    await renameGroup(name, data.group.trim());
    close();
    toast('Kategorie gespeichert');
    renderCategories(ctx);
  });
}

// ---- Unterkategorie ---------------------------------------------------------

function openSubEditor(ctx, existing, groupName, groupNames) {
  const isEdit = !!existing;
  const c = existing || {};
  const datalist = groupNames.map((g) => `<option value="${esc(g)}"></option>`).join('');
  const curGroup = isEdit ? (c.group || 'Allgemein') : groupName;

  const m = openModal(
    isEdit ? 'Unterkategorie bearbeiten' : 'Neue Unterkategorie',
    `<label class="field">
       <span class="field__label">Name</span>
       <input class="field__input" name="name" value="${esc(c.name || '')}" placeholder="z. B. Lebensmittel" required />
     </label>
     <label class="field">
       <span class="field__label">Gehört zur Kategorie</span>
       <input class="field__input" name="group" list="grp-list" value="${esc(curGroup)}" />
       <datalist id="grp-list">${datalist}</datalist>
       <span class="field__hint">Tippe einen anderen Kategorie-Namen, um die Unterkategorie zu verschieben.</span>
     </label>
     ${isEdit ? `<button type="button" class="btn btn--block btn--danger" data-action="delete">Unterkategorie löschen</button>` : ''}`,
    [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: isEdit ? 'Speichern' : 'Anlegen', value: 'ok', variant: 'primary' },
    ]
  );

  if (isEdit) {
    m.el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      const ok = await confirmDialog(
        'Unterkategorie löschen?',
        'Erfasste Buchungen bleiben erhalten, verlieren aber diese Unterkategorie.'
      );
      if (!ok) return;
      await deleteCategory(existing.id);
      m.close();
      toast('Unterkategorie gelöscht');
      renderCategories(ctx);
    });
  }

  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    if (!data.name || !data.name.trim()) return toast('Bitte einen Namen eingeben');
    const group = (data.group || '').trim() || 'Allgemein';
    if (isEdit) {
      await updateCategory({ ...existing, name: data.name.trim(), group });
      toast('Unterkategorie gespeichert');
    } else {
      await addCategory({ name: data.name.trim(), group });
      toast('Unterkategorie angelegt');
    }
    close();
    renderCategories(ctx);
  });
}
