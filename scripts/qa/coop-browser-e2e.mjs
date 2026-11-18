// Co-op hosting, the server browser and quick match, end to end: the real Worker (wrangler dev --local)
// and three separate browsers.
//   node scripts/qa/coop-browser-e2e.mjs   (needs playwright and wrangler; CHROME=/path/to/chrome; SHOTS=dir)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS || '.';
const PORT = 8798, API = `http://127.0.0.1:${PORT}`;
fs.rmSync(path.join(ROOT, '.wrangler/state-coop'), { recursive: true, force: true });
const dev = spawn('npx', ['wrangler', 'dev', '--config', 'wrangler.test.jsonc', '--local', '--port', String(PORT), '--persist-to', '.wrangler/state-coop', '--ip', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-dev.pid); } catch (e) { /* gone */ } };
for (let i = 0; i < 120; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch (e) { /* not up */ } await new Promise(r => setTimeout(r, 500)); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', TYPES[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(r);
}).listen(0);
const WEB = `http://127.0.0.1:${srv.address().port}/index.html?coopWorker=${encodeURIComponent(API)}`;
const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const errs = [];

async function player(name) {
  const pg = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  pg.on('pageerror', e => errs.push(name + ': ' + e.message));
  await pg.goto(WEB);
  await pg.waitForFunction(() => typeof CoopRoom === 'object' && SAVE && el('btnJoinCoop')?.onclick && el('btnCoopQuick')?.onclick, null, { timeout: 60000 });
  await pg.waitForTimeout(2000);
  await pg.evaluate(n => { setProfileName(n); }, name);
  return pg;
}
const inRoom = pg => pg.waitForFunction(() => CoopRoom.isCoop && CoopRoom.lobby, null, { timeout: 60000 }).then(() => true, () => false);

try {
  // the worker defaults: a real build points at the official server without anyone typing a URL
  const real = await browser.newPage();
  await real.route('**/*', (route) => { const u = new URL(route.request().url()); if (u.hostname === 'logical-leap.github.io') { const f = path.join(ROOT, u.pathname.replace(/^\/earth2049-save-seed7/, '') || '/index.html'); if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ path: f }); return route.fulfill({ path: path.join(ROOT, 'index.html') }); } return route.abort(); });
  await real.goto('https://logical-leap.github.io/earth2049-save-seed7/index.html').catch(() => {});
  ok(await real.evaluate(() => NET_CONFIG.workerUrl).catch(() => '') === 'https://earth2049-coop.chandler-fac.workers.dev', 'the live site uses the official co-op server with no setup');
  await real.close();

  const A = await player('Alpha'), B = await player('Bravo'), C = await player('Charlie'), D = await player('Delta');
  // A: one click on the title's Host Co-op opens a public game
  await A.evaluate(() => el('btnHostCoop').click());
  ok(await inRoom(A), 'Host Co-op opens a room in one click');
  const code = await A.evaluate(() => CoopRoom.roomCode);
  ok(await A.isVisible('#coopLobby') && (await A.textContent('#coopRoomMeta')).includes('Public'), `host sees the lobby for public room ${code}`);
  await A.screenshot({ path: path.join(SHOTS, 'coop-host.png') }).catch(() => {});

  // D: a private game never shows up in the list
  await D.evaluate(() => el('btnJoinCoop').click()); await D.click('#btnCoopHostPrivate');
  ok(await inRoom(D), 'Host Private Game works');
  const privCode = await D.evaluate(() => CoopRoom.roomCode);

  // B: the server browser lists A's game; Join puts B in it
  await B.evaluate(() => el('btnJoinCoop').click());
  await B.waitForSelector(`#coopBrowser [data-room="${code}"]`, { timeout: 15000 }).catch(() => {});
  const listed = await B.evaluate(() => [...document.querySelectorAll('#coopBrowser [data-room]')].map(b => b.dataset.room));
  ok(listed.includes(code), `server browser lists the public game (${listed.join(',')})`);
  ok(!listed.includes(privCode), 'server browser hides the private game');
  await B.screenshot({ path: path.join(SHOTS, 'coop-browser.png') }).catch(() => {});
  await B.click(`#coopBrowser [data-room="${code}"]`);
  ok(await inRoom(B) && await B.evaluate(c => CoopRoom.roomCode === c && !CoopRoom.isHost, code), 'Join from the list puts the player in that room');
  await A.waitForFunction(() => CoopRoom.lobby.players.filter(p => p.connected !== false).length === 2, null, { timeout: 10000 }).catch(() => {});
  ok(await A.evaluate(() => CoopRoom.lobby.players.filter(p => p.connected !== false).length) === 2, 'host sees two operatives');

  // B readies, A starts (no separate ready click for the host)
  await B.click('#btnCoopReady');
  await A.waitForFunction(() => CoopRoom.lobby.players.some(p => p.name === 'Bravo' && p.ready), null, { timeout: 10000 }).catch(() => {});
  await A.evaluate(() => el('btnCoopStart').click());
  const running = pg => pg.waitForFunction(() => typeof state !== 'undefined' && state === 'run' && G && !G.hub, null, { timeout: 90000 }).then(() => true, () => false);
  ok(await running(A) && await running(B), 'host starts the mission and both are in it');

  // C: quick match finds the running game (drop-in) since no lobby is open
  await C.evaluate(() => el('btnJoinCoop').click()); await C.click('#btnCoopQuick');
  const cInfo = await inRoom(C).then(() => C.evaluate(() => ({ code: CoopRoom.roomCode, host: CoopRoom.isHost, hint: el('coopHint').textContent })));
  ok(cInfo.code === code, 'Quick Match drops into the open game ' + JSON.stringify(cInfo) + ' want ' + code);
  ok(await running(C), 'the drop-in player loads straight into the mission');
  await C.waitForTimeout(3000);
  ok(await A.evaluate(() => CoopRoom.remote.size) >= 2, 'host sees both teammates in the world');

  // a fourth player's quick match also drops into that mission (it still has a free slot)
  await D.evaluate(() => CoopRoom.leave());
  const E = await player('Echo');
  await E.evaluate(() => el('btnJoinCoop').click()); await E.click('#btnCoopQuick');
  ok(await inRoom(E) && await E.evaluate(c => CoopRoom.roomCode === c, code), 'Quick Match fills the mission that still has a slot');

  // leaving takes a room off the list
  for (const p of [B, C, E, A]) await p.evaluate(() => CoopRoom.leave());
  await new Promise(r => setTimeout(r, 1500));
  const after = await (await fetch(API + '/rooms?protocol=2')).json();
  ok(!after.rooms.some(r => r.code === code), 'an empty room drops off the list (' + after.rooms.length + ' listed)');

  // nothing open: Quick Match opens a new listed game, and its host can start alone
  await D.evaluate(() => { el('btnCoopBack').click(); el('btnJoinCoop').click(); }); await D.click('#btnCoopQuick');
  ok(await inRoom(D) && await D.evaluate(() => CoopRoom.isHost), 'with nothing open, Quick Match opens a game of its own');
  const listedNow = (await (await fetch(API + '/rooms?protocol=2')).json()).rooms.map(r => r.code);
  ok(listedNow.includes(await D.evaluate(() => CoopRoom.roomCode)), 'and lists it for others to find');
  await D.evaluate(() => el('btnCoopStart').click());               // the mission load blocks the page, so no waiting click
  ok(await running(D), 'a host can start a mission alone');
  await D.evaluate(() => CoopRoom.leave());

  // join by a bad code explains itself
  const F = await player('Foxtrot'); await F.evaluate(() => el('btnJoinCoop').click()); await F.fill('#coopJoinCode', 'ZZZZZ'); await F.click('#btnCoopConnect');
  await F.waitForTimeout(3000);
  ok(!(await F.evaluate(() => CoopRoom.isCoop)) && /room|join|full|closed/i.test(await F.textContent('#coopHint')), `a bad code shows a clear message: "${(await F.textContent('#coopHint')).trim()}"`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
} finally {
  await browser.close(); srv.close(); stop();
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
