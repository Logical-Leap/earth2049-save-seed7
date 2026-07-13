'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const game = fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8');

test('acceptance observer is localhost/query gated and exposes snapshots only', () => {
  assert.match(game, /acceptanceParams\.get\('acceptance'\) === '1'/);
  assert.match(game, /localhost|127\.0\.0\.1/);
  assert.match(game, /__E2049_ACCEPTANCE__/);
  assert.match(game, /Object\.freeze\(\{ snapshot: acceptanceSnapshot \}\)/);
  assert.doesNotMatch(game, /__E2049_ACCEPTANCE__[\s\S]{0,300}(kill|teleport|complete|grant|spawn)\s*:/i);
});

test('acceptance snapshot reports production phase, player, boss, objective, extraction and save state', () => {
  for (const field of ['phase', 'player', 'boss', 'objective', 'extraction', 'save']) {
    assert.match(game, new RegExp(`${field}:`));
  }
});

test('acceptance snapshot reads ammunition from the equipped production weapon', () => {
  assert.match(game, /const weapon = player\?\.weapons\[player\.cur\]/);
  assert.match(game, /ammo:weapon\?\.ammo/);
  assert.doesNotMatch(game, /player\.ammo\[player\.cur\]/);
});

test('localhost acceptance input adapter preserves production pointer-lock behavior', () => {
  assert.match(game, /const acceptanceInputEnabled = acceptanceHost && acceptanceParams\.get\('acceptance'\) === '1'/);
  assert.match(game, /document\.pointerLockElement !== cv && !acceptanceInputEnabled/);
  assert.match(game, /document\.pointerLockElement === cv \|\| acceptanceInputEnabled/);
});
