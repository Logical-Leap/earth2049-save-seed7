'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const {
  collectAssetReferences,
  sceneObject,
  validateAssetReference,
  validateSceneData,
} = require('../scripts/qa/scene-validator.js');

function object(uuid, name, gameplayType, y = 1) {
  return {
    uuid,
    type: 'Object3D',
    name,
    position: [0, y, 0],
    scale: [1, 1, 1],
    userData: gameplayType ? { gameplayType } : {},
  };
}

function combatRoot() {
  return {
    uuid: 'root',
    type: 'Scene',
    name: 'Fixture',
    children: [
      object('player', 'E2049_PLAYER_START', 'playerStart'),
      object('objective', 'E2049_OBJECTIVE_FIXTURE', 'objective'),
      object('boss', 'E2049_BOSS_ARENA_FIXTURE', 'bossArena'),
      object('exit', 'E2049_EXTRACTION_GATE_FIXTURE', 'extractionGate'),
      object('enemy', 'E2049_ENEMY_SPAWN_FIXTURE', 'enemySpawn'),
      object('pickup', 'E2049_PICKUP_SPAWN_FIXTURE', 'pickupSpawn'),
    ],
  };
}

const bossContract = {
  mapType: 'boss-combat',
  requiredMarkers: ['playerStart', 'objective', 'bossArena', 'extractionGate', 'enemySpawn', 'pickupSpawn'],
  requiredIds: ['E2049_PLAYER_START'],
};

test('parses direct, Object JSON, and editor-wrapped scene roots', () => {
  const root = combatRoot();
  assert.equal(sceneObject(root), root);
  assert.equal(sceneObject({ object: root }), root);
  assert.equal(sceneObject({ scene: { object: root } }), root);
  assert.equal(sceneObject({ scene: root }), root);
  for (const fixture of [root, { object: root }, { scene: { object: root } }, { scene: root }]) {
    assert.deepEqual(validateSceneData(fixture, bossContract).errors, []);
  }
});

test('enforces unique IDs, canonical markers, finite scales, and above-ground spawn points', () => {
  const root = combatRoot();
  root.children[1].uuid = 'player';
  root.children[2].name = 'boss-without-prefix';
  root.children[4].position[1] = -0.01;
  root.children[5].scale[0] = Number.POSITIVE_INFINITY;
  const errors = validateSceneData({ object: root }, bossContract).errors.join('\n');
  assert.match(errors, /duplicate object UUID: player/);
  assert.match(errors, /must use the E2049_ canonical ID prefix/);
  assert.match(errors, /enemySpawn is below ground/);
  assert.match(errors, /scale must contain three finite numbers/);
});

test('enforces marker sets by map type', () => {
  const root = combatRoot();
  root.children = root.children.filter(child => child.userData.gameplayType !== 'objective');
  assert.match(validateSceneData({ object: root }, bossContract).errors.join('\n'), /missing required objective marker/);
});

test('validates referenced files and GLB headers/lengths', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'earth2049-qa-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(temp, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'assets', 'ok.json'), '{}');
  const glb = Buffer.alloc(12);
  glb.write('glTF', 0, 'ascii');
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(12, 8);
  fs.writeFileSync(path.join(temp, 'assets', 'ok.glb'), glb);
  assert.equal(validateAssetReference(temp, 'assets/ok.json'), null);
  assert.equal(validateAssetReference(temp, 'assets/ok.glb'), null);
  assert.match(validateAssetReference(temp, 'assets/missing.glb'), /missing asset reference/);
  glb.writeUInt32LE(99, 8);
  fs.writeFileSync(path.join(temp, 'assets', 'bad.glb'), glb);
  assert.match(validateAssetReference(temp, 'assets/bad.glb'), /invalid GLB length/);
  assert.deepEqual(collectAssetReferences({ visualAssetUrl: 'assets/ok.glb' }), ['assets/ok.glb']);
});

test('scene manifest generation is idempotent and check mode is read-only', () => {
  const root = path.resolve(__dirname, '..');
  const manifestPath = path.join(root, 'assets/data/scene-manifest.json');
  const before = fs.readFileSync(manifestPath, 'utf8');
  execFileSync(process.execPath, ['scripts/build-scene-manifest.js'], { cwd: root });
  const afterBuild = fs.readFileSync(manifestPath, 'utf8');
  execFileSync(process.execPath, ['scripts/build-scene-manifest.js', '--check'], { cwd: root });
  const afterCheck = fs.readFileSync(manifestPath, 'utf8');
  assert.equal(afterBuild, before, 'generatedAt or content drifted on an unchanged manifest');
  assert.equal(afterCheck, before, '--check modified the manifest');
});
