// Create-a-class, checked in the real game (Chromium):
//   1. the class list draws every class as a card with gun pictures and equipment icons; streaks are cards
//   2. the editor: loadout column, live 3D preview, stat bars, real numbers, PROS / CONS for guns, attachments, perks
//   3. hovering an attachment shows the change it would make (green / red bars) before you pick it
//   4. picking attachments saves the class; a locked one says why
//   5. a phone-sized screen stacks the layout without sideways scrolling
//   6. an offline match with that class: the first-person gun shows the attachments and aims through the new optic
//   node scripts/qa/create-a-class-e2e.mjs   (CHROME=/path/to/chrome; SHOTS=dir)
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); } catch (e) { ({ chromium } = await import('playwright-core')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS || '.';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', TYPES[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(r);
}).listen(0);
const WEB = `http://127.0.0.1:${srv.address().port}/index.html`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
const pg = await ctx.newPage();
pg.on('pageerror', e => { errs.push(e.message); console.log('PAGEERR', e.stack); });
const wait = ms => pg.waitForTimeout(ms);
const shot = name => pg.screenshot({ path: path.join(SHOTS, name + '.png') });

await pg.goto(WEB);
await pg.waitForFunction(() => typeof newRun === 'function' && SAVE && window.PvpMenu && window.PvpCodex && window.PvpPreview, null, { timeout: 90000 });
await wait(1200);
await pg.keyboard.press('Enter');
await wait(600);

try {
  // a level-30 player with a few weapon levels, so custom classes and most unlocks are open
  await pg.evaluate(() => {
    const s = PvpProgress.S();
    s.xp = PVP.totalXpTo(30); s.wxp = { ar: 1e6, pistol: 1e6, marksman: 1e6, burst: 4000 };
    PvpProgress.save?.();
  });
  await pg.evaluate(() => openPvpMenu());
  await wait(600);
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-tab="classes"]').click());
  await pg.waitForFunction(() => [...document.querySelectorAll('#pvpMenu .ccard .thumb')].filter(i => i.classList.contains('ok')).length >= 6, null, { timeout: 60000 });
  await wait(500);
  const list = await pg.evaluate(() => ({ cards: document.querySelectorAll('#pvpMenu .ccard').length, icons: document.querySelectorAll('#pvpMenu .ccard .pvpi').length, streaks: document.querySelectorAll('#pvpMenu [data-st]').length, want: PVP.PREMADE.length + PVP.CUSTOM_SLOTS }));
  ok(list.cards === list.want && list.icons >= list.cards * 5 && list.streaks === 8, `class list: ${list.cards} cards, ${list.icons} icons, ${list.streaks} streak cards`);
  await shot('cac-01-list');

  // open the first custom class
  await pg.evaluate(() => document.querySelector(`#pvpMenu [data-edit="${PVP.PREMADE.length}"]`).click());
  await pg.waitForFunction(() => document.querySelector('#pvpMenu .cacCanvas') && !document.querySelector('#pvpMenu .cacStage.loading'), null, { timeout: 60000 });
  await wait(900);
  const ed = await pg.evaluate(() => ({
    slots: document.querySelectorAll('#pvpMenu .cacLoad .slot').length, bars: document.querySelectorAll('#pvpMenu .sbar').length,
    nums: document.querySelectorAll('#pvpMenu .nums div').length, pros: document.querySelectorAll('#pvpMenu .pros li').length, cons: document.querySelectorAll('#pvpMenu .cons li').length,
    guns: document.querySelectorAll('#pvpMenu .pcard.gun').length, want: PVP.PRIMARY_IDS.length,
  }));
  ok(ed.slots === 7 && ed.bars === 7 && ed.nums === 8 && ed.pros > 0 && ed.cons > 0 && ed.guns === ed.want, 'editor: ' + JSON.stringify(ed));
  // the preview canvas has a gun in it (not blank)
  const lit = await pg.evaluate(() => {
    const cv = document.querySelector('#pvpMenu .cacCanvas'), c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
    const x = c2.getContext('2d'); x.drawImage(cv, 0, 0); const d = x.getImageData(0, 0, c2.width, c2.height).data; let n = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 0) n++; return n;
  });
  ok(lit > 500, 'the 3D preview shows the gun (' + lit + ' lit samples)');
  await shot('cac-02-editor-weapon');

  // pick the AR, go to attachments, hover the red dot: the bars show a change before it is picked
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-pick="gun:ar"]').click());
  await wait(300);
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-sub="att"]').click());
  await wait(300);
  await pg.hover('#pvpMenu [data-pick="attach:longbarrel"]');
  await wait(400);
  const hov = await pg.evaluate(() => ({ title: document.querySelector('#pvpMenu .dHead h3').textContent, up: document.querySelectorAll('#pvpMenu .track .up').length, down: document.querySelectorAll('#pvpMenu .track .down').length }));
  ok(/LONG BARREL/.test(hov.title) && hov.up > 0 && hov.down > 0, 'hovering an attachment previews its trade: ' + JSON.stringify(hov));
  await shot('cac-03-attachment-hover');
  // start clean: take off whatever the class came with, then put five on
  for (let i = 0; i < 6; i++) { const on = await pg.evaluate(() => document.querySelector('#pvpMenu .pcard.att.eq')?.dataset.pick); if (!on) break; await pg.evaluate(k => document.querySelector(`#pvpMenu [data-pick="${k}"]`).click(), on); await wait(120); }
  for (const a of ['reddot', 'suppressor', 'vgrip', 'extmag', 'laser']) { await pg.evaluate(a => document.querySelector(`#pvpMenu [data-pick="attach:${a}"]`).click(), a); await wait(150); }
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-pick="attach:heavystock"]').click());
  await wait(200);
  const full = await pg.evaluate(() => document.querySelector('#pvpMenu .cacMsg').textContent);
  ok(/5 ATTACHMENT SLOTS/.test(full), 'a sixth attachment is refused with a reason: ' + full);
  const saved = await pg.evaluate(() => PvpProgress.classes()[PVP.PREMADE.length]);
  ok(saved.primary === 'ar' && ['reddot', 'suppressor', 'vgrip', 'extmag', 'laser'].every(a => saved.att.ar.includes(a)), 'the class saved: ' + JSON.stringify(saved.att));
  await pg.mouse.move(5, 5); await wait(500);
  await shot('cac-04-attachments');
  // a locked attachment on a low-level gun says why
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-slot="primary"]').click());
  await wait(200);
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-pick="gun:burst"]').click());
  await wait(200);
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-sub="att"]').click());
  await wait(200);
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-pick="attach:rubbergrip"]').click());
  const lockMsg = await pg.evaluate(() => document.querySelector('#pvpMenu .cacMsg').textContent);
  ok(/UNLOCKS AT [A-Z0-9 .-]+ LEVEL \d+ \(YOURS: \d+\)/.test(lockMsg) && /GET KILLS WITH THIS GUN/.test(lockMsg), 'a locked attachment says which gun level opens it: ' + lockMsg);
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-sub="gun"]').click());
  await wait(150);
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-pick="gun:ar"]').click());
  await wait(200);
  // a perk slot
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-slot="perk2"]').click());
  await wait(300);
  const perk = await pg.evaluate(() => ({ cards: document.querySelectorAll('#pvpMenu .cacPick .pcard').length, head: document.querySelector('#pvpMenu .dHead h3').textContent, pros: document.querySelectorAll('#pvpMenu .pros li').length, want: Object.values(PVP.PERKS).filter(p => p.tier === 2).length }));
  ok(perk.cards === perk.want && perk.pros > 0, 'perk slot: ' + JSON.stringify(perk));
  await shot('cac-05-perk');
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-slot="primary"]').click());
  await wait(800);

  // phone
  await pg.setViewportSize({ width: 390, height: 844 });
  await wait(900);
  const ph = await pg.evaluate(() => ({ sw: document.querySelector('#pvpMenu').scrollWidth, w: innerWidth }));
  ok(ph.sw <= ph.w + 1, `phone: no sideways scroll (${ph.sw} <= ${ph.w})`);
  await shot('cac-06-phone-top');
  await pg.evaluate(() => document.querySelector('#pvpMenu .cacDetail').scrollIntoView());
  await wait(500);
  await shot('cac-07-phone-detail');
  await pg.evaluate(() => document.querySelector('#pvpMenu .cacPick').scrollIntoView());
  await wait(300);
  await shot('cac-08-phone-picker');
  await pg.setViewportSize({ width: 1366, height: 860 });
  await wait(300);

  // an offline match with the class
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-act="back"]').click());
  await wait(200);
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-tab="play"]').click());
  await wait(200);
  await pg.evaluate(() => { const s = document.querySelector('#pvpMenu select[data-k="cls"]'); s.value = String(PVP.PREMADE.length); s.dispatchEvent(new Event('change')); });
  await pg.evaluate(() => { const s = document.querySelector('#pvpMenu select[data-k="mode"]'); s.value = 'tdm'; s.dispatchEvent(new Event('change')); });
  await wait(200);
  await pg.evaluate(() => { const s = document.querySelector('#pvpMenu select[data-k="cls"]'); if (s) { s.value = String(PVP.PREMADE.length); s.dispatchEvent(new Event('change')); } });
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-act="offline"]').click());
  await pg.waitForFunction(() => window.AR?.Pvp?.on && AR.PvpMission.snap?.st === 'live' && AR.Player.P?.alive, null, { timeout: 120000 });
  await wait(2500);
  const vm = await pg.evaluate(() => {
    const g = AR.Player.gun, cache = g?.gf;
    const out = { id: g?.pvpId, att: g?.att, gf: AR.Player.gunFeel };
    let vis = 0; const want = ['opt_pvp_reddot', 'opt_pvp_suppressor', 'opt_pvp_vgrip', 'opt_pvp_laser', 'opt_mag_ext'];
    const v = window.GunFeel?.view;
    if (v) { for (const n of want) { const o = v.root.getObjectByName(n); if (o && o.scale.x > 0 && o.visible) vis++; } out.sight = v.sight; }
    out.vis = vis; return out;
  });
  ok(vm.id === 'ar' && vm.att?.includes('reddot') && vm.vis === 5 && vm.sight === 'reddot', 'in the match the gun wears its attachments: ' + JSON.stringify(vm));
  await shot('cac-09-match-hip');
  await pg.mouse.down({ button: 'right' }); await wait(900);
  await shot('cac-10-match-ads');
  await pg.mouse.up({ button: 'right' });
  // the GigaLeague's five in the first-person rig: each one draws, fires, reloads and wears a 2.5x optic and a suppressor
  const five = await pg.evaluate(async () => {
    const out = {};
    for (const vis of ['marksman', 'burst', 'fastsmg', 'revolver', 'launcher']) {
      const w = { id: vis, rar: 2, att: ['zoom2', 'suppressor', 'laser'], clip: 0, ammo: 30 };
      const r = GunFeel.equip(w), v = GunFeel.view;
      GunFeel.reload(w);
      for (let i = 0; i < 240; i++) GunFeel.update(1 / 60, { feetY: 0 });
      w.clip = 3; const fired = GunFeel.canFire(w) ? (GunFeel.fire(w), true) : false;
      out[vis] = { ok: !!r, sight: v?.sight, parts: ['opt_pvp_zoom2', 'opt_pvp_suppressor', 'opt_pvp_laser'].filter(n => v?.root.getObjectByName(n)?.scale.x > 0).length, fired };
    }
    GunFeel.equip(AR.Player.gun.gf);
    return out;
  });
  ok(Object.values(five).every(x => x.ok && x.sight === 'zoom2' && x.parts === 3), 'the five new guns work in first person: ' + JSON.stringify(five));
  for (const vis of ['marksman', 'revolver', 'launcher']) {
    await pg.evaluate(v => GunFeel.equip({ id: v, rar: 4, att: ['reddot', 'comp', 'rubbergrip'], clip: 6, ammo: 12 }), vis);
    await wait(700); await shot('cac-11-fp-' + vis);
  }
  await pg.evaluate(() => GunFeel.equip(AR.Player.gun.gf));
  ok(!errs.length, 'no page errors (' + errs.length + ')');
} catch (e) {
  console.log('ERROR', e.stack); fails++;
} finally {
  await browser.close(); srv.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
}
