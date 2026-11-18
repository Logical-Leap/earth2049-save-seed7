'use strict';
// GigaLeague match server: message allowlist, host-only settings, and the settings / vote rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require(path.join(root, 'js/pvp/pvp-data.js'));
require(path.join(root, 'js/pvp/pvp-sim.js'));
// the Durable Object imports the sim and the generated maps; tests load only its pure helpers
const src = fs.readFileSync(path.join(root, 'workers/pvp-match.js'), 'utf8')
  .replace(/^import .*$/gm, '').replace("import { PVP_MAPS } from './pvp-maps.generated.js';", '');
const load = () => import('data:text/javascript;base64,' + Buffer.from('const PVP_MAPS = {};\n' + src).toString('base64'));

test('only known client messages are accepted, and server events are never on the list', async () => {
  const { PVP_CLIENT_TYPES } = await load();
  for (const t of ['s', 'ev', 'room', 'start', 'lobby', 'reward', 'end']) if (t !== 'start') assert.ok(!PVP_CLIENT_TYPES.includes(t), t);
  assert.ok(PVP_CLIENT_TYPES.includes('fire') && PVP_CLIENT_TYPES.includes('input'));
});

test('host settings are bounded against the content tables', async () => {
  const { sanitizeSettings } = await load();
  const s = sanitizeSettings({ mode: 'hacked', map: '../../etc', botSkill: 'god', custom: { scoreLimit: 1e9, hpMul: 99, oneGun: 'nuke', size: 50 } });
  assert.equal(s.mode, 'tdm'); assert.equal(s.map, 'plaza'); assert.equal(s.botSkill, 'regular');
  assert.equal(s.custom.scoreLimit, 500); assert.equal(s.custom.hpMul, 4); assert.equal(s.custom.oneGun, null); assert.equal(s.custom.size, 8);
});

test('the vote offers two different maps from the room\'s playlist', async () => {
  const { voteOptions } = await load();
  for (let i = 0; i < 20; i++) {
    const [a, b] = voteOptions('classic');
    assert.ok(PVP.PLAYLISTS.classic.modes.includes(a.mode) && PVP.PLAYLISTS.classic.modes.includes(b.mode));
    assert.notEqual(a.map, b.map);
  }
});
