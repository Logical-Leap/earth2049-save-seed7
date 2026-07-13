'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8');
const assets = fs.readFileSync(path.join(root, 'js/assets.js'), 'utf8');
const world = fs.readFileSync(path.join(root, 'js/world.js'), 'utf8');
const generatedScene = fs.readFileSync(path.join(root, 'assets/scenes/districts/shillz-central.scene.json'), 'utf8');

const forbiddenRuntimeCopy = [
  'RESIST™',
  'SPONSORED REVOLUTION',
  'CLAP 4\\nCHANGE',
  'REBEL_GRAFFITI_ALLEY',
  'THE FEED\\nIS A LIE',
  'RESIST? LOL.',
];

const approvedLoyalistCopy = [
  'GIGACORP PROVIDES',
  'ORDER IS FREEDOM',
  'OBEDIENCE BUILDS PEACE',
  'REPORT DISSENT',
  'CONSUME WITH PRIDE',
  'LOYALTY EARNS REWARDS',
  'PROTECT THE SYSTEM',
  'REBELLION COSTS JOBS',
];

test('ShillZ runtime and procedural fallback contain no rebel/counter-resistance identity', () => {
  const runtime = [config, assets, world].join('\n');
  for (const phrase of forbiddenRuntimeCopy) {
    assert.doesNotMatch(runtime, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `forbidden ShillZ copy remains: ${phrase}`);
  }
});

test('ShillZ runtime data uses explicit pro-GigaCorp loyalist slogans and Riya identity', () => {
  const runtime = [config, assets, world, generatedScene].join('\n');
  for (const phrase of approvedLoyalistCopy) assert.match(runtime, new RegExp(phrase));
  assert.match(config, /title:'The Signal Witch — Loyalty Icon'/);
});
