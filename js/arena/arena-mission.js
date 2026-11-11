/* EARTH 2049: SAVE SEED 7 — ARENA mission director: OPERATION: UNSUBSCRIBE.
 *
 *   CAST IN       billboard roof, pick a primary (3 random)
 *   ACT I         THE PREGAME — three waves to hold the plaza
 *   SPONSOR       pick 1 of 3 perks (rerollable for GigaTech)
 *   ACT II        SIGNAL JAM — burn three relays across the map while the director keeps pressure on
 *   SPONSOR
 *   ACT III       HYPE STORM — survive 75 s of everything, Moderators included; then the signal dies and they all pop
 *   SPONSOR
 *   BOSS          RIYA VEX, three phases
 *   LOG OFF       extraction under a Serverless flood
 *   RESULTS       score, grade, GigaTech banked, run it back (heat +1 after a win)
 *
 * Also owns the "stream": STYLE rank (D..SS, decays, drops when hurt, rewards variety), score multipliers, a live
 * chat that reacts to how you play, the viewer count, the LED-wall jumbotron, the ring light, rain and stage lights.
 */
'use strict';

AR.Mission = (() => {
  const { V3, rand, pick, clamp } = AR;
  let M = null;
  const WAVES = [
    { n: 'WAVE 1', s: 'THE SERVERLESS ARE ONLINE', g: [['serverless', 12], ['shill', 4]] },
    { n: 'WAVE 2', s: 'STREAMERS ON THE BALCONIES', g: [['serverless', 8], ['shill', 6], ['streamer', 4]] },
    { n: 'WAVE 3', s: 'HYPEBEAST INCOMING', g: [['shill', 6], ['streamer', 4], ['serverless', 10], ['hypebeast', 1], ['shill', 1, 'elite']] },
  ];
  const STREAK = ['', '', 'DOUBLE TAP', 'TRIPLE THREAT', 'QUAD FEED', 'VIRAL CHAIN', 'ALGORITHM BROKEN', 'MAIN CHARACTER', 'TOUCH GRASS IMPOSSIBLE'];

  /* ================================================================== setup */
  function start(opts) {
    const save = SAVE.arena || (SAVE.arena = { best: 0, wins: 0, runs: 0, heat: 0, maxHeat: 0 });
    M = {
      heat: clamp(opts.heat ?? save.heat ?? 0, 0, 10), phase: 'intro', t: 0, actT: 0, score: 0, chips: 0, kills: 0, heads: 0, styleV: 0.3, rank: 0, maxRank: 0,
      multi: 0, multiT: 0, bestMulti: 0, rage: 0, rageT: 0, viewers: 48200, hurtTotal: 0, waveHurt: 0, wave: -1, pending: [], spawnT: 0, cap: 16,
      relays: [], relaysDown: 0, guards: {}, perks: {}, picks: 0, methods: [], idleT: 0, stormT: 0, extractT: 0, extractHold: 0,
      lines: [], lineT: 0, chatT: 0, lastChat: '', bossE: null, done: false, beatLights: [], jumbo: null, ring: null, startT: performance.now(),
      longest: 0, airKills: 0, reroll: 15, rerolls: 0, maxStreakName: '',
    };
    save.runs = (save.runs || 0) + 1;
    M.heatMul = 1 + M.heat * 0.08;
    M.speedMul = 1 + M.heat * 0.04;
    M.fireMul = 1 / (1 + M.heat * 0.08);
    M.projMul = 1 + M.heat * 0.05;
    M.pads = AR.World.markers('pad');
    M.extraction = AR.World.markers('extraction')[0];
    M.spawns = AR.World.markers('spawn');
    buildStage();
    AR.Sfx.ambience(true);
    AR.Hud.score(0, 0, M.viewers);
    AR.Hud.style(0, 0.3, '');
    AR.Hud.objective('<b>CAST IN</b> // ENGAGEMENT PLAZA, SHILLZ CENTRAL');
    // intro sequence
    AR.Hud.letterbox(true);
    AR.Hud.banner('OPERATION: UNSUBSCRIBE', `SHILLZ CENTRAL // ENGAGEMENT PLAZA${M.heat ? ' // HEAT ' + M.heat : ''}`, 3.6);
    chatBurst('start', 4);
    queueLines(AR.LINES.intro);
    setTimeout(() => { if (M && M.phase === 'intro') loadout(); }, 2600);
  }

  /* ================================================================== stage dressing (jumbotron, ring light, lights, rain) */
  function buildStage() {
    const scene = AR.scene;
    M.group = new THREE.Group(); M.group.name = 'arena-stage'; scene.add(M.group);
    // jumbotron
    const sm = AR.World.markers('screen')[0];
    if (sm) {
      const c = document.createElement('canvas'); c.width = 264; c.height = 96;
      const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sm.size[0], sm.size[1]), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      mesh.position.set(sm.pos[0], sm.pos[1], sm.pos[2] + 0.06); M.group.add(mesh);
      M.jumbo = { c, x: c.getContext('2d'), tex, t: 0, head: 'GOING LIVE', hearts: [] };
    }
    // ring light
    const rm = AR.World.markers('ring')[0];
    if (rm) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rm.radius, 0.28, 6, 28), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }));
      const halo = new THREE.Mesh(new THREE.TorusGeometry(rm.radius, 0.7, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.25, rm.pos[1] - 1.2 - rm.radius, 0.25), new THREE.MeshLambertMaterial({ color: 0x222222 }));
      pole.position.y = -(rm.pos[1] - 1.2 - rm.radius) / 2 - rm.radius;
      g.add(ring, halo, pole);
      g.position.set(rm.pos[0], rm.pos[1], rm.pos[2]);
      M.group.add(g);
      M.ring = { g, ring, halo, fallen: false };
    }
    // dynamic stage lights (light the characters; the level itself is baked)
    for (const L of (AR.World.layout.lights || []).filter(l => ['stage_key', 'stage_w', 'stage_e', 'logoff'].includes(l.name))) {
      const pl = new THREE.PointLight(new THREE.Color(...L.color), L.intensity * 1.6, L.radius * 1.6, 1.5);
      pl.position.set(...L.pos); M.group.add(pl);
      M.beatLights.push({ pl, base: L.intensity * 1.6, beat: !!L.beat, pulse: L.pulse || 0, name: L.name });
    }
    const hemi = new THREE.HemisphereLight(0x8a7cff, 0x221a10, 0.55); M.group.add(hemi);
    M.bossLight = new THREE.PointLight(0xfff0e0, 0, 9, 1.4); M.group.add(M.bossLight);
    M.relayLights = [0, 1, 2].map(() => { const pl = new THREE.PointLight(0xffd400, 0, 12, 1.5); M.group.add(pl); return pl; });
    // rain
    const N = 900, pos = new Float32Array(N * 6);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x8090c0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    rain.frustumCulled = false; M.group.add(rain);
    M.rain = { geo, pos, N, drops: Array.from({ length: N }, () => [rand(-22, 22), rand(0, 20), rand(-22, 22)]) };
    // sky
    const sc = document.createElement('canvas'); sc.width = 8; sc.height = 128;
    const sx = sc.getContext('2d'); const gr = sx.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#05030c'); gr.addColorStop(0.55, '#1a0c2a'); gr.addColorStop(0.75, '#4a1838'); gr.addColorStop(1, '#120a18');
    sx.fillStyle = gr; sx.fillRect(0, 0, 8, 128);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 16, 12), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), side: THREE.BackSide, fog: false, depthWrite: false }));
    M.group.add(sky); M.sky = sky;
  }
  function stageTick(dt) {
    const b = Music.beat(), pulse = Math.pow(1 - b.phase, 3);
    for (const L of M.beatLights) {
      let k = 1;
      if (L.beat) k = 0.55 + pulse * 0.9;
      else if (L.pulse) k = 0.75 + Math.sin(M.t * (2 + L.pulse * 3)) * 0.25;
      if (L.name === 'logoff') k = M.phase === 'extract' ? 2 + pulse : 0.3;
      L.pl.intensity = L.base * k * (M.relaysDown >= 3 && L.name !== 'logoff' ? 0.6 + Math.random() * 0.2 : 1);   // NOSONAR
    }
    if (M.ring && !M.ring.fallen) {
      M.ring.halo.material.opacity = 0.15 + pulse * 0.35;
      M.ring.g.rotation.y = Math.sin(M.t * 0.4) * 0.12;
    }
    if (M.ring?.falling) {
      const r = M.ring;
      r.vy -= 22 * dt; r.g.position.y += r.vy * dt; r.g.rotation.x += dt * 2.4;
      if (r.g.position.y < 1.6) {
        r.g.position.y = 1.6; r.g.rotation.x = -Math.PI / 2; r.falling = false; r.fallen = true;
        AR.Enemies.explode(r.g.position.x, 1.6, r.g.position.z, 4.5, 30, 'enemy', 10, 'ring');
        AR.Fx.gib(r.g.position.x, 2, r.g.position.z, [0xfff6d0, 0xffd400, 0x222222], 30, 1.4);
        r.ring.material.color.setHex(0x554433); r.halo.visible = false;
      }
    }
    // rain around the camera
    const cp = AR.camera.position, R = M.rain;
    for (let i = 0; i < R.N; i++) {
      const d = R.drops[i];
      d[1] -= dt * 26;
      if (d[1] < -2) { d[1] = rand(14, 20); d[0] = rand(-22, 22); d[2] = rand(-22, 22); }
      const x = cp.x + d[0], y = cp.y + d[1], z = cp.z + d[2];
      R.pos.set([x, y, z, x + 0.05, y - 0.7, z + 0.03], i * 6);
    }
    R.geo.attributes.position.needsUpdate = true;
    M.sky.position.copy(cp);
    jumboTick(dt, b);
  }
  function jumboTick(dt, b) {
    const J = M.jumbo; if (!J) return;
    J.t -= dt; if (J.t > 0) return; J.t = 1 / 8;
    const x = J.x, W = 264, H = 96;
    const dead = M.phase === 'bossdead' || M.phase === 'extract' || M.phase === 'results' && M.won;
    x.fillStyle = dead ? '#000' : '#0b0612'; x.fillRect(0, 0, W, H);
    x.font = 'bold 10px Consolas, monospace'; x.textBaseline = 'top';
    if (dead) {
      x.fillStyle = '#ff2b4a'; x.font = 'bold 22px Consolas, monospace'; x.textAlign = 'center';
      x.fillText('STREAM ENDED', W / 2, 26); x.font = 'bold 11px Consolas, monospace'; x.fillStyle = '#9b59ff'; x.fillText('RIYA VEX HAS BEEN DEPLATFORMED', W / 2, 56);
      x.fillStyle = '#666'; x.fillText('0 WATCHING', W / 2, 72); x.textAlign = 'left';
      J.tex.needsUpdate = true; return;
    }
    // header
    x.fillStyle = '#e0003c'; x.fillRect(4, 4, 30, 12); x.fillStyle = '#fff'; x.fillText('LIVE', 8, 5);
    x.fillStyle = '#ffd400'; x.fillText('RIYA VEX // CONTROLLED RIOT', 40, 5);
    x.fillStyle = '#fff'; x.textAlign = 'right'; x.fillText(fmtViewers(M.viewers) + ' WATCHING', W - 4, 5); x.textAlign = 'left';
    // eq bars from the music
    const sp = Music.spectrum();
    for (let i = 0; i < 32; i++) {
      const v = sp ? sp[2 + i * 2] / 255 : (Math.sin(M.t * 3 + i) * 0.5 + 0.5) * 0.3;
      x.fillStyle = i % 2 ? '#ff2bd6' : '#ffd400';
      x.fillRect(4 + i * 8, H - 6 - v * 26, 6, v * 26);
    }
    // headline
    x.font = 'bold 20px Consolas, monospace'; x.textAlign = 'center';
    x.fillStyle = (b.beat % 2) ? '#ffffff' : '#ffd400';
    x.fillText(J.head, W / 2, 30);
    x.font = 'bold 10px Consolas, monospace'; x.fillStyle = '#00e5ff';
    x.fillText(J.sub || 'LIKE // SHARE // COMPLY', W / 2, 54);
    x.textAlign = 'left';
    // hearts
    if (Math.random() < 0.6) J.hearts.push({ x: rand(10, W - 10), y: H, v: rand(18, 40) });           // NOSONAR
    x.fillStyle = '#ff2bd6';
    for (const h of J.hearts) { h.y -= h.v / 8; x.fillRect(h.x, h.y, 4, 3); x.fillRect(h.x - 1, h.y - 1, 2, 2); x.fillRect(h.x + 3, h.y - 1, 2, 2); }
    J.hearts = J.hearts.filter(h => h.y > 14);
    // glitch when relays are down
    const g = M.relaysDown;
    if (g > 0) {
      for (let i = 0; i < g * 4; i++) { const yy = rand(16, H); x.drawImage(J.c, 0, yy, W, 3, rand(-12, 12) * g, yy, W, 3); }
      if (Math.random() < g * 0.15) { x.fillStyle = 'rgba(0,0,0,.7)'; x.fillRect(0, 0, W, H); x.fillStyle = '#fff'; x.font = 'bold 14px Consolas, monospace'; x.fillText('BUFFERING...', 80, 40); }  // NOSONAR
    }
    J.tex.needsUpdate = true;
  }
  function headline(h, sub) { if (M?.jumbo) { M.jumbo.head = h; M.jumbo.sub = sub; } }
  const fmtViewers = v => (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : (v / 1e3).toFixed(1) + 'K');

  /* ================================================================== flow */
  function loadout() {
    M.phase = 'loadout';
    AR.Hud.letterbox(false);
    const opts = [...AR.PRIMARIES].sort(() => Math.random() - 0.5).slice(0, 3);                                       // NOSONAR
    const tiers = opts.map(() => Math.min(6, (Math.random() < 0.35 ? 1 : 0) + Math.floor(M.heat / 2)));               // NOSONAR
    const bar = (v, max) => `<i style="width:${Math.round(clamp(v / max, 0.05, 1) * 110)}px"></i>`;
    AR.menu = true; AR.unlockPointer();
    AR.Hud.cards('DREAMCASTER LOADOUT', 'PICK YOUR PRIMARY // VOLT-9 SIDEARM INCLUDED', opts.map(id => {
      const d = AR.GUNS[id];
      const dps = d.dmg * d.pellets * d.rpm / 60;
      const ti = AR.Arsenal.tierInfo(tiers[opts.indexOf(id)]);
      return { r: 1, html: `<div class="r" style="color:${ti.c}">${ti.n} // ${ti.p}</div><div class="n">${d.name}</div><div class="s">${d.tag}</div>
        <div class="stat">DAMAGE ${bar(d.dmg * d.pellets, 160)}</div><div class="stat">DPS ${bar(dps, 300)}</div><div class="stat">MAG ${bar(d.mag, 42)}</div>
        <div class="stat">RANGE ${bar((d.falloff || [60])[0], 90)}</div>` };
    }), i => {
      AR.Player.giveGun(opts[i], tiers[i]);
      AR.Player.P.cur = 1;
      AR.Sfx.ui('pick'); AR.menu = false; AR.menuClosed?.(); AR.lockPointer();
      Music.stinger?.('deploy');
      setTimeout(() => startAct1(), 600);
    });
  }
  function startAct1() {
    M.phase = 'act1'; M.wave = -1; M.actT = 0;
    AR.Hud.banner('ACT I — THE PREGAME', 'HOLD THE PLAZA');
    headline('WE HAVE A VISITOR', 'FANS: WELCOME HIM');
    nextWave();
  }
  function nextWave() {
    M.wave++;
    if (M.wave >= WAVES.length) { perk('act2'); return; }
    const w = WAVES[M.wave];
    M.waveHurt = 0;
    setTimeout(() => {
      if (!M || M.phase !== 'act1') return;
      AR.Hud.banner(w.n, w.s, 2);
      for (const [type, n, flag] of w.g) queue(type, Math.round(n * (1 + M.heat * 0.15)), { elite: flag === 'elite' });
      M.pending.sort(() => Math.random() - 0.5);                                                                      // NOSONAR
      M.waveLive = true;
    }, M.wave === 0 ? 400 : 2200);
    AR.Hud.objective(`<b>ACT I</b> // HOLD THE PLAZA — WAVE ${M.wave + 1}/3`);
  }
  function startAct2() {
    M.phase = 'act2'; M.actT = 0;
    AR.Hud.banner('ACT II — SIGNAL JAM', 'BURN HER THREE RELAYS');
    queueLines(AR.LINES.act2);
    headline('STREAM QUALITY: 4K', 'SPONSORED BY SIGNAL RELAYS');
    for (const m of AR.World.markers('relay')) {
      const e = AR.Enemies.spawn('relay', m.pos[0], m.pos[1], m.pos[2], { yaw: rand(0, 6.28), hpMul: 1 + M.heat * 0.15 });
      if (!e) continue;
      e.relay = m; e.label = m.name; M.relays.push(e);
      const pl = M.relayLights[M.relays.length - 1]; if (pl) { pl.position.set(m.pos[0], m.pos[1] + 5, m.pos[2]); pl.intensity = 2.5; e.light = pl; }
    }
    updateRelayObjective();
  }
  function updateRelayObjective() { AR.Hud.objective(`<b>ACT II</b> // BURN THE RELAYS — ${M.relaysDown}/3 DOWN`); }
  function startAct3() {
    M.phase = 'act3'; M.actT = 0; M.stormT = 75; M.mods = 0; M.hyped = false;
    AR.Hud.banner('ACT III — HYPE STORM', 'SURVIVE 75 SECONDS');
    queueLines(AR.LINES.act3);
    headline('HYPE STORM', 'MODERATORS DEPLOYED');
    M.cap = 20;
  }
  function startBoss() {
    M.phase = 'boss'; M.actT = 0;
    AR.Hud.objective('<b>BOSS</b> // DEPLATFORM RIYA VEX — POP HER RING-LIGHT DRONES TO DROP THE SHIELD');
    AR.Hud.letterbox(true);
    AR.Hud.banner('RIYA VEX', 'THE SIGNAL WITCH — GOING LIVE', 3.2);
    chatBurst('boss', 5);
    queueLines(AR.LINES.boss);
    headline('RIYA VEX', 'MAIN EVENT');
    const bm = AR.World.markers('boss')[0];
    setTimeout(() => {
      if (!M) return;
      M.bossE = AR.Boss.start({ x: bm.pos[0], y: bm.pos[1], z: bm.pos[2] });
      AR.Hud.letterbox(false);
    }, 1800);
    M.cap = 14;
  }
  function bossPhase(n) {
    if (n === 2) { queueLines(AR.LINES.boss2); headline('CONTROLLED RIOT', 'EVERYBODY HYPE'); chatBurst('bossHurt', 3); }
    if (n === 3) { queueLines(AR.LINES.boss3); headline('LIGHTS OUT', 'DO NOT LOOK AWAY'); chatBurst('bossHurt', 4); }
  }
  function ringCrash() { if (M.ring && !M.ring.fallen) { M.ring.falling = true; M.ring.vy = 0; AR.Sfx.ui('alarm'); } }
  function bossDead() {
    M.phase = 'bossdead';
    if (M.bossLight) M.bossLight.intensity = 0;
    AR.slowmo(1.8, 0.18);
    AR.Hud.banner('DEPLATFORMED', 'RIYA VEX // STREAM ENDED', 3.5);
    chatBurst('bossDead', 7);
    queueLines(AR.LINES.bossDead);
    M.viewers = 0;
    for (const e of AR.Enemies.list) if (!e.boss && !e.dying) setTimeout(() => AR.Enemies.damage(e, 99999, { src: 'explosion', dir: V3(0, 1, 0) }), rand(200, 1200));
    M.pending = [];
    setTimeout(() => startExtract(), 4200);
  }
  function startExtract() {
    if (!M || M.phase !== 'bossdead') return;
    M.phase = 'extract'; M.extractT = 40; M.cap = 22;
    AR.Hud.banner('LOG OFF', 'REACH THE LOG OFF POINT');
    AR.Sfx.ui('alarm');
    queueLines(AR.LINES.extract);
    for (let i = 0; i < 3; i++) setTimeout(() => queue('serverless', 8, { areas: ['plaza', 'fan', 'backstage'] }), i * 4000);
  }
  function perk(next) {
    M.phase = 'perk'; M.nextAct = next;
    setTimeout(() => {
      if (!M) return;
      AR.Enemies.clearEnemyProjs();
      AR.menu = true; AR.unlockPointer();
      offerPerks(next);
    }, 1400);
    AR.Hud.banner('SPONSOR BREAK', 'A BRAND WANTS TO WORK WITH YOU', 1.6);
    chatBurst('pick', 2);
  }
  function rollPerks() {
    const pool = AR.PERKS.filter(p => (M.perks[p.id] || 0) < p.stack);
    const w = p => [1, 0.55 + M.heat * 0.05, 0.22 + M.heat * 0.03][p.r];
    const out = [];
    while (out.length < 3 && pool.length) {
      const tot = pool.reduce((a, p) => a + w(p), 0);
      let r = Math.random() * tot;                                                                               // NOSONAR
      const i = pool.findIndex(p => (r -= w(p)) <= 0);
      out.push(pool.splice(i < 0 ? 0 : i, 1)[0]);
    }
    return out;
  }
  function offerPerks(next) {
    const offer = rollPerks();
    const names = ['COMMON', 'RARE', 'LEGENDARY'];
    const h = AR.Hud.cards('SPONSOR OFFERS', 'PICK ONE BRAND DEAL', offer.map(p => ({
      r: p.r, html: `<div class="r" style="color:${['#3a6', '#48f', '#f2b'][p.r]}">${names[p.r]}${M.perks[p.id] ? ' // OWNED x' + M.perks[p.id] : ''}</div>
        <div class="n">${p.n}</div><div class="s">SPONSORED BY ${p.s}</div><div class="d">${p.d}</div>`,
    })), i => {
      const p = offer[i];
      M.perks[p.id] = (M.perks[p.id] || 0) + 1; M.picks++;
      p.fx(AR.Player.S, AR.Player.P);
      AR.Sfx.ui('pick'); AR.Hud.toast(p.n, 'SPONSORED BY ' + p.s);
      chat(pick(AR.CHAT_USERS), pick(AR.CHAT.pick));
      AR.menu = false; AR.menuClosed?.(); AR.lockPointer();
      AR.Player.refillMags();
      AR.Player.heal(25);
      if (AR.Player.S.buddy && !M.buddy) makeBuddy();
      setTimeout(() => { if (!M) return; if (next === 'act2') startAct2(); else if (next === 'act3') startAct3(); else startBoss(); }, 700);
    }, [{ t: `REROLL (${M.reroll} GIGATECH)`, fn: () => {
      if (M.chips < M.reroll) { AR.Sfx.dry(); return; }
      M.chips -= M.reroll; M.reroll += 10; h.close(); AR.Sfx.ui('card'); offerPerks(next);
    } }]);
  }

  /* ================================================================== spawning */
  function queue(type, n, opts = {}) { for (let i = 0; i < n; i++) M.pending.push({ type, ...opts }); }
  function pickSpawn(type, areas) {
    const P = AR.Player.P.body.pos;
    let cands = M.spawns.filter(s => (!areas || areas.includes(s.area)));
    if (type === 'hypebeast' || type === 'moderator') cands = cands.filter(s => s.pos[1] < 1.5);
    const scored = cands.map(s => {
      const d = Math.hypot(s.pos[0] - P.x, s.pos[2] - P.z);
      const recent = (M.recent || []).some(r => Math.hypot(r[0] - s.pos[0], r[2] - s.pos[2]) < 4) ? 0.3 : 1;
      return { s, w: (d < 10 ? 0.05 : d > 48 ? 0.3 : 1) * recent };
    });
    const tot = scored.reduce((a, x) => a + x.w, 0);
    let r = Math.random() * tot;                                                                                 // NOSONAR
    for (const x of scored) if ((r -= x.w) <= 0) return x.s;
    return scored[0]?.s;
  }
  function spawnTick(dt) {
    M.spawnT -= dt;
    if (M.spawnT > 0 || !M.pending.length) return;
    const alive = AR.Enemies.alive() - M.relays.filter(r => !r.dying).length;
    if (alive >= M.cap + M.heat * 2) return;
    const p = M.pending.shift();
    const s = pickSpawn(p.type, p.areas);
    if (!s) return;
    const fly = AR.ENEMIES[p.type].fly;
    const x = s.pos[0] + rand(-1.2, 1.2), z = s.pos[2] + rand(-1.2, 1.2);
    const y = fly ? s.pos[1] + 5 : s.pos[1];
    const e = AR.Enemies.spawn(p.type, x, y, z, { elite: p.elite || (Math.random() < 0.02 + M.heat * 0.02 && p.type !== 'serverless'), yaw: Math.atan2(AR.Player.P.body.pos.x - x, AR.Player.P.body.pos.z - z) });  // NOSONAR
    if (e?.elite) chat(pick(AR.CHAT_USERS), pick(AR.CHAT.elite));
    M.recent = [[x, y, z], ...(M.recent || [])].slice(0, 4);
    M.spawnT = p.type === 'serverless' ? 0.18 : 0.38;
  }
  function summonAround(pos, kinds) {
    for (const [type, n] of kinds) queue(type, Math.round(n * (1 + M.heat * 0.15)), { areas: ['plaza', 'backstage', 'gantry', 'fan'] });
    void pos;
  }
  /** Keep a steady population during the free-roam acts. */
  function directorTick(dt) {
    if (M.phase === 'act2') {
      const want = 9 + M.relaysDown * 2 + M.heat;
      if (AR.Enemies.alive() - M.relays.filter(r => !r.dying).length + M.pending.length < want) {
        const r = Math.random();                                                                                  // NOSONAR
        queue(r < 0.4 ? 'serverless' : r < 0.7 ? 'shill' : r < 0.9 ? 'streamer' : 'drone', r < 0.4 ? 3 : 1);
      }
      // relay guards
      const P = AR.Player.P.body.pos;
      for (const rl of M.relays) {
        if (rl.dying || M.guards[rl.id]) continue;
        if (Math.hypot(rl.body.pos.x - P.x, rl.body.pos.z - P.z) < 16) {
          M.guards[rl.id] = true;
          const area = rl.relay.area;
          const heavy = M.relaysDown === 1 ? 'hypebeast' : M.relaysDown === 2 ? 'drone' : 'streamer';
          queue(heavy, heavy === 'drone' ? 3 : 1, { areas: [area], elite: heavy !== 'drone' });
          queue('shill', 3, { areas: [area] });
          M.pending.unshift(...M.pending.splice(-4));
          AR.Hud.toast('RELAY GUARDS', rl.label);
          AR.Sfx.ui('alarm');
        }
      }
    } else if (M.phase === 'act3') {
      M.stormT -= dt;
      const el = 75 - M.stormT;
      if (M.mods === 0 && el > 4) { M.mods = 1; queue('moderator', 1, { areas: ['plaza', 'backstage'] }); M.pending.unshift(M.pending.pop()); AR.Hud.toast('MODERATOR', 'FLANK IT'); }
      if (M.mods === 1 && el > 38) { M.mods = 2; queue('moderator', 1 + (M.heat > 2 ? 1 : 0), { areas: ['plaza', 'garage'] }); M.pending.unshift(M.pending.pop()); AR.Hud.toast('MODERATOR', 'BAN HAMMER INCOMING'); }
      if (!M.hyped && el > 24) { M.hyped = true; queue('hypebeast', 1, { elite: true }); }
      M.floodT = (M.floodT ?? 12) - dt;
      if (M.floodT <= 0) { M.floodT = 15; queue('serverless', 8, { areas: [pick(['fan', 'backstage', 'plaza'])] }); AR.Hud.toast('SERVERLESS FLOOD', ''); }
      const want = 14 + M.heat;
      if (AR.Enemies.alive() + M.pending.length < want) {
        const r = Math.random();                                                                                  // NOSONAR
        queue(r < 0.3 ? 'shill' : r < 0.55 ? 'streamer' : r < 0.75 ? 'drone' : 'serverless', r > 0.75 ? 3 : 1);
      }
      AR.Hud.objective(`<b>ACT III</b> // HYPE STORM — SURVIVE ${Math.max(0, Math.ceil(M.stormT))}s`);
      if (M.stormT <= 0) {
        M.pending = [];
        AR.Hud.banner('SIGNAL LOST', 'THE STORM BREAKS');
        let k = 0;
        for (const e of AR.Enemies.list) if (!e.dying && !e.boss) { setTimeout(() => AR.Enemies.damage(e, 99999, { src: 'explosion', dir: V3(0, 1, 0) }), 120 * k++); }
        AR.Enemies.clearEnemyProjs();
        addScore(5000 * (1 + M.heat * 0.25), 'STORM SURVIVED');
        perk('boss');
      }
    } else if (M.phase === 'extract') {
      M.extractT -= dt;
      const P = AR.Player.P.body.pos, ex = M.extraction.pos;
      const d = Math.hypot(P.x - ex[0], P.z - ex[2]);
      if (d < 3 && Math.abs(P.y - ex[1]) < 2) {
        M.extractHold += dt;
        AR.Hud.objective(`<b>LOGGING OFF</b> // ${Math.round(M.extractHold / 1.5 * 100)}%`);
        if (M.extractHold >= 1.5) finish(true);
      } else {
        M.extractHold = Math.max(0, M.extractHold - dt);
        AR.Hud.objective(`<b>LOG OFF</b> // REACH THE LOG OFF POINT — ${Math.max(0, Math.ceil(M.extractT))}s`);
      }
      if (AR.Enemies.alive() + M.pending.length < 16) queue('serverless', 4, { areas: ['fan', 'plaza'] });
      if (M.extractT <= 0 && !M.done) { AR.Hud.toast('CONNECTION UNSTABLE', 'THE SERVERLESS ARE MULTIPLYING'); M.extractT = 10; M.cap += 6; }
    }
  }

  /* ================================================================== the stream: score, style, chat */
  function addScore(n, why) {
    M.score += n;
    if (why) AR.Hud.toast('+' + Math.round(n).toLocaleString('en-US'), why);
  }
  function rankMult() { return AR.RANKS[M.rank].mult; }
  function style(kind, amt) {
    const A = { kill: 0.2, head: 0.14, air: 0.16, slide: 0.03, slidejump: 0.04, dash: 0.015, pad: 0.03, kick: 0.16, juggle: 0.25, wallkick: 0.15, rocketjump: 0.08, nearmiss: 0.05, multi: 0.2, long: 0.12, relay: 0.6, elite: 0.4 };
    let v = amt ?? A[kind] ?? 0.05;
    if (!M || M.phase === 'intro' || M.phase === 'loadout') return;
    M.styleV = Math.min(6.2, M.styleV + v);
    rankUpdate();
  }
  function rankUpdate() {
    const r = Math.min(5, Math.max(0, Math.floor(M.styleV)));
    if (r !== M.rank) {
      const up = r > M.rank;
      M.rank = r;
      if (up) {
        AR.Sfx.ui('rank');
        if (r >= 4) chatBurst('rankS', 2); else chat(pick(AR.CHAT_USERS), pick(AR.CHAT.rankUp));
        if (r > M.maxRank) M.maxRank = r;
        if (r === 5) { AR.Hud.toast('MAIN CHARACTER', 'THE STREAM IS YOURS'); headline('WHO IS THIS GUY', 'CHAT HAS TURNED'); }
      }
    }
    AR.Hud.style(M.rank, M.styleV - M.rank);
  }
  function chat(user, text) { AR.Hud.chat(user, text); M.lastChatT = M.t; }
  function chatBurst(kind, n) {
    const lines = AR.CHAT[kind]; if (!lines) return;
    for (let i = 0; i < n; i++) setTimeout(() => { if (M) chat(pick(AR.CHAT_USERS), pick(lines)); }, i * rand(120, 420));
  }
  function queueLines(lines) { for (const l of lines) M.lines.push(l); }
  function say(who, text) { M.lines.unshift([who, text]); M.lineT = 0; }
  function linesTick(dt) {
    M.lineT -= dt;
    if (M.lineT <= 0 && M.lines.length) {
      const [who, text] = M.lines.shift();
      AR.Hud.say(who, text);
      if (who === 'RIYA') chat('RiyaVex ✔', text.length > 60 ? text.slice(0, 58) + '…' : text);
      M.lineT = Math.max(2.8, text.length * 0.055) + 0.4;
    }
  }

  /* ================================================================== events from the other systems */
  function onShot() { M.idleT = 0; }
  function onDamage(e, amt, info) {
    void info;
    if (!e.relay && !e.boss) return;
    if (e.relay && Math.random() < 0.05) AR.Sfx.relayHum(e.body.pos.x, e.body.pos.y + 3, e.body.pos.z);           // NOSONAR
    if (e.boss) { M.bossDmg = (M.bossDmg || 0) + amt; M.viewers += amt * 40; }
  }
  function onKill(e, info, gib) {
    const P = AR.Player.P, S = AR.Player.S;
    if (e.relay) {
      M.relaysDown++;
      if (e.light) { e.light.intensity = 0; e.light = null; }
      AR.hitstop(0.12); AR.Player.addTrauma(0.5);
      AR.Enemies.explode(e.body.pos.x, e.body.pos.y + 3, e.body.pos.z, 5, 25, 'enemy', 8);
      AR.Hud.banner('RELAY DOWN', `${M.relaysDown}/3 // HER SIGNAL IS DYING`, 2);
      chatBurst('relay', 3);
      M.lines.push(AR.LINES.relayDown[Math.min(2, M.relaysDown - 1)]);
      addScore(AR.ENEMIES.relay.score * rankMult(), 'RELAY DESTROYED');
      style('relay');
      AR.Player.heal(25); P.armor = Math.min(P.maxArmor, P.armor + 25);
      headline(M.relaysDown >= 3 ? 'NO SIGNAL' : 'STREAM LAGGING', M.relaysDown >= 3 ? 'PLEASE STAND BY' : 'THIS IS A CREATIVE CHOICE');
      updateRelayObjective();
      if (M.relaysDown >= 3) { M.pending = []; setTimeout(() => { if (M?.phase === 'act2') perk('act3'); }, 1500); }
      return;
    }
    if (e.boss) {
      addScore(AR.ENEMIES.riya.score * rankMult() * (1 + M.heat * 0.25), 'RIYA VEX DEPLATFORMED');
      style('kill', 1.5);
      return;
    }
    if (e.shieldOf) { addScore(300 * rankMult(), 'RING LIGHT DOWN'); style('kill'); return; }
    M.kills++;
    const now = M.t;
    M.lastKillT = now;
    // multi-kill window
    if (now - M.multiT < 1.4) M.multi++; else M.multi = 1;
    M.multiT = now;
    if (M.multi > M.bestMulti) { M.bestMulti = M.multi; M.maxStreakName = STREAK[Math.min(STREAK.length - 1, M.multi)]; }
    // rage bait stacks
    if (S.ragebait) { M.rage = Math.min(10, (now - M.rageT < 2.5 ? M.rage + S.ragebait : S.ragebait)); M.rageT = now; }
    // score
    const air = P.body.onGround === false && P.airT > 0.25;
    const slide = P.slideT > 0;
    const kick = info.src === 'kick';
    const head = !!info.head;
    const dist = Math.hypot(e.body.pos.x - P.body.pos.x, e.body.pos.z - P.body.pos.z);
    let base = e.d.score * (e.elite ? 3 : 1) * (1 + M.heat * 0.25);
    const tags = [];
    if (head) { base *= 1.5; M.heads++; tags.push('HEADSHOT'); }
    if (air) { base += 100; tags.push('AIRBORNE'); M.airKills++; }
    if (slide) { base += 100; tags.push('SLIDE'); }
    if (kick) { base += 150; tags.push('BOOTED'); }
    if (gib) { base += 50; tags.push('DELETED'); }
    if (dist > 35) { base += 100; tags.push('LONG SHOT'); }
    if (M.multi >= 2) base += [0, 0, 100, 250, 500, 800, 1200, 2000][Math.min(7, M.multi)];
    if (e.elite) tags.push('VERIFIED');
    M.longest = Math.max(M.longest, dist);
    // freshness: repeating the same method earns less style
    const method = (info.weapon || info.src || 'x') + (head ? 'h' : '') + (air ? 'a' : '') + (kick ? 'k' : '') + (slide ? 's' : '');
    const repeats = M.methods.filter(m => m === method).length;
    M.methods.push(method); if (M.methods.length > 5) M.methods.shift();
    const fresh = repeats >= 3 ? 0.45 : repeats === 2 ? 0.75 : 1.15;
    let sv = 0.2 * fresh;
    if (head) sv += 0.12; if (air) sv += 0.15; if (kick) sv += 0.15; if (slide) sv += 0.1; if (M.multi >= 2) sv += 0.12 * M.multi; if (e.elite) sv += 0.4;
    if (e.type === 'serverless') sv *= 0.55;
    M.styleV = Math.min(6.2, M.styleV + sv);
    rankUpdate();
    addScore(base * rankMult());
    M.chips += 0;                                          // chips come from pickups
    // feedback
    AR.Hud.hitmark(true, true);
    AR.Sfx.kill(Math.min(10, M.multi - 1), e.d.hp > 300);
    if (head) AR.Sfx.headshot();
    AR.hitstop(e.d.hp > 300 || e.elite ? 0.09 : head ? 0.05 : 0.035);
    AR.Player.addTrauma(e.d.hp > 300 ? 0.3 : 0.08);
    AR.Hud.style(M.rank, M.styleV - M.rank, (M.multi >= 2 ? STREAK[Math.min(STREAK.length - 1, M.multi)] + ' ' : '') + tags.join(' // '));
    clearTimeout(M.streakClear); M.streakClear = setTimeout(() => AR.Hud.style(M.rank, M.styleV - M.rank, ''), 1800);
    // heals
    const copium = S.copium && P.hp < P.maxHp * 0.35;
    if (S.leech) AR.Player.heal(S.leech * (copium ? 2 : 1));
    if (head && S.headRefund) { const g = AR.Player.gun; if (g) g.ammo = Math.min(AR.Player.magSize(g), g.ammo + S.headRefund); }
    if (e.elite && S.cancel) { P.hp = P.maxHp; P.armor = P.maxArmor; AR.Player.refillMags(); AR.Hud.toast('CANCELLED', 'FULL REFILL'); }
    // chat
    M.viewers += 400 + M.rank * 900 + (M.multi >= 3 ? 4000 : 0);
    const r = Math.random();                                                                                      // NOSONAR
    if (M.multi >= 3) chatBurst('multi', 2);
    else if (head && r < 0.45) chat(pick(AR.CHAT_USERS), pick(AR.CHAT.head));
    else if (air && r < 0.5) chat(pick(AR.CHAT_USERS), pick(AR.CHAT.air));
    else if (slide && r < 0.5) chat(pick(AR.CHAT_USERS), pick(AR.CHAT.slide));
    else if (kick && r < 0.6) chat(pick(AR.CHAT_USERS), pick(AR.CHAT.kick));
    else if (r < 0.18) chat(pick(AR.CHAT_USERS), pick(AR.CHAT.kill));
    // wave bookkeeping
    if (M.phase === 'act1') checkWave();
  }
  function checkWave() {
    if (!M.waveLive || M.pending.length || AR.Enemies.alive() > 0) return;
    M.waveLive = false;
    const clean = M.waveHurt < 1;
    AR.Hud.banner('WAVE CLEAR', clean ? 'NO DAMAGE BONUS +2500' : '', 1.8);
    if (clean) addScore(2500 * rankMult());
    AR.Sfx.ui('objective');
    nextWave();
  }
  function onHurt(amount) {
    M.hurtTotal += amount; M.waveHurt += amount;
    M.styleV = Math.max(0, M.styleV - Math.min(0.9, 0.25 + amount / 40));
    rankUpdate();
    if (Math.random() < 0.3) chat(pick(AR.CHAT_USERS), pick(AR.Player.P.hp < 30 ? AR.CHAT.low : AR.CHAT.hurt));   // NOSONAR
  }
  function nearMiss() { style('nearmiss'); }
  function onDeath() {
    if (M.done) return;
    AR.slowmo(2.2, 0.15);
    AR.Hud.banner('STREAM ENDED', 'FOR YOU', 3);
    chatBurst('death', 6);
    queueLines(AR.LINES.death);
    setTimeout(() => finish(false), 2600);
  }
  function addChips(n) { M.chips += n; }
  function use() { AR.Drops.use(); }

  /* ================================================================== buddy drone (DEAD INTERNET perk) */
  function makeBuddy() {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0x39ff8a }));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: Assets.starTex(), color: 0x39ff8a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(0.9); m.add(s); M.group.add(m);
    M.buddy = { m, t: 0, fireT: 0 };
  }
  function buddyTick(dt) {
    const B = M.buddy; if (!B) return;
    const P = AR.Player.P; B.t += dt; B.fireT -= dt;
    const tx = P.body.pos.x + Math.cos(B.t * 1.6) * 1.4, tz = P.body.pos.z + Math.sin(B.t * 1.6) * 1.4, ty = P.body.pos.y + 2.4;
    B.m.position.lerp(V3(tx, ty, tz), Math.min(1, dt * 6)); B.m.rotation.y += dt * 4;
    if (B.fireT <= 0 && (AR.Player.input.fire || true)) {
      const e = AR.Enemies.nearest(B.m.position.x, B.m.position.y, B.m.position.z, 26);
      if (e) {
        B.fireT = 0.45 / AR.Player.S.buddy;
        AR.Fx.trace(B.m.position.x, B.m.position.y, B.m.position.z, e.headPos.x, e.headPos.y - 0.3, e.headPos.z, 0x39ff8a, 0.08);
        AR.Enemies.damage(e, 14 * (1 + AR.Player.S.dmg), { src: 'buddy', dir: V3(0, 0, 0), knock: 0.5 });
        AR.Sfx.gun('smg', { gain: 0.35, pitch: 1.6 });
      } else B.fireT = 0.3;
    }
  }

  /* ================================================================== results */
  function finish(won) {
    if (M.done) return;
    M.done = true; M.won = won;
    M.phase = 'results';
    const secs = (performance.now() - M.startT) / 1000;
    const save = SAVE.arena;
    if (won) addScore(Math.max(0, 900 - secs) * 40 * (1 + M.heat * 0.25), '');
    const score = M.score;
    const grade = [...AR.RESULT_GRADES].reverse().find(([s]) => score >= s * (1 + M.heat * 0.3))?.[1] || 'LURKER';
    const gt = Math.round((M.chips + score / 2000) * (won ? 1 : 0.5));
    const best = score > (save.best || 0);
    save.best = Math.max(save.best || 0, score);
    if (won) { save.wins = (save.wins || 0) + 1; save.maxHeat = Math.max(save.maxHeat || 0, M.heat + 1); }
    SAVE.gt = (SAVE.gt || 0) + gt;
    SAVE.kills = (SAVE.kills || 0) + M.kills;
    try { persist(); } catch (err) { console.warn('[E2049] arena save failed', err); }
    const mmss = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
    const rows = [
      ['RESULT', won ? 'RIYA DEPLATFORMED // EXTRACTED' : 'TERMINATED ON STREAM'],
      ['TIME', mmss], ['KILLS', M.kills], ['HEADSHOTS', `${M.heads} (${M.kills ? Math.round(M.heads / M.kills * 100) : 0}%)`],
      ['BEST STREAK', M.bestMulti >= 2 ? `${M.maxStreakName} (x${M.bestMulti})` : '—'], ['PEAK STYLE', `${AR.RANKS[M.maxRank].k} // ${AR.RANKS[M.maxRank].n}`],
      ['AIR KILLS', M.airKills], ['LONGEST KILL', Math.round(M.longest) + ' M'], ['DAMAGE TAKEN', Math.round(M.hurtTotal)],
      ['SPONSORS', Object.keys(M.perks).length ? Object.entries(M.perks).map(([id, n]) => AR.PERKS.find(p => p.id === id).n + (n > 1 ? ' x' + n : '')).join(', ') : '—'],
      ['HEAT', M.heat],
    ];
    setTimeout(() => {
      AR.menu = true; AR.unlockPointer();
      const nextHeat = won ? Math.min(10, M.heat + 1) : M.heat;
      AR.Hud.results({ title: won ? 'EXTRACTED' : 'STREAM ENDED', sub: won ? 'OPERATION: UNSUBSCRIBE COMPLETE' : 'RIYA THANKS YOU FOR WATCHING', grade, rows, score, gt, best,
        retryLabel: won ? `RUN IT BACK // HEAT ${nextHeat}` : 'RUN IT BACK' },
      () => { SAVE.arena.heat = nextHeat; AR.restart(nextHeat); },
      () => AR.exit());
    }, won ? 800 : 300);
  }

  /* ================================================================== frame */
  function tick(dt, rdt) {
    if (!M) return;
    M.t += dt;
    linesTick(rdt);
    stageTick(dt);
    if (M.phase === 'results') return;
    // style decay
    const drain = (0.09 + M.rank * 0.05) * AR.Player.S.styleDrain;
    if (M.phase !== 'perk' && M.phase !== 'loadout' && M.phase !== 'intro') { M.styleV = Math.max(0, M.styleV - drain * dt); rankUpdate(); }
    if (M.t - M.rageT > 2.5) M.rage = 0;
    // viewers drift
    M.viewers = Math.max(1200, M.viewers + (M.rank - 1.5) * 220 * dt + rand(-30, 30));
    AR.Hud.score(M.score, M.chips, M.phase === 'bossdead' || M.phase === 'extract' ? 0 : M.viewers);
    // idle chat
    M.idleT += dt;
    if (M.t - (M.lastChatT || 0) > rand(3, 6)) chat(pick(AR.CHAT_USERS), pick(M.idleT > 12 ? AR.CHAT.idle : AR.CHAT.kill.concat(AR.CHAT.start)));
    if (['act1', 'act2', 'act3', 'boss', 'extract'].includes(M.phase)) { spawnTick(dt); directorTick(dt); }
    if (M.phase === 'act1' && M.waveLive) checkWave();
    // relays: pulse
    for (const r of M.relays) if (r.light && !r.dying) r.light.intensity = 2 + Math.sin(M.t * 6 + r.id) * 1.2;
    buddyTick(dt);
  }

  function waypoints() {
    if (!M) return [];
    const out = [];
    // stragglers: when a wave is down to its last few and nobody has died for a while, mark them
    if ((M.phase === 'act1' || M.phase === 'act3') && !M.pending.length && M.t - (M.lastKillT || 0) > 8) {
      const left = AR.Enemies.list.filter(e => !e.dying && !e.relay && !e.boss);
      if (left.length && left.length <= 4) for (const e of left) out.push({ x: e.body.pos.x, y: e.body.pos.y + e.body.h + 0.4, z: e.body.pos.z, label: 'STRAGGLER', cls: 'warn' });
    }
    if (M.phase === 'act2') for (const r of M.relays) if (!r.dying) out.push({ x: r.body.pos.x, y: r.body.pos.y + 5.6, z: r.body.pos.z, label: 'RELAY', cls: 'warn' });
    if (M.phase === 'extract') out.push({ x: M.extraction.pos[0], y: M.extraction.pos[1] + 2, z: M.extraction.pos[2], label: 'LOG OFF', cls: 'ex' });
    return out;
  }
  function padAt(x, y, z) {
    if (!M) return null;
    for (const p of M.pads) if (Math.abs(x - p.pos[0]) < 1.0 && Math.abs(z - p.pos[2]) < 1.0 && y - p.pos[1] > -0.2 && y - p.pos[1] < 0.5) return p;
    return null;
  }
  function nextBeatIn(min) {
    const b = Music.beat(); const spb = 0.5;
    let t = (1 - b.phase) * spb;
    while (t < min) t += spb;
    return t;
  }
  function dispose() {
    AR.Sfx.ambience(false);
    if (M?.group) AR.scene.remove(M.group);
    M = null;
  }

  return {
    start, tick, dispose, style, say, onShot, onDamage, onKill, onHurt, onDeath, nearMiss, addChips, use, padAt, waypoints, summonAround,
    bossPhase, bossDead, ringCrash, nextBeatIn, headline,
    dev: { act1: () => startAct1(), act2: () => startAct2(), act3: () => startAct3(), boss: () => startBoss(), extract: () => { M.phase = 'bossdead'; startExtract(); } },
    dmgMult: () => (M ? 1 + (M.rank >= 3 ? 0.1 : 0) + M.rage * 0.08 : 1),
    adrenal: () => (M && M.rank >= 4 ? 1.15 : 1),
    incomingMult: () => 1,
    get heat() { return M?.heat || 0; }, get heatMul() { return M?.heatMul || 1; }, get speedMul() { return M?.speedMul || 1; }, get fireMul() { return M?.fireMul || 1; },
    get projMul() { return M?.projMul || 1; }, get swarmSpeed() { return M?.phase === 'extract' ? 1.3 : 1; }, get rank() { return M?.rank || 0; }, get phase() { return M?.phase; },
    get M() { return M; },
  };
})();
