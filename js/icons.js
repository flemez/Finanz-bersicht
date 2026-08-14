// Schlichte, einfarbige Inline-SVG-Icons (keine Emojis).
// Sie erben Farbe (currentColor) und Größe (1em) vom umgebenden Element.

const stroke = (paths) =>
  `<svg class="ico" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const solid = (shapes) =>
  `<svg class="ico" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" stroke="none" aria-hidden="true">${shapes}</svg>`;

export const icon = {
  budget: stroke('<path d="M4 20h16"/><path d="M7 20v-6"/><path d="M12 20V8"/><path d="M17 20v-9"/>'),
  accounts: stroke('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>'),
  transactions: stroke('<path d="M7 3v18"/><path d="M4 7l3-4 3 4"/><path d="M17 21V3"/><path d="M14 17l3 4 3-4"/>'),
  more: solid('<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>'),
  recurring: stroke('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'),
  trash: stroke('<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/><path d="M10 11v6M14 11v6"/>'),
  edit: stroke('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>'),
  up: stroke('<path d="M6 15l6-6 6 6"/>'),
  down: stroke('<path d="M6 9l6 6 6-6"/>'),
  download: stroke('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>'),
  upload: stroke('<path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M4 3h16"/>'),
};
