'use strict';
// Rebel Haven hub: the level, every model it references, and the music cues must be present
// and self-consistent (synced from game-art-pipeline by scripts/sync-ps1-models.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p));
const exists = p => fs.existsSync(path.join(root, p.split('?')[0]));

function havenData() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(read('js/haven-data.js').toString() +
    '\n;this.out={HAVEN_BASE,HAVEN_MODELS,HAVEN_NPCS,HAVEN_TURING};', ctx);
  return ctx.out;
}

function glbJson(p) {
  const b = read(p);
  assert.equal(b.readUInt32LE(0), 0x46546C67, `${p} is a GLB`);
  const len = b.readUInt32LE(12);
  return JSON.parse(b.slice(20, 20 + len).toString());
}

test('Haven level files exist and the layout has spawn and launch markers', () => {
  for (const f of ['haven.glb', 'haven.layout.json', 'haven.scene.json']) assert.ok(exists(`assets/maps/haven/${f}`), f);
  const L = JSON.parse(read('assets/maps/haven/haven.layout.json'));
  const kinds = L.markers.map(m => m.kind);
  assert.ok(kinds.includes('playerStart'));
  assert.ok(kinds.includes('missionLaunch'));
  assert.ok(L.colliders.length > 50, 'level has collision');
  assert.ok(L.waypoints && Object.keys(L.waypoints).length > 0, 'crowd has a waypoint graph');
  const g = glbJson('assets/maps/haven/haven.glb');
  assert.ok((g.extensionsUsed || []).includes('KHR_materials_unlit'), 'baked-light materials are unlit');
});

test('every Haven model URL and every layout prop resolves to a file', () => {
  const { HAVEN_MODELS } = havenData();
  for (const [k, url] of Object.entries(HAVEN_MODELS)) assert.ok(exists(url), `${k}: ${url}`);
  const L = JSON.parse(read('assets/maps/haven/haven.layout.json'));
  for (const p of new Set(L.props.map(p => p.model))) assert.ok(exists(`assets/models/haven/props/${p}.glb`), p);
});

test('crowd variant bases carry a variant recipe and a slot mask texture', () => {
  for (const f of ['couch_m', 'couch_f', 'serverless_m', 'serverless_f']) {
    const g = glbJson(`assets/models/haven/crowd/${f}.glb`);
    const x = g.scenes[0].extras || {};
    assert.ok(x.crowd && x.slots && x.palettes && x.clip_alias, `${f} extras`);
    assert.ok(g.textures.length >= 3, `${f} has the slot mask at texture 2`);
  }
});

test('Haven NPCs point at known models; Turing never swears', () => {
  const { HAVEN_MODELS, HAVEN_NPCS, HAVEN_TURING } = havenData();
  for (const n of Object.values(HAVEN_NPCS)) assert.ok(HAVEN_MODELS[n.model], `${n.name}: ${n.model}`);
  const bad = /\b(fuck\w*|shit\w*|damn\w*|hell|ass|asshole|bitch\w*|crap\w*)\b/i;
  for (const line of HAVEN_TURING) assert.doesNotMatch(line, bad, line);
});

test('music cues exist and loop points sit on the bar grid', () => {
  const C = JSON.parse(read('assets/audio/music/cues.json'));
  assert.equal(C.bpm, 120);
  for (const name of ['title', 'hub', 'combat', 'boss', 'deploy', 'outro']) {
    const c = C.cues[name];
    assert.ok(c, name);
    assert.ok(exists(`assets/audio/music/${c.file}`), c.file);
    if (c.loop) {
      assert.ok(c.loopEnd > c.loopStart);
      const bars = (c.loopEnd - c.loopStart) / C.barSeconds;
      assert.ok(Math.abs(bars - Math.round(bars)) < 1e-6, `${name} loop is whole bars`);
    }
  }
});
