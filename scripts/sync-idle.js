/*
 * Copy the idle game (THE CITY GRID) from a local checkout of Logical-Leap/earth2049-idle-real.
 *
 *   node scripts/sync-idle.js ../earth2049-idle-real
 *
 * The idle repo is the source of truth. Never edit idle/index.html here: change the idle game there,
 * push it, then re-run this script. The FPS opens it from the Purple Team Ops room with ?host=ss7,
 * which turns on its field link (own save slot, mission-board reports). The idle commit is recorded
 * in idle/SOURCE.json so every build can be traced back.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const src = path.resolve(process.argv[2] || '../earth2049-idle-real');
const out = path.join(process.cwd(), 'idle');
const page = path.join(src, 'index.html');
if (!fs.existsSync(page)) { console.error(`No idle game at ${page}`); process.exit(1); }
const html = fs.readFileSync(page, 'utf8');
if (!/const LINK_ON=/.test(html)) { console.error('That idle build has no Save Seed 7 link (LINK_ON). Update the idle repo first.'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
let commit = 'unknown', branch = 'unknown';
try { commit = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD']).toString().trim(); } catch (e) { /* not a git checkout */ }
try { branch = execFileSync('git', ['-C', src, 'rev-parse', '--abbrev-ref', 'HEAD']).toString().trim(); } catch (e) { /* not a git checkout */ }
fs.writeFileSync(path.join(out, 'SOURCE.json'), JSON.stringify({ repo: 'Logical-Leap/earth2049-idle-real', commit, branch, bytes: html.length, synced: new Date().toISOString() }, null, 2) + '\n');
console.log(`idle/index.html ← ${src} @ ${commit.slice(0, 7)} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
