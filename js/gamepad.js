/* EARTH 2049: SAVE SEED 7 — controller support (standard-mapping gamepads: Xbox, PlayStation, Switch Pro, 8BitDo…).
 *
 *   Pad.poll(dt)          once per frame: reads the pad, edge-detects buttons, drives menus
 *   Pad.lx/ly/rx/ry/lt/rt sticks (radial deadzone, rescaled) and triggers (0..1)
 *   Pad.down(b) / held(b) / up(b)    this frame's press, hold, release (Pad.BTN names the buttons)
 *   Pad.active            true while the controller is the last thing the player touched (mouse/keys flip it off)
 *   Pad.inMenu            true when a menu layer took this frame's input (gameplay should ignore the pad)
 *   Pad.rumble(strong, weak, ms)
 *
 * Menus: whatever layer is on top (Fitting Room, arena cards/results/pause, Haven dialogue, the game's overlays,
 * the title screen) is navigated spatially: D-pad or left stick moves a glowing focus between its buttons, A
 * presses, B backs out (sends Escape), LB/RB flip tabs in the Fitting Room, START opens or closes pause.
 * Gameplay mapping lives with each mode: AR.Player.padTick (arena) and padGameplay in game.js (Haven, districts).
 */
'use strict';

const Pad = (() => {
  const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16 };
  const DZ = 0.18;
  const S = { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, cur: [], prev: [], index: -1, active: false, connected: false, inMenu: false, id: '' };
  let focus = null, repeatT = 0, lastDir = '', layerKey = '', menuLock = 0;

  function stick(x, y) {
    const m = Math.hypot(x, y);
    if (m < DZ) return [0, 0];
    const k = Math.min(1, (m - DZ) / (1 - DZ)) / m;
    return [x * k, y * k];
  }
  function read() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = pads[S.index];
    if (!gp || !gp.connected) { gp = null; for (const p of pads) if (p && p.connected && p.mapping === 'standard') { gp = p; S.index = p.index; break; } }
    if (!gp) for (const p of pads) if (p && p.connected) { gp = p; S.index = p.index; break; }
    return gp;
  }
  function poll(dt) {
    S.prev = S.cur;
    const gp = read();
    S.connected = !!gp;
    if (!gp) { S.cur = []; S.lx = S.ly = S.rx = S.ry = S.lt = S.rt = 0; S.inMenu = false; return; }
    S.id = gp.id;
    S.cur = gp.buttons.map(b => b.pressed || b.value > 0.5);
    [S.lx, S.ly] = stick(gp.axes[0] || 0, gp.axes[1] || 0);
    [S.rx, S.ry] = stick(gp.axes[2] || 0, gp.axes[3] || 0);
    S.lt = gp.buttons[6]?.value || 0; S.rt = gp.buttons[7]?.value || 0;
    if (S.cur.some(Boolean) || Math.abs(S.lx) + Math.abs(S.ly) + Math.abs(S.rx) + Math.abs(S.ry) > 0.2) {
      if (!S.active) { S.active = true; document.body.classList.add('pad'); }
    }
    S.gp = gp;
    S.inMenu = menuTick(dt);
  }
  const down = b => !!S.cur[b] && !S.prev[b];
  const held = b => !!S.cur[b];
  const up = b => !S.cur[b] && !!S.prev[b];
  function rumble(strong = 0.4, weak = 0.4, ms = 120) {
    if (!S.active || SAVE?.opts?.rumble === false) return;
    const a = S.gp?.vibrationActuator;
    try { a?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }); } catch (e) { /* no rumble */ }
  }
  function key(code, type = 'keydown') {
    const k = { Escape: 'Escape', Enter: 'Enter', Space: ' ' }[code] || code.replace(/^Key|^Digit/, '');
    dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true }));
  }
  // mouse or keyboard takes over again
  const off = () => { if (S.active) { S.active = false; document.body.classList.remove('pad'); clearFocus(); } };
  addEventListener('mousemove', e => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) off(); }, true);
  addEventListener('keydown', e => { if (e.isTrusted) off(); }, true);
  addEventListener('gamepadconnected', e => { S.index = e.gamepad.index; console.info('[E2049] controller connected:', e.gamepad.id); });

  /* ------------------------------------------------------------------ menus */
  const visible = n => { if (!n || n.disabled) return false; const r = n.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(n); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const CLICKABLE = 'button, .btn, .togbtn, .armtab, .ogcard, .arcard, .arbtn, .buybtn, .opt, a[href], [role=button], [data-equip], [data-level], [data-meta], [data-corrupt], [data-save-export], [data-save-import], [data-save-reset], input[type=range]';
  function layer() {
    const avc = document.getElementById('avc');
    if (avc) return { key: 'avc', root: avc, sel: '.avc-top button, .avc-tabs button, .avc-grid button, .avc-info button, .avc-dlg.show button, .avc-fold' };
    for (const id of ['arCards', 'arResults', 'arPause']) { const o = document.getElementById(id); if (o?.classList.contains('on')) return { key: id, root: o, sel: '.arcard, .arbtn' }; }
    const dlg = document.getElementById('havenDlg');
    if (dlg?.classList.contains('show')) return { key: 'havenDlg', root: dlg, sel: '.opt' };
    const ovs = [...document.querySelectorAll('.ov.show')].filter(o => o.offsetParent !== null || getComputedStyle(o).position === 'fixed');
    if (ovs.length) { const o = ovs[ovs.length - 1]; return { key: o.id || 'ov', root: o, sel: CLICKABLE }; }
    return null;
  }
  function items(L) { return [...L.root.querySelectorAll(L.sel)].filter(visible); }
  function clearFocus() { if (focus) focus.classList.remove('pad-focus'); focus = null; }
  function setFocus(n) {
    if (focus === n) return;
    clearFocus(); focus = n; if (!n) return;
    n.classList.add('pad-focus');
    if (n.classList.contains('arcard')) { document.querySelectorAll('.arcard.sel').forEach(c => c.classList.remove('sel')); n.classList.add('sel'); n.dispatchEvent(new Event('mouseenter')); }
    n.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    window.AR?.Sfx?.ui?.('hover');
  }
  function move(list, dir) {
    if (!focus || !list.includes(focus)) { setFocus(list[0]); return; }
    const a = focus.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const n of list) {
      if (n === focus) continue;
      const r = n.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, dx = x - ax, dy = y - ay;
      const main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (main <= 4) continue;
      const score = main + side * 2.2;
      if (score < bs) { bs = score; best = n; }
    }
    if (best) setFocus(best);
  }
  function menuTick(dt) {
    const L = layer();
    menuLock = Math.max(0, menuLock - dt);
    if (!L) { if (layerKey) { clearFocus(); layerKey = ''; } return false; }
    if (!S.active) return true;
    const list = items(L);
    if (L.key !== layerKey || (focus && !list.includes(focus))) {
      layerKey = L.key; clearFocus();
      const pref = list.find(n => n.classList.contains('on') && n.closest('.avc-grid')) || list.find(n => n.classList.contains('arcard')) ||
        list.find(n => n.classList.contains('primary')) ||
        list.find(n => /RESUME|RETRY|RUN IT BACK|ENTER|START|CONTINUE/i.test(n.textContent)) || list[0];
      setFocus(pref);
      menuLock = 0.2;
    }
    // direction with auto-repeat
    const dir = held(BTN.UP) || S.ly < -0.6 ? 'up' : held(BTN.DOWN) || S.ly > 0.6 ? 'down' : held(BTN.LEFT) || S.lx < -0.6 ? 'left' : held(BTN.RIGHT) || S.lx > 0.6 ? 'right' : '';
    if (dir) {
      repeatT -= dt;
      if (dir !== lastDir || repeatT <= 0) {
        if (focus?.type === 'range' && (dir === 'left' || dir === 'right')) {
          focus.value = +focus.value + (dir === 'right' ? 1 : -1) * (+focus.step || 1) * 5; focus.dispatchEvent(new Event('input', { bubbles: true }));
        } else move(list, dir);
        repeatT = dir === lastDir ? 0.11 : 0.35;
      }
    } else repeatT = 0;
    lastDir = dir;
    if (menuLock > 0) return true;
    if (down(BTN.A) && focus) { focus.click(); rumble(0.1, 0.25, 50); }
    if (down(BTN.B)) key('Escape');
    if (down(BTN.START) && (L.key === 'arPause' || L.key === 'ovPause')) key('Escape');
    if (L.key === 'avc') {
      // Fitting Room: LB / RB flip category tabs, RS turns the model
      const tabs = [...L.root.querySelectorAll('.avc-tabs button')];
      const i = tabs.findIndex(t => t.classList.contains('on'));
      if (down(BTN.LB) && i > 0) tabs[i - 1].click();
      if (down(BTN.RB) && i >= 0 && i < tabs.length - 1) tabs[i + 1].click();
      if (down(BTN.Y)) L.root.querySelector('[data-a=save]:not(:disabled)')?.click();
      if (down(BTN.X)) L.root.querySelector('[data-a=buy]:not(:disabled)')?.click();
      const api = window.AvatarCreator?.api;
      if (api?.spin && Math.abs(S.rx) > 0.1) api.spin(S.rx * dt * 2.4);
    }
    return true;
  }

  const css = document.createElement('style');
  css.textContent = `.pad-focus{outline:3px solid #ffd400!important;outline-offset:3px;box-shadow:0 0 18px rgba(255,212,0,.65)!important;position:relative;z-index:2}
body.pad,body.pad *{cursor:none!important}`;
  (document.head || document.documentElement).appendChild(css);

  return {
    BTN, poll, down, held, up, rumble, key, setFocus, clearFocus,
    get lx() { return S.lx; }, get ly() { return S.ly; }, get rx() { return S.rx; }, get ry() { return S.ry; },
    get lt() { return S.lt; }, get rt() { return S.rt; }, get active() { return S.active; }, get connected() { return S.connected; },
    get inMenu() { return S.inMenu; }, get id() { return S.id; },
  };
})();

if (typeof window !== 'undefined') window.Pad = Pad;
