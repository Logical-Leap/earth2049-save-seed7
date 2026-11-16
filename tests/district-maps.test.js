'use strict';
// Every district in the city grid is a map in the field (js/arena/arena-maps.js). Each map must carry what the
// mission needs, a nav graph enemies can use everywhere, pads that clear the level, and the words for its beats.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p.split('?')[0]));

function arena() {
  const ctx = { window: {}, document: { getElementById: () => null }, THREE: { Vector3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } } } };
  vm.createContext(ctx);
  vm.runInContext(read('js/arena/arena-core.js').replace("const AR = window.AR =", 'var AR = window.AR ='), ctx);
  vm.runInContext(read('js/arena/arena-data.js'), ctx);
  vm.runInContext(read('js/arena/arena-maps.js'), ctx);
  return ctx.window.AR;
}
const AR = arena();
const layout = m => JSON.parse(read(m.dir + m.file + '.layout.json'));

test('the registry has the plaza (ShillZ Central HQ) and Downtown (a district)', () => {
  assert.ok(AR.MAPS.plaza.hq && AR.MAPS.plaza.dist === 'shillzC');
  assert.ok(!AR.MAPS.downtown.hq && AR.MAPS.downtown.dist === 'downtown');
  const idle = read('idle/index.html');
  for (const m of Object.values(AR.MAPS)) assert.ok(idle.includes(`id:'${m.dist}'`), m.id + ' is a city grid district');
});

test('pickMap: an explicit map, else the op district, else the plaza; leader fights always play the HQ', () => {
  assert.equal(AR.pickMap(null, 'downtown').id, 'downtown');
  assert.equal(AR.pickMap({ kind: 'takeover', dist: 'downtown' }).id, 'downtown');
  assert.equal(AR.pickMap({ kind: 'raid', dist: 'downtown' }).id, 'downtown');
  assert.equal(AR.pickMap({ kind: 'takeover', dist: 'abandoned' }).id, 'plaza', 'districts without a map still play the plaza');
  assert.equal(AR.pickMap({ kind: 'leader', fac: 'shillz', dist: 'downtown' }).id, 'plaza');
  assert.equal(AR.pickMap(null).id, 'plaza');
});

for (const m of Object.values(AR.MAPS)) {
  test(`${m.id}: level files and every marker the mission needs`, () => {
    assert.ok(exists(m.dir + m.file + '.glb'));
    const L = layout(m), k = kind => L.markers.filter(x => x.kind === kind);
    assert.equal(k('playerStart').length, 1);
    assert.equal(k('relay').length, 3, 'three act II targets');
    for (const r of k('relay')) assert.ok(r.name && r.area, 'relay named and placed in an area');
    assert.equal(k('extraction').length, 1);
    assert.ok(k('screen').length >= 1, 'somewhere for the feed');
    for (const s of k('screen')) assert.equal(s.size.length, 2);
    if (m.hq) assert.equal(k('boss').length, 1, 'an HQ has its leader (marker placed even before the fight exists: noLeader)');
    const areas = new Set(k('spawn').map(s => s.area));
    for (const [beat, list] of Object.entries(m.areas)) for (const a of list) assert.ok(areas.has(a), `${beat} spawns from ${a}`);
    for (const r of k('relay')) assert.ok(areas.has(r.area), 'relay guards spawn in ' + r.area);
    const lights = new Set((L.lights || []).map(l => l.name));
    for (const n of m.dyn) assert.ok(lights.has(n), 'dynamic light ' + n);
    assert.ok(L.probes?.rgb8);
    for (const p of new Set(L.props.map(x => x.model))) assert.ok(exists(`assets/models/haven/props/${p}.glb`), 'prop synced: ' + p);
  });

  test(`${m.id}: nav graph strongly connected, every spawn / relay / the extraction on it`, () => {
    const L = layout(m), { nodes, edges } = L.meta.nav;
    const fw = nodes.map(() => []), bw = nodes.map(() => []);
    for (const [a, b, t] of edges) { fw[a].push(b); bw[b].push(a); if (t === 0) { fw[b].push(a); bw[a].push(b); } }
    const bfs = g => { const seen = new Set([0]); const q = [0]; while (q.length) for (const v of g[q.shift()]) if (!seen.has(v)) { seen.add(v); q.push(v); } return seen; };
    assert.equal(bfs(fw).size, nodes.length);
    assert.equal(bfs(bw).size, nodes.length);
    const near = (p, r = 3) => nodes.some(n => Math.hypot(n[0] - p[0], n[2] - p[2]) < r && Math.abs(n[1] - p[1]) < 1.2);
    for (const s of L.markers.filter(x => x.kind === 'spawn')) assert.ok(near(s.pos), 'spawn ' + JSON.stringify(s.pos));
    for (const r of L.markers.filter(x => x.kind === 'relay')) assert.ok(near(r.pos, 4), 'relay ' + r.name);
    assert.ok(near(L.markers.find(x => x.kind === 'extraction').pos));
  });

  test(`${m.id}: every jump pad arc clears the level`, () => {
    const L = layout(m), g = 24;
    for (const p of L.markers.filter(x => x.kind === 'pad')) {
      const s = p.pos, t = p.target, apex = Math.max(t[1], s[1]) + 2.6;
      const vy = Math.sqrt(2 * g * (apex - s[1])), T = vy / g + Math.sqrt(2 * (apex - t[1]) / g);
      const vx = (t[0] - s[0]) / T, vz = (t[2] - s[2]) / T;
      for (let i = 1; i < 60; i++) {
        const tt = T * i / 60 * 0.97, x = s[0] + vx * tt, z = s[2] + vz * tt, y = s[1] + vy * tt - 0.5 * g * tt * tt;
        const hit = L.colliders.find(c => c.min[0] - 0.35 < x && x < c.max[0] + 0.35 && c.min[2] - 0.35 < z && z < c.max[2] + 0.35 && c.min[1] < y + 1.7 && c.max[1] > y + 0.2);
        assert.ok(!hit, `${p.name} hits ${hit?.name} at ${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}`);
      }
    }
  });

  test(`${m.id}: the words for every beat`, () => {
    for (const k of ['load', 'place', 'region', 'title', 'act1Obj', 'act2Obj', 'act3Obj', 'relayWord', 'chatTitle', 'lostTitle', 'lostSub']) assert.equal(typeof m[k], 'string', k);
    for (const k of ['act1', 'act2', 'act3']) assert.equal(m[k].length, 2, k);
    for (const k of ['act1', 'act2', 'act3']) assert.equal(m.head[k].length, 2, 'headline ' + k);
    assert.equal(m.sky.length, 4);
    const lines = AR.mapLines(m, 'gigacorp');
    for (const k of ['intro', 'act2', 'relayDown', 'act3', 'extract', 'death']) assert.ok(lines[k]?.length, 'lines ' + k);
    assert.equal(lines.relayDown.length, 3);
    for (const v of Object.values(lines)) for (const [, t] of v) assert.ok(!t.includes('{OWNER}'));
  });
}

test('downtown is three tiers: street, the upper ring, the subway concourse (where you log off)', () => {
  const L = layout(AR.MAPS.downtown), nodes = L.meta.nav.nodes;
  assert.ok(nodes.filter(n => n[1] < -4).length > 60, 'concourse');
  assert.ok(nodes.filter(n => Math.abs(n[1] - 6.5) < 0.1).length > 200, 'roofs, skybridge, gantry, viaduct, tower ring');
  assert.ok(L.markers.find(x => x.kind === 'extraction').pos[1] < -4, 'the cell lives underground');
  assert.equal(new Set(L.markers.filter(x => x.kind === 'relay').map(r => Math.sign(Math.round(r.pos[1])))).size, 2, 'uplinks up high and underground');
  assert.ok(L.probes.heights.includes(-4.4), 'probes light the concourse');
});

test('district rosters: every faction look has a model the arena loads', () => {
  const src = read('js/arena/arena-enemies.js');
  for (const [fac, R] of Object.entries(AR.ROSTERS)) {
    for (const [type, look] of Object.entries(R)) {
      assert.ok(AR.ENEMIES[type], `${fac}.${type}`);
      for (const k of look.models) {
        assert.ok(src.includes(`${k}: E + '${k}.glb'`), `${k} preloaded`);
        assert.ok(exists(`assets/models/ps1/enemies/${k}.glb`), k);
      }
    }
  }
  for (const f of ['shillz', 'muskers', 'cryptids', 'bots', 'gigacorp']) assert.ok(AR.ROSTERS[f] && AR.FAC_NAMES[f], f);
});

test('wiring: arena-maps loads between the data and the mission; 5ON lists every district map', () => {
  const html = read('index.html');
  const i = n => html.indexOf(`js/arena/${n}.js`);
  assert.ok(i('arena-data') < i('arena-maps') && i('arena-maps') < i('arena-mission') && i('arena-maps') > 0);
  assert.match(read('js/haven-data.js'), /menu: \(\) => havenDistrictOptions\(\)/);
  assert.match(read('js/haven-data.js'), /action: 'deploy_' \+ m\.id/);
  assert.match(read('js/game.js'), /action\.startsWith\('deploy_'\) && window\.AR\?\.MAPS\?\.\[action\.slice\(7\)\]\) \{[^}]*startArena\(\{ map: action\.slice\(7\) \}\)/);
  assert.match(read('js/haven.js'), /if \(o\.menu\) \{/);
  assert.match(read('js/arena/arena-main.js'), /AR\.pickMap\(opts\.op, opts\.map\)/);
  assert.match(read('js/arena/arena-mission.js'), /M\.noBoss = !!M\.op\?\.noBoss \|\| !M\.map\.hq \|\| !!M\.map\.noLeader/);
});

test('a sponsor break waits for an open level-up pick (one card overlay at a time, or the run stalls)', () => {
  assert.match(read('js/arena/arena-mission.js'), /if \(AR\.menu\) \{ setTimeout\(open, 400\); return; \}/);
});

test('Muskers Territory is the first faction HQ after the plaza: an HQ, owned by the Muskers, no leader fight yet', () => {
  const m = AR.MAPS.muskerT;
  assert.ok(m.hq && m.noLeader && m.owner === 'muskers' && m.dist === 'muskerT');
});

test('an HQ is always fought against its own faction, whoever the op says holds it', () => {
  const src = read('js/arena/arena-mission.js');
  assert.match(src, /M\.roster = AR\.ROSTERS\[M\.map\.hq \? M\.map\.owner : M\.owner\]/);
});
