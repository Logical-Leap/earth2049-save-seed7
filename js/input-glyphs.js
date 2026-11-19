/* EARTH 2049: SAVE SEED 7 — button prompts that follow the input device.
 *
 * Every on-screen "press this" goes through here, so the prompt always names the button the player can press:
 * keyboard keys while they play on mouse and keyboard, the controller's own buttons (Xbox, PlayStation or Switch
 * labels) while they play on a controller. The Settings choice BUTTON PROMPTS (SAVE.opts.prompts) can pin one.
 *
 *   Glyph.mode()              'kb' | 'xbox' | 'ps' | 'switch'
 *   Glyph.pad()               true when prompts show controller buttons
 *   Glyph.act(action, ctx)    HTML chip for an action ('reload', 'use', 'streak1'…), ctx 'pvp' (default) or 'arena'
 *   Glyph.label(action, ctx)  the same as plain text, e.g. "[E]" or "[X]"
 *   Glyph.text(str, ctx)      replaces {action} tokens (and the old "[E]"-style keyboard tokens) with chips
 *   Glyph.plain(str, ctx)     the same, as plain text
 *   Glyph.btn(name)           chip for one controller button by its standard name (A, LB, UP…)
 *   Glyph.onChange(fn)        fn(mode) whenever the prompts switch device
 *   Glyph.cycle() / Glyph.prefLabel()   the Settings choice
 */
(function (root) {
  'use strict';

  const PREFS = ['auto', 'kb', 'xbox', 'ps', 'switch'];
  const PREF_LABEL = { auto: 'AUTO', kb: 'KEYBOARD', xbox: 'XBOX', ps: 'PLAYSTATION', switch: 'SWITCH' };

  // controller button labels by family, keyed by the standard-mapping name gamepad.js uses (Pad.BTN)
  const PADS = {
    xbox: { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', BACK: 'VIEW', START: 'MENU', L3: 'LS', R3: 'RS', UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', LS: 'L-STICK', RS: 'R-STICK' },
    ps: { A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', BACK: 'CREATE', START: 'OPTIONS', L3: 'L3', R3: 'R3', UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', LS: 'L-STICK', RS: 'R-STICK' },
    // Switch Pro in a browser maps by position: the bottom face button is B, the right one A
    switch: { A: 'B', B: 'A', X: 'Y', Y: 'X', LB: 'L', RB: 'R', LT: 'ZL', RT: 'ZR', BACK: '−', START: '+', L3: 'LS', R3: 'RS', UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', LS: 'L-STICK', RS: 'R-STICK' },
  };
  const FACE_COL = {
    xbox: { A: '#3cdb4e', B: '#ff5a4e', X: '#40a3ff', Y: '#ffd33d' },
    ps: { A: '#8fb3ff', B: '#ff6b6b', X: '#ff8ae0', Y: '#3fe0a0' },
    switch: {},
  };
  const FACE = new Set(['A', 'B', 'X', 'Y']);
  const DPAD = new Set(['UP', 'DOWN', 'LEFT', 'RIGHT']);

  // actions: the keyboard key and the controller button for each, per context.
  // pvp: GigaLeague (js/arena/arena-pvp.js + the PvP branch of AR.Player.padTick). arena: the PvE arena.
  const ACTS = {
    pvp: {
      fire: ['LMB', 'RT'], ads: ['RMB', 'LT'], reload: ['R', 'X'], use: ['E', 'X'], useHold: ['HOLD E', 'HOLD X'], swap: ['1 / 2', 'Y'],
      lethal: ['G', 'LB'], tactical: ['Q', 'DOWN'], melee: ['F', 'RB'], jump: ['SPACE', 'A'], crouch: ['C', 'B'], sprint: ['SHIFT', 'L3'],
      streak1: ['3', 'LEFT'], streak2: ['4', 'UP'], streak3: ['5', 'RIGHT'], score: ['TAB', 'BACK'], skip: ['SPACE', 'A'],
      classPrev: ['←', 'LB'], classNext: ['→', 'RB'], pause: ['ESC', 'START'], move: ['WASD', 'LS'], look: ['MOUSE', 'RS'],
    },
    arena: {
      fire: ['LMB', 'RT'], ads: ['RMB', 'LT'], reload: ['R', 'X'], use: ['E', 'X'], swap: ['Q', 'Y'], lethal: ['G', 'LB'], melee: ['F', 'RB'],
      jump: ['SPACE', 'A'], crouch: ['C', 'B'], sprint: ['SHIFT', 'L3'], pause: ['ESC', 'START'], move: ['WASD', 'LS'], look: ['MOUSE', 'RS'],
    },
  };
  // the old keyboard-only prompt tokens, read as actions (so "[E] SWAP FOR…" follows the device too)
  const LEGACY = {
    pvp: { '[E]': 'use', '[R]': 'reload', '[G]': 'lethal', '[Q]': 'tactical', '[F]': 'melee', '[TAB]': 'score', '[SPACE]': 'skip', '[3]': 'streak1', '[4]': 'streak2', '[5]': 'streak3', '[1/2]': 'swap' },
    arena: { '[E]': 'use', '[R]': 'reload', '[G]': 'lethal', '[Q]': 'swap', '[F]': 'melee' },
  };

  function save() { try { return typeof SAVE !== 'undefined' ? SAVE : root.SAVE; } catch (e) { return root.SAVE; } }
  function pref() { const p = save()?.opts?.prompts; return PREFS.includes(p) ? p : 'auto'; }
  function family() {
    const id = String(root.Pad?.id || '').toLowerCase();
    if (/xbox|xinput|045e/.test(id)) return 'xbox';
    // a DualShock 4 reports itself as just "Wireless Controller" (vendor 054c)
    if (/054c|playstation|dualsense|dualshock|ps4|ps5|^wireless controller/.test(id)) return 'ps';
    if (/057e|nintendo|pro controller|joy-con/.test(id)) return 'switch';
    return 'xbox';
  }
  function mode() {
    const p = pref();
    if (p !== 'auto') return p;
    return root.Pad?.active ? family() : 'kb';
  }
  const pad = () => mode() !== 'kb';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function btnText(name, m = mode()) { const F = PADS[m] || PADS.xbox; return F[name] || name; }
  function btn(name, m = mode()) {
    const fam = PADS[m] ? m : 'xbox', t = btnText(name, fam);
    const col = FACE.has(name) ? FACE_COL[fam][name] : '';
    const cls = FACE.has(name) ? 'gl pad face' : DPAD.has(name) ? 'gl pad dp' : 'gl pad sh';
    return `<kbd class="${cls}"${col ? ` style="color:${col};border-color:${col}"` : ''}>${esc(t)}</kbd>`;
  }
  function keycap(k) { return `<kbd class="gl key">${esc(k)}</kbd>`; }
  function pair(action, ctx) { return (ACTS[ctx] || ACTS.pvp)[action] || (ACTS.pvp[action]) || null; }
  function act(action, ctx = 'pvp') {
    const p = pair(action, ctx); if (!p) return esc(action);
    const m = mode(), k = m === 'kb' ? p[0] : p[1], hold = k.startsWith('HOLD ') ? 'HOLD ' : '', name = hold ? k.slice(5) : k;
    return hold + (m === 'kb' ? keycap(name) : btn(name, m));
  }
  function label(action, ctx = 'pvp') {
    const p = pair(action, ctx); if (!p) return action;
    const m = mode(), k = m === 'kb' ? p[0] : p[1], hold = k.startsWith('HOLD ') ? 'HOLD ' : '', name = hold ? k.slice(5) : k;
    return hold + '[' + (m === 'kb' ? name : btnText(name, m)) + ']';
  }
  function swapTokens(str, ctx, fn, escape) {
    let s = String(str ?? '');
    const L = LEGACY[ctx] || LEGACY.pvp;
    // legacy bracket tokens first, then {action} tokens; plain text is escaped once for the HTML form
    const parts = s.split(/(\{[a-zA-Z0-9]+\}|\[[A-Z0-9/]+\])/g);
    return parts.map(part => {
      const m1 = /^\{([a-zA-Z0-9]+)\}$/.exec(part);
      if (m1 && pair(m1[1], ctx)) return fn(m1[1], ctx);
      if (L[part]) return fn(L[part], ctx);
      return escape ? esc(part) : part;
    }).join('');
  }
  const text = (str, ctx = 'pvp') => swapTokens(str, ctx, act, true);
  const plain = (str, ctx = 'pvp') => swapTokens(str, ctx, label, false);

  /* ------------------------------------------------------------------ device changes */
  const subs = new Set();
  let last = null;
  function check() {
    const m = mode();
    if (m === last) return;
    last = m;
    if (root.document?.body) root.document.body.dataset.prompts = m;
    for (const fn of subs) { try { fn(m); } catch (e) { console.warn('[E2049] prompt listener', e); } }
  }
  function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }
  if (root.setInterval && root.document) root.setInterval(check, 200);

  function cycle() {
    const S = save(); if (!S) return 'auto';
    S.opts = S.opts || {};
    S.opts.prompts = PREFS[(PREFS.indexOf(pref()) + 1) % PREFS.length];
    try { root.persist?.(); } catch (e) { /* saved with the next persist */ }
    check();
    return S.opts.prompts;
  }
  const prefLabel = () => PREF_LABEL[pref()];

  const CSS = `.gl{display:inline-block;min-width:1.55em;padding:0 .38em;margin:0 .12em;border:1px solid currentColor;border-radius:3px;font-family:Consolas,'Lucida Console','Segoe UI Symbol','Noto Sans Symbols 2','DejaVu Sans',sans-serif;
  font-size:.92em;font-weight:bold;font-style:normal;line-height:1.3;text-align:center;background:rgba(0,0,0,.55);color:#fff;text-shadow:none;vertical-align:baseline;letter-spacing:0;text-transform:none}
  .gl.key{border-color:rgba(255,255,255,.7);box-shadow:0 2px 0 rgba(255,255,255,.35)}
  .gl.pad.face{border-radius:999px;min-width:1.4em;padding:0 .25em;border-width:2px}
  .gl.pad.sh{border-radius:6px;border-color:rgba(255,255,255,.75)}
  .gl.pad.dp{border-radius:4px;border-color:#ffd400;color:#ffd400}`;
  function css() {
    const d = root.document; if (!d || d.getElementById('glyphCss')) return;
    const st = d.createElement('style'); st.id = 'glyphCss'; st.textContent = CSS; (d.head || d.documentElement).appendChild(st);
  }
  if (root.document) { if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', css); else css(); }

  root.Glyph = { mode, pad, family, act, label, text, plain, btn, btnText, keycap, onChange, cycle, prefLabel, check, PREFS, ACTS };
  if (typeof module !== 'undefined') module.exports = root.Glyph;
})(typeof globalThis !== 'undefined' ? globalThis : this);
