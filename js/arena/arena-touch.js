/* EARTH 2049: SAVE SEED 7 — ARENA touch controls (phones and tablets).
 *
 * Wakes on the first touch inside a mission and sleeps again the moment a keyboard key, a real mouse move or a
 * controller is used, so desktop, controller and VR play never see it. Nothing here changes how the game plays with
 * a mouse or a pad: it only writes the same AR.Player input fields they write.
 *
 *   left half      floating move stick (push it all the way forward to sprint)
 *   right half     drag to look; the FIRE button also looks while held, so you can aim and shoot with one thumb
 *   buttons        FIRE · AIM (toggle) · JUMP · CROUCH/SLIDE (hold) · RELOAD/USE · SWAP · KICK · GRENADE · DASH
 *   top left       pause · AUTO (fires on its own when the crosshair rests on an enemy)
 *
 * Phones get the same gentle aim assist as a controller (a little slow-down over a target and a small pull toward
 * its head), and the same look sensitivity setting scaled for thumbs (SAVE.opts.touchSens, default 1).
 */
'use strict';

AR.Touch = (() => {
  let root = null, on = false, built = false, autoFire = false, fullscreenAsked = false;
  const T = { move: null, look: null, fire: null, anchor: { x: 0, y: 0 }, last: { x: 0, y: 0 }, fireLast: { x: 0, y: 0 } };
  const BTN = [
    // id, label, right, bottom, size, kind
    ['fire', 'FIRE', 112, 58, 92, 'hold'],
    ['ads', 'AIM', 222, 128, 60, 'toggle'],
    ['jump', 'JUMP', 22, 148, 64, 'tap'],
    ['crouch', 'SLIDE', 22, 62, 64, 'hold'],
    ['reload', 'RELOAD', 222, 46, 60, 'tap'],
    ['swap', 'SWAP', 118, 172, 54, 'tap'],
    ['kick', 'KICK', 300, 70, 54, 'tap'],
    ['nade', 'NADE', 300, 140, 54, 'tap'],
    ['dash', 'DASH', 196, 214, 54, 'tap'],
  ];
  const I = () => AR.Player.input;
  const touchCapable = () => (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0;
  const live = () => AR.active && !AR.paused && !AR.menu && !window.VR?.active;

  function fullscreen() {
    if (fullscreenAsked) return; fullscreenAsked = true;
    const d = document.documentElement;
    try {
      const p = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen?.();
      Promise.resolve(p).then(() => screen.orientation?.lock?.('landscape')).catch(() => { /* not allowed here: fine */ });
    } catch (e) { /* iOS Safari has no page fullscreen */ }
  }

  function build() {
    if (built) return; built = true;
    root = document.createElement('div'); root.id = 'arTouch';
    root.innerHTML = `<div class="at-stick"><i></i></div>
      <div class="at-top"><div class="at-b at-pause" data-k="pause" aria-label="Pause">II</div><div class="at-b at-auto" data-k="auto">AUTO: OFF</div></div>` +
      BTN.map(([k, label, r, b, s]) => `<div class="at-b" data-k="${k}" style="right:${r}px;bottom:${b}px;width:${s}px;height:${s}px">${label}</div>`).join('');
    document.body.appendChild(root);
    root.addEventListener('touchstart', start, { passive: false });
    root.addEventListener('touchmove', move, { passive: false });
    root.addEventListener('touchend', end, { passive: false });
    root.addEventListener('touchcancel', end, { passive: false });
    autoFire = !!window.SAVE?.opts?.arAuto;
    paintAuto();
  }
  function paintAuto() { const a = root?.querySelector('.at-auto'); if (a) { a.textContent = autoFire ? 'AUTO: ON' : 'AUTO: OFF'; a.classList.toggle('on', autoFire); } }

  /** wake on a touch anywhere during a mission (the root only exists to catch touches once it is shown) */
  function wake(e) {
    if (on || !AR.active || window.VR?.active || !touchCapable()) return;
    build(); on = true;
    document.body.classList.add('ar-touch');
    AR.freeLook = true; AR.unlockPointer();
    fullscreen();
    if (e && e.cancelable && live()) e.preventDefault();
  }
  function sleep() {
    if (!on) return;
    on = false; document.body.classList.remove('ar-touch');
    release();
  }
  function release() {
    const i = I(); if (!i) return;
    T.move = T.look = T.fire = null;
    i.touchX = 0; i.touchZ = 0; i.touchSprint = false; i.fire = false; i.crouch = false;
    root?.querySelectorAll('.at-b.down').forEach(b => b.classList.remove('down'));
    const st = root?.querySelector('.at-stick'); if (st) st.style.display = 'none';
  }

  function btnAt(t) { const el = document.elementFromPoint(t.clientX, t.clientY); return el && el.closest ? el.closest('.at-b') : null; }
  function press(b, t) {
    const k = b.dataset.k, i = I();
    b.classList.add('down');
    AR.Sfx?.ui?.('tick');
    switch (k) {
      case 'pause': AR.pause?.(true); release(); return;
      case 'auto': autoFire = !autoFire; if (window.SAVE?.opts) { SAVE.opts.arAuto = autoFire; window.persist?.(); } paintAuto(); return;
      case 'fire': i.fire = true; T.fire = t.identifier; T.fireLast = { x: t.clientX, y: t.clientY }; return;
      case 'ads': i.ads = !i.ads; b.classList.toggle('on', i.ads); return;
      case 'jump': i.jump = 0.14; return;
      case 'crouch': i.crouch = true; b.dataset.id = t.identifier; return;
      case 'reload': if (!AR.Drops?.use?.()) i.reload = true; return;
      case 'swap': i.swap = -1; return;
      case 'kick': i.kick = true; return;
      case 'nade': i.nade = true; return;
      case 'dash': i.dash = true; return;
      default:
    }
  }
  function start(e) {
    if (!live()) return;
    e.preventDefault();
    const i = I(); if (!i) return;
    for (const t of e.changedTouches) {
      const b = btnAt(t);
      if (b) { press(b, t); continue; }
      if (t.clientX < innerWidth * 0.42 && T.move === null) {
        T.move = t.identifier; T.anchor = { x: t.clientX, y: t.clientY };
        const st = root.querySelector('.at-stick');
        st.style.display = 'block'; st.style.left = (t.clientX - 60) + 'px'; st.style.top = (t.clientY - 60) + 'px';
        st.firstChild.style.transform = 'translate(0,0)';
      } else if (T.look === null) { T.look = t.identifier; T.last = { x: t.clientX, y: t.clientY }; }
    }
  }
  function look(dx, dy) {
    const i = I(), k = 2.2 * (window.SAVE?.opts?.touchSens || 1);
    i.lookX += dx * k; i.lookY += dy * k;
  }
  function move(e) {
    if (!on) return;
    e.preventDefault();
    if (!live()) return;
    const i = I();
    for (const t of e.changedTouches) {
      if (t.identifier === T.move) {
        let dx = t.clientX - T.anchor.x, dy = t.clientY - T.anchor.y;
        const d = Math.hypot(dx, dy), max = 56;
        if (d > max) { dx = dx / d * max; dy = dy / d * max; }
        i.touchX = dx / max; i.touchZ = -dy / max;
        i.touchSprint = i.touchZ > 0.92;
        root.querySelector('.at-stick i').style.transform = `translate(${dx}px,${dy}px)`;
      } else if (t.identifier === T.look) {
        look(t.clientX - T.last.x, t.clientY - T.last.y); T.last = { x: t.clientX, y: t.clientY };
      } else if (t.identifier === T.fire) {
        look(t.clientX - T.fireLast.x, t.clientY - T.fireLast.y); T.fireLast = { x: t.clientX, y: t.clientY };
      }
    }
  }
  function end(e) {
    if (!on) return;
    if (e.cancelable) e.preventDefault();
    const i = I(); if (!i) return;
    for (const t of e.changedTouches) {
      if (t.identifier === T.move) { T.move = null; i.touchX = 0; i.touchZ = 0; i.touchSprint = false; root.querySelector('.at-stick').style.display = 'none'; }
      if (t.identifier === T.look) T.look = null;
      if (t.identifier === T.fire) { T.fire = null; i.fire = false; }
      root.querySelectorAll('.at-b.down').forEach(b => {
        if (b.dataset.k === 'crouch' && +b.dataset.id === t.identifier) { i.crouch = false; b.classList.remove('down'); }
        else if (b.dataset.k !== 'crouch' && b.dataset.k !== 'fire') setTimeout(() => b.classList.remove('down'), 90);
        else if (b.dataset.k === 'fire' && T.fire === null) b.classList.remove('down');
      });
    }
  }

  /** every frame: aim assist and auto-fire, the way a controller gets them */
  function tick(rdt) {
    if (!on) return;
    root.classList.toggle('hidden', !live());
    root.querySelector('[data-k="dash"]').style.display = AR.Player.S?.dashMode ? '' : 'none';
    const use = document.querySelector('#arHud .prompt')?.style.display === 'block';
    const rb = root.querySelector('[data-k="reload"]'); if (rb.textContent !== (use ? 'USE' : 'RELOAD')) rb.textContent = use ? 'USE' : 'RELOAD';
    if (!live() || !AR.Player.P?.alive) return;
    const i = I(), P = AR.Player.P;
    const t = AR.Player.assistTarget?.();
    const aiming = T.look !== null || T.fire !== null || i.fire;
    if (t && aiming) {
      const pull = (P.ads > 0.4 ? 0.9 : 0.45) * rdt;
      P.yaw += AR.clamp(t.dYaw, -pull, pull); P.pitch = AR.clamp(P.pitch + AR.clamp(t.dPitch, -pull, pull), -1.5, 1.5);
    }
    if (autoFire && T.fire === null) i.fire = !!(t && t.ang < 0.05);
  }

  /* a touch anywhere while a mission runs wakes the controls; a key, a real mouse move or a pad puts them away */
  addEventListener('touchstart', wake, { capture: true, passive: false });
  addEventListener('keydown', e => { if (on && !e.repeat && e.isTrusted) sleep(); }, true);
  addEventListener('mousemove', e => { if (on && (e.movementX || e.movementY) && e.isTrusted && !e.sourceCapabilities?.firesTouchEvents) sleep(); }, true);
  addEventListener('gamepadconnected', sleep);

  return { tick, sleep, fullscreen, get on() { return on; }, get autoFire() { return autoFire; }, _: { BTN } };
})();
