#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MARKER_PREFIX = 'E2049_';
const MARKER_TYPES = new Set([
  'playerStart', 'enemySpawn', 'droneSpawn', 'pickupSpawn', 'objective',
  'bossArena', 'extractionGate', 'entryGate', 'combatZone', 'hazardZone',
]);

function sceneObject(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.object) return data.object;
  if (data.scene?.object) return data.scene.object;
  if (data.scene) return data.scene;
  if (data.type === 'Scene' || data.type === 'Group' || Array.isArray(data.children)) return data;
  return null;
}

function walkObjects(root) {
  const objects = [];
  (function visit(object) {
    if (!object || typeof object !== 'object') return;
    objects.push(object);
    for (const child of object.children || []) visit(child);
  })(root);
  return objects;
}

function markerType(object) {
  const explicit = object?.userData?.gameplayType;
  if (explicit) return explicit;
  const name = String(object?.name || '');
  if (/^E2049_PLAYER_START(?:_|$)/.test(name)) return 'playerStart';
  if (/^E2049_ENEMY_SPAWN(?:_|$)/.test(name)) return 'enemySpawn';
  if (/^E2049_PICKUP_SPAWN(?:_|$)/.test(name)) return 'pickupSpawn';
  if (/^E2049_OBJECTIVE_(?!PROP)/.test(name)) return 'objective';
  if (/^E2049_BOSS_ARENA(?:_|$)/.test(name)) return 'bossArena';
  if (/^E2049_EXTRACTION_(?:GATE|ZONE)(?:_|$)/.test(name)) return 'extractionGate';
  return null;
}

function objectY(object) {
  if (Array.isArray(object?.position)) return Number(object.position[1]);
  if (Array.isArray(object?.matrix) && object.matrix.length === 16) return Number(object.matrix[13]);
  return 0;
}

function validateUniqueUuids(items, label, errors) {
  const seen = new Set();
  for (const item of items || []) {
    if (!item || typeof item !== 'object' || !item.uuid) continue;
    if (seen.has(item.uuid)) errors.push(`duplicate ${label} UUID: ${item.uuid}`);
    seen.add(item.uuid);
  }
  return seen;
}

function validateSceneData(data, options = {}) {
  const errors = [];
  const root = sceneObject(data);
  if (!root) return { errors: ['missing scene object (expected object, scene.object, scene, or direct Object JSON)'], objects: [], markers: new Map() };
  if (!root.uuid) errors.push('scene root is missing UUID');
  const objects = walkObjects(root);
  const objectUuids = validateUniqueUuids(objects, 'object', errors);
  const geometryUuids = validateUniqueUuids(data.geometries || data.scene?.geometries, 'geometry', errors);
  const materialUuids = validateUniqueUuids(data.materials || data.scene?.materials, 'material', errors);
  validateUniqueUuids(data.images || data.scene?.images, 'image', errors);
  validateUniqueUuids(data.textures || data.scene?.textures, 'texture', errors);

  const markers = new Map();
  const markerNames = new Set();
  for (const object of objects) {
    if (Array.isArray(object.scale)) {
      if (object.scale.length !== 3 || object.scale.some(value => !Number.isFinite(Number(value)))) {
        errors.push(`${object.name || object.uuid || '<unnamed>'}: scale must contain three finite numbers`);
      }
    }
    if (Array.isArray(object.matrix) && object.matrix.some(value => !Number.isFinite(Number(value)))) {
      errors.push(`${object.name || object.uuid || '<unnamed>'}: matrix contains a non-finite value`);
    }
    if (object.geometry && !geometryUuids.has(object.geometry)) {
      errors.push(`${object.name || object.uuid}: unknown geometry UUID ${object.geometry}`);
    }
    const materialRefs = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const ref of materialRefs) if (!materialUuids.has(ref)) errors.push(`${object.name || object.uuid}: unknown material UUID ${ref}`);

    const type = markerType(object);
    if (type) {
      if (!markers.has(type)) markers.set(type, []);
      markers.get(type).push(object);
      const name = String(object.name || '');
      if (MARKER_TYPES.has(type) && !name.startsWith(MARKER_PREFIX)) {
        errors.push(`${object.name || object.uuid}: ${type} marker must use the ${MARKER_PREFIX} canonical ID prefix`);
      }
      if (name.startsWith(MARKER_PREFIX)) {
        if (markerNames.has(name)) errors.push(`duplicate canonical marker ID: ${name}`);
        markerNames.add(name);
      }
      if ((type === 'playerStart' || type === 'enemySpawn' || type === 'droneSpawn' || type === 'pickupSpawn') && objectY(object) < 0) {
        errors.push(`${object.name || object.uuid}: ${type} is below ground (y=${objectY(object)})`);
      }
    }
  }

  for (const required of options.requiredMarkers || []) {
    if (!(markers.get(required)?.length > 0)) errors.push(`missing required ${required} marker for ${options.mapType || 'scene'} map`);
  }
  for (const requiredName of options.requiredIds || []) {
    if (!objects.some(object => object.name === requiredName)) errors.push(`missing required canonical ID ${requiredName}`);
  }

  return { errors, objects, markers, objectUuids };
}

function collectAssetReferences(value, output = [], key = '') {
  if (typeof value === 'string') {
    if ((key === 'url' || /(?:Url|URL|Path)$/.test(key)) && (value.startsWith('assets/') || /\.glb(?:$|[?#])/.test(value))) output.push(value);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  for (const [childKey, child] of Object.entries(value)) collectAssetReferences(child, output, childKey);
  return output;
}

function validateAssetReference(rootDir, reference) {
  if (/^(?:data:|https?:|blob:)/.test(reference)) return null;
  const clean = reference.split(/[?#]/, 1)[0];
  const absolute = path.resolve(rootDir, clean);
  if (absolute !== rootDir && !absolute.startsWith(rootDir + path.sep)) return `asset reference escapes repository: ${reference}`;
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return `missing asset reference: ${reference}`;
  if (clean.toLowerCase().endsWith('.glb')) {
    const file = fs.readFileSync(absolute);
    if (file.length < 12 || file.toString('ascii', 0, 4) !== 'glTF') return `invalid GLB header: ${reference}`;
    const declaredLength = file.readUInt32LE(8);
    if (declaredLength !== file.length) return `invalid GLB length: ${reference} declares ${declaredLength}, file is ${file.length}`;
  }
  return null;
}

module.exports = {
  collectAssetReferences,
  markerType,
  objectY,
  sceneObject,
  validateAssetReference,
  validateSceneData,
  walkObjects,
};
