// "Mehr"-Ansicht: Datensicherung, Import, Zurücksetzen, Infos.

import { exportAll, importAll, mergeImport, clearAll } from '../db.js';
import { seedIfEmpty } from '../store.js';
import { toast, confirmDialog } from '../ui.js';
import { todayISO } from '../format.js';
import { icon } from '../icons.js';

export async function renderMore(ctx) {
  ctx.setHeader({ title: 'Mehr' });

  ctx.view.innerHTML = `
    <div class="settings">
      <div class="settings-group">
        <div class="settings-group__title">Fixkosten</div>
        <p class="settings-note">Miete, Strom, Abos & Co. einmal festlegen – die App bucht sie jeden Monat automatisch (anteilig).</p>
        <button class="btn btn--block" id="btn-recurring">Fixkosten verwalten</button>
      </div>

      <div class="settings-group">
        <div class="settings-group__title">Deine Daten</div>
        <p class="settings-note">
          Alle Daten liegen ausschließlich lokal auf diesem Gerät
          (privat, offline). Erstelle regelmäßig eine Sicherung.
        </p>
        <button class="btn btn--block" id="btn-export">${icon.download} Sicherung exportieren</button>
        <button class="btn btn--block btn--ghost" id="btn-import">${icon.upload} Sicherung importieren (ersetzen)</button>
        <input type="file" id="import-file" accept="application/json" hidden />
      </div>

      <div class="settings-group">
        <div class="settings-group__title">Zwei Geräte abgleichen</div>
        <p class="settings-note">
          Zusammenführen statt ersetzen: Exportiere auf dem anderen Handy eine
          Sicherung und importiere sie hier. Die App ergänzt nur fehlende
          Einträge – nichts wird überschrieben. Für einen echten Abgleich in
          beide Richtungen auf beiden Geräten durchführen.
        </p>
        <button class="btn btn--block" id="btn-merge">${icon.upload} Daten zusammenführen</button>
        <input type="file" id="merge-file" accept="application/json" hidden />
        <p class="settings-note" style="margin-top:8px">
          Hinweis: Beim Zusammenführen werden Löschungen nicht übertragen –
          gelöschte Einträge des anderen Geräts können dabei wieder auftauchen.
        </p>
      </div>

      <div class="settings-group">
        <div class="settings-group__title">Zurücksetzen</div>
        <button class="btn btn--block btn--danger" id="btn-reset">Alle Daten löschen</button>
      </div>

      <div class="settings-group settings-group--privacy">
        <div class="settings-group__title">Datenschutz</div>
        <p class="settings-note">
          <strong>Deine Finanzdaten verlassen niemals dein Gerät.</strong>
          Sie werden ausschließlich lokal auf diesem Handy gespeichert –
          es gibt keinen Server, kein Konto, keine Cloud.
        </p>
        <ul class="privacy-list">
          <li>Es wird nichts hochgeladen oder an Dritte gesendet.</li>
          <li>Keine Werbung, keine Tracker, keine Analyse.</li>
          <li>Nur du kannst deine Daten sehen.</li>
        </ul>
        <p class="settings-note">
          Weil alles nur lokal liegt: Wenn du den Browser-Speicher löschst
          oder das Gerät wechselst, sind die Daten weg. Nutze deshalb
          regelmäßig „Sicherung exportieren" (die Datei bleibt bei dir).
        </p>
      </div>

      <div class="settings-group">
        <div class="settings-group__title">Über die App</div>
        <p class="settings-note">
          <strong>Finanzübersicht</strong> – eine schlanke, private Budget-App
          mit Umschlag-Prinzip, inspiriert von Actual Budget.
          Läuft komplett im Browser, auch offline.
        </p>
      </div>
    </div>`;

  // Fixkosten verwalten.
  ctx.view.querySelector('#btn-recurring').addEventListener('click', () => ctx.navigate('recurring'));

  // Export als JSON-Datei herunterladen.
  ctx.view.querySelector('#btn-export').addEventListener('click', async () => {
    const payload = await exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finanzuebersicht-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Sicherung heruntergeladen');
  });

  // Import.
  const fileInput = ctx.view.querySelector('#import-file');
  ctx.view.querySelector('#btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const ok = await confirmDialog(
        'Sicherung importieren?',
        'Der aktuelle Datenbestand wird dabei vollständig ersetzt.'
      );
      if (!ok) return;
      await importAll(payload);
      toast('Sicherung importiert');
      ctx.navigate('budget');
    } catch (e) {
      console.error(e);
      toast('Datei konnte nicht gelesen werden');
    } finally {
      fileInput.value = '';
    }
  });

  // Zwei Geräte zusammenführen (Merge).
  const mergeInput = ctx.view.querySelector('#merge-file');
  ctx.view.querySelector('#btn-merge').addEventListener('click', () => mergeInput.click());
  mergeInput.addEventListener('change', async () => {
    const file = mergeInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload || !payload.data) {
        toast('Das ist keine gültige Sicherungsdatei');
        return;
      }
      const stats = await mergeImport(payload);
      const parts = [];
      if (stats.added) parts.push(`${stats.added} neu`);
      if (stats.updated) parts.push(`${stats.updated} aktualisiert`);
      toast(parts.length ? `Zusammengeführt: ${parts.join(', ')}` : 'Alles bereits aktuell');
      ctx.navigate('budget');
    } catch (e) {
      console.error(e);
      toast('Datei konnte nicht gelesen werden');
    } finally {
      mergeInput.value = '';
    }
  });

  // Alles löschen.
  ctx.view.querySelector('#btn-reset').addEventListener('click', async () => {
    const ok = await confirmDialog(
      'Wirklich alles löschen?',
      'Konten, Buchungen und Budgets werden unwiderruflich entfernt und durch Beispieldaten ersetzt.'
    );
    if (!ok) return;
    await clearAll();
    await seedIfEmpty();
    toast('Zurückgesetzt');
    ctx.navigate('budget');
  });
}
