/* EARTH 2049: SAVE SEED 7 — line icons for create-a-class: attachment slots and attachments, perks, lethals, tacticals
 * and scorestreaks. 24 x 24, drawn in currentColor, so a card's colour (locked, equipped, hovered) carries through.
 * PvpIcons.svg(id) returns an <svg> string; unknown ids get a plain diamond.
 */
(function (root) {
  'use strict';
  // each icon: inner SVG markup. f = filled shape (uses currentColor), everything else is a 1.8 px stroke.
  const f = d => `<path d="${d}" fill="currentColor" stroke="none"/>`;
  const p = d => `<path d="${d}"/>`;
  const c = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}"${fill ? ' fill="currentColor" stroke="none"' : ''}/>`;
  const r = (x, y, w, h, rx = 0, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"${fill ? ' fill="currentColor" stroke="none"' : ''}/>`;
  const I = {
    /* attachment slots */
    optic: c(12, 12, 7) + p('M12 2v5M12 17v5M2 12h5M17 12h5') + c(12, 12, 1.3, 1),
    muzzle: r(3, 9, 12, 6, 1) + p('M15 12h6M18 9l3-2M18 15l3 2'),
    barrel: p('M2 12h20') + r(5, 9, 10, 6, 1) + p('M8 9v6M11 9v6'),
    underbarrel: p('M3 7h18') + p('M10 7l-1 13h4l1-13'),
    magazine: p('M8 3h7l-1 9c0 4 1 6 2 9H9c-1-3-1-5-1-9z') + p('M9 8h5'),
    stock: p('M22 9H10L3 6v12l7-3h12z'),
    laser: r(3, 9, 7, 6, 1) + p('M10 12h2M14 12h2M18 12h2') + c(22, 12, .8, 1),
    grip: p('M7 4h9l-2 17H9z') + p('M8 9h7M8 13h6'),
    /* attachments */
    reddot: r(4, 7, 16, 11, 3) + c(12, 12.5, 2, 1) + p('M7 18v2h10v-2'),
    holo: r(3, 6, 18, 12, 1) + c(12, 12, 4) + c(12, 12, .9, 1) + p('M3 18v2h18v-2'),
    zoom2: p('M2 10h3l2-2h10l2 2h3v4h-3l-2 2H7l-2-2H2z') + c(6, 12, 1) + p('M10 8V5h4v3'),
    suppressor: r(2, 9, 14, 6, 3) + p('M16 12h6M6 9v6M10 9v6'),
    comp: r(4, 8, 12, 8, 1) + p('M7 8v3M10 8v3M13 8v3M16 12h5'),
    longbarrel: p('M1 12h22') + r(3, 9.5, 14, 5, 1) + p('M6 9.5v5M9 9.5v5M12 9.5v5M15 9.5v5'),
    shortbarrel: r(7, 9, 9, 6, 1) + p('M16 12h4M10 9v-2M13 9v-2'),
    vgrip: p('M2 6h20') + r(9, 8, 6, 13, 2),
    agrip: p('M2 6h20') + p('M8 8h8l-6 11H5z'),
    extmag: p('M8 2h6l-1 8c0 5 1 8 3 12H8c-1-4-1-7-1-12z') + p('M18 4v6M15 7h6'),
    fastmag: p('M7 4h6l-1 7c0 4 1 6 2 9H7c-1-3-1-5-1-9z') + f('M18 3l-3 7h3l-2 7 5-9h-3l2-5z'),
    lightstock: p('M22 9H12L3 6v12l9-3h10') + p('M12 9v6M3 6l9 9M3 18l9-9'),
    heavystock: f('M22 8H10L3 5v14l7-3h12z'),
    laser_att: r(3, 9, 7, 6, 1) + p('M10 12h12') + c(22, 12, 1, 1),
    tapegrip: p('M7 3h9l-2 18H9z') + p('M7.5 7l8 3M7.3 11l7.8 3M7.6 15l6.9 3'),
    rubbergrip: f('M7 3h9l-2 18H9z') + `<path d="M8.6 7h6.2M8.4 11h6M8.6 15h5.4" stroke="#0b0918"/>`,
    /* perks */
    donottrack: p('M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z') + c(12, 12, 2.5) + p('M4 20L20 4'),
    bubblewrap: c(7, 8, 3.3) + c(16, 7, 3) + c(11, 15.5, 3.5) + c(18.5, 15, 2.5),
    dumpster: p('M3 9h18l-2 11H5z') + p('M2 9l2-4h16l2 4M9 13v4M15 13v4'),
    quickfix: r(9, 3, 6, 18, 1) + r(3, 9, 18, 6, 1),
    bnpl: r(2, 5, 20, 14, 2) + p('M2 10h20M6 15h5'),
    loyalty: f('M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z'),
    sleight: p('M4 13c0-5 3-8 8-8M12 5l-2-2M12 5l-2 2') + p('M20 11c0 5-3 8-8 8M12 19l2 2M12 19l2-2') + p('M9 12h6'),
    termsunread: p('M6 2h9l4 4v16H6z') + p('M15 2v4h4M9 11l6 6M15 11l-6 6'),
    noisecancel: p('M4 15v-3a8 8 0 0116 0v3') + r(3, 14, 4, 7, 1.5) + r(17, 14, 4, 7, 1.5),
    databroker: f('M7 3c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM6 14h3v2.5c0 1-.6 1.5-1.5 1.5S6 17.5 6 16.5z') +
      f('M17 7c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM16 18h3v2.5c0 1-.6 1.5-1.5 1.5S16 21.5 16 20.5z'),
    thickskin: p('M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z') + p('M8 12l3 3 5-6'),
    spotter: c(7, 15, 4) + c(17, 15, 4) + p('M11 15h2M4 12l2-7h3l1 6M20 12l-2-7h-3l-1 6'),
    /* lethals */
    frag: c(12, 14, 7) + p('M10 7V4h4v3M14 4l3-1M9 12h6M9 16h6M12 9v10'),
    sticky: p('M5 14c0-5 3-9 7-9s7 4 7 9c0 3-2 6-4 6-1 0-1-2-3-2s-2 2-3 2c-2 0-4-3-4-6z') + c(10, 11, 1, 1) + c(14, 12, 1, 1),
    popup: r(3, 14, 18, 5, 2) + p('M8 14v-3h8v3M12 11V7M9 5l3 2 3-2'),
    knife: p('M3 21l6-6M9 15l2 2M11 17L21 4c-5 1-10 5-12 9z'),
    /* tacticals */
    notify: p('M6 17V11a6 6 0 0112 0v6l2 2H4z') + p('M10 21h4') + c(18, 5, 3, 1),
    vape: p('M6 18a4 4 0 010-8 5 5 0 019.5-1.5A4.5 4.5 0 1118 18z'),
    stun: f('M13 2L4 14h6l-2 8 10-13h-6z'),
    cookie: c(12, 12, 9) + c(9, 9, 1.2, 1) + c(15, 10, 1.2, 1) + c(10, 15, 1.2, 1) + c(15.5, 15, 1, 1),
    /* scorestreaks */
    ping: c(12, 12, 9) + c(12, 12, 5) + p('M12 12l6-6') + c(16, 9, 1.4, 1),
    downtime: c(12, 12, 9) + p('M12 7v5l3 2M4 4l16 16'),
    dronedrop: p('M4 9a8 6 0 0116 0z') + p('M4 9l6 6M20 9l-6 6') + r(9, 14, 6, 6, 1),
    broadcaster: p('M6 21l2-7h8l2 7M9 14V9h6v5') + p('M15 11h4l3-3v8l-3-3h-4'),
    sponsored: c(5, 6, 2.5) + c(19, 6, 2.5) + c(5, 18, 2.5) + c(19, 18, 2.5) + r(8, 9, 8, 6, 2) + p('M7 7.5l2 2M17 7.5l-2 2M7 16.5l2-2M17 16.5l-2-2'),
    collab: c(8, 8, 3) + c(16, 8, 3) + p('M2 20c0-4 3-6 6-6s6 2 6 6M10 20c0-4 3-6 6-6s6 2 6 6'),
    gunship: p('M2 12h7l3-7 3 7h7l-7 3-1 5h-4l-1-5z'),
    wipe: p('M5 10a7 7 0 0114 0v4l-2 2v4H7v-4l-2-2z') + c(9, 11, 1.6, 1) + c(15, 11, 1.6, 1) + p('M10 20v-3M14 20v-3'),
    /* misc */
    lock: r(5, 11, 14, 10, 2) + p('M8 11V8a4 4 0 018 0v3'),
    check: p('M4 12l5 5L20 6'),
    plus: p('M12 5v14M5 12h14'),
    none: c(12, 12, 8) + p('M6.5 17.5l11-11'),
    diamond: p('M12 3l9 9-9 9-9-9z'),
  };
  // attachment ids that share a name with a slot get their own drawing
  const ALIAS = { laser: 'laser_att' };
  const ATT_IDS = new Set(['reddot', 'holo', 'zoom2', 'suppressor', 'comp', 'longbarrel', 'shortbarrel', 'vgrip', 'agrip', 'extmag', 'fastmag', 'lightstock',
    'heavystock', 'laser', 'tapegrip', 'rubbergrip']);
  /** svg(id, { slot: true }) — slot: draw the slot icon even when an attachment shares the id */
  function svg(id, o = {}) {
    const k = !o.slot && ATT_IDS.has(id) && ALIAS[id] ? ALIAS[id] : id;
    const body = I[k] || I.diamond;
    return `<svg class="pvpi${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" width="${o.size || 24}" height="${o.size || 24}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }
  const api = { svg, has: id => !!I[ALIAS[id] || id] };
  root.PvpIcons = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
