'use strict';
// GigaLeague (PvP): the match simulation that runs on the match server and in offline bot matches.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const PVP = require(path.join(root, 'js/pvp/pvp-data.js'));
const Sim = require(path.join(root, 'js/pvp/pvp-sim.js'));
const mapOf = id => Sim.mapFromLayout(JSON.parse(fs.readFileSync(path.join(root, `assets/maps/${id}/${id}.layout.json`), 'utf8')), id);
const plaza = mapOf('plaza');

function live(opts = {}) {
  const m = Sim.create(Object.assign({ map: plaza, mode: 'tdm', seed: 5, fill: false, pregame: 0.05 }, opts));
  return m;
}
const step = (m, s) => { for (let i = 0; i < Math.round(s * 30); i++) { m.tick(Sim.TICK); } };
const msgs = (m, id) => m.drain().filter(([to]) => to === id || to === '*').map(([, x]) => x);

test('progression numbers match the design: level 55 takes ~412,000 XP, weapons cap at 20', () => {
  assert.equal(PVP.totalXpTo(55), 411750);
  assert.equal(PVP.levelOf(0).level, 1);
  assert.equal(PVP.levelOf(PVP.totalXpTo(55) + 5).level, 55);
  assert.equal(PVP.weaponLevelOf(1e9).level, 20);
  assert.ok(PVP.unlocksAt(PVP.CUSTOM_AT).some(u => u.id === 'custom'));
});

test('every mode plays to a finish with bots only', () => {
  for (const mode of PVP.MODE_ORDER) {
    const { match: m } = Sim.simulate({ map: plaza, mode, seed: 21 }, 1500);
    assert.equal(m.state, 'over', mode + ' should finish');
    assert.ok([...m.players.values()].some(p => p.kills > 0), mode + ' should have kills');
  }
});

test('objectives sit on walkable floor on every map', () => {
  for (const id of PVP.MAP_ORDER) {
    const m = Sim.create({ map: mapOf(id), mode: 'dom', seed: 1 });
    assert.equal(m.flags.length, 3, id);
    for (const f of m.flags) assert.ok(m.world.nearestNode(f[0], f[1] + 0.3, f[2], 2) >= 0, id + ' flag on the nav graph');
    assert.ok(m.spawns.length >= 6, id + ' has spawns');
  }
});

test('a real player takes a bot\'s slot; bots fill the rest', () => {
  const m = Sim.create({ map: plaza, mode: 'tdm', seed: 2, pregame: 0.05 });
  m.fillBots();
  assert.equal(m.players.size, 12);
  m.join('human', { name: 'AMRESSE' });
  assert.equal(m.players.size, 12);
  assert.equal([...m.players.values()].filter(p => !p.bot).length, 1);
});

test('movement is checked: speed hacks and walking through walls snap back', () => {
  const m = live();
  m.join('a', { name: 'A' });
  step(m, 1);
  const p = m.players.get('a');
  assert.ok(p.alive);
  const start = p.pos.slice();
  m.drain();
  m.onInput('a', { p: [start[0] + 40, start[1], start[2]], yaw: 0, pitch: 0 });          // 40 m in one tick
  assert.deepEqual(p.pos, start);
  assert.ok(msgs(m, 'a').some(x => x.e === 'correct'));
  // a legal step is accepted
  step(m, 0.1);
  m.onInput('a', { p: [start[0] + 0.5, start[1], start[2]], yaw: 0, pitch: 0 });
  assert.equal(p.pos[0], start[0] + 0.5);
});

test('fire rate and ammo are the server\'s: a fast-fire cheat lands at most a few extra shots, an empty mag fires nothing', () => {
  const m = live();
  m.join('a', { name: 'A' });
  step(m, 1);
  const p = m.players.get('a'), w = p.weapons[0];
  const mag = w.mag;
  for (let i = 0; i < 50; i++) m.onFire('a', { d: [[0, 0, -1]] });                     // 50 shots in the same instant
  assert.ok(mag - w.mag <= 2, 'only the first shots of a burst-in-one-tick count, got ' + (mag - w.mag));
  w.mag = 0; const before = w.mag;
  step(m, 1);
  m.onFire('a', { d: [[0, 0, -1]] });
  assert.equal(w.mag, before);
});

test('lag compensation: a shot hits where the target was when the shooter saw it (up to 200 ms back)', () => {
  const m = live();
  m.join('a', { name: 'A' }); m.join('b', { name: 'B' });
  step(m, 1);
  const A = m.players.get('a'), B = m.players.get('b');
  assert.notEqual(A.team, B.team);
  // put both in the open plaza, facing each other along x
  A.pos = [-8, 0, 2]; B.pos = [8, 0, 2]; A.protect = 0; B.protect = 0; A.hist = []; B.hist = [];
  step(m, 0.3);
  const seenAt = m.now;
  B.pos = [8, 0, 12];                                                                   // B ran 10 m to the side since
  step(m, 0.1);
  const hp = B.hp;
  m.onFire('a', { o: [-8, 1.62, 2], d: [[1, -0.02, 0]], rt: seenAt });
  assert.ok(B.hp < hp, 'the rewound shot should land');
  // a shot without rewind at the old spot misses
  const hp2 = B.hp; A.weapons[0].next = 0;
  m.onFire('a', { o: [-8, 1.62, 2], d: [[1, -0.02, 0]], rt: m.now });
  assert.equal(B.hp, hp2);
});

test('spawn protection blocks damage, and kills score, stream points and award', () => {
  const m = live();
  m.join('a', { name: 'A' }); m.join('b', { name: 'B' });
  step(m, 0.8);
  const A = m.players.get('a'), B = m.players.get('b');
  m.damage(B, 50, A, { w: 'ar' });
  assert.equal(B.hp, B.maxHp);
  B.protect = 0;
  m.damage(B, 150, A, { w: 'ar', head: true });
  assert.equal(B.alive, false);
  assert.equal(A.kills, 1);
  assert.equal(m.teamScore[A.team], 1);
  assert.ok(A.score >= PVP.POINTS.kill + PVP.POINTS.head);
});

test('scorestreaks unlock from points and the Server Wipe kills every enemy', () => {
  const m = live();
  m.join('a', { name: 'A' });
  m.fillBots();
  step(m, 1);
  const A = m.players.get('a');
  A.streakIds = ['ping', 'dronedrop', 'wipe'];
  m.award(A, 'kill', 3000);
  assert.deepEqual(A.ready.sort(), ['dronedrop', 'ping', 'wipe']);
  m.onStreak('a', { id: 'wipe' });
  step(m, 10.2);
  const enemies = [...m.players.values()].filter(p => p.team !== A.team);
  assert.ok(enemies.every(p => !p.alive || m.now - p.spawnedAt < 1));
});

test('rewards: GigaTech is small and capped per match, bot-only matches pay less, custom games pay nothing', () => {
  const m = live();
  m.join('a', { name: 'A' }); m.fillBots(); step(m, 1);
  const A = m.players.get('a'); A.kills = 40; A.score = 5000;
  m.drain(); m.finish(A.team, null);
  const r = msgs(m, 'a').find(x => x.e === 'reward');
  assert.ok(r.gt === 0, 'a match with no other humans pays no GigaTech');
  assert.ok(r.xp > 0 && r.drip > 0);
  const m2 = live({ customGame: true }); m2.join('a', { name: 'A' }); m2.join('b', { name: 'B' }); step(m2, 1); m2.drain(); m2.finish(0, null);
  const r2 = msgs(m2, 'a').find(x => x.e === 'reward');
  assert.equal(r2.xp, 0); assert.equal(r2.gt, 0);
  const m3 = live(); m3.join('a', { name: 'A' }); m3.join('b', { name: 'B' }); step(m3, 1);
  m3.players.get('a').kills = 200; m3.drain(); m3.finish(m3.players.get('a').team, null);
  const r3 = msgs(m3, 'a').find(x => x.e === 'reward');
  assert.ok(r3.gt > 0 && r3.gt <= PVP.GT.maxPerMatch);
});

test('core rarity is cosmetic: a camo never changes a gun\'s stats; Classic Arena map rarity does', () => {
  const a = Sim.gunStats('ar', 'core', [], 0), b = Sim.gunStats('ar', 'core', [], 6);
  assert.equal(a.near[0] * a.dmgK, b.near[0] * b.dmgK);
  assert.equal(a.magSize, b.magSize);
  const c = Sim.gunStats('sniper', 'classic', [], 3);
  assert.ok(c.dmgK > 1);
});

test('classes are sanitized against the player\'s level and slot rules', () => {
  const c = Sim.sanitizeClass({ primary: 'minigun', secondary: 'ar', lethal: 'popup', perks: ['bnpl', 'quickfix', 'spotter'], att: { ar: ['reddot', 'holo', 'suppressor'] } }, 1);
  assert.equal(c.primary, 'ar');                // the minigun is not a class weapon
  assert.equal(c.secondary, 'pistol');          // no Buy Now Pay Later at level 1
  assert.equal(c.lethal, 'frag');               // the Pop-Up unlocks later
  assert.deepEqual(c.att.ar, ['reddot', 'suppressor']);   // one per slot
});

test('progression banks rewards: daily-first-win doubles XP, GigaTech stops at the daily cap, bot kills never count toward camos', () => {
  const g = { SAVE: { gt: 0 }, PVP };
  g.window = g;
  const vm = require('node:vm'); vm.createContext(g);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/pvp/pvp-progress.js'), 'utf8'), g);
  const P = g.PvpProgress;
  const a = P.apply({ xp: 1000, gt: 18, drip: 40, won: true, wstats: { ar: { kills: 10, heads: 3, longs: 1, xp: 1075 } }, kills: 10, deaths: 4 });
  assert.equal(a.xp, 2000);                                  // first win of the day
  const b = P.apply({ xp: 1000, gt: 18, won: true, wstats: {} });
  assert.equal(b.xp, 1000);
  for (let i = 0; i < 10; i++) P.apply({ xp: 10, gt: 18, won: false, wstats: {} });
  assert.equal(g.SAVE.gt, PVP.GT.dailyCap);
  assert.equal(g.SAVE.pvp.wstats.ar.kills, 10);
  P.apply({ xp: 10, gt: 0, won: false, solo: true, wstats: { ar: { kills: 99, heads: 99, longs: 99, xp: 100 } } });
  assert.equal(g.SAVE.pvp.wstats.ar.kills, 10, 'bot-only kills do not count toward camos');
  assert.ok(P.weaponLevel('ar') >= 1);
  assert.equal(P.classes().length, PVP.PREMADE.length + (P.level() >= PVP.CUSTOM_AT ? PVP.CUSTOM_SLOTS : 0));
});

test('the match server map data is generated from the current layouts', () => {
  const { execFileSync } = require('node:child_process');
  execFileSync(process.execPath, [path.join(root, 'scripts/build-pvp-maps.js'), '--check']);
});

test('the game loads the GigaLeague scripts in order, after the arena and before the game', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const at = f => html.indexOf('src="' + f);
  for (const f of ['js/pvp/pvp-data.js', 'js/pvp/pvp-sim.js', 'js/pvp/pvp-net.js', 'js/pvp/pvp-progress.js', 'js/arena/arena-pvp.js', 'js/pvp/pvp-menu.js']) assert.ok(at(f) > 0, f);
  assert.ok(at('js/arena/arena-player.js') < at('js/arena/arena-pvp.js'));
  assert.ok(at('js/pvp/pvp-sim.js') < at('js/arena/arena-pvp.js'));
  assert.ok(at('js/arena/arena-pvp.js') < at('js/arena/arena-main.js'));
  assert.ok(at('js/pvp/pvp-menu.js') < at('js/game.js'));
});
