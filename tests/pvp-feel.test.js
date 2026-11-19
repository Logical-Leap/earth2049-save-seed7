'use strict';
// GigaLeague feel pass (Nov 19 playtest): silence, sound you can read, bodies, feedback, controller.
// The browser half of this is scripts/qa/pvp-feel-e2e.mjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const PVP = require(path.join(root, 'js/pvp/pvp-data.js'));
const Sim = require(path.join(root, 'js/pvp/pvp-sim.js'));
const plaza = Sim.mapFromLayout(JSON.parse(read('assets/maps/plaza/plaza.layout.json')), 'plaza');
const step = (m, s) => { for (let i = 0; i < Math.round(s * 30); i++) m.tick(Sim.TICK); };

test('no music anywhere in multiplayer: menu, lobby, match, results', () => {
  const game = read('js/game.js'), main = read('js/arena/arena-main.js'), pvp = read('js/arena/arena-pvp.js');
  assert.match(game, /PvpMenu\?\.isOpen\?\.\(\) \|\| window\.AR\?\.Pvp\?\.on \|\| pendingPvp\) \{ if \(Music\.current\) Music\.stop/, 'the music director stops music while the GigaLeague is up');
  assert.match(main, /if \(AR\.Pvp\?\.on\) return null;/, 'the arena asks for no music cue in PvP');
  assert.doesNotMatch(pvp, /Music\.play/, 'the PvP runtime never starts a cue');
  assert.doesNotMatch(game.slice(game.indexOf('function startPvpMatch'), game.indexOf('window.startPvpMatch')), /Music\.stinger/, 'not even the deploy stinger');
});

test('every gun has its own voice, and the gun audio has a recipe for each', () => {
  const ctx = { console, Math, setTimeout, AudioSys: { sfxOn: true }, window: {} };
  vm.runInNewContext(read('js/gunaudio.js') + '\nthis.GA = GunAudio;', ctx);
  const ids = new Set(ctx.GA.ids);
  const voices = new Set();
  for (const [id, g] of Object.entries(PVP.GUNS)) {
    if (g.melee) continue;
    assert.ok(g.snd, id + ' has a voice');
    assert.ok(ids.has(g.snd), id + ' voice ' + g.snd + ' exists in js/gunaudio.js');
    voices.add(g.snd);
  }
  assert.equal(voices.size, Object.values(PVP.GUNS).filter(g => !g.melee).length, 'no two guns share a voice');
  assert.match(read('js/gunfeel.js'), /GunAudio\?\.shot\?\.\(w\.snd \|\| w\.id, tier\)/, 'the local player hears the same voice others do');
});

test('snapshots carry each player\'s rounds fired and melee swings, so every round can be heard', () => {
  const m = Sim.create({ map: plaza, mode: 'tdm', seed: 5, fill: false, pregame: 0.05 });
  m.join('a', { name: 'A' }); m.join('b', { name: 'B' });
  step(m, 1);
  const a = m.players.get('a');
  const row = () => m.snapshot('b').pl.find(r => r[0] === a.num);
  const s0 = row()[13];
  for (let i = 0; i < 3; i++) { a.weapons[a.cur].next = 0; m.onFire('a', { d: [[0, 0, -1]] }); step(m, 0.2); }
  assert.equal(row()[13], (s0 + 3) & 255, 'three rounds fired, three counted');
  m.onMelee('a');
  assert.equal(row()[14], 1, 'a melee swing counted');
  // a suppressor is flagged (quiet: the sound carries less and stays off the minimap)
  a.weapons[a.cur].g = Object.assign({}, a.weapons[a.cur].g, { mods: { quiet: 1 } });
  assert.ok(row()[6] & 16384, 'the suppressed flag is set');
});

test('a class picked in the first seconds of a life (before firing) applies at once, otherwise next life', () => {
  const m = Sim.create({ map: plaza, mode: 'tdm', seed: 5, fill: false, pregame: 0.05 });
  m.join('a', { name: 'A' });
  step(m, 1);
  const a = m.players.get('a');
  const prim = a.loadout.guns[0][0];
  const other = PVP.PREMADE.findIndex(c => c.primary !== prim);
  m.drain();
  assert.equal(m.pickClass('a', other), true, 'just spawned: applies now');
  assert.notEqual(a.loadout.guns[0][0], prim);
  const sent = m.drain().map(([, x]) => x).find(x => x.e === 'spawn');
  assert.ok(sent && sent.keep && sent.swap, 'the player is re-equipped where they stand');
  a.weapons[a.cur].next = 0; m.onFire('a', { d: [[0, 0, -1]] });
  assert.equal(m.pickClass('a', 0), false, 'after firing it waits for the next life');
  assert.equal(a.cls, 0, 'but the pick is kept');
  step(m, PVP.CLASS_SWAP_WINDOW + 1);
});

test('bots carry every kind of gun, a new class each life; most of them can be heard coming', () => {
  const prim = new Set(PVP.BOT_CLASSES.map(c => Sim.sanitizeClass(c, 99).primary));
  for (const g of ['ar', 'smg', 'shotgun', 'sniper', 'lmg', 'marksman', 'burst', 'fastsmg']) assert.ok(prim.has(g), 'a bot class uses ' + g);
  assert.ok(PVP.BOT_CLASSES.filter(c => c.perks.includes('noisecancel')).length <= 1, 'only the RECON bots run NOISE-CANCELLING');
  const { match } = Sim.simulate({ map: plaza, mode: 'tdm', seed: 9 }, 400);
  const carried = new Set([...match.players.values()].filter(p => p.bot).map(p => p.loadout.guns[0][0]));
  assert.ok(carried.size >= 3, 'a bot lobby carries a mix of guns: ' + [...carried].join(', '));
});

test('medals are data, in the GigaLeague voice, and the HUD awards them', () => {
  for (const [id, M] of Object.entries(PVP.MEDALS)) { assert.ok(M.name && M.d, id); assert.ok(M.tier >= 1 && M.tier <= 6, id); }
  const pvp = read('js/arena/arena-pvp.js');
  for (const id of ['quadFeed', 'revenge', 'melee']) assert.match(pvp, new RegExp(`medal\\('${id}'\\)`), id + ' is awarded');
  assert.match(pvp, /medal\('multi' \+ Math\.min\(6, multi\.n\)\)/, 'multikills');
  assert.match(pvp, /medal\('streak' \+ v\.s\)/, 'kill streaks');
  // objective points are shown (Hardpoint used to hide them) and tick
  assert.doesNotMatch(pvp, /if \(why === 'hill' \|\| why === 'ball'\) return;/);
  assert.match(pvp, /if \(why === 'hill' \|\| why === 'ball'\) \{ AR\.PvpAudio\.ui\('tick'\)/);
});

test('bodies stay: the Death clip plays once and holds, the body clears after a few seconds', () => {
  const pvp = read('js/arena/arena-pvp.js');
  assert.match(pvp, /play\?\.\('Death', 0\.08\)/);
  assert.match(pvp, /setLoop\(THREE\.LoopOnce, 1\); act\.clampWhenFinished = true/);
  assert.match(pvp, /BODY_STAY = 8/);
});

test('controller: the D-pad never swaps weapons; in PvP it holds the streaks and the tactical; X uses or reloads', () => {
  const pl = read('js/arena/arena-player.js');
  assert.doesNotMatch(pl, /pad\.down\(B\.LEFT\) \|\| pad\.down\(B\.RIGHT\)\) I\.swap/);
  assert.match(pl, /if \(pad\.down\(B\.Y\)\) I\.swap = -1;/);
  assert.match(pl, /if \(pad\.down\(B\.LEFT\)\) I\.streak = 1;/);
  assert.match(pl, /if \(pad\.down\(B\.UP\)\) I\.streak = 2;/);
  assert.match(pl, /if \(pad\.down\(B\.RIGHT\)\) I\.streak = 3;/);
  assert.match(pl, /if \(pad\.down\(B\.DOWN\)\) I\.tac = true;/);
  assert.match(pl, /AR\.Pvp\.useContext\?\.\(\)/);
  assert.match(read('js/game.js'), /!AR\.Pvp\?\.on && Pad\.down\(Pad\.BTN\.BACK\)/, 'BACK holds the scoreboard in PvP instead of pausing');
  assert.match(read('js/gamepad.js'), /key: 'pvpMenu'/, 'the GigaLeague menu is a controller menu layer');
});

test('button prompts follow the device: keys on keyboard, the controller\'s own labels on a controller', () => {
  const sb = { setInterval() {}, SAVE: { opts: {} }, Pad: { active: false, id: '' } };
  sb.globalThis = sb;
  vm.runInNewContext(read('js/input-glyphs.js'), sb);
  const G = sb.Glyph;
  assert.equal(G.mode(), 'kb');
  assert.equal(G.label('use'), '[E]');
  assert.equal(G.label('useHold'), 'HOLD [E]');
  assert.equal(G.plain('[E] PICK UP'), '[E] PICK UP');
  sb.Pad.active = true; sb.Pad.id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)';
  assert.equal(G.mode(), 'xbox');
  assert.equal(G.label('use'), '[X]');
  assert.equal(G.label('streak1'), '[←]');
  assert.equal(G.label('tactical'), '[↓]');
  assert.equal(G.plain('[E] PICK UP'), '[X] PICK UP');
  assert.match(G.text('{useHold} TO PLANT'), /HOLD <kbd class="gl pad face"[^>]*>X<\/kbd> TO PLANT/);
  sb.Pad.id = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
  assert.equal(G.mode(), 'ps');
  assert.equal(G.label('use'), '[□]');
  assert.equal(G.label('lethal'), '[L1]');
  sb.Pad.id = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';
  assert.equal(G.mode(), 'ps', 'a DualShock 4 names itself "Wireless Controller"');
  sb.Pad.id = 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)';
  assert.equal(G.label('jump'), '[B]', 'Switch labels by position');
  // the setting pins a device
  sb.SAVE.opts.prompts = 'kb'; assert.equal(G.mode(), 'kb');
  sb.SAVE.opts.prompts = 'ps'; sb.Pad.active = false; assert.equal(G.mode(), 'ps');
  assert.equal(G.prefLabel(), 'PLAYSTATION');
  assert.match(read('index.html'), /id="optPrompts"/, 'Settings has BUTTON PROMPTS');
  assert.match(read('js/pvp/pvp-menu.js'), /data-act="prompts"/, 'and the GigaLeague menu does too');
});

test('the quick match vote counts down by itself between room updates', () => {
  const menu = read('js/pvp/pvp-menu.js');
  assert.match(menu, /voteEnd = performance\.now\(\) \+ room\.voteLeft \* 1000/);
  assert.match(menu, /\.voteLeft'\); if \(v\) \{ const n = String\(Math\.ceil\(voteLeft\(\)\)\)/);
});

test('scripts load in order: glyphs after the gamepad, PvP audio before the PvP runtime', () => {
  const html = read('index.html'), at = f => html.indexOf(f);
  assert.ok(at('js/gamepad.js') < at('js/input-glyphs.js') && at('js/input-glyphs.js') < at('js/arena/arena-hud.js'));
  assert.ok(at('js/arena/arena-pvp-audio.js') > 0 && at('js/arena/arena-pvp-audio.js') < at('js/arena/arena-pvp.js'));
});
