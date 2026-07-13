'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CampaignProgression = require('../js/progression-system.js');

const root = path.join(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
const world = fs.readFileSync(path.join(root, 'js/world.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scene = JSON.parse(fs.readFileSync(path.join(root, 'assets/scenes/districts/shillz-central.scene.json'), 'utf8'));

function gameplayCounts() {
  const counts = {};
  for (const object of scene.object.children) {
    const type = object.userData?.gameplayType;
    if (type) counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

test('persistent leader credit records every defeated faction exactly once', () => {
  const save = { intel: { shillz: { points: 12, leaders: 0 } } };
  assert.equal(CampaignProgression.recordLeaderDefeat(save, 'shillz'), true);
  assert.equal(CampaignProgression.recordLeaderDefeat(save, 'shillz'), false);
  CampaignProgression.recordLeaderDefeats(save, ['muskers', 'bots', 'cryptids', 'gigacorp', 'muskers']);
  for (const faction of ['shillz', 'muskers', 'bots', 'cryptids', 'gigacorp']) assert.equal(save.intel[faction].leaders, 1);
  assert.equal(save.intel.shillz.points, 12);
});

test('ShillZ Central is a clean, acceptance-sized Object JSON scene', () => {
  assert.equal(scene.metadata.type, 'Object');
  assert.equal(scene.object.type, 'Scene');
  assert.equal(scene.object.userData.faction, 'shillz');
  assert.match(scene.object.userData.canon, /pro-GigaCorp/);
  assert.ok(scene.object.children.length >= 90);
  const counts = gameplayCounts();
  for (const required of ['playerStart', 'objective', 'bossArena', 'extractionGate', 'combatZone']) assert.ok(counts[required] >= 1, required);
  assert.ok(counts.enemySpawn >= 10);
  assert.ok(counts.pickupSpawn >= 6);
  assert.ok(counts.cover >= 8);
  assert.ok(counts.routeHint >= 2);
  assert.ok(counts.traversal >= 1);
});

test('ShillZ loyalist environmental copy contains no Rebel/resistance identity', () => {
  const slogans = scene.object.children.filter(object => object.userData?.gameplayType === 'billboard').map(object => object.userData.text);
  assert.ok(slogans.includes('GIGACORP PROVIDES'));
  assert.ok(slogans.includes('REPORT DISSENT'));
  assert.ok(slogans.includes('REBELLION COSTS JOBS'));
  const copy = slogans.join(' ').toLowerCase();
  assert.doesNotMatch(copy, /fight the system|join the resistance|rebel symbol/);
});

test('runtime exposes authored interactions, objective and extraction markers', () => {
  assert.match(world, /get interactionPoints\(\)/);
  assert.match(world, /get objectivePoints\(\)/);
  assert.match(world, /get extractionPoints\(\)/);
  assert.match(game, /G\.phase = World\.objectivePoints\.length \? 'objective' : 'intro'/);
  assert.match(game, /G\.phase === 'extraction'/);
  assert.match(game, /newRun\(\{ hub:true \}\)/);
});

test('Hub services launch ShillZ and post-run primary actions return to Haven', () => {
  assert.match(game, /DEPLOY TO SHILLZ CENTRAL/);
  assert.match(game, /newRun\(\{ district:0, fromHub:true \}\)/);
  assert.match(game, /CampaignProgression\.recordLeaderDefeat/);
  assert.match(html, /id="btnRetry">Return to Rebel Haven/);
  assert.match(html, /id="btnVictRetry">Return to Rebel Haven/);
  assert.ok(html.indexOf('js/progression-system.js') < html.indexOf('js/game.js'));
});
