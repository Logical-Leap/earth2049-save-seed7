/* EARTH 2049: SAVE SEED 7 — ARENA player: movement, camera, guns, viewmodel, melee, grenades.
 *
 * Movement is Quake-family: ground acceleration with friction, low air control that never caps speed you
 * already have, so dashes, slides, jump pads and rocket jumps all carry momentum. Jumping on the frame you
 * land skips friction (bunny hops), slides boost you and keep it into a jump, dashes have charges and i-frames.
 *
 * Gunfeel is layered: camera punch that recovers (aim follows the punch, so no recoil fighting), a per-gun
 * spray pattern on the rifle, spread bloom, FOV punch, screen trauma, a spring-driven viewmodel that kicks,
 * rolls and settles, a muzzle flash with real light, ejected brass, tracers, impact sparks and decals,
 * hit-stop on kills, and synthesised layered sound. The viewmodel renders in its own pass so it never clips.
 */
'use strict';

AR.Player = (() => {
  const { V3, clamp, rand, damp } = AR;
  const DEG = Math.PI / 180;
  const G = -24, JUMP = 8.4, AIRJUMP = 7.8, MAXSPD = 7.4, ACCEL = 11, AIRACCEL = 2.4, FRICTION = 8, STOP = 3.2;
  const SPRINT = 1.45;               // SHIFT sprints by default; the JET DASH sponsor swaps sprint for the dash
  const EYE = 1.62, CROUCH_EYE = 0.98;

  const keys = {};
  const I = { fire: false, ads: false, lookX: 0, lookY: 0, jump: 0, dash: false, crouch: false, reload: false, kick: false, nade: false, use: false, swap: 0,
    padX: 0, padZ: 0, padSprint: false };
  let camera = null, vmScene = null, vmCam = null, vmPass = null, vmRoot = null, vmLight = null, vmAmb = null, boot = null;
  let P = null, S = null;
  const guns = {};          // 'id:tier' -> first-person model from AR.Arsenal
  let muzzle = null, muzzleLight = null, scopeEl = null;
  const _fwd = V3(), _right = V3(), _tmp = V3(), _a = V3(), _b = V3(), _col = new THREE.Color();
  const PATTERN = [0, 0.15, 0.3, 0.38, 0.3, 0.1, -0.15, -0.35, -0.45, -0.35, -0.1, 0.2, 0.45, 0.55, 0.4, 0.1, -0.2, -0.45, -0.5, -0.3];

  /* ================================================================== setup */
  function init(cam, composer) {
    camera = cam;
    vmScene = new THREE.Scene();
    vmCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
    vmAmb = new THREE.AmbientLight(0xffffff, 0.9); vmScene.add(vmAmb);
    vmLight = new THREE.DirectionalLight(0xffffff, 0.9); vmLight.position.set(0.5, 1, 0.6); vmScene.add(vmLight);
    muzzleLight = new THREE.PointLight(0xffc070, 0, 4, 2); muzzleLight.position.set(0.2, -0.1, -0.8); vmScene.add(muzzleLight);
    vmRoot = new THREE.Group(); vmScene.add(vmRoot);
    muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: Assets.starTex(), color: 0xfff0b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    muzzle.scale.setScalar(0.5);
    boot = buildBoot(); vmScene.add(boot);
    vmPass = new THREE.RenderPass(vmScene, vmCam);
    vmPass.clear = false; vmPass.clearDepth = true;
    scopeEl = AR.el('arScope');
    installInput();
    attachPass(composer);
  }
  function attachPass(composer) {
    if (!composer || composer.passes.includes(vmPass)) return;
    // after bloom (a gun this close to the lens would bloom into a white blob), before the final PS1 colour pass
    composer.passes.splice(Math.max(1, composer.passes.length - 1), 0, vmPass);
  }
  function detachPass(composer) {
    const i = composer?.passes.indexOf(vmPass);
    if (i >= 0) composer.passes.splice(i, 1);
  }
  function buildBoot() {
    const g = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0x5a2fa0 }), sole = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }), glow = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), new THREE.MeshLambertMaterial({ color: 0x23202e }));
    shin.position.set(0, 0.3, 0.12);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.42), m); foot.position.set(0, 0, -0.08);
    const so = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.44), sole); so.position.set(0, -0.09, -0.08);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.03, 0.3), glow); st.position.set(0, 0.03, -0.1);
    g.add(shin, foot, so, st);
    g.visible = false;
    return g;
  }

  /* ================================================================== input */
  let installed = false;
  function installInput() {
    if (installed) return; installed = true;
    const on = () => AR.active && !AR.paused && !AR.menu;
    addEventListener('keydown', e => {
      if (!AR.active) return;
      keys[e.code] = true;
      if (!on()) return;
      switch (e.code) {
        case 'Space': I.jump = 0.14; e.preventDefault(); break;
        case 'ShiftLeft': case 'ShiftRight': if (S?.dashMode) I.dash = true; break;
        case 'ControlLeft': case 'KeyC': I.crouch = true; e.preventDefault(); break;
        case 'KeyR': I.reload = true; break;
        case 'KeyF': case 'KeyV': I.kick = true; break;
        case 'KeyG': I.nade = true; break;
        case 'KeyE': I.use = true; break;
        case 'KeyQ': I.swap = -1; break;
        case 'Digit1': I.swap = 1; break;
        case 'Digit2': I.swap = 2; break;
        default:
      }
    }, true);
    addEventListener('keyup', e => {
      keys[e.code] = false;
      if (e.code === 'ControlLeft' || e.code === 'KeyC') I.crouch = false;
    }, true);
    const cv = AR.el('c');
    cv.addEventListener('mousedown', e => {
      if (!AR.active) return;
      if (!AR.pointerLocked() && !AR.freeLook) { AR.lockPointer(); return; }
      if (!on()) return;
      if (e.button === 0) I.fire = true;
      if (e.button === 2) I.ads = true;
      if (e.button === 1) I.kick = true;
    });
    addEventListener('mouseup', e => { if (e.button === 0) I.fire = false; if (e.button === 2) I.ads = false; });
    addEventListener('mousemove', e => {
      if (!on() || !(AR.pointerLocked() || (AR.freeLook && e.target === cv))) return;
      I.lookX += e.movementX; I.lookY += e.movementY;
    });
    addEventListener('wheel', e => { if (on()) I.swap = -1; }, { passive: true });
  }
  function clearInput() { for (const k of Object.keys(keys)) keys[k] = false; Object.assign(I, { fire: false, ads: false, lookX: 0, lookY: 0, jump: 0, dash: false, crouch: false, reload: false, kick: false, nade: false, use: false, swap: 0, padX: 0, padZ: 0, padSprint: false }); }

  /* ================================================================== run state */
  function newStats() {
    return { dmg: 0, rate: 0, crit: 0.04, mag: 0, reload: 1, leech: 0, speed: 0, chips: 0, styleDrain: 1, airJumps: 1, dashes: 2, dashCd: 1, dashMode: false,
      ricochet: 0, volatile: 0, ragebait: 0, headRefund: 0, kick: 1, kickDash: false, slideHit: false, copium: false, burn: 0, split: false,
      cancel: false, buddy: 0, viral: false, overshield: 0 };
  }
  function makeGun(id, tier = 0) {
    const d = AR.GUNS[id];
    return { id, d, tier, ammo: Math.round(d.mag * (1 + tier * 0.08)), reserve: d.reserve, fireT: 0, bloom: 0, shot: 0, lastShot: 0, reloadT: 0, reloading: false, shellQ: 0, openT: 0, drum: 0 };
  }
  function reset(spawn, primary) {
    S = newStats();
    P = {
      body: { pos: V3(spawn.x, spawn.y, spawn.z), vel: V3(), r: 0.38, h: 1.8, onGround: true, step: 0.55 },
      yaw: spawn.yaw || 0, pitch: -0.05, eye: EYE, punchP: 0, punchY: 0, punchVP: 0, punchVY: 0,
      hp: 100, maxHp: 100, armor: 25, maxArmor: 100, shield: 0, shieldT: 0, iframes: 0, alive: true,
      guns: [makeGun('pistol'), primary ? makeGun(primary) : null], cur: primary ? 1 : 0, swapT: 0.35,
      airJumpsUsed: 0, coyote: 0, groundT: 0, airT: 0, dashCharges: 2, dashRe: 0, dashT: 0, dashDir: V3(),
      slideT: 0, slideCd: 0, crouching: false, padT: 0, kickT: 0, kickCd: 0, nades: 2, nadeRe: 0,
      ads: 0, trauma: 0, fovPunch: 0, landDip: 0, tilt: 0, bobT: 0, stepT: 0, lastHurtT: 0, lowBeatT: 0,
      vm: { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, vpx: 0, vpy: 0, vpz: 0, vrx: 0, vry: 0, vrz: 0 }, swayX: 0, swayY: 0,
      lastSafe: V3(spawn.x, spawn.y, spawn.z), safeT: 0, speed: 0, hitstopShake: 0,
    };
    clearInput();
    showGun();
  }

  /* ================================================================== the art department's first-person rig
   * When js/gunfeel.js is loaded (gloved hands, draw, per-gun reload choreography, pump/bolt cycling, casings,
   * layered rarity audio), it drives the viewmodel. The arena keeps ballistics, damage and feel on the camera.
   * Its weapon object uses clip/ammo/rar; this adapter maps those onto the arena gun (ammo = mag, reserve, tier). */
  let GF = null;
  const gfOn = () => !!(GF && window.GunFeel && GunFeel.active);
  function gfWeapon(g) {
    if (!g.gf) g.gf = { id: g.id, get rar() { return g.tier || 0; }, get clip() { return g.ammo; }, set clip(v) { g.ammo = v; },
      get ammo() { return g.reserve; }, set ammo(v) { g.reserve = v; } };
    return g.gf;
  }
  function useGunFeel(gunGroup) {
    if (!window.GunFeel || !gunGroup || !AssetLoader?.getModel?.('weapon.ar')?.scene?.userData?.weapon) { GF = null; return false; }
    GF = { gunGroup };
    return true;
  }

  /* ================================================================== helpers */
  const gun = () => P.guns[P.cur];
  function eyePos(out) { return out.set(P.body.pos.x, P.body.pos.y + P.eye, P.body.pos.z); }
  function aimDir(out) {
    const c = gfOn() ? GunFeel.cam : null;
    const yaw = P.yaw + P.punchY + (c ? c.yaw : 0), pitch = P.pitch + P.punchP + (c ? c.pitch : 0);
    return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }
  function addTrauma(t) { P.trauma = Math.min(1, P.trauma + t); }
  function magSize(g) {
    if (GF && window.GunFeel) return GunFeel.magSize(g.id, g.tier || 0);           // the gun's real magazine for its rarity
    return Math.max(1, Math.round(g.d.mag * (1 + S.mag + (g.tier || 0) * 0.08)));
  }
  /** First-person model for a gun instance: the Arsenal GLB at its rarity (cached per gun + tier). */
  function vmOf(g) {
    const k = g.id + ':' + g.tier;
    if (!guns[k]) {
      const v = AR.Arsenal.build(g.id, g.tier);
      if (!v) return null;
      v.eject = new THREE.Object3D(); v.eject.position.copy(v.anchors.eject || v.tip.position); v.root.add(v.eject);
      v.root.visible = false; vmRoot.add(v.root);
      guns[k] = v;
    }
    return guns[k];
  }
  function showGun() {
    for (const k of Object.keys(guns)) guns[k].root.visible = false;
    const g = gun(); if (!g) return;
    if (GF) {
      if (g.ammo > magSize(g)) { const x = g.ammo - magSize(g); g.ammo = magSize(g); if (g.reserve !== Infinity) g.reserve += x; }
      GF.gunGroup.visible = true;
      const r = GunFeel.equip(gfWeapon(g));
      GunFeel.setVisible(true);
      if (r) { GF.tip = r.tip; AR.Hud?.weapon(g, P); return; }
    }
    const v = vmOf(g); if (!v) return;
    v.root.visible = true;
    v.tip.add(muzzle);
    AR.Hud?.weapon(g, P);
  }
  function swapTo(i) {
    if (i === P.cur || !P.guns[i] || P.swapT > 0.05) return;
    const g = gun(); g.reloading = false; g.shellQ = 0;
    P.cur = i; P.swapT = 0.3;
    showGun(); AR.Sfx.reload(null, 'out');
  }

  /* ================================================================== movement */
  function accelerate(v, wx, wz, wishSpeed, accel, dt) {
    const cur = v.x * wx + v.z * wz;
    const add = wishSpeed - cur;
    if (add <= 0) return;
    const a = Math.min(accel * wishSpeed * dt, add);
    v.x += a * wx; v.z += a * wz;
  }
  function friction(v, dt, f) {
    const sp = Math.hypot(v.x, v.z);
    if (sp < 0.01) { v.x = 0; v.z = 0; return; }
    const drop = Math.max(sp, STOP) * f * dt;
    const k = Math.max(0, sp - drop) / sp;
    v.x *= k; v.z *= k;
  }
  function move(dt) {
    const b = P.body, v = b.vel;
    let mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + I.padX, mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + I.padZ;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    let wx = mx * cy - mz * sy, wz = -mx * sy - mz * cy;
    const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
    const analog = Math.min(1, wl);                                     // a half-pushed stick walks
    // sprint: hold SHIFT (or click the left stick) while moving forward; firing, aiming, crouching or reloading breaks it
    const wantSprint = !S.dashMode && (keys.ShiftLeft || keys.ShiftRight || I.padSprint) && mz > 0.35 && !I.ads && !I.fire && !P.crouching && !gun()?.reloading;
    P.sprinting = wantSprint && (b.onGround || P.sprinting);
    if (!wantSprint) I.padSprint = I.padSprint && mz > 0.35 && !I.fire;
    P.sprintK = damp(P.sprintK || 0, P.sprinting ? 1 : 0, 8, dt);
    const maxSpd = MAXSPD * (1 + S.speed + (S.dashMode ? 0.08 : 0)) * (1 + (SPRINT - 1) * P.sprintK) * Math.max(0.35, analog) * (P.ads > 0.5 ? 0.72 : 1) * (P.crouching && P.slideT <= 0 ? 0.5 : 1);
    const wasGround = b.onGround;

    // timers
    P.coyote = b.onGround ? 0.12 : Math.max(0, P.coyote - dt);
    if (I.jump > 0) I.jump -= dt;
    P.dashRe -= dt;
    if (P.dashCharges < S.dashes && P.dashRe <= 0) { P.dashCharges++; P.dashRe = 1.45 * S.dashCd; }
    P.slideCd -= dt; P.padT -= dt; P.iframes -= dt;

    // dash
    if (I.dash && S.dashMode && P.dashCharges > 0) {
      P.dashCharges--; if (P.dashRe <= 0) P.dashRe = 1.45 * S.dashCd;
      let dx = wx, dz = wz;
      if (!wl) { dx = -sy; dz = -cy; }
      P.dashDir.set(dx, 0, dz); P.dashT = 0.15; P.iframes = Math.max(P.iframes, 0.22);
      P.fovPunch += 9; AR.Sfx.dash(); AR.Hud?.flash('dash'); if (window.Wardrobe?.ready) window.Wardrobe.bump('dashes');
      AR.Fx.emit(AR.Fx.glow, b.pos.x, b.pos.y + 0.9, b.pos.z, 0x00e5ff, 14, 3, 0.35, { up: 0 });
      AR.Mission?.style('dash');
    }
    I.dash = false;
    if (P.dashT > 0) {
      P.dashT -= dt;
      v.x = P.dashDir.x * 25; v.z = P.dashDir.z * 25; if (v.y < 0) v.y = 0;
      if (P.dashT <= 0) { v.x = P.dashDir.x * 11.5; v.z = P.dashDir.z * 11.5; }
    }

    // crouch / slide
    const hs = Math.hypot(v.x, v.z);
    if (I.crouch && b.onGround && P.slideT <= 0 && P.slideCd <= 0 && hs > 6.0) {
      P.slideT = 0.85; P.slideCd = 0.55;
      const boost = Math.min(4.2, Math.max(0, 15 - hs));
      v.x += v.x / hs * boost; v.z += v.z / hs * boost;
      AR.Sfx.slide(true); P.fovPunch += 4; addTrauma(0.08);
      AR.Mission?.style('slide');
    }
    if (P.slideT > 0) { P.slideT -= dt; if (!I.crouch || !b.onGround && P.slideT < 0.6) P.slideT = Math.min(P.slideT, 0.05); }
    P.crouching = I.crouch || P.slideT > 0;

    // jump (buffered) — jump during slide keeps the boost; bunny hop: jumping on landing skips friction
    let jumped = false;
    if (I.jump > 0) {
      if (b.onGround || P.coyote > 0) {
        v.y = JUMP; b.onGround = false; P.coyote = 0; I.jump = 0; jumped = true; P.airJumpsUsed = 0;
        AR.Sfx.jump(false);
        if (P.slideT > 0) { P.slideT = 0; AR.Mission?.style('slidejump'); }
      } else if (P.airJumpsUsed < S.airJumps && P.padT <= 0) {
        P.airJumpsUsed++; v.y = AIRJUMP; I.jump = 0; jumped = true;
        if (wl) { const sp = Math.max(Math.hypot(v.x, v.z), maxSpd * 0.85); v.x = wx * sp; v.z = wz * sp; }   // air jump redirects
        AR.Sfx.jump(true);
        AR.Fx.emit(AR.Fx.glow, b.pos.x, b.pos.y + 0.1, b.pos.z, 0x9b59ff, 12, 2.5, 0.3, { up: -1 });
      }
    }
    if (jumped && window.Wardrobe?.ready) window.Wardrobe.bump('jumps');

    if (P.dashT <= 0) {
      if (b.onGround && !jumped) {
        if (P.slideT > 0) friction(v, dt, 0.55);
        else if (P.groundT > 0.03 || !wasGround) friction(v, dt, FRICTION);
        accelerate(v, wx, wz, P.slideT > 0 ? 2 : maxSpd, ACCEL, dt);
      } else {
        accelerate(v, wx, wz, maxSpd, P.padT > 0 ? AIRACCEL * 0.5 : AIRACCEL, dt);
      }
    }

    const r = AR.World.moveBody(b, dt, G);
    P.groundT = b.onGround ? P.groundT + dt : 0;
    if (b.onGround) { P.airJumpsUsed = 0; P.airT = 0; } else P.airT += dt;
    if (r.landed) {
      const hard = clamp(-r.impactVy / 18, 0, 1);
      P.landDip = Math.min(0.26, 0.05 + hard * 0.22);
      if (hard > 0.2) { AR.Sfx.land(hard); addTrauma(hard * 0.18); }
    }
    // jump pads
    const pad = AR.Mission?.padAt(b.pos.x, b.pos.y, b.pos.z);
    if (pad && P.padT <= 0) launchPad(pad);

    // out of the world: back to the last safe ground
    P.safeT -= dt;
    if (b.onGround && P.safeT <= 0) { P.lastSafe.copy(b.pos); P.safeT = 0.5; }
    if (b.pos.y < -12) { b.pos.copy(P.lastSafe); v.set(0, 0, 0); takeDamage(10, null, 'fall'); }

    P.speed = Math.hypot(v.x, v.z);
    // footsteps
    if (b.onGround && P.speed > 2 && P.slideT <= 0) {
      P.stepT -= dt * P.speed;
      if (P.stepT <= 0) { P.stepT = 2.6; AR.Sfx.step(P.speed > 7); }
      P.bobT += dt * P.speed * 1.25;
    }
  }
  function launchPad(pad) {
    const b = P.body, t = pad.target, apex = Math.max(t[1], b.pos.y) + 2.6;
    const vy = Math.sqrt(2 * -G * (apex - b.pos.y));
    const T = vy / -G + Math.sqrt(2 * (apex - t[1]) / -G);
    b.vel.set((t[0] - b.pos.x) / T, vy, (t[2] - b.pos.z) / T);
    b.onGround = false; P.padT = T * 0.85; P.airJumpsUsed = 0;
    AR.Sfx.pad(); P.fovPunch += 10; addTrauma(0.15);
    AR.Fx.emit(AR.Fx.glow, b.pos.x, b.pos.y + 0.2, b.pos.z, 0x00e5ff, 30, 4, 0.5, { up: 6 });
    AR.Mission?.style('pad');
  }

  /* ================================================================== look + camera */
  function look(rdt) {
    const sens = 0.0021 * (SAVE?.opts?.sens || 1) * (gfOn() ? GunFeel.sensMul : (1 - P.ads * (1 - (gun()?.d.ads || 0.8)) * 0.9));
    P.yaw -= I.lookX * sens; P.pitch = clamp(P.pitch - I.lookY * sens, -1.5, 1.5);
    P.swayX = AR.damp(P.swayX, clamp(-I.lookX * 0.0009, -0.05, 0.05), 14, rdt);
    P.swayY = AR.damp(P.swayY, clamp(I.lookY * 0.0009, -0.05, 0.05), 14, rdt);
    I.lookX = 0; I.lookY = 0;
  }
  function cameraTick(dt, rdt) {
    const b = P.body;
    // punch recovery: critically-damped spring back to 0
    const k = 140, c = 2 * Math.sqrt(k);
    const rec = gun()?.d.recover || 8;
    P.punchVP += (-k * P.punchP - c * P.punchVP) * dt * (rec / 8); P.punchP += P.punchVP * dt;
    P.punchVY += (-k * P.punchY - c * P.punchVY) * dt * (rec / 8); P.punchY += P.punchVY * dt;
    // eye height: crouch/slide, smoothed (also smooths stair steps)
    const wantEye = P.crouching ? CROUCH_EYE : EYE;
    P.eye = damp(P.eye, wantEye, 14, dt);
    P.landDip = damp(P.landDip, 0, 9, dt);
    const smoothY = P.camY === undefined ? b.pos.y : (P.camY = damp(P.camY, b.pos.y, b.pos.y > P.camY ? 22 : 60, dt));
    if (P.camY === undefined) P.camY = b.pos.y;
    const bob = b.onGround && P.slideT <= 0 ? Math.min(1, P.speed / 8) : 0;
    const bobY = Math.abs(Math.sin(P.bobT)) * 0.045 * bob * (1 - P.ads * 0.8), bobX = Math.sin(P.bobT) * 0.025 * bob;
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    camera.position.set(b.pos.x + bobX * cy, smoothY + P.eye + bobY - P.landDip, b.pos.z - bobX * sy);
    // strafe tilt + slide tilt
    const strafe = (b.vel.x * cy - b.vel.z * sy) / MAXSPD;
    P.tilt = damp(P.tilt, -strafe * 0.022 + (P.slideT > 0 ? 0.06 : 0), 10, dt);
    // trauma shake (squared), decays
    P.trauma = Math.max(0, P.trauma - rdt * 1.6);
    const sh = P.trauma * P.trauma, t = performance.now() / 1000;
    const nx = Math.sin(t * 61) * 0.6 + Math.sin(t * 23.7) * 0.4, ny = Math.sin(t * 53 + 1) * 0.6 + Math.sin(t * 31.3) * 0.4, nz = Math.sin(t * 47 + 2);
    const gc = gfOn() ? GunFeel.cam : { pitch: 0, yaw: 0, roll: 0 };
    camera.rotation.set(P.pitch + P.punchP + gc.pitch + ny * sh * 0.05, P.yaw + P.punchY + gc.yaw + nx * sh * 0.05, P.tilt + gc.roll + nz * sh * 0.06);
    // FOV: base + speed + punches, ADS zoom
    P.fovPunch = damp(P.fovPunch, 0, 7, rdt);
    const g = gun();
    const adsK = gfOn() ? GunFeel.fov / 75 : 1 - P.ads * (1 - (g?.d.ads || 0.8));
    const fov = (AR.fov + Math.max(0, P.speed - MAXSPD * SPRINT) * 0.9 + (P.sprintK || 0) * 6 + P.fovPunch) * adsK;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    vmCam.aspect = camera.aspect; vmCam.updateProjectionMatrix();
    // listener for positional audio
    AR.Sfx.listener.x = camera.position.x; AR.Sfx.listener.y = camera.position.y; AR.Sfx.listener.z = camera.position.z; AR.Sfx.listener.yaw = P.yaw;
    // viewmodel light follows the level light at the player
    P.lightT = (P.lightT || 0) - dt;
    if (P.lightT <= 0) {
      P.lightT = 0.15;
      AR.World.probeAt(b.pos.x, b.pos.y + 1.4, b.pos.z, _col);
      vmAmb.color.copy(_col).multiplyScalar(1.15).addScalar(0.3);
      vmLight.color.copy(_col).multiplyScalar(0.8).addScalar(0.35);
    }
  }

  /* ================================================================== viewmodel */
  function spring(vm, dt) {
    const k = 190, c = 17;
    for (const a of ['px', 'py', 'pz', 'rx', 'ry', 'rz']) {
      const vk = 'v' + a;
      vm[vk] += (-k * vm[a] - c * vm[vk]) * dt;
      vm[a] += vm[vk] * dt;
    }
  }
  function viewmodelTick(dt) {
    const g = gun(); if (!g) return;
    if (gfOn()) {
      vmRoot.visible = false;
      if (scopeEl) scopeEl.classList.remove('on');
      bootTick();
      return;
    }
    const v = vmOf(g), vm = P.vm;
    if (!v) return;
    spring(vm, dt);
    const b = P.body;
    const bob = b.onGround && P.slideT <= 0 ? Math.min(1, P.speed / 8) : 0;
    const ads = P.ads, e = ads * ads * (3 - 2 * ads);
    // reload / swap / kick poses
    let rx = 0, rz = 0, dy = 0, rp = 0;
    if (g.reloading) {
      rp = g.d.shellReload ? 0.5 : Math.min(1, 1 - g.reloadT / (g.d.reload * S.reload));
      const t = g.d.shellReload ? 0.55 : Math.sin(rp * Math.PI);
      rx = -0.28 * t; rz = 0.5 * t; dy = -0.05 * t;
    }
    if (P.swapT > 0) { dy -= P.swapT * 0.9; rx -= P.swapT * 1.2; }
    if (P.kickT > 0) { dy -= 0.08; rz -= 0.2; }
    if (P.slideT > 0) { rz += 0.16; dy -= 0.015; }
    if (!b.onGround) dy += clamp(-b.vel.y * 0.003, -0.03, 0.025);
    const air = b.onGround ? 1 : 0.3;
    // hip: the grip anchor sits low right; ADS: the sight line sits on the camera axis
    const Ds = g.id === 'pistol' ? 0.38 : g.d.scope ? 0.26 : 0.33;
    const hx = g.id === 'pistol' ? 0.13 : 0.145, hy = -0.165, hz = g.id === 'pistol' ? -0.36 : -0.31;
    const ax = AR.lerp(v.anchors.grip?.x || 0, v.sightA.x, e), ay = AR.lerp(v.anchors.grip?.y || 0, v.sightA.y, e), az = AR.lerp(v.anchors.grip?.z || 0, v.sightA.z, e);
    v.root.position.set(-ax, -ay, -az);
    const sway = 1 - e * 0.75;
    vmRoot.position.set(
      AR.lerp(hx, 0, e) + Math.sin(P.bobT) * 0.008 * bob * air * (1 - e) + P.swayX * 0.6 * sway + vm.px * 0.5,
      AR.lerp(hy, 0, e) + Math.abs(Math.cos(P.bobT)) * 0.008 * bob * air * (1 - e) + P.swayY * 0.6 * sway + dy + vm.py * 0.5 - P.landDip * 0.15,
      AR.lerp(hz, -Ds, e) + vm.pz * 0.5);
    vmRoot.rotation.set(rx + vm.rx * (1 - e * 0.6), vm.ry + P.swayX * 0.6 * sway + 0.03 * (1 - e), rz + vm.rz + P.swayX * 1.1 * sway - P.tilt * 1.4 * (1 - e));
    vmRoot.scale.setScalar(1);
    // moving parts (gun space: back is -Z)
    const pr = v.parts, since = (performance.now() - g.lastShot) / 1000;
    g.slideK = Math.max(0, (g.slideK || 0) - dt * 13);
    if (pr.slide) pr.slide.o.position.z = pr.slide.p.z - (g.ammo === 0 && !g.reloading ? 1 : g.slideK) * 0.034;   // slide locks back on empty
    if (pr.bolt) {
      let k = g.slideK;
      if (g.id === 'dmr') k = since < 0.22 ? 0 : since < 0.36 ? (since - 0.22) / 0.14 : since < 0.46 ? 1 : since < 0.6 ? 1 - (since - 0.46) / 0.14 : 0;
      pr.bolt.o.position.z = pr.bolt.p.z - k * (g.id === 'dmr' ? 0.075 : 0.045);
      if (pr.round) pr.round.o.visible = g.id === 'dmr' && since > 0.36 && since < 0.52;
    }
    if (pr.pump) {
      const k = since < 0.24 ? 0 : since < 0.34 ? (since - 0.24) / 0.1 : since < 0.38 ? 1 : since < 0.48 ? 1 - (since - 0.38) / 0.1 : 0;
      const rk = g.reloading && g.ammo >= magSize(g) - 0 ? 0 : 0;
      pr.pump.o.position.z = pr.pump.p.z - (g.shot ? k : 0) * 0.09 - rk;
    }
    if (pr.drum) { g.drumA = AR.damp(g.drumA || 0, g.shot * Math.PI / 3, 18, dt); pr.drum.o.rotation.z = g.drumA; }
    if (pr.cover) pr.cover.o.rotation.x = -(g.reloading ? Math.sin(rp * Math.PI) : 0) * 1.1;
    if (pr.spin_barrel) { g.spin = AR.damp(g.spin || 0, I.fire && !g.reloading ? 26 : 0, 4, dt); pr.spin_barrel.o.rotation.z += g.spin * dt; }
    if (pr.spin_coil) pr.spin_coil.o.rotation.z += dt * (2 + (since < 0.3 ? 14 : 0));
    if (pr.spin_halo) pr.spin_halo.o.rotation.z += dt * 1.5;
    if (pr.mag) {
      let off = 0;
      if (g.reloading && !g.d.shellReload) off = rp < 0.1 ? 0 : rp < 0.32 ? (rp - 0.1) / 0.22 : rp < 0.58 ? 1 : rp < 0.8 ? 1 - (rp - 0.58) / 0.22 : 0;
      pr.mag.o.position.y = pr.mag.p.y - off * 0.2; pr.mag.o.position.z = pr.mag.p.z - off * 0.04;
      pr.mag.o.visible = !(rp > 0.36 && rp < 0.52);
    }
    if (pr.shell) {
      const inserting = g.reloading && g.d.shellReload && g.reloadT > 0;
      pr.shell.o.visible = inserting;
      if (inserting) { const k = 1 - g.reloadT / (g.d.reload * S.reload); pr.shell.o.position.y = pr.shell.p.y - 0.06 * (1 - Math.min(1, k * 1.4)); }
    }
    muzzle.material.opacity = Math.max(0, muzzle.material.opacity - dt * 16);
    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 120);
    // scope: at full ADS a marksman rifle hides the gun and shows the scope overlay
    const scoped = g.d.scope && ads > 0.85;
    vmRoot.visible = !scoped;
    if (scopeEl) scopeEl.classList.toggle('on', !!scoped);
    bootTick();
  }
  function bootTick() {
    if (P.kickT > 0) {
      const t = 1 - P.kickT / 0.32, k = Math.sin(Math.min(1, t * 1.6) * Math.PI);
      boot.visible = true;
      boot.position.set(0.05, -0.55 + k * 0.32, -0.25 - k * 0.55);
      boot.rotation.set(-0.9 + k * 0.6, 0.1, 0.05);
    } else boot.visible = false;
  }

  /* ================================================================== shooting */
  function spreadRad(g) {
    const d = g.d;
    let s = AR.lerp(d.spread, d.adsSpread, P.ads) + g.bloom;
    if (!P.body.onGround) s += 1.2 * (1 - P.ads * 0.6);
    else if (P.speed > 3) s += 0.5 * (1 - P.ads * 0.6) * Math.min(1, P.speed / 8);
    if (P.slideT > 0) s *= 0.8;
    return s * DEG;
  }
  function fireTick(dt) {
    const g = gun(); if (!g) return;
    const d = g.d;
    g.fireT -= dt;
    g.bloom = Math.max(0, g.bloom - d.bloomRecover * dt * (g.fireT < -0.1 ? 1.5 : 1));
    if (performance.now() - g.lastShot > 320) g.shot = 0;
    if (gfOn()) { gfFireTick(g, d, dt); return; }
    // reload
    if (I.reload) { I.reload = false; startReload(g); }
    if (g.reloading) {
      g.reloadT -= dt;
      if (d.shellReload) {
        if (g.reloadT <= 0) {
          if (g.ammo < magSize(g) && g.reserve > 0) {
            g.ammo++; if (g.reserve !== Infinity) g.reserve--;
            AR.Sfx.reload(g.id, 'shell'); P.vm.vrx += 1.5; P.vm.vpy += 0.15;
            g.reloadT = d.reload * S.reload;
          }
          if (g.ammo >= magSize(g) || g.reserve <= 0) { g.reloading = false; AR.Sfx.reload(g.id, 'rack'); P.vm.vrx -= 3; }
        }
        if (I.fire && g.ammo > 0 && g.reloadT < d.reload * S.reload * 0.7) g.reloading = false;      // fire interrupts shell reload
      } else if (g.reloadT <= 0) {
        const need = magSize(g) - g.ammo, take = g.reserve === Infinity ? need : Math.min(need, g.reserve);
        g.ammo += take; if (g.reserve !== Infinity) g.reserve -= take;
        g.reloading = false; AR.Sfx.reload(g.id, 'rack'); P.vm.vrx -= 4; P.vm.vpz -= 0.4;
        AR.Hud?.weapon(g, P);
      } else if (!g.inPlayed && g.reloadT < d.reload * S.reload * 0.45) { g.inPlayed = true; AR.Sfx.reload(g.id, 'in'); P.vm.vry += 1.5; }
      if (g.reloading) return;
    }
    if (!I.fire || P.swapT > 0 || P.kickT > 0.1) return;
    if (g.fireT > 0) return;
    if (g.ammo <= 0) {
      if (!g.dryT || performance.now() - g.dryT > 300) { AR.Sfx.dry(); g.dryT = performance.now(); }
      if (g.reserve <= 0 && P.cur === 1) { swapTo(0); AR.Hud.toast('PRIMARY DRY', 'SIDEARM OUT // FIND AMMO'); return; }
      startReload(g); return;
    }
    const interval = 60 / (d.rpm * (1 + S.rate) * (AR.Mission?.adrenal() || 1));
    g.fireT += interval; if (g.fireT < -interval) g.fireT = 0;
    g.ammo--; g.lastShot = performance.now();
    shoot(g);
    if (g.ammo === 0 && g.reserve > 0) setTimeout(() => { if (P && gun() === g && g.ammo === 0) startReload(g); }, 160);
  }
  function gfFireTick(g, d, dt) {
    const w = gfWeapon(g);
    g.reloading = GunFeel.reloading;
    if (I.reload) { I.reload = false; GunFeel.reload(w); }
    if (!I.fire || P.swapT > 0 || P.kickT > 0.1 || g.fireT > 0) return;
    if (!GunFeel.canFire(w)) return;
    if (g.ammo <= 0) {
      if (!GunFeel.reload(w)) {
        GunFeel.dryFire(); g.fireT = 0.3;
        if (g.reserve <= 0 && P.cur === 1) { swapTo(0); AR.Hud.toast('PRIMARY DRY', 'SIDEARM OUT // FIND AMMO'); }
      }
      return;
    }
    const interval = 60 / (d.rpm * (1 + S.rate) * (AR.Mission?.adrenal() || 1));
    g.fireT += interval; if (g.fireT < -interval) g.fireT = 0;
    g.ammo--; g.lastShot = performance.now();
    shoot(g);
    const k = GunFeel.fire(w);                                 // hands, flash, casings, rarity audio; returns the climb
    P.pitch = clamp(P.pitch + k.pitch, -1.5, 1.5); P.yaw += k.yaw;
    void dt;
  }
  function startReload(g) {
    if (g.reloading || g.ammo >= magSize(g) || g.reserve <= 0) return;
    g.reloading = true; g.inPlayed = false;
    g.reloadT = g.d.shellReload ? (g.d.reloadOpen || 0.3) : g.d.reload * S.reload;
    AR.Sfx.reload(g.id, 'out'); P.vm.vrz += 2;
  }

  function vmToWorld(obj, out) {
    obj.getWorldPosition(out);
    out.applyMatrix4(vmCam.matrixWorldInverse);
    out.applyMatrix4(camera.matrixWorld);
    return out;
  }
  function muzzleWorld(out) {
    if (gfOn() && GF.tip) return GF.tip.getWorldPosition(out);
    const v = vmOf(gun());
    v.tip.getWorldPosition(out);                                    // in viewmodel space
    // map viewmodel-space point to the world: viewmodel camera sits at the origin looking -Z, same as the camera
    out.applyMatrix4(vmCam.matrixWorldInverse);
    out.applyMatrix4(camera.matrixWorld);
    return out;
  }
  function shoot(g) {
    const d = g.d;
    const origin = eyePos(_a);
    const spread = spreadRad(g);
    const pattern = d.pattern ? PATTERN[g.shot % PATTERN.length] : 0;
    aimDir(_fwd);
    _right.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    const upv = _tmp.copy(_right).cross(_fwd).normalize();
    const mz = muzzleWorld(_b);
    const copium = S.copium && P.hp < P.maxHp * 0.35;
    const dmgMult = (1 + S.dmg) * (1 + (g.tier || 0) * 0.1) * (copium ? 1.4 : 1) * (AR.Mission?.dmgMult() || 1);
    const shots = d.pellets + (S.split && d.pellets === 1 ? 1 : 0);
    for (let k = 0; k < shots; k++) {
      // uniform disc spread
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * Math.tan(spread);       // NOSONAR
      const dir = _fwd.clone().addScaledVector(_right, Math.cos(a) * rr).addScaledVector(upv, Math.sin(a) * rr).normalize();
      const split = S.split && d.pellets === 1 && k === 1;
      if (split) dir.addScaledVector(_right, rand(-0.02, 0.02)).normalize();
      if (d.proj) {
        AR.Enemies.spawnProj({ owner: 'player', x: mz.x, y: mz.y, z: mz.z, dir, ...d.proj, dmg: d.dmg * dmgMult * (split ? 0.5 : 1), knock: d.knock, weapon: g.id });
        continue;
      }
      hitscan(origin, dir, mz, g, d.dmg * dmgMult * (split ? 0.5 : 1), k);
    }
    // feel
    g.shot++;
    g.bloom = Math.min(d.bloomMax, g.bloom + d.bloom);
    const adsK = 1 - P.ads * 0.45;
    if (!gfOn()) {
      P.punchVP += d.kick * DEG * 12 * adsK * rand(0.85, 1.1);
      P.punchVY += (pattern * d.kickYaw * 2.2 + rand(-1, 1) * d.kickYaw) * DEG * 12 * adsK;
    } else if (d.pattern) P.punchVY += pattern * d.kickYaw * DEG * 8;
    P.fovPunch += d.fovKick;
    addTrauma(d.shake * (1 - P.ads * 0.5));
    if (gfOn()) {
      AR.Fx.light(mz.x, mz.y, mz.z, d.proj ? d.proj.color : 0xffb060, 2.4, 9, 0.05);
      AR.Mission?.onShot(g);
      return;
    }
    const vm = P.vm;
    vm.vpz += d.vmKick * 22 * (1 - P.ads * 0.4); vm.vrx += d.vmRot * 26 * (1 - P.ads * 0.5); vm.vry += rand(-1, 1) * d.vmRot * 6; vm.vrz += rand(-1, 1) * d.vmRot * 8; vm.vpy += d.vmKick * 3;
    g.slideK = 1;
    muzzle.material.opacity = 1; muzzle.material.rotation = Math.random() * 6.28;                   // NOSONAR
    muzzle.scale.setScalar(rand(0.35, 0.6) * (d.pellets > 1 ? 1.5 : 1));
    muzzle.material.color.setHex(d.proj ? d.proj.color : 0xfff0b0);
    muzzleLight.intensity = 6; muzzleLight.color.setHex(d.proj ? d.proj.color : 0xffc070);
    AR.Fx.light(mz.x, mz.y, mz.z, d.proj ? d.proj.color : 0xffb060, 2.4, 9, 0.05);
    AR.Sfx.gun(d.sfx, { lastShot: g.ammo <= 3 && g.ammo > 0 && d.mag > 8 });
    const ej = vmOf(g)?.eject;
    if (!d.proj && g.id !== 'shotgun' && g.id !== 'dmr' && ej) { const e = vmToWorld(ej, _tmp.clone()); AR.Fx.shell(e.x, e.y, e.z, _right.x, _right.z, 0xc9a040); }
    if ((g.id === 'shotgun' || g.id === 'dmr') && ej) setTimeout(() => { if (P && gun() === g) { const e = vmToWorld(ej, V3()); AR.Fx.shell(e.x, e.y, e.z, _right.x, _right.z, g.id === 'dmr' ? 0xd0b060 : 0xc02020); } }, g.id === 'dmr' ? 420 : 330);
    AR.Mission?.onShot(g);
    // rocket self-knock (rocket jump) is applied by the explosion
  }
  function hitscan(origin, dir, muzzlePos, g, dmg, pellet) {
    const d = g.d;
    let pierce = d.pierce || 1, tMax = 160;
    const skip = new Set();
    let ox = origin.x, oy = origin.y, oz = origin.z, travelled = 0;
    const wh = AR.World.raycast(ox, oy, oz, dir.x, dir.y, dir.z, tMax);
    const wallT = wh ? wh.t : tMax;
    const wn = wh ? [wh.nx, wh.ny, wh.nz] : null;
    let endT = wallT;
    while (pierce > 0) {
      const eh = AR.Enemies.rayHit(ox, oy, oz, dir.x, dir.y, dir.z, wallT - travelled, skip);
      if (!eh) break;
      const dist = travelled + eh.t;
      const [f0, f1, fmin] = d.falloff || [999, 999, 1];
      const fall = dist <= f0 ? 1 : dist >= f1 ? fmin : 1 - (1 - fmin) * (dist - f0) / (f1 - f0);
      AR.Enemies.hitByBullet(eh, dmg * fall, dir, g, pellet);
      skip.add(eh.e);
      pierce--;
      if (pierce <= 0) { endT = dist; break; }
    }
    const hx = origin.x + dir.x * endT, hy = origin.y + dir.y * endT, hz = origin.z + dir.z * endT;
    if (endT === wallT && wh) AR.Fx.impact(hx, hy, hz, wn[0], wn[1], wn[2], g.d.tracer, g.id === 'dmr' || g.id === 'shotgun' && pellet === 0);
    const every = d.tracerEvery || 1;
    if ((g.shot + pellet) % every === 0) AR.Fx.trace(muzzlePos.x, muzzlePos.y, muzzlePos.z, hx, hy, hz, d.tracer, g.id === 'dmr' ? 0.16 : 0.06);
    if (g.id === 'dmr') AR.Fx.beam(muzzlePos.x, muzzlePos.y, muzzlePos.z, hx, hy, hz, 0xff5bd6, 0.05, 0.25);
  }

  /* ================================================================== kick + grenade */
  function kickTick(dt) {
    P.kickCd -= dt; P.kickT -= dt;
    if (I.kick && P.kickCd <= 0) {
      P.kickCd = 0.62; P.kickT = 0.32;
      AR.Sfx.kick(); addTrauma(0.12); P.fovPunch -= 2;
      setTimeout(() => {
        if (!P) return;
        eyePos(_a); aimDir(_fwd);
        const hits = AR.Enemies.inCone(_a.x, _a.y - 0.6, _a.z, _fwd, 2.7, 0.55);
        if (hits.length) {
          AR.Sfx.hit(true, 0.6); addTrauma(0.3); AR.hitstop(0.07);
          for (const e of hits) AR.Enemies.kicked(e, 45 * S.kick, _fwd);
          if (S.kickDash && P.dashCharges < S.dashes) P.dashCharges++;
        } else {
          // kick off a wall: small boost backwards (wall-kick jump)
          const w = AR.World.raycast(_a.x, _a.y - 0.6, _a.z, _fwd.x, 0, _fwd.z, 1.6);
          if (w && !P.body.onGround) { P.body.vel.x -= _fwd.x * 8; P.body.vel.z -= _fwd.z * 8; P.body.vel.y = Math.max(P.body.vel.y, 7); AR.Sfx.land(0.5); AR.Mission?.style('wallkick'); }
        }
      }, 90);
    }
    I.kick = false;
    // grenades
    P.nadeRe -= dt;
    if (P.nades < 2 && P.nadeRe <= 0) { P.nades++; P.nadeRe = 9; }
    if (I.nade && P.nades > 0) {
      P.nades--; if (P.nadeRe <= 0) P.nadeRe = 9;
      eyePos(_a); aimDir(_fwd);
      const dir = _fwd.clone(); dir.y += 0.18; dir.normalize();
      AR.Enemies.spawnProj({ owner: 'player', x: _a.x + _fwd.x * 0.5, y: _a.y - 0.2, z: _a.z + _fwd.z * 0.5, dir, speed: 21, grav: -18, splash: 5.2,
        splashDmg: 1, dmg: 130 * (1 + S.dmg), bounce: 4, size: 0.24, color: 0xff2bd6, life: 1.25, grenade: true, knock: 12, weapon: 'nade', fuseOnly: true });
      P.vm.vpy -= 0.6; AR.Sfx.reload(null, 'out');
    }
    I.nade = false;
  }

  /* ================================================================== damage & health */
  function takeDamage(amount, from, kind) {
    if (!P || !P.alive) return 0;
    if (P.iframes > 0 && kind !== 'fall') return 0;
    amount *= AR.Mission?.incomingMult() || 1;
    if (P.slideT > 0 && kind === 'proj') amount *= 0.7;
    let left = amount;
    if (P.shield > 0) { const a = Math.min(P.shield, left); P.shield -= a; left -= a; if (P.shield <= 0) AR.Sfx.shieldBreak(); }
    if (P.armor > 0 && left > 0) { const a = Math.min(P.armor, left * 0.6); P.armor -= a; left -= a; }
    P.hp -= left;
    P.shieldT = 4; P.lastHurtT = performance.now();
    addTrauma(Math.min(0.5, 0.12 + amount / 60));
    P.punchVP += rand(-1, 1) * 0.6; P.punchVY += rand(-1, 1) * 0.6;
    AR.Sfx.hurt(amount);
    AR.Hud?.hurt(amount, from, P);
    AR.Mission?.onHurt(amount);
    if (P.hp <= 0) { P.hp = 0; P.alive = false; AR.Mission?.onDeath(); }
    return amount;
  }
  function heal(n) { if (!P) return; P.hp = Math.min(P.maxHp, P.hp + n); }
  function healthTick(dt) {
    if (S.overshield > 0) {
      P.shieldT -= dt;
      if (P.shieldT <= 0 && P.shield < S.overshield) P.shield = Math.min(S.overshield, P.shield + 30 * dt);
    }
    if (P.hp < P.maxHp * 0.3 && P.alive) {
      P.lowBeatT -= dt;
      if (P.lowBeatT <= 0) { P.lowBeatT = 0.85; AR.Sfx.heartbeat(1 - P.hp / (P.maxHp * 0.3) * 0.6); }
    }
  }

  /* ================================================================== frame */
  function tick(dt, rdt) {
    if (!P) return;
    look(rdt);
    if (P.alive) {
      move(dt);
      // ADS
      const g = gun();
      const wantAds = I.ads && !g?.reloading && P.swapT <= 0 && P.slideT <= 0 && P.kickT <= 0 ? 1 : 0;
      if (gfOn()) P.ads = GunFeel.adsK;
      else P.ads = AR.clamp(P.ads + (wantAds ? 1 : -1) * rdt / (g?.d.adsTime || 0.14), 0, 1);
      if (I.swap) {
        if (I.swap === -1) swapTo(P.cur === 0 ? 1 : 0); else swapTo(I.swap - 1);
        I.swap = 0;
      }
      P.swapT = Math.max(0, P.swapT - dt);
      fireTick(dt);
      kickTick(dt);
      if (I.use) { I.use = false; AR.Mission?.use(); }
      healthTick(dt);
    }
    cameraTick(dt, rdt);
    viewmodelTick(rdt);
    if (gfOn()) {
      const mx = AR.clamp((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + I.padX, -1, 1);
      GunFeel.update(rdt, { ads: I.ads && P.slideT <= 0 && P.kickT <= 0 && P.alive, move: Math.min(1, P.speed / 8), strafe: mx, onGround: P.body.onGround,
        dash: P.dashT > 0, sprint: P.sprinting, lookX: -P.swayX / 0.0009, lookY: P.swayY / 0.0009, feetY: P.body.pos.y });
    }
    // your own body under the camera: look down to see your fit (arms come from GunFeel's hands)
    if (window.FPBody && P.alive) {
      const b = P.body;
      FPBody.update(rdt, { x: b.pos.x, y: b.pos.y, z: b.pos.z, yaw: P.yaw, pitch: P.pitch, speed: P.speed, onGround: b.onGround, crouch: P.crouching, slide: P.slideT > 0, arms: false });
    }
  }

  /* ================================================================== gamepad (js/gamepad.js polls; this maps it)
   * LS move · RS look (with aim assist) · RT fire · LT aim · A jump · B crouch/slide (hold) · X pick up / reload
   * Y swap · RB or R3 kick · LB grenade · L3 sprint (dash with JET DASH) · D-pad left/right swap */
  const _eye = V3(), _to = V3(), _aim = V3();
  function padTick(pad, rdt) {
    if (!P || !P.alive) { I.padX = 0; I.padZ = 0; return; }
    const B = Pad.BTN;
    I.padX = pad.lx; I.padZ = -pad.ly;
    // look: response curve, then aim assist (slow down over a target, a gentle pull toward its head)
    const curve = v => Math.sign(v) * Math.pow(Math.abs(v), 1.8);
    let lx = curve(pad.rx) * 3.4, ly = curve(pad.ry) * 2.3;                   // rad/s at full tilt
    const sens = SAVE?.opts?.padSens || 1;
    const t = assistTarget();
    if (t && (Math.abs(pad.rx) > 0.05 || Math.abs(pad.ry) > 0.05 || P.speed > 1)) {
      const k = 0.45 + 0.55 * Math.min(1, t.ang / 0.07);                      // friction: up to 55% slower on target
      lx *= k; ly *= k;
      const pull = (P.ads > 0.4 ? 0.9 : 0.45) * rdt;                           // magnetism, stronger while aiming
      P.yaw += AR.clamp(t.dYaw, -pull, pull); P.pitch = AR.clamp(P.pitch + AR.clamp(t.dPitch, -pull, pull), -1.5, 1.5);
    }
    I.lookX += lx * sens * rdt / 0.0021 / (SAVE?.opts?.sens || 1);
    I.lookY += ly * sens * rdt / 0.0021 / (SAVE?.opts?.sens || 1);
    I.fire = pad.rt > 0.35;
    I.ads = pad.lt > 0.35;
    if (pad.down(B.A)) I.jump = 0.14;
    I.crouch = pad.held(B.B) || keys.ControlLeft || keys.KeyC || false;
    if (pad.down(B.X)) { if (!AR.Drops.use()) I.reload = true; }
    if (pad.down(B.Y) || pad.down(B.LEFT) || pad.down(B.RIGHT)) I.swap = -1;
    if (pad.down(B.RB) || pad.down(B.R3)) I.kick = true;
    if (pad.down(B.LB)) I.nade = true;
    if (pad.down(B.L3)) { if (S.dashMode) I.dash = true; else I.padSprint = !I.padSprint; }
  }
  function assistTarget() {
    if (!AR.Enemies?.list) return null;
    eyePos(_eye); aimDir(_aim);
    let best = null;
    for (const e of AR.Enemies.list) {
      if (e.dying || e.relay) continue;
      const h = e.headPos || e.body.pos;
      _to.set(h.x - _eye.x, h.y - 0.25 - _eye.y, h.z - _eye.z);
      const d = _to.length(); if (d > 45 || d < 1) continue;
      _to.divideScalar(d);
      const ang = Math.acos(Math.min(1, _to.dot(_aim)));
      const cone = 0.09 + 0.6 / d;                                            // wider up close
      if (ang > cone || (best && ang >= best.ang)) continue;
      if (AR.World.los && !AR.World.los(_eye.x, _eye.y, _eye.z, h.x, h.y - 0.25, h.z)) continue;
      const wantYaw = Math.atan2(-_to.x, -_to.z), wantPitch = Math.asin(_to.y);
      let dYaw = wantYaw - P.yaw; dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      best = { ang, dYaw, dPitch: wantPitch - P.pitch };
    }
    return best;
  }

  function giveGun(id, tier = 0) {
    const slot = 1;
    const cur = P.guns[slot];
    P.guns[slot] = makeGun(id, tier);
    P.cur = slot; P.swapT = 0.3; showGun();
    return cur ? { id: cur.id, tier: cur.tier } : null;
  }
  function addAmmo(frac) {
    for (const g of P.guns) if (g && g.reserve !== Infinity) g.reserve = Math.min(g.d.reserve * 1.5, g.reserve + Math.ceil(g.d.reserve * frac));
  }
  function refillMags() { for (const g of P.guns) if (g) { g.ammo = magSize(g); g.reloading = false; } }

  function dispose(composer) {
    detachPass(composer);
    if (GF) { GunFeel.setVisible(false); GF.gunGroup.visible = false; }
    if (scopeEl) scopeEl.classList.remove('on');
    P = null;
  }

  return {
    init, reset, tick, padTick, get input() { return I; }, takeDamage, useGunFeel, get gunFeel() { return gfOn(); }, heal, giveGun, addAmmo, refillMags, addTrauma, eyePos, aimDir, dispose, attachPass, detachPass, magSize, clearInput,
    get P() { return P; }, get S() { return S; }, get gun() { return P && gun(); }, get input() { return I; }, get keys() { return keys; },
    spread: () => (P && gun() ? spreadRad(gun()) : 0),
  };
})();
