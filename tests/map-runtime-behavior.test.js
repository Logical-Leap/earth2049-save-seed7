'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const Rules = require('../js/map-runtime-rules.js');
const hub = JSON.parse(fs.readFileSync(path.join(root, 'assets/scenes/districts/rebel-hub-haven-commons-final.scene.json'), 'utf8'));
const shillz = JSON.parse(fs.readFileSync(path.join(root, 'assets/scenes/districts/shillz-central.scene.json'), 'utf8'));

test('external authored scenes do not inherit the smaller procedural navigation grid', () => {
  assert.equal(Rules.usesProceduralGrid({ usingExternalScene: true }), false);
  assert.equal(Rules.usesProceduralGrid({ usingExternalScene: false }), true);
});

test('authored walkable stairs allow normal step-up and become support surfaces', () => {
  const stair = { x: 0, z: -24.5, sx: 4, sz: 2, y0: 0, h: 1, walkable: true, climb: false };
  assert.equal(Rules.playerColliderBlocks(stair, 0.5, 0.42, 1.7, 0.75), false);
  assert.equal(Rules.groundHeight([stair], 0, -24.5, 0.3, 0.5, 0.75), 1);

  const highDeck = { ...stair, h: 4.7 };
  assert.equal(Rules.playerColliderBlocks(highDeck, 0, 0.42, 1.7, 0.75), true);
  assert.equal(Rules.groundHeight([highDeck], 0, -24.5, 0.3, 0, 0.75), 0);
});

test('authored player yaw and service aliases are normalized at the map boundary', () => {
  const start = shillz.object.children.find(object => object.userData?.gameplayType === 'playerStart');
  assert.equal(Rules.markerYaw(start.userData, 0), Math.PI);
  assert.equal(Rules.normalizeInteractionType('characterCustomization'), 'customization');
  assert.equal(Rules.normalizeInteractionType('trainingZone'), 'trainingZone');
  assert.equal(Rules.normalizeInteractionType('missionBoard'), 'missionBoard');
  assert.equal(Rules.normalizeInteractionType('progressBoard'), 'progressBoard');
});

test('Hub southern corners have explicit collision overlap and cannot leak into the void', () => {
  const names = new Set([
    ...hub.object.children.map(object => object.name),
    ...Rules.hubCornerBlockers().map(collider => collider.name),
  ]);
  assert.ok(names.has('E2049_BLOCKER_HUB_SE_CORNER'));
  assert.ok(names.has('E2049_BLOCKER_HUB_SW_CORNER'));
});
