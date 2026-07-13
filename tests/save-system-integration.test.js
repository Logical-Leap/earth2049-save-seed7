'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const game = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');

test('SaveSystem loads before game runtime', () => {
  const saveScript = html.indexOf('js/save-system.js');
  const gameScript = html.indexOf('js/game.js');
  assert.ok(saveScript >= 0);
  assert.ok(saveScript < gameScript);
});

test('game integrates versioned load, persistence and catalog validation', () => {
  assert.match(game, /SaveSystem\.load\(localStorage/);
  assert.match(game, /SaveSystem\.persist\(localStorage, SAVE\)/);
  assert.match(game, /upgrades: Object\.fromEntries\(METAUP/);
  assert.match(game, /corruptionUpgrades: Object\.fromEntries\(CORRUPTION_UPGRADES/);
  assert.match(game, /relicIds: Object\.values\(BOSS_RELICS\)/);
});

test('Armory exposes safe export, import and reset controls', () => {
  assert.match(game, /\['body','Body'\].*\['save','Save'\]/s);
  assert.match(game, /saveWriteBlocked && futureSaveRaw \? futureSaveRaw : SaveSystem\.exportSave\(SAVE\)/);
  assert.match(game, /SaveSystem\.importSave\(/);
  assert.match(game, /SaveSystem\.reset\(/);
  assert.match(game, /if \(!result\.ok\).*original save was not replaced/s);
});

test('future saves remain read-only and retain raw export payload', () => {
  assert.match(game, /futureSaveRaw = result\.futureRaw \|\| null/);
  assert.match(game, /unsupported-future-version/);
  assert.match(game, /saveWriteBlocked/);
});
