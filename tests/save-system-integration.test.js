'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const game = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');

const saveScript = html.indexOf('js/save-system.js');
const gameScript = html.indexOf('js/game.js');
assert.ok(saveScript >= 0, 'save-system script is loaded');
assert.ok(saveScript < gameScript, 'save-system loads before game');
assert.match(game, /SaveSystem\.load\(localStorage/);
assert.match(game, /SaveSystem\.persist\(localStorage, SAVE\)/);
assert.match(game, /\['body','Body'\].*\['save','Save'\]/s, 'Armory exposes Save tab');
assert.match(game, /SaveSystem\.exportSave\(SAVE\)/);
assert.match(game, /SaveSystem\.importSave\(/);
assert.match(game, /SaveSystem\.reset\(/);
assert.match(game, /function resetSaveData\(\)[\s\S]*SAVE = result\.save; saveWriteBlocked = false; saveLoadStatus = result\.status/);
assert.match(game, /unsupported-future-version/);
assert.match(game, /saveWriteBlocked/, 'future saves stay read-only until explicit import/reset');

console.log('save-system browser integration contract passed');
