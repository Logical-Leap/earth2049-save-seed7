/* EARTH 2049: SAVE SEED 7 — ARENA runtime entry. `Arena.start()` takes over the game's renderer and scene for a
 * mission; `Arena.tick(dt)` is called from the game's frame loop while state === 'arena'; `Arena.exit()` hands
 * control back (to the Rebel Haven). Owns time: hit-stop (a few frames of near-freeze on kills), slow-mo
 * (boss kill, death), pause on pointer-lock loss, and the music cue.
 */
'use strict';

const Arena = (() => {
  let ctx = null, hitstopT = 0, slowT = 0, slowK = 1, flowT = 0, lastNode = -1, loading = false;
  AR.active = false; AR.paused = false; AR.menu = false; AR.freeLook = false; AR.fov = 88;

  AR.hitstop = t => { hitstopT = Math.max(hitstopT, t); };
  AR.slowmo = (t, k) => { slowT = t; slowK = k; };
  AR.pointerLocked = () => document.pointerLockElement === AR.el('c');
  AR.lockPointer = () => {
    if (AR.freeLook || window.acceptanceInputEnabled || window.Pad?.active || window.VR?.active) return;      // a controller needs no pointer lock
    try {
      const r = AR.el('c').requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => { AR.freeLook = true; });
    } catch (err) { AR.freeLook = true; }
  };
  AR.unlockPointer = () => { if (document.pointerLockElement) document.exitPointerLock?.(); };
  document.addEventListener('pointerlockerror', () => { if (AR.active) AR.freeLook = true; });
  let menuT = 0;
  document.addEventListener('pointerlockchange', () => {
    if (!AR.active || AR.freeLook) return;
    if (AR.pointerLocked()) { if (AR.paused && AR.pausedByLock) pause(false); return; }
    // an unlock we asked for (opening a menu) can arrive after the menu already closed again: ignore it
    if (AR.menu || performance.now() - menuT < 800) return;
    if (!AR.paused && AR.Player.P?.alive && !window.Pad?.active && !window.VR?.active) { pause(true); AR.pausedByLock = true; }
  });
  AR.menuClosed = () => { menuT = performance.now(); };
  addEventListener('keydown', e => {
    if (!AR.active) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { if (AR.paused) pause(false); else if (!AR.menu) pause(true); }
  });

  function pause(on) {
    AR.paused = on; AR.pausedByLock = false;
    AR.Player.clearInput();
    if (on) { AR.unlockPointer(); AR.Hud.pause(true, () => pause(false), () => exit()); }
    else { AR.Hud.pause(false); AR.lockPointer(); }
  }

  async function start(opts) {
    if (loading) return;
    loading = true;
    ctx = opts;
    AR.scene = opts.scene; AR.camera = opts.camera; AR.renderer = opts.renderer; AR.composer = opts.composer;
    AR.Hud.build(); AR.Hud.show(false);
    const ls = AR.el('loadScreen');
    if (ls) { ls.style.display = 'flex'; ls.textContent = 'CASTING INTO SHILLZ CENTRAL…'; }
    AudioSys.init(); AudioSys.resume(); AR.Sfx.init();
    const layout = await AR.World.load(opts.scene, 'assets/maps/plaza/', 'plaza');
    await AR.Enemies.preload();
    await AR.Arsenal.preload();
    await loadProps(layout);
    const fog = layout.meta?.fog || [0.07, 0.05, 0.12];
    ctx.prevFog = opts.scene.fog; ctx.prevBg = opts.scene.background;
    opts.scene.fog = new THREE.FogExp2(new THREE.Color(...fog), 0.016);
    opts.scene.background = new THREE.Color(...fog);
    AR.Fx.init(opts.scene); AR.Enemies.init(opts.scene); AR.Drops.init(opts.scene);
    if (!AR.Player.ready) { AR.Player.init(opts.camera, opts.composer); AR.Player.ready = true; } else AR.Player.attachPass(opts.composer);
    AR.Player.useGunFeel(opts.gunGroup);                  // the art department's first-person rig, if it is loaded
    begin(opts.heat);
    if (ls) ls.style.display = 'none';
    loading = false;
  }
  function begin(heat) {
    const ps = AR.World.markers('playerStart')[0];
    AR.Player.reset({ x: ps.pos[0], y: ps.pos[1], z: ps.pos[2], yaw: ps.yaw }, null);
    AR.active = true; AR.paused = false; AR.menu = false; hitstopT = 0; slowT = 0; flowT = 0; lastNode = -1;
    AR.Hud.show(true);
    AR.Mission.start({ heat });
    AR.lockPointer();
  }
  const propCache = {};
  async function loadProps(layout) {
    if (ctx.props) return;
    const g = new THREE.Group(); g.name = 'arena-props';
    const names = [...new Set(layout.props.map(p => p.model))];
    await Promise.all(names.map(async n => { propCache[n] = await AssetLoader.loadModel('prop.' + n, 'assets/models/haven/props/' + n + '.glb'); }));
    const col = new THREE.Color();
    for (const p of layout.props) {
      const src = propCache[p.model]; if (!src) continue;
      const o = src.scene.clone(true);
      o.position.set(...p.pos); o.rotation.y = p.yaw; o.scale.setScalar(p.scale || 1);
      AR.World.probeAt(p.pos[0], p.pos[1] + 1, p.pos[2], col);
      o.traverse(m => {
        if (!m.isMesh) return;
        const mm = m.material;
        m.material = new THREE.MeshBasicMaterial({ map: mm.map || null, vertexColors: !!m.geometry.attributes.color, color: col.clone().multiplyScalar(1.1).addScalar(0.05), transparent: mm.transparent, alphaTest: mm.alphaTest || 0 });
        if (mm.emissiveMap || (mm.emissive && mm.emissive.getHex() !== 0)) m.material.color.setRGB(1.2, 1.2, 1.2);
        m.matrixAutoUpdate = false; m.updateMatrix();
      });
      o.updateMatrixWorld(true); o.matrixAutoUpdate = false;
      g.add(o);
    }
    ctx.scene.add(g); ctx.props = g;
  }

  function restart(heat) {
    AR.Hud.show(false); AR.Hud.show(true);
    AR.Mission.dispose(); AR.Boss.dispose(); AR.Enemies.clear(); AR.Drops.dispose(); AR.Drops.init(ctx.scene);
    AR.Fx.dispose(); AR.Fx.init(ctx.scene);
    Music.stop?.(0.6);
    begin(heat);
  }
  function exit() {
    AR.active = false; AR.paused = false; AR.menu = false;
    AR.Hud.show(false); AR.Hud.letterbox(false); AR.Hud.pause(false);
    AR.Mission.dispose(); AR.Boss.dispose(); AR.Enemies.dispose(); AR.Drops.dispose(); AR.Fx.dispose();
    AR.Player.dispose(ctx.composer);
    AR.World.unload(ctx.scene);
    if (ctx.props) { ctx.scene.remove(ctx.props); ctx.props = null; }
    ctx.scene.fog = ctx.prevFog; ctx.scene.background = ctx.prevBg;
    ctx.camera.fov = 75; ctx.camera.updateProjectionMatrix();
    // keep any pointer lock: the Haven uses it too, and releasing it here would pause the hub on arrival
    const cb = ctx.onExit; ctx = { ...ctx, props: null };
    cb?.();
  }

  function tick(rdt) {
    if (!AR.active) return;
    if (AR.paused || AR.menu) { AR.Fx.tick(0, AR.camera); AR.Hud.update(0); if (AR.menu) AR.Player.tick(0, rdt); return; }
    let k = 1;
    if (hitstopT > 0) { hitstopT -= rdt; k = 0.04; }
    if (slowT > 0) { slowT -= rdt; k = Math.min(k, slowT < 0.4 ? AR.lerp(1, slowK, slowT / 0.4) : slowK); }   // ease back to full speed
    const dt = Math.min(0.05, rdt) * k;
    // flow field toward the player for every ground enemy
    flowT -= rdt;
    const P = AR.Player.P;
    if (P && flowT <= 0) {
      flowT = 0.3;
      const n = AR.World.nearestNode(P.body.pos.x, P.body.pos.y + 0.2, P.body.pos.z, 5);
      if (n >= 0 && n !== lastNode) { AR.World.flowTo(n); lastNode = n; }
    }
    // AR.devSteps (testing only) runs several simulation steps per rendered frame
    for (let i = 0, n = AR.devSteps || 1; i < n; i++) {
      AR.Player.tick(dt, Math.min(0.05, rdt));
      AR.Enemies.tick(dt);
      AR.Drops.tick(dt);
      AR.Mission.tick(dt, rdt);
      AR.Fx.tick(dt, AR.camera);
    }
    AR.Hud.update(rdt);
  }
  function musicCue() {
    const ph = AR.Mission.phase;
    if (!AR.active) return null;
    if (ph === 'results') return AR.Mission.M?.won ? 'outro' : null;
    if (ph === 'boss' || ph === 'bossdead') return 'boss';
    if (ph === 'intro' || ph === 'loadout') return 'title';
    return 'combat';
  }
  function snapshot() {
    const P = AR.Player.P, M = AR.Mission.M;
    return {
      active: AR.active, phase: M?.phase, wave: M?.wave, score: M?.score, rank: M?.rank, kills: M?.kills, relaysDown: M?.relaysDown, heat: M?.heat,
      enemies: AR.Enemies.alive(), pending: M?.pending.length, hp: P?.hp, gun: AR.Player.gun?.id,
      player: P && { x: +P.body.pos.x.toFixed(2), y: +P.body.pos.y.toFixed(2), z: +P.body.pos.z.toFixed(2), onGround: P.body.onGround },
      boss: AR.Boss.boss && { hp: Math.round(AR.Boss.boss.hp), phase: AR.Boss.phase },
    };
  }
  return { start, tick, exit, restart, musicCue, snapshot, pause, get active() { return AR.active; } };
})();
AR.restart = h => Arena.restart(h);
AR.exit = () => Arena.exit();
window.Arena = Arena;
