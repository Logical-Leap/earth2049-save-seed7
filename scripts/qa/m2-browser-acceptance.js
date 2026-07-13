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
    executablePath: CHROME,
    headless: process.env.E2049_HEADLESS === '1',
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
  });
  activeBrowser = browser;
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
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
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#loadScreen')?.style.display === 'none', null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => typeof window.__E2049_ACCEPTANCE__?.snapshot), 'function');
  const snap = () => page.evaluate(() => window.__E2049_ACCEPTANCE__.snapshot());

  await page.click('#btnHub');
  console.log('[m2] entered Hub');
  await page.waitForFunction(() => {
    const s = window.__E2049_ACCEPTANCE__?.snapshot();
    return s?.state === 'run' && s.hub === true && Math.abs(s.player.z - 48) < 0.6;
  }, null, { timeout: 30000 });
  let initial = await snap();
  assert.equal(initial.save.runs, 0);
  assert.ok(Math.abs(initial.player.z - 48) < 0.6, `unexpected Hub spawn ${JSON.stringify(initial.player)}`);

  await navigate(page, snap, { x: 0, z: 46 }, 3.0, 20000);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => {
    const s = window.__E2049_ACCEPTANCE__?.snapshot();
    return s?.state === 'run' && s.hub === false && s.phase === 'objective' && Math.abs(s.player.z - 37) < 0.8;
  }, null, { timeout: 30000 });
  let deployed = await snap();
  console.log('[m2] deployed', JSON.stringify(deployed.player));
  assert.equal(deployed.save.runs, 1);
  assert.ok(Math.abs(deployed.player.z - 37) < 0.8);

  await page.click('#c');
  await navigate(page, snap, deployed.objective, 2.5, 45000);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => {
    const p = window.__E2049_ACCEPTANCE__?.snapshot().phase;
    return p === 'intro' || p === 'wave';
  }, null, { timeout: 15000 });
  console.log('[m2] objective activated');

  const seenWaves = new Set();
  const combatDeadline = Date.now() + 600000;
  let combatTick = 0;
  let nextCombatLog = Date.now();
  while (Date.now() < combatDeadline) {
    const s = await snap();
    if (s.wave) seenWaves.add(s.wave);
    if (s.phase === 'extraction') break;
    if (s.state === 'dead') throw new Error(`player died during acceptance: ${JSON.stringify(s)}`);
    if (Date.now() >= nextCombatLog) {
      console.log('[m2] combat', JSON.stringify({ phase:s.phase, wave:s.wave, live:s.liveEnemies, pending:s.pendingEnemies, hp:s.player?.hp, kills:s.player?.kills, bossHp:s.boss?.hp }));
      nextCombatLog = Date.now() + 10000;
    }
    if (s.player?.ammo === 0) await page.keyboard.press('KeyR');
    const target = nearestEnemy(s);
    if (!target) { await sleep(250); continue; }
    if (target.d2 > 625) {
      await navigate(page, snap, target, 18, 10000);
      continue;
    }
    await aimAt(page, snap, target);
    await page.mouse.down({ button:'left' });
    const strafeKey = Math.floor(combatTick / 8) % 2 ? 'KeyA' : 'KeyD';
    if (target.d2 < 225) await page.keyboard.down('KeyS');
    await page.keyboard.down(strafeKey);
    if (combatTick % 3 === 0) await page.keyboard.press('ShiftLeft');
    if (combatTick % 12 === 0) await page.keyboard.press('KeyF');
    await sleep(350);
    await page.keyboard.up('KeyS').catch(() => {});
    await page.keyboard.up('KeyA').catch(() => {});
    await page.keyboard.up('KeyD').catch(() => {});
    await page.mouse.up({ button:'left' });
    combatTick++;
  }

  const cleared = await snap();
  assert.equal(cleared.phase, 'extraction', `combat did not reach extraction: ${JSON.stringify(cleared)}`);
  assert.ok(seenWaves.has(1) && seenWaves.has(2) && seenWaves.has(3), `missing waves: ${[...seenWaves]}`);
  assert.ok(cleared.player.kills > 0);
  assert.ok(cleared.player.gt >= 120, `boss reward missing: ${cleared.player.gt}`);

  await navigate(page, snap, cleared.extraction, 2.5, 60000);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => {
    const s = window.__E2049_ACCEPTANCE__?.snapshot();
    return s?.state === 'run' && s.hub === true && Math.abs(s.player.z - 48) < 0.6;
  }, null, { timeout:30000 });
  const hubReturn = await snap();
  assert.equal(hubReturn.save.runs, 1);
  assert.ok(hubReturn.save.gt >= 120);
  assert.equal(hubReturn.save.shillzLeaders, 1);
  assert.ok(hubReturn.save.bestD >= 1);

  await navigate(page, snap, { x:38, z:8 }, 2.5, 60000);
  await page.keyboard.press('KeyE');
  await page.waitForSelector('[data-meta="vitality"]', { state:'visible', timeout:10000 });
  await page.click('[data-meta="vitality"]');
  await page.keyboard.press('Escape');
  await navigate(page, snap, { x:0, z:46 }, 3.0, 60000);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => {
    const s = window.__E2049_ACCEPTANCE__?.snapshot();
    return s?.state === 'run' && s.hub === false && s.phase === 'objective';
  }, null, { timeout:30000 });
  const secondRun = await snap();
  assert.equal(secondRun.save.runs, 2);
  assert.equal(secondRun.save.upgrades.vitality, 1);
  assert.ok(secondRun.player.maxHp > 100);

  await page.reload({ waitUntil:'networkidle' });
  await page.waitForFunction(() => window.__E2049_ACCEPTANCE__?.snapshot().save?.runs === 2, null, { timeout:60000 });
  const persisted = await snap();
  assert.equal(persisted.save.shillzLeaders, 1);
  assert.equal(persisted.save.upgrades.vitality, 1);
  assert.ok(persisted.save.gt >= 0);
  await page.screenshot({ path:SHOT, fullPage:true });
  assert.deepEqual(errors, []);
  const unexpectedHttpErrors = httpErrors.filter(({ status, url }) =>
    !(status === 404 && url.endsWith('/assets/data/game-data.json'))
  );
  assert.deepEqual(unexpectedHttpErrors, []);
  console.log(JSON.stringify({
    ok:true,
    scope:'fresh-save Hub → ShillZ objective → waves → boss → extraction → bank → vitality upgrade → second run → reload',
    waves:[...seenWaves],
    hubReturn:hubReturn.save,
    secondRun:{ save:secondRun.save, maxHp:secondRun.player.maxHp },
    optionalFallbacks:httpErrors,
    screenshot:SHOT,
  }, null, 2));
  await browser.close();
  activeBrowser = null;

async function navigate(page, snapshotFn, target, radius, timeout) {
  const deadline = Date.now() + timeout;
  let stuck = 0;
  let previous = null;
  while (Date.now() < deadline) {
    const s = await snapshotFn();
    const p = s.player;
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
