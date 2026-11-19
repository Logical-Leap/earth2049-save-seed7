/* EARTH 2049: SAVE SEED 7 — GIGALEAGUE in the arena runtime. While a PvP match is up, AR.PvpMission stands in for
 * AR.Mission (js/arena/arena-mission.js), and AR.Pvp is the small API js/arena/arena-player.js calls into.
 *
 * The match (js/pvp/pvp-sim.js, on the match server or in this browser) decides everything that matters. This file:
 *   - sends 30 inputs a second (position, look, stance), fires, reloads, swaps, melees, grenades, uses and streaks;
 *   - draws every other player 100 ms in the past from snapshot history (interpolation), as their Fitting Room avatar;
 *   - draws items, scorestreaks, projectiles, smoke and the mode's objectives;
 *   - runs the PvP HUD: score bar and timer, kill feed, minimap, streaks, respawn screen with class change, death cam
 *     (a third-person look at whoever killed you, from the front: their face, name, gun and health),
 *     scoreboard (TAB), flash / stun / blackout overlays, the host's callouts, and the results screen with the podium;
 *   - makes the match readable by ear and by eye (AR.PvpAudio, js/arena/arena-pvp-audio.js): every round other players
 *     fire in that gun's voice from where they are, loud placed footsteps, pain and death cries; bodies fall (the
 *     avatar's Death clip) and stay a few seconds; medals, a running points total and kill confirms; objective status
 *     (in the hill, capturing, planting) with its own sounds; a teammate's death marked on the minimap.
 * Multiplayer never plays music. Every button prompt follows the device in hand (js/input-glyphs.js).
 */
'use strict';

AR.Pvp = { on: false };

AR.PvpMission = (() => {
  const { V3, clamp } = AR;
  let T = null, O = null, root = null, hud = null, me = 0, myTeam = 0, playlist = 'core', mode = null;
  let snapLast = null, snapRecv = 0, serverT = 0, sendT = 0, done = false, results = null, reward = null, endInfo = null;
  let spawnInfo = null, dead = false, deadAt = 0, killer = null, respawnAt = 0, killcam = null, boardRows = [], roster = new Map();
  let flashUntil = 0, flashK = 0, stunUntil = 0, blackUntil = 0, chatOn = true, scoreOpen = false, streakReady = [], myStreaks = [], lastKill = null;
  const remotes = new Map();                 // num -> { num, name, team, bot, look, av, gun, buf: [[t, x,y,z, yaw,pitch, flags, hp, w, team, radar, tier, sh]], tag }
  const objs = { items: new Map(), ents: new Map(), proj: new Map(), smoke: [], marks: [] };
  const selfHist = [], podiumAvs = [];
  const INTERP = 0.1, BODY_STAY = 8, BODY_SINK = 1.4;
  let medalQ = [], multi = { n: 0, at: -99 }, feedRun = 0, lastKiller = 0, ptsRun = { n: 0, at: 0, lines: [] }, allyX = [];
  let objIn = null, hillRun = 0, padBoard = false, glyphOff = null, useHint = null, replaying = false, medalCount = {}, lastDeath = null, scoreSeen = null;
  const WEAPONS = () => window.PvpSim.WEAPON_IDS;
  const P = () => AR.Player.P;

  /* ================================================================== AR.Pvp: what the player code calls */
  function send(m) { T?.send(m); }
  const rt = () => estServer() - INTERP;
  AR.Pvp.fire = (o, dirs, g) => {
    send({ t: 'fire', o: [+o.x.toFixed(3), +o.y.toFixed(3), +o.z.toFixed(3)], d: dirs.map(d => d.map(v => +v.toFixed(4))), rt: +rt().toFixed(3), w: AR.Player.P?.cur });
    predictHit(o, dirs);
  };
  AR.Pvp.reload = i => send({ t: 'reload', w: i });
  AR.Pvp.swap = i => send({ t: 'swap', w: i });
  AR.Pvp.melee = () => send({ t: 'melee' });
  AR.Pvp.nade = tac => { const p = P(); if (!p) return; const d = AR.Player.aimDir(V3()); send({ t: tac ? 'tac' : 'nade', d: [d.x, d.y, d.z] }); AR.Sfx.reload(null, 'out'); };
  AR.Pvp.moveK = () => (stunUntil > performance.now() ? 0.6 : 1);
  // a controller's X: use when there is something to use right here, else reload (js/arena/arena-player.js padTick)
  AR.Pvp.useContext = () => !!useHint;
  AR.Pvp.use = () => send({ t: 'use' });
  AR.Pvp.assistList = () => {
    const out = [];
    for (const r of remotes.values()) { const s = r.cur; if (!s || !(s.f & 1) || r.team === myTeam && mode?.teams === 2 || r.num === me) continue; out.push({ body: { pos: s.pos }, headPos: V3(s.pos.x, s.pos.y + 1.6, s.pos.z), dying: false }); }
    return out;
  };

  /* ================================================================== start / stop */
  async function start(opts) {
    O = opts.pvp; T = O.transport; mode = PVP.MODES[O.mode] || PVP.MODES.tdm; playlist = mode.playlist === 'party' ? 'core' : mode.playlist;
    AR.Pvp.on = true; done = false; results = null; reward = null; endInfo = null; dead = true; me = 0; snapLast = null; serverT = 0; killcam = null; lastKill = null;
    remotes.clear(); roster.clear(); selfHist.length = 0; podiumAvs.length = 0; streakReady = []; myStreaks = [];
    root = new THREE.Group(); root.name = 'pvp'; AR.scene.add(root);
    // the arena lights levels through baked probes, not lights: give the avatars (lit materials) light of their own
    const hemi = new THREE.HemisphereLight(0xe6e0ff, 0x3a3050, 1.5), sun = new THREE.DirectionalLight(0xfff0e0, 0.9); sun.position.set(0.4, 1, 0.3); root.add(hemi, sun);
    buildHud();
    AR.PvpAudio.init(); AR.PvpAudio.reset();
    medalQ = []; multi = { n: 0, at: -99 }; feedRun = 0; lastKiller = 0; ptsRun = { n: 0, at: 0, lines: [] }; allyX = []; objIn = null; hillRun = 0; useHint = null; replaying = false;
    medalCount = {}; lastDeath = null; scoreSeen = null;
    glyphOff?.(); glyphOff = window.Glyph?.onChange(() => { if (!hud) return; hudEl('strk')._h = ''; hudEl('ost')._h = ''; if (dead && lastDeath && !done) showRespawn(lastDeath, true); });
    window.GunFeel?.setFair?.({ mag: () => AR.Player.gun?.d.mag });
    AR.Player.setProfile(PVP.MOVE[playlist]);
    const p = P(); if (p) { p.alive = false; p.armor = 0; p.maxArmor = 1; }
    if (window.AvatarKit && !AvatarKit.loaded) { try { await AvatarKit.ready(); } catch (e) { /* capsules instead */ } }
    T.off = T.on(onMessage);
    if (T.kind === 'local') T.begin(AR.World.layout);
    else if (O.start) onMessage(O.start);
    send({ t: 'class', i: O.cls || 0 });
    for (const m of O.queued || []) onMessage(m);
    AR.Hud.chatTitle?.(PVP.HOST.title);
    AR.Hud.banner(mode.name, mode.how, 4);
    Music.stop?.(0.4); AudioSys.musicStop?.();                     // no music in multiplayer, ever
  }
  function dispose() {
    AR.Pvp.on = false;
    T?.off?.();
    if (T?.kind === 'local') T.close();
    window.GunFeel?.setFair?.(null);
    AR.Player.setProfile(null);
    for (const r of remotes.values()) dropRemote(r);
    remotes.clear();
    AR.PvpAudio.reset(); glyphOff?.(); glyphOff = null;
    if (root) { AR.scene.remove(root); root = null; }
    hud?.remove(); hud = null;
    document.getElementById('arHud')?.classList.remove('pvp', 'classic');
    const arl = document.querySelector('#arHud .bar.ar span'); if (arl) arl.textContent = 'ARMOR';
    for (const m of objs.marks) m.remove?.();
    objs.items.clear(); objs.ents.clear(); objs.proj.clear(); objs.marks.length = 0;
    removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKeyUp, true);
  }

  /* ================================================================== messages */
  function onMessage(m) {
    if (m.t === 's') return onSnap(m.s);
    if (m.t === 'ev') return onEvent(m.v);
    if (m.t === 'start') { for (const r of m.roster || []) roster.set(r.num, r); return; }
    if (m.t === 'lobby') return O.onLobby?.();
    if (m.t === 'chat' && chatOn) AR.Hud.chat(m.from, m.text, '#ffd400');
    if (m.t === 'reconnecting') AR.Hud.toast('CONNECTION LOST', 'RECONNECTING… YOUR SLOT IS HELD FOR 60 S');
    if (m.t === 'closed') { AR.Hud.toast('DISCONNECTED', 'THE MATCH SERVER IS GONE'); setTimeout(() => AR.exit(), 1500); }
  }
  function onSnap(s) {
    snapLast = s; snapRecv = performance.now(); serverT = s.t;
    const now = s.t;
    for (const row of s.pl) {
      const [num] = row;
      if (num === me) { selfStats(row); continue; }
      let r = remotes.get(num);
      if (!r) r = addRemote(num);
      r.team = row[9];
      r.buf.push([now].concat(row.slice(1)));
      if (r.buf.length > 160) r.buf.shift();
    }
    for (const [num, r] of remotes) if (!s.pl.some(x => x[0] === num)) { dropRemote(r); remotes.delete(num); }
    if (s.me) applyMe(s.me);
    syncItems(s.it); syncEnts(s.en); syncProj(s.pr); syncSmoke(s.sm); syncObjectives(s.ob);
    // selfHist uses server time for the killcam
  }
  function dropRemote(r) { r.tag?.remove(); r.av?.dispose?.(); r.corpse?.av?.dispose?.(); r.spare?.dispose?.(); AR.PvpAudio.drop(r.num); }
  function estServer() { return snapLast ? serverT + (performance.now() - snapRecv) / 1000 : 0; }
  function selfStats(row) { const p = P(); if (!p) return; if (!(row[6] & 1) && p.alive && !dead) { /* death arrives as an event */ } }
  function applyMe(m) {
    const p = P(); if (!p) return;
    if (!dead) {
      p.hp = m.hp; p.maxHp = m.mhp;
      if (m.msh) { p.armor = m.sh; p.maxArmor = Math.max(m.msh, m.sh, 1); } else { p.armor = 0; p.maxArmor = 1; }
      p.nades = m.n;
    }
    streakReady = m.rd || [];
    // ammo: the reserve always follows the match; the magazine only when it has drifted
    (m.am || []).forEach(([mag, res, rl], i) => { const g = p.guns[i]; if (!g) return; if (g.reserve !== Infinity) g.reserve = res; if (!rl && !g.reloading && Math.abs(g.ammo - mag) > 2) g.ammo = mag; });
    hudMe(m);
  }

  function onEvent(v) {
    const p = P();
    switch (v.e) {
      case 'you': me = v.num; myTeam = v.team; break;
      case 'joined': roster.set(v.num, Object.assign(roster.get(v.num) || {}, { num: v.num, name: v.name, team: v.team, bot: v.bot, look: v.look, input: v.input })); if (v.num !== me && !v.bot && done === false && snapLast) AR.Hud.chat('GIGALEAGUE', v.name + ' JOINED', '#00e5ff'); break;
      case 'left': { const r = roster.get(v.num); roster.delete(v.num); if (r && !r.bot) AR.Hud.chat('GIGALEAGUE', r.name + ' LEFT', '#888'); break; }
      case 'board': boardRows = v.r; break;
      case 'spawn': return onSpawn(v);
      case 'correct': if (p) { p.body.pos.set(v.x, v.y, v.z); p.body.vel.set(0, 0, 0); } break;
      case 'ammo': if (p?.guns[v.w]) { p.guns[v.w].ammo = v.mag; if (p.guns[v.w].reserve !== Infinity) p.guns[v.w].reserve = v.res; } break;
      case 'weapons': if (p) { setGuns(v.guns, v.cur); v.mag.forEach((n, i) => { if (p.guns[i]) { p.guns[i].ammo = n; p.guns[i].reserve = v.res[i]; } }); } break;
      case 'hit': if (v.ent) { AR.Hud.hitmark(false, false); AR.Sfx.hit(false, 1.2); break; } AR.Hud.hitmark(!!v.h, !!v.k); AR.Sfx.hit(!!v.h, v.sh ? 0.7 : 1); if (v.h) AR.Sfx.headshot(); break;
      case 'hurt': onHurt(v); break;
      case 'kill': onKillEv(v); break;
      case 'pts': popPts(v.n, v.why); break;
      case 'streak': onStreakEv(v); break;
      case 'boom': onBoom(v); break;
      case 'flash': flashUntil = performance.now() + v.dur * 1000; flashK = v.k; notifications(v.k); break;
      case 'stun': stunUntil = performance.now() + v.dur * 1000; break;
      case 'blackout': blackUntil = performance.now() + v.dur * 1000; break;
      case 'call': if (!(mode.noChat && v.key !== 'win')) AR.Hud.say(PVP.HOST.name, v.txt, 3.2); break;
      case 'efire': { const e = objs.ents.get(v.id); if (e) { AR.Fx.trace(e.obj.position.x, e.obj.position.y, e.obj.position.z, v.x, v.y, v.z, 0xff3b5c, 0.08); AR.Sfx.enemyShot(e.obj.position.x, e.obj.position.y, e.obj.position.z, 'bolt'); } break; }
      case 'entdown': if (!v.quiet) { AR.Fx.explosion(v.x, v.y, v.z, 2.2); AR.Sfx.explosion(v.x, v.y, v.z, 0.8); } break;
      case 'item': break;
      case 'tele': if (v.num !== me) { AR.Sfx.tele?.(v.x, v.y, v.z); AR.Fx.teleFlash?.(v.x, v.y, v.z); } break;
      case 'power': if (v.num === me) AR.Hud.toast(v.k === 'overshield' ? PVP.CLASSIC_PICKUPS.find(x => x.kind === 'overshield').name : PVP.CLASSIC_PICKUPS.find(x => x.kind === 'camo').name, v.k === 'overshield' ? '+100 SHIELD FOR 30 S' : 'NEARLY INVISIBLE FOR 30 S'); break;
      case 'obj': onObjEv(v); break;
      case 'round': AR.Hud.banner('ROUND ' + v.n, mode.id === 'snd' ? (v.attack === myTeam ? 'ATTACK // PLANT THE CHARGE' : 'DEFEND // STOP THE CHARGE') : 'ROUND START', 3); break;
      case 'roundEnd': AR.Hud.banner(v.winner === myTeam ? 'ROUND WON' : v.winner < 0 ? 'ROUND DRAWN' : 'ROUND LOST', (v.wins || []).join(' — '), 3.5); break;
      case 'end': onEnd(v.res); break;
      case 'reward': reward = v; if (results) showResults(); break;
    }
  }
  function nameOf(num) { return num === me ? 'YOU' : roster.get(num)?.name || remotes.get(num)?.name || '???'; }
  function teamOf(num) { return num === me ? myTeam : roster.get(num)?.team ?? remotes.get(num)?.team ?? -1; }

  /* ------------------------------------------------ spawning and loadouts */
  function defFor(id, att, tier) {
    const S = window.PvpSim.gunStats(id, playlist, att, tier || 0);
    const vis = S.vis || 'pistol', base = AR.GUNS[vis] || AR.GUNS.pistol;
    const recoil = 1 + (S.mods?.recoil || 0), sleight = AR.Pvp.sleight ? 0.65 : 1;
    const d = Object.assign({}, base, {
      name: S.name.replace(/"/g, ''), tag: S.cls.toUpperCase() + ' // ' + (S.burst ? S.burst + '-ROUND BURST' : S.rpm + ' RPM'),
      dmg: S.near[0], pellets: S.pellets, rpm: S.fire === 'burst' ? S.burstRpm : S.rpm, semi: S.fire === 'semi', mag: S.magSize, reserve: S.reserve, reload: (S.reloadT || 0.3) * sleight,
      spread: S.spread[0] * (1 + (S.mods?.spread || 0)), adsSpread: S.spread[1], adsTime: S.ads * (1 + (S.mods?.ads || 0)), kick: base.kick * recoil, kickYaw: base.kickYaw * recoil,
      burst: S.burst || 0, burstGap: S.fire === 'burst' ? 60 / S.rpm : 0, stf: S.stf, stfK: S.mods?.stf || 0, flinchK: S.mods?.flinch || 0, melee: !!S.melee, noZoom: !!S.noZoom, shellReload: !!S.shell || base.shellReload,
      snd: PVP.GUNS[id]?.snd, quiet: !!S.mods?.quiet,
    });
    if (S.zoom) d.ads = 1 / S.zoom * 1.6;
    if (!S.proj) delete d.proj; else d.proj = Object.assign({}, base.proj || {}, { speed: S.proj.speed, grav: S.proj.grav, splash: S.proj.splash, life: S.proj.life, bounce: S.proj.bounce || 0 });
    return { id, vis, att: (att || []).slice(), tier: tier || PvpProgress.camoOf(id), def: d };
  }
  function setGuns(guns, cur) {
    const list = guns.map(([id, tier, att]) => { const x = defFor(id, att, tier); if (playlist !== 'classic' && !tier) x.tier = PvpProgress.camoOf(id); return x; });
    AR.Player.setLoadout(list, cur || 0);
  }
  function onSpawn(v) {
    const p = P();
    AR.Player.setProfile(PVP.MOVE[v.prof] || PVP.MOVE[playlist]);
    if (!v.keep) AR.Player.reset({ x: v.x, y: v.y, z: v.z, yaw: v.yaw }, null);
    AR.Pvp.sleight = (v.loadout.perks || []).includes('sleight');
    const p2 = P();
    p2.hp = v.hp; p2.maxHp = v.hp; p2.armor = v.sh || 0; p2.maxArmor = Math.max(1, v.sh || 0); p2.nades = v.loadout.lethal ? 1 : 0;
    setGuns(v.loadout.guns, 0);
    myStreaks = v.loadout.streaks || [];
    dead = false; killcam = null; spawnInfo = v; AR.Player.spectate?.(false);
    hud.classList.remove('dead'); hudEl('resp').style.display = 'none';
    AR.lockPointer();
    if (p && !v.keep) AR.Hud.toast('REVIVED', 'REVIVAL FEE ¤' + PVP.REVIVAL_FEE.toLocaleString('en-US') + ' ADDED TO YOUR ESTATE');
    if (v.swap) { AR.Hud.toast('CLASS CHANGED', (PvpProgress.classes()[O.cls || 0]?.name || '') + ' // YOU HAD NOT FIRED YET, SO IT APPLIES NOW'); AR.PvpAudio.ui('confirm'); }
    multi.n = 0; hillRun = 0;
  }

  /* ------------------------------------------------ hits, kills, death */
  function predictHit(o, dirs) {
    // the hit marker shows at once from the local picture; the match's 'hit' event confirms it (and plays the sound)
    for (const d of dirs) for (const r of remotes.values()) {
      const s = r.cur; if (!s || !(s.f & 1) || (mode.teams === 2 && r.team === myTeam)) continue;
      const cx = s.pos.x - o.x, cz = s.pos.z - o.z, t = cx * d[0] + cz * d[2];
      if (t < 0) continue;
      const px = o.x + d[0] * t, pz = o.z + d[2] * t, py = o.y + d[1] * t;
      if (Math.hypot(px - s.pos.x, pz - s.pos.z) < 0.42 && py > s.pos.y && py < s.pos.y + 1.85 && AR.World.los(o.x, o.y, o.z, px, py, pz)) { AR.Hud.hitmark(false, false); return; }
    }
  }
  function onHurt(v) {
    const p = P(); if (!p || dead) return;
    const from = v.a && remotes.get(v.a)?.cur?.pos;
    AR.Hud.hurt(v.d, from ? { x: from.x, z: from.z } : { x: v.x, z: v.z }, p);
    AR.Sfx.hurt(v.d);
    // THICK SKIN halves flinch; a RUBBER GRIP on the gun in hand takes off its share too
    const thick = (spawnInfo?.loadout?.perks?.includes('thickskin') ? 0.5 : 1) * (1 + (AR.Player.gun?.d?.flinchK || 0));
    AR.Player.addTrauma(Math.min(0.45, 0.1 + v.d / 70) * thick);
    p.punchVP += (Math.random() - 0.5) * 0.9 * thick; p.punchVY += (Math.random() - 0.5) * 0.9 * thick;       // NOSONAR — flinch
    p.hp = v.hp;
    window.Pad?.rumble(Math.min(1, 0.3 + v.d / 50), 0.45, 140);
    if (window.VR?.active) VR.hurt(Math.min(0.8, 0.2 + v.d / 50));
  }
  function onKillEv(v) {
    feed(v);
    lastKill = Object.assign({ at: estServer() }, v);
    const p = P(), ally = n => mode.teams === 2 && n !== me && teamOf(n) === myTeam;
    // the victim cries out where they fell; their body falls away from the shot
    const r = remotes.get(v.v);
    if (r) {
      const kp = v.k === me ? p?.body.pos : remotes.get(v.k)?.cur?.pos;
      if (kp && v.k !== v.v) { const dx = v.x - kp.x, dz = v.z - kp.z, n = Math.hypot(dx, dz) || 1; r.killDir = [dx / n, dz / n]; } else r.killDir = null;
      AR.PvpAudio.place(r.num, v.x, v.y + 1.3, v.z);
      AR.PvpAudio.vocal(r.num, 'death', r.voice, ally(v.v));
    }
    // a teammate down: marked on the minimap for a few seconds, and a short chirp if it was near you
    if (ally(v.v)) { allyX.push({ x: v.x, z: v.z, at: performance.now() }); const c = AR.camera.position; if (Math.hypot(c.x - v.x, c.z - v.z) < 45) AR.PvpAudio.ui('allyDown'); }
    if (v.k === me && v.v !== me) {
      AR.Sfx.kill(Math.min(10, v.s), v.h); AR.hitstop?.(0.04);
      AR.PvpAudio.ui('confirm'); if (v.h) AR.PvpAudio.ui('head');
      confirmLine(v);
      const t = performance.now() / 1000;
      multi.n = t - multi.at <= PVP.MULTI_WINDOW ? multi.n + 1 : 1; multi.at = t;
      if (multi.n >= 2) medal('multi' + Math.min(6, multi.n));
      if (v.s === 5 || v.s === 10 || v.s === 15 || v.s === 20) medal('streak' + v.s);
      if (lastKiller && v.v === lastKiller) { medal('revenge'); lastKiller = 0; }
      if (v.w === 'melee' || v.w === 'knife') medal('melee');
      window.Pad?.rumble(0.35, 0.6, 90);
      if (chatOn) AR.Hud.chat(AR.pick(AR.CHAT_USERS), AR.pick(v.h ? AR.CHAT.head : v.s >= 3 ? AR.CHAT.multi : AR.CHAT.kill));
    }
    if (v.v === me && p) {
      dead = true; deadAt = performance.now(); p.alive = false; killer = v.k && v.k !== me ? v.k : 0;
      lastKiller = killer; multi.n = 0; hillRun = 0;
      AR.unlockPointer();
      AR.PvpAudio.ui('dead');
      if (chatOn) AR.Hud.chat(AR.pick(AR.CHAT_USERS), AR.pick(AR.CHAT.death));
      const rs = (mode.respawn || 3) + (spawnInfo?.loadout?.perks?.includes('bnpl') ? 1 : 0);
      // the death cam: not a replay from their eyes, a look at them, live, from the front (so you can find them again)
      killcam = { mode: 'death', num: killer && remotes.has(killer) ? killer : 0, w: v.w, h: v.h, x: v.x, y: v.y, z: v.z, t0: performance.now(), snap: true };
      AR.Player.spectate?.(true);
      void rs;
      showRespawn(v);
    }
  }
  function onBoom(v) {
    const kind = v.k;
    if (kind === 'vape') { AR.Sfx.explosion(v.x, v.y, v.z, 0.3); return; }
    if (kind === 'notify' || kind === 'stun' || kind === 'cookie') { AR.Fx.emit(AR.Fx.glow, v.x, v.y, v.z, kind === 'cookie' ? 0x39ff8a : 0xffffff, 24, 6, 0.4); AR.Sfx.explosion(v.x, v.y, v.z, 0.4); return; }
    AR.Fx.explosion(v.x, v.y, v.z, v.r * 0.6); AR.Sfx.explosion(v.x, v.y, v.z, Math.min(1.4, v.r / 3.5));
    const p = P(); if (!p || dead) return;
    const b = p.body, dx = b.pos.x - v.x, dy = b.pos.y + 0.9 - v.y, dz = b.pos.z - v.z, d = Math.hypot(dx, dy, dz);
    if (d < v.r + 0.4) {                                             // blast push (and rocket jumps with the MGL-6)
      const f = 1 - d / (v.r + 0.4), n = Math.max(0.3, d);
      b.vel.x += dx / n * 11 * f; b.vel.z += dz / n * 11 * f; b.vel.y = Math.max(b.vel.y, 3) + 8 * f; b.onGround = false;
      AR.Player.addTrauma(0.3 * f);
    }
  }
  function onStreakEv(v) {
    if (v.st === 'ready') { AR.Hud.toast('STREAK READY', PVP.STREAKS[v.id].name.replace(/"/g, '') + ' // PRESS ' + slotKey(v.id)); AR.PvpAudio.ui('streak'); window.Pad?.rumble(0.2, 0.5, 120); }
    if (v.st === 'used') {
      const S = PVP.STREAKS[v.id], mine = v.by === me, friendly = mode.teams === 2 ? v.team === myTeam : mine;
      AR.Hud.toast(mine ? 'STREAK ACTIVE' : friendly ? 'FRIENDLY ' + S.name.replace(/"/g, '') : 'ENEMY ' + S.name.replace(/"/g, ''), mine ? S.d : nameOf(v.by));
      if (v.id === 'wipe' && !friendly) AR.Hud.banner('SERVER WIPE INCOMING', 'TEN SECONDS. FIND GOD.', 4);
    }
  }
  function slotKey(id) { const i = Math.max(0, myStreaks.indexOf(id)); return window.Glyph ? Glyph.label('streak' + (i + 1)) : '[' + (i + 3) + ']'; }
  function onObjEv(v) {
    const T2 = PVP.TEAM_NAMES;
    if (v.k === 'flag') { AR.Hud.toast('FLAG ' + v.id, (v.owner === myTeam ? 'SECURED' : 'LOST') + ' // ' + T2[v.owner]); AR.PvpAudio.ui(v.owner === myTeam ? 'captured' : 'lost'); }
    if (v.k === 'flagCap') AR.PvpAudio.ui(v.team === myTeam ? 'captured' : 'lost');
    if (v.k === 'planted') AR.PvpAudio.ui(objState?.att === myTeam ? 'captured' : 'lost');
    if (v.k === 'defused') AR.PvpAudio.ui(objState?.att === myTeam ? 'lost' : 'captured');
    if (v.k === 'halftime') AR.Hud.banner('HALFTIME', 'SIDES SWITCH', 3);
    if (v.k === 'hill') { AR.Hud.toast('HILL MOVED', 'GET TO IT'); AR.PvpAudio.ui('contested'); }
    if (v.k === 'harvest' && v.by === me) AR.Hud.toast('DATA HARVESTED', '+1 FOR THE TEAM');
    if (v.k === 'deny' && v.by === me) AR.Hud.toast('DRIVE DENIED', 'THEIR POINT IS GONE');
    if (v.k === 'flagTaken') AR.Hud.toast(v.team === myTeam ? 'YOUR FLAG IS TAKEN' : 'WE HAVE THEIR FLAG', nameOf(v.by));
    if (v.k === 'flagCap') AR.Hud.banner(v.team === myTeam ? 'FLAG CAPTURED' : 'THEY CAPTURED', nameOf(v.by), 3);
    if (v.k === 'flagReturn') AR.Hud.toast('FLAG RETURNED', v.team === myTeam ? 'OURS IS HOME' : 'THEIRS IS HOME');
    if (v.k === 'ball') AR.Hud.toast('HOT TAKE', nameOf(v.by) + (v.by === me ? ' — EVERYONE CAN SEE YOU' : ' HAS IT'));
    if (v.k === 'planted') AR.Hud.banner('CHARGE PLANTED', 'SITE ' + 'AB'[v.site], 3);
    if (v.k === 'defused') AR.Hud.banner('CHARGE DEFUSED', '', 2.5);
    if (v.k === 'infected') { if (v.num === me) AR.Hud.banner('YOU ARE SERVERLESS', 'NO CLOUD. NO VOTE. BITE SOMEONE.', 3.5); }
    if (v.k === 'influencer') { if (v.num === me) AR.Hud.banner('YOU ARE THE INFLUENCER', '400 HP. A MINIGUN. EVERYONE WANTS A PIECE.', 3.5); }
  }

  /* ================================================================== remote players */
  function addRemote(num) {
    const info = roster.get(num) || {};
    const r = { num, name: info.name || 'OPERATIVE', team: info.team ?? 0, bot: !!info.bot, buf: [], cur: null, anim: '', lastF: 0, stepT: 0, airT: 0,
      look: null, voice: num % 2 ? 'f' : 'm', shotQ: [], lastShots: null, lastSwings: null, lastHp: 100, gruntAt: 0, whizAt: 0, corpse: null, spare: null, resync: true };
    if (window.AvatarKit?.loaded) {
      try { r.look = info.look ? AvatarKit.decode(info.look) : null; } catch (e) { r.look = null; }
      if (!r.look) r.look = AvatarKit.randomLoadout(num % 2 ? 'f' : 'm');
      r.voice = r.look?.sex === 'f' ? 'f' : r.look?.sex === 'm' ? 'm' : r.voice;
    }
    useAvatar(r, makeAvatar(r));
    r.tag = document.createElement('div'); r.tag.className = 'pvptag'; hudEl('tags').appendChild(r.tag);
    remotes.set(num, r);
    return r;
  }
  /** One body for a remote player: their Fitting Room avatar (a capsule without the kit), carrying a gun at the chest. */
  function makeAvatar(r) {
    let av = null;
    if (r.look && window.AvatarKit?.loaded) { try { av = AvatarKit.create(r.look); av.play?.('Idle Combat', 0); } catch (e) { av = null; } }
    if (!av) {
      const g = new THREE.Group(), m = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.75, 8), new THREE.MeshLambertMaterial({ color: 0x8866cc }));
      m.position.y = 0.88; g.add(m); av = { root: g, update() {}, play() { return null; }, dispose() { g.parent?.remove(g); }, capsule: true };
    }
    root.add(av.root);
    av.gunPivot = new THREE.Group(); av.gunPivot.position.set(0.22, 1.32, 0); av.root.add(av.gunPivot);
    av.laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(), V3(0, 0, 40)]), new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.55 }));
    av.laser.visible = false; av.gunPivot.add(av.laser);
    return av;
  }
  function useAvatar(r, av) {
    r.av = av; r.gunPivot = av.gunPivot; r.laser = av.laser; r.gun = av.gun || null; r.gunId = av.gunId || null; r.anim = ''; r.camo = false;
    av.gunPivot.visible = true; av.root.rotation.set(0, 0, 0);
  }
  function setRemoteGun(r, w, tier) {
    const id = WEAPONS()[w] || 'pistol';
    if (r.gunId === id + ':' + tier) return;
    r.gunId = r.av.gunId = id + ':' + tier;
    if (r.gun) { r.gunPivot.remove(r.gun.root); r.gun = r.av.gun = null; }
    const vis = PVP.GUNS[id]?.vis; if (!vis) return;
    const v = AR.Arsenal.build(vis, tier || 0); if (!v) return;
    v.root.scale.setScalar(1.05); v.root.rotation.set(0, 0, 0);
    r.gunPivot.add(v.root); r.gun = r.av.gun = v;
  }
  /** a player's state at time t, from the snapshot buffer (linear between the two snapshots around t) */
  function sample(r, t) {
    const b = r.buf; if (!b.length) return null;
    let a = b[0], c = b[b.length - 1];
    if (t <= a[0]) c = a; else if (t >= c[0]) a = c;
    else for (let i = b.length - 1; i > 0; i--) if (b[i - 1][0] <= t) { a = b[i - 1]; c = b[i]; break; }
    let k = c[0] > a[0] ? clamp((t - a[0]) / (c[0] - a[0]), 0, 1) : 0;
    if (Math.hypot(c[1] - a[1], c[3] - a[3]) > 8) k = k < 0.5 ? 0 : 1;          // a teleporter: jump, never slide across the map
    const L = (i) => a[i] + (c[i] - a[i]) * k;
    let dy = c[4] - a[4]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    // the counters (rounds fired, melee swings) step when time passes the snapshot that raised them
    const at = k >= 1 || t >= c[0] ? c : a;
    return { pos: V3(L(1), L(2), L(3)), yaw: a[4] + dy * k, pitch: L(5), f: c[6], hp: c[7], w: c[8], team: c[9], radar: c[10], tier: c[11], sh: c[12], shots: at[13] | 0, swings: at[14] | 0,
      vx: (c[1] - a[1]) / Math.max(0.01, c[0] - a[0]), vz: (c[3] - a[3]) / Math.max(0.01, c[0] - a[0]) };
  }
  function drawRemotes(dt, t, hideNum) {
    const cam = AR.camera, w = innerWidth, h = innerHeight, pv = V3(), live = hideNum === -1, ms = performance.now();
    if (!live) replaying = true; else if (replaying) { replaying = false; for (const r of remotes.values()) r.resync = true; }
    for (const r of remotes.values()) {
      const s = sample(r, t); r.cur = s;
      corpseTick(r, dt, live);
      const av = r.av; if (!av || !s) continue;
      const alive = !!(s.f & 1);
      av.root.visible = alive && r.num !== hideNum;
      if (live) AR.PvpAudio.place(r.num, s.pos.x, s.pos.y + ((s.f & 2) ? 1.0 : 1.45), s.pos.z);
      // the killcam replays the past: nothing in it makes a sound or leaves a body; afterwards the counters catch up quietly
      if (!live || r.resync) { r.lastShots = s.shots; r.lastSwings = s.swings; r.shotQ.length = 0; r.lastHp = s.hp; r.wasAlive = alive; r.resync = !live; }
      if (!alive) {
        if (live && r.wasAlive) dieRemote(r, s);
        r.wasAlive = false; r.tag.style.display = 'none'; r.lastShots = s.shots; r.lastSwings = s.swings; r.shotQ.length = 0; r.lastHp = 100; continue;
      }
      r.wasAlive = true;
      av.root.position.copy(s.pos);
      av.root.rotation.y = s.yaw + Math.PI;
      r.gunPivot.rotation.x = -s.pitch;
      setRemoteGun(r, s.w, s.tier);
      // camo: nearly invisible; infected: grey
      const camo = !!(s.f & 128);
      if (r.camo !== camo) { r.camo = camo; av.root.traverse(o => { if (o.material) { o.material.transparent = camo; o.material.opacity = camo ? 0.12 : 1; } }); }
      r.laser.visible = !!(s.f & 2048);
      // animation
      const sp = Math.hypot(s.vx, s.vz), crouch = s.f & 2, ground = !!(s.f & 32);
      const anim = !ground ? 'Jump' : crouch ? (sp > 0.6 ? 'Crouch Walk' : 'Crouch Idle') : sp > 5.2 ? 'Run' : sp > 0.6 ? 'Walk' : 'Idle Combat';
      if (anim !== r.anim) { r.anim = anim; av.play?.(anim, 0.15); }
      av.update?.(dt);
      if (live) {
        const enemy = mode.teams !== 2 || r.team !== myTeam;
        // footsteps, loud and placed (not with NOISE-CANCELLING); a landing thuds
        if (!(s.f & 8192)) {
          if (ground && r.airT > 0.35) AR.PvpAudio.step(r.num, 'land', enemy);
          if (ground && sp > 1.6) {
            const kind = crouch ? 'crouch' : sp > 5.2 ? 'run' : 'walk';
            r.stepT -= dt * sp;
            if (r.stepT <= 0) { r.stepT = kind === 'run' ? 2.9 : kind === 'crouch' ? 1.7 : 2.2; AR.PvpAudio.step(r.num, kind, enemy); }
          }
        }
        r.airT = ground ? 0 : r.airT + dt;
        // every round they fired since the last frame, at the gun's own rate
        const n = (s.shots - r.lastShots + 256) & 255;
        if (n > 0 && n < 48) {
          const G = PVP.GUNS[WEAPONS()[s.w]], gap = G ? 60000 / (G.fire === 'burst' ? G.burstRpm : G.rpm) : 90;
          let at = Math.max(ms, r.shotQ.length ? r.shotQ[r.shotQ.length - 1] + gap : ms);
          for (let i = 0; i < n && r.shotQ.length < 16; i++, at += gap) r.shotQ.push(at);
        }
        r.lastShots = s.shots;
        while (r.shotQ.length && r.shotQ[0] <= ms) { r.shotQ.shift(); remoteShot(r, s); }
        const sw = (s.swings - r.lastSwings + 256) & 255; if (sw > 0 && sw < 8) AR.PvpAudio.swing(r.num); r.lastSwings = s.swings;
        // pain: a grunt when they lose health (teammates too, so you hear your side getting hurt)
        if (s.hp < r.lastHp - 2 && ms - r.gruntAt > 380) { r.gruntAt = ms; AR.PvpAudio.vocal(r.num, 'hurt', r.voice, !enemy); }
        r.lastHp = s.hp;
      }
      r.lastF = s.f;
      // nameplate: teammates always, enemies only when you can see them
      const enemy = mode.teams !== 2 || r.team !== myTeam;
      pv.set(s.pos.x, s.pos.y + 2.05, s.pos.z).project(cam);
      const onScreen = pv.z < 1 && Math.abs(pv.x) < 1.05 && Math.abs(pv.y) < 1.05;
      let show = onScreen && !camo;
      if (show && enemy) { const e = cam.position; show = AR.World.los(e.x, e.y, e.z, s.pos.x, s.pos.y + 1.4, s.pos.z) && e.distanceTo(s.pos) < 60; }
      r.tag.style.display = show ? 'block' : 'none';
      if (show) {
        r.tag.style.left = ((pv.x * 0.5 + 0.5) * w) + 'px'; r.tag.style.top = ((-pv.y * 0.5 + 0.5) * h) + 'px';
        const col = enemy ? 'var(--pvp-enemy)' : 'var(--pvp-ally)';
        const txt = `<b style="color:${col}">${esc(r.name)}</b>${enemy ? '' : `<i style="width:${s.hp}%"></i>`}${s.f & 256 ? '<u>INFLUENCER</u>' : s.f & 512 ? '<u>CARRIER</u>' : s.f & 1024 ? '<u>SERVERLESS</u>' : ''}`;
        if (r.tag._t !== txt) { r.tag.innerHTML = txt; r.tag._t = txt; }
      }
    }
  }
  /* ------------------------------------------------ bodies: the avatar plays its Death clip, stays a few seconds, sinks */
  function floorBelow(x, y, z) { const hit = AR.World.raycast(x, y + 0.6, z, 0, -1, 0, 30); return hit ? y + 0.6 - hit.t : y; }
  function dieRemote(r, s) {
    if (r.corpse) endCorpse(r);                                   // a second death before the last body cleared
    const av = r.av, dir = r.killDir || [0, 0];
    av.root.visible = true; av.root.position.copy(s.pos); av.root.rotation.y = s.yaw + Math.PI;
    av.gunPivot.visible = false; av.laser.visible = false;
    if (r.camo) av.root.traverse(o => { if (o.material) { o.material.transparent = false; o.material.opacity = 1; } });
    const act = av.capsule ? null : av.play?.('Death', 0.08);
    if (act) { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; }
    r.corpse = { av, act, hold: act ? deathHold(act.getClip()) : 0, t0: performance.now(), x: s.pos.x, y: s.pos.y, z: s.pos.z, vx: dir[0] * 2.4, vz: dir[1] * 2.4, vy: 0, floor: floorBelow(s.pos.x, s.pos.y, s.pos.z), tip: 0 };
    r.killDir = null;
    // the player lives on in the other body: two avatars a player at most, swapped
    useAvatar(r, r.spare || makeAvatar(r)); r.spare = null;
    r.av.root.visible = false;
  }
  /** The Death clip falls, lies still, then gets back up at the end. Find the moment the body is down (the hips at
   *  their lowest) and freeze there, so a body never stands back up. */
  const holdCache = new Map();
  function deathHold(clip) {
    if (holdCache.has(clip)) return holdCache.get(clip);
    let hold = Math.min(1.1, clip.duration * 0.35);
    const tr = clip.tracks.find(t => /hips\.position$/.test(t.name));
    if (tr) {
      let minY = Infinity; for (let i = 1; i < tr.values.length; i += 3) minY = Math.min(minY, tr.values[i]);
      for (let k = 0; k < tr.times.length; k++) if (tr.values[k * 3 + 1] <= minY + 0.04) { hold = tr.times[k] + 0.05; break; }
    }
    hold = Math.min(hold, clip.duration * 0.6);
    holdCache.set(clip, hold);
    return hold;
  }
  function corpseTick(r, dt, live) {
    const c = r.corpse; if (!c) return;
    const age = (performance.now() - c.t0) / 1000;
    if (age > BODY_STAY + BODY_SINK) { endCorpse(r); return; }
    c.av.root.visible = live;                                     // bodies belong to now, not to the killcam
    // knocked back a little from the shot, falling to the floor
    const k = Math.exp(-dt * 5); c.vx *= k; c.vz *= k;
    const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
    if (AR.World.los(c.x, c.y + 0.5, c.z, nx, c.y + 0.5, nz)) { c.x = nx; c.z = nz; }
    if (c.y > c.floor) { c.vy -= 22 * dt; c.y = Math.max(c.floor, c.y + c.vy * dt); }
    const sink = age > BODY_STAY ? (age - BODY_STAY) / BODY_SINK : 0;
    c.av.root.position.set(c.x, c.y - sink * 0.9, c.z);
    if (c.av.capsule) { c.tip = Math.min(1, c.tip + dt * 3); c.av.root.rotation.x = -c.tip * 1.45; }
    c.av.update?.(dt);
    if (c.act && c.act.time >= c.hold) { c.act.time = c.hold; c.act.paused = true; }        // down, and staying down
  }
  function endCorpse(r) {
    const c = r.corpse; if (!c) return;
    c.av.root.visible = false; c.av.root.rotation.x = 0; c.av.gunPivot.visible = true;
    if (c.act) { c.act.paused = false; c.act.stop(); if (c.av.action === c.act) c.av.action = null; }
    if (r.spare) r.spare.dispose?.();
    r.spare = c.av; r.corpse = null;
  }
  const HEAVY = new Set(['sniper', 'marksman', 'revolver']);
  function remoteShot(r, s) {
    const id = WEAPONS()[s.w], G = PVP.GUNS[id]; if (!G || G.melee) return;
    const o = V3(s.pos.x, s.pos.y + ((s.f & 2) ? 1.05 : 1.55), s.pos.z), d = window.PvpSim.dirFrom(s.yaw, s.pitch);
    const hit = AR.World.raycast(o.x, o.y, o.z, d[0], d[1], d[2], 120), t = hit ? hit.t : 120;
    AR.Fx.trace(o.x + d[0] * 0.6, o.y + d[1] * 0.6, o.z + d[2] * 0.6, o.x + d[0] * t, o.y + d[1] * t, o.z + d[2] * t, AR.GUNS[G.vis]?.tracer || 0xffe080, 0.06);
    const quiet = !!(s.f & 16384);
    if (!quiet) AR.Fx.light(o.x + d[0] * 0.6, o.y, o.z + d[2] * 0.6, 0xffb060, 2, 7, 0.05);
    AR.PvpAudio.shot(r.num, G.snd || 'ar', s.tier, { quiet });
    // a round passing close to your head cracks past it: you know you are the one being shot at
    const hostile = mode.teams !== 2 || r.team !== myTeam;
    if (hostile && !dead) {
      const c = AR.camera.position, wx = c.x - o.x, wy = c.y - o.y, wz = c.z - o.z, tc = wx * d[0] + wy * d[1] + wz * d[2];
      if (tc > 2 && tc < t + 1) {
        const mx = o.x + d[0] * tc, my = o.y + d[1] * tc, mz = o.z + d[2] * tc, miss = Math.hypot(c.x - mx, c.y - my, c.z - mz);
        const ms = performance.now();
        if (miss < (G.pellets > 1 ? 1.6 : 2.6) && ms - r.whizAt > 70) { r.whizAt = ms; AR.PvpAudio.whiz(mx, my, mz, HEAVY.has(id)); }
      }
    }
  }

  /* ================================================================== items, streaks, projectiles, smoke, objectives */
  const MAT = {};
  const mat = (hex, add) => MAT[hex + (add ? 'a' : '')] || (MAT[hex + (add ? 'a' : '')] = add ? new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }) : new THREE.MeshBasicMaterial({ color: hex }));
  function itemMesh(kind, gun) {
    const g = new THREE.Group();
    const col = { weapon: 0xffd400, crate: 0x00e5ff, health: 0x39ff8a, nades: 0xff2bd6, overshield: 0x7a5bff, camo: 0xc0c0ff, drive: 0x00e5ff }[kind] || 0xffffff;
    if (kind === 'weapon' && gun && PVP.GUNS[gun]?.vis) { const v = AR.Arsenal.build(PVP.GUNS[gun].vis, 3); if (v) { v.root.scale.setScalar(1.6); v.root.position.y = 0.9; g.add(v.root); g.userData.spin = v.root; } }
    else if (kind === 'drive') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.5), mat(col)); m.position.y = 0.4; g.add(m); g.userData.spin = m; }
    else { const m = new THREE.Mesh(kind === 'crate' ? new THREE.BoxGeometry(0.9, 0.7, 0.9) : new THREE.OctahedronGeometry(0.32), mat(col)); m.position.y = kind === 'crate' ? 0.35 : 0.9; g.add(m); g.userData.spin = kind === 'crate' ? null : m; }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 24), mat(col, true)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    return g;
  }
  function syncItems(list) {
    const seen = new Set();
    for (const [id, kind, x, y, z, extra, tier, team] of list || []) {
      seen.add(id);
      let o = objs.items.get(id);
      if (!o) { o = { kind, extra, team, obj: itemMesh(kind, extra) }; root.add(o.obj); objs.items.set(id, o); }
      o.obj.position.set(x, y, z); o.obj.visible = true; o.x = x; o.y = y; o.z = z; o.tier = tier;
      if (kind === 'drive') o.obj.children[0].material = mat(team === myTeam && mode.teams === 2 ? 0x4da6ff : 0xff3b5c);
    }
    for (const [id, o] of objs.items) if (!seen.has(id)) { root.remove(o.obj); objs.items.delete(id); }
  }
  function entMesh(kind) {
    const g = new THREE.Group();
    const big = kind === 'gunship', air = kind !== 'broadcaster';
    const body = new THREE.Mesh(new THREE.BoxGeometry(big ? 3.6 : air ? 1.2 : 0.8, big ? 1.1 : air ? 0.4 : 1.4, big ? 5 : air ? 1.2 : 0.8), new THREE.MeshLambertMaterial({ color: big ? 0x2a2f3a : 0x23202e }));
    g.add(body);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.4 : 0.18, 8, 6), mat(0xff3b5c)); eye.position.set(0, big ? -0.3 : 0.2, big ? -2.4 : -0.45); g.add(eye);
    if (air) for (const s of [-1, 1]) { const rot = new THREE.Mesh(new THREE.BoxGeometry(big ? 3 : 1.4, 0.04, 0.16), mat(0xbbbbbb)); rot.position.set(0, big ? 0.7 : 0.25, s * (big ? 1.6 : 0)); g.add(rot); g.userData.rotors = (g.userData.rotors || []).concat(rot); }
    return g;
  }
  function syncEnts(list) {
    const seen = new Set();
    for (const [id, kind, x, y, z, yaw, team, hp] of list || []) {
      seen.add(id);
      let o = objs.ents.get(id);
      if (!o) { o = { kind, team, obj: entMesh(kind), tx: x, ty: y, tz: z }; o.obj.position.set(x, y, z); root.add(o.obj); objs.ents.set(id, o); }
      o.tx = x; o.ty = y; o.tz = z; o.yaw = yaw; o.hp = hp; o.team = team;
    }
    for (const [id, o] of objs.ents) if (!seen.has(id)) { root.remove(o.obj); objs.ents.delete(id); }
  }
  function syncProj(list) {
    const seen = new Set();
    for (const [id, kind, x, y, z, owner] of list || []) {
      seen.add(id);
      if (owner === me && (kind === 'shell')) continue;              // our own rockets and plasma already fly locally
      let o = objs.proj.get(id);
      if (!o) {
        const col = { frag: 0xff2bd6, sticky: 0xffd400, popup: 0xff3b5c, knife: 0xdddddd, notify: 0xffffff, vape: 0x9bffef, stun: 0x00e5ff, cookie: 0x39ff8a, shell: 0xffb020 }[kind] || 0xffffff;
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, kind === 'knife' ? 0.4 : 0.2), mat(col));
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: Assets.starTex(), color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); spr.scale.setScalar(0.5); m.add(spr);
        o = { obj: m }; root.add(m); objs.proj.set(id, o); o.obj.position.set(x, y, z);
      }
      o.tx = x; o.ty = y; o.tz = z;
    }
    for (const [id, o] of objs.proj) if (!seen.has(id)) { root.remove(o.obj); objs.proj.delete(id); }
  }
  function syncSmoke(list) {
    while (objs.smoke.length > (list || []).length) root.remove(objs.smoke.pop());
    (list || []).forEach(([x, y, z, r], i) => {
      let m = objs.smoke[i];
      if (!m) { m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xc8d0e0, transparent: true, opacity: 0.82, depthWrite: false })); root.add(m); objs.smoke[i] = m; }
      m.position.set(x, y, z); m.scale.setScalar(r);
    });
  }
  let objMarks = null, objState = null;
  function ringMesh(r, hex) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 32, 1, true), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); return m; }
  function syncObjectives(ob) {
    objState = ob;
    if (!ob) return;
    if (!objMarks) { objMarks = new THREE.Group(); root.add(objMarks); objMarks.userData.k = ob.k; }
    const need = ob.k === 'dom' ? 3 : ob.k === 'hill' ? 1 : ob.k === 'ctf' ? 2 : ob.k === 'ball' ? 1 : ob.k === 'snd' ? 3 : 0;
    while (objMarks.children.length < need) {
      const i = objMarks.children.length;
      let m;
      if (ob.k === 'ball') { m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), mat(0xff7a1a)); }
      else if (ob.k === 'ctf') { m = new THREE.Group(); const pole = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.06), mat(0xdddddd)); pole.position.y = 1.1; const fl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.03), mat(PVP_TEAM_HEX(i))); fl.position.set(0.47, 1.9, 0); m.add(pole, fl); }
      else if (ob.k === 'snd' && i === 2) { m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35), mat(0xff3b5c)); }
      else m = ringMesh(ob.k === 'hill' ? 5 : ob.k === 'snd' ? 3.2 : 4.2, 0xffffff);
      objMarks.add(m);
    }
    const C = objMarks.children;
    if (ob.k === 'dom') ob.f.forEach(([, x, y, z, owner, , cont], i) => { C[i].position.set(x, y + 0.06, z); C[i].material.color.setHex(cont ? 0xffd400 : owner < 0 ? 0xffffff : PVP_TEAM_HEX(owner)); });
    if (ob.k === 'hill') { C[0].position.set(ob.p[0], ob.p[1] + 0.06, ob.p[2]); C[0].material.color.setHex(ob.o === -2 ? 0xffd400 : ob.o < 0 ? 0xffffff : PVP_TEAM_HEX(ob.o)); }
    if (ob.k === 'ctf') ob.f.forEach(([team, x, y, z], i) => C[i].position.set(x, y + (ob.f[i][5] ? 0.2 : 0), z));
    if (ob.k === 'ball') { C[0].position.set(ob.p[0], ob.p[1] + (ob.c ? 2.3 : 0.5), ob.p[2]); }
    if (ob.k === 'snd') { ob.sites.forEach((s, i) => C[i].position.set(s[0], s[1] + 0.06, s[2])); if (ob.bomb) C[2].position.set(ob.bomb[0], ob.bomb[1] + (ob.bc ? 1.2 : 0.2), ob.bomb[2]); C[2].visible = !!ob.bomb && !ob.pl; }
  }
  const PVP_TEAM_HEX = t => (t === myTeam ? 0x4da6ff : 0xff3b5c);
  function waypoints() {
    const W = [], ob = objState; if (!ob) return W;
    const ally = t => (t === myTeam ? 'ally' : t < 0 ? '' : 'enemy');
    if (ob.k === 'dom') for (const [id, x, y, z, owner] of ob.f) W.push({ x, y: y + 2.2, z, label: id, cls: 'pvpwp ' + ally(owner) });
    if (ob.k === 'hill') W.push({ x: ob.p[0], y: ob.p[1] + 2.5, z: ob.p[2], label: 'HILL ' + ob.mv + 'S', cls: 'pvpwp ' + (ob.o >= 0 ? ally(ob.o) : '') });
    if (ob.k === 'ctf') for (const [team, x, y, z, home, c] of ob.f) W.push({ x, y: y + 2.6, z, label: (team === myTeam ? 'OUR FLAG' : 'THEIR FLAG') + (c ? ' (TAKEN)' : home ? '' : ' (DROPPED)'), cls: 'pvpwp ' + ally(team) });
    if (ob.k === 'ball') W.push({ x: ob.p[0], y: ob.p[1] + 2.8, z: ob.p[2], label: ob.c === me ? 'YOU HAVE IT' : 'HOT TAKE', cls: 'pvpwp' });
    if (ob.k === 'snd') { ob.sites.forEach((s, i) => W.push({ x: s[0], y: s[1] + 2.5, z: s[2], label: 'SITE ' + 'AB'[i] + (ob.pl?.site === i ? ' ' + Math.ceil(ob.pl.left) + 'S' : ''), cls: 'pvpwp ' + (ob.att === myTeam ? 'enemy' : 'ally') })); if (ob.bomb && !ob.pl && ob.att === myTeam) W.push({ x: ob.bomb[0], y: ob.bomb[1] + 1.6, z: ob.bomb[2], label: ob.bc === me ? 'CHARGE (YOU)' : 'CHARGE', cls: 'pvpwp ally' }); }
    return W;
  }

  /* ================================================================== the frame */
  function tick(dt, rdt) {
    if (!T) return;
    T.tick(rdt);
    const p = P();
    const t = estServer() - INTERP;
    // the death cam (live, in front of your killer) and the Clip of the Match (a replay of the last kill, the same view)
    if (killcam) {
      const k = (performance.now() - killcam.t0) / 1000;
      if (killcam.mode === 'clip') {
        if (k > killcam.len) { killcam = null; drawRemotes(rdt, t, -1); }
        else {
          const tt = killcam.from + Math.max(0, k) * ((killcam.to - killcam.from) / killcam.len);
          drawRemotes(rdt, tt, -2);
          const r = remotes.get(killcam.num), s = r && sample(r, tt);
          if (s) frontCam(s, rdt, Math.max(0, k));
        }
      } else {
        drawRemotes(rdt, t, -1);
        const s = killcam.num ? remotes.get(killcam.num)?.cur : null;
        if (s && (s.f & 1)) frontCam(s, rdt, k); else overCam(rdt, k);
      }
      deathLabel();
    } else { hudEl('kc').style.display = 'none'; drawRemotes(rdt, t, -1); }
    // ents and projectiles glide toward their latest positions
    for (const o of objs.ents.values()) { o.obj.position.x = AR.damp(o.obj.position.x, o.tx, 8, rdt); o.obj.position.y = AR.damp(o.obj.position.y, o.ty, 8, rdt); o.obj.position.z = AR.damp(o.obj.position.z, o.tz, 8, rdt); o.obj.rotation.y = o.yaw || 0; for (const r of o.obj.userData.rotors || []) r.rotation.y += rdt * 30; }
    for (const o of objs.proj.values()) { o.obj.position.x = AR.damp(o.obj.position.x, o.tx, 18, rdt); o.obj.position.y = AR.damp(o.obj.position.y, o.ty, 18, rdt); o.obj.position.z = AR.damp(o.obj.position.z, o.tz, 18, rdt); o.obj.rotation.y += rdt * 9; }
    for (const o of objs.items.values()) if (o.obj.userData.spin) o.obj.userData.spin.rotation.y += rdt * 1.6;
    if (objMarks?.children && objState?.k === 'ball') objMarks.children[0].rotation.y += rdt * 3;
    // send my state 30 times a second
    sendT -= rdt;
    if (p && !dead && sendT <= 0) {
      sendT = 1 / 30;
      const b = p.body, keys = AR.Player.keys, I = AR.Player.input;
      let fl = 0;
      if (p.crouching) fl |= 1; if (p.slideT > 0) fl |= 2; if (p.sprinting) fl |= 4; if (p.ads > 0.5) fl |= 8; if (b.onGround) fl |= 16; if (keys.KeyE || I.useHold) fl |= 32;
      send({ t: 'input', p: [+b.pos.x.toFixed(3), +b.pos.y.toFixed(3), +b.pos.z.toFixed(3)], v: [+b.vel.x.toFixed(2), +b.vel.y.toFixed(2), +b.vel.z.toFixed(2)], yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), fl, w: p.cur });
      selfHist.push([estServer(), b.pos.x, b.pos.y, b.pos.z, p.yaw, p.pitch]); if (selfHist.length > 200) selfHist.shift();
    }
    AR.PvpAudio.frame(AR.camera);
    // a controller while dead (the arena's own pad handling stops when you die): change class, skip the killcam
    const Pd = window.Pad;
    padBoard = !!(Pd?.active && !Pd.inMenu && Pd.held(Pd.BTN.BACK));
    if (dead && !done && Pd?.active && !Pd.inMenu) {
      if (Pd.down(Pd.BTN.LB) || Pd.down(Pd.BTN.LEFT)) stepClass(-1);
      if (Pd.down(Pd.BTN.RB) || Pd.down(Pd.BTN.RIGHT)) stepClass(1);
      if (Pd.down(Pd.BTN.A)) send({ t: 'skip' });
    }
    // a streak key, or the next ready streak
    const I = AR.Player.input;
    if (I.streak) {
      const want = I.streak === 9 ? streakReady[0] : myStreaks[I.streak - 1];
      if (want && streakReady.includes(want)) send({ t: 'streak', id: want });
      else if (I.streak !== 9) AR.Hud.toast('NOT READY', want ? PVP.STREAKS[want].name.replace(/"/g, '') + ' // ' + PVP.STREAKS[want].pts + ' POINTS' : 'NO STREAK IN THAT SLOT');
      I.streak = 0;
    }
    // a knife has no viewmodel
    const g = AR.Player.gun;
    if (g && window.GunFeel?.active && AR.Player.gunFeel) { /* GunFeel draws the gun */ }
    for (const av of podiumAvs) av.update?.(rdt);
    hudTick(rdt);
  }

  /* ------------------------------------------------ death cam */
  const _cp = V3(), _lk = V3();
  /** Third person, in front of the player (a little to their gun side), zooming in: you see their face, outfit, name and gun. */
  function frontCam(s, dt, k) {
    const cam = AR.camera, hy = s.pos.y + ((s.f & 2) ? 1.05 : 1.45);
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
    const dist = 5.2 - 3 * Math.pow(Math.min(1, k / 1.4), 0.7), side = 0.55;
    let tx = s.pos.x + fx * dist + rx * side, ty = hy + 0.12, tz = s.pos.z + fz * dist + rz * side;
    // never through a wall: pull in to whatever is between you
    const dx = tx - s.pos.x, dy = ty - hy, dz = tz - s.pos.z, n = Math.hypot(dx, dy, dz) || 1;
    const hit = AR.World.raycast(s.pos.x, hy, s.pos.z, dx / n, dy / n, dz / n, n);
    if (hit && hit.t < n) { const m = Math.max(0.9, hit.t - 0.3) / n; tx = s.pos.x + dx * m; ty = hy + dy * m; tz = s.pos.z + dz * m; }
    _cp.set(tx, ty, tz);
    const c = killcam; if (c.snap || !c.pos) { c.pos = _cp.clone(); c.snap = false; } else c.pos.lerp(_cp, 1 - Math.exp(-dt * 7));
    cam.position.copy(c.pos);
    cam.lookAt(_lk.set(s.pos.x, hy - 0.85, s.pos.z));
  }
  /** No player to look at (a fall, a streak, they left): rise over where you died. */
  function overCam(dt, k) {
    const cam = AR.camera, c = killcam, h = 2.5 + Math.min(1, k / 2) * 3;
    _cp.set(c.x + Math.sin(k * 0.3) * 3, c.y + h, c.z + Math.cos(k * 0.3) * 3);
    if (c.snap || !c.pos) { c.pos = _cp.clone(); c.snap = false; } else c.pos.lerp(_cp, 1 - Math.exp(-dt * 4));
    cam.position.copy(c.pos);
    cam.lookAt(_lk.set(c.x, c.y + 0.5, c.z));
  }
  function deathLabel() {
    const el = hudEl('kc'), c = killcam, r = c.num ? remotes.get(c.num) : null;
    const html = c.mode === 'clip' ? `<b>CLIP OF THE MATCH</b>${esc(nameOf(c.num))}` : r ? `<b>THE PLAYER WHO GOT YOU</b>${esc(r.name)}` : '<b>DOWN</b>NOBODY TO BLAME';
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
    el.style.display = 'block';
    // their health, live, on the respawn card: worth knowing if you want them back
    const hp = hud.querySelector('.resp .khp');
    if (hp && r?.cur) { const v = r.cur.f & 1 ? r.cur.hp : 0; hp.querySelector('i').style.width = v + '%'; hp.querySelector('span').textContent = (r.cur.f & 1) ? 'THEIR HEALTH ' + v + '%' : 'THEY ARE DOWN TOO'; }
  }

  /* ================================================================== HUD */
  const CSS = `
  :root{--pvp-ally:#4da6ff;--pvp-enemy:#ff3b5c}
  #arHud.pvp .tl,#arHud.pvp .style,#arHud.pvp .xp{display:none}
  /* where things sit, top to bottom: score bar; objective line; match announcements (banner, then toasts); medals;
     the crosshair with points just under it; objective status; the host's subtitles at the bottom. Nothing shares a band. */
  #arHud.pvp .banner{top:90px}#arHud.pvp .banner .bm{font-size:30px}#arHud.pvp .banner .bsu{font-size:12px;margin-top:2px}
  #arHud.pvp .toast{top:160px}#arHud.pvp .toast div{font-size:16px}
  #arHud.pvp .chat{top:auto;bottom:120px;right:14px;width:260px;max-height:160px;overflow:hidden}
  #pvpHud{position:fixed;inset:0;pointer-events:none;z-index:41;font-family:Consolas,'Lucida Console',monospace;color:#fff;text-transform:uppercase;letter-spacing:.06em;text-shadow:0 2px 0 #000}
  #pvpHud .sb{position:absolute;left:50%;top:10px;transform:translateX(-50%);display:flex;gap:10px;align-items:stretch}
  #pvpHud .sb .t{min-width:74px;text-align:center;padding:3px 10px;font-size:26px;font-weight:bold;background:rgba(0,0,0,.55);border-bottom:3px solid}
  #pvpHud .sb .t.a{border-color:var(--pvp-ally);color:var(--pvp-ally)}#pvpHud .sb .t.e{border-color:var(--pvp-enemy);color:var(--pvp-enemy)}
  #pvpHud .sb .m{text-align:center;font-size:12px;padding-top:2px;min-width:120px}#pvpHud .sb .m b{display:block;font-size:22px}
  #pvpHud .objl{position:absolute;left:50%;top:66px;transform:translateX(-50%);font-size:13px;color:#00e5ff;white-space:nowrap}
  #pvpHud .objl span{display:inline-block;width:22px;text-align:center;margin:0 3px;border:1px solid #fff;background:rgba(0,0,0,.5)}
  #pvpHud .objl span.ally{border-color:var(--pvp-ally);background:rgba(77,166,255,.45)}#pvpHud .objl span.enemy{border-color:var(--pvp-enemy);background:rgba(255,59,92,.45)}#pvpHud .objl span.cont{border-color:#ffd400}
  #pvpHud .feed{position:absolute;right:14px;top:14px;width:440px;font-size:15px;text-align:right}
  #pvpHud .feed div{margin-bottom:4px;background:rgba(0,0,0,.62);display:inline-block;padding:3px 10px;clear:both;float:right;white-space:nowrap;animation:pvpFeedIn .22s ease-out;border-right:3px solid rgba(255,255,255,.25);transition:opacity .5s}
  #pvpHud .feed div.mine{background:rgba(255,212,0,.24);border-right-color:#ffd400;box-shadow:0 0 12px rgba(255,212,0,.35)}
  #pvpHud .feed div.died{background:rgba(255,40,70,.28);border-right-color:var(--pvp-enemy)}
  #pvpHud .feed div.allyd{border-right-color:var(--pvp-ally)}
  #pvpHud .feed div.qf{border-right-color:#ff2bd6;box-shadow:0 0 16px rgba(255,43,214,.65)}
  #pvpHud .feed div.old{opacity:0}
  #pvpHud .feed .w{color:#c8c8d8;font-size:12px;margin:0 6px}#pvpHud .feed .hs{color:#ffd400}
  #pvpHud .feed .a{color:var(--pvp-ally)}#pvpHud .feed .e{color:var(--pvp-enemy)}#pvpHud .feed .me{color:#ffd400;font-weight:bold}
  @keyframes pvpFeedIn{0%{opacity:0;transform:translateX(30px)}100%{opacity:1;transform:none}}
  #pvpHud .medals{position:absolute;left:50%;top:196px;transform:translateX(-50%);display:flex;gap:14px;align-items:flex-start}
  #pvpHud .md{width:132px;text-align:center;animation:pvpMd .38s cubic-bezier(.2,1.6,.4,1);transition:opacity .35s,transform .35s}
  #pvpHud .md.out{opacity:0;transform:translateY(-12px) scale(.9)}
  #pvpHud .md svg{display:block;margin:0 auto 4px;filter:drop-shadow(0 0 10px rgba(0,229,255,.55))}
  #pvpHud .md.t2 svg{filter:drop-shadow(0 0 10px rgba(57,255,138,.55))}#pvpHud .md.t3 svg{filter:drop-shadow(0 0 12px rgba(255,180,0,.6))}
  #pvpHud .md.t4 svg{filter:drop-shadow(0 0 14px rgba(255,43,214,.65))}#pvpHud .md.t5 svg,#pvpHud .md.t6 svg{filter:drop-shadow(0 0 16px rgba(255,255,255,.7))}
  #arResults .pvpres .mds{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:8px 0}#arResults .pvpres .mds div{width:84px;text-align:center;font-size:9px;line-height:1.2}
  #arResults .pvpres .mds svg{display:block;margin:0 auto 2px}
  #pvpHud .md b{display:block;font-size:14px;color:#fff;letter-spacing:.08em}#pvpHud .md small{display:block;font-size:9px;opacity:.75;margin-top:2px}
  @keyframes pvpMd{0%{opacity:0;transform:scale(1.9)}100%{opacity:1;transform:none}}
  #pvpHud .pts{position:absolute;left:50%;top:calc(50% + 20px);transform:translateX(-50%);text-align:center;font-weight:bold;pointer-events:none}
  #pvpHud .pts .tot{display:block;font-size:24px;color:#ffd400;text-shadow:0 0 12px rgba(255,212,0,.55),0 2px 0 #000}
  #pvpHud .pts .tot.pop{animation:pvpPop .25s ease-out}
  #pvpHud .pts .ln{display:block;font-size:13px;color:#fff;margin-top:2px}#pvpHud .pts .ln.k{color:var(--pvp-enemy);font-size:15px}
  #pvpHud .pts.fade{opacity:0;transition:opacity .4s}
  @keyframes pvpPop{0%{transform:scale(1.45)}100%{transform:none}}
  #pvpHud .ost{position:absolute;left:50%;top:71%;transform:translateX(-50%);text-align:center;min-width:300px;display:none}
  #pvpHud .ost b{display:block;font-size:22px;letter-spacing:.12em}#pvpHud .ost small{display:block;font-size:12px;margin-top:3px;opacity:.9}
  #pvpHud .ost .pb{height:8px;margin:6px auto 0;width:280px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.4)}#pvpHud .ost .pb i{display:block;height:100%;background:currentColor}
  #pvpHud .ost.good{color:var(--pvp-ally)}#pvpHud .ost.good b{animation:pvpPulse 1s infinite}#pvpHud .ost.cont{color:#ffd400}#pvpHud .ost.cont b{animation:pvpBlink .5s infinite}
  #pvpHud .ost.cap{color:#fff}#pvpHud .ost.bad{color:var(--pvp-enemy)}#pvpHud .ost.use{color:#fff}
  @keyframes pvpPulse{50%{text-shadow:0 0 16px currentColor,0 2px 0 #000}}@keyframes pvpBlink{50%{opacity:.35}}
  #pvpHud .sb .t{position:relative}#pvpHud .sb .t.bump{animation:pvpPop .3s ease-out}
  #pvpHud .sb .t s{position:absolute;left:0;bottom:-7px;height:3px;background:currentColor;opacity:.8;text-decoration:none}
  #pvpHud .mm{position:absolute;left:14px;top:14px;width:168px;height:168px;border:1px solid rgba(255,255,255,.35);background:rgba(5,4,12,.55);border-radius:50%;overflow:hidden}
  #pvpHud .strk{position:absolute;left:18px;bottom:122px;font-size:12px;line-height:1.75}
  #pvpHud .strk div{opacity:.55}#pvpHud .strk div.r{opacity:1;color:#ffd400;text-shadow:0 0 8px #ffd400}
  #pvpHud .strk .spts{color:#00e5ff;opacity:1;font-size:12px}
  #arHud.pvp .pips{display:none}#arHud.pvp:not(.classic) .bar.ar{display:none}#arHud.pvp.classic .bar.ar i{background:#7a5bff}
  #pvpHud .resp .fl{font-size:10px;opacity:.6;margin-bottom:0}
  #pvpHud .resp{position:absolute;left:50%;bottom:138px;transform:translateX(-50%);text-align:center;display:none;pointer-events:auto;background:rgba(5,4,12,.66);padding:10px 18px;border:1px solid rgba(255,255,255,.2)}
  #pvpHud .resp h2{margin:0;font-size:22px;color:var(--pvp-enemy)}#pvpHud .resp .s{font-size:12px;opacity:.85;margin:4px 0}
  #pvpHud .resp .cls{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:8px;max-width:680px}
  #pvpHud .resp .cl{font-size:11px;opacity:.8;margin-top:6px;text-transform:none;letter-spacing:.02em}
  #pvpHud .resp button{font:inherit;font-size:11px;background:#16122a;color:#fff;border:1px solid #6b5aa8;padding:5px 9px;cursor:pointer;text-transform:uppercase}
  #pvpHud .resp button.on{border-color:#ffd400;color:#111;background:#ffd400}
  #pvpHud .kc{position:absolute;left:0;right:0;top:96px;text-align:center;font-size:20px;display:none;color:#fff;letter-spacing:.1em}
  #pvpHud .kc b{display:block;width:max-content;margin:0 auto 4px;background:#e0003c;color:#fff;padding:1px 10px;font-size:12px}
  #pvpHud .resp .khp{width:240px;margin:6px auto 2px;font-size:11px}#pvpHud .resp .khp div{height:6px;background:rgba(255,255,255,.15);margin-top:2px}#pvpHud .resp .khp i{display:block;height:100%;background:var(--pvp-enemy)}
  #pvpHud .flash{position:absolute;inset:0;background:#fff;opacity:0;overflow:hidden}
  #pvpHud .flash i{position:absolute;width:280px;padding:10px 12px;background:#fff;color:#111;border:2px solid #ccc;font-style:normal;font-size:13px;text-transform:none;text-shadow:none;box-shadow:0 6px 20px rgba(0,0,0,.25);border-radius:10px}
  #pvpHud .black{position:absolute;inset:0;background:#000;opacity:0;display:flex;align-items:center;justify-content:center;font-size:20px;color:#00e5ff}
  #pvpHud .stun{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,229,255,0) 40%,rgba(0,229,255,.35));opacity:0}
  #pvpHud .board{position:absolute;left:50%;top:14%;transform:translateX(-50%);min-width:560px;background:rgba(5,4,12,.86);border:1px solid rgba(255,255,255,.25);padding:10px 14px;display:none;font-size:13px}
  #pvpHud .board table{width:100%;border-collapse:collapse}#pvpHud .board td,#pvpHud .board th{padding:2px 8px;text-align:right}#pvpHud .board td:first-child,#pvpHud .board th:first-child{text-align:left}
  #pvpHud .board tr.me td{color:#ffd400}#pvpHud .board tr.a td:first-child{color:var(--pvp-ally)}#pvpHud .board tr.e td:first-child{color:var(--pvp-enemy)}
  #pvpHud .pg{position:absolute;left:50%;top:28%;transform:translateX(-50%);font-size:34px;color:#00e5ff;font-weight:bold;display:none;text-align:center}
  #pvpHud .pg small{display:block;font-size:13px;color:#fff;opacity:.85}
  #pvpHud .tags{position:absolute;inset:0}
  .pvptag{position:absolute;transform:translate(-50%,-100%);font-size:11px;text-align:center;white-space:nowrap}
  .pvptag i{display:block;height:3px;background:#39ff8a;margin:2px auto 0;max-width:46px}
  .pvptag u{display:block;text-decoration:none;font-size:9px;color:#ffd400}
  #pvpHud .tb{position:absolute;right:16px;bottom:150px;display:none;flex-direction:column;gap:8px;pointer-events:auto}
  #pvpHud .tb button{width:62px;height:62px;border-radius:50%;background:rgba(20,16,40,.6);border:2px solid rgba(255,255,255,.35);color:#fff;font:inherit;font-size:10px}
  #pvpHud.touch .tb{display:flex}
  #arHud .wps .wp.pvpwp span{background:rgba(0,0,0,.55);padding:0 4px}#arHud .wps .wp.ally span{color:var(--pvp-ally)}#arHud .wps .wp.enemy span{color:var(--pvp-enemy)}
  #arResults .pvpres{max-width:880px}
  #arResults .pvpres table td{padding:2px 8px}#arResults .pvpres tr.me td{color:#ffd400}#arResults .pvpres .rw{margin:10px 0;line-height:1.7;font-size:13px}
  #arResults .pvpres .rw b{color:#00e5ff}
  `;
  let mm = null, mmx = null;
  function buildHud() {
    if (!document.getElementById('pvpCss')) { const st = document.createElement('style'); st.id = 'pvpCss'; st.textContent = CSS; document.head.appendChild(st); }
    hud = document.createElement('div'); hud.id = 'pvpHud';
    hud.innerHTML = `<div class="tags"></div><div class="sb"><div class="t a"><span>0</span><s></s></div><div class="m"><b>10:00</b><span class="mn"></span></div><div class="t e"><span>0</span><s></s></div></div>
      <div class="objl"></div><div class="feed"></div><canvas class="mm" width="168" height="168"></canvas><div class="strk"></div><div class="pts"></div><div class="pg"></div>
      <div class="medals"></div><div class="ost"></div>
      <div class="kc"><b>KILLCAM</b><span></span></div><div class="resp"></div><div class="board"></div>
      <div class="stun"></div><div class="flash"></div><div class="black">THE SERVERS HAVE BEEN WIPED. PLEASE HOLD.</div>
      <div class="tb"><button data-k="tac">TACTICAL</button><button data-k="streak">STREAK</button><button data-k="board">SCORE</button></div>`;
    document.body.appendChild(hud);
    document.getElementById('arHud')?.classList.add('pvp');
    document.getElementById('arHud')?.classList.toggle('classic', playlist === 'classic');
    const arl = document.querySelector('#arHud .bar.ar span'); if (arl) arl.textContent = playlist === 'classic' ? 'SHIELD' : 'ARMOR';
    mm = hud.querySelector('.mm'); mmx = mm.getContext('2d');
    if (AR.Touch?.on || matchMedia('(pointer: coarse)').matches) hud.classList.add('touch');
    hud.querySelector('.tb').addEventListener('pointerdown', e => {
      const k = e.target.dataset.k; if (!k) return; e.preventDefault();
      if (k === 'tac') AR.Pvp.nade(true); else if (k === 'streak') AR.Player.input.streak = 9; else { scoreOpen = !scoreOpen; }
    });
    addEventListener('keydown', onKey, true); addEventListener('keyup', onKeyUp, true);
  }
  const hudEl = c => hud.querySelector('.' + c);
  function onKey(e) {
    if (!AR.Pvp.on) return;
    if (e.code === 'Tab') { scoreOpen = true; e.preventDefault(); }
    if (dead && e.code === 'Space') send({ t: 'skip' });
    if (dead && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { stepClass(e.code === 'ArrowLeft' ? -1 : 1); e.preventDefault(); }
    if (e.code === 'KeyE') AR.Player.input.useHold = true;
    if (e.code === 'KeyE' && !e.repeat) send({ t: 'use' });
  }
  function onKeyUp(e) { if (e.code === 'Tab') scoreOpen = false; if (e.code === 'KeyE') AR.Player.input.useHold = false; }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function fmtT(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  const WNAME = { melee: 'MELEE', world: 'THE WORLD', fall: 'GRAVITY', wipe: 'SERVER WIPE', throwknife: 'KNIFE', frag: 'FRAG', sticky: 'STICKY AD', popup: 'POP-UP', charge: 'THE CHARGE', broadcaster: 'AD BROADCASTER', sponsored: 'SPONSORED DRONE', gunship: 'GUNSHIP' };
  // placeholder gun names are written "[BURST RIFLE]": drop the brackets so the feed does not show [[BURST RIFLE]]
  const wName = w => (PVP.GUNS[w]?.name || WNAME[w] || String(w).toUpperCase()).replace(/"/g, '').replace(/^\[(.*)\]$/, '$1');
  /** The kill feed: who killed whom with what. Your kills light up gold; four in a row unbroken is a QUAD FEED. */
  function feed(v) {
    const box = hudEl('feed'), d = document.createElement('div');
    const cls = n => (n === me ? 'me' : mode.teams === 2 && teamOf(n) === myTeam ? 'a' : 'e');
    const helped = (v.a || []).includes(me) && v.k !== me ? ' <span class="me">+ YOU</span>' : '';
    d.innerHTML = v.k && v.k !== v.v ? `<span class="${cls(v.k)}">${esc(nameOf(v.k))}</span>${helped}<span class="w">[${esc(wName(v.w))}]${v.h ? ' <span class="hs">⊕</span>' : ''}</span><span class="${cls(v.v)}">${esc(nameOf(v.v))}</span>`
      : `<span class="${cls(v.v)}">${esc(nameOf(v.v))}</span><span class="w">[${esc(wName(v.w))}]</span>`;
    if (v.k === me && v.v !== me) d.classList.add('mine');
    else if (v.v === me) d.classList.add('died');
    else if (mode.teams === 2 && teamOf(v.v) === myTeam) d.classList.add('allyd');
    box.prepend(d);
    if (v.k === me && v.v !== me) { feedRun++; if (feedRun === 4) medal('quadFeed'); if (feedRun === 8) medal('fullFeed'); } else feedRun = 0;
    if (feedRun >= 4) [...box.children].slice(0, feedRun).forEach(x => x.classList.add('qf'));
    while (box.children.length > 7) box.lastChild.remove();
    setTimeout(() => d.classList.add('old'), 8000); setTimeout(() => d.remove(), 8600);
  }
  /** Centre of the screen: a running points total for this burst of play, with the reasons under it. */
  const WHY = { kill: '', head: 'HEADSHOT', assist: 'ASSIST', longshot: 'LONGSHOT', endStreak: 'STREAK ENDED', firstBlood: 'FIRST BLOOD', capture: 'CAPTURE', defend: 'DEFENDED', harvest: 'HARVESTED',
    deny: 'DENIED', hill: 'HILL TIME', plant: 'PLANTED', defuse: 'DEFUSED', flagCap: 'FLAG CAPTURE', flagReturn: 'FLAG RETURN', flagTake: 'FLAG TAKEN', ball: 'HOLDING THE HOT TAKE', shootDown: 'SHOT DOWN',
    survive: 'SURVIVED', infect: 'INFECTED', influencerKill: 'INFLUENCER DOWN' };
  const PTS_MEDAL = new Set(['head', 'longshot', 'endStreak', 'firstBlood', 'capture', 'defend', 'plant', 'defuse', 'flagCap', 'flagReturn', 'harvest', 'shootDown', 'influencerKill']);
  function popPts(n, why) {
    const now = performance.now();
    if (now - ptsRun.at > 2400) { ptsRun.n = 0; ptsRun.lines = []; }
    ptsRun.n += n; ptsRun.at = now;
    if (why === 'hill' || why === 'ball') { AR.PvpAudio.ui('tick'); hillRun += n; }
    const label = WHY[why] ?? '';
    if (label) {
      const same = ptsRun.lines.find(l => l.why === why);
      if (same) same.n += n; else ptsRun.lines.unshift({ why, txt: label, n });
      ptsRun.lines = ptsRun.lines.slice(0, 4);
    }
    if (PTS_MEDAL.has(why)) medal(why);
    drawPts(true);
  }
  function confirmLine(v) {
    ptsRun.lines.unshift({ why: 'k' + v.v, txt: 'ELIMINATED ' + nameOf(v.v), n: 0, kill: true });
    ptsRun.lines = ptsRun.lines.slice(0, 4); ptsRun.at = performance.now();
    drawPts(false);
  }
  function drawPts(pop) {
    const box = hudEl('pts');
    box.classList.remove('fade');
    box.innerHTML = (ptsRun.n ? `<span class="tot${pop ? ' pop' : ''}">+${ptsRun.n}</span>` : '') + ptsRun.lines.map(l => `<span class="ln${l.kill ? ' k' : ''}">${esc(l.txt)}${l.n ? ' +' + l.n : ''}</span>`).join('');
  }
  /** A medal pops up top centre with its own sound. They queue a moment apart so a big multikill reads as a run. */
  function medal(id) { if (PVP.MEDALS[id]) { medalQ.push(id); medalCount[id] = (medalCount[id] || 0) + 1; } }
  let medalT = 0;
  function medalTick(dt) {
    medalT -= dt;
    if (medalT > 0 || !medalQ.length) return;
    const id = medalQ.shift(), M = PVP.MEDALS[id], box = hudEl('medals'), d = document.createElement('div');
    d.className = 'md t' + M.tier; d.innerHTML = `${window.PvpMedalIcons ? PvpMedalIcons.svg(id, 64) : '<i></i>'}<b>${esc(M.name)}</b><small>${esc(M.d)}</small>`;
    box.prepend(d); while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 2700); setTimeout(() => d.remove(), 3100);
    AR.PvpAudio.ui('medal', M.tier);
    if (M.tier >= 3) window.Pad?.rumble(0.3, 0.7, 160);
    medalT = 0.28;
  }
  const G = (a) => (window.Glyph ? Glyph.act(a, 'pvp') : '[' + a + ']');
  const classChange = () => playlist === 'core' && mode.playlist !== 'party' && !['gungame', 'infection', 'influencer'].includes(mode.id);
  function showRespawn(v, again) {
    const box = hudEl('resp');
    hud.classList.add('dead'); lastDeath = v;
    const list = PvpProgress.classes(), cur = O.cls || 0;
    const c = list[cur], line = c ? `${wName(c.primary)} + ${wName(c.secondary)}` : '';
    const classPick = classChange() ? `<div class="s">${G('classPrev')} ${G('classNext')} CHANGE CLASS — APPLIES NEXT LIFE</div><div class="cls">${list.map((c2, i) => `<button data-i="${i}" class="${i === cur ? 'on' : ''}">${esc(c2.name)}</button>`).join('')}</div><div class="cl">${esc(line)}</div>` : '';
    box.innerHTML = `<h2>${v.k && v.k !== me ? 'KILLED BY ' + esc(nameOf(v.k)) : 'YOU DIED'}</h2><div class="s">${v.k && v.k !== me ? 'WITH THE ' + esc(wName(v.w)) + (v.h ? ' // HEADSHOT' : '') : ''}</div>
      ${v.k && v.k !== me && remotes.has(v.k) ? '<div class="khp"><span>THEIR HEALTH</span><div><i></i></div></div>' : ''}
      <div class="s rs"></div>${classPick}`;
    box.querySelectorAll('.cls button').forEach(b => b.onclick = () => pickClass(+b.dataset.i));
    box.style.display = 'block';
    if (!again) respawnAt = performance.now() + ((mode.respawn || 3) + 0.2) * 1000;
    box.querySelector('.rs')._h = '';
  }
  function pickClass(i) {
    const list = PvpProgress.classes(); i = (i + list.length) % list.length;
    O.cls = i; send({ t: 'class', i });
    const box = hudEl('resp');
    box.querySelectorAll('.cls button').forEach(x => x.classList.toggle('on', +x.dataset.i === i));
    const c = list[i], cl = box.querySelector('.cl'); if (cl && c) cl.textContent = wName(c.primary) + ' + ' + wName(c.secondary);
    AR.Sfx.ui?.('hover');
  }
  const stepClass = d => { if (classChange()) pickClass((O.cls || 0) + d); };
  /** Change class from the pause menu at any time: at once if you have only just spawned and not fired, else next life. */
  function decoratePause() {
    const ov = document.getElementById('arPause'); if (!ov || !AR.Pvp.on) return;
    const list = PvpProgress.classes(), cur = O.cls || 0;
    const ctl = ov.querySelector('div[style]');
    if (ctl) ctl.innerHTML = pvpControls();
    const h2 = ov.querySelector('h2'); if (h2 && T.kind === 'online') h2.textContent = 'THE MATCH IS STILL RUNNING';
    if (classChange()) {
      const box = document.createElement('div'); box.className = 'pcls';
      box.innerHTML = `<div style="font-size:12px;margin:8px 0 4px">CHANGE CLASS — APPLIES NEXT LIFE (AT ONCE IF YOU JUST SPAWNED AND HAVE NOT FIRED)</div><div class="arbtns" style="flex-wrap:wrap">${list.map((c, i) => `<button class="arbtn${i === cur ? ' y' : ''}" data-pcls="${i}">${esc(c.name)}</button>`).join('')}</div>`;
      ov.querySelector('.arbtns')?.before(box);
      box.querySelectorAll('[data-pcls]').forEach(b => b.onclick = () => { pickClass(+b.dataset.pcls); box.querySelectorAll('[data-pcls]').forEach(x => x.classList.toggle('y', x === b)); });
    }
    const q = ov.querySelector('#arQuit'); if (q) q.textContent = 'LEAVE MATCH';
  }
  function pvpControls() {
    const rows = [['fire', 'FIRE'], ['ads', 'AIM'], ['reload', 'RELOAD'], ['use', 'HOLD TO USE / PLANT / DEFUSE'], ['swap', 'SWAP'], ['lethal', 'LETHAL'], ['tactical', 'TACTICAL'], ['melee', 'MELEE'],
      ['jump', 'JUMP'], ['crouch', 'CROUCH / SLIDE'], ['sprint', 'SPRINT'], ['streak1', 'STREAK 1'], ['streak2', 'STREAK 2'], ['streak3', 'STREAK 3'], ['score', 'SCOREBOARD']];
    return rows.map(([a, n]) => `<span style="display:inline-block;min-width:200px;margin:2px 6px">${G(a)} ${n}</span>`).join('');
  }
  function hudMe(m) {
    const strk = hudEl('strk');
    if (myStreaks.length && mode.streakMax > 0) {
      const loyal = spawnInfo?.loadout?.perks?.includes('loyalty') ? 100 : 0;
      const html = `<div class="spts">${m.sp} POINTS // ${G('lethal')} ${m.n} LETHAL // ${G('tactical')} ${m.tc} TACTICAL</div>` + myStreaks.map((id, i) => { const S = PVP.STREAKS[id], c = Math.max(100, S.pts - loyal); return `<div class="${streakReady.includes(id) ? 'r' : ''}">${G('streak' + (i + 1))} ${S.name.replace(/"/g, '').replace('ORACULAR SYSTEMS ', '')} ${streakReady.includes(id) ? '// READY' : c}</div>`; }).join('');
      if (strk._h !== html) { strk.innerHTML = html; strk._h = html; }
    } else { const h = `<div class="spts">${G('lethal')} ${m.n} LETHAL // ${G('tactical')} ${m.tc} TACTICAL</div>`; if (strk._h !== h) { strk.innerHTML = h; strk._h = h; } }
    if (dead) { const rs = hudEl('resp').querySelector('.rs'); if (rs) { const h = m.rs > 0 ? 'REVIVED IN ' + m.rs.toFixed(1) + (mode.rounds ? '' : ' // ' + G('skip') + ' SKIP') : 'REVIVING…'; if (rs._h !== h) { rs.innerHTML = h; rs._h = h; } } }
  }
  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  /** The objective box under the crosshair. It answers "am I playing the objective right?" at a glance. */
  function objHud(s) {
    const box = hudEl('ost'), ob = s.ob, p = P();
    let st = null; useHint = null;
    if (p && !dead && s.st !== 'pregame') {
      const pos = p.body.pos, near = (x, y, z, r) => Math.hypot(pos.x - x, pos.z - z) < r && Math.abs(pos.y - y) < 3;
      if (ob?.k === 'hill' && near(ob.p[0], ob.p[1], ob.p[2], 5)) {
        st = ob.o === -2 ? { c: 'cont', b: 'CONTESTED', m: 'CLEAR THEM OUT TO SCORE', k: 'cont' } : ob.o === myTeam ? { c: 'good', b: 'IN THE HILL // SCORING', m: '+' + PVP.POINTS.hillSec + ' A SECOND // YOUR HILL TIME +' + hillRun, k: 'held' } : { c: 'bad', b: 'IN THE HILL', m: 'HOLD IT', k: 'in' };
      } else if (ob?.k === 'hill') hillRun = 0;
      if (ob?.k === 'dom') for (const [id, x, y, z, owner, prog, cont] of ob.f) {
        if (!near(x, y, z, 4.2)) continue;
        const ours = myTeam === 0 ? (1 - prog) / 2 : (prog + 1) / 2;          // 0: theirs .. 1: ours
        st = cont ? { c: 'cont', b: 'CONTESTED // ' + id, m: 'NOBODY CAPTURES WHILE BOTH TEAMS ARE ON IT', bar: ours, k: 'cont' } : owner === myTeam ? { c: 'good', b: 'DEFENDING ' + id, m: 'YOUR TEAM SCORES WHILE IT IS YOURS', k: 'def' }
          : { c: 'cap', b: 'CAPTURING ' + id, m: Math.round(ours * 100) + '%', bar: ours, k: 'cap' + id };
        break;
      }
      if (ob?.k === 'ball' && ob.c === me) st = { c: 'good', b: 'YOU HAVE THE HOT TAKE', m: 'EVERYONE CAN SEE YOU // +' + hillRun, k: 'ball' };
      if (ob?.k === 'ctf' && ob.f.some(f => f[5] === me)) st = { c: 'good', b: 'YOU HAVE THEIR FLAG', m: 'BRING IT HOME', k: 'flag' };
      if (ob?.k === 'snd') {
        const uh = s.me?.uh || 0, att = ob.att === myTeam;
        if (uh > 0) { const need = ob.pl ? mode.defuseTime : mode.plantTime; st = { c: 'cap', b: ob.pl ? 'DEFUSING' : 'PLANTING', m: Math.round(uh / need * 100) + '%', bar: uh / need, k: 'uh' }; }
        else if (att && ob.bc === me && !ob.pl && ob.sites.some(x => near(x[0], x[1], x[2], 3.2))) { useHint = 'plant'; st = { c: 'use', b: '{useHold} TO PLANT', m: 'SITE ' + 'AB'[ob.sites.findIndex(x => near(x[0], x[1], x[2], 3.2))], k: 'plant' }; }
        else if (!att && ob.pl && near(ob.sites[ob.pl.site][0], ob.sites[ob.pl.site][1], ob.sites[ob.pl.site][2], 2.2)) { useHint = 'defuse'; st = { c: 'use', b: '{useHold} TO DEFUSE', m: Math.ceil(ob.pl.left) + 'S LEFT', k: 'defuse' }; }
        else if (att && ob.bc === me) st = { c: 'good', b: 'YOU CARRY THE CHARGE', m: 'TAKE IT TO SITE A OR B', k: 'carry' };
      }
      if (!st) {                                                               // a weapon on the floor to swap for
        let best = null, bd = 1.8;
        for (const o of objs.items.values()) { if (o.kind !== 'weapon') continue; const d = Math.hypot(o.x - pos.x, o.z - pos.z); if (d < bd && Math.abs(o.y - pos.y) < 2) { bd = d; best = o; } }
        if (best) { useHint = 'pickup'; st = { c: 'use', b: '{use} PICK UP ' + wName(best.extra), m: 'SWAPS FOR THE GUN IN YOUR HANDS', k: 'pick' + best.extra }; }
      }
    }
    // sounds when the state changes under you
    const key = st?.k || '';
    if (objIn !== key) {
      if (key === 'cont' && objIn) AR.PvpAudio.ui('contested');
      objIn = key;
    }
    if (st?.bar !== undefined && st.k.startsWith('cap')) { const step = Math.floor(st.bar * 10); if (box._step !== undefined && step > box._step) AR.PvpAudio.ui('capTick', st.bar); box._step = step; } else box._step = undefined;
    const html = st ? `<b>${window.Glyph ? Glyph.text(st.b) : esc(st.b)}</b><small>${esc(st.m)}</small>${st.bar !== undefined ? `<div class="pb"><i style="width:${Math.round(clamp(st.bar, 0, 1) * 100)}%"></i></div>` : ''}` : '';
    if (box._h !== html || box._c !== st?.c) { box.innerHTML = html; box._h = html; box._c = st?.c; box.className = 'ost' + (st ? ' ' + st.c : ''); box.style.display = st ? 'block' : 'none'; }
  }
  function hudTick(dt) {
    const s = snapLast; if (!s || !hud) return;
    const now = performance.now();
    // score bar
    const A = hud.querySelector('.sb .a'), E = hud.querySelector('.sb .e'), M = hud.querySelector('.sb .m b'), MN = hud.querySelector('.sb .mn');
    let mine = 0, theirs = 0;
    if (mode.teams === 2) { mine = s.ts[myTeam]; theirs = s.ts[1 - myTeam]; }
    else { const meRow = boardRows.find(r => r[0] === me); const top = boardRows.filter(r => r[0] !== me).sort((a, b) => b[1] - a[1])[0]; mine = mode.id === 'gungame' || mode.id === 'influencer' ? (s.me?.s || 0) : (meRow?.[1] ?? s.me?.k ?? 0); theirs = top?.[1] ?? 0; }
    if (mode.id === 'gungame') mine = (s.me?.gi ?? 0) + 1;
    A.firstChild.textContent = mine; E.firstChild.textContent = theirs;
    const lim = mode.limit || 0;
    if (lim && mode.teams === 2 && mode.id !== 'snd') { A.lastChild.style.width = Math.min(100, mine / lim * 100) + '%'; E.lastChild.style.width = Math.min(100, theirs / lim * 100) + '%'; }
    if (scoreSeen) { if (mine > scoreSeen[0]) bump(A); if (theirs > scoreSeen[1]) bump(E); }
    scoreSeen = [mine, theirs];
    M.textContent = s.st === 'pregame' ? 'WARMUP' : fmtT(s.tl);
    MN.textContent = mode.short + ' // ' + (mode.rounds ? 'ROUND ' + (s.ob?.r || 1) : 'TO ' + mode.limit);
    // what you are doing for the objective right now (in the hill, capturing, planting), and what you can use here
    objHud(s);
    medalTick(dt);
    if (ptsRun.lines.length || ptsRun.n) { if (now - ptsRun.at > 2400) { ptsRun.n = 0; ptsRun.lines = []; hudEl('pts').classList.add('fade'); } }
    // pregame countdown
    const pg = hudEl('pg');
    if (s.st === 'pregame' && s.pg > 0) { pg.style.display = 'block'; pg.innerHTML = 'LIVE IN ' + Math.ceil(s.pg) + '<small>' + mode.name + ' // ' + (PVP.MAPS[O.map]?.name || '') + '</small>'; } else pg.style.display = 'none';
    // objective line
    const ob = s.ob, ol = hudEl('objl');
    let oh = '';
    if (ob?.k === 'dom') oh = ob.f.map(([id, , , , o, , c]) => `<span class="${c ? 'cont' : o === myTeam ? 'ally' : o < 0 ? '' : 'enemy'}">${id}</span>`).join('');
    else if (ob?.k === 'hill') oh = 'HILL ' + (ob.o === myTeam ? '<b style="color:var(--pvp-ally)">HELD</b>' : ob.o === -2 ? '<b style="color:#ffd400">CONTESTED</b>' : ob.o < 0 ? 'EMPTY' : '<b style="color:var(--pvp-enemy)">THEIRS</b>') + ' // MOVES IN ' + ob.mv + 'S';
    else if (ob?.k === 'snd') oh = (ob.att === myTeam ? 'ATTACK' : 'DEFEND') + ' // ROUNDS ' + ob.rw[myTeam] + '–' + ob.rw[1 - myTeam] + (ob.pl ? ' // CHARGE ' + Math.ceil(ob.pl.left) + 'S' : '') + (s.me?.uh > 0 ? ' // ' + (ob.pl ? 'DEFUSING' : 'PLANTING') + ' ' + Math.round(s.me.uh / (ob.pl ? mode.defuseTime : mode.plantTime) * 100) + '%' : '');
    else if (ob?.k === 'inf') oh = (ob.started ? ob.surv + ' SURVIVORS' : 'SOMEONE IS ABOUT TO GO SERVERLESS…') + ' // ROUND ' + ob.r;
    else if (ob?.k === 'jugg') oh = ob.num ? (ob.num === me ? 'YOU ARE THE INFLUENCER' : 'INFLUENCER: ' + esc(nameOf(ob.num))) : 'PICKING AN INFLUENCER…';
    else if (ob?.k === 'gg') oh = 'GUN ' + ((s.me?.gi ?? 0) + 1) + ' / ' + PVP.GUNGAME.length + ' // ' + (PVP.GUNS[PVP.GUNGAME[s.me?.gi ?? 0]]?.name || '').replace(/"/g, '');
    else if (ob?.k === 'ctf') oh = 'CAPTURES ' + s.ts[myTeam] + '–' + s.ts[1 - myTeam];
    if (ol._h !== oh) { ol.innerHTML = oh; ol._h = oh; }
    // overlays
    const fk = flashUntil > now ? Math.min(1, (flashUntil - now) / 600) * flashK : 0;
    hudEl('flash').style.opacity = fk; if (fk <= 0 && hudEl('flash').children.length) hudEl('flash').innerHTML = '';
    hudEl('stun').style.opacity = stunUntil > now ? 1 : 0;
    hudEl('black').style.opacity = blackUntil > now ? 0.94 : 0;
    // scoreboard: TAB, or hold BACK (View / Create) on a controller
    const bd = hudEl('board'), board = scoreOpen || padBoard;
    bd.style.display = board ? 'block' : 'none';
    if (board) {
      const rows = boardRows.slice().sort((a, b) => b[4] - a[4]);
      const row = r => `<tr class="${r[0] === me ? 'me' : mode.teams === 2 ? (r[5] === myTeam ? 'a' : 'e') : ''}"><td>${esc(nameOf(r[0]))}${roster.get(r[0])?.bot ? ' <small>BOT</small>' : ''}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${((r[1] + 1) / (r[2] + 1)).toFixed(2)}</td></tr>`;
      const head = '<tr><th>' + (mode.name) + '</th><th>K</th><th>D</th><th>A</th><th>SCORE</th><th>RATIO</th></tr>';
      const html = mode.teams === 2 ? [myTeam, 1 - myTeam].map(t => `<table>${head.replace(mode.name, PVP.TEAM_NAMES[t] + ' — ' + s.ts[t])}${rows.filter(r => r[5] === t).map(row).join('')}</table>`).join('<br>') : `<table>${head}${rows.map(row).join('')}</table>`;
      if (bd._h !== html) { bd.innerHTML = html; bd._h = html; }
    }
    drawMinimap();
  }
  function notifications(k) {
    const box = hudEl('flash'); box.innerHTML = '';
    const lines = ['Your Joy™ subscription renews today.', 'Riya Vex is live: CONTROLLED RIOT', '3 people viewed your debt.', 'Your Outside+ trial has ended.', 'New login from your fridge.',
      'Bug protein is 20% off!', 'You have been rated 2★ by your couch.', 'Oracular Systems: you will do this again.', 'Server space price alert: +14%', 'A Cryptid liked your bench.', 'Reminder: smile for Cam 04.'];
    for (let i = 0; i < 9; i++) { const n = document.createElement('i'); n.textContent = AR.pick(lines); n.style.left = (Math.random() * 80) + '%'; n.style.top = (Math.random() * 85) + '%'; n.style.opacity = 0.6 + Math.random() * 0.4; box.appendChild(n); }  // NOSONAR
    void k;
  }
  function drawMinimap() {
    const p = P(), c = mmx, W = 168, R2 = 84, scale = 1.7; if (!c || !p) return;
    c.clearRect(0, 0, W, W);
    const jam = snapLast?.me?.jam;
    if (jam || blackUntil > performance.now()) { for (let i = 0; i < 400; i++) { c.fillStyle = Math.random() < 0.5 ? '#222' : '#555'; c.fillRect(Math.random() * W, Math.random() * W, 3, 3); } c.fillStyle = '#ff3b5c'; c.font = '11px monospace'; c.fillText('SCHEDULED DOWNTIME', 18, 88); return; }  // NOSONAR
    const ox = p.body.pos.x, oz = p.body.pos.z, yaw = p.yaw, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const to = (x, z) => { const dx = (x - ox) * scale, dz = (z - oz) * scale; return [R2 + dx * cs - dz * sn, R2 + dx * sn + dz * cs]; };
    const dot = (x, z, col, r = 3.5) => { const [a, b] = to(x, z); if (Math.hypot(a - R2, b - R2) > R2 - 3) return; c.fillStyle = col; c.beginPath(); c.arc(a, b, r, 0, 7); c.fill(); };
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(R2, R2, 40, 0, 7); c.stroke();
    const ob = objState;
    if (ob?.k === 'dom') for (const [id, x, , z, o] of ob.f) { const [a, b] = to(x, z); c.fillStyle = o === myTeam ? '#4da6ff' : o < 0 ? '#fff' : '#ff3b5c'; c.font = 'bold 12px monospace'; c.fillText(id, a - 4, b + 4); }
    if (ob?.k === 'hill') dot(ob.p[0], ob.p[2], '#ffd400', 6);
    if (ob?.k === 'ball') dot(ob.p[0], ob.p[2], '#ff7a1a', 5);
    for (const r of remotes.values()) {
      const s = r.cur; if (!s || !(s.f & 1)) continue;
      const ally = mode.teams === 2 && r.team === myTeam;
      if (ally) dot(s.pos.x, s.pos.z, '#4da6ff');
      else if (s.radar === 2) dot(s.pos.x, s.pos.z, '#ff3b5c');
    }
    for (const o of objs.ents.values()) dot(o.obj.position.x, o.obj.position.z, o.team === myTeam ? '#4da6ff' : '#ff3b5c', 5);
    const nowMs = performance.now();
    allyX = allyX.filter(x => nowMs - x.at < 6000);
    for (const x of allyX) {                                                   // a teammate died here
      const [a, b] = to(x.x, x.z); if (Math.hypot(a - R2, b - R2) > R2 - 4) continue;
      c.globalAlpha = 1 - (nowMs - x.at) / 6000; c.strokeStyle = '#9fd0ff'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(a - 4, b - 4); c.lineTo(a + 4, b + 4); c.moveTo(a + 4, b - 4); c.lineTo(a - 4, b + 4); c.stroke(); c.globalAlpha = 1; c.lineWidth = 1;
    }
    c.fillStyle = '#ffd400'; c.beginPath(); c.moveTo(R2, R2 - 7); c.lineTo(R2 - 5, R2 + 5); c.lineTo(R2 + 5, R2 + 5); c.fill();
  }

  /* ================================================================== the end: clip of the match, results, podium */
  function onEnd(res) {
    done = true; endInfo = res;
    AR.Player.clearInput();
    const pl = P(); if (pl) pl.alive = false;
    dead = true; hudEl('resp').style.display = 'none'; hud.classList.remove('dead');
    const won = mode.teams === 2 ? res.winnerTeam === myTeam : res.winner === me;
    AR.Hud.banner(won ? 'VICTORY' : res.winnerTeam === -1 && mode.teams === 2 ? 'DRAW' : 'DEFEAT', mode.teams === 2 ? PVP.TEAM_NAMES[myTeam] + ' ' + res.teamScore[myTeam] + ' — ' + res.teamScore[1 - myTeam] : (res.rows[0]?.name || '') + ' WINS', 3.5);
    // the clip of the match: the last kill from its killer's eyes
    if (lastKill && lastKill.k && remotes.has(lastKill.k) && estServer() - lastKill.at < 6) { killcam = { mode: 'clip', num: lastKill.k, from: lastKill.at - 3.4, to: lastKill.at + 0.4, t0: performance.now() + 1200, len: 3.8, snap: true }; AR.Player.spectate?.(true); }
    setTimeout(() => { killcam = null; AR.Player.spectate?.(false); podium(res); showResults(); }, killcam ? 5200 : 2500);
  }
  function podium(res) {
    const top = res.rows.slice(0, 3);
    const p = P(); if (!p) return;
    const base = p.body.pos.clone(), yaw = p.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    top.forEach((row, i) => {
      let av = null;
      if (window.AvatarKit?.loaded) { let L = null; try { L = row.look ? AvatarKit.decode(row.look) : null; } catch (e) { L = null; } if (!L && row.num === me) L = AvatarKit.load?.(); if (!L) L = AvatarKit.randomLoadout(row.num % 2 ? 'f' : 'm'); try { av = AvatarKit.create(L); } catch (e) { av = null; } }
      if (!av) return;
      const side = [0, -1.3, 1.3][i], up = [0.6, 0.3, 0][i];
      av.root.position.set(base.x + fx * 4 + rx * side, base.y + up, base.z + fz * 4 + rz * side);
      av.root.rotation.y = yaw; av.play(['Victory', 'Dance', 'Hype'][i] || 'Idle', 0);
      const ped = new THREE.Mesh(new THREE.BoxGeometry(1.1, up + 0.05, 1.1), mat([0xffd400, 0xc0c0c0, 0xcd7f32][i]));
      ped.position.set(av.root.position.x, base.y + up / 2, av.root.position.z);
      root.add(ped, av.root);
      podiumAvs.push(av);
    });
    p.pitch = -0.08;                                             // the player's camera already looks at the podium
  }
  function showResults() {
    results = true;
    const res = endInfo; if (!res) return;
    AR.unlockPointer();
    const ov = document.getElementById('arResults');
    const comm = id => PVP.COMMENDATIONS.find(c => c.id === id)?.name.replace(/"/g, '') || id;
    const rows = res.rows.map(r => `<tr class="${r.num === me ? 'me' : ''}"><td style="color:${mode.teams === 2 ? (r.team === myTeam ? 'var(--pvp-ally)' : 'var(--pvp-enemy)') : '#fff'}">${esc(r.name)}${r.bot ? ' <small>BOT</small>' : ''}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.assists}</td><td>${r.score}</td><td>${((r.kills + 1) / (r.deaths + 1)).toFixed(2)}</td><td style="font-size:10px">${r.comm.map(comm).join(', ')}</td></tr>`).join('');
    let rw = '<div class="rw">WAITING FOR REWARDS…</div>';
    if (reward) {
      if (!reward.banked) reward.summary = PvpProgress.apply(reward), reward.banked = true;
      const S = reward.summary, L = PvpProgress.levelInfo();
      const fee = (reward.revivals || 0) * PVP.REVIVAL_FEE;
      rw = `<div class="rw">+<b>${S.xp.toLocaleString('en-US')} XP</b>${S.dailyWin ? ' (FIRST WIN OF THE DAY x2)' : ''} // LEVEL <b>${L.level}</b>${L.maxed ? ' (MAX)' : ` — ${L.into.toLocaleString('en-US')} / ${L.need.toLocaleString('en-US')}`}<br>
        +<b>${S.drip} DRIP</b> // +<b>${S.gt} GIGATECH</b>${S.gtCapped ? ' (DAILY CAP REACHED)' : ''}${reward.solo ? ' // BOTS-ONLY MATCH: LESS XP, NO GIGATECH' : ''}${reward.custom ? ' // CUSTOM GAME: NO REWARDS' : ''}<br>
        ${S.unlocks.length ? 'UNLOCKED: <b>' + S.unlocks.map(u => u.name.replace(/"/g, '')).join(', ') + '</b><br>' : ''}${S.weapons.length ? 'WEAPON LEVELS: <b>' + S.weapons.map(w => PVP.GUNS[w.gun].name.replace(/"/g, '') + ' ' + w.level).join(', ') + '</b><br>' : ''}${S.camos.length ? 'CAMOS: <b>' + S.camos.map(c => PVP.GUNS[c.gun].name.replace(/"/g, '') + ' ' + PVP.CAMO[c.tier]).join(', ') + '</b><br>' : ''}
        REVIVAL FEES THIS MATCH: ¤${fee.toLocaleString('en-US')}. ADDED TO YOUR ESTATE.</div>`;
    }
    const meds = Object.entries(medalCount).sort((a, b) => PVP.MEDALS[b[0]].tier - PVP.MEDALS[a[0]].tier);
    if (meds.length) rw += `<div class="mds">${meds.map(([id, n]) => `<div>${window.PvpMedalIcons ? PvpMedalIcons.svg(id, 46) : ''}${esc(PVP.MEDALS[id].name)}${n > 1 ? ' x' + n : ''}</div>`).join('')}</div>`;
    const online = T.kind === 'online';
    ov.innerHTML = `<div class="arres pvpres"><h1 style="text-align:center">${mode.teams === 2 ? (res.winnerTeam === myTeam ? 'VICTORY' : res.winnerTeam < 0 ? 'DRAW' : 'DEFEAT') : (res.winner === me ? 'VICTORY' : 'GG')}</h1>
      <h2 style="text-align:center">${mode.name} // ${PVP.MAPS[res.map]?.name || res.map}${mode.teams === 2 ? ' // ' + res.teamScore[myTeam] + ' — ' + res.teamScore[1 - myTeam] : ''}</h2>
      <table><tr><td></td><td>K</td><td>D</td><td>A</td><td>SCORE</td><td>RATIO</td><td></td></tr>${rows}</table>${rw}
      <div class="arbtns" style="justify-content:center">${online ? '<button class="arbtn y" id="pvpBack">BACK TO LOBBY</button>' : '<button class="arbtn y" id="pvpAgain">PLAY AGAIN</button>'}<button class="arbtn" id="pvpQuit">LEAVE</button></div></div>`;
    ov.classList.add('on');
    const q = id => ov.querySelector('#' + id);
    if (q('pvpAgain')) q('pvpAgain').onclick = () => { ov.classList.remove('on'); O.onAgain?.(); };
    if (q('pvpBack')) q('pvpBack').onclick = () => { ov.classList.remove('on'); O.onLobby?.(); };
    q('pvpQuit').onclick = () => { ov.classList.remove('on'); O.onQuit?.(); };
  }

  /* ================================================================== the mission interface the arena expects */
  function padAt(x, y, z) {
    for (const m of AR.World.markers('pad')) if (Math.abs(x - m.pos[0]) < 1.0 && Math.abs(z - m.pos[2]) < 1.0 && y - m.pos[1] > -0.2 && y - m.pos[1] < 0.5) return m;
    return null;
  }
  function teleAt(x, y, z) {
    for (const m of AR.World.markers('tele')) if (Math.hypot(x - m.pos[0], z - m.pos[2]) < 0.9 && y - m.pos[1] > -0.3 && y - m.pos[1] < 0.8) return m;
    return null;
  }
  const noop = () => {};
  return {
    start, tick, dispose, waypoints, padAt, teleAt, decoratePause,
    style: noop, say: (w, t, d) => AR.Hud.say(w, t, d), onShot(g) { const k = g?.d ? Math.min(1, (g.d.dmg * (g.d.pellets || 1)) / 140) : 0.2; window.Pad?.rumble(0.08 + k * 0.5, 0.2 + k * 0.4, 45 + k * 60); if (window.VR?.active) VR.recoil(0.2 + k * 0.7); },
    onDamage: noop, onKill: noop, onHurt: noop, onDeath: noop, nearMiss: noop, addChips: noop, addDrip: noop, noteUnlock: noop, use: noop,
    summonAround: noop, bossPhase: noop, bossDead: noop, ringCrash: noop, nextBeatIn: () => 1, headline: noop, addXp: noop,
    dmgMult: () => 1, adrenal: () => 1, incomingMult: () => 1,
    get heat() { return 0; }, get heatMul() { return 1; }, get speedMul() { return 1; }, get fireMul() { return 1; }, get projMul() { return 1; }, get swarmSpeed() { return 1; },
    get rank() { return 0; }, get phase() { return done ? 'results' : 'pvp'; }, M: null, dev: {},
    get remotes() { return remotes; }, get me() { return me; }, get snap() { return snapLast; }, get transport() { return T; },
  };
})();
