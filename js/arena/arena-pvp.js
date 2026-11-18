/* EARTH 2049: SAVE SEED 7 — GIGALEAGUE in the arena runtime. While a PvP match is up, AR.PvpMission stands in for
 * AR.Mission (js/arena/arena-mission.js), and AR.Pvp is the small API js/arena/arena-player.js calls into.
 *
 * The match (js/pvp/pvp-sim.js, on the match server or in this browser) decides everything that matters. This file:
 *   - sends 30 inputs a second (position, look, stance), fires, reloads, swaps, melees, grenades, uses and streaks;
 *   - draws every other player 100 ms in the past from snapshot history (interpolation), as their Fitting Room avatar;
 *   - draws items, scorestreaks, projectiles, smoke and the mode's objectives;
 *   - runs the PvP HUD: score bar and timer, kill feed, minimap, streaks, respawn screen with class change, killcam,
 *     scoreboard (TAB), flash / stun / blackout overlays, the host's callouts, and the results screen with the podium.
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
  const INTERP = 0.1;
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
    Music.play?.('combat');
  }
  function dispose() {
    AR.Pvp.on = false;
    T?.off?.();
    if (T?.kind === 'local') T.close();
    window.GunFeel?.setFair?.(null);
    AR.Player.setProfile(null);
    for (const r of remotes.values()) { r.av?.dispose?.(); r.tag?.remove(); }
    remotes.clear();
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
    for (const [num, r] of remotes) if (!s.pl.some(x => x[0] === num)) { r.av?.root && (r.av.root.visible = false); r.tag?.remove(); r.av?.dispose?.(); remotes.delete(num); }
    if (s.me) applyMe(s.me);
    syncItems(s.it); syncEnts(s.en); syncProj(s.pr); syncSmoke(s.sm); syncObjectives(s.ob);
    // selfHist uses server time for the killcam
  }
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
      name: S.name.replace(/"/g, ''), tag: (S.standIn ? 'STAND-IN MODEL // ' : '') + S.cls.toUpperCase() + ' // ' + (S.burst ? S.burst + '-ROUND BURST' : S.rpm + ' RPM'),
      dmg: S.near[0], pellets: S.pellets, rpm: S.fire === 'burst' ? S.burstRpm : S.rpm, semi: S.fire === 'semi', mag: S.magSize, reserve: S.reserve, reload: (S.reloadT || 0.3) * sleight,
      spread: S.spread[0] * (1 + (S.mods?.spread || 0)), adsSpread: S.spread[1], adsTime: S.ads * (1 + (S.mods?.ads || 0)), kick: base.kick * recoil, kickYaw: base.kickYaw * recoil,
      burst: S.burst || 0, burstGap: S.fire === 'burst' ? 60 / S.rpm : 0, stf: S.stf, stfK: S.mods?.stf || 0, melee: !!S.melee, noZoom: !!S.noZoom, shellReload: !!S.shell || base.shellReload,
    });
    if (S.zoom) d.ads = 1 / S.zoom * 1.6;
    if (!S.proj) delete d.proj; else d.proj = Object.assign({}, base.proj || {}, { speed: S.proj.speed, grav: S.proj.grav, splash: S.proj.splash, life: S.proj.life, bounce: S.proj.bounce || 0 });
    return { id, vis, tier: tier || PvpProgress.camoOf(id), def: d };
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
    dead = false; killcam = null; spawnInfo = v;
    hud.classList.remove('dead'); hudEl('resp').style.display = 'none';
    AR.lockPointer();
    if (p && !v.keep) AR.Hud.toast('REVIVED', 'REVIVAL FEE ¤' + PVP.REVIVAL_FEE.toLocaleString('en-US') + ' ADDED TO YOUR ESTATE');
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
    const thick = spawnInfo?.loadout?.perks?.includes('thickskin') ? 0.5 : 1;
    AR.Player.addTrauma(Math.min(0.45, 0.1 + v.d / 70) * thick);
    p.punchVP += (Math.random() - 0.5) * 0.9 * thick; p.punchVY += (Math.random() - 0.5) * 0.9 * thick;       // NOSONAR — flinch
    p.hp = v.hp;
    window.Pad?.rumble(Math.min(1, 0.3 + v.d / 50), 0.45, 140);
    if (window.VR?.active) VR.hurt(Math.min(0.8, 0.2 + v.d / 50));
  }
  function onKillEv(v) {
    feed(v);
    lastKill = Object.assign({ at: estServer() }, v);
    const p = P();
    if (v.k === me && v.v !== me) {
      AR.Sfx.kill(v.s, v.h); AR.hitstop?.(0.04);
      if (chatOn) AR.Hud.chat(AR.pick(AR.CHAT_USERS), AR.pick(v.h ? AR.CHAT.head : v.s >= 3 ? AR.CHAT.multi : AR.CHAT.kill));
      if (v.s === 3 || v.s === 5 || v.s === 10) AR.Hud.toast('TRENDING x' + v.s, 'ENGAGEMENT IS UP');
    }
    if (v.v === me && p) {
      dead = true; deadAt = performance.now(); p.alive = false; killer = v.k && v.k !== me ? v.k : 0;
      AR.unlockPointer();
      if (chatOn) AR.Hud.chat(AR.pick(AR.CHAT_USERS), AR.pick(AR.CHAT.death));
      const rs = (mode.respawn || 3) + (spawnInfo?.loadout?.perks?.includes('bnpl') ? 1 : 0);
      if (killer && remotes.has(killer)) killcam = { num: killer, from: estServer() - Math.min(3.2, rs + 1), to: estServer(), t0: performance.now(), len: Math.min(3.2, rs + 0.6) };
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
    if (v.st === 'ready') { AR.Hud.toast('STREAK READY', PVP.STREAKS[v.id].name.replace(/"/g, '') + ' // PRESS ' + slotKey(v.id)); AR.Sfx.levelUp?.(); }
    if (v.st === 'used') {
      const S = PVP.STREAKS[v.id], mine = v.by === me, friendly = mode.teams === 2 ? v.team === myTeam : mine;
      AR.Hud.toast(mine ? 'STREAK ACTIVE' : friendly ? 'FRIENDLY ' + S.name.replace(/"/g, '') : 'ENEMY ' + S.name.replace(/"/g, ''), mine ? S.d : nameOf(v.by));
      if (v.id === 'wipe' && !friendly) AR.Hud.banner('SERVER WIPE INCOMING', 'TEN SECONDS. FIND GOD.', 4);
    }
  }
  function slotKey(id) { const i = myStreaks.indexOf(id); return i >= 0 ? '[' + (i + 3) + ']' : '[3]'; }
  function onObjEv(v) {
    const T2 = PVP.TEAM_NAMES;
    if (v.k === 'flag') AR.Hud.toast('FLAG ' + v.id, (v.owner === myTeam ? 'SECURED' : 'LOST') + ' // ' + T2[v.owner]);
    if (v.k === 'halftime') AR.Hud.banner('HALFTIME', 'SIDES SWITCH', 3);
    if (v.k === 'hill') AR.Hud.toast('HILL MOVED', 'GET TO IT');
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
    const r = { num, name: info.name || 'OPERATIVE', team: info.team ?? 0, bot: !!info.bot, buf: [], cur: null, anim: '', lastF: 0, stepT: 0 };
    let L = null;
    if (window.AvatarKit?.loaded) {
      try { L = info.look ? AvatarKit.decode(info.look) : null; } catch (e) { L = null; }
      if (!L) L = AvatarKit.randomLoadout(num % 2 ? 'f' : 'm');
      try { r.av = AvatarKit.create(L); r.av.play?.('Idle Combat', 0); } catch (e) { r.av = null; }
    }
    if (!r.av) {                                                 // no avatar kit: a capsule in team colours
      const g = new THREE.Group(), m = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.75, 8), new THREE.MeshLambertMaterial({ color: 0x8866cc }));
      m.position.y = 0.88; g.add(m); r.av = { root: g, update() {}, play() {}, dispose() {} };
    }
    root.add(r.av.root);
    // a gun carried at the chest, pointed where they aim
    r.gunPivot = new THREE.Group(); r.gunPivot.position.set(0.22, 1.32, 0); r.av.root.add(r.gunPivot);
    r.laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(), V3(0, 0, 40)]), new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.55 }));
    r.laser.visible = false; r.gunPivot.add(r.laser);
    r.tag = document.createElement('div'); r.tag.className = 'pvptag'; hudEl('tags').appendChild(r.tag);
    remotes.set(num, r);
    return r;
  }
  function setRemoteGun(r, w, tier) {
    const id = WEAPONS()[w] || 'pistol';
    if (r.gunId === id + ':' + tier) return;
    r.gunId = id + ':' + tier;
    if (r.gun) { r.gunPivot.remove(r.gun.root); r.gun = null; }
    const vis = PVP.GUNS[id]?.vis; if (!vis) return;
    const v = AR.Arsenal.build(vis, tier || 0); if (!v) return;
    v.root.scale.setScalar(1.05); v.root.rotation.set(0, 0, 0);
    r.gunPivot.add(v.root); r.gun = v;
  }
  /** a player's state at time t, from the snapshot buffer (linear between the two snapshots around t) */
  function sample(r, t) {
    const b = r.buf; if (!b.length) return null;
    let a = b[0], c = b[b.length - 1];
    if (t <= a[0]) c = a; else if (t >= c[0]) a = c;
    else for (let i = b.length - 1; i > 0; i--) if (b[i - 1][0] <= t) { a = b[i - 1]; c = b[i]; break; }
    const k = c[0] > a[0] ? clamp((t - a[0]) / (c[0] - a[0]), 0, 1) : 0;
    const L = (i) => a[i] + (c[i] - a[i]) * k;
    let dy = c[4] - a[4]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    return { pos: V3(L(1), L(2), L(3)), yaw: a[4] + dy * k, pitch: L(5), f: c[6], hp: c[7], w: c[8], team: c[9], radar: c[10], tier: c[11], sh: c[12], vx: (c[1] - a[1]) / Math.max(0.01, c[0] - a[0]), vz: (c[3] - a[3]) / Math.max(0.01, c[0] - a[0]) };
  }
  function drawRemotes(dt, t, hideNum) {
    const cam = AR.camera, w = innerWidth, h = innerHeight, pv = V3();
    for (const r of remotes.values()) {
      const s = sample(r, t); r.cur = s;
      const av = r.av; if (!av || !s) continue;
      const alive = !!(s.f & 1);
      av.root.visible = alive && r.num !== hideNum;
      if (!alive) { if (r.wasAlive) { AR.Fx.emit(AR.Fx.glow, s.pos.x, s.pos.y + 1, s.pos.z, r.team === myTeam && mode.teams === 2 ? 0x4da6ff : 0xff3b5c, 22, 4, 0.5); } r.wasAlive = false; r.tag.style.display = 'none'; continue; }
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
      const sp = Math.hypot(s.vx, s.vz), crouch = s.f & 2;
      const anim = !(s.f & 32) ? 'Jump' : crouch ? (sp > 0.6 ? 'Crouch Walk' : 'Crouch Idle') : sp > 5.2 ? 'Run' : sp > 0.6 ? 'Walk' : 'Idle Combat';
      if (anim !== r.anim) { r.anim = anim; av.play?.(anim, 0.15); }
      av.update?.(dt);
      // footsteps (not for NOISE-CANCELLING), and gunfire
      if ((s.f & 32) && sp > 2 && !(s.f & 8192)) { r.stepT -= dt * sp; if (r.stepT <= 0) { r.stepT = 2.6; footstep(s.pos, r.team !== myTeam || mode.teams !== 2); } }
      if ((s.f & 64) && !(r.lastF & 64)) remoteShot(r, s);
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
  function remoteShot(r, s) {
    const w = WEAPONS()[s.w], G = PVP.GUNS[w]; if (!G || G.melee) return;
    const o = V3(s.pos.x, s.pos.y + ((s.f & 2) ? 1.05 : 1.55), s.pos.z), d = window.PvpSim.dirFrom(s.yaw, s.pitch);
    const hit = AR.World.raycast(o.x, o.y, o.z, d[0], d[1], d[2], 120), t = hit ? hit.t : 120;
    AR.Fx.trace(o.x + d[0] * 0.6, o.y + d[1] * 0.6, o.z + d[2] * 0.6, o.x + d[0] * t, o.y + d[1] * t, o.z + d[2] * t, AR.GUNS[G.vis]?.tracer || 0xffe080, 0.06);
    AR.Fx.light(o.x + d[0] * 0.6, o.y, o.z + d[2] * 0.6, 0xffb060, 2, 7, 0.05);
    const cam = AR.camera.position, dist = cam.distanceTo(o);
    if (dist < 90 && !(r.quietShot)) AR.Sfx.enemyShot(o.x, o.y, o.z, G.cls === 'shotgun' || G.cls === 'sniper' ? 'heavy' : 'bolt');
  }
  function footstep(pos, enemy) {
    const c = AR.camera.position, d = c.distanceTo(pos);
    if (d > 28) return;
    AR.Sfx.step?.(enemy && d < 14);                               // enemy footsteps play louder than teammates' (CoD rule)
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
    // killcam: watch the last few seconds from the killer's eyes
    if (killcam) {
      const k = (performance.now() - killcam.t0) / 1000;
      if (k > killcam.len) killcam = null;
      else {
        const tt = killcam.from + k * ((killcam.to - killcam.from) / killcam.len);
        drawRemotes(rdt, tt, killcam.num);
        const r = remotes.get(killcam.num), s = r && sample(r, tt);
        if (s) { AR.camera.position.set(s.pos.x, s.pos.y + ((s.f & 2) ? 1.05 : 1.62), s.pos.z); AR.camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ'); }
        hudEl('kc').style.display = 'block';
      }
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

  /* ================================================================== HUD */
  const CSS = `
  :root{--pvp-ally:#4da6ff;--pvp-enemy:#ff3b5c}
  #arHud.pvp .tl,#arHud.pvp .style,#arHud.pvp .xp{display:none}
  #arHud.pvp .chat{top:auto;bottom:120px;right:14px;width:260px;max-height:160px;overflow:hidden}
  #pvpHud{position:fixed;inset:0;pointer-events:none;z-index:41;font-family:Consolas,'Lucida Console',monospace;color:#fff;text-transform:uppercase;letter-spacing:.06em;text-shadow:0 2px 0 #000}
  #pvpHud .sb{position:absolute;left:50%;top:10px;transform:translateX(-50%);display:flex;gap:10px;align-items:stretch}
  #pvpHud .sb .t{min-width:74px;text-align:center;padding:3px 10px;font-size:26px;font-weight:bold;background:rgba(0,0,0,.55);border-bottom:3px solid}
  #pvpHud .sb .t.a{border-color:var(--pvp-ally);color:var(--pvp-ally)}#pvpHud .sb .t.e{border-color:var(--pvp-enemy);color:var(--pvp-enemy)}
  #pvpHud .sb .m{text-align:center;font-size:12px;padding-top:2px;min-width:120px}#pvpHud .sb .m b{display:block;font-size:22px}
  #pvpHud .objl{position:absolute;left:50%;top:66px;transform:translateX(-50%);font-size:13px;color:#00e5ff;white-space:nowrap}
  #pvpHud .objl span{display:inline-block;width:22px;text-align:center;margin:0 3px;border:1px solid #fff;background:rgba(0,0,0,.5)}
  #pvpHud .objl span.ally{border-color:var(--pvp-ally);background:rgba(77,166,255,.45)}#pvpHud .objl span.enemy{border-color:var(--pvp-enemy);background:rgba(255,59,92,.45)}#pvpHud .objl span.cont{border-color:#ffd400}
  #pvpHud .feed{position:absolute;right:14px;top:14px;width:330px;font-size:12px;text-align:right}
  #pvpHud .feed div{margin-bottom:3px;background:rgba(0,0,0,.45);display:inline-block;padding:1px 6px;clear:both;float:right;animation:arIn .18s}
  #pvpHud .feed .a{color:var(--pvp-ally)}#pvpHud .feed .e{color:var(--pvp-enemy)}#pvpHud .feed .me{color:#ffd400}
  #pvpHud .mm{position:absolute;left:14px;top:14px;width:168px;height:168px;border:1px solid rgba(255,255,255,.35);background:rgba(5,4,12,.55);border-radius:50%;overflow:hidden}
  #pvpHud .strk{position:absolute;left:18px;bottom:122px;font-size:11px;line-height:1.5}
  #pvpHud .strk div{opacity:.55}#pvpHud .strk div.r{opacity:1;color:#ffd400;text-shadow:0 0 8px #ffd400}
  #pvpHud .strk .spts{color:#00e5ff;opacity:1;font-size:12px}
  #arHud.pvp .pips{display:none}#arHud.pvp:not(.classic) .bar.ar{display:none}#arHud.pvp.classic .bar.ar i{background:#7a5bff}
  #pvpHud .resp{position:absolute;left:50%;top:58%;transform:translateX(-50%);text-align:center;display:none;pointer-events:auto;background:rgba(5,4,12,.72);padding:14px 22px;border:1px solid rgba(255,255,255,.2)}
  #pvpHud .resp h2{margin:0;font-size:22px;color:var(--pvp-enemy)}#pvpHud .resp .s{font-size:12px;opacity:.85;margin:6px 0}
  #pvpHud .resp .cls{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:8px;max-width:640px}
  #pvpHud .resp button{font:inherit;font-size:11px;background:#16122a;color:#fff;border:1px solid #6b5aa8;padding:5px 9px;cursor:pointer;text-transform:uppercase}
  #pvpHud .resp button.on{border-color:#ffd400;color:#ffd400}
  #pvpHud .kc{position:absolute;left:0;right:0;top:0;text-align:center;font-size:14px;padding-top:96px;display:none;color:#ff2b4a}
  #pvpHud .kc b{background:#e0003c;color:#fff;padding:1px 8px;margin-right:8px}
  #pvpHud .flash{position:absolute;inset:0;background:#fff;opacity:0;overflow:hidden}
  #pvpHud .flash i{position:absolute;width:280px;padding:10px 12px;background:#fff;color:#111;border:2px solid #ccc;font-style:normal;font-size:13px;text-transform:none;text-shadow:none;box-shadow:0 6px 20px rgba(0,0,0,.25);border-radius:10px}
  #pvpHud .black{position:absolute;inset:0;background:#000;opacity:0;display:flex;align-items:center;justify-content:center;font-size:20px;color:#00e5ff}
  #pvpHud .stun{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,229,255,0) 40%,rgba(0,229,255,.35));opacity:0}
  #pvpHud .board{position:absolute;left:50%;top:14%;transform:translateX(-50%);min-width:560px;background:rgba(5,4,12,.86);border:1px solid rgba(255,255,255,.25);padding:10px 14px;display:none;font-size:13px}
  #pvpHud .board table{width:100%;border-collapse:collapse}#pvpHud .board td,#pvpHud .board th{padding:2px 8px;text-align:right}#pvpHud .board td:first-child,#pvpHud .board th:first-child{text-align:left}
  #pvpHud .board tr.me td{color:#ffd400}#pvpHud .board tr.a td:first-child{color:var(--pvp-ally)}#pvpHud .board tr.e td:first-child{color:var(--pvp-enemy)}
  #pvpHud .pts{position:absolute;left:50%;top:40%;transform:translateX(-50%);font-size:16px;color:#ffd400;font-weight:bold}
  #pvpHud .pts div{animation:pvpPts 1.1s forwards}
  @keyframes pvpPts{0%{opacity:0;transform:translateY(8px)}15%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0;transform:translateY(-14px)}}
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
    hud.innerHTML = `<div class="tags"></div><div class="sb"><div class="t a">0</div><div class="m"><b>10:00</b><span class="mn"></span></div><div class="t e">0</div></div>
      <div class="objl"></div><div class="feed"></div><canvas class="mm" width="168" height="168"></canvas><div class="strk"></div><div class="pts"></div><div class="pg"></div>
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
    if (dead && e.code === 'Space') { send({ t: 'skip' }); killcam = null; }
    if (dead && e.code === 'KeyC') hudEl('resp').querySelector('.cls')?.classList.toggle('open');
    if (e.code === 'KeyE') AR.Player.input.useHold = true;
    if (e.code === 'KeyE' && !e.repeat) send({ t: 'use' });
  }
  function onKeyUp(e) { if (e.code === 'Tab') scoreOpen = false; if (e.code === 'KeyE') AR.Player.input.useHold = false; }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function fmtT(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function feed(v) {
    const box = hudEl('feed'), d = document.createElement('div');
    const cls = n => (n === me ? 'me' : mode.teams === 2 && teamOf(n) === myTeam ? 'a' : 'e');
    const wname = (PVP.GUNS[v.w]?.name || { melee: 'MELEE', world: 'THE WORLD', fall: 'GRAVITY', wipe: 'SERVER WIPE', throwknife: 'KNIFE', frag: 'FRAG', sticky: 'STICKY AD', popup: 'POP-UP', charge: 'THE CHARGE', broadcaster: 'AD BROADCASTER', sponsored: 'SPONSORED DRONE', gunship: 'GUNSHIP' }[v.w] || String(v.w).toUpperCase()).replace(/"/g, '');
    d.innerHTML = v.k ? `<span class="${cls(v.k)}">${esc(nameOf(v.k))}</span> [${esc(wname)}${v.h ? ' ⊙' : ''}] <span class="${cls(v.v)}">${esc(nameOf(v.v))}</span>` : `<span class="${cls(v.v)}">${esc(nameOf(v.v))}</span> [${esc(wname)}]`;
    box.prepend(d);
    while (box.children.length > 6) box.lastChild.remove();
    setTimeout(() => d.remove(), 6000);
  }
  function popPts(n, why) {
    const box = hudEl('pts'), d = document.createElement('div');
    d.textContent = '+' + n + ' ' + ({ kill: '', head: 'HEADSHOT', assist: 'ASSIST', longshot: 'LONGSHOT', endStreak: 'STREAK ENDED', firstBlood: 'FIRST BLOOD', capture: 'CAPTURE', defend: 'DEFEND', harvest: 'HARVESTED',
      deny: 'DENIED', hill: '', plant: 'PLANTED', defuse: 'DEFUSED', flagCap: 'CAPTURE', flagReturn: 'RETURN', flagTake: 'FLAG', ball: '', shootDown: 'SHOT DOWN', survive: 'SURVIVED', infect: 'INFECTED', influencerKill: 'INFLUENCER DOWN' }[why] ?? '');
    if (why === 'hill' || why === 'ball') return;
    box.innerHTML = ''; box.appendChild(d);
  }
  function showRespawn(v) {
    const box = hudEl('resp');
    hud.classList.add('dead');
    const list = PvpProgress.classes(), cur = O.cls || 0;
    const wname = (PVP.GUNS[v.w]?.name || String(v.w).toUpperCase()).replace(/"/g, '');
    const classPick = playlist === 'core' && mode.playlist !== 'party' ? `<div class="s">CHANGE CLASS [C] — APPLIES NEXT LIFE</div><div class="cls">${list.map((c, i) => `<button data-i="${i}" class="${i === cur ? 'on' : ''}">${esc(c.name)}</button>`).join('')}</div>` : '';
    box.innerHTML = `<h2>${v.k && v.k !== me ? 'KILLED BY ' + esc(nameOf(v.k)) : 'YOU DIED'}</h2><div class="s">${v.k && v.k !== me ? esc(wname) + (v.h ? ' // HEADSHOT' : '') : ''}</div>
      <div class="s rs"></div><div class="s">DEBT REVIVAL IN PROGRESS. YOUR DEBT OUTLIVES YOU.</div>${classPick}`;
    box.querySelectorAll('.cls button').forEach(b => b.onclick = () => { O.cls = +b.dataset.i; send({ t: 'class', i: O.cls }); box.querySelectorAll('.cls button').forEach(x => x.classList.toggle('on', x === b)); });
    box.style.display = 'block';
    respawnAt = performance.now() + ((mode.respawn || 3) + 0.2) * 1000;
  }
  function hudMe(m) {
    const strk = hudEl('strk');
    if (myStreaks.length && mode.streakMax > 0) {
      const loyal = spawnInfo?.loadout?.perks?.includes('loyalty') ? 100 : 0;
      const html = `<div class="spts">${m.sp} POINTS // [G] ${m.n} LETHAL // [Q] ${m.tc} TACTICAL</div>` + myStreaks.map((id, i) => { const S = PVP.STREAKS[id], c = Math.max(100, S.pts - loyal); return `<div class="${streakReady.includes(id) ? 'r' : ''}">[${i + 3}] ${S.name.replace(/"/g, '').replace('ORACULAR SYSTEMS ', '')} ${streakReady.includes(id) ? '// READY' : c}</div>`; }).join('');
      if (strk._h !== html) { strk.innerHTML = html; strk._h = html; }
    } else { const h = `<div class="spts">[G] ${m.n} LETHAL // [Q] ${m.tc} TACTICAL</div>`; if (strk._h !== h) { strk.innerHTML = h; strk._h = h; } }
    if (dead) { const rs = hudEl('resp').querySelector('.rs'); if (rs) rs.textContent = m.rs > 0 ? 'REVIVED IN ' + m.rs.toFixed(1) + ' // SPACE TO SKIP' : 'REVIVING…'; }
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
    A.textContent = mine; E.textContent = theirs;
    M.textContent = s.st === 'pregame' ? 'WARMUP' : fmtT(s.tl);
    MN.textContent = mode.short + ' // ' + (mode.rounds ? 'ROUND ' + (s.ob?.r || 1) : 'TO ' + mode.limit);
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
    // scoreboard
    const bd = hudEl('board');
    bd.style.display = scoreOpen ? 'block' : 'none';
    if (scoreOpen) {
      const rows = boardRows.slice().sort((a, b) => b[4] - a[4]);
      const row = r => `<tr class="${r[0] === me ? 'me' : mode.teams === 2 ? (r[5] === myTeam ? 'a' : 'e') : ''}"><td>${esc(nameOf(r[0]))}${roster.get(r[0])?.bot ? ' <small>BOT</small>' : ''}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${((r[1] + 1) / (r[2] + 1)).toFixed(2)}</td></tr>`;
      const head = '<tr><th>' + (mode.name) + '</th><th>K</th><th>D</th><th>A</th><th>SCORE</th><th>RATIO</th></tr>';
      const html = mode.teams === 2 ? [myTeam, 1 - myTeam].map(t => `<table>${head.replace(mode.name, PVP.TEAM_NAMES[t] + ' — ' + s.ts[t])}${rows.filter(r => r[5] === t).map(row).join('')}</table>`).join('<br>') : `<table>${head}${rows.map(row).join('')}</table>`;
      if (bd._h !== html) { bd.innerHTML = html; bd._h = html; }
    }
    if (killcam) hudEl('kc').querySelector('span').textContent = esc(nameOf(killcam.num)) + '\'S VIEW';
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
    if (lastKill && lastKill.k && remotes.has(lastKill.k) && estServer() - lastKill.at < 6) killcam = { num: lastKill.k, from: lastKill.at - 3.4, to: lastKill.at + 0.4, t0: performance.now() + 1200, len: 3.8, clip: true };
    setTimeout(() => { killcam = null; podium(res); showResults(); }, killcam ? 5200 : 2500);
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
  const noop = () => {};
  return {
    start, tick, dispose, waypoints, padAt,
    style: noop, say: (w, t, d) => AR.Hud.say(w, t, d), onShot(g) { const k = g?.d ? Math.min(1, (g.d.dmg * (g.d.pellets || 1)) / 140) : 0.2; window.Pad?.rumble(0.08 + k * 0.5, 0.2 + k * 0.4, 45 + k * 60); if (window.VR?.active) VR.recoil(0.2 + k * 0.7); },
    onDamage: noop, onKill: noop, onHurt: noop, onDeath: noop, nearMiss: noop, addChips: noop, addDrip: noop, noteUnlock: noop, use: noop,
    summonAround: noop, bossPhase: noop, bossDead: noop, ringCrash: noop, nextBeatIn: () => 1, headline: noop, addXp: noop,
    dmgMult: () => 1, adrenal: () => 1, incomingMult: () => 1,
    get heat() { return 0; }, get heatMul() { return 1; }, get speedMul() { return 1; }, get fireMul() { return 1; }, get projMul() { return 1; }, get swarmSpeed() { return 1; },
    get rank() { return 0; }, get phase() { return done ? 'results' : 'pvp'; }, M: null, dev: {},
    get remotes() { return remotes; }, get me() { return me; }, get snap() { return snapLast; }, get transport() { return T; },
  };
})();
