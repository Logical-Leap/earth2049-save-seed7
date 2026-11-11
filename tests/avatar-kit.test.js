'use strict';
// The player avatar kit (js/avatar.js) must match its catalog: every item has pieces in its kit, every kit file
// exists and is traceable to the art pipeline, and the bodies carry the clips the creator and the game play.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dir = 'assets/models/ps1/avatar';
const catalog = JSON.parse(fs.readFileSync(path.join(root, dir, 'catalog.json'), 'utf8'));
const source = JSON.parse(fs.readFileSync(path.join(root, 'assets/models/ps1/SOURCE.json'), 'utf8'));
const glb = f => { const b = fs.readFileSync(path.join(root, dir, f)); return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()); };

test('every avatar kit file exists, stays small and is recorded in SOURCE.json', () => {
  for (const sex of ['m', 'f']) for (const kit of ['base', ...catalog.kits]) {
    const url = `${dir}/avatar_${sex}_${kit}.glb`;
    assert.ok(fs.existsSync(path.join(root, url)), `${url} is missing`);
    assert.ok(fs.statSync(path.join(root, url)).size < 1024 * 1024, `${url} is over 1 MB`);
    assert.ok(source.files.includes(url), `${url} not recorded in SOURCE.json`);
  }
  assert.ok(source.files.includes(`${dir}/catalog.json`));
});

test('every catalog item has its pieces in its kit (or is a bare default)', () => {
  const kitOf = Object.fromEntries(catalog.categories.map(c => [c.id, c.kit]));
  for (const sex of ['m', 'f']) {
    const nodes = {};
    for (const kit of catalog.kits) nodes[kit] = new Set(glb(`avatar_${sex}_${kit}.glb`).nodes.map(n => n.name));
    for (const it of catalog.items[sex]) {
      const has = [...nodes[kitOf[it.cat]]].some(n => n.startsWith(it.id + '@'));
      assert.ok(has || it.default, `${sex} ${it.id} has no pieces in the ${kitOf[it.cat]} kit`);
    }
    for (const c of catalog.categories) assert.ok(catalog.items[sex].some(i => i.cat === c.id && i.default), `${sex} ${c.id} has no default`);
  }
});

test('avatar bodies carry the clips the creator and the game drive', () => {
  for (const sex of ['m', 'f']) {
    const j = glb(`avatar_${sex}_base.glb`);
    const clips = new Set((j.animations || []).map(a => a.name));
    for (const c of ['Idle', 'Idle Combat', 'Walk', 'Run', 'Shoot', 'Crouch Walk', 'Jump', 'Death', 'Hit React', 'Dance', 'Wave']) assert.ok(clips.has(c), `${sex} body has no ${c}`);
    const names = new Set(j.nodes.map(n => n.name));
    for (const b of ['head', 'hand_R', 'hand_L', 'foot_L', 'foot_R']) assert.ok(names.has(b), `${sex} body has no ${b} bone`);
  }
});

test('default loadout colours exist in the palettes', () => {
  for (const [slot, name] of Object.entries(catalog.defaults)) assert.ok(catalog.palettes[slot].some(p => p.name === name), `${slot}: ${name}`);
});
