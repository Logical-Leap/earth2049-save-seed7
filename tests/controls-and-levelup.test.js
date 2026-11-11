'use strict';
// Controller support, sprint-by-default, the first-person body, and the XP level-up loop: static wiring checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

function arenaData() {
  const ctx = { window: {}, document: { getElementById: () => null }, THREE: { Vector3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } } } };
  vm.createContext(ctx);
  vm.runInContext(read('js/arena/arena-core.js').replace("const AR = window.AR =", 'var AR = window.AR ='), ctx);
  vm.runInContext(read('js/arena/arena-data.js'), ctx);
  return ctx.window.AR;
}

test('scripts load in order: gamepad before the game, the body after the avatar kit', () => {
  const html = read('index.html'), at = f => html.indexOf(f);
  assert.ok(at('js/gamepad.js') > 0 && at('js/gamepad.js') < at('js/game.js'));
  assert.ok(at('js/avatar.js') < at('js/fp-body.js') && at('js/fp-body.js') < at('js/game.js'));
  assert.ok(at('js/gunfeel.js') < at('js/fp-body.js'), 'fp-body hands its arms to GunFeel');
});

test('the game polls the pad every frame and routes it to the arena or the Haven', () => {
  const game = read('js/game.js');
  assert.match(game, /window\.Pad\?\.poll\(dt\)/);
  assert.match(game, /AR\.Player\.padTick\(Pad, dt\)/);
  assert.match(game, /padGameplay\(dt\)/);
  const pad = read('js/gamepad.js');
  for (const k of ['A: 0', 'B: 1', 'X: 2', 'Y: 3', 'LB: 4', 'RB: 5', 'START: 9', 'L3: 10', 'UP: 12']) assert.ok(pad.includes(k), k);
  for (const layer of ["'avc'", "'arCards'", "'havenDlg'", ".ov.show"]) assert.ok(pad.includes(layer), 'menu layer ' + layer);
  const player = read('js/arena/arena-player.js');
  assert.match(player, /function padTick/);
  assert.match(player, /function assistTarget/, 'aim assist for sticks');
});

test('SHIFT sprints by default; JET DASH (arena) and Ghost Protocol (districts) swap it for the dash', () => {
  const player = read('js/arena/arena-player.js');
  assert.match(player, /case 'ShiftLeft': case 'ShiftRight': if \(S\?\.dashMode\) I\.dash = true/);
  assert.match(player, /I\.dash && S\.dashMode && P\.dashCharges > 0/);
  const AR = arenaData();
  const jet = AR.PERKS.find(p => p.id === 'jetdash');
  assert.ok(jet, 'JET DASH perk exists');
  const S = { dashMode: false }; jet.fx(S); assert.equal(S.dashMode, true);
  assert.equal(AR.PERKS.find(p => p.id === 'dash').needs, 'dashMode', 'dash charges only after JET DASH');
  const game = read('js/game.js');
  assert.match(game, /Input\.dash && p\.mods\.dash && p\.dashCdT <= 0/);
  assert.match(read('js/config.js'), /id:'ghost'[^\n]*p\.mods\.dash=true/);
});

test('chips are XP: levels need more each time, and each level runs the fanfare and a card pick', () => {
  const m = read('js/arena/arena-mission.js');
  assert.match(m, /function addChips\(n\) \{ M\.chips \+= n; addXp\(n\); \}/);
  const need = L => Math.round(8 + L * 5 + L * L * 0.6);
  assert.match(m, /function xpNeed\(L\) \{ return Math\.round\(8 \+ L \* 5 \+ L \* L \* 0\.6\); \}/);
  for (let L = 1; L < 12; L++) assert.ok(need(L + 1) > need(L));
  assert.ok(need(1) <= 15, 'the first level comes quickly');
  assert.match(m, /AR\.Sfx\.levelUp\(lv\)/); assert.match(m, /AR\.Hud\.levelUp\(lv\)/); assert.match(m, /kind: 'level'/);
  const sfx = read('js/arena/arena-sfx.js');
  for (const f of ['levelUp', 'gem', 'cardDeal', 'cardHover', 'cardPick']) assert.match(sfx, new RegExp('function ' + f + '\\('), f);
  const hud = read('js/arena/arena-hud.js');
  assert.match(hud, /function xp\(level, frac, gained, leveled\)/);
  assert.match(hud, /arov fx|' fx '/);
});

test('the first-person body wears the saved look and dresses GunFeel hands from it', () => {
  const fp = read('js/fp-body.js');
  assert.match(fp, /setFirstPerson\(true\)/);
  assert.match(fp, /GunFeel\?\.setArms\?\.\(/);
  assert.match(read('js/gunfeel.js'), /function setArms\(parts\)/);
  assert.match(read('js/arena/arena-player.js'), /FPBody\.update\(rdt, \{[^}]*arms: false/);
  assert.match(read('js/game.js'), /window\.FPBody\?\.refresh\(\)/, 'the Fitting Room re-dresses the body');
});
