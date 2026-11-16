'use strict';
// The cloud-save client: the sync decision table, the device label, and that the idle game carries the same copy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../js/cloud-save.js');
const { plan, hash, deviceName, ago } = C._;

test('sync plan: upload, download, nothing, or ask the player', () => {
  const h = 'abc';
  assert.equal(plan(0, null, h, false), 'upload', 'empty cloud: this device uploads');
  assert.equal(plan(0, { rev: 4, hash: h }, h, false), 'upload', 'cloud emptied elsewhere: upload again');
  assert.equal(plan(3, null, h, true), 'download', 'new device with nothing on it: take the cloud save');
  assert.equal(plan(3, null, h, false), 'choose', 'new device that already has progress: ask');
  assert.equal(plan(3, { rev: 3, hash: h }, h, false), 'none');
  assert.equal(plan(3, { rev: 3, hash: h }, 'changed', false), 'upload');
  assert.equal(plan(5, { rev: 3, hash: h }, h, false), 'download', 'another device saved, this one did not change');
  assert.equal(plan(5, { rev: 3, hash: h }, 'changed', false), 'choose', 'both moved on: ask');
  assert.equal(plan(2, { rev: 3, hash: h }, h, false), 'choose', 'cloud went backwards: ask');
});

test('hash is stable and sensitive', () => {
  assert.equal(hash('{"gt":1}'), hash('{"gt":1}'));
  assert.notEqual(hash('{"gt":1}'), hash('{"gt":2}'));
});

test('device names are short and human', () => {
  assert.equal(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'), 'Chrome on Mac');
  assert.equal(deviceName('Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/35.0 Chrome/130.0 VR Safari/537.36'), 'Chrome on Quest');
  assert.equal(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), 'Safari on iOS');
  assert.equal(ago(Date.now() - 5 * 60e3), '5 min ago');
});

test('the idle game carries the same client, and the FPS loads it', () => {
  const root = path.join(__dirname, '..');
  const lib = fs.readFileSync(path.join(root, 'js/cloud-save.js'), 'utf8');
  const idle = fs.readFileSync(path.join(root, 'idle/index.html'), 'utf8');
  assert.ok(idle.includes(lib.trim()), 'idle/index.html has this exact cloud-save.js (run sync-cloud-save in the idle repo, then sync-idle here)');
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /js\/cloud-save\.js\?v=/);
  assert.match(fs.readFileSync(path.join(root, 'js/game.js'), 'utf8'), /slot: 'fps'/);
});
