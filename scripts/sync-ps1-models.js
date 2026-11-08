/*
 * Copy the PS1 character and weapon GLBs this game uses from a local checkout
 * of Logical-Leap/game-art-pipeline (the source of truth for all models).
 *
 *   node scripts/sync-ps1-models.js ../game-art-pipeline
 *
 * Models are never edited here. Change them in game-art-pipeline, push there,
 * then re-run this script. The pipeline commit is recorded in
 * assets/models/ps1/SOURCE.json so every build can be traced back.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const src = path.resolve(process.argv[2] || '../game-art-pipeline');
const out = path.join(process.cwd(), 'assets/models/ps1');
const P = 'projects/earth2049';

const CHARACTERS = {
  shillz: 'shillz', shillz_big: 'shillz_big', musker: 'musker', cryptid: 'cryptid',
  mech: 'mech', mech_enforcer: 'mech_enforcer',
  riya: 'riya', magnus: 'magnus', spyd3r: 'spyd3r', blitz: 'blitz', turing: 'turing',
};
const WEAPONS = ['volt9_pistol', 'vx2_ripper', 'riptide12_shotgun', 'm52_revenant', 'lrx7_harbinger', 'plasma_lancer', 'mgl6_thunderer'];

if (!fs.existsSync(path.join(src, P))) {
  console.error(`game-art-pipeline not found at ${src}`);
  process.exit(1);
}
fs.mkdirSync(path.join(out, 'characters'), { recursive: true });
fs.mkdirSync(path.join(out, 'weapons'), { recursive: true });

const files = [];
for (const [dir, name] of Object.entries(CHARACTERS)) {
  const from = path.join(src, P, 'characters', dir, 'models', `${name}_ps1.glb`);
  const to = path.join(out, 'characters', `${name}.glb`);
  fs.copyFileSync(from, to); files.push(path.relative(process.cwd(), to));
}
for (const w of WEAPONS) {
  const from = path.join(src, P, 'props', 'models', `wpn_${w}.glb`);
  const to = path.join(out, 'weapons', `${w}.glb`);
  fs.copyFileSync(from, to); files.push(path.relative(process.cwd(), to));
}
let commit = 'unknown';
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src }).toString().trim();
} catch (err) {
  console.warn('could not read the pipeline commit:', err.message);
}
fs.writeFileSync(path.join(out, 'SOURCE.json'), JSON.stringify({
  repo: 'Logical-Leap/game-art-pipeline', commit, synced: new Date().toISOString().slice(0, 10), files,
}, null, 2) + '\n');
console.log(`synced ${files.length} models from ${commit.slice(0, 7)}`);
