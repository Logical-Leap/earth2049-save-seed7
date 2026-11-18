'use strict';
// The co-op server browser and quick match: the public game list's rules, and the live site's server default.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const load = () => import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(root, 'workers/lobby-directory.js'), 'utf8')).toString('base64'));

test('the list shows live, open games: lobbies first, fuller first; full, empty and stale ones hidden', async () => {
  const { listable, DIRECTORY_TTL_MS } = await load();
  const now = 1_000_000;
  const e = (code, players, state = 'lobby', age = 0, protocol = 2) => ({ code, players, max: 4, state, updatedAt: now - age, protocol });
  const out = listable([e('RUN2', 2, 'run'), e('LOB1', 1), e('LOB3', 3), e('FULL', 4), e('EMPTY', 0), e('OLD', 2, 'lobby', DIRECTORY_TTL_MS + 1), e('V1', 1, 'lobby', 0, 1)], now, 2);
  assert.deepEqual(out.map(x => x.code), ['LOB3', 'LOB1', 'RUN2']);
});

test('quick match prefers an open lobby, falls back to a mission with a free slot, else nothing', async () => {
  const { bestMatch } = await load();
  const now = Date.now();
  assert.equal(bestMatch([{ code: 'R', players: 2, max: 4, state: 'run', updatedAt: now }, { code: 'L', players: 1, max: 4, state: 'lobby', updatedAt: now }]).code, 'L');
  assert.equal(bestMatch([{ code: 'R', players: 2, max: 4, state: 'run', updatedAt: now }]).code, 'R');
  assert.equal(bestMatch([{ code: 'F', players: 4, max: 4, state: 'lobby', updatedAt: now }]), null);
});

test('entries are sanitized', async () => {
  const { sanitizeEntry } = await load();
  assert.equal(sanitizeEntry({}), null);
  const x = sanitizeEntry({ code: 'ab-12<c>', name: 'x'.repeat(99), players: 99, max: 9, state: 'hacked' });
  assert.equal(x.code, 'AB12C'); assert.equal(x.name.length, 32); assert.equal(x.players, 4); assert.equal(x.max, 4); assert.equal(x.state, 'lobby');
});

test('directory DO adds, lists and removes rooms', async () => {
  const { LobbyDirectory } = await load();
  const store = {}; const dir = new LobbyDirectory({ storage: { async get(k) { return store[k]; }, async put(k, v) { store[k] = v; } } });
  const post = (p, b) => dir.fetch(new Request('https://directory' + p, { method: 'POST', body: JSON.stringify(b) }));
  await post('/update', { code: 'AAAAA', name: 'A', players: 1, max: 4, state: 'lobby', protocol: 2 });
  let list = await (await dir.fetch(new Request('https://directory/list?protocol=2'))).json();
  assert.deepEqual(list.rooms.map(r => r.code), ['AAAAA']);
  await post('/update', { code: 'AAAAA', players: 0 });
  list = await (await dir.fetch(new Request('https://directory/list?protocol=2'))).json();
  assert.equal(list.rooms.length, 0);
});

test('real builds always talk to the official co-op server; only local dev copies may override', () => {
  const src = fs.readFileSync(path.join(root, 'js/net/net-config.js'), 'utf8');
  assert.match(src, /OFFICIAL = 'https:\/\/earth2049-coop\.chandler-fac\.workers\.dev'/);
  assert.match(src, /workerUrl: params\.get\('coopWorker'\) \|\| \(local && stored\) \|\| OFFICIAL/);
  const wr = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8');
  assert.match(wr, /"LOBBIES", "class_name": "LobbyDirectory"/);
  assert.match(wr, /"tag": "v2", "new_sqlite_classes": \["LobbyDirectory"\]/);
});

test('room start: the host does not need a separate ready, and a squad can play again after a mission', () => {
  const src = fs.readFileSync(path.join(root, 'workers/room-durable-object.js'), 'utf8');
  assert.match(src, /this\.room\.players\[playerId\]\.ready=true;\s+\/\/ pressing start is the host's ready/);
  assert.match(src, /if\(this\.room\.state==='run'\)return this\.reject\(playerId,'Run already started'\)/);
});
