'use strict';
// Accounts and cloud saves, end to end against the real Worker code on a local D1 (wrangler dev --local).
//   npm run test:accounts
// Sign-in codes are echoed back only because wrangler.test.jsonc sets DEV_ECHO_CODES; production never does.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const PORT = 8799, BASE = `http://127.0.0.1:${PORT}/api`, STATE = '.wrangler/state-test';
let dev;

async function call(method, p, { token, body, origin, device } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  if (origin) headers.origin = origin;
  if (device) headers['x-e2049-device'] = device;
  const r = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, headers: r.headers, body: text ? JSON.parse(text) : null };
}
async function signIn(email, token) {
  const s = await call('POST', '/auth/email/start', { body: { email } });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const v = await call('POST', '/auth/email/verify', { body: { email, code: s.body.devCode }, token });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return v.body;
}

test.before(async () => {
  fs.rmSync(path.join(root, STATE), { recursive: true, force: true });
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--config', 'wrangler.test.jsonc', '--persist-to', STATE], { cwd: root, stdio: 'ignore' });
  dev = spawn('npx', ['wrangler', 'dev', '--config', 'wrangler.test.jsonc', '--local', '--port', String(PORT), '--persist-to', STATE, '--ip', '127.0.0.1'], { cwd: root, stdio: 'ignore', detached: true });
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + '/health'); if (r.ok) return; } catch (e) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('wrangler dev did not start');
});
test.after(() => { try { process.kill(-dev.pid); } catch (e) { /* already gone */ } });

test('health, CORS for the game origins only', async () => {
  const h = await call('GET', '/health', { origin: 'https://logical-leap.github.io' });
  assert.equal(h.status, 200);
  assert.equal(h.headers.get('access-control-allow-origin'), 'https://logical-leap.github.io');
  const bad = await call('GET', '/health', { origin: 'https://evil.example' });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
  const vercel = await call('GET', '/health', { origin: 'https://earth2049-idle-real-git-main-logicalleaps-projects-b93d2f6e.vercel.app' });
  assert.ok(vercel.headers.get('access-control-allow-origin'));
});

test('email sign-in: bad email, wrong code, tries run out, then a fresh code works', async () => {
  assert.equal((await call('POST', '/auth/email/start', { body: { email: 'not-an-email' } })).status, 400);
  const email = 'tries@example.com';
  const s = await call('POST', '/auth/email/start', { body: { email } });
  const wrong = String((+s.body.devCode + 1) % 1000000).padStart(6, '0');
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/auth/email/verify', { body: { email, code: wrong } })).status, 401);
  assert.equal((await call('POST', '/auth/email/verify', { body: { email, code: s.body.devCode } })).body.error, 'code_expired', 'five wrong tries burn the code');
  const ok = await signIn(email);
  assert.ok(ok.token && ok.created && ok.account.logins[0].label.includes('@example.com'));
  const again = await signIn(email);
  assert.equal(again.created, false);
  assert.equal(again.account.id, ok.account.id, 'the same email is the same account');
});

test('signed-out calls are refused; sessions end on logout', async () => {
  assert.equal((await call('GET', '/saves')).status, 401);
  assert.equal((await call('GET', '/saves', { token: 'x'.repeat(43) })).status, 401);
  const { token } = await signIn('logout@example.com');
  assert.equal((await call('GET', '/me', { token })).status, 200);
  assert.equal((await call('POST', '/auth/logout', { token })).status, 200);
  assert.equal((await call('GET', '/me', { token })).status, 401);
});

test('saves: revision checks stop an older device overwriting a newer save', async () => {
  const { token } = await signIn('saves@example.com');
  const empty = await call('GET', '/saves/fps', { token });
  assert.deepEqual([empty.status, empty.body.rev, empty.body.data], [200, 0, null]);
  const a = await call('PUT', '/saves/fps', { token, device: 'laptop', body: { baseRev: 0, data: JSON.stringify({ gt: 10 }), meta: { gt: 10, label: 'GT 10' } } });
  assert.deepEqual([a.status, a.body.rev], [200, 1]);
  const b = await call('PUT', '/saves/fps', { token, device: 'phone', body: { baseRev: 1, data: JSON.stringify({ gt: 20 }), meta: { gt: 20 } } });
  assert.equal(b.body.rev, 2);
  const stale = await call('PUT', '/saves/fps', { token, device: 'laptop', body: { baseRev: 1, data: JSON.stringify({ gt: 11 }) } });
  assert.equal(stale.status, 409);
  assert.deepEqual([stale.body.rev, stale.body.meta.gt, stale.body.device], [2, 20, 'phone']);
  const forced = await call('PUT', '/saves/fps', { token, device: 'laptop', body: { baseRev: 1, force: true, data: JSON.stringify({ gt: 11 }) } });
  assert.equal(forced.body.rev, 3, 'keeping this device is an explicit choice');
  const got = await call('GET', '/saves/fps', { token });
  assert.equal(JSON.parse(got.body.data).gt, 11);
  const list = await call('GET', '/saves', { token });
  assert.deepEqual(list.body.saves.map(s => [s.slot, s.rev]), [['fps', 3]]);
});

test('saves: bad slots, bad data and oversized saves are refused', async () => {
  const { token } = await signIn('limits@example.com');
  assert.equal((await call('PUT', '/saves/nope', { token, body: { baseRev: 0, data: '{}' } })).status, 404);
  assert.equal((await call('PUT', '/saves/idle', { token, body: { baseRev: 0, data: 'not json' } })).status, 400);
  assert.equal((await call('PUT', '/saves/idle', { token, body: { baseRev: 0, data: JSON.stringify({ x: 'a'.repeat(70000) }) } })).status, 413);
  const meta = await call('PUT', '/saves/idle', { token, body: { baseRev: 0, data: '{"st":{}}', meta: { loop: 3, junk: { deep: 1 }, label: 'x'.repeat(500) } } });
  assert.equal(meta.status, 200);
  const m = (await call('GET', '/saves/idle', { token })).body.meta;
  assert.deepEqual([m.loop, m.junk, m.label.length], [3, undefined, 80], 'meta keeps short scalars only');
});

test('history keeps the last 10 versions and any of them can be read back', async () => {
  const { token } = await signIn('history@example.com');
  let rev = 0;
  for (let i = 1; i <= 13; i++) rev = (await call('PUT', '/saves/grid', { token, body: { baseRev: rev, data: JSON.stringify({ n: i }), meta: { n: i } } })).body.rev;
  const h = await call('GET', '/saves/grid/history', { token });
  assert.deepEqual(h.body.history.map(x => x.rev), [13, 12, 11, 10, 9, 8, 7, 6, 5, 4]);
  const old = await call('GET', '/saves/grid/history/5', { token });
  assert.equal(JSON.parse(old.body.data).n, 5);
  assert.equal((await call('GET', '/saves/grid/history/2', { token })).status, 404);
});

test('accounts are private to each other', async () => {
  const a = await signIn('alice@example.com'), b = await signIn('bob@example.com');
  await call('PUT', '/saves/fps', { token: a.token, body: { baseRev: 0, data: '{"who":"alice"}' } });
  const bob = await call('GET', '/saves/fps', { token: b.token });
  assert.equal(bob.body.data, null);
});

test('a signed-in player can add a second email; an email already used elsewhere is refused', async () => {
  const a = await signIn('link-a@example.com');
  await signIn('link-b@example.com');
  const linked = await signIn('link-c@example.com', a.token);
  assert.equal(linked.token, null);
  assert.equal(linked.linked, true);
  assert.equal(linked.account.logins.length, 2);
  const s = await call('POST', '/auth/email/start', { body: { email: 'link-b@example.com' } });
  const v = await call('POST', '/auth/email/verify', { token: a.token, body: { email: 'link-b@example.com', code: s.body.devCode } });
  assert.deepEqual([v.status, v.body.error], [409, 'login_in_use']);
});

test('export and delete: everything goes, and the email can start over', async () => {
  const { token } = await signIn('delete@example.com');
  await call('PUT', '/saves/fps', { token, body: { baseRev: 0, data: '{"gt":1}' } });
  await call('PUT', '/saves/idle', { token, body: { baseRev: 0, data: '{"st":{}}' } });
  const ex = await call('GET', '/account/export', { token });
  assert.deepEqual(ex.body.saves.map(s => s.slot).sort(), ['fps', 'idle']);
  assert.equal((await call('DELETE', '/account', { token })).body.deleted, true);
  assert.equal((await call('GET', '/me', { token })).status, 401, 'the session went with it');
  const fresh = await signIn('delete@example.com');
  assert.equal(fresh.created, true);
  assert.equal((await call('GET', '/saves', { token: fresh.token })).body.saves.length, 0);
});

test('Steam sign-in answers "not configured" until the Steamworks key is set', async () => {
  const r = await call('POST', '/auth/steam', { body: { ticket: 'ab'.repeat(20) } });
  assert.deepEqual([r.status, r.body.error], [503, 'steam_not_configured']);
});

test('sign-in codes are rate limited per email', async () => {
  const email = 'spam@example.com';
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await call('POST', '/auth/email/start', { body: { email } })).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
});
