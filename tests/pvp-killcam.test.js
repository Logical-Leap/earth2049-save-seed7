'use strict';
// Crash at the end of a GigaLeague match (Nov 19): the Clip of the Match ended, tick() set killcam = null,
// then called deathLabel() in the same frame, which read killcam.num -> TypeError, the frame loop died.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pvp = fs.readFileSync(path.join(__dirname, '..', 'js/arena/arena-pvp.js'), 'utf8');

function deathLabelWith(killcam) {
  const start = pvp.indexOf('  function deathLabel() {');
  const end = pvp.indexOf('/* ===', start);
  assert.ok(start > 0 && end > start, 'deathLabel() found');
  const el = { style: {}, innerHTML: '', _h: '' };
  const ctx = {
    killcam, remotes: new Map(), el,
    hudEl: () => el, hud: { querySelector: () => null },
    esc: s => String(s), nameOf: n => 'P' + n,
  };
  vm.runInNewContext(pvp.slice(start, end) + '\ndeathLabel();', ctx);
  return el;
}

test('deathLabel() survives the killcam being cleared, and hides the card', () => {
  const el = deathLabelWith(null);
  assert.equal(el.style.display, 'none');
});

test('deathLabel() still labels a live killcam', () => {
  const el = deathLabelWith({ mode: 'live', num: 0 });
  assert.equal(el.style.display, 'block');
  assert.match(el.innerHTML, /NOBODY TO BLAME/);
});

test('tick() only labels the death cam if the clip did not end this frame', () => {
  assert.match(pvp, /if \(killcam\) deathLabel\(\); else hudEl\('kc'\)\.style\.display = 'none';/);
});
