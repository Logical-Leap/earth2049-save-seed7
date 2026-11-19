// The map rework, checked in the real game (Chromium): an offline GigaLeague match on every reworked map plays with bots
// and no errors, and on the Living Towers and the Web the local player goes through a teleporter (the match server
// accepts the move; the camera comes along). Screenshots go to SHOTS.
//   node scripts/qa/map-rework-e2e.mjs   (CHROME=/path/to/chrome; SHOTS=dir; MAPS=towers,botBase,...)
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); } catch (e) { ({ chromium } = await import('playwright-core')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS || '.';
const MAPS = (process.env.MAPS || 'towers,botBase,downtown,tech,cryptidD,harbor').split(',');
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

try {
  for (const map of MAPS) {
    const pg = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    const errs = [];
    pg.on('pageerror', e => { errs.push(e.message); console.log('PAGEERR', e.stack); });
    await pg.goto(WEB);
    await pg.waitForFunction(() => typeof newRun === 'function' && SAVE && window.PvpMenu, null, { timeout: 90000 });
    await pg.waitForTimeout(1000);
    await pg.keyboard.press('Enter');
    await pg.evaluate(() => openPvpMenu());
    await pg.waitForTimeout(400);
    await pg.evaluate(m => {
      for (const [k, v] of [['mode', 'tdm'], ['map', m]]) { const s = document.querySelector(`#pvpMenu select[data-k="${k}"]`); s.value = v; s.dispatchEvent(new Event('change')); }
    }, map);
    await pg.waitForTimeout(200);
    await pg.evaluate(() => document.querySelector('#pvpMenu [data-act="offline"]').click());
    await pg.waitForFunction(() => window.AR?.Pvp?.on && AR.PvpMission.snap?.st === 'live' && AR.Player.P?.alive, null, { timeout: 180000 });
    await pg.waitForTimeout(4000);
    const live = await pg.evaluate(() => ({ map: AR.MAP?.id, bots: AR.PvpMission.remotes.size }));
    ok(live.map === map && live.bots >= 6, `${map}: an offline match is live with ${live.bots} other players`);
    await pg.screenshot({ path: path.join(SHOTS, `rework-${map}.png`) });
    const teles = await pg.evaluate(() => AR.World.markers('tele').length);
    if (teles) {
      // stand on the first teleporter: you come out at its exit, the server agrees, the camera is with you
      const r = await pg.evaluate(async () => {
        const t = AR.World.markers('tele')[0], P = AR.Player.P;
        const M = AR.PvpMission.transport.match, me = [...M.players.values()].find(p => !p.bot); me.godT = 1;
        me.pos = [t.pos[0], t.pos[1] + 0.1, t.pos[2]];                       // walk-up skipped: the server has you on the pad too
        P.body.pos.set(t.pos[0], t.pos[1] + 0.1, t.pos[2]); P.body.vel.set(0, 0, 0); P.teleLock = false;
        await new Promise(res => setTimeout(res, 1500));
        const s = M.players.get(me.id);
        return { at: [P.body.pos.x, P.body.pos.y, P.body.pos.z], exit: t.target, cam: P.camY, server: s.pos, violations: s.violations };
      });
      const near = (a, b, d = 2.5) => Math.hypot(a[0] - b[0], a[2] - b[2]) < d && Math.abs(a[1] - b[1]) < 1.5;
      ok(near(r.at, r.exit, 4) && near(r.server, r.at, 3) && Math.abs(r.cam - r.at[1]) < 1, `${map}: through a teleporter, the server agrees (${JSON.stringify({ at: r.at.map(v => +v.toFixed(1)), exit: r.exit, server: r.server.map(v => +v.toFixed(1)) })})`);
      await pg.screenshot({ path: path.join(SHOTS, `rework-${map}-tele.png`) });
    }
    await pg.waitForTimeout(8000);
    const after = await pg.evaluate(() => ({ score: AR.PvpMission.snap?.sc || null, kills: [...AR.PvpMission.transport.match.players.values()].reduce((a, p) => a + (p.kills || 0), 0) }));
    ok(after.kills > 0, `${map}: the bots find each other and fight (${after.kills} kills)`);
    ok(!errs.length, `${map}: no page errors (${errs.length})`);
    await pg.context().close();
  }
} catch (e) {
  console.log('ERROR', e.stack); fails++;
} finally {
  await browser.close(); srv.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
}
