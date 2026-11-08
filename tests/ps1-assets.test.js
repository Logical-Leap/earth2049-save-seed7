'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/asset-manifest.json'), 'utf8')).models;
const source = JSON.parse(fs.readFileSync(path.join(root, 'assets/models/ps1/SOURCE.json'), 'utf8'));

test('every manifest model exists and stays inside the PS1 size budget', () => {
  for (const [id, url] of Object.entries(manifest)) {
    const file = path.join(root, url);
    assert.ok(fs.existsSync(file), `${id} -> ${url} is missing`);
    assert.ok(fs.statSync(file).size < 1024 * 1024, `${id} is over 1 MB`);
  }
});

test('PS1 models are traceable to a game-art-pipeline commit', () => {
  assert.equal(source.repo, 'Logical-Leap/game-art-pipeline');
  assert.match(source.commit, /^[0-9a-f]{40}$/);
  for (const url of new Set(Object.values(manifest))) {
    if (url.startsWith('assets/models/ps1/')) assert.ok(source.files.includes(url), `${url} not recorded in SOURCE.json`);
  }
});

// Props-kit units (drone, sentinel) have no clips; the game animates their leg_/spin_ nodes.
const UNITS = ['cryptid_drone', 'bots_sentinel'];
const isUnit = url => UNITS.some(u => url.endsWith(`/${u}.glb`));

test('every PS1 character carries the clips the game drives', () => {
  for (const url of new Set(Object.values(manifest).filter(u => u.includes('/characters/') && !isUnit(u)))) {
    const b = fs.readFileSync(path.join(root, url));
    const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
    const names = new Set((json.animations || []).map(a => a.name));
    for (const clip of ['Idle Combat', 'Walk', 'Run', 'Punch Combo', 'Shoot', 'Hit React', 'Death']) {
      assert.ok(names.has(clip), `${url} has no ${clip} clip`);
    }
  }
});

test('runtime district textures are PS1-scale', () => {
  const dir = path.join(root, 'assets/textures');
  for (const f of fs.readdirSync(dir).filter(n => /_texture\d+\.png$/.test(n))) {
    assert.ok(fs.statSync(path.join(dir, f)).size < 200 * 1024, `${f} is larger than a 256px palette texture should be`);
  }
});

test('props-kit units expose the nodes the game animates', () => {
  const nodes = url => {
    const b = fs.readFileSync(path.join(root, url));
    return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()).nodes.map(n => n.name);
  };
  assert.equal(nodes(manifest['enemy.sentinel']).filter(n => /^leg_\d$/.test(n)).length, 4);
  assert.ok(nodes(manifest['enemy.cdrone']).some(n => n.startsWith('spin_')));
});
