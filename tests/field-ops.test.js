'use strict';
// THE CITY GRID link: the board reads the idle game's summary, support is capped (options, never raw power),
// reports are queued once and paid at the right GigaTech rate, the save keeps the link sane, and the most
// support the grid can lend is worth less than one heat level.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const F = require('../js/field-ops.js');
const SaveSystem = require('../js/save-system.js');

const dist = (id, owner, o = {}) => ({ id, name: id.toUpperCase(), owner, held: false, hq: false, adj: [], front: false, ...o });
function summary(o = {}) {
  return {
    v: 1, loop: 4, masked: false, shards: 0, loopsDone: 0, truth: 0, susp: 0, morale: 70, relinq: false,
    dists: [
      dist('downtown', 'shillz', { held: true, adj: ['industrial', 'harbor'] }),
      dist('industrial', 'gigacorp', { front: true, adj: ['downtown', 'tech'] }),
      dist('harbor', 'cryptids', { front: true, adj: ['downtown', 'tech'] }),
      dist('tech', 'muskers', { front: true, adj: ['industrial', 'harbor'] }),
      dist('hq', 'gigacorp', { hq: true, front: true }),
    ],
    contest: null, rep: {}, tier: { gigacorp: 'HOSTILE', muskers: 'ALLY', cryptids: 'NEUTRAL', shillz: 'FRIENDLY', bots: 'NEUTRAL' },
    allies: ['muskers'], talk: ['muskers', 'cryptids', 'shillz'],
    field: { ops: 0, n: 0, raids: 0, won: [], tried: [], kills: [], ever: [] }, ...o,
  };
}
const saveWith = sum => ({ gt: 100, arena: { heat: 0 }, idle: { sum, at: 1, outbox: [], seq: 0 } });

test('no summary yet: an empty board and no support at all (a fresh FPS player plays the base game)', () => {
  const s = { gt: 0, idle: F.freshIdle() };
  assert.equal(F.board(s).ready, false);
  assert.deepEqual(F.support(s, null), { tierFloor: 0, freeRerolls: 0, ally: null, intel: 0, heatAdd: 0 });
});

test('board: front-line ground only, never an ally’s district or the HQ; raids and every leader listed', () => {
  const s = saveWith(summary({ contest: { id: 'downtown', by: 'gigacorp', at: 812.5, left: 33 } }));
  const B = F.board(s);
  assert.deepEqual(B.takeovers.map(t => t.dist).sort(), ['harbor', 'industrial']);      // tech is the ally's; hq never
  assert.equal(B.raid.dist, 'downtown');
  assert.equal(B.leaders.length, 5);
  const riya = B.leaders.find(l => l.fac === 'shillz');
  assert.ok(riya.fight && riya.warn, 'Riya is fightable, and ShillZ is friendly so the board warns');
  assert.ok(!B.leaders.find(l => l.fac === 'muskers').fight, 'fights not built yet are listed but locked');
  assert.equal(B.leaders.find(l => l.fac === 'gigacorp').warn, false);
});

test('support is capped: RARE at most, two rerolls at most, intel is information, Suspicion only adds heat', () => {
  const lo = F.support(saveWith(summary({ shards: 9, loopsDone: 1, truth: 24, susp: 39 })), null);
  assert.deepEqual([lo.tierFloor, lo.freeRerolls, lo.intel, lo.heatAdd], [0, 1, 0, 0]);
  const mid = F.support(saveWith(summary({ shards: 10, loopsDone: 2, truth: 25, susp: 40 })), null);
  assert.deepEqual([mid.tierFloor, mid.freeRerolls, mid.intel, mid.heatAdd], [1, 2, 1, 1]);
  const hi = F.support(saveWith(summary({ shards: 99999, loopsDone: 400, truth: 100, susp: 100 })), null);
  assert.deepEqual([hi.tierFloor, hi.freeRerolls, hi.intel, hi.heatAdd], [2, 2, 2, 2]);
});

test('ally call-in: only from a sovereign ally that holds or borders the target', () => {
  const cut = summary({ dists: summary().dists.map(d => d.id === 'industrial' ? { ...d, adj: ['downtown'] } : d) });
  assert.equal(F.support(saveWith(cut), { dist: 'industrial' }).ally, null, 'industrial no longer touches the ally’s ground');
  const s = saveWith(summary());
  assert.equal(F.support(s, { dist: 'industrial' }).ally.fac, 'muskers', 'it borders tech, which the ally holds');
  assert.equal(F.support(s, { dist: 'tech' }).ally.fac, 'muskers', 'the ally’s own district');
  assert.equal(F.support(saveWith(summary({ allies: [] })), { dist: 'harbor' }).ally, null);
});

test('reports: a takeover is queued once; a replay pays GigaTech at half rate and reports nothing', () => {
  const s = saveWith(summary());
  const B = F.board(s);
  const op = F.prepare(s, B.takeovers[0]);
  assert.equal(op.noBoss, true);
  const r = F.complete(s, op, { won: true, style: 0.8 });
  assert.equal(r.gtMul, 1);
  assert.equal(s.idle.outbox.length, 1);
  assert.deepEqual((({ kind, mode, won, dist, loop }) => ({ kind, mode, won, dist, loop }))(s.idle.outbox[0]), { kind: 'takeover', mode: 'fight', won: true, dist: op.dist, loop: 4 });
  const again = F.board(s).takeovers.find(t => t.dist === op.dist);
  assert.ok(again.won, 'the board already shows it taken');
  const replay = F.prepare(s, again);
  assert.equal(replay.replay, true);
  assert.equal(F.complete(s, replay, { won: true, style: 1 }).gtMul, 0.5);
  assert.equal(s.idle.outbox.length, 1, 'no second report');
});

test('auto-resolve is one roll per district, lost fights fall back to the grid’s roll, raids only report wins', () => {
  const s = saveWith(summary({ contest: { id: 'downtown', by: 'gigacorp', at: 5, left: 30 } }));
  const t = F.board(s).takeovers[0];
  assert.ok(F.autoResolve(s, t));
  assert.equal(F.autoResolve(s, F.board(s).takeovers.find(x => x.dist === t.dist)), null);
  const lost = F.complete(s, F.prepare(s, F.board(s).takeovers[1]), { won: false });
  assert.match(lost.label, /ROLL/);
  assert.equal(s.idle.outbox.at(-1).won, false);
  const n = s.idle.outbox.length;
  F.complete(s, F.prepare(s, F.board(s).raid), { won: false });
  assert.equal(s.idle.outbox.length, n, 'a lost raid defence reports nothing: garrison and Standing Orders apply');
  F.complete(s, F.prepare(s, F.board(s).raid), { won: true, style: 0.5 });
  assert.equal(s.idle.outbox.at(-1).at, 5, 'the raid report names the raid it stopped');
});

test('leader fights always report (hostility is the cost, win or lose)', () => {
  const s = saveWith(summary());
  const riya = F.board(s).leaders.find(l => l.fac === 'shillz');
  const op = F.prepare(s, riya);
  assert.equal(op.noBoss, false);
  F.complete(s, op, { won: false });
  assert.equal(s.idle.outbox.at(-1).kind, 'leader');
  assert.equal(s.idle.outbox.at(-1).won, false);
});

test('consumed reports leave the outbox; the save keeps the link sane', () => {
  const s = saveWith(summary());
  F.complete(s, F.prepare(s, F.board(s).takeovers[0]), { won: true, style: 1 });
  F.consumed(s, [s.idle.outbox[0].id]);
  assert.equal(s.idle.outbox.length, 0);
  const fresh = SaveSystem.createDefault({});
  assert.deepEqual(fresh.idle, { sum: null, at: 0, outbox: [], seq: 0 });
  const junk = SaveSystem.normalize({ gt: 5, idle: { sum: { loop: 'x' }, outbox: [{ id: 1 }, { id: 'ok', kind: 'raid' }, { id: 'no', kind: 'boom' }], seq: -3 } });
  assert.equal(junk.idle.sum, null);
  assert.deepEqual(junk.idle.outbox.map(e => e.id), ['ok']);
  assert.equal(junk.idle.seq, 0);
  const kept = SaveSystem.normalize({ idle: { sum: summary(), outbox: [] } });
  assert.equal(kept.idle.sum.loop, 4);
});

test('style is 0..1 from peak rank and grade', () => {
  assert.equal(F.styleOf(0, 7, 0, 6), 0);
  assert.equal(F.styleOf(6, 7, 5, 6), 1);
  assert.ok(F.styleOf(3, 7, 2, 6) > 0.3 && F.styleOf(3, 7, 2, 6) < 0.6);
});

/* The FPS balance target: the most the grid can lend makes a mission at most one heat level easier.
 * A first-order model of a run, read against the arena's own numbers (asserted below so it cannot drift):
 *   enemy HP x(1+0.25h), count x(1+0.15h), damage x(1+0.15h), fire rate x(1+0.08h)
 *   damage the player takes over a run ~ (total enemy HP / player DPS) x incoming DPS
 * Support only ever raises player DPS: tier +10% damage and +8% mag per step, the ally drone, two rerolls. */
test('maximum grid support is worth less than one heat level', () => {
  const enemies = read('js/arena/arena-enemies.js'), mission = read('js/arena/arena-mission.js'), player = read('js/arena/arena-player.js');
  assert.match(enemies, /const hpMul = \(1 \+ heat \* 0\.25\)/);
  assert.match(enemies, /dmgMul: \(1 \+ heat \* 0\.15\)/);
  assert.match(mission, /Math\.round\(n \* \(1 \+ M\.heat \* 0\.15\)\)/);
  assert.match(mission, /M\.fireMul = 1 \/ \(1 \+ M\.heat \* 0\.08\)/);
  assert.match(player, /\(1 \+ \(g\.tier \|\| 0\) \* 0\.1\)/);
  assert.match(mission, /16 \* \(1 \+ M\.heat \* 0\.15\)/, 'ally drone damage');
  const heatStep = (1.25 * 1.15) * (1.15 * 1.08);                       // heat 0 → 1
  const baseTier = 0.35;                                                 // expected rolled tier at heat 0
  const tier = (1 + 0.1 * F.CFG.tierCap) / (1 + 0.1 * baseTier) * (1 + 0.08 * (F.CFG.tierCap - baseTier) * 0.25);  // damage, plus fewer reloads
  const playerDps = 120, runSecs = 600;                                  // a sustained primary over a ten-minute run
  const ally = 1 + (16 / 0.3) * F.CFG.allySecs / (playerDps * runSecs);
  const rerolls = 1 + 0.025 * F.CFG.rerollMax;                           // a better sponsor pick, generously
  const support = tier * ally * rerolls;
  assert.ok(support < heatStep, `support x${support.toFixed(2)} must stay under one heat step x${heatStep.toFixed(2)}`);
  assert.ok(support > 1.1, 'and still be worth having');
});

test('wiring: the Commander and the holotable open the grid and the board; the grid has its own frame', () => {
  const data = read('js/haven-data.js'), haven = read('js/haven.js'), game = read('js/game.js'), html = read('index.html'), pad = read('js/gamepad.js');
  assert.match(data, /'npc:commander'[\s\S]*?action: 'grid'[\s\S]*?action: 'board'/);
  assert.match(haven, /def\.intel[\s\S]{0,80}action: 'grid'/);
  assert.match(game, /if \(action === 'grid'\)/);
  assert.match(game, /idle\/index\.html\?host=ss7/);
  assert.match(html, /js\/field-ops\.js\?v=/);
  assert.match(pad, /L\.key === 'ovGrid'/);
  assert.ok(fs.existsSync(path.join(root, 'idle/index.html')), 'idle/index.html is synced (node scripts/sync-idle.js)');
  const idle = read('idle/index.html');
  assert.match(idle, /const LINK_ON=/);
  assert.match(idle, /e2049_ss7_idle_v1/, 'the embedded idle game keeps its own save slot');
  assert.ok(read('scripts/prepare-pages-dist.js').includes("'idle'"), 'Pages ships idle/');
});
