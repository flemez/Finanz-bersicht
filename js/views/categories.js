// Kategorien-Ansicht: Kategorien (Budget-Einheit) anlegen/verwalten und
// optionale Unterkategorien darunter. Bewusst einfach gehalten.

import {
  listCategories,
  listCategoriesWithSubs,
  addCategory,
  updateCategory,
  deleteCategory,
  listSubcategories,
  addSubcategory,
  updateSubcategory,
  deleteSubcategory,
} from '../store.js';
import { esc } from '../format.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { attachSwipe, closeOpenSwipe } from '../swipe.js';

export async function renderCategories(ctx) {
  closeOpenSwipe(); // etwaige offene Wisch-Zeile aus vorherigem Render zurücksetzen
  const cats = await listCategoriesWithSubs();

  ctx.setHeader({ title: 'Kategorien', back: () => ctx.navigate('more') });

  let html = '';

  if (cats.length === 0) {
    html += `
      <div class="empty">
        <div class="empty__icon">${icon.budget}</div>
        <p class="empty__title">Noch keine Kategorien</p>
        <p class="empty__text">Lege deine erste Kategorie an – ein Name genügt.</p>
      </div>`;
  } else {
    html += '<div class="budget-list">';
    cats.forEach((c, ci) => {
      html += `
        <div class="budget-group">
          <div class="swipe" data-swipe-cat="${c.id}">
            <div class="swipe__delete">
              <button class="swipe__delete-btn" data-delcat="${c.id}" aria-label="Kategorie „${esc(c.name)}" löschen">Löschen</button>
            </div>
            <div class="swipe__content budget-group__head">
              <span class="budget-group__name">${esc(c.name)}</span>
              <span class="cat-row__tools">
                <button class="icon-btn" data-catmove="up" data-id="${c.id}" ${ci === 0 ? 'disabled' : ''} aria-label="Kategorie nach oben">${icon.up}</button>
                <button class="icon-btn" data-catmove="down" data-id="${c.id}" ${ci === cats.length - 1 ? 'disabled' : ''} aria-label="Kategorie nach unten">${icon.down}</button>
                <button class="icon-btn" data-addsub="${c.id}" aria-label="Unterkategorie hinzufügen">+</button>
                <button class="icon-btn" data-editcat="${c.id}" aria-label="Kategorie bearbeiten">${icon.edit}</button>
              </span>
            </div>
          </div>`;
      if (c.subs.length === 0) {
        html += `<div class="cat-row cat-row--empty"><span class="cat-row__hint">Keine Unterkategorien (optional)</span></div>`;
      }
      c.subs.forEach((s, i) => {
        html += `
          <div class="swipe" data-swipe-sub="${s.id}">
            <div class="swipe__delete">
              <button class="swipe__delete-btn" data-delsub="${s.id}" aria-label="Unterkategorie „${esc(s.name)}" löschen">Löschen</button>
            </div>
            <div class="swipe__content cat-row">
              <span class="cat-row__name">${esc(s.name)}</span>
              <span class="cat-row__tools">
                <button class="icon-btn" data-submove="up" data-id="${s.id}" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">${icon.up}</button>
                <button class="icon-btn" data-submove="down" data-id="${s.id}" ${i === c.subs.length - 1 ? 'disabled' : ''} aria-label="Nach unten">${icon.down}</button>
                <button class="icon-btn" data-editsub="${s.id}" aria-label="Unterkategorie bearbeiten">${icon.edit}</button>
              </span>
            </div>
          </div>`;
      });
      html += '</div>';
    });
    html += '</div>';
    html += `<p class="budget-hint">Über „+" fügst du eine optionale Unterkategorie hinzu, mit dem Stift benennst du um, mit den Pfeilen sortierst du. Zum Löschen die Zeile nach links wischen.</p>`;
  }

  html += `<button class="btn btn--block btn--primary" id="add-cat">+ Neue Kategorie</button>`;

  ctx.view.innerHTML = html;

  const allCats = await listCategories();
  const allSubs = await listSubcategories();

  ctx.view.querySelector('#add-cat').addEventListener('click', () => openCategoryEditor(ctx, null));

  // Swipe-to-Delete für Kategorien und Unterkategorien.
  ctx.view.querySelectorAll('[data-swipe-cat]').forEach((el) => {
    const c = allCats.find((x) => x.id === el.dataset.swipeCat);
    attachSwipe(el, () => confirmDeleteCategory(ctx, c));
  });
  ctx.view.querySelectorAll('[data-swipe-sub]').forEach((el) => {
    const s = allSubs.find((x) => x.id === el.dataset.swipeSub);
    attachSwipe(el, () => confirmDeleteSubcategory(ctx, s));
  });
  ctx.view.querySelectorAll('[data-editcat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = allCats.find((x) => x.id === btn.dataset.editcat);
      if (c) openCategoryEditor(ctx, c);
    });
  });
  ctx.view.querySelectorAll('[data-addsub]').forEach((btn) => {
    btn.addEventListener('click', () => openSubEditor(ctx, null, btn.dataset.addsub, allCats));
  });
  ctx.view.querySelectorAll('[data-editsub]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = allSubs.find((x) => x.id === btn.dataset.editsub);
      if (s) openSubEditor(ctx, s, s.categoryId, allCats);
    });
  });
  ctx.view.querySelectorAll('[data-catmove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await reorder(allCats, btn.dataset.id, btn.dataset.catmove === 'up' ? -1 : 1, updateCategory);
      renderCategories(ctx);
    });
  });
  ctx.view.querySelectorAll('[data-submove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sub = allSubs.find((x) => x.id === btn.dataset.id);
      const siblings = allSubs.filter((x) => x.categoryId === sub.categoryId);
      await reorder(siblings, btn.dataset.id, btn.dataset.submove === 'up' ? -1 : 1, updateSubcategory);
      renderCategories(ctx);
    });
  });
}

/** Element in einer sortierten Liste eine Position verschieben. */
async function reorder(list, id, dir, saveFn) {
  const sorted = [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const idx = sorted.findIndex((x) => x.id === id);
  const target = idx + dir;
  if (target < 0 || target >= sorted.length) return;
  [sorted[idx], sorted[target]] = [sorted[target], sorted[idx]];
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].sortOrder !== i) await saveFn({ ...sorted[i], sortOrder: i });
  }
}

// ---- Löschen (per Wisch-Geste) ---------------------------------------------

/** Nachfrage stellen und Kategorie löschen. */
async function confirmDeleteCategory(ctx, c) {
  if (!c) return;
  const ok = await confirmDialog(
    `„${c.name}" löschen?`,
    'Die Kategorie und ihre Unterkategorien werden entfernt. Erfasste Buchungen bleiben erhalten, verlieren aber ihre Kategorie.'
  );
  if (!ok) {
    closeOpenSwipe();
    return;
  }
  await deleteCategory(c.id);
  toast('Kategorie gelöscht');
  renderCategories(ctx);
}

/** Nachfrage stellen und Unterkategorie löschen. */
async function confirmDeleteSubcategory(ctx, s) {
  if (!s) return;
  const ok = await confirmDialog(
    `„${s.name}" löschen?`,
    'Erfasste Buchungen bleiben erhalten, verlieren aber diese Unterkategorie.'
  );
  if (!ok) {
    closeOpenSwipe();
    return;
  }
  await deleteSubcategory(s.id);
  toast('Unterkategorie gelöscht');
  renderCategories(ctx);
}

// ---- Kategorie --------------------------------------------------------------

function openCategoryEditor(ctx, existing) {
  const isEdit = !!existing;
  const c = existing || {};
  const m = openModal(
    isEdit ? 'Kategorie bearbeiten' : 'Neue Kategorie',
    `<label class="field">
       <span class="field__label">Name der Kategorie</span>
       <input class="field__input" name="name" value="${esc(c.name || '')}" placeholder="z. B. Wohnen" required />
     </label>
     ${isEdit ? `<button type="button" class="btn btn--block btn--danger" data-action="delete">Kategorie löschen</button>` : ''}`,
    [
      { label: 'Abbrechen', value: 'cancel', variant: 'ghost' },
      { label: isEdit ? 'Speichern' : 'Anlegen', value: 'ok', variant: 'primary' },
    ]
  );
  if (isEdit) {
    m.el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      const ok = await confirmDialog(
        'Kategorie löschen?',
        'Die Kategorie und ihre Unterkategorien werden entfernt. Erfasste Buchungen bleiben erhalten, verlieren aber ihre Kategorie.'
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
    if (isEdit) {
      await updateCategory({ ...existing, name: data.name.trim() });
      toast('Kategorie gespeichert');
    } else {
      await addCategory({ name: data.name.trim() });
      toast('Kategorie angelegt');
    }
    close();
    renderCategories(ctx);
  });
}

// ---- Unterkategorie ---------------------------------------------------------

function openSubEditor(ctx, existing, categoryId, allCats) {
  const isEdit = !!existing;
  const s = existing || {};
  const catOptions = allCats
    .map((c) => `<option value="${c.id}"${c.id === categoryId ? ' selected' : ''}>${esc(c.name)}</option>`)
    .join('');

  const m = openModal(
    isEdit ? 'Unterkategorie bearbeiten' : 'Neue Unterkategorie',
    `<label class="field">
       <span class="field__label">Name</span>
       <input class="field__input" name="name" value="${esc(s.name || '')}" placeholder="z. B. Lebensmittel" required />
     </label>
     <label class="field">
       <span class="field__label">Gehört zur Kategorie</span>
       <select class="field__input" name="categoryId">${catOptions}</select>
       <span class="field__hint">Wähle eine andere Kategorie, um die Unterkategorie zu verschieben.</span>
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
      await deleteSubcategory(existing.id);
      m.close();
      toast('Unterkategorie gelöscht');
      renderCategories(ctx);
    });
  }
  m.onSubmit(async (value, data, close) => {
    if (value !== 'ok') return close();
    if (!data.name || !data.name.trim()) return toast('Bitte einen Namen eingeben');
    if (isEdit) {
      await updateSubcategory({ ...existing, name: data.name.trim(), categoryId: data.categoryId });
      toast('Unterkategorie gespeichert');
    } else {
      await addSubcategory({ categoryId: data.categoryId, name: data.name.trim() });
      toast('Unterkategorie angelegt');
    }
    close();
    renderCategories(ctx);
  });
}
