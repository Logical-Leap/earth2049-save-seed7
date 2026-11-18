'use strict';
// Playtest batch 3: static guards for the fixes (the browser checks are in scripts/qa/playtest3-e2e.mjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the Fitting Room saves on close and keeps only owned pieces', () => {
  const s = read('js/avatar-creator.js');
  assert.match(s, /function close\(\) \{ finish\(commit\(\)\); \}/);
  assert.match(s, /if \(!K\(\)\.isOwned\(id\)\)\s+L\.items\[c\] = start/);
});
test('the first-person body steps back when looking down and clears the lens', () => {
  const s = read('js/fp-body.js');
  assert.match(s, /const NEAR = 0\.16;/);
  assert.match(s, /function clearLens\(s\)/);
  assert.match(read('js/game.js'), /FPBody\?\.setCamera\?\.\(camera\)/);
});
test('Play in VR is always on the title and the VR options are not hidden', () => {
  const h = read('index.html');
  assert.match(h, /<div class="btn" id="btnVR">Play in VR<\/div>/);
  assert.match(h, /id="ovVR"/);
  assert.doesNotMatch(h, /class="optrow vrrow"/);
});
test('dialogue: clickable options, and losing the mouse to a dialogue never pauses', () => {
  const h = read('index.html'), g = read('js/game.js');
  assert.match(h, /#havenDlg\.show\{[^}]*pointer-events:auto/);
  assert.match(g, /!window\.VR\?\.active && !uiHoldsMouse\(\)\) setPaused\(true\)/);
});
test('kill bursts chain once at most', () => {
  const e = read('js/arena/arena-enemies.js'), g = read('js/game.js');
  assert.match(e, /const VOLATILE = \{ dmg: 24, radius: 3 \}/);
  assert.match(e, /AR\.Player\.S\.volatile && depth <= 1/);
  assert.match(g, /p\.mods\.volatile && volatileDepth <= 1/);
});
test('GigaLeague has a one-button quick match across playlists', () => {
  assert.match(read('js/pvp/pvp-menu.js'), /data-qp="any">QUICK MATCH</);
  assert.match(read('workers/coop-worker.js'), /any = !\['core','classic','party'\]\.includes\(body\.playlist\)/);
});
