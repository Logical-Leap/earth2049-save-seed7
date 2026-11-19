/* Create-a-class: every class gun's model carries every attachment, the codex explains every item, and the numbers
 * on the screen come from the same tables the match uses. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
global.window = global;
require(path.join(root, 'js/pvp/pvp-data.js'));
require(path.join(root, 'js/pvp/pvp-sim.js'));
const PvpAttach = require(path.join(root, 'js/pvp/pvp-attach.js'));
const Codex = require(path.join(root, 'js/pvp/pvp-codex.js'));
const Icons = require(path.join(root, 'js/pvp/pvp-icons.js'));
const PVP = global.PVP;

const FILES = { pistol: 'volt9_pistol', smg: 'vx2_ripper', shotgun: 'riptide12_shotgun', ar: 'm52_revenant', dmr: 'lrx7_harbinger', lmg: 'compliance_saw',
  marksman: 'kr15_adjudicator', burst: 'br3_triplicate', fastsmg: 'mx11_flashsale', revolver: 'severance50_revolver', launcher: 'unsolicited_launcher' };
function manifest(vis) {
  const b = fs.readFileSync(path.join(root, 'assets/models/ps1/weapons', FILES[vis] + '.glb'));
  const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)));
  return { W: j.scenes[0].extras, names: new Set(j.nodes.map(n => n.name)) };
}
const CLASS_GUNS = PVP.PRIMARY_IDS.concat(PVP.SECONDARY_IDS);

test('every class gun has its own model with seven rarities (no stand-ins left)', () => {
  for (const id of CLASS_GUNS) {
    const G = PVP.GUNS[id];
    assert.ok(!G.standIn && !/[[\]"]/.test(G.name), id + ' still a placeholder');
    assert.ok(FILES[G.vis], id + ' vis ' + G.vis);
    assert.equal(manifest(G.vis).W.rarities.length, 7, id);
  }
  assert.equal(new Set(CLASS_GUNS.map(id => PVP.GUNS[id].vis)).size, CLASS_GUNS.length, 'every class gun looks different');
});

test('every attachment has a part on every class gun that can show it, and optics bring a sight anchor', () => {
  for (const id of CLASS_GUNS) {
    const { W, names } = manifest(PVP.GUNS[id].vis);
    assert.ok(W.pvp, id + ' has a pvp table');
    for (const a of Object.keys(PVP.ATTACHMENTS)) {
      const k = W.pvp[a];
      const optional = (a === 'extmag' && !W.options.mag?.some(n => /ext|drum/.test(n))) || (/stock$/.test(a) && ['pistol', 'revolver'].includes(id));
      if (!k) { assert.ok(optional, `${id} is missing ${a}`); continue; }
      for (const n of k.show) assert.ok(names.has(n), `${id} ${a} node ${n}`);
      for (const sl of k.hide || []) assert.ok(W.options[sl], `${id} ${a} hides unknown slot ${sl}`);
      if (PVP.ATTACHMENTS[a].slot === 'optic') { assert.ok(k.sight, `${id} ${a} sight`); assert.ok(W.anchors['sight_' + k.sight], `${id} ${a} anchor`); }
    }
  }
});

test('PvpAttach: an optic replaces the iron sights and sets the sight; slots replace, not stack', () => {
  const { W } = manifest('ar');
  const R = W.rarities[0];
  const fit = PvpAttach.apply(W, R, ['reddot', 'suppressor', 'extmag']);
  assert.ok(fit.show.includes('opt_pvp_reddot') && fit.show.includes('opt_pvp_suppressor') && fit.show.includes('opt_mag_ext'));
  for (const n of W.options.optic) assert.ok(!fit.show.includes(n), 'rarity optic hidden: ' + n);
  for (const n of W.options.muzzle || []) assert.ok(!fit.show.includes(n), 'rarity muzzle hidden: ' + n);
  assert.equal(fit.sight, 'pvp_reddot'); assert.equal(fit.kind, 'reddot');
  const fast = PvpAttach.apply(W, W.rarities[3], ['fastmag']);
  assert.ok(fast.show.includes('opt_mag_std') && !fast.show.includes('opt_mag_ext'), 'fast mag is the short mag');
  assert.deepEqual(PvpAttach.apply(W, R, []).show.sort(), R.show.slice().sort());
  assert.equal(PvpAttach.key(['b', 'a']), 'a+b');
});

test('the codex explains every gun, attachment, perk, lethal, tactical and streak, with pros and cons', () => {
  for (const id of CLASS_GUNS) {
    const E = Codex.entry('gun', id, []);
    assert.ok(E.title && E.role && E.blurb.length > 20 && E.pros.length && E.cons.length && E.best, 'gun ' + id);
    assert.ok(E.lines.length, 'gun numbers ' + id);
  }
  for (const a of Object.keys(PVP.ATTACHMENTS)) {
    const E = Codex.entry('attach', a);
    assert.ok(E.blurb && (E.pros.length || E.cons.length), 'attachment ' + a);
    assert.ok(E.pros.length && E.cons.length, 'attachment is a trade: ' + a);
  }
  for (const [kind, T] of [['perk', PVP.PERKS], ['lethal', PVP.LETHALS], ['tactical', PVP.TACTICALS], ['streak', PVP.STREAKS]]) {
    for (const id of Object.keys(T)) {
      const E = Codex.entry(kind, id);
      assert.ok(E.title && E.blurb && E.pros.length && E.cons.length && E.best, `${kind} ${id}`);
      assert.ok(Icons.has(id), `${kind} ${id} has an icon`);
    }
  }
  for (const a of Object.keys(PVP.ATTACHMENTS)) assert.ok(Icons.has(a), 'attachment icon ' + a);
  for (const s of PVP.ATTACH_SLOTS) assert.ok(Icons.has(s), 'slot icon ' + s);
});

test('the stat panel numbers come from the match tables', () => {
  const ar = Codex.gunStats('ar', []);
  assert.equal(ar.num.stkNear, Math.ceil(100 / PVP.GUNS.ar.near[0]));
  assert.equal(ar.num.mag, PVP.GUNS.ar.mag);
  const ext = Codex.gunStats('ar', ['extmag', 'longbarrel']);
  assert.equal(ext.num.mag, Math.round(PVP.GUNS.ar.mag * 1.5));
  assert.ok(ext.num.range > ar.num.range && ext.num.ads > ar.num.ads, 'long barrel: more range, slower aim');
  assert.equal(Codex.gunStats('sniper', []).num.stkNear, 1);
  assert.equal(Codex.gunStats('burst', []).num.ttkNear, Math.round(2 * 60 / PVP.GUNS.burst.burstRpm * 1000), 'one burst kills: two gaps');
  for (const id of CLASS_GUNS) for (const [k, v] of Object.entries(Codex.gunStats(id, []).bars)) assert.ok(v === null || (v >= 0 && v <= 1), `${id} ${k} ${v}`);
  const pc = Codex.attachProsCons('suppressor');
  assert.ok(pc.pros.some(x => /minimap/.test(x)) && pc.cons.some(x => /range/.test(x)));
});
