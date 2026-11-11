/* EARTH 2049: SAVE SEED 7 — ARENA boss: RIYA VEX, THE SIGNAL WITCH. Three phases, all telegraphed.
 *
 *  P1  GOING LIVE         on the stage behind her ring light. Three ring-light drones project her ENGAGEMENT SHIELD
 *                         (92% damage reduction); kill them to drop it for a stagger window. Attacks: LIKE STORM
 *                         (rings of hearts with gaps you jump or dash through), SPOTLIGHT (a tracking beam that
 *                         locks, then fires a laser down the line), FAN SERVICE (summons fans through portals).
 *  P2  CONTROLLED RIOT    teleports between perches round the upper ring, fires fanned heart volleys, and drops
 *                         HYPE ZONES on the floor around you that detonate on the music's beat. Two shield drones.
 *  P3  DEPLATFORMED       the ring light crashes onto the stage. No shield. She levitates and spins spiral heart
 *                         streams, slams down on telegraphed circles, and the Serverless pour in.
 */
'use strict';

AR.ENEMIES.riya = { name: 'RIYA VEX', models: ['riya'], hp: 5600, walk: 3, run: 6, r: 0.6, h: 1.75, scale: 1.4, ai: 'boss', score: 25000,
  chips: [40, 60], knock: 0, flinch: 0, gib: [0xffd400, 0xff2bd6, 0x00e5ff] };
AR.ENEMIES.relay = { name: 'SIGNAL RELAY', models: ['relay'], hp: 900, r: 0.75, h: 3.4, scale: 1.5, ai: 'static', unit: true, score: 1500,
  chips: [8, 12], knock: 0, flinch: 0, gib: [0xffd400, 0x303030, 0xff2bd6] };

AR.Boss = (() => {
  const { V3, rand, clamp, pick } = AR;
  let boss = null, drones = [], shieldMesh = null, phase = 0, atkT = 0, cycle = 0, perchT = 0, spotlight = null, spiral = 0, ringFell = false;
  const _v = V3();

  function start(pos) {
    boss = AR.Enemies.spawn('riya', pos.x, pos.y, pos.z, { boss: true, noDrops: true, yaw: 0, hpMul: 1 });
    if (!boss) return null;
    boss.state = 'spawn'; boss.stateT = 0.5;
    phase = 1; atkT = 3.5; cycle = 0; ringFell = false; spiral = 0;
    boss.play('Taunt', 0.2, true);
    shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3, 1), new THREE.MeshBasicMaterial({ color: 0xff2bd6, wireframe: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    shieldMesh.position.y = 1.3; boss.obj.add(shieldMesh);
    spawnDrones(3);
    AR.Hud.boss(boss, 'RIYA VEX', 'THE SIGNAL WITCH // GOING LIVE');
    return boss;
  }
  function spawnDrones(n) {
    drones = drones.filter(d => !d.dying);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const d = AR.Enemies.spawn('drone', boss.body.pos.x + Math.cos(a) * 3.5, boss.body.pos.y + 3, boss.body.pos.z + Math.sin(a) * 3.5, { hpMul: 1.9, noDrops: true });
      if (!d) continue;
      d.shieldOf = boss; d.orbit = a; d.d = { ...d.d, ai: 'shielddrone' }; d.ringBuddy = true;
      drones.push(d);
    }
  }
  const shielded = () => drones.some(d => !d.dying);

  function filterDamage(e, amt, info) {
    if (e !== boss) return amt;
    if (boss.invuln) return 0;
    if (shielded()) {
      if (Math.random() < 0.3) AR.Fx.emit(AR.Fx.glow, boss.headPos.x, boss.headPos.y, boss.headPos.z, 0xff2bd6, 3, 3, 0.2);      // NOSONAR
      info.shielded = true;
      return amt * 0.08;
    }
    return amt * (boss.stagger > 0 ? 1.3 : 1);
  }

  /* ------------------------------------------------------------------ attacks */
  function likeStorm(rings = 3, n = 18, speed = 11) {
    boss.play('Controlled Riot', 0.1, false, 1.2);
    for (let r = 0; r < rings; r++) {
      setTimeout(() => {
        if (!boss || boss.dying) return;
        const off = (r % 2) * Math.PI / n;
        const gap = Math.floor(Math.random() * n);                                          // NOSONAR
        for (let i = 0; i < n; i++) {
          if (i === gap || i === (gap + 1) % n) continue;                                      // the gap you dash through
          const a = i / n * Math.PI * 2 + off;
          const dir = V3(Math.sin(a), 0, Math.cos(a));
          AR.Enemies.spawnProj({ owner: 'enemy', x: boss.body.pos.x + dir.x, y: boss.body.pos.y + 1.0 + (r % 2) * 0.5, z: boss.body.pos.z + dir.z, dir, speed, grav: 0, dmg: 11, size: 0.38, color: 0xff2bd6, life: 6, kind: 'heart' });
        }
        AR.Sfx.enemyShot(boss.body.pos.x, boss.body.pos.y + 1, boss.body.pos.z, 'heart');
      }, r * 520);
    }
  }
  function fan(shots = 5, spread = 0.5, speed = 18, bursts = 3) {
    boss.play('Shoot', 0.1, false, 1.4);
    for (let b = 0; b < bursts; b++) {
      setTimeout(() => {
        if (!boss || boss.dying || !AR.Player.P) return;
        const pp = AR.Player.P.body.pos, o = boss.headPos;
        const base = Math.atan2(pp.x - o.x, pp.z - o.z);
        const dy = (pp.y + 1.1 - o.y) / Math.max(1, Math.hypot(pp.x - o.x, pp.z - o.z));
        for (let i = 0; i < shots; i++) {
          const a = base + (i - (shots - 1) / 2) * spread / shots;
          const dir = V3(Math.sin(a), dy, Math.cos(a)).normalize();
          AR.Enemies.spawnProj({ owner: 'enemy', x: o.x, y: o.y - 0.2, z: o.z, dir, speed, grav: 0, dmg: 12, size: 0.36, color: 0xff2bd6, life: 5, kind: 'heart' });
        }
        AR.Sfx.enemyShot(o.x, o.y, o.z, 'heart');
      }, b * 380);
    }
  }
  function startSpotlight() {
    spotlight = { t: 0, lock: 1.15, fire: 1.4, dir: V3(), done: false };
    boss.play('Selfie', 0.1, true);
    AR.Sfx.telegraph(boss.body.pos.x, boss.body.pos.y + 2, boss.body.pos.z, 0.8);
    AR.Hud.toast('SPOTLIGHT', 'break line of sight or dash');
  }
  function spotlightTick(dt) {
    const s = spotlight; if (!s) return;
    s.t += dt;
    const o = boss.headPos, P = AR.Player.P;
    if (s.t < s.lock && P) {
      _v.set(P.body.pos.x - o.x, P.body.pos.y + 1.0 - o.y, P.body.pos.z - o.z).normalize();
      s.dir.lerp(_v, s.t < 0.05 ? 1 : 0.18).normalize();
    }
    const w = AR.World.raycast(o.x, o.y, o.z, s.dir.x, s.dir.y, s.dir.z, 90);
    const len = w ? w.t : 90;
    if (s.t < s.fire) {
      if (!s.beam) s.beam = AR.Fx.beam(o.x, o.y, o.z, o.x + s.dir.x * len, o.y + s.dir.y * len, o.z + s.dir.z * len, s.t < s.lock ? 0xff2b6a : 0xffffff, 0.06, 0.05);
      else s.beam = null;
      if (Math.random() < 0.6) AR.Fx.beam(o.x, o.y, o.z, o.x + s.dir.x * len, o.y + s.dir.y * len, o.z + s.dir.z * len, s.t < s.lock ? 0xff2b6a : 0xffffff, s.t < s.lock ? 0.05 : 0.1, 0.04);  // NOSONAR
    } else if (!s.done) {
      s.done = true;
      AR.Fx.beam(o.x, o.y, o.z, o.x + s.dir.x * len, o.y + s.dir.y * len, o.z + s.dir.z * len, 0xffd400, 0.9, 0.4);
      AR.Fx.beam(o.x, o.y, o.z, o.x + s.dir.x * len, o.y + s.dir.y * len, o.z + s.dir.z * len, 0xffffff, 0.35, 0.3);
      AR.Fx.explosion(o.x + s.dir.x * len, o.y + s.dir.y * len, o.z + s.dir.z * len, 1.6, 0xffd400);
      AR.Sfx.gun('dmr', { pitch: 0.6, gain: 1.4 });
      AR.Player.addTrauma(0.35);
      if (P?.alive) {
        // distance from player chest to the beam line
        const px = P.body.pos.x - o.x, py = P.body.pos.y + 1 - o.y, pz = P.body.pos.z - o.z;
        const t = px * s.dir.x + py * s.dir.y + pz * s.dir.z;
        if (t > 0 && t < len + 0.5) {
          const cx = px - s.dir.x * t, cy = py - s.dir.y * t, cz = pz - s.dir.z * t;
          if (Math.hypot(cx, cy * 0.6, cz) < 1.0) AR.Player.takeDamage(28, { x: o.x, z: o.z }, 'beam');
        }
      }
    }
    if (s.t > s.fire + 0.4) { spotlight = null; boss.play('Idle Combat', 0.3); }
  }
  function summon(kinds) {
    boss.play('Hype', 0.1, false, 1.2);
    AR.Hud.toast('FAN SERVICE', 'fans incoming');
    AR.Mission.summonAround(boss.body.pos, kinds);
  }
  function hypeZones(n = 5) {
    boss.play('Hype Dampener', 0.1, false, 1.2);
    const P = AR.Player.P; if (!P) return;
    const delay = AR.Mission.nextBeatIn(1.1);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, r = i === 0 ? 0 : rand(2.5, 7);                       // NOSONAR
      const x = P.body.pos.x + Math.cos(a) * r, z = P.body.pos.z + Math.sin(a) * r;
      const y = AR.World.floorAt(x, z, 0.3, P.body.pos.y + 1.5);
      if (y < -50) continue;
      const tele = AR.Fx.telegraph(x, y, z, 2.6, 0xffd400, delay);
      setTimeout(() => {
        if (!boss || boss.dying) return;
        tele.life = 0.01;
        AR.Enemies.explode(x, y + 0.3, z, 2.6, 22, 'enemy', 6, 'hype');
      }, delay * 1000);
    }
    AR.Sfx.telegraph(P.body.pos.x, P.body.pos.y, P.body.pos.z, 0.7);
  }
  function slam() {
    const P = AR.Player.P; if (!P) return;
    const x = P.body.pos.x, z = P.body.pos.z, y = AR.World.floorAt(x, z, 0.4, P.body.pos.y + 1.5);
    const tele = AR.Fx.telegraph(x, y, z, 4.2, 0xff2bd6, 1.1);
    boss.invuln = true;
    boss.play('Jump', 0.05, false, 1);
    AR.Fx.flash(boss.body.pos.x, boss.body.pos.y + 1, boss.body.pos.z, 0xff2bd6, 4, 0.3);
    boss.obj.visible = false;
    setTimeout(() => {
      if (!boss || boss.dying) return;
      tele.life = 0.01;
      boss.body.pos.set(x, y, z); boss.body.vel.set(0, 0, 0); boss.obj.visible = true; boss.invuln = false;
      boss.hover = 0;
      AR.Enemies.explode(x, y + 0.4, z, 4.2, 30, 'enemy', 12, 'slam');
      AR.Fx.shock(x, y, z, 0xff2bd6, 6, 0.5);
      boss.play('Controlled Riot', 0.05, false, 1.4);
      setTimeout(() => { if (boss && !boss.dying) boss.hover = 2.8; }, 1400);
    }, 1100);
  }
  function teleport(name) {
    const perches = AR.World.markers('perch').filter(p => p.name !== boss.perch);
    const p = name ? AR.World.markers('perch').find(q => q.name === name) : pick(perches);
    if (!p) return;
    AR.Fx.flash(boss.body.pos.x, boss.body.pos.y + 1.2, boss.body.pos.z, 0xff2bd6, 4, 0.35);
    AR.Fx.emit(AR.Fx.glow, boss.body.pos.x, boss.body.pos.y + 1, boss.body.pos.z, 0xff2bd6, 30, 5, 0.6, { up: 3 });
    boss.body.pos.set(p.pos[0], p.pos[1], p.pos[2]); boss.body.vel.set(0, 0, 0); boss.perch = p.name;
    AR.Fx.flash(p.pos[0], p.pos[1] + 1.2, p.pos[2], 0xff2bd6, 4, 0.35);
    AR.Sfx.pad();
    boss.play('Taunt', 0.1, false);
  }

  /* ------------------------------------------------------------------ phases */
  function setPhase(n) {
    phase = n; atkT = 2.5; cycle = 0;
    AR.Mission.bossPhase(n);
    if (n === 2) {
      AR.Hud.boss(boss, 'RIYA VEX', 'CONTROLLED RIOT');
      teleport('perch_gantry'); perchT = 11;
      spawnDrones(2);
    }
    if (n === 3) {
      AR.Hud.boss(boss, 'RIYA VEX', 'DEPLATFORMED');
      for (const d of drones) if (!d.dying) AR.Enemies.damage(d, 9999, { src: 'explosion' });
      drones = [];
      teleport('perch_stage');
      boss.hover = 2.8; boss.bossFly = true;
      AR.Mission.ringCrash();
      ringFell = true;
    }
  }
  function tick(e, dt) {
    if (e !== boss) return;
    const P = AR.Player.P; if (!P) return;
    const pp = P.body.pos, b = boss.body;
    // drones orbit the boss (not the player) while they shield her
    for (const d of drones) {
      if (d.dying) continue;
      d.orbit += dt * 1.1;
      const tx = b.pos.x + Math.cos(d.orbit) * 3.6, tz = b.pos.z + Math.sin(d.orbit) * 3.6, ty = b.pos.y + 3 + Math.sin(d.orbit * 2) * 0.5;
      d.body.vel.set((tx - d.body.pos.x) * 4, (ty - d.body.pos.y) * 4, (tz - d.body.pos.z) * 4);
      d.d.ai = 'shielddrone';
      d.fireT -= dt;
      if (d.fireT <= 0 && AR.Enemies.canSee(d)) { d.fireT = rand(2.5, 4); AR.Enemies.enemyFire(d, 24, 8, 0xff2bd6); }
      // tether beam to the boss
      if (Math.random() < 0.3) AR.Fx.trace(d.body.pos.x, d.body.pos.y, d.body.pos.z, b.pos.x, b.pos.y + 1.4, b.pos.z, 0xff2bd6, 0.08);   // NOSONAR
    }
    const sh = shielded();
    shieldMesh.visible = sh;
    if (AR.Mission.M?.bossLight) { const L = AR.Mission.M.bossLight; L.position.set(b.pos.x, b.pos.y + 3.2, b.pos.z + 1.6); L.intensity = 3.2; }
    shieldMesh.rotation.y += dt * 0.8; shieldMesh.rotation.x += dt * 0.3;
    if (!sh && boss.wasShielded) {
      boss.wasShielded = false; boss.stagger = 1.6;
      AR.Sfx.shieldBreak(); AR.Hud.toast('SHIELD DOWN', 'DUMP EVERYTHING'); AR.Mission.say('RIYA', pick(['Wait wait wait. Chat, that was a sponsor.', 'My lighting! Do you know what that costs?', 'Okay you broke my ring lights. Rude.']));
      boss.play('Hit React', 0.05, false, 0.7);
      AR.hitstop(0.12);
      boss.reshieldT = phase === 1 ? 10 : 9;
    }
    if (sh) boss.wasShielded = true;
    if (!sh && phase < 3) {
      boss.reshieldT -= dt;
      if (boss.reshieldT <= 0) { spawnDrones(phase === 1 ? 3 : 2); AR.Mission.say('RIYA', 'And we are BACK. Lights, please.'); }
    }
    boss.stagger = Math.max(0, (boss.stagger || 0) - dt);
    // phase thresholds
    const f = boss.hp / boss.maxHp;
    if (phase === 1 && f < 0.66) setPhase(2);
    else if (phase === 2 && f < 0.33) setPhase(3);
    // face the player
    AR.Enemies.faceTo(boss, pp.x, pp.z, 4, dt);
    // hover
    if (boss.bossFly) {
      const floor = AR.World.floorAt(b.pos.x, b.pos.z, 0.4, b.pos.y + 0.5);
      const want = floor + (boss.hover || 0) + Math.sin(boss.t * 2) * 0.25;
      b.pos.y += (want - b.pos.y) * Math.min(1, dt * 3);
      // drift toward the player slowly in P3
      if (phase === 3 && !boss.invuln) {
        const dx = pp.x - b.pos.x, dz = pp.z - b.pos.z, d = Math.hypot(dx, dz);
        if (d > 8) { b.pos.x += dx / d * 2.2 * dt; b.pos.z += dz / d * 2.2 * dt; }
      }
    } else {
      b.vel.x *= 0.8; b.vel.z *= 0.8;
    }
    spotlightTick(dt);
    if (boss.stagger > 0 || spotlight) return;
    atkT -= dt * (phase === 3 ? 1.35 : 1) * (AR.Mission.heatMul || 1);
    if (phase === 2) { perchT -= dt; if (perchT <= 0) { perchT = rand(9, 13); teleport(); return; } }
    if (phase === 3) {
      spiral += dt;
      boss.spiralT = (boss.spiralT || 0) - dt;
      if (boss.spiralT <= 0 && !boss.invuln) {
        boss.spiralT = 0.16;
        for (let k = 0; k < 4; k++) {
          const a = spiral * 1.7 + k * Math.PI / 2;
          const dir = V3(Math.sin(a), -0.08, Math.cos(a)).normalize();
          AR.Enemies.spawnProj({ owner: 'enemy', x: b.pos.x, y: b.pos.y + 1.2, z: b.pos.z, dir, speed: 10, grav: 0, dmg: 9, size: 0.34, color: k % 2 ? 0xff2bd6 : 0xffd400, life: 5, kind: 'heart' });
        }
      }
    }
    if (atkT > 0) {
      if (!boss.busy) boss.play(phase === 3 ? 'Dance' : 'Idle Combat', 0.3);
      return;
    }
    cycle++;
    if (phase === 1) {
      const m = cycle % 4;
      if (m === 1) { likeStorm(3); atkT = 4.2; }
      else if (m === 2) { startSpotlight(); atkT = 3.4; }
      else if (m === 3) { likeStorm(2, 22, 13); atkT = 3.6; }
      else { summon([['shill', 3], ['serverless', 5]]); atkT = 4.5; }
    } else if (phase === 2) {
      const m = cycle % 4;
      if (m === 1) { fan(5, 0.7, 19, 3); atkT = 3.2; }
      else if (m === 2) { hypeZones(5); atkT = 3.8; }
      else if (m === 3) { startSpotlight(); atkT = 3.4; }
      else { summon([['streamer', 2], ['shill', 2], ['serverless', 4]]); atkT = 4.2; }
    } else {
      const m = cycle % 3;
      if (m === 1) { slam(); atkT = 4.4; }
      else if (m === 2) { fan(7, 1.0, 20, 2); hypeZones(4); atkT = 3.6; }
      else { summon([['serverless', 8]]); likeStorm(2, 20, 12); atkT = 4; }
    }
  }
  function onDeath(e) {
    if (e !== boss) return;
    spotlight = null;
    for (const d of drones) if (!d.dying) AR.Enemies.damage(d, 9999, { src: 'explosion' });
    drones = [];
    shieldMesh.visible = false;
    boss.bossFly = false;
    boss.play('Death', 0.05, false, 0.6);
    boss.body.vel.set(0, 4, 0); boss.body.onGround = false;
    AR.Enemies.clearEnemyProjs();
    const p = boss.headPos.clone();
    AR.Mission.bossDead(boss);
    let n = 0;
    const pop = () => {
      if (n++ > 10) { AR.Fx.gib(p.x, p.y, p.z, AR.ENEMIES.riya.gib, 40, 1.6); AR.Fx.explosion(p.x, p.y, p.z, 5, 0xff2bd6); AR.Sfx.explosion(p.x, p.y, p.z, 1.5); if (boss) boss.obj.visible = false; return; }
      AR.Fx.explosion(p.x + rand(-1.5, 1.5), p.y + rand(-1, 1), p.z + rand(-1.5, 1.5), rand(1, 2.2), pick([0xff2bd6, 0xffd400, 0x00e5ff]));
      AR.Sfx.explosion(p.x, p.y, p.z, 0.6);
      setTimeout(pop, 140 + n * 12);
    };
    setTimeout(pop, 300);
  }
  function dispose() { boss = null; drones = []; spotlight = null; phase = 0; }
  return { start, tick, filterDamage, onDeath, dispose, get boss() { return boss; }, get phase() { return phase; }, shielded };
})();
