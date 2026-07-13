'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const URL = process.env.E2049_URL || 'http://127.0.0.1:8049/?acceptance=1';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT = process.env.E2049_ACCEPTANCE_SHOT || path.join(process.cwd(), 'artifacts', 'm2-acceptance.png');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let activeBrowser = null;

async function closeActiveBrowser() {
  const browser = activeBrowser;
  activeBrowser = null;
  if (!browser) return;
  await Promise.race([browser.close(), sleep(5000)]);
}

async function main() {
  fs.mkdirSync(path.dirname(SHOT), { recursive:true });
  const browser = await chromium.launch({
    executablePath:CHROME,
    headless:process.env.E2049_HEADLESS === '1',
    args:['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
  });
  activeBrowser = browser;
  const context = await browser.newContext({ viewport:{ width:1280, height:720 } });
  const page = await context.newPage();
  const errors = [];
  const httpErrors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) httpErrors.push({ status:response.status(), url:response.url() });
  });
  await page.addInitScript(() => {
    localStorage.clear();
    let state = 7 >>> 0;
    Math.random = () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  await page.goto(URL, { waitUntil:'networkidle', timeout:60000 });
  await page.waitForFunction(() => document.querySelector('#loadScreen')?.style.display === 'none', null, { timeout:60000 });
  assert.equal(await page.evaluate(() => typeof window.__E2049_ACCEPTANCE__?.snapshot), 'function');
  const snap = () => page.evaluate(() => window.__E2049_ACCEPTANCE__.snapshot());

  await page.click('#btnHub');
  await page.waitForFunction(() => {
    const s = window.__E2049_ACCEPTANCE__?.snapshot();
    return s?.state === 'run' && s.hub === true && Math.abs(s.player.z - 48) < 0.6;
  }, null, { timeout:30000 });
  const initial = await snap();
  assert.equal(initial.save.runs, 0);

  await navigate(page, snap, { x:0, z:46 }, 3, 20000);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => {
    const s = window.__E2049_ACCEPTANCE__?.snapshot();
    return s?.state === 'run' && !s.hub && s.phase === 'objective' && Math.abs(s.player.z - 37) < 0.8;
  }, null, { timeout:30000 });
  const deployed = await snap();
  assert.equal(deployed.save.runs, 1);

  await page.click('#c');
  await navigate(page, snap, deployed.objective, 2.5, 45000);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => {
    const s = window.__E2049_ACCEPTANCE__?.snapshot();
    return s?.phase === 'wave' && s.wave === 1 && (s.pendingEnemies + s.liveEnemies) > 0;
  }, null, { timeout:20000 });
  const waveStarted = await snap();
  assert.equal(waveStarted.save.runs, 1);
  assert.equal(waveStarted.wave, 1);
  assert.ok(waveStarted.pendingEnemies + waveStarted.liveEnemies > 0);
  assert.ok(Math.hypot(waveStarted.player.x - deployed.player.x, waveStarted.player.z - deployed.player.z) > 10);

  await page.screenshot({ path:SHOT, fullPage:true });
  assert.deepEqual(errors, []);
  const unexpectedHttpErrors = httpErrors.filter(({ status, url }) =>
    !(status === 404 && url.endsWith('/assets/data/game-data.json'))
  );
  assert.deepEqual(unexpectedHttpErrors, []);
  console.log(JSON.stringify({
    ok:true,
    scope:'real-input Hub deployment, authored ShillZ movement, objective activation, and wave-start smoke',
    wave:waveStarted.wave,
    hostiles:waveStarted.pendingEnemies + waveStarted.liveEnemies,
    player:waveStarted.player,
    optionalFallbacks:httpErrors,
    screenshot:SHOT,
  }, null, 2));
  await closeActiveBrowser();
}

async function navigate(page, snapshotFn, target, radius, timeout) {
  const deadline = Date.now() + timeout;
  let stuck = 0;
  let previous = null;
  while (Date.now() < deadline) {
    const p = (await snapshotFn()).player;
    const dx = target.x - p.x, dz = target.z - p.z;
    if (Math.hypot(dx, dz) <= radius) return;
    const fwdX = -Math.sin(p.yaw), fwdZ = -Math.cos(p.yaw);
    const rightX = Math.cos(p.yaw), rightZ = -Math.sin(p.yaw);
    const forward = dx * fwdX + dz * fwdZ;
    const right = dx * rightX + dz * rightZ;
    const keys = [];
    if (forward > 0.4) keys.push('KeyW'); else if (forward < -0.4) keys.push('KeyS');
    if (right > 0.4) keys.push('KeyD'); else if (right < -0.4) keys.push('KeyA');
    for (const key of keys) await page.keyboard.down(key);
    if (stuck > 5) await page.keyboard.press('ShiftLeft');
    await sleep(140);
    for (const key of keys) await page.keyboard.up(key);
    const moved = previous ? Math.hypot(p.x - previous.x, p.z - previous.z) : 1;
    stuck = moved < 0.03 ? stuck + 1 : 0;
    previous = { x:p.x, z:p.z };
  }
  throw new Error(`navigation timeout to ${JSON.stringify(target)} from ${JSON.stringify((await snapshotFn()).player)}`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  await closeActiveBrowser().catch(() => {});
  process.exit(process.exitCode || 0);
});
