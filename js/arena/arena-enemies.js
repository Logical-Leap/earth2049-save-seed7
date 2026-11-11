/* EARTH 2049: SAVE SEED 7 — ARENA enemies, projectiles and drops.
 *
 *   SERVERLESS   swarm: shamble, then lurch when close; grab with a wind-up you can see
 *   SHILL        rusher: zig-zags in, sidesteps when you aim at him, punch combo
 *   STREAMER     ranged: holds a distance band, strafes, ring light flashes before a 3-bolt burst
 *   HYPEBEAST    charger: roars and locks a line, charges, bonks into walls (stunned, takes extra damage), slams up close
 *   DRONE        flyer: orbits at height, shoots, falls and pops when killed
 *   MODERATOR    tank: frontal riot shield (flank it), lobs ban-hammer artillery onto a telegraphed circle
 *
 * Ground enemies walk the level's nav graph (flow field toward the player, drop links off ledges, they even use
 * the jump pads) and switch to direct steering when they can see you on the same level. Every look is a seeded
 * variant roll of the pipeline's base models. VERIFIED elites get a blue check, more HP, and drop guns.
 */
'use strict';

AR.Enemies = (() => {
  const { V3, clamp, rand, pick } = AR;
  const list = [];
  let scene = null, group = null, uid = 1;
  const A = 'assets/models/arena/';
  const MODELS = {
    serverless_m: A + 'serverless_m.glb', serverless_f: A + 'serverless_f.glb', shill_m: A + 'shill_m.glb', shill_f: A + 'shill_f.glb',
    hypebeast_m: A + 'hypebeast_m.glb', cdrone_x: A + 'cdrone_x.glb', enforcer_x: A + 'enforcer_x.glb',
    riya: 'assets/models/ps1/characters/riya.glb', relay: 'assets/models/haven/props/shillz_speaker_tower.glb',
  };
  const gltfs = {};
  const _v = V3(), _w = V3(), _c = new THREE.Color(), _q = new THREE.Quaternion();
  const STEP = () => (window.PS1Mode?.enabled ? 1 / 15 : 0);

  async function preload() {
    await Promise.all(Object.keys(MODELS).map(async k => {
      if (gltfs[k]) return;
      const g = await AssetLoader.loadModel('arena.' + k, MODELS[k] + '?v=' + AR.VERSION);
      if (g) { await Variants.prepare(g); gltfs[k] = g; }
    }));
    if (!AR.checkTex) AR.checkTex = makeCheckTex();
  }
  function makeCheckTex() {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d');
    x.fillStyle = '#1d9bf0'; x.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 13 : 16; x.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r); } x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 4; x.beginPath(); x.moveTo(9, 16); x.lineTo(14, 21); x.lineTo(23, 11); x.stroke();
    return new THREE.CanvasTexture(c);
  }

  /* ================================================================== construction */
  function litMaterials(root) {
    const mats = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const conv = m => {
        if (!m) return m;
        const lm = new THREE.MeshLambertMaterial({ map: m.map || null, vertexColors: !!o.geometry.attributes.color,
          emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0, 0, 0), emissiveMap: m.emissiveMap || null, side: m.side,
          transparent: m.transparent, alphaTest: m.alphaTest || 0 });
        if (!m.map) lm.flatShading = true;
        mats.push(lm); return lm;
      };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
    return mats;
  }

  function spawn(type, x, y, z, opts = {}) {
    const d = AR.ENEMIES[type];
    const key = opts.model || pick(d.models);
    const gltf = gltfs[key];
    if (!gltf) return null;
    const root = THREE.SkeletonUtils.clone(gltf.scene);
    const mats = litMaterials(root);
    const seed = opts.seed ?? Math.floor(Math.random() * 1e9);                         // NOSONAR
    Variants.roll(gltf, root, seed, d.type || null);
    if (d.type === 'shill') { const rl = root.getObjectByName('acc_ringlight'); if (rl) rl.scale.setScalar(0); }
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const hgt = Math.max(0.1, box.max.y - box.min.y);
    const scale = (d.scale || 1) * (opts.elite ? 1.12 : 1);
    const k = d.unit ? scale : d.h * scale / hgt;
    root.scale.multiplyScalar(k); root.position.y -= box.min.y * k;
    const obj = new THREE.Group(); obj.add(root); group.add(obj);
    const mixer = new THREE.AnimationMixer(root), actions = {};
    for (const clip of gltf.animations || []) actions[clip.name] = mixer.clipAction(clip);
    const heat = AR.Mission?.heat || 0;
    const hpMul = (1 + heat * 0.25) * (opts.elite ? 2.6 : 1) * (opts.hpMul || 1);
    const e = {
      id: uid++, type, d, obj, root, mixer, actions, alias: gltf.scene.userData?.clip_alias || {}, mats, cur: null, acc: 0,
      head: root.getObjectByName('head'), ring: root.getObjectByName('acc_ringlight'), spinNodes: [],
      body: { pos: V3(x, y, z), vel: V3(), r: d.r * scale, h: (d.h || 1.7) * scale, onGround: true, step: 0.7 },
      yaw: opts.yaw ?? rand(0, 6.28), hp: d.hp * hpMul, maxHp: d.hp * hpMul, elite: !!opts.elite, scale, seed,
      state: 'spawn', t: 0, stateT: 0.5, atkT: rand(0.5, 1.5), fireT: rand(0.8, 2), node: -1, nodeT: 0, flash: 0, burnT: 0, burnDps: 0,
      stuckT: 0, lastPos: V3(x, y, z), strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rand(0.8, 1.6), zig: rand(0, 6.28),      // NOSONAR
      dodgeCd: rand(1, 2), knock: V3(), headPos: V3(x, y + d.h * 0.9, z), lightT: 0, dmgMul: (1 + heat * 0.15) * (opts.elite ? 1.3 : 1),
      alt: d.fly ? rand(d.fly[0], d.fly[1]) : 0, orbit: rand(0, 6.28), dead: false, dying: false, deathT: 0, spin: V3(), grounded: false,
      boss: opts.boss || null, noDrops: !!opts.noDrops, groanT: rand(2, 8), lastHitBy: null, stun: 0, telegraph: null,
    };
    if (d.unit) root.traverse(o => { if (o.name && o.name.startsWith('spin')) e.spinNodes.push(o); });
    e.play = (name, fade = 0.2, loop = true, speed = 1) => {
      let n = e.alias[name] || name;
      if (!actions[n]) n = actions[e.alias.Idle || 'Idle'] ? (e.alias.Idle || 'Idle') : Object.keys(actions)[0];
      if (!n) return;
      if (e.cur === n && loop) { actions[n].timeScale = speed; return; }
      const next = actions[n];
      next.reset(); next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); next.clampWhenFinished = !loop; next.timeScale = speed; next.play();
      if (e.cur && actions[e.cur] && e.cur !== n) actions[e.cur].crossFadeTo(next, fade, false);
      e.cur = n;
    };
    e.play('Idle', 0);
    mixer.update(rand(0, 2));
    if (e.elite) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: AR.checkTex, depthTest: false, transparent: true }));
      sp.scale.setScalar(0.45); sp.position.y = e.body.h + 0.45; sp.renderOrder = 30; obj.add(sp); e.check = sp;
      for (const m of mats) { m.emissive.setRGB(0.05, 0.12, 0.3); }
    }
    obj.position.copy(e.body.pos); obj.rotation.y = e.yaw;
    // spawn-in: a stream portal and a pop of scale
    obj.scale.setScalar(0.01);
    if (!opts.silent) portalFx(x, y, z, e);
    list.push(e);
    return e;
  }
  function portalFx(x, y, z, e) {
    const col = e.d.fly ? 0x00e5ff : e.elite ? 0x1d9bf0 : 0xffd400;
    AR.Fx.flash(x, y + 1, z, col, 2.4, 0.4);
    AR.Fx.shock(x, y, z, 0xff2bd6, 1.6, 0.5);
    AR.Fx.emit(AR.Fx.glow, x, y + 0.5, z, col, 22, 3, 0.6, { up: 4 });
    AR.Fx.light(x, y + 1.2, z, col, 3, 8, 0.4);
  }

  /* ================================================================== hit testing */
  function updateHead(e) {
    if (e.head) { e.head.getWorldPosition(e.headPos); }
    else e.headPos.set(e.body.pos.x, e.body.pos.y + e.body.h * 0.88, e.body.pos.z);
  }
  /** Nearest enemy hit along a ray: { e, t, head, x, y, z }. Head = sphere at the head bone, body = vertical cylinder. */
  const rh = { e: null, t: 0, head: false, x: 0, y: 0, z: 0 };
  function rayHit(ox, oy, oz, dx, dy, dz, maxT, skip) {
    let best = maxT, be = null, bHead = false;
    for (const e of list) {
      if (e.dying || e.state === 'spawn' && e.stateT > 0.3 || (skip && skip.has(e))) continue;
      const b = e.body, r = b.r * 1.05;
      const cx = b.pos.x, cz = b.pos.z;
      // bounding sphere reject
      const mx = cx - ox, my = b.pos.y + b.h / 2 - oy, mz = cz - oz;
      const tc = mx * dx + my * dy + mz * dz;
      if (tc < -2) continue;
      const d2 = mx * mx + my * my + mz * mz - tc * tc, R = b.h * 0.6 + r;
      if (d2 > R * R) continue;
      // head sphere
      const hr = (e.d.unit ? 0.34 : 0.2) * e.scale * (e.boss ? 1.4 : 1);
      const hx = e.headPos.x - ox, hy = e.headPos.y - oy, hz = e.headPos.z - oz;
      const th = hx * dx + hy * dy + hz * dz;
      const hd2 = hx * hx + hy * hy + hz * hz - th * th;
      if (th > 0 && hd2 < hr * hr) { const t = th - Math.sqrt(hr * hr - hd2); if (t < best) { best = t; be = e; bHead = !e.d.unit; } }
      // body cylinder (infinite cylinder vs ray in XZ, then clip by height)
      const a = dx * dx + dz * dz;
      if (a < 1e-8) continue;
      const fx = ox - cx, fz = oz - cz;
      const bq = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
      const disc = bq * bq - 4 * a * c;
      if (disc < 0) continue;
      const t = (-bq - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t >= best) continue;
      const y = oy + dy * t;
      const top = e.d.unit ? b.pos.y + b.h : e.headPos.y - hr * 0.6;
      if (y < b.pos.y + (e.d.fly ? 0 : 0.05) || y > top) continue;
      best = t; be = e; bHead = false;
    }
    if (!be) return null;
    rh.e = be; rh.t = best; rh.head = bHead; rh.x = ox + dx * best; rh.y = oy + dy * best; rh.z = oz + dz * best;
    return rh;
  }
  function inCone(x, y, z, dir, range, cosA) {
    const out = [];
    for (const e of list) {
      if (e.dying) continue;
      const dx = e.body.pos.x - x, dy = e.body.pos.y + e.body.h * 0.5 - y, dz = e.body.pos.z - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > range + e.body.r) continue;
      if ((dx * dir.x + dy * dir.y + dz * dir.z) / Math.max(0.01, d) < cosA && d > e.body.r + 0.5) continue;
      out.push(e);
    }
    return out;
  }
  function nearest(x, y, z, maxD, skip) {
    let best = null, bd = maxD;
    for (const e of list) {
      if (e.dying || e === skip) continue;
      const d = Math.hypot(e.body.pos.x - x, e.body.pos.y + 1 - y, e.body.pos.z - z);
      if (d < bd && AR.World.los(x, y, z, e.headPos.x, e.headPos.y, e.headPos.z)) { bd = d; best = e; }
    }
    return best;
  }

  /* ================================================================== damage */
  function hitByBullet(h, dmg, dir, g, pellet) {
    const e = h.e, S = AR.Player.S;
    let crit = Math.random() < S.crit || (S.viral && AR.Mission.rank >= 4);                       // NOSONAR
    let mult = h.head ? g.d.head : 1;
    if (crit) mult *= 1.75;
    const amt = dmg * mult;
    damage(e, amt, { head: h.head, crit, dir, knock: g.d.knock / (g.d.pellets || 1), src: 'gun', weapon: g.id, x: h.x, y: h.y, z: h.z, pellet });
    // feedback
    if (pellet === 0 || !e._pelletTick || performance.now() - e._pelletTick > 30) {
      e._pelletTick = performance.now();
      AR.Sfx.hit(crit || h.head, h.head ? 1.2 : 1);
      AR.Hud.hitmark(h.head || crit, false);
    }
    AR.Fx.blood(h.x, h.y, h.z, e.d.gib, h.head ? 6 : 3, dir);
    if (S.burn) { e.burnT = 3; e.burnDps = S.burn; }
    if (S.ricochet && !e.dying && pellet === 0) {
      let from = e;
      for (let i = 0; i < S.ricochet; i++) {
        const n = nearest(from.headPos.x, from.headPos.y - 0.3, from.headPos.z, 12, from);
        if (!n || n.dying) break;
        AR.Fx.trace(from.headPos.x, from.headPos.y - 0.3, from.headPos.z, n.headPos.x, n.headPos.y - 0.3, n.headPos.z, 0x00e5ff, 0.12);
        damage(n, dmg * 0.45, { src: 'ricochet', dir, knock: 1 });
        from = n;
      }
    }
  }
  function damage(e, amt, info = {}) {
    if (e.dying || e.state === 'spawn') return;
    // moderator shield: shots from the front bounce
    if (e.d.ai === 'tank' && info.dir && info.src !== 'explosion' && info.src !== 'burn') {
      const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
      const dot = -(info.dir.x * fx + info.dir.z * fz);
      if (dot > Math.cos(e.d.shieldArc)) {
        amt *= e.d.shieldMult;
        if (info.x !== undefined && Math.random() < 0.5) { AR.Fx.emit(AR.Fx.glow, info.x, info.y, info.z, 0x4da6ff, 4, 4, 0.2); }  // NOSONAR
        info.shielded = true;
      }
    }
    if (e.stun > 0) amt *= 1.5;
    if (e.relay) {
      if (info.src === 'explosion' || info.src === 'volatile') amt *= 1.6;          // grenades and launchers burn relays fast
      AR.Fx.emit(AR.Fx.glow, info.x ?? e.body.pos.x, info.y ?? e.body.pos.y + 2.5, info.z ?? e.body.pos.z, 0xffd400, 4, 4, 0.3);
    }
    if (e.boss) { amt = AR.Boss.filterDamage(e, amt, info); if (amt <= 0) return; }
    e.hp -= amt;
    e.flash = Math.min(1, e.flash + (info.shielded ? 0.2 : 0.8));
    e.lastHitBy = info;
    AR.Mission?.onDamage(e, amt, info);
    const showAt = info.x !== undefined ? [info.x, info.y + 0.2, info.z] : [e.headPos.x, e.headPos.y + 0.3, e.headPos.z];
    if (info.src !== 'burn' || Math.random() < 0.25) AR.Fx.number(showAt[0], showAt[1], showAt[2], Math.round(amt), info.head ? 'head' : info.crit ? 'crit' : info.shielded ? 'block' : '');  // NOSONAR
    // knockback & flinch
    if (info.dir && info.knock) {
      const k = info.knock * (e.d.knock || 1) * (e.boss ? 0.05 : 1);
      e.knock.x += info.dir.x * k; e.knock.z += info.dir.z * k;
      if (k > 6 && e.body.onGround && !e.d.fly) { e.body.vel.y = Math.min(8, k * 0.5); e.body.onGround = false; }
    }
    if (!e.boss && e.d.flinch && amt > e.maxHp * 0.12 && Math.random() < e.d.flinch && e.state !== 'charge') {   // NOSONAR
      e.flinchT = 0.25; e.play('Hit React', 0.05, false, 1.4);
    }
    if (Math.random() < 0.3) AR.Sfx.enemyHurt(e.body.pos.x, e.body.pos.y + 1, e.body.pos.z, e.d.unit || e.type === 'moderator' ? 'robot' : 'human');  // NOSONAR
    if (e.hp <= 0) kill(e, info, amt);
  }
  function kicked(e, dmg, dir) {
    const air = !e.body.onGround;
    damage(e, dmg, { src: 'kick', dir, knock: 0 });
    if (e.dying) return;
    if (!e.boss && e.d.knock > 0.2) {
      e.body.vel.set(dir.x * 13 * e.d.knock, 6.5, dir.z * 13 * e.d.knock); e.body.onGround = false;
      e.stun = Math.max(e.stun, 0.8); e.play('Hit React', 0.05, false);
    }
    if (air) AR.Mission?.style('juggle');
  }
  function explode(x, y, z, radius, dmg, owner, knock = 10, src = 'explosion') {
    AR.Fx.explosion(x, y, z, radius * 0.6);
    AR.Sfx.explosion(x, y, z, Math.min(1.4, radius / 3.5));
    for (const e of list.slice()) {
      if (e.dying) continue;
      const dx = e.body.pos.x - x, dy = e.body.pos.y + e.body.h * 0.5 - y, dz = e.body.pos.z - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius + e.body.r) continue;
      if (!AR.World.los(x, y + 0.2, z, e.body.pos.x, e.body.pos.y + e.body.h * 0.5, e.body.pos.z)) continue;
      const f = 1 - Math.max(0, d - e.body.r) / radius * 0.6;
      const dir = V3(dx, 0, dz).normalize();
      damage(e, dmg * f, { src, dir, knock: knock * f, x: e.headPos.x, y: e.headPos.y, z: e.headPos.z });
      if (!e.dying && !e.boss && !e.d.fly && e.d.knock > 0.2) { e.body.vel.y = Math.max(e.body.vel.y, 6 * f * e.d.knock + 2); e.body.onGround = false; }
    }
    const P = AR.Player.P;
    if (P?.alive) {
      const b = P.body, dx = b.pos.x - x, dy = b.pos.y + 0.9 - y, dz = b.pos.z - z, d = Math.hypot(dx, dy, dz);
      if (d < radius + 0.4) {
        const f = 1 - d / (radius + 0.4);
        if (owner === 'player') {
          // rocket jump: big self-knock, small self-damage
          const n = Math.max(0.3, d);
          b.vel.x += dx / n * 13 * f; b.vel.z += dz / n * 13 * f; b.vel.y = Math.max(b.vel.y, 4) + 9 * f;
          b.onGround = false;
          AR.Player.takeDamage(dmg * 0.12 * f, { x, z }, 'self');
          AR.Mission?.style('rocketjump');
        } else {
          AR.Player.takeDamage(dmg * f, { x, z }, 'explosion');
          b.vel.x += dx / Math.max(0.3, d) * 7 * f; b.vel.z += dz / Math.max(0.3, d) * 7 * f; b.vel.y = Math.max(b.vel.y, 4 * f);
        }
      }
      AR.Player.addTrauma(clamp(0.6 - d / 40, 0, 0.6));
    }
  }

  function kill(e, info, lastHit) {
    if (e.dying) return;
    e.dying = true; e.deathT = 0;
    if (e.telegraph) { e.telegraph.life = 0.01; e.telegraph = null; }
    const gib = !e.d.unit && !e.boss && (info.src === 'explosion' || info.src === 'kick' && e.hp < -20 || lastHit > e.maxHp * 0.7 || (info.weapon === 'shotgun' && dist2Player(e) < 36));
    AR.Mission?.onKill(e, info, gib);
    if (e.boss) { AR.Boss.onDeath(e); return; }
    if (e.d.unit || gib) {
      const c = e.headPos;
      AR.Fx.gib(c.x, c.y - 0.3, c.z, e.d.gib, e.d.unit ? 12 : 18, e.d.unit ? 0.8 : 1.1, info.dir);
      AR.Fx.blood(c.x, c.y - 0.3, c.z, e.d.gib, 18, info.dir);
      if (e.d.unit) explode(c.x, c.y, c.z, 2.8, 18, 'enemy', 6, 'drone');
      e.obj.visible = false; e.deathT = 9;                    // removed next tick
    } else {
      e.play('Death', 0.05, false, rand(1.1, 1.4));
      const dir = info.dir || V3(0, 0, 0);
      const k = 3 + (info.knock || 2) * 0.8;
      e.body.vel.set(dir.x * k, Math.max(e.body.vel.y, 2.5 + k * 0.2), dir.z * k);
      e.body.onGround = false;
      e.spin.set(rand(-2, 2), rand(-3, 3), 0);
    }
    if (!e.noDrops) AR.Drops.fromKill(e, info);
    if (AR.Player.S.volatile) {
      setTimeout(() => explode(e.body.pos.x, e.body.pos.y + 0.8, e.body.pos.z, 3.5, 40 * AR.Player.S.volatile, 'player', 6, 'volatile'), 120);
    }
  }
  function dist2Player(e) {
    const p = AR.Player.P.body.pos;
    return (e.body.pos.x - p.x) ** 2 + (e.body.pos.z - p.z) ** 2;
  }

  /* ================================================================== AI */
  const PV = V3();
  function playerChest() { const P = AR.Player.P; return PV.set(P.body.pos.x, P.body.pos.y + 1.2, P.body.pos.z); }
  function canSee(e) {
    const p = playerChest();
    return AR.World.los(e.body.pos.x, e.body.pos.y + e.body.h * 0.8, e.body.pos.z, p.x, p.y, p.z);
  }
  /** Steering target for ground enemies: direct when visible on the same level, else the flow field. */
  function pathTarget(e, out) {
    const P = AR.Player.P, b = e.body, pp = P.body.pos;
    const dy = pp.y - b.pos.y, dist = Math.hypot(pp.x - b.pos.x, pp.z - b.pos.z);
    e.nodeT -= AR.dt;
    if (e.seeT === undefined || (e.seeT -= AR.dt) <= 0) { e.seeT = 0.25 + Math.random() * 0.15; e.sees = canSee(e); }   // NOSONAR
    if (e.sees && Math.abs(dy) < 1.1 && dist < 26) { e.node = -1; return out.set(pp.x, pp.y, pp.z); }
    const nav = AR.World.nav;
    if (!nav) return out.set(pp.x, pp.y, pp.z);
    if (e.node < 0 || e.nodeT <= 0) { e.node = AR.World.nearestNode(b.pos.x, b.pos.y, b.pos.z, 4); e.nodeT = 0.6; }
    if (e.node < 0) return out.set(pp.x, pp.y, pp.z);
    const nx = nav.next[e.node];
    if (nx < 0) return out.set(pp.x, pp.y, pp.z);
    AR.World.nodePos(nx, out);
    const dd = Math.hypot(out.x - b.pos.x, out.z - b.pos.z);
    // jump pad edge: launch when standing on the pad node
    if (nav.nextType[e.node] === 2 && dd > 3 && b.onGround) {
      const here = AR.World.nodePos(e.node, _w);
      if (Math.hypot(here.x - b.pos.x, here.z - b.pos.z) < 1.3) { launch(e, out); return out; }
      return out.copy(here);
    }
    if (dd < 0.9 || (nav.nextType[e.node] === 1 && dd < 1.6)) { e.node = nx; e.nodeT = 0.6; }
    return out;
  }
  function launch(e, t) {
    const b = e.body, apex = Math.max(t.y, b.pos.y) + 2.6, g = 24;
    const vy = Math.sqrt(2 * g * (apex - b.pos.y)), T = vy / g + Math.sqrt(2 * (apex - t.y) / g);
    b.vel.set((t.x - b.pos.x) / T, vy, (t.z - b.pos.z) / T); b.onGround = false; e.flyT = T;
    AR.Fx.emit(AR.Fx.glow, b.pos.x, b.pos.y + 0.2, b.pos.z, 0x00e5ff, 16, 3, 0.4, { up: 5 });
  }
  function steer(e, tx, tz, speed, dt, accel = 10) {
    const b = e.body;
    let dx = tx - b.pos.x, dz = tz - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) { dx /= d; dz /= d; } else { dx = 0; dz = 0; }
    // separation
    let sx = 0, sz = 0;
    for (const o of list) {
      if (o === e || o.dying || o.d.fly) continue;
      const ox = b.pos.x - o.body.pos.x, oz = b.pos.z - o.body.pos.z, od = ox * ox + oz * oz, md = (b.r + o.body.r) * 1.3;
      if (od < md * md && od > 1e-4) { const k = (md - Math.sqrt(od)) / md; sx += ox * k * 2; sz += oz * k * 2; }
    }
    const wx = dx * speed + sx * 2.5, wz = dz * speed + sz * 2.5;
    e.want = speed > 0.3 && d > 0.6; e.wantX = dx; e.wantZ = dz;
    if (b.onGround && !e.flyT) {
      const k = 1 - Math.exp(-accel * dt);
      b.vel.x += (wx - b.vel.x) * k; b.vel.z += (wz - b.vel.z) * k;
    }
    return d;
  }
  function faceTo(e, x, z, rate, dt) {
    const want = Math.atan2(x - e.body.pos.x, z - e.body.pos.z);
    const df = AR.angDiff(e.yaw, want);
    e.yaw += clamp(df, -rate * dt, rate * dt);
  }

  function aiTick(e, dt) {
    const P = AR.Player.P, b = e.body;
    if (!P) return;
    const pp = P.body.pos;
    const dx = pp.x - b.pos.x, dz = pp.z - b.pos.z, dist = Math.hypot(dx, dz), dy = pp.y - b.pos.y;
    e.atkT -= dt; e.fireT -= dt; e.dodgeCd -= dt;
    if (e.stun > 0) { e.stun -= dt; b.vel.x *= 0.9; b.vel.z *= 0.9; return; }
    if (e.flinchT > 0) { e.flinchT -= dt; b.vel.x *= 0.85; b.vel.z *= 0.85; return; }
    if (e.flyT > 0) {
      e.flyT -= dt;
      if (e.vault) { b.vel.x = e.vault.x; b.vel.z = e.vault.z; }          // keep pushing over the rail once the feet clear it
      if (e.flyT <= 0 || (b.onGround && e.flyT < 0.35)) { e.flyT = 0; e.vault = null; }
      return;
    }
    const ai = e.d.ai;
    if (ai === 'swarm') {
      const near = dist < 7 && Math.abs(dy) < 1.5;
      const spd = (near ? e.d.run : e.d.walk) * (AR.Mission?.swarmSpeed || 1);
      if (e.state === 'attack') {
        b.vel.x *= 0.8; b.vel.z *= 0.8; faceTo(e, pp.x, pp.z, 6, dt);
        e.stateT -= dt;
        if (e.stateT <= 0.35 && !e.struck) {
          e.struck = true;
          if (dist < e.d.reach + 0.3 && Math.abs(dy) < 1.4) AR.Player.takeDamage(e.d.dmg * e.dmgMul, b.pos, 'melee');
        }
        if (e.stateT <= 0) { e.state = 'chase'; e.atkT = e.d.atkCd; }
        return;
      }
      const t = pathTarget(e, _v);
      steer(e, t.x, t.z, spd, dt, 6);
      faceTo(e, b.pos.x + b.vel.x, b.pos.z + b.vel.z, 5, dt);
      e.play(near ? 'Run' : 'Walk', 0.25, true, near ? 1.1 : 0.9 + spd * 0.1);
      if (dist < e.d.reach && Math.abs(dy) < 1.4 && e.atkT <= 0) { e.state = 'attack'; e.stateT = 0.8; e.struck = false; e.play('Punch Combo', 0.1, false, 1.2); }
      e.groanT -= dt;
      if (e.groanT <= 0) { e.groanT = rand(4, 10); AR.Sfx.groan(b.pos.x, b.pos.y + 1.5, b.pos.z); }
      return;
    }
    if (ai === 'rusher') {
      if (e.state === 'attack') {
        b.vel.x *= 0.85; b.vel.z *= 0.85; faceTo(e, pp.x, pp.z, 8, dt);
        e.stateT -= dt;
        if (e.stateT <= 0.45 && !e.struck) {
          e.struck = true;
          if (dist < e.d.reach + 0.4 && Math.abs(dy) < 1.5) { AR.Player.takeDamage(e.d.dmg * e.dmgMul, b.pos, 'melee'); P.body.vel.x += dx / Math.max(0.5, dist) * 4; P.body.vel.z += dz / Math.max(0.5, dist) * 4; }
        }
        if (e.stateT <= 0) { e.state = 'chase'; e.atkT = e.d.atkCd; }
        return;
      }
      if (e.state === 'dodge') { e.stateT -= dt; if (e.stateT <= 0) e.state = 'chase'; return; }
      // dodge when the player aims at him
      AR.Player.aimDir(_w);
      const ex = b.pos.x - camPos().x, ey = b.pos.y + 1.2 - camPos().y, ez = b.pos.z - camPos().z, el = Math.hypot(ex, ey, ez);
      if (e.dodgeCd <= 0 && el < 22 && el > 4 && (ex * _w.x + ey * _w.y + ez * _w.z) / el > 0.985 && b.onGround && Math.random() < 0.6) {   // NOSONAR
        const side = Math.random() < 0.5 ? 1 : -1;                                                             // NOSONAR
        b.vel.x = -dz / Math.max(0.1, dist) * side * 9; b.vel.z = dx / Math.max(0.1, dist) * side * 9; b.vel.y = 3.5; b.onGround = false;
        e.state = 'dodge'; e.stateT = 0.45; e.dodgeCd = rand(1.8, 3.2); e.play('Dodge', 0.05, false, 1.3);
        return;
      }
      const t = pathTarget(e, _v);
      let tx = t.x, tz = t.z;
      if (e.node < 0 && dist > 5) { e.zig += dt * 3.2; const s = Math.sin(e.zig) * 3.5; tx += -dz / dist * s; tz += dx / dist * s; }
      steer(e, tx, tz, e.d.run * (AR.Mission?.speedMul || 1), dt, 9);
      faceTo(e, b.pos.x + b.vel.x, b.pos.z + b.vel.z, 9, dt);
      e.play('Run', 0.2, true, 1.15);
      if (dist < e.d.reach && Math.abs(dy) < 1.5 && e.atkT <= 0) { e.state = 'attack'; e.stateT = 0.75; e.struck = false; e.play('Punch Combo', 0.08, false, 1.5); }
      return;
    }
    if (ai === 'ranged') {
      const [lo, hi] = e.d.range;
      if (e.state === 'aim' || e.state === 'burst') {
        b.vel.x *= 0.8; b.vel.z *= 0.8; faceTo(e, pp.x, pp.z, 10, dt);
        e.stateT -= dt;
        if (e.state === 'aim' && e.stateT <= 0) { e.state = 'burst'; e.shots = e.d.burst; e.stateT = 0; }
        if (e.state === 'burst' && e.stateT <= 0) {
          if (e.shots-- > 0) { enemyFire(e, e.d.boltSpeed, e.d.dmg, 0xff2bd6); e.stateT = e.d.burstGap; e.play('Shoot', 0.05, false, 1.6); }
          else { e.state = 'move'; e.fireT = rand(e.d.fireCd[0], e.d.fireCd[1]) * (AR.Mission?.fireMul || 1); if (e.ring) e.ringGlow = 0; }
        }
        if (e.ring) e.ringGlow = e.state === 'aim' ? 1 - e.stateT / e.d.tele : 0.4;
        return;
      }
      const see = e.sees ?? canSee(e);
      let tx, tz, spd = e.d.walk;
      if (!see || dist > hi || Math.abs(dy) > 3) { const t = pathTarget(e, _v); tx = t.x; tz = t.z; spd = e.d.run; }
      else {
        e.seeT = (e.seeT ?? 0) - dt; if (e.seeT <= 0) { e.seeT = 0.3; e.sees = canSee(e); }
        e.strafeT -= dt; if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = rand(0.9, 1.8); }
        const back = dist < lo ? -1 : dist > (lo + hi) / 2 ? 0.5 : 0;
        tx = b.pos.x + (dx / dist) * back * 3 + (-dz / dist) * e.strafe * 3;
        tz = b.pos.z + (dz / dist) * back * 3 + (dx / dist) * e.strafe * 3;
        if (e.fireT <= 0 && e.sees) { e.state = 'aim'; e.stateT = e.d.tele; AR.Sfx.telegraph(b.pos.x, b.pos.y + 1.5, b.pos.z, 1.2); e.play('Idle Combat', 0.1); return; }
      }
      steer(e, tx, tz, spd, dt, 8);
      faceTo(e, pp.x, pp.z, 6, dt);
      e.play(Math.hypot(b.vel.x, b.vel.z) > 2.5 ? 'Run' : 'Walk', 0.2);
      return;
    }
    if (ai === 'charger') {
      if (e.state === 'windup') {
        b.vel.x *= 0.8; b.vel.z *= 0.8;
        e.stateT -= dt;
        if (e.stateT > e.d.chargeTele * 0.45) faceTo(e, pp.x, pp.z, 7, dt);
        e.glow = 1;
        if (e.stateT <= 0) { e.state = 'charge'; e.stateT = 1.35; e.hitPlayer = false; e.play('Run', 0.05, true, 1.8); }
        return;
      }
      if (e.state === 'charge') {
        e.stateT -= dt;
        const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
        b.vel.x = fx * e.d.chargeSpeed; b.vel.z = fz * e.d.chargeSpeed;
        if (Math.random() < 0.5) AR.Fx.emit(AR.Fx.debris, b.pos.x, b.pos.y + 0.1, b.pos.z, 0x5a5048, 2, 2, 0.6);      // NOSONAR
        if (!e.hitPlayer && dist < 1.8 && Math.abs(dy) < 1.6) {
          e.hitPlayer = true;
          AR.Player.takeDamage(e.d.dmg * e.dmgMul, b.pos, 'charge');
          P.body.vel.x += fx * 14; P.body.vel.z += fz * 14; P.body.vel.y = 6; P.body.onGround = false;
          AR.Player.addTrauma(0.6);
        }
        if (e.bonk) {
          e.bonk = false; e.state = 'stunned'; e.stun = 1.4; e.glow = 0;
          AR.Fx.shock(b.pos.x, b.pos.y, b.pos.z, 0xffd400, 3, 0.35); AR.Sfx.land(1); AR.Player.addTrauma(0.2);
          e.play('Hit React', 0.05, false, 0.6);
          AR.Hud.toast('BONK', 'stunned — free damage');
          return;
        }
        if (e.stateT <= 0) { e.state = 'chase'; e.atkT = 2; e.glow = 0; }
        return;
      }
      if (e.state === 'slam') {
        b.vel.x *= 0.7; b.vel.z *= 0.7; e.stateT -= dt;
        if (e.stateT <= 0) {
          e.state = 'chase'; e.atkT = e.d.atkCd;
          const [rad, dmg] = e.d.slam;
          AR.Fx.shock(b.pos.x, b.pos.y, b.pos.z, 0xff8c00, rad, 0.4); AR.Fx.emit(AR.Fx.debris, b.pos.x, b.pos.y + 0.2, b.pos.z, 0x6a5a48, 30, 6, 0.8, { up: 4 });
          AR.Sfx.explosion(b.pos.x, b.pos.y, b.pos.z, 0.6);
          if (dist < rad && Math.abs(dy) < 1.2 && P.body.onGround) { AR.Player.takeDamage(dmg * e.dmgMul, b.pos, 'slam'); P.body.vel.y = 7; P.body.onGround = false; }
          if (e.telegraph) { e.telegraph.life = 0.01; e.telegraph = null; }
        }
        return;
      }
      if (e.state === 'stunned') { if (e.stun <= 0) e.state = 'chase'; return; }
      const see = e.sees;
      if (e.atkT <= 0 && dist < 3.4 && Math.abs(dy) < 1.2) {
        e.state = 'slam'; e.stateT = 0.75; e.play('Hype Dampener', 0.1, false, 1.4);
        e.telegraph = AR.Fx.telegraph(b.pos.x, b.pos.y, b.pos.z, e.d.slam[0], 0xff8c00, 0.75);
        AR.Sfx.telegraph(b.pos.x, b.pos.y + 1, b.pos.z, 0.6);
        return;
      }
      if (e.atkT <= 0 && see && dist > 5 && dist < 24 && Math.abs(dy) < 1.0) {
        e.state = 'windup'; e.stateT = e.d.chargeTele; e.play('Hype', 0.1, true, 1.6);
        AR.Sfx.telegraph(b.pos.x, b.pos.y + 1.5, b.pos.z, 0.5);
        AR.Hud.warn(e);
        return;
      }
      const t = pathTarget(e, _v);
      steer(e, t.x, t.z, e.d.walk, dt, 5);
      faceTo(e, b.pos.x + b.vel.x, b.pos.z + b.vel.z, 4, dt);
      e.play('Walk', 0.3, true, 0.9);
      return;
    }
    if (ai === 'flyer') {
      // orbit the player at a radius and a hover height; shoot with a short flash first
      e.orbit += dt * (0.5 + (e.id % 3) * 0.15) * e.strafe;
      const R = 9 + (e.id % 4);
      const tx = pp.x + Math.cos(e.orbit) * R, tz = pp.z + Math.sin(e.orbit) * R;
      const floor = AR.World.floorAt(b.pos.x, b.pos.z, 0.3, b.pos.y + 1);
      const ty = Math.max(floor, pp.y) + e.alt;
      let vx = tx - b.pos.x, vy = ty - b.pos.y, vz = tz - b.pos.z;
      const l = Math.hypot(vx, vy, vz) || 1;
      const spd = Math.min(e.d.run, l * 2);
      vx = vx / l * spd; vy = vy / l * spd; vz = vz / l * spd;
      // avoid walls
      const w = AR.World.raycast(b.pos.x, b.pos.y, b.pos.z, vx / spd || 0, vy / spd || 0, vz / spd || 0, 2.5);
      if (w) { vx += w.nx * 6; vy += w.ny * 6 + 2; vz += w.nz * 6; e.strafe *= -1; }
      const k = 1 - Math.exp(-3 * dt);
      b.vel.x += (vx - b.vel.x) * k; b.vel.y += (vy - b.vel.y) * k; b.vel.z += (vz - b.vel.z) * k;
      faceTo(e, pp.x, pp.z, 5, dt);
      if (e.state === 'aim') {
        e.stateT -= dt; e.glow = 1 - e.stateT / e.d.tele;
        if (e.stateT <= 0) { enemyFire(e, e.d.boltSpeed, e.d.dmg, 0x00e5ff); e.state = 'fly'; e.glow = 0; e.fireT = rand(e.d.fireCd[0], e.d.fireCd[1]); }
      } else if (e.fireT <= 0) {
        e.seeT = (e.seeT ?? 0) - dt;
        if (canSee(e)) { e.state = 'aim'; e.stateT = e.d.tele; AR.Sfx.telegraph(b.pos.x, b.pos.y, b.pos.z, 1.6); } else e.fireT = 0.5;
      }
      return;
    }
    if (ai === 'tank') {
      faceTo(e, pp.x, pp.z, 1.1, dt);
      if (e.state === 'lob') {
        b.vel.x *= 0.8; b.vel.z *= 0.8; e.stateT -= dt;
        if (e.stateT <= 0) e.state = 'chase';
        return;
      }
      if (e.state === 'stomp') {
        b.vel.x *= 0.7; b.vel.z *= 0.7; e.stateT -= dt;
        if (e.stateT <= 0) {
          e.state = 'chase'; e.atkT = e.d.atkCd;
          AR.Fx.shock(b.pos.x, b.pos.y, b.pos.z, 0x4da6ff, 3.2, 0.35); AR.Sfx.explosion(b.pos.x, b.pos.y, b.pos.z, 0.5);
          if (dist < 3.2 && Math.abs(dy) < 1.2) { AR.Player.takeDamage(e.d.dmg * e.dmgMul, b.pos, 'slam'); P.body.vel.x += dx / Math.max(0.4, dist) * 10; P.body.vel.z += dz / Math.max(0.4, dist) * 10; P.body.vel.y = 5; }
        }
        return;
      }
      if (dist < 3 && e.atkT <= 0 && Math.abs(dy) < 1.2) { e.state = 'stomp'; e.stateT = 0.6; e.play('Punch Combo', 0.1, false, 1.1); AR.Sfx.telegraph(b.pos.x, b.pos.y + 1, b.pos.z, 0.5); return; }
      if (e.fireT <= 0 && dist < 34 && (e.sees ?? true)) {
        e.state = 'lob'; e.stateT = 0.8; e.fireT = rand(e.d.fireCd[0], e.d.fireCd[1]) * (AR.Mission?.fireMul || 1);
        e.play('Shoot', 0.1, false, 0.8);
        lob(e, pp.x + P.body.vel.x * 0.6, pp.y, pp.z + P.body.vel.z * 0.6);
        return;
      }
      const want = dist > 13 ? 1 : dist < 7 ? -0.4 : 0;
      const t = pathTarget(e, _v);
      if (want > 0) steer(e, t.x, t.z, e.d.walk, dt, 4); else steer(e, b.pos.x - dx * want, b.pos.z - dz * want, e.d.walk * 0.6, dt, 4);
      e.play(Math.hypot(b.vel.x, b.vel.z) > 0.6 ? 'Walk' : 'Idle Combat', 0.3, true, 0.8);
    }
  }
  function camPos() { return AR.camera.position; }

  /* ================================================================== enemy attacks */
  function enemyFire(e, speed, dmg, color) {
    const P = AR.Player.P;
    const ox = e.headPos.x, oy = e.headPos.y - (e.d.unit ? 0 : 0.25), oz = e.headPos.z;
    const pp = P.body.pos;
    const tx = pp.x + P.body.vel.x * 0.25 + rand(-0.6, 0.6), ty = pp.y + 1.1 + rand(-0.3, 0.3), tz = pp.z + P.body.vel.z * 0.25 + rand(-0.6, 0.6);
    const dir = V3(tx - ox, ty - oy, tz - oz).normalize();
    spawnProj({ owner: 'enemy', x: ox + dir.x * 0.5, y: oy + dir.y * 0.5, z: oz + dir.z * 0.5, dir, speed: speed * (AR.Mission?.projMul || 1), grav: 0, dmg: dmg * e.dmgMul, size: 0.3, color, life: 4, kind: 'bolt' });
    AR.Sfx.enemyShot(ox, oy, oz, 'bolt');
    AR.Fx.flash(ox, oy, oz, color, 0.9, 0.08);
  }
  function lob(e, tx, ty, tz) {
    const fl = AR.World.floorAt(tx, tz, 0.3, ty + 1.5);
    const gy = fl > -1e3 ? fl : ty;
    const ox = e.body.pos.x, oy = e.body.pos.y + e.body.h + 0.3, oz = e.body.pos.z;
    const T = 1.15, g = 18;
    const vx = (tx - ox) / T, vz = (tz - oz) / T, vy = (gy - oy + 0.5 * g * T * T) / T;
    const tele = AR.Fx.telegraph(tx, gy, tz, e.d.lob[0], 0x4da6ff, T);
    spawnProj({ owner: 'enemy', x: ox, y: oy, z: oz, vel: V3(vx, vy, vz), grav: -g, dmg: e.d.lob[1] * e.dmgMul, splash: e.d.lob[0], splashDmg: 1, size: 0.45, color: 0x4da6ff, life: T + 0.4, kind: 'lob', tele, noHit: true });
    AR.Sfx.enemyShot(ox, oy, oz, 'lob');
  }

  /* ================================================================== projectiles */
  const projs = [];
  function spawnProj(o) {
    const vel = o.vel ? o.vel.clone() : o.dir.clone().multiplyScalar(o.speed);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: Assets.starTex(), color: o.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    spr.scale.setScalar(o.size * (o.owner === 'enemy' ? 2.6 : 2));
    const g = new THREE.Group(); g.add(spr);
    if (o.grenade) { const m = new THREE.Mesh(new THREE.BoxGeometry(o.size * 0.8, o.size * 0.8, o.size * 1.1), new THREE.MeshBasicMaterial({ color: 0x302a3a })); g.add(m); }
    if (o.kind === 'heart') { spr.material.map = AR.heartTex || (AR.heartTex = heartTex()); spr.scale.setScalar(o.size * 3); }
    g.position.set(o.x, o.y, o.z); group.add(g);
    projs.push({ ...o, pos: V3(o.x, o.y, o.z), vel, obj: g, spr, age: 0, bounces: o.bounce || 0 });
  }
  function heartTex() {
    const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
    x.fillStyle = '#ff2bd6'; x.beginPath(); x.moveTo(16, 28); x.bezierCurveTo(2, 18, 2, 6, 10, 6); x.bezierCurveTo(14, 6, 16, 9, 16, 11); x.bezierCurveTo(16, 9, 18, 6, 22, 6); x.bezierCurveTo(30, 6, 30, 18, 16, 28); x.fill();
    x.fillStyle = '#fff'; x.fillRect(9, 9, 4, 3);
    return new THREE.CanvasTexture(c);
  }
  function projTick(dt) {
    const P = AR.Player.P;
    for (let i = projs.length - 1; i >= 0; i--) {
      const p = projs[i];
      p.age += dt;
      if (p.age > p.life) { if (p.splash) detonate(p); removeProj(i); continue; }
      p.vel.y += (p.grav || 0) * dt;
      const sx = p.pos.x, sy = p.pos.y, sz = p.pos.z;
      const step = p.vel.length() * dt;
      const dx = p.vel.x / (step / dt || 1), dy = p.vel.y / (step / dt || 1), dz = p.vel.z / (step / dt || 1);
      // hits on actors along the segment
      if (p.owner === 'player') {
        const h = rayHit(sx, sy, sz, dx, dy, dz, step + p.size);
        if (h && !p.fuseOnly) {
          if (p.splash) { p.pos.set(h.x, h.y, h.z); detonate(p, h.e); }
          else damage(h.e, p.dmg * (h.head ? 1.5 : 1), { src: 'proj', dir: V3(dx, dy, dz), knock: p.knock, head: h.head, x: h.x, y: h.y, z: h.z, weapon: p.weapon });
          if (!p.splash) { AR.Sfx.hit(h.head, 1); AR.Hud.hitmark(h.head, false); }
          removeProj(i); continue;
        }
        if (h && p.fuseOnly) { p.vel.multiplyScalar(0.3); }
      } else if (P?.alive && !p.noHit) {
        // closest approach of the segment to the player's vertical axis
        const b = P.body;
        const ax = b.pos.x - sx, az = b.pos.z - sz;
        const hl = Math.hypot(dx, dz) || 1e-6;
        let t = (ax * dx + az * dz) / (hl * hl); t = clamp(t, 0, step);
        const cx = sx + dx * t, cy = sy + dy * t, cz = sz + dz * t;
        const hr = (P.crouching ? 0.9 : 1.75);
        if (Math.hypot(cx - b.pos.x, cz - b.pos.z) < b.r + p.size * 0.6 && cy > b.pos.y - 0.1 && cy < b.pos.y + hr) {
          AR.Player.takeDamage(p.dmg, { x: sx, z: sz }, 'proj');
          AR.Fx.emit(AR.Fx.glow, cx, cy, cz, p.color, 10, 4, 0.3);
          if (p.splash) { p.pos.set(cx, cy, cz); detonate(p); }
          removeProj(i); continue;
        } else if (!p.nearMissed && Math.hypot(cx - b.pos.x, cz - b.pos.z) < 1.4 && cy > b.pos.y && cy < b.pos.y + 2.2) {
          p.nearMissed = true; AR.Mission?.nearMiss();
        }
      }
      // world
      const w = AR.World.raycast(sx, sy, sz, dx, dy, dz, step + 0.05);
      if (w) {
        const hx = sx + dx * w.t, hy = sy + dy * w.t, hz = sz + dz * w.t;
        if (p.bounces > 0) {
          p.bounces--;
          const vn = p.vel.x * w.nx + p.vel.y * w.ny + p.vel.z * w.nz;
          p.vel.x -= 2 * vn * w.nx; p.vel.y -= 2 * vn * w.ny; p.vel.z -= 2 * vn * w.nz;
          p.vel.multiplyScalar(p.grenade ? 0.55 : 0.9);
          p.pos.set(hx + w.nx * 0.05, hy + w.ny * 0.05, hz + w.nz * 0.05);
          if (!p.grenade) AR.Fx.emit(AR.Fx.glow, hx, hy, hz, p.color, 6, 3, 0.2);
          else AR.Sfx.reload(null, 'out');
        } else {
          p.pos.set(hx + w.nx * 0.1, hy + w.ny * 0.1, hz + w.nz * 0.1);
          if (p.splash) detonate(p);
          else { AR.Fx.emit(AR.Fx.glow, hx, hy, hz, p.color, 8, 3, 0.25, { dir: V3(w.nx, w.ny, w.nz) }); AR.Fx.decal(hx, hy, hz, w.nx, w.ny, w.nz, 0.25); }
          removeProj(i); continue;
        }
      } else p.pos.set(sx + p.vel.x * dt, sy + p.vel.y * dt, sz + p.vel.z * dt);
      p.obj.position.copy(p.pos);
      if (p.kind === 'heart' || p.owner === 'player' && !p.grenade) p.spr.material.rotation += dt * 6;
      if (Math.random() < (p.owner === 'player' ? 0.6 : 0.35)) AR.Fx.emit(AR.Fx.glow, p.pos.x, p.pos.y, p.pos.z, p.color, 1, 0.3, 0.25, { up: 0, grav: 0 });  // NOSONAR
    }
  }
  function detonate(p, direct) {
    if (p.tele) p.tele.life = 0.01;
    explode(p.pos.x, p.pos.y, p.pos.z, p.splash, p.dmg * (p.splashDmg || 1), p.owner, p.knock || 8, p.owner === 'player' ? 'explosion' : 'enemyExplosion');
    void direct;
  }
  function removeProj(i) { const p = projs[i]; group.remove(p.obj); p.obj.traverse(o => o.material?.dispose?.()); projs.splice(i, 1); }
  function clearEnemyProjs() { for (let i = projs.length - 1; i >= 0; i--) if (projs[i].owner === 'enemy') { if (projs[i].tele) projs[i].tele.life = 0.01; removeProj(i); } }

  /* ================================================================== per-frame */
  function tick(dt) {
    AR.dt = dt;
    const P = AR.Player.P;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i], b = e.body;
      e.t += dt;
      if (e.dying) {
        e.deathT += dt;
        if (e.deathT > 8) { remove(i); continue; }
        if (e.obj.visible) {
          AR.World.moveBody(b, dt, -22);
          if (b.onGround) { b.vel.x *= 0.8; b.vel.z *= 0.8; e.spin.multiplyScalar(0.8); }
          e.obj.rotation.x += e.spin.x * dt * 0.3;
          if (e.deathT > 2.2) { const s = Math.max(0.001, 1 - (e.deathT - 2.2) / 0.5); e.obj.scale.set(s, s, s); if (s <= 0.002) { remove(i); continue; } }
          e.obj.position.copy(b.pos);
          animate(e, dt);
        }
        continue;
      }
      if (e.state === 'spawn') {
        e.stateT -= dt;
        const s = clamp(1 - e.stateT / 0.5, 0.01, 1);
        e.obj.scale.setScalar(1 - (1 - s) * (1 - s));
        if (e.stateT <= 0) { e.state = 'chase'; e.obj.scale.setScalar(1); }
        e.obj.position.copy(b.pos);
        animate(e, dt);
        continue;
      }
      if (e.boss) AR.Boss.tick(e, dt);
      else if (P?.alive) aiTick(e, dt);
      else { b.vel.x *= 0.9; b.vel.z *= 0.9; e.play('Hype', 0.4); }
      // knockback impulse decays into velocity
      b.vel.x += e.knock.x; b.vel.z += e.knock.z; e.knock.set(0, 0, 0);
      if (e.d.fly && !e.boss) {
        b.pos.addScaledVector(b.vel, dt);
        const f = AR.World.floorAt(b.pos.x, b.pos.z, 0.3, b.pos.y + 0.5);
        if (b.pos.y < f + 1) { b.pos.y = f + 1; b.vel.y = Math.abs(b.vel.y); }
        for (const n of e.spinNodes) n.rotation.y += dt * 14;
        e.obj.rotation.z = AR.damp(e.obj.rotation.z, clamp(-b.vel.x * 0.04, -0.4, 0.4), 4, dt);
      } else if (!e.boss || !e.bossFly) {
        const res = AR.World.moveBody(b, dt, -24);
        if (res.hitWall && e.state === 'charge') e.bonk = true;
        if (e.flyT > 0 && (e.flyT < 0.6 && b.onGround || res.hitWall && b.onGround)) e.flyT = 0;
        if (!b.onGround) { b.vel.x *= 0.995; b.vel.z *= 0.995; }
        // stuck (pressed into a railing at a ledge drop, snagged on a prop): vault it
        e.stuckT += dt;
        if (e.stuckT > 0.9) {
          if (e.want && e.lastPos.distanceTo(b.pos) < 0.45 && !['aim', 'windup', 'attack', 'slam', 'stomp', 'lob'].includes(e.state) && !e.boss && b.onGround) {
            b.vel.y = 7.8; b.vel.x = e.wantX * 4; b.vel.z = e.wantZ * 4; b.onGround = false; e.flyT = 0.7; e.vault = { x: e.wantX * 4, z: e.wantZ * 4 };
            if (e.type !== 'serverless') e.play('Jump', 0.05, false, 1.2);
          }
          e.stuckT = 0; e.lastPos.copy(b.pos);
        }
      }
      if (b.pos.y < -15) { e.hp = 0; kill(e, { src: 'fall' }, 999); continue; }
      // bodies don't overlap the player: shove the enemy out (big ones shove you a little too)
      if (P?.alive && !e.d.fly) {
        const pb = P.body, ox = b.pos.x - pb.pos.x, oz = b.pos.z - pb.pos.z, od = Math.hypot(ox, oz), md = b.r + pb.r;
        if (od < md && b.pos.y < pb.pos.y + pb.h && b.pos.y + b.h > pb.pos.y + 0.2) {
          const nx = od > 1e-3 ? ox / od : Math.sin(e.yaw), nz = od > 1e-3 ? oz / od : Math.cos(e.yaw), pen = md - od;
          const heavy = e.d.knock < 0.5 ? 0.35 : 0.08;
          b.pos.x += nx * pen * (1 - heavy); b.pos.z += nz * pen * (1 - heavy);
          pb.pos.x -= nx * pen * heavy; pb.pos.z -= nz * pen * heavy;
        }
      }
      // burn
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnAcc = (e.burnAcc || 0) + dt;
        if (e.burnAcc > 0.33) { e.burnAcc = 0; damage(e, e.burnDps * 0.33, { src: 'burn' }); }
        if (Math.random() < 0.5) AR.Fx.emit(AR.Fx.glow, b.pos.x + rand(-0.3, 0.3), b.pos.y + rand(0.3, 1.6), b.pos.z + rand(-0.3, 0.3), 0xff6020, 1, 1, 0.4, { up: 2, grav: 2 });   // NOSONAR
        if (e.dying) continue;
      }
      e.obj.position.copy(b.pos);
      e.obj.rotation.y = e.yaw;
      animate(e, dt);
      updateHead(e);
    }
    projTick(dt);
  }
  function animate(e, dt) {
    const step = STEP();
    if (!step) e.mixer.update(dt);
    else { e.acc += dt; if (e.acc >= step) { const n = Math.floor(e.acc / step); e.acc -= n * step; e.mixer.update(n * step); } }
    // lighting: probe tint + hit flash + charge glow
    e.lightT -= dt;
    if (e.lightT <= 0 || e.flash > 0 || e.glow) {
      if (e.lightT <= 0) { e.lightT = 0.2; AR.World.probeAt(e.body.pos.x, e.body.pos.y + 1.1, e.body.pos.z, _c); e.probe = (e.probe || new THREE.Color()).copy(_c).multiplyScalar(1.55).addScalar(0.16); }
      const f = e.flash, gl = e.glow || 0, rg = e.ringGlow || 0;
      for (const m of e.mats) {
        m.color.copy(e.probe || _c.setRGB(1, 1, 1));
        if (f > 0) m.color.lerp(_c.setRGB(4, 4, 4), f * 0.6);
        if (gl > 0) m.color.lerp(_c.setRGB(3, 0.6, 0.2), gl * 0.5);
        if (e.burnT > 0) m.color.lerp(_c.setRGB(2.5, 0.8, 0.2), 0.3 + Math.random() * 0.2);              // NOSONAR
        if (rg > 0 && m.emissiveMap) m.emissive.setRGB(1 + rg * 3, 1 + rg * 3, 1 + rg * 3);
      }
      e.flash = Math.max(0, e.flash - dt * 7);
    }
  }
  function remove(i) {
    const e = list[i];
    group.remove(e.obj);
    for (const m of e.mats) m.dispose();
    if (e.check) e.check.material.dispose();
    list.splice(i, 1);
  }
  function clear() {
    for (let i = list.length - 1; i >= 0; i--) remove(i);
    for (let i = projs.length - 1; i >= 0; i--) { if (projs[i].tele) projs[i].tele.life = 0.01; removeProj(i); }
  }
  function init(sc) { scene = sc; group = new THREE.Group(); group.name = 'arena-enemies'; scene.add(group); }
  function dispose() { clear(); if (group) scene.remove(group); group = null; }

  return {
    preload, init, dispose, tick, spawn, clear, rayHit, inCone, nearest, hitByBullet, damage, kicked, explode, spawnProj, clearEnemyProjs, kill,
    enemyFire, lob, steer, faceTo, pathTarget, animate, canSee, get list() { return list; }, get projs() { return projs; }, get group() { return group; },
    alive: () => list.reduce((n, e) => n + (e.dying || e.boss ? 0 : 1), 0),
  };
})();

/* ====================================================================== drops: chips, ammo, health, guns */
AR.Drops = (() => {
  const { V3, rand } = AR;
  const list = [];
  let group = null, scene = null;
  const geo = { chip: null, box: null };
  function init(sc) {
    scene = sc; group = new THREE.Group(); group.name = 'arena-drops'; scene.add(group);
    geo.chip = new THREE.OctahedronGeometry(0.13, 0); geo.box = new THREE.BoxGeometry(0.34, 0.24, 0.34);
  }
  function dispose() { for (const d of list) group.remove(d.obj); list.length = 0; if (group) scene.remove(group); group = null; }
  const COL = { chip: 0xffd400, ammo: 0x39ff8a, health: 0xff2b6a, armor: 0x4da6ff, drip: 0xff2bd6, crate: 0xff2bd6, cone: 0xff7a1a };
  function spawn(kind, x, y, z, extra = {}) {
    let obj;
    if (kind === 'gun') {
      const g = AR.Arsenal.build(extra.gun, extra.tier || 0, { unlit: true });
      obj = new THREE.Group(); if (g) { g.root.scale.setScalar(1.5); g.root.rotation.z = 0.25; obj.add(g.root); }
      const col = new THREE.Color(AR.Arsenal.tierInfo(extra.tier || 0).c);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.3, 5, 8, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 1.8; obj.add(beam);
    } else if (kind === 'crate' || kind === 'cone') {
      // wardrobe collectibles: a merch crate (every run) or the traffic cone (once). A tall faint beam gives them away.
      obj = new THREE.Group();
      const body = kind === 'cone'
        ? new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), new THREE.MeshBasicMaterial({ color: COL.cone }))
        : new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.6), new THREE.MeshBasicMaterial({ color: 0x2a1030 }));
      if (kind === 'crate') {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.62), new THREE.MeshBasicMaterial({ color: COL.crate }));
        body.add(stripe);
      } else {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.08, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        band.position.y = 0.02; body.add(band);
      }
      obj.add(body);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.25, 8, 8, 1, true), new THREE.MeshBasicMaterial({ color: COL[kind], transparent: true, opacity: kind === 'cone' ? 0.08 : 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 4; obj.add(beam);
    } else {
      const m = new THREE.Mesh(kind === 'chip' ? geo.chip : geo.box, new THREE.MeshBasicMaterial({ color: COL[kind] }));
      obj = new THREE.Group(); obj.add(m);
      if (kind !== 'chip') {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: Assets.starTex(), color: COL[kind], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
        s.scale.setScalar(0.9); obj.add(s);
      }
    }
    obj.position.set(x, y, z); group.add(obj);
    const a = Math.random() * 6.28;                                                                          // NOSONAR
    const still = !!extra.still;
    const d = { kind, obj, pos: V3(x, y, z), vel: still ? V3(0, 0, 0) : V3(Math.cos(a) * rand(1, 3), rand(3, 6), Math.sin(a) * rand(1, 3)), t: 0,
      life: still ? Infinity : kind === 'gun' ? 60 : 25, ...extra, magnet: false };
    list.push(d);
    return d;
  }
  function fromKill(e, info) {
    const b = e.body, P = AR.Player.P, S = AR.Player.S;
    const [c0, c1] = e.d.chips;
    const n = Math.round(rand(c0, c1 + 0.99) * (1 + S.chips) * (e.elite ? 3 : 1));
    for (let i = 0; i < n; i++) spawn('chip', b.pos.x, b.pos.y + 1, b.pos.z, { value: 1 });
    const g = AR.Player.gun;
    const pri = P.guns[1];
    const frac = pri ? (pri.reserve + pri.ammo) / (pri.d.reserve + pri.d.mag) : 1;
    // ammo pity: the emptier your primary, the likelier (and eventually guaranteed) the drop
    AR.Drops.pity = (AR.Drops.pity || 0) + (frac < 0.35 ? 1 : 0);
    if (Math.random() < (frac < 0.15 ? 0.6 : frac < 0.35 ? 0.35 : 0.12) + (e.elite ? 0.5 : 0) || AR.Drops.pity >= 3) {   // NOSONAR
      spawn('ammo', b.pos.x, b.pos.y + 1, b.pos.z); AR.Drops.pity = 0;
    }
    if (P.hp < P.maxHp * 0.65 && Math.random() < (e.d.hp > 200 ? 0.6 : 0.16)) spawn('health', b.pos.x, b.pos.y + 1, b.pos.z); // NOSONAR
    if (Math.random() < 0.06) spawn('armor', b.pos.x, b.pos.y + 1, b.pos.z);                                                    // NOSONAR
    if (e.elite) {
      // loot: the deeper into the mission (and the hotter the run), the rarer the gun
      const ph = AR.Mission.phase, heat = AR.Mission.heat;
      const lo = ph === 'act1' ? 1 : ph === 'act2' ? 2 : 3;
      let tier = lo + (Math.random() < 0.45 ? 1 : 0) + (Math.random() < 0.12 + heat * 0.04 ? 1 : 0);          // NOSONAR
      tier = Math.min(6, tier + Math.floor(heat / 3));
      spawn('gun', b.pos.x, b.pos.y + 0.6, b.pos.z, { gun: AR.pick(AR.PRIMARIES.filter(id => id !== P.guns[1]?.id)), tier });
      // elites carry merch: a DRIP tag for the wardrobe
      if (window.Wardrobe?.ready) spawn('drip', b.pos.x, b.pos.y + 1, b.pos.z, { value: window.Wardrobe.dripTag(AR.Mission.heat) });
    }
    void g; void info;
  }
  let nearGun = null;
  function tick(dt) {
    const P = AR.Player.P; if (!P) return;
    const pp = P.body.pos;
    nearGun = null;
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      d.t += dt; d.life -= dt;
      if (d.life <= 0) { group.remove(d.obj); list.splice(i, 1); continue; }
      const dx = pp.x - d.pos.x, dy = pp.y + 0.45 - d.pos.y, dz = pp.z - d.pos.z, dist = Math.hypot(dx, dy, dz);
      const reach = d.kind === 'chip' || d.kind === 'drip' ? 7 : d.still ? 1.8 : 3.2;
      if (d.kind !== 'gun' && (dist < reach && d.t > 0.35 || d.magnet)) {
        const full = (d.kind === 'health' && P.hp >= P.maxHp) || (d.kind === 'armor' && P.armor >= P.maxArmor);
        if (!full) {
          d.magnet = true;
          const sp = 9 + d.t * 6;
          d.vel.set(dx / dist * sp, dy / dist * sp, dz / dist * sp);
          d.pos.addScaledVector(d.vel, dt);
          if (dist < 1.1) { collect(d); group.remove(d.obj); list.splice(i, 1); continue; }
        }
      }
      if (!d.magnet) {
        d.vel.y -= 18 * dt; d.pos.addScaledVector(d.vel, dt);
        const f = AR.World.floorAt(d.pos.x, d.pos.z, 0.1, d.pos.y + 0.3) + (d.kind === 'gun' ? 0.7 : 0.25);
        if (d.pos.y < f) { d.pos.y = f; d.vel.y = Math.abs(d.vel.y) * 0.3; d.vel.x *= 0.6; d.vel.z *= 0.6; }
      }
      d.obj.position.copy(d.pos); d.obj.position.y += Math.sin(d.t * 3) * 0.08;
      d.obj.rotation.y += dt * (d.kind === 'chip' ? 5 : 1.6);
      if (d.life < 4) d.obj.visible = Math.sin(d.t * 20) > 0;
      if (d.still) d.obj.rotation.y += dt * 0.6;
      if (d.kind === 'gun' && dist < 2.2) nearGun = d;
    }
    AR.Hud.prompt(nearGun ? `[E] SWAP FOR ${AR.Arsenal.tierInfo(nearGun.tier || 0).p} ${AR.GUNS[nearGun.gun].name}` : null);
  }
  function collect(d) {
    const P = AR.Player.P;
    if (d.kind === 'chip') { AR.Mission.addChips(d.value || 1); AR.Sfx.pickup('chip'); }
    else if (d.kind === 'ammo') { AR.Player.addAmmo(0.35); AR.Sfx.pickup('ammo'); AR.Hud.toast('+AMMO', ''); }
    else if (d.kind === 'health') { AR.Player.heal(30); AR.Sfx.pickup('health'); AR.Hud.toast('+30 HP', 'HYPE DOG CONSUMED'); }
    else if (d.kind === 'armor') { P.armor = Math.min(P.maxArmor, P.armor + 25); AR.Sfx.pickup('ammo'); AR.Hud.toast('+25 ARMOR', ''); }
    else if (d.kind === 'drip' || d.kind === 'crate') { AR.Sfx.pickup('chip'); AR.Mission.addDrip(d.value || 10, d.kind); }
    else if (d.kind === 'cone') { AR.Sfx.pickup('health'); if (window.Wardrobe?.findCone()) AR.Mission.addDrip(100, 'cone'); }
    AR.Hud.weapon(AR.Player.gun, P);
  }
  function use() {
    if (!nearGun) return false;
    const old = AR.Player.giveGun(nearGun.gun, nearGun.tier || 0);
    const ti = AR.Arsenal.tierInfo(nearGun.tier || 0);
    AR.Sfx.ui('pick'); AR.Hud.toast(`${ti.p} ${AR.GUNS[nearGun.gun].name}`, `${ti.n} // ${AR.GUNS[nearGun.gun].tag}`);
    group.remove(nearGun.obj); list.splice(list.indexOf(nearGun), 1);
    if (old) spawn('gun', AR.Player.P.body.pos.x, AR.Player.P.body.pos.y + 1, AR.Player.P.body.pos.z, { gun: old.id, tier: old.tier });
    nearGun = null;
    return true;
  }
  return { init, dispose, tick, spawn, fromKill, use, get list() { return list; } };
})();
