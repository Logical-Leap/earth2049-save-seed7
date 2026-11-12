/* EARTH 2049: SAVE SEED 7 — native WebXR VR (Meta Quest 3 / 3S / Pro and any WebXR headset).
 *
 * The whole game, fully immersive: the Haven, Operation Unsubscribe, the district runs and co-op. Not a floating
 * screen. Your head is the camera, your right hand holds the gun, your left wrist carries the HUD, menus float in
 * front of you and are pointed at with a laser.
 *
 * How the world moves around you: the XR reference space is offset every frame (XRRigidTransform), so the poses
 * three.js hands back are already in world coordinates. camera.position / quaternion are your real head in the
 * world, and controller objects are your real hands. Each mode keeps its own player capsule (physics, collision,
 * networking stay as they are) and calls VR.place(feet) after moving it: the rig is slid so your physical head
 * sits over the capsule. Walking in your room moves the capsule through the same collision (VR.consumeWalk).
 *
 *   VR.init({ renderer, scene, camera })   once, at boot
 *   VR.supported / VR.active               headset available / in an immersive session
 *   VR.enter() / VR.exit()
 *   VR.poll(dt)                            once per frame: controllers, turning, menus, HUD, comfort
 *   VR.place(feet)                         slide the rig so the head is over the capsule ({x, y, z})
 *   VR.consumeWalk()                       metres walked in the room since last call, world {x, z}
 *   VR.yaw / VR.headYaw / VR.headPitch     body yaw (stick turning) / where the head points in the world
 *   VR.crouched                            physically ducking
 *   VR.down/held/up(hand, button)          'left' | 'right', VR.BTN.TRIGGER/GRIP/STICK/A/B (X/Y on the left)
 *   VR.stick(hand) -> {x, y}               thumbstick (deadzoned)
 *   VR.aim(pos, dir)                       muzzle ray of the gun in your right hand (falls back to the hand)
 *   VR.holdGun(group) / VR.releaseGun()    put the viewmodel gun in your right hand / give it back to the camera
 *   VR.recoil(k) / VR.pulse(hand, s, ms)   kick the gun / haptics
 *   VR.hud = () => ({...}) / VR.feed = () => [lines]   wrist HUD data and the floating message strip
 *
 * Testing without a headset: open the game with ?xremu=1 and Meta's Immersive Web Emulation Runtime (MIT,
 * tools/iwer) stands in for a Quest 3; window.__IWER_DEV drives the emulated head and controllers.
 */
'use strict';

const VR = (() => {
  const BTN = { TRIGGER: 0, GRIP: 1, STICK: 3, A: 4, B: 5 };      // xr-standard; A/B on the right are X/Y on the left
  const DZ = 0.2, SNAP = Math.PI / 6;
  const S = {
    supported: false, active: false, session: null, base: null, yaw: 0, W: null, aW: null, aYaw: 0, hl: null, lastHl: null,
    standH: 1.6, crouched: false, latch: false, hands: {}, gun: null, gunHome: null, recoil: 0, menuFor: '', lastPanelSig: '',
  };
  let renderer = null, scene = null, camera = null;
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = V3(), _v2 = V3(), _m = new THREE.Matrix4();

  /* ------------------------------------------------------------------ setup */
  function init(o) {
    ({ renderer, scene, camera } = o);
    S.W = V3(); S.aW = V3(); S.hl = V3(0, 1.6, 0); S.lastHl = V3(0, 1.6, 0);
    renderer.xr.enabled = true;
    renderer.xr.setFoveation?.(1);
    for (const i of [0, 1]) {
      const ctrl = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
      scene.add(ctrl); scene.add(grip);
      ctrl.addEventListener('connected', e => {
        const h = e.data.handedness === 'left' ? 'left' : 'right';
        S.hands[h] = { ctrl, grip, src: e.data, cur: [], prev: [], sx: 0, sy: 0 };
        ctrl.userData.hand = h; grip.userData.hand = h;
        buildHand(h);
      });
      ctrl.addEventListener('disconnected', () => { const h = ctrl.userData.hand; if (h && S.hands[h]?.ctrl === ctrl) delete S.hands[h]; });
    }
    buildHud();
    if (navigator.xr?.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-vr').then(ok => { S.supported = !!ok; document.body.classList.toggle('vr-ok', S.supported); }).catch(() => {});
    }
  }

  async function enter() {
    if (S.active || !navigator.xr) return false;
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      renderer.xr.setReferenceSpaceType('local-floor');
      renderer.xr.setFramebufferScaleFactor(window.SAVE?.opts?.vrScale || 1.0);
      await renderer.xr.setSession(session);
      S.session = session;
      try { S.base = await session.requestReferenceSpace('local-floor'); } catch (e) { S.base = await session.requestReferenceSpace('local'); }
      session.addEventListener('end', onEnd);
      S.active = true;
      S.yaw = S.startYaw ?? 0; S.hl.set(0, 1.6, 0); S.lastHl.copy(S.hl); S.standH = 1.6;
      document.body.classList.add('in-vr');
      hud.root.visible = true;
      for (const f of hooks.start) f();
      return true;
    } catch (e) {
      console.warn('[VR] could not start', e);
      return false;
    }
  }
  function exit() { S.session?.end(); }
  function onEnd() {
    S.active = false; S.session = null; S.base = null;
    renderer.xr.setReferenceSpace?.(null);
    document.body.classList.remove('in-vr');
    hud.root.visible = false; menu.mesh.visible = false;
    releaseGun();
    for (const f of hooks.end) f();
  }
  const hooks = { start: [], end: [] };

  /* ------------------------------------------------------------------ the rig: reference-space offset */
  const rotY = (x, z, a, out) => { const c = Math.cos(a), s = Math.sin(a); out.x = x * c + z * s; out.z = -x * s + z * c; return out; };
  const _qy = new THREE.Quaternion(), _up = V3(0, 1, 0);
  function readHead() {
    // the head in the physical (local-floor) space, straight from this XR frame (independent of our offsets)
    const frame = renderer.xr.getFrame?.();
    const pose = frame && S.base ? frame.getViewerPose(S.base) : null;
    if (pose) {
      const t = pose.transform, o = t.orientation;
      S.hl.set(t.position.x, t.position.y, t.position.z);
      // this frame renders with the offset we set last frame (aW, aYaw): that is where your head is in the world.
      // Copy it onto the game camera so audio, prompts, the net and the district aim all see your real head.
      rotY(S.hl.x, S.hl.z, S.aYaw, _v);
      camera.position.set(S.aW.x + _v.x, S.aW.y + S.hl.y, S.aW.z + _v.z);
      camera.quaternion.copy(_qy.setFromAxisAngle(_up, S.aYaw)).multiply(_q.set(o.x, o.y, o.z, o.w));
      camera.updateMatrixWorld(true);
    }
    if (S.hl.y > S.standH) S.standH = S.hl.y; else S.standH += (Math.max(1.2, S.hl.y) - S.standH) * 0.0004;
    S.crouched = S.hl.y < S.standH * 0.72;
  }
  function place(feet) {
    if (!S.active || !S.base) return;
    rotY(S.hl.x, S.hl.z, S.yaw, _v);
    S.W.set(feet.x - _v.x, feet.y, feet.z - _v.z);
    // offset = inverse of (translate W, rotate yaw)
    rotY(-S.W.x, -S.W.z, -S.yaw, _v2);
    const t = new XRRigidTransform({ x: _v2.x, y: -S.W.y, z: _v2.z, w: 1 }, { x: 0, y: Math.sin(-S.yaw / 2), z: 0, w: Math.cos(-S.yaw / 2) });
    renderer.xr.setReferenceSpace(S.base.getOffsetReferenceSpace(t));
    S.aW.copy(S.W); S.aYaw = S.yaw;
  }
  function consumeWalk() {
    let dx = S.hl.x - S.lastHl.x, dz = S.hl.z - S.lastHl.z;
    S.lastHl.copy(S.hl);
    if (Math.hypot(dx, dz) > 0.6) { dx = 0; dz = 0; }                 // tracking jump / recenter: don't teleport the capsule
    rotY(dx, dz, S.yaw, _v);
    return { x: _v.x, z: _v.z };
  }

  /* ------------------------------------------------------------------ controllers */
  function pollHands() {
    for (const h of ['left', 'right']) {
      const H = S.hands[h]; if (!H) continue;
      const gp = H.src.gamepad;
      H.prev = H.cur;
      H.cur = gp ? gp.buttons.map(b => b.pressed || b.value > 0.55) : [];
      H.trig = gp?.buttons[0]?.value || 0; H.squeeze = gp?.buttons[1]?.value || 0;
      const ax = gp?.axes || [], x = ax.length >= 4 ? ax[2] : ax[0] || 0, y = ax.length >= 4 ? ax[3] : ax[1] || 0;
      const m = Math.hypot(x, y), k = m < DZ ? 0 : Math.min(1, (m - DZ) / (1 - DZ)) / m;
      H.sx = x * k; H.sy = y * k;
    }
  }
  const down = (h, b) => !!S.hands[h]?.cur[b] && !S.hands[h]?.prev[b];
  const held = (h, b) => !!S.hands[h]?.cur[b];
  const up = (h, b) => !S.hands[h]?.cur[b] && !!S.hands[h]?.prev[b];
  const stick = h => ({ x: S.hands[h]?.sx || 0, y: S.hands[h]?.sy || 0 });
  const trigger = h => S.hands[h]?.trig || 0;
  function pulse(h, s = 0.5, ms = 60) {
    const a = S.hands[h]?.src.gamepad?.hapticActuators?.[0];
    try { a?.pulse?.(Math.min(1, s), ms); } catch (e) { /* no haptics */ }
  }
  function turn(dt) {
    const x = stick('right').x;
    if (window.SAVE?.opts?.vrSmoothTurn) { S.yaw -= x * 2.6 * dt; return; }
    if (!S.latch && Math.abs(x) > 0.7) { S.yaw -= Math.sign(x) * SNAP; S.latch = true; pulse('right', 0.15, 20); }
    else if (Math.abs(x) < 0.3) S.latch = false;
  }

  /* ------------------------------------------------------------------ your hands: the gloves you wear */
  function buildHand(h) {
    const H = S.hands[h]; if (!H || H.model) return;
    const g = new THREE.Group(); g.name = 'vr-hand-' + h;
    H.grip.add(g); H.model = g;
    dressHand(h);
  }
  // FPBody builds the gloves you picked at the Fitting Room; until then a plain glove
  function dressHand(h) {
    const H = S.hands[h]; if (!H?.model) return;
    H.model.clear();
    const parts = window.FPBody?.handFor?.(h === 'left' ? 'L' : 'R');
    if (parts) {
      parts.rotation.set(-Math.PI / 2, 0, h === 'left' ? Math.PI / 2 : -Math.PI / 2);   // fingers forward along the grip, back of the hand outward
      parts.position.set(0, -0.01, 0.06);
      H.model.add(parts);
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.1), new THREE.MeshBasicMaterial({ color: 0x1a1a22 }));
      m.position.set(0, -0.01, 0.02); H.model.add(m);
    }
  }
  function refreshHands() { dressHand('left'); dressHand('right'); }

  /* ------------------------------------------------------------------ the gun in your right hand */
  const GUN_POS = V3(0, -0.035, 0.03), GUN_ROT = new THREE.Euler(-0.32, 0, 0);
  function holdGun(group) {
    const H = S.hands.right; if (!H || !group) return;
    if (S.gun !== group) {
      S.gun = group; S.gunHome = { parent: group.parent, pos: group.position.clone(), rot: group.rotation.clone(), scale: group.scale.clone() };
    }
    if (group.parent !== H.grip) H.grip.add(group);
    // life size: a gun reads right at ~0.6 m long in the hand
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group), len = box.getSize(_v).z / Math.max(1e-6, group.getWorldScale(_v2).z);
    if (len > 0.01 && group.userData.vrLenKey !== group.children.length + ':' + len.toFixed(3)) {
      group.userData.vrLenKey = group.children.length + ':' + len.toFixed(3);
      group.userData.vrScale = Math.max(0.2, Math.min(2.5, 0.62 / len));
    }
    const k = group.userData.vrScale || 0.52;
    S.recoil = Math.max(0, S.recoil - 0.016 * 9 * (S.recoil + 0.2));
    group.scale.setScalar(k);
    group.position.copy(GUN_POS).add(_v.set(0, S.recoil * 0.02, S.recoil * 0.06));
    group.rotation.set(GUN_ROT.x + S.recoil * 0.25, GUN_ROT.y, GUN_ROT.z);
    if (S.hands.right.model) S.hands.right.model.visible = true;
    window.GunFeel?.hideArms?.();
  }
  function releaseGun() {
    const g = S.gun, home = S.gunHome; if (!g || !home) return;
    home.parent?.add(g); g.position.copy(home.pos); g.rotation.copy(home.rot); g.scale.copy(home.scale);
    S.gun = null; S.gunHome = null;
  }
  function recoil(k = 0.5) { S.recoil = Math.min(1.2, S.recoil + k); pulse('right', 0.25 + k * 0.6, 30 + k * 50); }
  function aim(pos, dir) {
    const src = S.gun && S.gun.parent === S.hands.right?.grip ? S.gun : S.hands.right?.ctrl;
    if (!src) { camera.getWorldPosition(pos); camera.getWorldDirection(dir); return false; }
    src.updateMatrixWorld(true);
    src.getWorldPosition(pos);
    dir.set(0, 0, -1).applyQuaternion(src.getWorldQuaternion(_q)).normalize();
    pos.addScaledVector(dir, 0.15);
    return true;
  }

  /* ------------------------------------------------------------------ HUD: wrist panel, message strip, reticle, comfort */
  const hud = {};
  function canvasPanel(w, h, mw, mh) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    mesh.renderOrder = 998; mesh.frustumCulled = false;
    return { c, g: c.getContext('2d'), tex, mesh, w, h };
  }
  function buildHud() {
    hud.root = new THREE.Group(); hud.root.name = 'vr-hud'; hud.root.visible = false; scene.add(hud.root);
    hud.wrist = canvasPanel(640, 384, 0.17, 0.102);
    hud.feed = canvasPanel(1024, 360, 1.15, 0.405); hud.root.add(hud.feed.mesh); hud.feedYaw = 0;
    // a dot where the gun points
    const dot = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff2b6a, depthTest: false, transparent: true, opacity: 0.9, toneMapped: false }));
    dot.scale.setScalar(0.035); dot.renderOrder = 999; hud.root.add(dot); hud.dot = dot;
    // comfort vignette: darkens the edges while the stick moves you (inside a sphere around the head)
    const vg = document.createElement('canvas'); vg.width = vg.height = 256;
    const gg = vg.getContext('2d'), grd = gg.createRadialGradient(128, 128, 40, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.55, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,1)');
    gg.fillStyle = grd; gg.fillRect(0, 0, 256, 256);
    hud.vig = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(vg), transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
    hud.vig.renderOrder = 1000; hud.vig.frustumCulled = false; hud.vig.position.set(0, 0, -0.16); hud.root.add(hud.vig);
    hud.hurt = 0;
    buildMenu();
  }
  function wrapText(g, text, x, y, maxW, lh, maxLines = 4) {
    const words = String(text).split(/\s+/); let line = '', n = 0;
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y + n * lh); line = w; if (++n >= maxLines) return n; }
      else line = t;
    }
    if (line) { g.fillText(line, x, y + n * lh); n++; }
    return n;
  }
  const FONT = '"Consolas","Menlo","DejaVu Sans Mono",monospace';
  function splitLines(g, text, maxW) {
    const out = []; let line = '';
    for (const w of String(text).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
    if (line) out.push(line);
    return out;
  }
  let wristT = 0;
  function drawWrist() {
    const d = typeof VR.hud === 'function' ? VR.hud() : null;
    const { g, w, h } = hud.wrist;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(8,4,18,.86)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#9b59ff'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    if (!d) { hud.wrist.tex.needsUpdate = true; return; }
    g.textBaseline = 'top';
    const bar = (x, y, bw, bh, f, col) => { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, y, bw, bh); g.fillStyle = col; g.fillRect(x, y, bw * Math.max(0, Math.min(1, f)), bh); };
    g.font = `bold 34px ${FONT}`; g.fillStyle = '#fff'; g.fillText(`HP ${Math.ceil(d.hp ?? 0)}`, 20, 16);
    bar(20, 56, 280, 18, (d.hp ?? 0) / (d.maxHp || 100), '#ff2b6a');
    if (d.armor) { bar(20, 78, 280, 10, d.armor / (d.maxArmor || 100), '#4da6ff'); }
    g.textAlign = 'right'; g.font = `bold 58px ${FONT}`; g.fillStyle = '#ffd400';
    g.fillText(d.ammo ?? '', w - 20, 10);
    g.font = `22px ${FONT}`; g.fillStyle = '#c9b8ff'; g.fillText(String(d.gun || '').slice(0, 26), w - 20, 74);
    g.textAlign = 'left';
    if (d.level) {
      g.font = `bold 26px ${FONT}`; g.fillStyle = '#ffd400'; g.fillText(`LV ${d.level}`, 20, 112);
      bar(110, 118, w - 130, 14, d.xp || 0, '#ffd400');
    }
    g.font = `22px ${FONT}`; g.fillStyle = '#00e5ff';
    let y = 152;
    for (const line of d.lines || []) { if (y > h - 34) break; g.fillStyle = line.c || '#e8e0ff'; y += wrapText(g, line.t, 20, y, w - 40, 28, 2) * 28 + 4; }
    hud.wrist.tex.needsUpdate = true;
  }
  let feedSig = '';
  function drawFeed() {
    const lines = (typeof VR.feed === 'function' ? VR.feed() : []).filter(l => l && l.t);
    const sig = lines.map(l => l.t).join('|');
    hud.feed.mesh.visible = lines.length > 0 && !menu.mesh.visible;
    if (sig === feedSig) return;
    feedSig = sig;
    const { g, w, h } = hud.feed;
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'top';
    let y = 10;
    for (const l of lines) {
      const size = l.size || 34;
      g.font = `${l.bold === false ? '' : 'bold '}${size}px ${FONT}`;
      g.lineWidth = Math.max(4, size / 6); g.strokeStyle = 'rgba(0,0,0,.85)'; g.fillStyle = l.c || '#fff';
      for (const t of splitLines(g, l.t, w - 40).slice(0, 2)) { g.strokeText(t, w / 2, y); g.fillText(t, w / 2, y); y += size * 1.15; }
      y += 8;
      if (y > h - 20) break;
    }
    hud.feed.tex.needsUpdate = true;
  }
  function tickHud(dt) {
    // wrist on the left controller; falls back to a low strip in front of you if there's no left hand
    const L = S.hands.left;
    if (L && hud.wrist.mesh.parent !== L.grip) {
      L.grip.add(hud.wrist.mesh);
      hud.wrist.mesh.position.set(0, 0.035, 0.11);
      hud.wrist.mesh.rotation.set(-Math.PI / 2 + 0.55, 0, 0);
    }
    wristT -= dt; if (wristT <= 0) { wristT = 0.12; drawWrist(); }
    drawFeed();
    // the message strip lazily follows where you look: readable, never glued to your face
    _e.setFromQuaternion(camera.quaternion, 'YXZ');
    let dy = _e.y - hud.feedYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    if (Math.abs(dy) > 0.5 || !hud.feedInit) { hud.feedYaw += dy * (hud.feedInit ? Math.min(1, dt * 3) : 1); hud.feedInit = true; }
    const fx = -Math.sin(hud.feedYaw), fz = -Math.cos(hud.feedYaw);
    hud.feed.mesh.position.set(camera.position.x + fx * 1.6, camera.position.y - 0.28, camera.position.z + fz * 1.6);
    hud.feed.mesh.rotation.set(-0.12, hud.feedYaw, 0, 'YXZ');
    // vignette + hurt flash, glued to the head
    hud.vig.position.copy(camera.position); hud.vig.quaternion.copy(camera.quaternion); hud.vig.translateZ(-0.16);
    const moving = Math.min(1, Math.hypot(stick('left').x, stick('left').y) + Math.abs(window.SAVE?.opts?.vrSmoothTurn ? stick('right').x : 0));
    const want = (window.SAVE?.opts?.vrVignette === false ? 0 : moving * 0.8);
    hud.hurt = Math.max(0, hud.hurt - dt * 2.5);
    hud.vig.material.opacity += (Math.max(want, hud.hurt) - hud.vig.material.opacity) * Math.min(1, dt * 8);
    hud.vig.material.color.setRGB(1, 1 - hud.hurt, 1 - hud.hurt).multiplyScalar(hud.hurt > 0.05 ? 1 : 0);
    // aim dot
    hud.dot.visible = false;
    if (S.gun && S.gun.visible !== false && typeof VR.rayHit === 'function') {
      aim(_v, _v2);
      const t = VR.rayHit(_v, _v2);
      if (t > 0.3) { hud.dot.position.copy(_v).addScaledVector(_v2, t - 0.02); hud.dot.visible = true; hud.dot.scale.setScalar(0.012 + t * 0.006); }
    }
  }
  function hurt(k = 0.5) { hud.hurt = Math.min(0.85, hud.hurt + k); pulse('left', k, 80); pulse('right', k * 0.6, 80); }

  /* ------------------------------------------------------------------ menus: every DOM menu, mirrored onto a panel you point at
   * The layer on top (title, armory, pause, dialogue, cards, results, Fitting Room) comes from js/gamepad.js, so a
   * menu that works on a controller works in VR: the panel shows its heading and buttons, the laser picks one, the
   * trigger clicks the real DOM element. Thumbstick scrolls long lists; B / Y backs out (Escape). */
  const menu = { items: [], scroll: 0, hover: -1, anchorYaw: 0, anchored: false };
  function buildMenu() {
    const p = canvasPanel(1600, 1080, 1.6, 1.08);
    p.mesh.material.depthTest = true; p.mesh.renderOrder = 997; p.mesh.visible = false;
    menu.panel = p; menu.mesh = p.mesh; scene.add(p.mesh);
    menu.lasers = {};
    for (const h of ['left', 'right']) {
      const geo = new THREE.BufferGeometry().setFromPoints([V3(0, 0, 0), V3(0, 0, -1)]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: h === 'right' ? 0xff2bd6 : 0x00e5ff, transparent: true, opacity: 0.85, toneMapped: false }));
      line.visible = false; line.frustumCulled = false; menu.lasers[h] = line;
    }
  }
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  function readLayer(L) {
    const r = L.root;
    const pickText = sel => { for (const n of r.querySelectorAll(sel)) { const t = clean(n.innerText || n.textContent); if (t && n.offsetParent !== null) return t; } return ''; };
    const title = pickText('h1, .logo2, .who, .avc-top h1, h2') || clean(r.id).toUpperCase();
    let body = '';
    if (L.key === 'havenDlg') body = pickText('.txt');
    else body = pickText('.tagline, .txt, .avc-info, .sub, p');
    const els = window.Pad?.items?.(L) || [];
    const items = els.map(n => ({ n, t: clean(n.innerText || n.value || n.textContent).slice(0, 220), card: /arcard|ogcard|avc-card/.test(n.className), on: n.classList.contains('on') || n.classList.contains('sel') }));
    return { title, body, items, key: L.key };
  }
  function layoutMenu(m) {
    const W = menu.panel.w, H = menu.panel.h, pad = 40, top = 210;
    const cards = m.items.filter(i => i.card).length >= 2;
    const cols = cards ? (m.items.filter(i => i.card).length <= 3 ? 3 : 4) : m.items.length > 9 ? 2 : 1;
    const cw = (W - pad * 2 - (cols - 1) * 20) / cols, ch = cards ? (cols === 3 ? 380 : 170) : 84;
    let x = 0, y = 0;
    m.items.forEach((it, i) => {
      if (cards && !it.card && x !== 0) { x = 0; y++; }
      const span = cards && !it.card ? cols : 1;
      it.rect = { x: pad + x * (cw + 20), y: top + y * (ch + 18), w: cw * span + (span - 1) * 20, h: cards && !it.card ? 76 : ch };
      x += span; if (x >= cols) { x = 0; y++; }
      void i;
    });
    const bottom = Math.max(...m.items.map(it => it.rect.y + it.rect.h), top);
    menu.maxScroll = Math.max(0, bottom - (H - 40));
  }
  function drawMenu(m) {
    const { g, w, h } = menu.panel;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(10,5,22,.94)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#9b59ff'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.textBaseline = 'top'; g.textAlign = 'center';
    g.font = `bold 64px ${FONT}`; g.fillStyle = '#ffd400'; g.fillText(m.title.slice(0, 40), w / 2, 30);
    g.font = `30px ${FONT}`; g.fillStyle = '#e8e0ff'; wrapText(g, m.body, w / 2, 112, w - 120, 36, 2);
    g.save(); g.beginPath(); g.rect(0, 190, w, h - 190); g.clip(); g.translate(0, -menu.scroll);
    m.items.forEach((it, i) => {
      const r = it.rect, hov = i === menu.hover;
      g.fillStyle = hov ? 'rgba(255,212,0,.22)' : it.on ? 'rgba(155,89,255,.28)' : 'rgba(255,255,255,.07)';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.lineWidth = hov ? 6 : 2; g.strokeStyle = hov ? '#ffd400' : 'rgba(155,89,255,.7)'; g.strokeRect(r.x, r.y, r.w, r.h);
      g.fillStyle = it.n.disabled ? '#777' : '#fff';
      if (it.card && r.h > 200) {
        g.textAlign = 'left'; g.font = `bold 30px ${FONT}`;
        wrapText(g, it.t, r.x + 20, r.y + 20, r.w - 40, 38, 9);
      } else {
        g.textAlign = 'center'; g.font = `bold ${it.card ? 26 : 34}px ${FONT}`;
        wrapText(g, it.t, r.x + r.w / 2, r.y + (it.card ? 18 : 22), r.w - 30, 36, it.card ? 3 : 1);
      }
    });
    g.restore();
    if (menu.maxScroll > 0) { g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(w - 18, 190 + (h - 230) * (menu.scroll / (menu.maxScroll + h)), 8, (h - 230) * (h / (menu.maxScroll + h))); }
    menu.panel.tex.needsUpdate = true;
  }
  let menuT = 0;
  function tickMenu(dt) {
    const L = window.Pad?.layer?.();
    const show = !!L;
    if (!show) {
      if (menu.mesh.visible) { menu.mesh.visible = false; menu.anchored = false; for (const l of Object.values(menu.lasers)) l.visible = false; }
      return false;
    }
    menuT -= dt;
    if (!menu.mesh.visible || menu.key !== L.key || menuT <= 0) {
      menuT = 0.2;
      const m = readLayer(L);
      layoutMenu(m);
      const sig = m.title + '|' + m.body + '|' + m.items.map(i => i.t + (i.on ? '*' : '')).join('|');
      if (menu.key !== L.key) { menu.scroll = 0; menu.hover = -1; menu.anchored = false; }
      menu.key = L.key; menu.cur = m;
      if (sig !== S.lastPanelSig || !menu.mesh.visible) { S.lastPanelSig = sig; drawMenu(m); }
      menu.mesh.visible = true;
    }
    // place it in front of you; re-centre if you turn well away
    _e.setFromQuaternion(camera.quaternion, 'YXZ');
    let dy = _e.y - menu.anchorYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    if (!menu.anchored || Math.abs(dy) > 1.1 || menu.mesh.position.distanceTo(camera.position) > 3) {
      menu.anchorYaw = _e.y; menu.anchored = true;
      const fx = -Math.sin(_e.y), fz = -Math.cos(_e.y);
      menu.mesh.position.set(camera.position.x + fx * 1.55, camera.position.y - 0.05, camera.position.z + fz * 1.55);
      menu.mesh.rotation.set(0, _e.y, 0);
    }
    // lasers
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(_v.set(0, 0, 1).applyQuaternion(menu.mesh.quaternion), menu.mesh.position);
    let hover = -1;
    for (const h of ['right', 'left']) {
      const H = S.hands[h], line = menu.lasers[h];
      if (!H) { line.visible = false; continue; }
      if (line.parent !== H.ctrl) H.ctrl.add(line);
      line.visible = true;
      H.ctrl.updateMatrixWorld(true);
      const o = H.ctrl.getWorldPosition(V3()), d = V3(0, 0, -1).applyQuaternion(H.ctrl.getWorldQuaternion(_q));
      const ray = new THREE.Ray(o, d), hit = ray.intersectPlane(plane, V3());
      let len = 3;
      if (hit) {
        len = o.distanceTo(hit);
        const loc = menu.mesh.worldToLocal(hit.clone());
        const px = (loc.x / 1.6 + 0.5) * menu.panel.w, py = (0.5 - loc.y / 1.08) * menu.panel.h + menu.scroll;
        if (loc.x > -0.8 && loc.x < 0.8 && loc.y > -0.54 && loc.y < 0.54) {
          const idx = (menu.cur?.items || []).findIndex(it => it.rect && px >= it.rect.x && px <= it.rect.x + it.rect.w && py >= it.rect.y && py <= it.rect.y + it.rect.h && py - menu.scroll > 190);
          if (idx >= 0 && (hover < 0 || h === S.lastLaser)) { hover = idx; if (down(h, BTN.TRIGGER)) { S.lastLaser = h; click(idx); } }
          if (down(h, BTN.TRIGGER)) S.lastLaser = h;
        }
      }
      line.scale.z = len;
    }
    if (hover !== menu.hover) { menu.hover = hover; if (hover >= 0) { pulse(S.lastLaser || 'right', 0.12, 15); window.AR?.Sfx?.ui?.('hover'); } drawMenu(menu.cur); }
    // scroll, back
    const sy = stick('right').y || stick('left').y;
    if (Math.abs(sy) > 0.3 && menu.maxScroll > 0) { menu.scroll = Math.max(0, Math.min(menu.maxScroll, menu.scroll + sy * dt * 900)); drawMenu(menu.cur); }
    if (down('right', BTN.B) || down('left', BTN.B)) window.Pad?.key?.('Escape');
    return true;
  }
  function click(i) {
    const it = menu.cur?.items[i]; if (!it || it.n.disabled) return;
    if (it.n.tagName === 'INPUT' && it.n.type !== 'range') { it.n.focus(); return; }       // the headset's system keyboard takes it
    it.n.click();
    pulse(S.lastLaser || 'right', 0.35, 40);
    menuT = 0; S.lastPanelSig = '';
  }

  /* ------------------------------------------------------------------ per frame */
  function poll(dt) {
    if (!S.active) return;
    pollHands();
    readHead();
    S.inMenu = tickMenu(dt);
    if (!S.inMenu) turn(dt);
    tickHud(dt);
  }

  return {
    BTN, init, enter, exit, poll, place, consumeWalk, down, held, up, stick, trigger, pulse, holdGun, releaseGun, recoil, aim, hurt, refreshHands,
    onStart: f => hooks.start.push(f), onEnd: f => hooks.end.push(f),
    hud: null, feed: null, rayHit: null,
    get supported() { return S.supported; }, get active() { return S.active; }, get inMenu() { return !!S.inMenu; },
    get yaw() { return S.yaw; }, set yaw(v) { S.yaw = v; }, set startYaw(v) { S.startYaw = v; },
    get headYaw() { return _e.setFromQuaternion(camera.quaternion, 'YXZ').y; }, get headPitch() { return _e.setFromQuaternion(camera.quaternion, 'YXZ').x; },
    get crouched() { return S.crouched; }, get head() { return S.hl; }, get hands() { return S.hands; }, get rig() { return { W: S.aW, yaw: S.aYaw }; },
  };
})();

if (typeof window !== 'undefined') window.VR = VR;
