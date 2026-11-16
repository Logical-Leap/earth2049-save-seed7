'use strict';
// Phone play: the mission touch controls feed the same inputs as keyboard and controller, wake only on touch, stay
// out of VR, and the HUD makes room for them only while they are showing. (scripts/qa/phone-e2e.mjs plays it.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('touch input rides the existing movement, sprint and aim-assist code', () => {
  const player = read('js/arena/arena-player.js');
  assert.match(player, /\+ I\.padX \+ I\.touchX/);
  assert.match(player, /\+ I\.padZ \+ I\.touchZ/);
  assert.match(player, /I\.padSprint \|\| I\.touchSprint/);
  assert.match(player, /padTick, vrTick, assistTarget,/);
  assert.match(player, /touchX: 0, touchZ: 0, touchSprint: false \}\); \}/, 'clearInput resets touch input too');
});

test('touch controls wake only on a touch, never in VR, and give up pointer lock', () => {
  const t = read('js/arena/arena-touch.js'), main = read('js/arena/arena-main.js');
  assert.match(t, /function wake\(e\) \{\n\s+if \(on \|\| !AR\.active \|\| window\.VR\?\.active \|\| !touchCapable\(\)\) return;/);
  assert.match(t, /addEventListener\('touchstart', wake/);
  assert.match(t, /addEventListener\('keydown', e => \{ if \(on && !e\.repeat && e\.isTrusted\) sleep\(\); \}/, 'a keyboard puts them away');
  assert.match(t, /addEventListener\('gamepadconnected', sleep\)/, 'so does a controller');
  assert.match(t, /!window\.VR\?\.active/);
  assert.match(main, /window\.VR\?\.active \|\| AR\.Touch\?\.on\) return;/);
  assert.match(main, /AR\.Touch\?\.tick\(rdt\)/);
  assert.match(main, /AR\.Touch\?\.sleep\(\)/);
});

test('page: script loaded before the arena runtime; the HUD shifts only under body.ar-touch', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('js/arena/arena-touch.js') > 0 && html.indexOf('js/arena/arena-touch.js') < html.indexOf('js/arena/arena-main.js'));
  for (const rule of html.match(/[^\n}]*#arHud \.(br|chat)\{[^}]*\}/g).filter(r => /translateX|scale/.test(r))) assert.match(rule, /body\.ar-touch/);
  assert.match(html, /@media \(orientation:portrait\)\{body\.touch\.inrun #rotateNote,body\.ar-touch #rotateNote\{display:flex;\}\}/);
});
