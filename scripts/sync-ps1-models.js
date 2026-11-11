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
  mech: 'mech', mech_enforcer: 'mech_enforcer', bot_node: 'bot_node',
  riya: 'riya', magnus: 'magnus', spyd3r: 'spyd3r', blitz: 'blitz', turing: 'turing',
};
// Non-humanoid units built with the props kit (named leg_/spin_ nodes, no clips).
const UNITS = ['cryptid_drone', 'bots_sentinel'];
const WEAPONS = ['volt9_pistol', 'vx2_ripper', 'riptide12_shotgun', 'm52_revenant', 'lrx7_harbinger', 'plasma_lancer', 'mgl6_thunderer', 'compliance_saw'];

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
for (const u of UNITS) {
  const from = path.join(src, P, 'props', 'models', `${u}.glb`);
  const to = path.join(out, 'characters', `${u}.glb`);
  fs.copyFileSync(from, to); files.push(path.relative(process.cwd(), to));
}
for (const w of WEAPONS) {
  const from = path.join(src, P, 'props', 'models', `wpn_${w}.glb`);
  const to = path.join(out, 'weapons', `${w}.glb`);
  fs.copyFileSync(from, to); files.push(path.relative(process.cwd(), to));
}
// ---- Rebel Haven: the level, its music, and everyone who lives there
const HAVEN = {
  'assets/maps/haven': [[`${P}/maps/haven/models`, ['haven.glb', 'haven.layout.json', 'haven.scene.json']]],
  'assets/audio/music': [[`${P}/audio/music`, ['cues.json', 'title.m4a', 'hub.m4a', 'combat.m4a', 'boss.m4a', 'deploy.m4a', 'outro.m4a']]],
  'assets/models/haven/npcs': [[`${P}/characters/npcs/models`, ['civ_worker_m', 'civ_vendor_m', 'civ_hacker_f', 'civ_fan_m', 'civ_punk_m',
    'civ_student_f', 'civ_courier_f', 'civ_hoodie_m', 'civ_muskfan_f', 'civ_runner_m', 'civ_commuter_f'].map(n => n + '.glb')]],
  'assets/models/haven/crowd': [[`${P}/characters/crowd/models`, ['couch_m.glb', 'couch_f.glb', 'serverless_m.glb', 'serverless_f.glb']],
    [`${P}/characters/enemies/models`, ['broker_f.glb']]],
  'assets/models/haven/chars': [[`${P}/characters/catsci/models`, ['catsci_ps1.glb:catsci.glb']], [`${P}/characters/catop/models`, ['catop_ps1.glb:catop.glb']],
    [`${P}/characters/rebel/models`, ['rebel_ps1.glb:rebel.glb']], [`${P}/characters/zhu/models`, ['zhu_ps1.glb:zhu.glb']]],
};
for (const [dest, groups] of Object.entries(HAVEN)) {
  fs.mkdirSync(path.join(process.cwd(), dest), { recursive: true });
  for (const [dir, names] of groups) for (const spec of names) {
    const [from, to = from] = spec.split(':');
    fs.copyFileSync(path.join(src, dir, from), path.join(process.cwd(), dest, to));
    files.push(`${dest}/${to}`);
  }
}
// ---- Operation: Unsubscribe — the Engagement Plaza arena and its enemy variant bases
const ARENA = {
  'assets/maps/plaza': [[`${P}/maps/plaza/models`, ['plaza.glb', 'plaza.layout.json']]],
  'assets/models/arena': [[`${P}/characters/enemies/models`, ['shill_m.glb', 'shill_f.glb', 'hypebeast_m.glb', 'cdrone_x.glb', 'enforcer_x.glb']],
    [`${P}/characters/crowd/models`, ['serverless_m.glb', 'serverless_f.glb']]],
};
for (const [dest, groups] of Object.entries(ARENA)) {
  fs.mkdirSync(path.join(process.cwd(), dest), { recursive: true });
  for (const [dir, names] of groups) for (const name of names) {
    fs.copyFileSync(path.join(src, dir, name), path.join(process.cwd(), dest, name));
    files.push(`${dest}/${name}`);
  }
}
// every prop either level places (shared prop folder)
const layoutProps = ['haven/models/haven.layout.json', 'plaza/models/plaza.layout.json']
  .flatMap(f => JSON.parse(fs.readFileSync(path.join(src, P, 'maps', f), 'utf8')).props.map(p => p.model));
fs.mkdirSync(path.join(process.cwd(), 'assets/models/haven/props'), { recursive: true });
for (const m of new Set(layoutProps)) {
  fs.copyFileSync(path.join(src, P, 'props/models', m + '.glb'), path.join(process.cwd(), 'assets/models/haven/props', m + '.glb'));
  files.push(`assets/models/haven/props/${m}.glb`);
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
