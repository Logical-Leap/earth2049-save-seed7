// node scripts/qa/idle-link-e2e.mjs  (needs playwright; CHROME=/path/to/chrome to pick a browser, SHOTS=dir for screenshots)
// End-to-end: Rebel Haven → city grid (iframe) → mission board → arena field op → report → grid applies it.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.env.ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  let p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', TYPES[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(r);
}).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const pg = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

await pg.goto(base + '/index.html');
await pg.waitForFunction(() => typeof newRun === 'function' && typeof SAVE === 'object' && SAVE, null, { timeout: 60000 });
await pg.waitForTimeout(1500);
await pg.evaluate(() => { try { AudioSys.init(); } catch (e) {} newRun({ hub: true }); });
await pg.waitForFunction(() => window.Haven?.active && G?.hub, null, { timeout: 90000 });
await pg.waitForTimeout(1500);
ok(true, 'in Rebel Haven');

// ---- the grid
await pg.evaluate(() => havenAction('grid'));
await pg.waitForFunction(() => document.querySelector('#ovGrid.show iframe'), null, { timeout: 10000 });
await pg.waitForFunction(() => SAVE.idle?.sum?.dists?.length === 15, null, { timeout: 30000 });
ok(true, 'grid opened and synced a summary');
ok(await pg.evaluate(() => paused && hubOverlayOpen), 'hub paused under the grid');
const fr = pg.frames().find(f => f.url().includes('host=ss7'));
await fr.evaluate(() => { st.masked = false; st.tutOff = true; st.rugDone = true; $('coach').classList.remove('show'); st.loops = 6; ensureMap(); st.legacy = 70; st.truth = 65; st.susp = 45;
  st.credits = 1e15; st.energy = 1e7; st.followers = 1e8; st.tech = 500; st.tab = 'districts'; needRebuild = true; });
await pg.waitForTimeout(2600);
ok(await fr.evaluate(() => !!document.querySelector('#fieldBar')), 'districts tab shows the FIELD strip');
await pg.screenshot({ path: (process.env.SHOTS || '.') + '/fps-grid.png', timeout: 90000 }).catch(e => console.log('screenshot skipped', (process.env.SHOTS || '.') + '/fps-grid.png'));
const gt0 = await pg.evaluate(() => { SAVE.gt = 100; return SAVE.gt; });
await fr.evaluate(() => { st.susp = 45; needRebuild = true; });
await pg.waitForTimeout(200);
// the grid only knows GT from hello; reopen later checks the spend path
await pg.click('#gridClose');
await pg.waitForFunction(() => !document.querySelector('#ovGrid.show'), null, { timeout: 5000 });
ok(await pg.evaluate(() => !paused && !hubOverlayOpen && !document.querySelector('#ovGrid iframe')), 'grid closed, frame removed, hub resumed');
const sum = await pg.evaluate(() => SAVE.idle.sum);
ok(sum.loop === 6 && sum.shards === 70 && sum.truth >= 60, 'summary kept with the grid closed');

// ---- the board
await pg.evaluate(() => havenAction('board'));
await pg.waitForSelector('#ovBoard.show');
const rows = await pg.evaluate(() => [...document.querySelectorAll('#ovBoard .fo-row b')].map(b => b.textContent));
ok(rows.length >= 6, 'board lists takeovers and leaders: ' + rows.join(' | '));
const supTxt = await pg.textContent('#ovBoard .fo-sup');
ok(/RARE/.test(supTxt) && /2 free sponsor rerolls/.test(supTxt) && /elites and relay sites/.test(supTxt) && /\+1 heat/.test(supTxt), 'support line: ' + supTxt);
await pg.screenshot({ path: (process.env.SHOTS || '.') + '/fps-board.png', timeout: 90000 }).catch(e => console.log('screenshot skipped', (process.env.SHOTS || '.') + '/fps-board.png'));
// leader warning (ShillZ starts friendly)
const riyaBtn = await pg.evaluateHandle(() => [...document.querySelectorAll('#ovBoard [data-op^="ld"]')][0]);
await riyaBtn.click();
ok(await pg.evaluate(() => !!document.querySelector('#ovBoard .fo-warn') && document.querySelector('#ovBoard.show')), 'leader fight on a friendly faction warns first');
// fight the first takeover
const target = await pg.evaluate(() => FieldOps.board(SAVE).takeovers[0].dist);
await pg.click('#ovBoard [data-op="tk0"]');
for (let i = 0; i < 40; i++) {
  const st = await pg.evaluate(() => ({ state, active: !!window.AR?.active, op: !!window.AR?.Mission?.M?.op, phase: window.AR?.Mission?.phase, ls: document.getElementById('loadScreen')?.style.display }));
  if (st.op) break;
  if (i % 5 === 0) console.log('waiting', JSON.stringify(st), errs.slice(-3).join(' | '));
  await pg.waitForTimeout(3000);
}
const op = await pg.evaluate(() => { const o = AR.Mission.M.op; return { kind: o.kind, dist: o.dist, tierFloor: o.tierFloor, rr: AR.Mission.M.freeRerolls, intel: o.intel, heat: AR.Mission.heat, noBoss: o.noBoss }; });
ok(op.kind === 'takeover' && op.dist === target && op.tierFloor === 2 && op.rr === 2 && op.intel === 2 && op.noBoss, 'arena got the op ' + JSON.stringify(op));
ok(op.heat === (await pg.evaluate(() => SAVE.arena?.heat || 0)) + 1, 'Suspicion 45 added one heat');
await pg.waitForTimeout(4000);
const loadout = await pg.evaluate(() => [...document.querySelectorAll('#arCards .arcard .r')].map(r => r.textContent));
ok(loadout.length === 3 && loadout.every(t => /RARE|EPIC|LEGEND|MYTHIC|EXOTIC/.test(t) && !/^COMMON|UNCOMMON/.test(t)), 'loadout floor is RARE: ' + loadout.join(' / '));
await pg.screenshot({ path: (process.env.SHOTS || '.') + '/fps-loadout.png', timeout: 90000 }).catch(e => console.log('screenshot skipped', (process.env.SHOTS || '.') + '/fps-loadout.png'));
// die → the real finish path reports a lost fight
await pg.evaluate(() => { document.querySelector('#arCards .arcard')?.click(); });
await pg.waitForTimeout(800);
await pg.evaluate(() => AR.Mission.onDeath());
await pg.waitForFunction(() => document.querySelector('#arResults.on'), null, { timeout: 15000 });
const res = await pg.evaluate(() => [...document.querySelectorAll('#arResults *')].map(n => n.textContent).join(' '));
ok(/FIELD OP/.test(res) && /ROLL/.test(res), 'results show the field op row');
const ob = await pg.evaluate(() => SAVE.idle.outbox.map(e => ({ kind: e.kind, mode: e.mode, won: e.won, dist: e.dist })));
ok(ob.length === 1 && ob[0].dist === target && ob[0].won === false && ob[0].mode === 'fight', 'report queued ' + JSON.stringify(ob));
await pg.screenshot({ path: (process.env.SHOTS || '.') + '/fps-results.png', timeout: 90000 }).catch(e => console.log('screenshot skipped', (process.env.SHOTS || '.') + '/fps-results.png'));
// back to haven, reopen the grid: the grid applies it (lost fight → the cells roll it)
await pg.evaluate(() => AR.exit());
await pg.waitForFunction(() => window.Haven?.active && G?.hub, null, { timeout: 90000 });
await pg.waitForTimeout(1200);
await pg.evaluate(() => havenAction('grid'));
await pg.waitForFunction(() => SAVE.idle.outbox.length === 0, null, { timeout: 30000 });
const fr2 = pg.frames().find(f => f.url().includes('host=ss7'));
const applied = await fr2.evaluate(id => ({ tried: !!st.fps.tried[id], soft: st.fps.soft[id] || 0, held: !!st.owned[id], gt: LINK.gt }), target);
ok(applied.tried, 'grid applied the report: ' + JSON.stringify(applied));
// spend GT from the grid
await fr2.evaluate(() => { st.tab = 'districts'; st.fps.scrubAt = 0; needRebuild = true; });
await pg.waitForTimeout(500);
const g0 = await pg.evaluate(() => SAVE.gt);
await fr2.click('#fbScrub');
await pg.waitForTimeout(600);
ok((await pg.evaluate(() => SAVE.gt)) === g0 - 25, 'grid spent 25 GigaTech from the FPS save');
// leave from inside the grid
await fr2.click('#fbBack');
await pg.waitForFunction(() => !document.querySelector('#ovGrid.show'), null, { timeout: 5000 });
ok(true, 'BACK TO HAVEN inside the grid closes it');
// the standalone idle save is untouched
const keys = await pg.evaluate(() => Object.keys(localStorage));
ok(keys.includes('e2049_ss7_idle_v1') && !keys.includes('e2049_save_v1'), 'embedded idle has its own save slot');
ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
await browser.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
