// Phone play, end to end in Chromium's phone emulation (landscape 844x390, touch, mobile), plus a desktop check
// that nothing touch-related appears or changes for mouse and keyboard.
//   node scripts/qa/phone-e2e.mjs   (needs playwright; CHROME=/path/to/chrome; SHOTS=dir for screenshots)
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
const WEB = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, n), timeout: 90000 }).catch(() => console.log('screenshot skipped', n));

async function toArena(pg) {
  await pg.goto(WEB + '/index.html');
  await pg.waitForFunction(() => typeof startArena === 'function' && SAVE, null, { timeout: 60000 });
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => { try { AudioSys.init(); } catch (e) { /* no audio */ } startArena(); });
  await pg.waitForFunction(() => AR.active && AR.Mission.phase === 'loadout', null, { timeout: 120000 });
  await pg.waitForTimeout(600);
}

/* ---------------- phone ---------------- */
const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36' });
const pg = await phone.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(WEB + '/index.html');
await pg.waitForFunction(() => typeof startArena === 'function' && SAVE, null, { timeout: 60000 });
await pg.waitForTimeout(1500);
await shot(pg, 'phone-title.png');
ok(/TAP TO START/.test(await pg.textContent('.t-press').catch(() => '')), 'title says TAP TO START on a phone');
await pg.touchscreen.tap(422, 300);
await pg.waitForTimeout(2500);
await shot(pg, 'phone-menu.png');
const titleFits = await pg.evaluate(() => { const b = [...document.querySelectorAll('.t-menu .t-item, .t-menu [data-id], .t-menu button, #ovTitle .btn')].filter(x => x.getBoundingClientRect().height > 0); return b.length > 0 && b.every(x => { const r = x.getBoundingClientRect(); return r.height >= 24; }); });
ok(titleFits, 'title menu buttons are tappable size');
await toArena(pg);
await shot(pg, 'phone-loadout.png');
const cardsFit = await pg.evaluate(() => { const c = [...document.querySelectorAll('#arCards .arcard')]; return c.length === 3 && c.every(x => { const r = x.getBoundingClientRect(); return r.bottom <= innerHeight + 2 && r.right <= innerWidth + 2 && r.top >= -2; }); });
ok(cardsFit, 'loadout cards fit on a phone screen');
// pick a gun by tapping
const card = await pg.$('#arCards .arcard');
const cb = await card.boundingBox();
await pg.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2);
await pg.waitForFunction(() => !AR.menu && AR.Mission.phase !== 'loadout', null, { timeout: 15000 }).catch(() => {});
await pg.waitForTimeout(1500);
// the first touch in play wakes the controls
const cdp = await phone.newCDPSession(pg);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
await touch('touchStart', [[600, 120, 1]]); await touch('touchEnd', []);
await pg.waitForTimeout(400);
ok(await pg.evaluate(() => AR.Touch.on && getComputedStyle(document.getElementById('arTouch')).display === 'block'), 'touch controls appear on the first touch');
ok(await pg.evaluate(() => !AR.pointerLocked() && AR.freeLook), 'no pointer lock on a phone');
await shot(pg, 'phone-arena.png');
// move with the left stick (after landing from the spawn drop)
await pg.waitForFunction(() => AR.Player.P.body.onGround, null, { timeout: 15000 }).catch(() => {});
const p0 = await pg.evaluate(() => ({ x: AR.Player.P.body.pos.x, z: AR.Player.P.body.pos.z, yaw: AR.Player.P.yaw }));
await touch('touchStart', [[150, 260, 2]]);
for (let i = 1; i <= 8; i++) { await touch('touchMove', [[150, 260 - i * 8, 2]]); await pg.waitForTimeout(30); }
const sprinted = await pg.evaluate(() => AR.Player.input.touchSprint && AR.Player.input.touchZ > 0.9);
await pg.waitForTimeout(1500);
const p1 = await pg.evaluate(() => ({ x: AR.Player.P.body.pos.x, z: AR.Player.P.body.pos.z, sprint: true }));
p1.sprint = sprinted;
await touch('touchEnd', []);
const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
ok(moved > 1, `left stick moves the player (${moved.toFixed(2)} m)`);
ok(p1.sprint, 'stick pushed all the way forward asks for a sprint');
// look with the right side
await touch('touchStart', [[560, 200, 3]]);
for (let i = 1; i <= 6; i++) { await touch('touchMove', [[560 + i * 15, 200, 3]]); await pg.waitForTimeout(20); }
await touch('touchEnd', []);
await pg.waitForTimeout(200);
const yaw1 = await pg.evaluate(() => AR.Player.P.yaw);
ok(Math.abs(yaw1 - p0.yaw) > 0.05, `right-side drag turns the camera (${(yaw1 - p0.yaw).toFixed(2)} rad)`);
// fire: hold the button
const fireBox = await pg.evaluate(() => { const r = document.querySelector('#arTouch [data-k="fire"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const ammo0 = await pg.evaluate(() => AR.Player.gun.ammo);
await touch('touchStart', [[fireBox.x, fireBox.y, 4]]);
await pg.waitForTimeout(700);
const firing = await pg.evaluate(() => AR.Player.input.fire);
await touch('touchEnd', []);
await pg.waitForTimeout(200);
const ammo1 = await pg.evaluate(() => AR.Player.gun.ammo);
ok(firing && ammo1 < ammo0, `holding FIRE shoots (${ammo0} → ${ammo1})`);
ok(await pg.evaluate(() => !AR.Player.input.fire), 'letting go stops');
// jump, reload, aim
const jb = await pg.evaluate(() => { const r = document.querySelector('#arTouch [data-k="jump"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const y0 = await pg.evaluate(() => AR.Player.P.body.pos.y);
await touch('touchStart', [[jb.x, jb.y, 5]]); await touch('touchEnd', []);
await pg.waitForTimeout(250);
ok((await pg.evaluate(() => AR.Player.P.body.pos.y)) > y0 + 0.2, 'JUMP jumps');
const ab = await pg.evaluate(() => { const r = document.querySelector('#arTouch [data-k="ads"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await touch('touchStart', [[ab.x, ab.y, 6]]); await touch('touchEnd', []);
await pg.waitForTimeout(300);
ok(await pg.evaluate(() => AR.Player.input.ads && AR.Player.P.ads > 0.3), 'AIM toggles aiming down sights');
await touch('touchStart', [[ab.x, ab.y, 7]]); await touch('touchEnd', []);
// pause and resume
const pb = await pg.evaluate(() => { const r = document.querySelector('#arTouch [data-k="pause"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await touch('touchStart', [[pb.x, pb.y, 8]]); await touch('touchEnd', []);
await pg.waitForTimeout(400);
ok(await pg.evaluate(() => AR.paused && getComputedStyle(document.getElementById('arTouch')).display === 'none'), 'pause button pauses and hides the controls');
await shot(pg, 'phone-pause.png');
const resume = await pg.evaluate(() => { const b = [...document.querySelectorAll('#arPause .arbtn, #arPause button, #arPause [data-k]')].find(x => /RESUME/i.test(x.textContent)); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
if (resume) { await pg.touchscreen.tap(resume.x, resume.y); await pg.waitForTimeout(400); }
ok(await pg.evaluate(() => !AR.paused), 'tapping resume resumes');
// portrait asks to turn the phone
await pg.setViewportSize({ width: 390, height: 844 });
await pg.waitForTimeout(300);
ok(await pg.evaluate(() => getComputedStyle(document.getElementById('rotateNote')).display === 'flex'), 'portrait shows "turn your phone sideways"');
await pg.setViewportSize({ width: 844, height: 390 });
// Rebel Haven on a phone: its own touch controls, the mission board and the city grid
await pg.evaluate(() => AR.pause?.(false));
await pg.evaluate(() => AR.exit ? AR.exit() : Arena.exit());
await pg.waitForFunction(() => window.Haven?.active && G?.hub && state === 'run', null, { timeout: 90000 }).catch(async () => { await pg.evaluate(() => newRun({ hub: true })); await pg.waitForFunction(() => window.Haven?.active && G?.hub, null, { timeout: 90000 }); });
await pg.waitForTimeout(1500);
await pg.touchscreen.tap(600, 150);
await pg.waitForTimeout(300);
ok(await pg.evaluate(() => getComputedStyle(document.getElementById('touchUI')).display === 'block' && !document.body.classList.contains('ar-touch')), 'Haven: the hub touch controls show, the mission ones do not');
await shot(pg, 'phone-haven.png');
await pg.evaluate(() => havenAction('board'));
await pg.waitForSelector('#ovBoard.show');
await shot(pg, 'phone-board.png');
ok(await pg.evaluate(() => { const b = document.querySelector('#boardBack').getBoundingClientRect(); return b.width > 40 && b.height > 24; }), 'mission board fits and its buttons are tappable');
await pg.evaluate(() => FieldOps.closeBoard());
ok(errs.length === 0, 'phone: no page errors ' + errs.join(' | '));

/* ---------------- desktop: nothing changes ---------------- */
const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const dp = await desk.newPage();
const derrs = []; dp.on('pageerror', e => derrs.push(e.message));
await toArena(dp);
await dp.click('#arCards .arcard');
await dp.waitForTimeout(1200);
ok(await dp.evaluate(() => !AR.Touch.on && !document.getElementById('arTouch') && !document.body.classList.contains('ar-touch')), 'desktop: no touch controls');
const d0 = await dp.evaluate(() => ({ x: AR.Player.P.body.pos.x, z: AR.Player.P.body.pos.z }));
await dp.waitForTimeout(3000);
const dpre = await dp.evaluate(() => ({ x: AR.Player.P.body.pos.x, z: AR.Player.P.body.pos.z }));
await dp.keyboard.down('w'); await dp.waitForTimeout(1200);
await dp.keyboard.up('w');
const d1 = await dp.evaluate(() => ({ x: AR.Player.P.body.pos.x, z: AR.Player.P.body.pos.z }));
ok(Math.hypot(d1.x - dpre.x, d1.z - dpre.z) > 0.3, 'desktop: WASD still moves ' + JSON.stringify([dpre, d1]));
ok(derrs.length === 0, 'desktop: no page errors ' + derrs.join(' | '));

await browser.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
