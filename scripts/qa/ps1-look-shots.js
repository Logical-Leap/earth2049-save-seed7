/*
 * Screenshots of the title, Hub and a ShillZ fight in each look mode.
 *
 *   npm run dev &            # serves on :8049
 *   CHROME_PATH=/path/to/chrome node scripts/qa/ps1-look-shots.js [outDir] [modes]
 *
 * modes: comma list of off,360,240 (default all three).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.E2049_URL || 'http://127.0.0.1:8049/';
const OUT = path.resolve(process.argv[2] || 'artifacts/ps1-look');
const MODES = (process.argv[3] || 'off,360,240').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function shoot(browser, mode) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
  await page.goto(`${BASE}?acceptance=1&retro=${mode}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => document.querySelector('#loadScreen')?.style.display === 'none', null, { timeout: 90000 });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, `${mode}-title.png`) });

  await page.click('#btnHub');
  await page.waitForFunction(() => window.__E2049_ACCEPTANCE__?.snapshot()?.hub === true, null, { timeout: 60000 });
  await sleep(2500);
  await page.screenshot({ path: path.join(OUT, `${mode}-hub.png`) });

  // Solo ShillZ run with a line-up of PS1 enemies and Riya in front of the player.
  await page.evaluate(async () => {
    document.querySelectorAll('.ov').forEach(o => o.classList.remove('show'));
    await newRun();
    DevAPI.setGodMode(true);
    G.waveDelay = 9999; G.pending = [];
    G.p.yaw = 0;
    const p = G.p, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const at = (d, side) => [p.pos.x + fx * d + rx * side, p.pos.z + fz * d + rz * side];
    spawnEnemy('shill', ...at(6, -2.4));
    spawnEnemy('streamer', ...at(6, 0));
    spawnEnemy('hypebeast', ...at(6.5, 2.6));
    spawnEnemy(null, ...at(12, 0), false, 'riya');
  });
  // Enemies drop in from above; wait until every one has landed (slow on software GL).
  await page.waitForFunction(() => G.enemies.length >= 4 && G.enemies.every(e => e.state === 'active'), null, { timeout: 120000 });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, `${mode}-fight.png`) });
  const info = await page.evaluate(() => ({
    enemies: G.enemies.map(e => ({ t: e.type?.id || e.bossId || 'boss', ps1: !!e.rig?.ps1, h: +(new THREE.Box3().setFromObject(e.rig.root).getSize(new THREE.Vector3()).y).toFixed(2) })),
    guns: (() => { const n = []; gunGroup.traverse(o => { if (o.name.startsWith('GLB_gun_')) n.push(o.name); }); return n; })(),
  }));
  await page.context().close();
  return { mode, errors, info };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
  });
  const results = [];
  for (const m of MODES) results.push(await shoot(browser, m));
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  if (results.some(r => r.errors.length)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });
