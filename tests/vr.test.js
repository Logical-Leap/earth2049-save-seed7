'use strict';
// WebXR wiring: the loop runs on the renderer, XR renders directly, every mode drives the rig, and the dev emulator
// is only ever loaded on request.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('the game loop is the renderer loop (window rAF stops inside a headset) and XR skips the composer', () => {
  const g = read('js/game.js');
  assert.match(g, /renderer\.setAnimationLoop\(frame\)/);
  assert.doesNotMatch(g, /requestAnimationFrame\(frame\)/);
  assert.match(g, /if \(renderer\.xr\.isPresenting\) renderer\.render\(scene, camera\);\s*\/\/[^\n]*\n\s*else composer\.render\(\);/);
  assert.match(g, /window\.VR\?\.poll\(dt\)/);
});

test('every mode hands its player to the rig, and aims from the hand', () => {
  const g = read('js/game.js'), a = read('js/arena/arena-player.js');
  assert.match(g, /VR\.place\(\{ x: p\.pos\.x, y: p\.pos\.y, z: p\.pos\.z \}\)/, 'Haven and districts');
  assert.match(g, /VR\.place\(\{ x: 0, y: 5, z: 26 \}\)/, 'title');
  assert.match(a, /VR\.place\(\{ x: b\.pos\.x, y: b\.pos\.y, z: b\.pos\.z \}\)/, 'arena');
  assert.match(g, /VR\.consumeWalk\(\)/); assert.match(a, /VR\.consumeWalk\(\)/);
  assert.match(g, /function aimRay\(pos, dir\)/);
  assert.match(a, /VR\.aim\(_vrO, _vrD\)/);
  assert.match(a, /function vrTick\(vr, rdt\)/);
});

test('VR module: reference-space locomotion, menus mirrored from the pad layer, wrist HUD, comfort', () => {
  const v = read('js/vr.js');
  assert.match(v, /getOffsetReferenceSpace\(t\)/);
  assert.match(v, /getViewerPose\(S\.base\)/, 'head read in the physical space, independent of our offsets');
  assert.match(v, /window\.Pad\?\.layer\?\.\(\)/);
  assert.match(v, /it\.n\.click\(\)/);
  for (const k of ['vrSmoothTurn', 'vrVignette']) assert.ok(v.includes(k), k);
  assert.match(read('js/gamepad.js'), /layer, items,/);
});

test('scripts: vr.js loads before the game; the emulator only with ?xremu=1', () => {
  const h = read('index.html'), at = f => h.indexOf(f);
  assert.ok(at('js/vr.js') > at('lib/three.min.js') && at('js/vr.js') < at('js/game.js'));
  assert.match(h, /if \(\/\[\?&\]xremu=1\\b\/\.test\(location\.search\)\) document\.write\('<script src="tools\/iwer\/iwer\.min\.js">/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'tools/iwer/LICENSE')), 'IWER license ships with the vendored build');
  assert.match(h, /id="btnVR"/); assert.match(h, /id="btnVRPause"/);
});
