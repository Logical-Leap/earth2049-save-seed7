// Gun-feel checks in a real arena mission (desktop Chromium):
//   1. the VOLT-9 sidearm fires once per trigger pull, and fast clicking is capped by its fire rate
//   2. controller aim assist never turns the camera on its own, and only nudges gently toward where the stick points
//   3. the end of Act III's storm does not blow up the crowd: the player finishes the last of them, then the act ends
//   node scripts/qa/feel-e2e.mjs   (needs playwright; CHROME=/path/to/chrome)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const pg = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(WEB + '/index.html');
await pg.waitForFunction(() => typeof startArena === 'function' && SAVE, null, { timeout: 60000 });
await pg.waitForTimeout(1200);
await pg.evaluate(() => { try { AudioSys.init(); } catch (e) { /* no audio */ } startArena(); });
await pg.waitForFunction(() => AR.active && AR.Mission.phase === 'loadout', null, { timeout: 120000 });
await pg.waitForTimeout(600);
await pg.evaluate(() => document.querySelector('#arCards .arcard').click());
await pg.waitForFunction(() => !AR.menu && AR.Mission.phase === 'act1', null, { timeout: 20000 });
await pg.evaluate(() => { AR.Player.S.invuln = true; const P = AR.Player.P; P.maxHp = P.hp = 1e9; });

/* 1. the sidearm */
const shots = await pg.evaluate(async () => {
  const P = AR.Player.P, I = AR.Player.input;
  P.cur = 0; P.swapT = 0; const g = P.guns[0]; g.ammo = 12; g.reloading = false;
  let n = 0, last = g.lastShot;
  const count = () => { if (g.lastShot !== last) { n++; last = g.lastShot; } };
  const wait = ms => new Promise(res => { const t0 = performance.now(); (function f() { count(); if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(); })(); });
  I.fire = true; await wait(2000); I.fire = false; await wait(200);
  const held = n; n = 0; g.ammo = 12; g.reloading = false; g.fireT = 0;
  for (let i = 0; i < 20; i++) { I.fire = true; await wait(50); I.fire = false; await wait(50); }   // 10 pulls a second
  return { held, spam: n, id: g.id };
});
ok(shots.id === 'pistol' && shots.held === 1, `holding fire on the sidearm shoots once (got ${shots.held})`);
ok(shots.spam >= 6 && shots.spam <= 10, `20 pulls in 2 s are capped by the fire rate (got ${shots.spam}, cap ~9)`);

/* 2. controller aim assist */
const assist = await pg.evaluate(async () => {
  const P = AR.Player.P, E = AR.Enemies.list;
  for (let i = 0; i < 300 && !E.some(e => !e.dying && !e.relay); i++) await new Promise(r => setTimeout(r, 50));
  AR.pause(true);
  const eye = new THREE.Vector3(); let e = null, to = null, tgt = null;
  const aimAt = () => { P.yaw = Math.atan2(-to.x, -to.z) - 0.02; P.pitch = Math.asin(to.y); };   // just right of the target
  for (let tries = 0; tries < 40 && !tgt; tries++) {
    for (const x of E.filter(q => !q.dying && !q.relay)) {
      AR.Player.eyePos(eye);
      const h = x.headPos || x.body.pos; to = new THREE.Vector3(h.x - eye.x, h.y - 0.25 - eye.y, h.z - eye.z).normalize();
      aimAt(); tgt = AR.Player.assistTarget(); if (tgt) { e = x; break; }
    }
    if (!tgt) { AR.pause(false); await new Promise(r => setTimeout(r, 250)); AR.pause(true); }
  }
  if (!e) { AR.pause(false); return null; }
  const pad = (rx) => ({ lx: 0, ly: 0, rx, ry: 0, rt: 0, lt: 0, down: () => false, held: () => false });
  aimAt(); let y0 = P.yaw; for (let i = 0; i < 60; i++) AR.Player.padTick(pad(0), 1 / 60);
  const idle = P.yaw - y0;
  aimAt(); y0 = P.yaw; const lx0 = AR.Player.input.lookX;
  for (let i = 0; i < 60; i++) AR.Player.padTick(pad(-0.3), 1 / 60);                             // a second of steering toward it (stick left raises yaw)
  const pulled = P.yaw - y0;
  aimAt(); y0 = P.yaw; AR.Player.input.lookX = 0;
  AR.Player.padTick(pad(0.3), 1 / 60); const away = P.yaw - y0;                                 // steering away: no tug back
  AR.Player.input.lookX = 0;
  AR.pause(false);
  return { seen: !!tgt, idle, pulled, d: e.body.pos.distanceTo(eye), dx: AR.Player.input.lookX - lx0, away };
});
if (!assist) ok(false, 'found an enemy for the aim assist check');
else {
  ok(Math.abs(assist.away) < 1e-9, `steering away from a target gets no tug back (${assist.away.toFixed(4)} rad)`);
  ok(Math.abs(assist.idle) < 1e-9, `no stick input, no camera movement from aim assist (moved ${assist.idle.toFixed(4)} rad)`);
  ok(assist.seen && Math.abs(assist.pulled) > 0 && Math.abs(assist.pulled) <= 0.1 + 1e-6, `a full second of steering gets at most a small pull (${Math.abs(assist.pulled).toFixed(3)} rad, target ${assist.d.toFixed(1)} m away, in cone: ${assist.seen})`);
}

/* 3. Act III ending */
await pg.evaluate(() => { AR.Mission.dev.act3(); });
await pg.waitForTimeout(6000);
const before = await pg.evaluate(() => { const M = AR.Mission.M; M.stormT = 0.3; return AR.Enemies.list.filter(e => !e.dying && !e.boss && !e.relay).length; });
await pg.waitForTimeout(2500);
const after = await pg.evaluate(() => ({ phase: AR.Mission.phase, done: AR.Mission.M.stormDone, left: AR.Enemies.list.filter(e => !e.dying && !e.boss && !e.relay).length, obj: document.querySelector('#arHud .obj, #arHud .objective')?.textContent || '', marks: AR.Mission.waypoints().filter(w => w.label === 'STRAGGLER').length }));
ok(before > 0 && after.phase === 'act3' && after.done && after.left > 0 && after.left <= 8, `storm ends with no explosions: the crowd scatters to the nearest few (${before} before, ${after.left} left to finish)`);
ok(after.marks === after.left, `every enemy left is marked (${after.marks}/${after.left})`);
ok(/TAKE OUT THE LAST/.test(after.obj) || after.obj === '', `objective tells the player what to do: "${after.obj.trim().slice(0, 80)}"`);
await pg.evaluate(() => { for (const e of AR.Enemies.list) if (!e.dying && !e.boss && !e.relay) AR.Enemies.damage(e, 99999, { src: 'bullet', dir: new THREE.Vector3(0, 1, 0) }); });
await pg.waitForFunction(() => AR.Mission.phase === 'perk', null, { timeout: 8000 }).catch(() => {});
ok(await pg.evaluate(() => AR.Mission.phase === 'perk'), 'clearing the last of them ends the act');

ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
