'use strict';
// The Wardrobe: every avatar item has an unlock path, the DRIP economy pays sensibly, feats unlock, and the
// Fitting Room exists in the Haven layout with the markers the runtime dresses.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const CAT = JSON.parse(read('assets/models/ps1/avatar/catalog.json'));
const fresh = () => { delete require.cache[require.resolve('../js/wardrobe.js')]; return require('../js/wardrobe.js'); };
const attach = (save = { gt: 0, arena: {} }) => { const W = fresh(); W.attach(save, CAT); return { W, save }; };

test('every non-default item has exactly one unlock rule, and every rule names a real item and feat', () => {
  const { W } = attach();
  const ids = new Set(W.unlockables().map(i => i.id));
  for (const id of ids) assert.ok(W.RULES[id], `no unlock rule for ${id}`);
  for (const [id, [kind, feat]] of Object.entries(W.RULES)) {
    assert.ok(ids.has(id), `rule for unknown or default item ${id}`);
    assert.ok(['S', 'L', 'F'].includes(kind), id);
    if (kind !== 'S') assert.ok(W.FEATS[feat], `${id}: feat ${feat}`);
  }
  // all three routes are well represented, and the top tiers are earned rather than bought outright
  const kinds = { S: 0, L: 0, F: 0 };
  for (const it of W.unlockables()) kinds[W.rule(it.id).kind]++;
  assert.ok(kinds.S >= 10 && kinds.L >= 10 && kinds.F >= 10, JSON.stringify(kinds));
  for (const it of W.unlockables().filter(i => i.rarity === 6)) assert.equal(W.rule(it.id).kind, 'F', `${it.id} (Relic) is feat-only`);
  for (const it of W.unlockables().filter(i => i.rarity >= 4)) assert.notEqual(W.rule(it.id).kind, 'S', `${it.id} needs a feat or licence`);
});

test('a run pays DRIP: wins beat losses, heat pays more, the first win of the day doubles', () => {
  const { W } = attach();
  const run = o => W.runEnd({ won: false, heat: 0, grade: 1, rank: 2, relays: 1, score: 30000, hurt: 500, hp: 0, ...o }).total;
  const loss = run({});
  const first = run({ won: true, grade: 2, rank: 3, relays: 3, hp: 40 });
  const second = run({ won: true, grade: 2, rank: 3, relays: 3, hp: 40 });
  const hot = run({ won: true, grade: 2, rank: 3, relays: 3, hp: 40, heat: 4 });
  assert.ok(loss >= 30 && loss < second, `loss ${loss} < win ${second}`);
  assert.equal(first, second * 2, 'first win of the day pays double');
  assert.ok(hot > second * 1.5, 'heat 4 pays at least 1.5x');
  // a first purchase should take about one good run, a Mythic piece a long chase
  assert.ok(second >= W.RARITY_PRICE[1] * 0.6 && second <= W.RARITY_PRICE[1] * 1.5, `a win ${second} vs an uncommon ${W.RARITY_PRICE[1]}`);
  assert.ok(W.RARITY_PRICE[5] / second >= 12);
});

test('shop, licence and feat routes behave', () => {
  const { W, save } = attach();
  // shop: buy with DRIP
  W.addDrip(1000, 'test');
  const shopItem = Object.keys(W.RULES).find(id => W.RULES[id][0] === 'S');
  const before = W.drip;
  assert.equal(W.status(shopItem).canBuy, true);
  assert.equal(W.buy(shopItem), true);
  assert.equal(W.drip, before - W.price(shopItem));
  assert.ok(W.owns(shopItem) && save.wardrobe.owned.includes(shopItem));
  assert.equal(W.buy(shopItem), false, 'cannot buy twice');
  // licence: priced, but locked until the feat
  assert.equal(W.status('back_antenna').canBuy, false);
  assert.equal(W.status('back_antenna').gateOpen, false);
  for (let i = 0; i < 5; i++) W.bump('relays');
  assert.equal(W.status('back_antenna').gateOpen, true);
  assert.equal(W.buy('back_antenna'), true);
  // feat: free on completion, with a bounty, never for sale
  assert.equal(W.status('legs_hearts').buyable, false);
  const events = []; W.on((t, d) => events.push([t, d.id]));
  const drip0 = W.drip;
  W.runEnd({ won: true, heat: 0, grade: 0, rank: 0, relays: 3, score: 1, hurt: 900, hp: 4 });
  assert.ok(W.owns('legs_hearts'), 'extract with 10 HP or less');
  assert.ok(events.some(([t, id]) => t === 'unlock' && id === 'legs_hearts'));
  assert.ok(W.drip > drip0);
});

test('one-gun and per-weapon kill stats, the cone, and defaults', () => {
  const { W } = attach();
  for (let i = 0; i < 200; i++) W.bump('w_shotgun');
  assert.equal(W.stat('oneGun'), 200);
  assert.equal(W.status('neck_bandolier').gateOpen, true);
  assert.equal(W.owns('head_cone'), false);
  assert.equal(W.findCone(), true);
  assert.equal(W.owns('head_cone'), true);
  assert.equal(W.findCone(), false, 'the cone is found once');
  for (const it of CAT.items.m.filter(i => i.default || i.unlock === 'Default')) assert.ok(W.owns(it.id), it.id);
});

test('older saves keep what they earned: arena wins and heat seed the feats', () => {
  const { W } = attach({ gt: 1600, kills: 1200, arena: { runs: 30, wins: 12, best: 160000, maxHeat: 4 } });
  assert.ok(W.owns('top_vest') && W.owns('face_scar'), 'win1 and runs25 feats granted');
  assert.equal(W.status('head_tac').gateOpen, true, 'won at heat 3 → heat 2 licence');
  assert.equal(W.status('eyes_gasmask').gateOpen, false, 'never won at heat 4');
  assert.equal(W.status('eyes_monocle').gateOpen, true, 'held 1,500 GT');
  assert.equal(W.status('legs_greaves').gateOpen, true, '1,000 kills');
});

test('daily drop: three buyable items, discounted, stable for a day', () => {
  const { W } = attach();
  const a = W.featured(new Date('2026-11-11T03:00:00Z')), b = W.featured(new Date('2026-11-11T22:00:00Z')), c = W.featured(new Date('2026-11-12T03:00:00Z'));
  assert.equal(a.length, 3);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const id of a) assert.notEqual(W.rule(id).kind, 'F');
});

test('collection milestones pay out every 10 items', () => {
  const { W } = attach();
  const shop = Object.keys(W.RULES).filter(id => W.RULES[id][0] === 'S').slice(0, 10);
  for (const id of shop) W.grant(id, 'test');
  assert.equal(W.save.milestones, 1);
  assert.equal(W.drip, 100);
});

test('the Fitting Room is in the Haven: Seam, the dais and two mannequins, inside its zone', () => {
  const L = JSON.parse(read('assets/maps/haven/haven.layout.json'));
  const seam = L.actors.find(a => a.model === 'npc:tailor');
  assert.ok(seam && seam.role === 'wardrobe');
  assert.equal(L.markers.filter(m => m.kind === 'dais').length, 1);
  assert.equal(L.markers.filter(m => m.kind === 'mannequin').length, 2);
  const src = read('js/haven-data.js');
  assert.match(src, /'npc:tailor'[\s\S]*action: 'wardrobe'/);
  assert.match(src, /THE FITTING ROOM/);
  for (const p of [seam.pos, ...L.markers.filter(m => /dais|mannequin/.test(m.kind)).map(m => m.pos)]) {
    assert.ok(p[0] > 20.5 && p[0] < 26 && p[2] > -14 && p[2] < -9.5, `inside the booth: ${p}`);
  }
  // the game wires the vendor and the shop
  const game = read('js/game.js');
  assert.match(game, /action === 'wardrobe'/);
  assert.match(game, /shop: Wardrobe\.shop\(\)/);
  const html = read('index.html');
  assert.ok(html.indexOf('js/wardrobe.js') < html.indexOf('js/avatar.js') && html.indexOf('js/avatar.js') < html.indexOf('js/game.js'));
});

test('the cone sits on a walkable nav node in the Plaza', () => {
  const L = JSON.parse(read('assets/maps/plaza/plaza.layout.json'));
  const src = read('js/arena/arena-data.js');
  const spot = JSON.parse(/AR\.CONE_SPOT = (\[[^\]]+\])/.exec(src)[1]);
  assert.ok(L.meta.nav.nodes.some(n => Math.hypot(n[0] - spot[0], n[2] - spot[2]) < 0.5 && Math.abs(n[1] - spot[1]) < 0.3), 'cone on the nav graph');
  assert.ok(L.meta.nav.nodes.filter(n => n[1] > 3.5).length > 50, 'enough high ground for the merch crate');
});
