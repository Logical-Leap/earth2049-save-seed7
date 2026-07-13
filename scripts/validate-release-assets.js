#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  collectAssetReferences,
  validateAssetReference,
  validateSceneData,
} = require('./qa/scene-validator.js');

const rootDir = path.resolve(__dirname, '..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(rootDir, relative), 'utf8'));
const manifest = readJson('assets/data/scene-manifest.json');
const contracts = readJson('assets/data/scene-contracts.json');
const errors = [];
const ids = new Set();
const urls = new Set();
let objectCount = 0;
let referenceCount = 0;

if (!Array.isArray(manifest.scenes) || manifest.scenes.length === 0) errors.push('scene manifest has no scenes');
for (const entry of manifest.scenes || []) {
  const context = `scene ${entry.id || '<missing-id>'}`;
  if (!entry.id || ids.has(entry.id)) errors.push(`${context}: missing or duplicate manifest ID`);
  ids.add(entry.id);
  if (!entry.sceneUrl || urls.has(entry.sceneUrl)) errors.push(`${context}: missing or duplicate sceneUrl`);
  urls.add(entry.sceneUrl);

  const mapType = contracts.scenes?.[entry.id];
  const contract = contracts.mapTypes?.[mapType];
  if (!contract) {
    errors.push(`${context}: no valid map type contract`);
    continue;
  }
  const scenePath = path.join(rootDir, entry.sceneUrl || '');
  if (!fs.existsSync(scenePath)) {
    errors.push(`${context}: missing scene file ${entry.sceneUrl}`);
    continue;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
  } catch (error) {
    errors.push(`${context}: invalid JSON: ${error.message}`);
    continue;
  }
  const result = validateSceneData(data, { ...contract, mapType });
  objectCount += result.objects.length;
  for (const error of result.errors) errors.push(`${context}: ${error}`);
  for (const reference of new Set(collectAssetReferences(data))) {
    referenceCount += 1;
    const error = validateAssetReference(rootDir, reference);
    if (error) errors.push(`${context}: ${error}`);
  }
}

for (const contractId of Object.keys(contracts.scenes || {})) {
  if (!ids.has(contractId)) errors.push(`scene contract ${contractId} is not present in scene-manifest.json`);
}

const assetManifest = readJson('assets/data/asset-manifest.json');
(function visitAssets(value, keyPath = 'asset-manifest') {
  if (typeof value === 'string') {
    if (value.startsWith('assets/')) {
      referenceCount += 1;
      const error = validateAssetReference(rootDir, value);
      if (error) errors.push(`${keyPath}: ${error}`);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) visitAssets(child, `${keyPath}.${key}`);
})(assetManifest);

if (errors.length) {
  console.error(`Release asset QA failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(` - ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Release asset QA passed: ${ids.size} scenes, ${objectCount} objects, ${referenceCount} file references.`);
}
