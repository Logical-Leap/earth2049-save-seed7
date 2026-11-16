// Cloud save, end to end: the real Worker on a local D1 (wrangler dev) and the real game pages in Chromium.
//   node scripts/qa/cloud-save-e2e.mjs      (needs playwright; CHROME=/path/to/chrome to pick a browser)
// Two "devices" (browser contexts) sign in to one account: a new device takes the cloud save, changes travel both
// ways, a real conflict asks the player, the city grid syncs its own slot, the standalone idle game shares the
// account, and deleting the account removes everything.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const API_PORT = 8798, API = `http://127.0.0.1:${API_PORT}/api`, STATE = '.wrangler/state-e2e';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

fs.rmSync(path.join(ROOT, STATE), { recursive: true, force: true });
execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--config', 'wrangler.test.jsonc', '--persist-to', STATE], { cwd: ROOT, stdio: 'ignore' });
const dev = spawn('npx', ['wrangler', 'dev', '--config', 'wrangler.test.jsonc', '--local', '--port', String(API_PORT), '--persist-to', STATE, '--ip', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-dev.pid); } catch (e) { /* gone */ } };
process.on('exit', stop);
for (let i = 0; i < 120; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch (e) { /* starting */ } await new Promise(r => setTimeout(r, 500)); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', TYPES[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(r);
}).listen(0);
const WEB = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = await ctx.newPage();
  pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(name + ': ' + e.message));
  await pg.goto(`${WEB}/index.html?api=${encodeURIComponent(API)}`);
  await pg.waitForFunction(() => typeof SAVE === 'object' && SAVE && window.CloudSave, null, { timeout: 60000 });
  await pg.waitForTimeout(800);
  return pg;
}
/** sign in through the real panel; the local Worker echoes the code back, as wrangler.test.jsonc allows */
async function signIn(pg, email, frame = pg) {
  await frame.evaluate(() => CloudSave.openPanel());
  await frame.fill('#e49csEm', email);
  const resp = pg.waitForResponse(r => r.url().includes('/auth/email/start'));
  await frame.click('#e49csPanel button.primary');
  const code = (await (await resp).json()).devCode;
  await frame.waitForSelector('#e49csCode');
  await frame.fill('#e49csCode', code);
  await frame.click('#e49csPanel button.primary');
  await frame.waitForFunction(() => CloudSave.signedIn() && /Signed in as/.test(document.querySelector('#e49csPanel')?.textContent || ''), null, { timeout: 15000 });
}
const server = async (token, p) => (await fetch(API + p, { headers: { authorization: 'Bearer ' + token } })).json();
const tokenOf = pg => pg.evaluate(() => CloudSave.account().token);

// ---- device A has progress, signs in: it uploads
const A = await device('A');
await A.evaluate(() => { SAVE.gt = 500; SAVE.runs = 3; persist(); });
await signIn(A, 'player@example.com');
await A.waitForTimeout(1200);
const tok = await tokenOf(A);
let fps = await server(tok, '/saves/fps');
ok(fps.rev === 1 && JSON.parse(fps.data).gt === 500, 'device A uploaded its save (rev ' + fps.rev + ')');
ok(fps.meta.gigatech === 500 && /on/.test(fps.device), 'the cloud save is labelled: ' + JSON.stringify(fps.meta) + ' · ' + fps.device);
await A.screenshot({ path: '/tmp/cloud-panel.png' }).catch(() => {});
await A.evaluate(() => CloudSave.closePanel());

// ---- device B is new: signing in takes the cloud save without asking
const B = await device('B');
ok((await B.evaluate(() => SAVE.gt)) === 0, 'device B starts empty');
await signIn(B, 'player@example.com');
await B.waitForFunction(() => SAVE.gt === 500, null, { timeout: 10000 }).catch(() => {});
ok((await B.evaluate(() => SAVE.gt)) === 500, 'device B loaded the cloud save');
ok((await B.evaluate(() => JSON.parse(localStorage.getItem('earth2049_seed7_v1') || '{}').gt)) === 500, 'and kept it locally');
await B.evaluate(() => CloudSave.closePanel());

// ---- B plays on and syncs; A has not changed, so A just takes it
await B.evaluate(async () => { SAVE.gt = 600; persist(); await CloudSave.sync(); });
await A.evaluate(() => CloudSave.sync());
ok((await A.evaluate(() => SAVE.gt)) === 600, 'device A picked up device B\'s progress');

// ---- both play offline, B syncs first: A is asked, and keeps its own
await A.evaluate(() => { SAVE.gt = 700; persist(); });
await B.evaluate(async () => { SAVE.gt = 800; persist(); await CloudSave.sync(); });
const syncing = A.evaluate(() => CloudSave.sync());
await A.waitForSelector('#e49csChoose', { timeout: 10000 });
const chooseText = await A.textContent('#e49csChoose');
ok(/THIS DEVICE/.test(chooseText) && /CLOUD/.test(chooseText) && /800/.test(chooseText) && /700/.test(chooseText), 'conflict shows both saves side by side');
await A.screenshot({ path: '/tmp/cloud-choose.png' }).catch(() => {});
await A.click('#e49csChoose button[data-k="device"]');
await syncing;
fps = await server(tok, '/saves/fps');
ok(JSON.parse(fps.data).gt === 700, 'keeping this device wins (rev ' + fps.rev + ')');
const hist = await server(tok, '/saves/fps/history');
ok(hist.history.some(h => h.meta.gigatech === 800), 'device B\'s save is still in Previous versions');

// ---- the city grid inside the FPS syncs its own slot with the same sign-in
await A.evaluate(() => { newRun({ hub: true }); });
await A.waitForFunction(() => window.Haven?.active && G?.hub, null, { timeout: 90000 });
await A.evaluate(() => havenAction('grid'));
const grid = await A.waitForFunction(() => document.querySelector('#ovGrid.show iframe'), null, { timeout: 10000 }).then(() => A.frames().find(f => f.url().includes('host=ss7')));
await grid.waitForFunction(() => window.CloudSave && CloudSave.signedIn(), null, { timeout: 15000 });
await A.waitForTimeout(4500);
const g = await server(tok, '/saves/grid');
ok(g.rev >= 1 && JSON.parse(g.data).st && g.meta.loop >= 1, 'the city grid uploaded its own slot (rev ' + g.rev + ')');
ok((await grid.evaluate(() => { st.masked = false; st.tutOff = true; st.tab = 'vault'; needRebuild = true; return true; })) && (await grid.waitForSelector('#btnCloud', { state: 'attached', timeout: 5000 }).then(() => true).catch(() => false)), 'the grid\'s Save tab has the cloud save card');
await A.click('#gridClose');

// ---- the standalone idle game uses the same account, in its own slot
const ctxI = await browser.newContext(); const I = await ctxI.newPage();
await I.goto(`${WEB}/idle/index.html?api=${encodeURIComponent(API)}`);
await I.waitForFunction(() => window.CloudSave && typeof st === 'object', null, { timeout: 30000 });
await I.evaluate(() => { st.loops = 3; st.legacy = 12; });
await signIn(I, 'player@example.com');
await I.waitForTimeout(1500);
const idle = await server(tok, '/saves/idle');
ok(idle.rev === 1 && idle.meta.loop === 3 && idle.meta.shards === 12, 'standalone idle saved to the same account, slot idle');
const all = await server(tok, '/saves');
ok(all.saves.map(s => s.slot).sort().join() === 'fps,grid,idle', 'one account, three slots');

// ---- delete the account from the panel
await A.evaluate(() => CloudSave.openPanel());
await A.click('#e49csPanel button.danger');
await A.fill('#e49csDel', 'DELETE');
await A.click('#e49csPanel button.danger');
await A.waitForFunction(() => !CloudSave.signedIn(), null, { timeout: 10000 });
const gone = await fetch(API + '/saves', { headers: { authorization: 'Bearer ' + tok } });
ok(gone.status === 401, 'account deleted: the session and saves are gone');
ok((await A.evaluate(() => SAVE.gt)) === 700, 'the device keeps its own save');

const errs = [...A.errs, ...B.errs];
ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
await browser.close(); srv.close(); stop();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
