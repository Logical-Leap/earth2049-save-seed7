#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'data', 'scene-manifest.json');
const SCAN_DIRS = [
  'assets/scenes/districts',
  'assets/levels',
];

const FACTION_DISTRICT = {
  shillz: 0,
  muskers: 1,
  bots: 2,
  cryptids: 3,
  gigacorp: 4,
};

function inferFaction(file, userData = {}) {
  const n = [userData.skyboxFaction, userData.faction, userData.district, userData.area, file].filter(Boolean).join(' ').toLowerCase();
  if (n.includes('rebel') || n.includes('haven') || n.includes('dead-zone') || n.includes('deadzone')) return 'rebels';
  if (n.includes('shillz') || n.includes('shill-')) return 'shillz';
  if (n.includes('musker')) return 'muskers';
  if (n.includes('bot')) return 'bots';
  if (n.includes('cryptid')) return 'cryptids';
  if (n.includes('gigacorp') || n.includes('giga-corp')) return 'gigacorp';
  return null;
}

function sceneObject(data) {
  return data?.object || data?.scene?.object || data?.scene || {};
}

function sceneLabel(file, data) {
  const sceneName = sceneObject(data)?.name || data?.metadata?.generator;
  if (sceneName) return 'Scene — ' + sceneName;
  const base = file.replace(/\.scene\.json$/i, '').replace(/[-_]+/g, ' ');
  return 'Scene — ' + base.replace(/\b\w/g, c => c.toUpperCase());
}

function sceneId(relPath) {
  return relPath
    .replace(/^assets\/(scenes\/districts|levels)\//, '')
    .replace(/\.scene\.json$/i, '')
    .replace(/[\\/]/g, '-');
}

const scenes = [];

for (const dir of SCAN_DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of fs.readdirSync(abs).filter(f => f.endsWith('.scene.json')).sort()) {
    const rel = (dir + '/' + file).replace(/\\/g, '/');
    const absFile = path.join(abs, file);
    let data = null;
    try {
      data = JSON.parse(fs.readFileSync(absFile, 'utf8'));
    } catch (err) {
      console.warn('Skipping invalid scene JSON:', rel, err.message);
      continue;
    }
    const object = sceneObject(data);
    const userData = object?.userData || {};
    if (userData.collisionOnly === true) continue;
    const faction = inferFaction(file, userData);
    if (!faction) {
      console.warn('Skipping scene with unresolved faction:', rel);
      continue;
    }
    scenes.push({
      id: sceneId(rel),
      label: sceneLabel(file, data),
      sceneUrl: rel,
      faction,
      district: FACTION_DISTRICT[faction] ?? 0,
    });
  }
}

const manifest = {
  generatedAt: new Date().toISOString(),
  scenes,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n');
console.log('Wrote', scenes.length, 'scenes to', path.relative(ROOT, OUT));
