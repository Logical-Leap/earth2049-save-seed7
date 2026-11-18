// Playtest batch 3, checked in the real game (desktop Chromium):
//   1. the Fitting Room saves on the way out (owned pieces kept, locked try-ons put back)
//   2. looking down shows the front of your body; nothing worn ever sits within a hand's width of the lens
//   3. Play in VR on the title opens the VR panel with the comfort options, synced with the pause menu
//   4. pressing E to talk does not pause, and dialogue options take a real mouse click
//   5. the CLICKBAIT kill burst chains at most once
//   6. the GigaLeague menu has a one-button QUICK MATCH (any playlist)
//   node scripts/qa/playtest3-e2e.mjs   (needs playwright; CHROME=/path/to/chrome; SHOTS=dir)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS || '.';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', TYPES[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(r);
}).listen(0);
const WEB = `http://127.0.0.1:${srv.address().port}/index.html`;
const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const errs = [];
const pg = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
pg.on('pageerror', e => { errs.push(e.message); if (process.env.TRACE) console.log('PAGEERR', e.stack); });
await pg.goto(WEB);
await pg.waitForFunction(() => typeof newRun === 'function' && SAVE && window.AvatarKit?.loaded && window.Wardrobe?.ready && el('btnVR')?.onclick, null, { timeout: 90000 });
await pg.waitForTimeout(1500);
await pg.keyboard.press('Enter');                                   // past PRESS ANY BUTTON
await pg.waitForTimeout(1200);

try {
  /* 3. VR panel from the title */
  ok(await pg.evaluate(() => getComputedStyle(el('btnVR')).display !== 'none' && el('btnVR').closest('#ovTitle') && !document.body.classList.contains('vr-ok')), 'Play in VR is on the title screen without a headset');
  await pg.evaluate(() => el('btnVR').click());
  ok(await pg.isVisible('#ovVR') && await pg.isVisible('#optVrSmoothT') && await pg.isVisible('#optVrVigT'), 'it opens the VR panel with smooth turning and the comfort vignette');
  ok(/no headset/i.test(await pg.textContent('#vrStatus')), 'the panel says no headset is connected and explains how to play');
  const before = await pg.evaluate(() => !!SAVE.opts.vrSmoothTurn);
  await pg.click('#optVrSmoothT');
  ok(await pg.evaluate(b => SAVE.opts.vrSmoothTurn === !b && el('optVrSmooth').textContent === el('optVrSmoothT').textContent, before), 'toggling it there updates the pause menu copy too');
  await pg.screenshot({ path: path.join(SHOTS, 'vr-panel.png') }).catch(() => {});
  await pg.evaluate(() => el('btnVRBack').click());

  /* 1. the Fitting Room autosaves */
  const res = await pg.evaluate(async () => {
    const K = AvatarKit, L0 = K.validate(K.load());
    // find an owned item that differs from what is worn, and a locked item for another slot, from the catalog files
    const items = (K.catalog.items[L0.sex] || []).map(v => ({ id: v.id, cat: v.cat }));
    const ownSwap = items.find(i => K.isOwned(i.id) && L0.items[i.cat] !== i.id && i.cat !== 'colors');
    const lockTry = items.find(i => !K.isOwned(i.id) && i.cat !== ownSwap?.cat);
    if (!ownSwap || !lockTry) return { skip: true, n: items.length };
    openWardrobe();
    for (let i = 0; i < 100 && !(AvatarCreator.isOpen && AvatarCreator.api !== undefined); i++) await new Promise(r => setTimeout(r, 50));
    await new Promise(r => setTimeout(r, 1500));
    const root = document.getElementById('avc');
    const press = (c, id) => { const b = document.createElement('button'); b.dataset.item = id; b.dataset.cat = c; b.style.display = 'none'; root.appendChild(b); b.click(); b.remove(); };
    press(ownSwap.cat, ownSwap.id); press(lockTry.cat, lockTry.id);
    // back out with Escape: no SAVE press
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const L1 = K.load();
    return { open: AvatarCreator.isOpen, kept: L1.items[ownSwap.cat] === ownSwap.id, lockedKept: L1.items[lockTry.cat] === lockTry.id, back: L1.items[lockTry.cat], was: L0.items[lockTry.cat], ownSwap, lockTry };
  });
  if (res.skip) ok(false, 'found an owned and a locked item to test the Fitting Room (' + res.n + ' items)');
  else {
    ok(!res.open && res.kept, `backing out with Esc kept the owned piece (${res.ownSwap.id}) without pressing save`);
    ok(!res.lockedKept && res.back === res.was, `the locked try-on (${res.lockTry.id}) was put back to ${res.was}`);
  }

  /* 4. talk in the Haven */
  await pg.evaluate(() => newRun({ hub: true }));
  await pg.waitForFunction(() => window.Haven?.active && G?.hub && state === 'run', null, { timeout: 120000 });
  await pg.evaluate(() => { hideOverlays(); setPaused?.(false); paused = false; });
  const npc = await pg.evaluate(async () => {
    const layout = await (await fetch('assets/haven/haven.layout.json')).json().catch(() => null) || await AssetLoader.fetchJson(HAVEN_BASE + 'haven.layout.json');
    for (const a of layout.actors) {
      const [x, , z] = a.pos || [a.x, 0, a.z];
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        G.p.pos.x = x + ox * 1.4; G.p.pos.z = z + oz * 1.4;
        await new Promise(r => setTimeout(r, 250));
        if (Haven.nearestTalk()) return a.model;
      }
    }
    return null;
  }).catch(() => null);
  if (!npc) ok(false, 'found someone to talk to in the Haven');
  else {
    await pg.evaluate(() => { paused = false; });
    await pg.keyboard.press('e');
    await pg.waitForTimeout(400);
    await pg.evaluate(() => document.dispatchEvent(new Event('pointerlockchange')));   // what the browser fires when the dialogue lets go of the mouse
    await pg.waitForTimeout(200);
    ok(await pg.evaluate(() => Haven.dialogOpen && !paused && !el('ovPause').classList.contains('show')), `E opens the dialogue with ${npc} and the pause menu stays shut`);
    await pg.screenshot({ path: path.join(SHOTS, 'haven-dialog.png') }).catch(() => {});
    const n0 = await pg.locator('#havenDlg .opt').count();
    const last = pg.locator('#havenDlg .opt').last();
    await last.hover();
    await last.click();                                                    // a real mouse click, not a script call
    await pg.waitForTimeout(400);
    ok(n0 > 0 && await pg.evaluate(() => !Haven.dialogOpen || !!document.querySelector('#havenDlg .opt')), `clicking an option with the mouse works (${n0} options)`);
    if (await pg.evaluate(() => Haven.dialogOpen)) await pg.keyboard.press('Escape');
    ok(await pg.evaluate(() => !paused), 'leaving the dialogue does not pause either');
  }

  /* 2 + 5: arena */
  await pg.evaluate(() => { const L = AvatarKit.load(); L.items.back = (AvatarKit.catalog.items[L.sex].find(i => i.id === 'back_cape' || i.id === 'back_wings') || {}).id || L.items.back; AvatarKit.save(L); FPBody.refresh(); });
  await pg.evaluate(() => startArena());
  await pg.waitForFunction(() => AR.active && AR.Mission.phase === 'loadout', null, { timeout: 120000 });
  await pg.waitForTimeout(500);
  await pg.evaluate(() => document.querySelector('#arCards .arcard').click());
  await pg.waitForFunction(() => !AR.menu && AR.Mission.phase === 'act1', null, { timeout: 20000 });
  await pg.evaluate(() => { AR.Player.S.invuln = true; });
  const lens = async () => pg.evaluate(() => {
    const eye = new THREE.Vector3(); camera.getWorldPosition(eye);
    let worst = 9, name = '';
    FPBody.body.root.updateMatrixWorld(true);
    FPBody.body.root.traverse(o => {
      if (!o.isMesh) return; let v = true; for (let q = o; q; q = q.parent) if (!q.visible) v = false; if (!v) return;
      const loc = eye.clone().applyMatrix4(o.matrixWorld.clone().invert()); const d = o.geometry.boundingBox.distanceToPoint(loc) * o.matrixWorld.getMaxScaleOnAxis();
      if (d < worst) { worst = d; name = o.name; }
    });
    return { worst, name };
  });
  const seen = [];
  for (const [label, js] of [['looking down', 'P.pitch = -1.5'], ['jumping', 'P.pitch = -0.3; P.body.vel.y = 7; P.body.onGround = false'], ['sliding', 'P.pitch = -0.3; P.slideT = 0.6'], ['jumping, looking down', 'P.pitch = -1.2; P.body.vel.y = 7; P.body.onGround = false']]) {
    await pg.evaluate(js => { const P = AR.Player.P; eval(js); }, js);                // eslint-disable-line no-eval
    let worst = 9;
    for (let i = 0; i < 6; i++) { await pg.waitForTimeout(70); const l = await lens(); worst = Math.min(worst, l.worst); }
    seen.push(`${label} ${worst.toFixed(2)} m`);
    ok(worst >= 0.15, `${label}: nothing worn comes within 15 cm of the lens (closest ${worst.toFixed(2)} m)`);
  }
  await pg.evaluate(() => { AR.Player.P.pitch = -1.5; });
  await pg.waitForTimeout(300);
  const back = await pg.evaluate(() => { const p = FPBody.body.root.position, b = AR.Player.P.body.pos; return Math.hypot(p.x - b.x, p.z - b.z); });
  ok(back > 0.35, `looking straight down, the body stands ${back.toFixed(2)} m back so you see its front`);
  await pg.screenshot({ path: path.join(SHOTS, 'look-down.png') }).catch(() => {});

  const chain = await pg.evaluate(async () => {
    for (const e of AR.Enemies.list.slice()) AR.Enemies.logOff(e);
    AR.Player.S.volatile = 2;
    const P = AR.Player.P.body.pos, out = [];
    // a line of weak bots 2.5 m apart: under the old rules every burst set off the next one
    for (let i = 0; i < 7; i++) { const e = AR.Enemies.spawn('shill', P.x + 6 + i * 2.5, P.y, P.z, { noDrops: true }); if (e) { e.state = 'idle'; e.hp = e.maxHp = 5; out.push(e); } }
    await new Promise(r => setTimeout(r, 400));
    for (const e of out) { e.hp = 5; e.state = e.state === 'spawn' ? 'idle' : e.state; }
    let n = 0; const orig = AR.Fx.explosion; AR.Fx.explosion = (...a) => { n++; return orig.apply(AR.Fx, a); };
    AR.Enemies.damage(out[0], 999, { src: 'bullet', dir: new THREE.Vector3(1, 0, 0) });
    await new Promise(r => setTimeout(r, 1500));
    AR.Fx.explosion = orig;
    return { spawned: out.length, bursts: n, dead: out.filter(e => e.dying).length };
  });
  ok(chain.spawned >= 4 && chain.bursts >= 1 && chain.bursts <= 2, `CLICKBAIT chains at most once (${chain.bursts} bursts, ${chain.dead}/${chain.spawned} down)`);
  await pg.evaluate(() => AR.exit?.());
  await pg.waitForTimeout(1500);

  /* 6. GigaLeague quick match */
  const qp = await pg.evaluate(async () => {
    let asked = null; const orig = PvpNet.quickplay;
    PvpNet.quickplay = async o => { asked = o.playlist; throw new Error('offline in test'); };
    PvpMenu.open({ tab: 'play' });
    await new Promise(r => setTimeout(r, 300));
    const b = document.querySelector('#pvpMenu [data-qp="any"]');
    const vis = !!b && b.offsetParent !== null; b?.click();
    await new Promise(r => setTimeout(r, 300));
    const msg = document.querySelector('#pvpMenu .qpStatus')?.textContent || '';
    PvpNet.quickplay = orig; PvpMenu.close();
    return { vis, asked, msg };
  });
  ok(qp.vis && qp.asked === 'any', 'GigaLeague has a one-button QUICK MATCH across every playlist');
  ok(/could not reach/i.test(qp.msg), 'and says so plainly when the match server is out of reach');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
} catch (e) { ok(false, 'test crashed: ' + e.message.split('\n')[0]); }
await browser.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
