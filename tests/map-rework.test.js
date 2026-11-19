'use strict';
// The map rework (playtest: high ground too strong on the Living Towers, Downtown too open, the pit / pyramid / web maps
// one-note): teleporters work for players, bots and the match server, and every reworked map holds the gold-standard
// numbers (how much of the map one spot sees, how long the lines are, how much cover there is).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const PVP = require(path.join(root, 'js/pvp/pvp-data.js'));
const Sim = require(path.join(root, 'js/pvp/pvp-sim.js'));
const layoutOf = id => JSON.parse(fs.readFileSync(path.join(root, `assets/maps/${id}/${id}.layout.json`), 'utf8'));
const mapOf = id => Sim.mapFromLayout(layoutOf(id), id);

test('teleporters: the Living Towers has three two-way pairs, the Web two; the match data carries them', () => {
  for (const [id, n] of [['towers', 6], ['botBase', 4]]) {
    const M = mapOf(id);
    assert.equal(M.teles.length, n, id);
    for (const t of M.teles) assert.ok(M.teles.some(o => Math.hypot(o[0] - t[3], o[2] - t[5]) < 4 && Math.abs(o[1] - t[4]) < 1), id + ': every pad has a partner at its exit');
  }
});

test('the match server lets a player through a teleporter, and still stops a long move anywhere else', () => {
  const m = Sim.create({ map: mapOf('towers'), mode: 'tdm', seed: 3, fill: false, pregame: 0.05 });
  const p = m.join('h1', { name: 'H' });
  for (let i = 0; i < 60; i++) m.tick(Sim.TICK);
  const t = m.teles[0];
  p.alive = true; p.pos = [t[0], t[1], t[2]]; p.lastIn = m.now - 0.033;
  m.onInput('h1', { p: [t[3], t[4], t[5]], v: [0, 0, 0], yaw: 0, pitch: 0 });
  assert.deepEqual(p.pos.map(v => +v.toFixed(2)), [t[3], t[4], t[5]].map(v => +v.toFixed(2)), 'came out at the exit');
  assert.ok(m.drain().some(([, x]) => x.e === 'tele' && x.num === p.num), 'others are told (sound, flash, no slide)');
  const before = p.pos.slice(); p.lastIn = m.now - 0.033;
  m.onInput('h1', { p: [before[0] + 20, before[1], before[2]], v: [0, 0, 0], yaw: 0, pitch: 0 });
  assert.deepEqual(p.pos, before, 'a 20 m jump that is not a teleporter is corrected');
});

test('bots use the teleporters', () => {
  let used = 0;
  for (const id of ['towers', 'botBase']) {
    const m = Sim.create({ map: mapOf(id), mode: 'tdm', seed: 11, fill: true, pregame: 0.05 });
    m.fillBots();
    for (let i = 0; i < 30 * 240 && m.state !== 'over'; i++) { m.tick(Sim.TICK); used += m.drain().filter(([, x]) => x.e === 'tele').length; }
  }
  assert.ok(used > 0, 'bots stepped through ' + used + ' times');
});

// the gold standard: the Yield Works, the Ministry of Forms and the Upgrade Basilica
function metrics(id) {
  const src = mapOf(id), W = new Sim.World(src), N = src.nav.nodes, S = [];
  const step = Math.max(1, Math.floor(N.length / 220)); for (let i = 0; i < N.length; i += step) S.push(N[i]);
  let pairs = 0, vis = 0, long = 0, cover = 0; const vf = [];
  for (const a of S) {
    let v = 0;
    for (const b of S) {
      if (a === b) continue; const d = Math.hypot(a[0] - b[0], a[2] - b[2]); if (d > 90) continue;
      pairs++; if (W.los(a[0], a[1] + 1.55, a[2], b[0], b[1] + 1.2, b[2])) { vis++; v++; if (d > 50) long++; }
    }
    vf.push(v / (S.length - 1));
    let dirs = 0; for (let k = 0; k < 8; k++) if (W.raycast(a[0], a[1] + 1.0, a[2], Math.cos(k * Math.PI / 4), 0, Math.sin(k * Math.PI / 4), 2.5)) dirs++;
    if (dirs >= 2) cover++;
  }
  vf.sort((p, q) => q - p);
  const top = vf.slice(0, Math.max(1, Math.floor(vf.length * 0.1)));
  return { see: vis / pairs, long50: long / Math.max(1, vis), cover: cover / S.length, topSee: top.reduce((a, b) => a + b, 0) / top.length };
}
test('every reworked map is within the gold standard: no spot sees the map, few long lines, cover everywhere', () => {
  const rows = {};
  for (const id of ['towers', 'downtown', 'tech', 'botBase', 'cryptidD', 'harbor']) {
    const r = metrics(id); rows[id] = r;
    assert.ok(r.see < 0.25, `${id}: one spot sees ${(r.see * 100).toFixed(0)}% of the map on average`);
    assert.ok(r.topSee < 0.45, `${id}: the best perch sees ${(r.topSee * 100).toFixed(0)}%`);
    assert.ok(r.long50 < 0.25, `${id}: ${(r.long50 * 100).toFixed(0)}% of sightlines run past 50 m`);
    assert.ok(r.cover > 0.22, `${id}: cover within reach at ${(r.cover * 100).toFixed(0)}% of spots`);
  }
});
