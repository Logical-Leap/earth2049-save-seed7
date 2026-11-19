// GigaLeague feel pass, checked in the real game (desktop Chromium, an offline match against bots):
//   1. no music anywhere in multiplayer (the menu, a match)
//   2. other players are heard: every round in its gun's own voice, placed footsteps, pain and death cries
//   3. bodies fall (the Death clip) and stay for seconds, then clear
//   4. the kill feed is big; your kills light it up; medals, a running points total, QUAD FEED
//   5. Hardpoint says when you are in the hill and scoring, with a tick each point
//   6. a controller: prompts switch to its buttons, the D-pad never swaps weapons (it uses streaks / tactical),
//      LB / RB change class on the respawn screen, BACK holds the scoreboard; the GigaLeague menu is navigable
//   node scripts/qa/pvp-feel-e2e.mjs   (CHROME=/path/to/chrome; SHOTS=dir)
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); } catch (e) { ({ chromium } = await import('playwright-core')); }
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
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const errs = [];
const pg = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
pg.on('pageerror', e => { errs.push(e.message); console.log('PAGEERR', e.stack); }); 
// a fake standard-mapping controller the page can read (buttons are pressed from the test)
await pg.addInitScript(() => {
  const btns = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
  window.__pad = { on: false, btns, axes: [0, 0, 0, 0] };
  const gp = () => ({ id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', buttons: btns, axes: window.__pad.axes, timestamp: performance.now() });
  navigator.getGamepads = () => (window.__pad.on ? [gp(), null, null, null] : [null, null, null, null]);
  window.__press = (i, on) => { btns[i].pressed = on; btns[i].value = on ? 1 : 0; };
});
await pg.goto(WEB);
await pg.waitForFunction(() => typeof newRun === 'function' && SAVE && window.AvatarKit?.loaded && window.PvpMenu && window.Glyph, null, { timeout: 90000 });
await pg.waitForTimeout(1500);
await pg.keyboard.press('Enter');
await pg.waitForTimeout(800);
const wait = ms => pg.waitForTimeout(ms);
const tap = async (i, ms = 120) => { await pg.evaluate(i => __press(i, true), i); await wait(ms); await pg.evaluate(i => __press(i, false), i); await wait(80); };

try {
  /* 1. the GigaLeague menu: silent */
  await pg.evaluate(() => { SAVE.opts.music = true; AudioSys.init(); AudioSys.resume(); });
  await wait(2500);
  const titleMusic = await pg.evaluate(() => Music.current);
  await pg.evaluate(() => openPvpMenu());
  await wait(2500);
  ok(await pg.evaluate(() => PvpMenu.isOpen() && !Music.current), `no music while the GigaLeague menu is open (title had: ${titleMusic})`);
  ok(await pg.evaluate(() => !!document.querySelector('#pvpMenu .controls .gl.key')), 'the menu lists the controls as keyboard keys on mouse and keyboard');

  /* 6a. the menu on a controller: prompts become its buttons, LB / RB flip tabs, B backs out of the class editor */
  await pg.evaluate(() => { __pad.on = true; });
  await tap(0);                                                      // A: wakes the pad (Pad.active)
  await wait(500);
  ok(await pg.evaluate(() => Glyph.mode() === 'xbox' && !!document.querySelector('#pvpMenu .controls .gl.pad.face')), 'touching a controller switches the menu prompts to its buttons (Xbox)');
  await tap(5);                                                      // RB: next tab
  ok(await pg.evaluate(() => document.querySelector('#pvpMenu [data-tab].on')?.dataset.tab === 'classes'), 'RB flips the GigaLeague menu to CLASSES');
  await tap(4);                                                      // LB: back to PLAY
  ok(await pg.evaluate(() => document.querySelector('#pvpMenu [data-tab].on')?.dataset.tab === 'play' && !!document.querySelector('#pvpMenu .pad-focus')), 'LB flips back, and a button holds the controller focus');
  // a dropdown steps with left / right
  const sel = await pg.evaluate(() => { const s = document.querySelector('#pvpMenu select[data-k="mode"]'); Pad.setFocus(s); return s.value; });
  await tap(15);
  const sel2 = await pg.evaluate(() => document.querySelector('#pvpMenu select[data-k="mode"]').value);
  ok(sel2 && sel2 !== sel, `D-pad right on a dropdown changes it (${sel} -> ${sel2})`);
  await pg.evaluate(() => { __pad.on = false; dispatchEvent(new MouseEvent('mousemove', { movementX: 3 })); dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' })); });
  await wait(400);

  /* 2-4. an offline TDM against bots */
  await pg.evaluate(() => { const s = document.querySelector('#pvpMenu select[data-k="mode"]'); s.value = 'tdm'; s.dispatchEvent(new Event('change')); });
  await wait(200);
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-act="offline"]').click());
  await pg.waitForFunction(() => window.AR?.Pvp?.on && AR.PvpMission.snap && AR.PvpMission.remotes.size > 3, null, { timeout: 120000 });
  await pg.evaluate(() => { window.__snd = new Set(); const f = AR.PvpAudio.shot; AR.PvpAudio.shot = function (k, snd, ...a) { __snd.add(snd); return f.call(this, k, snd, ...a); }; });
  await wait(4000);
  ok(await pg.evaluate(() => !Music.current), 'no music during the match');
  // let the bots fight; give the player god mode so they stay in it
  await pg.evaluate(() => { const M = AR.PvpMission.transport.match, me = [...M.players.values()].find(p => !p.bot); me.godT = 1; const k = M.kill.bind(M); M.kill = (q, by, i) => (q === me ? null : k(q, by, i)); });
  await wait(25000);
  const st = await pg.evaluate(() => ({ ...AR.PvpAudio.stats, snd: [...__snd], ctx: AudioSys.ctx?.state }));
  console.log('  audio', JSON.stringify(st));
  ok(st.shots > 30, `other players' rounds are heard (${st.shots} placed shots, ${st.far} of them distant)`);
  ok(st.snd.length >= 3, `more than one gun voice is heard (${st.snd.join(', ')})`);
  ok(st.steps > 20, `footsteps are heard (${st.steps})`);
  ok(st.hurt > 0 && st.death > 0, `pain (${st.hurt}) and death (${st.death}) cries are heard`);
  // a round aimed just past the player's head cracks past it
  const wz = await pg.evaluate(async () => {
    const M = AR.PvpMission.transport.match, me = [...M.players.values()].find(p => !p.bot), w0 = AR.PvpAudio.stats.whiz;
    const q = [...M.players.values()].find(p => p.bot && p.alive && p.team !== me.team);
    const eye = [me.pos[0] + 6, me.pos[1] + 1.6, me.pos[2]];
    q.pos = [eye[0], me.pos[1], eye[2]];
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 400));
      const to = [me.pos[0] - eye[0], me.pos[1] + 1.6 + 0.7 - eye[1], me.pos[2] - eye[2]], n = Math.hypot(...to);
      q.yaw = Math.atan2(-to[0], -to[2]); q.pitch = Math.asin(to[1] / n);
      const w = q.weapons[q.cur]; w.next = 0; w.reloadAt = 0; w.mag = Math.max(w.mag, 3);
      M.onFire(q.id, { o: eye, d: [to.map(v => v / n)], rt: M.now });
    }
    await new Promise(r => setTimeout(r, 600));
    return AR.PvpAudio.stats.whiz - w0;
  });
  ok(wz > 0, `rounds passing the player's head crack past it (${wz})`);
  // bodies: kill a bot in view and watch its body
  const body = await pg.evaluate(async () => {
    const M = AR.PvpMission.transport.match, me = [...M.players.values()].find(p => !p.bot);
    const q = [...M.players.values()].find(p => p.bot && p.alive && p.team !== me.team);
    const r = AR.PvpMission.remotes.get(q.num);
    M.kill(q, me, { w: 'ar', head: true });
    await new Promise(res => setTimeout(res, 1200));
    const c1 = r.corpse && r.corpse.av.root.visible, clip = r.corpse?.av.clipName;
    await new Promise(res => setTimeout(res, 4000));
    const c2 = r.corpse && r.corpse.av.root.visible;
    await new Promise(res => setTimeout(res, 5800));
    return { c1, clip, c2, c3: !!r.corpse };
  });
  ok(body.c1 && body.clip === 'Death', `a killed player's body falls with the Death clip (${body.clip})`);
  ok(body.c2, 'the body is still there five seconds later');
  ok(!body.c3, 'and it clears after about nine seconds');
  // medals: four quick kills by the player = DOUBLE TAP.. FOUR-STACK and a QUAD FEED
  await pg.evaluate(async () => {
    const M = AR.PvpMission.transport.match, me = [...M.players.values()].find(p => !p.bot);
    const k0 = M.kill; M.kill = (q, by, i) => (by === me ? k0(q, by, i) : null);     // nobody else scores a kill meanwhile
    for (let i = 0; i < 4; i++) { const q = [...M.players.values()].find(p => p.bot && p.alive && p.team !== me.team); if (q) M.kill(q, me, { w: 'smg' }); await new Promise(r => setTimeout(r, 250)); }
    M.kill = k0;
  });
  await wait(1400);
  const fb = await pg.evaluate(() => ({ medals: [...document.querySelectorAll('#pvpHud .md b')].map(b => b.textContent), qf: document.querySelectorAll('#pvpHud .feed div.qf').length, mine: document.querySelectorAll('#pvpHud .feed div.mine').length,
    font: getComputedStyle(document.querySelector('#pvpHud .feed')).fontSize, pts: document.querySelector('#pvpHud .pts .tot')?.textContent, conf: [...document.querySelectorAll('#pvpHud .pts .ln.k')].length }));
  console.log('  feedback', JSON.stringify(fb));
  await pg.screenshot({ path: path.join(SHOTS, 'pvp-feel-medals.png') }).catch(() => {});
  ok(fb.qf >= 4 && fb.mine >= 4, `four kills in a row light the feed up as a QUAD FEED (${fb.qf} entries)`);
  ok(fb.medals.some(m => /QUAD FEED|FOUR-STACK|TRIPLE|DOUBLE/.test(m)), `medals pop up (${fb.medals.join(', ')})`);
  ok(parseInt(fb.font, 10) >= 15, `the kill feed is bigger (${fb.font})`);
  ok(/^\+\d+/.test(fb.pts || '') && fb.conf > 0, `a running points total with kill confirms (${fb.pts})`);

  /* 6b. a controller in the match: prompts, D-pad, class change, scoreboard */
  await pg.evaluate(() => { __pad.on = true; });
  await tap(11);                                                     // R3 (melee) wakes the pad without moving anything
  await wait(500);
  ok(await pg.evaluate(() => Glyph.mode() === 'xbox' && !!document.querySelector('#pvpHud .strk .gl.pad')), 'the streak panel shows controller buttons once a controller is used');
  const cur0 = await pg.evaluate(() => AR.Player.P.cur);
  await tap(15); await tap(14);                                      // D-pad right, left: streak slots, never a swap
  ok(await pg.evaluate(c => AR.Player.P.cur === c, cur0), 'D-pad left / right do not swap weapons');
  await tap(3); await wait(500);                                     // Y swaps
  ok(await pg.evaluate(c => AR.Player.P.cur !== c, cur0), 'Y swaps weapons');
  await pg.evaluate(() => __press(8, true)); await wait(300);
  ok(await pg.evaluate(() => getComputedStyle(document.querySelector('#pvpHud .board')).display === 'block'), 'holding BACK shows the scoreboard');
  await pg.evaluate(() => __press(8, false)); await wait(300);
  ok(await pg.evaluate(() => !AR.paused && getComputedStyle(document.querySelector('#pvpHud .board')).display === 'none'), 'and letting go hides it (BACK does not pause in PvP)');
  // die, then change class with RB on the respawn screen
  await pg.evaluate(() => { const M = AR.PvpMission.transport.match, me = [...M.players.values()].find(p => !p.bot); M.kill = Object.getPrototypeOf(M).kill.bind(M); M.kill(me, null, { w: 'world' }); });
  await wait(800);
  const c0 = await pg.evaluate(() => document.querySelector('#pvpHud .resp .cls button.on')?.dataset.i);
  await tap(5); await wait(300);
  const c1 = await pg.evaluate(() => ({ on: document.querySelector('#pvpHud .resp .cls button.on')?.dataset.i, hint: !!document.querySelector('#pvpHud .resp .gl.pad'), sim: [...AR.PvpMission.transport.match.players.values()].find(p => !p.bot).cls }));
  ok(c1.on !== c0 && +c1.on === c1.sim, `RB changes class on the respawn screen, and the match has it for the next life (${c0} -> ${c1.on})`);
  ok(c1.hint, 'the respawn screen shows controller buttons');
  await pg.screenshot({ path: path.join(SHOTS, 'pvp-feel-respawn-pad.png') }).catch(() => {});
  await pg.evaluate(() => { __pad.on = false; });
  await pg.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' })));
  await wait(400);
  // the pause menu changes class too, at any time, with the controls for the device in hand
  await wait(4500);
  await pg.evaluate(() => Arena.pause(true));
  await wait(300);
  const pz = await pg.evaluate(() => ({ n: document.querySelectorAll('#arPause [data-pcls]').length, classes: PvpProgress.classes().length, keys: document.querySelectorAll('#arPause .gl').length }));
  await pg.screenshot({ path: path.join(SHOTS, 'pvp-feel-pause.png') }).catch(() => {});
  ok(pz.n === pz.classes && pz.keys > 5, `the pause menu offers every class and lists the controls in the device's buttons (${pz.n} classes, ${pz.keys} prompts)`);
  await pg.evaluate(() => Arena.pause(false));
  await pg.evaluate(() => AR.exit());
  await pg.waitForFunction(() => window.Haven?.active && state === 'run', null, { timeout: 120000 });
  await wait(1500);
  ok(await pg.evaluate(() => !Music.current || !PvpMenu.isOpen()), 'back in the Haven after the match');

  /* 5. Hardpoint: stand in the hill */
  await pg.evaluate(() => { openPvpMenu(); const s = document.querySelector('#pvpMenu select[data-k="mode"]'); s.value = 'hardpoint'; s.dispatchEvent(new Event('change')); });
  await wait(2500);
  ok(await pg.evaluate(() => PvpMenu.isOpen() && !Music.current), 'the Haven music stops when the GigaLeague menu opens there');
  await pg.evaluate(() => document.querySelector('#pvpMenu [data-act="offline"]').click());
  await pg.waitForFunction(() => window.AR?.Pvp?.on && AR.PvpMission.snap?.st === 'live' && AR.Player.P?.alive, null, { timeout: 120000 });
  const hill = await pg.evaluate(async () => {
    const M = AR.PvpMission.transport.match, me = [...M.players.values()].find(p => !p.bot);
    const k = M.kill.bind(M); M.kill = (q, by, i) => (q === me ? null : k(q, by, i));
    for (const b of M.players.values()) if (b.bot && b.team !== me.team) b.bot.skill = Object.assign({}, b.bot.skill, { react: 99 });
    let ticks = 0; const f = AR.PvpAudio.ui; AR.PvpAudio.ui = function (k2, ...a) { if (k2 === 'tick') ticks++; return f.call(this, k2, ...a); };
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      const h = M.hill.pos, p = AR.Player.P;
      me.pos = [h[0], h[1] + 0.05, h[2]]; me.lastSafe = me.pos.slice(); me.vel = [0, 0, 0];      // the match moves us there too
      p.body.pos.set(h[0], h[1] + 0.05, h[2]); p.body.vel.set(0, 0, 0);
      await new Promise(r => setTimeout(r, 200));
      const t = document.querySelector('#pvpHud .ost b')?.textContent; if (t) seen.add(t);
    }
    return { seen: [...seen], ticks, total: document.querySelector('#pvpHud .pts .tot')?.textContent, line: document.querySelector('#pvpHud .pts .ln')?.textContent };
  });
  console.log('  hill', JSON.stringify(hill));
  await pg.screenshot({ path: path.join(SHOTS, 'pvp-feel-hill.png') }).catch(() => {});
  ok(hill.seen.some(t => /SCORING|CONTESTED/.test(t)), `in the hill the HUD says so (${hill.seen.join(' / ')})`);
  ok(hill.ticks >= 3, `each point on the hill ticks (${hill.ticks})`);
  ok(/HILL TIME/.test(hill.line || '') && /^\+\d+/.test(hill.total || ''), `and the points add up under the crosshair (${hill.total} ${hill.line})`);
  ok(await pg.evaluate(() => !Music.current), 'still no music');
} catch (e) { ok(false, 'exception: ' + e.stack); }
ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await browser.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
