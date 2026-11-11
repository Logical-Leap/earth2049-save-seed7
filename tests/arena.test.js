'use strict';
// Operation: Unsubscribe — the Engagement Plaza arena: level markers, navigation graph, content tables, wiring.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p.split('?')[0]));
const L = JSON.parse(read('assets/maps/plaza/plaza.layout.json'));
const markers = kind => L.markers.filter(m => m.kind === kind);

function arenaData() {
  const ctx = { window: {}, document: { getElementById: () => null }, THREE: { Vector3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } } } };
  vm.createContext(ctx);
  vm.runInContext(read('js/arena/arena-core.js').replace("const AR = window.AR =", 'var AR = window.AR ='), ctx);
  vm.runInContext(read('js/arena/arena-data.js'), ctx);
  vm.runInContext(read('js/arena/arena-boss.js'), ctx);
  return ctx.window.AR;
}

test('plaza level files exist and carry every gameplay marker the mission needs', () => {
  assert.ok(exists('assets/maps/plaza/plaza.glb'));
  assert.equal(markers('playerStart').length, 1);
  assert.equal(markers('relay').length, 3, 'three signal relays');
  assert.equal(markers('extraction').length, 1);
  assert.equal(markers('boss').length, 1);
  assert.ok(markers('perch').length >= 3, 'boss perches round the upper ring');
  assert.equal(markers('screen').length, 1);
  assert.equal(markers('ring').length, 1);
  const pads = markers('pad');
  assert.ok(pads.length >= 4, 'jump pads');
  for (const p of pads) assert.equal(p.target.length, 3);
  const areas = new Set(markers('spawn').map(s => s.area));
  for (const a of ['plaza', 'backstage', 'mezz', 'garage', 'gantry', 'fan']) assert.ok(areas.has(a), 'spawns in ' + a);
  assert.ok(L.colliders.length > 150);
  assert.ok(L.probes?.rgb8, 'baked light probes');
});

test('nav graph is valid and strongly connected', () => {
  const { nodes, edges } = L.meta.nav;
  assert.ok(nodes.length > 800);
  const fw = nodes.map(() => []), bw = nodes.map(() => []);
  for (const [a, b, t] of edges) {
    assert.ok(a >= 0 && a < nodes.length && b >= 0 && b < nodes.length && [0, 1, 2].includes(t));
    fw[a].push(b); bw[b].push(a);
    if (t === 0) { fw[b].push(a); bw[a].push(b); }
  }
  const bfs = g => { const seen = new Set([0]); const q = [0]; while (q.length) for (const v of g[q.shift()]) if (!seen.has(v)) { seen.add(v); q.push(v); } return seen; };
  assert.equal(bfs(fw).size, nodes.length, 'every node reachable');
  assert.equal(bfs(bw).size, nodes.length, 'every node can reach back');
  assert.ok(edges.some(e => e[2] === 1), 'ledge drops');
  assert.ok(edges.filter(e => e[2] === 2).length >= 4, 'pad links');
});

test('the runtime flow field reaches every node from any goal (float64 distances)', () => {
  const src = read('js/arena/arena-core.js');
  const a = src.indexOf('  function buildNav'), b = src.indexOf('  function nodePos');
  const mod = { exports: {} };
  new Function('module', 'let nav=null;' + src.slice(a, b) + ';module.exports={buildNav,flowTo,get nav(){return nav}};')(mod);
  const N = mod.exports;
  N.buildNav(L.meta.nav);
  for (const g of [0, 100, 500, 900, L.meta.nav.nodes.length - 1]) {
    N.flowTo(g);
    assert.equal(Array.from(N.nav.dist).filter(d => d === Infinity).length, 0, 'goal ' + g);
  }
});

test('every ground spawn, relay and the extraction sit on the nav graph', () => {
  const { nodes } = L.meta.nav;
  const near = (p, r = 3) => nodes.some(n => Math.hypot(n[0] - p[0], n[2] - p[2]) < r && Math.abs(n[1] - p[1]) < 1.2);
  for (const s of markers('spawn')) assert.ok(near(s.pos), 'spawn ' + JSON.stringify(s.pos));
  for (const r of markers('relay')) assert.ok(near(r.pos, 4), 'relay ' + r.name);
  assert.ok(near(markers('extraction')[0].pos));
});

test('arena content tables are complete', () => {
  const AR = arenaData();
  const manifest = JSON.parse(read('assets/data/asset-manifest.json'));
  for (const [id, g] of Object.entries(AR.GUNS)) assert.ok(g.dmg > 0 && g.rpm > 0 && g.mag > 0, id);
  void manifest;
  for (const id of AR.PRIMARIES) assert.ok(AR.GUNS[id], id);
  // every gun has its first-person Arsenal model (all seven rarities in one GLB)
  const gunFiles = { pistol: 'volt9_pistol', smg: 'vx2_ripper', shotgun: 'riptide12_shotgun', ar: 'm52_revenant', dmr: 'lrx7_harbinger', energy: 'plasma_lancer', rocket: 'mgl6_thunderer', lmg: 'compliance_saw' };
  for (const id of Object.keys(AR.GUNS)) {
    const f = `assets/models/ps1/weapons/${gunFiles[id]}.glb`;
    assert.ok(exists(f), f);
    const b = fs.readFileSync(path.join(root, f)), n = b.readUInt32LE(12), W = JSON.parse(b.slice(20, 20 + n)).scenes[0].extras;
    assert.equal(W.rarities.length, 7, id + ' rarities');
    assert.ok(W.anchors.muzzle && W.anchors.grip, id + ' anchors');
  }
  const ids = new Set();
  for (const p of AR.PERKS) { assert.equal(typeof p.fx, 'function', p.id); assert.ok(!ids.has(p.id), 'unique ' + p.id); ids.add(p.id); assert.ok([0, 1, 2].includes(p.r)); }
  assert.ok(AR.PERKS.length >= 20);
  const files = { serverless_m: 'arena', serverless_f: 'arena', shill_m: 'arena', shill_f: 'arena', hypebeast_m: 'arena', cdrone_x: 'arena', enforcer_x: 'arena' };
  for (const [id, e] of Object.entries(AR.ENEMIES)) {
    for (const m of e.models) {
      if (m === 'riya') assert.ok(exists('assets/models/ps1/characters/riya.glb'));
      else if (m === 'relay') assert.ok(exists('assets/models/haven/props/shillz_speaker_tower.glb'));
      else { assert.ok(files[m], 'known model ' + m); assert.ok(exists(`assets/models/arena/${m}.glb`), m); }
    }
    assert.ok(e.hp > 0, id);
  }
  assert.equal(AR.RANKS.length, 6);
});

test('every jump pad arc clears the level geometry', () => {
  const g = 24;
  for (const m of markers('pad')) {
    const p = m.pos, t = m.target, apex = Math.max(t[1], p[1]) + 2.6;                // same ballistic solve as the runtime
    const vy = Math.sqrt(2 * g * (apex - p[1])), T = vy / g + Math.sqrt(2 * (apex - t[1]) / g);
    const vx = (t[0] - p[0]) / T, vz = (t[2] - p[2]) / T;
    for (let i = 1; i < 60; i++) {
      const tt = T * i / 60 * 0.97, x = p[0] + vx * tt, z = p[2] + vz * tt, y = p[1] + vy * tt - 0.5 * g * tt * tt;
      const hit = L.colliders.find(c => c.min[0] - 0.35 < x && x < c.max[0] + 0.35 && c.min[2] - 0.35 < z && z < c.max[2] + 0.35 && c.min[1] < y + 1.7 && c.max[1] > y + 0.2);
      assert.ok(!hit, `${m.name} hits ${hit?.name} at ${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}`);
    }
  }
});

test('every prop the plaza places was synced', () => {
  for (const m of new Set(L.props.map(p => p.model))) assert.ok(exists(`assets/models/haven/props/${m}.glb`), m);
});

test('arena scripts load before the game, in dependency order; Solo and the Haven deploy launch it', () => {
  const html = read('index.html'), game = read('js/game.js');
  const order = ['arena-core', 'arena-data', 'arena-sfx', 'arena-fx', 'arena-arsenal', 'arena-player', 'arena-enemies', 'arena-boss', 'arena-hud', 'arena-mission', 'arena-main'];
  let last = -1;
  for (const f of order) { const i = html.indexOf(`js/arena/${f}.js`); assert.ok(i > last, f); last = i; }
  assert.ok(last < html.indexOf('js/game.js'));
  assert.match(game, /el\('btnStart'\)\.onclick = \(\) => \{[^}]*startArena\(\)/);
  assert.match(game, /state === 'arena'\) \{[\s\S]{0,400}?Arena\.tick\(dt\)/);
});

test('arena music cues exist', () => {
  const cues = JSON.parse(read('assets/audio/music/cues.json')).cues;
  for (const c of ['title', 'combat', 'boss', 'outro', 'deploy']) assert.ok(cues[c], c);
});
