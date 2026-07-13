'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
global.WebSocket = { OPEN: 1 };

let workerModule;
async function loadWorker() {
  if (!workerModule) {
    // package.json stays CommonJS for the static project; a data URL lets Node
    // execute the Worker ES module exactly as deployed without a build step.
    const source = fs.readFileSync(path.join(root, 'workers/room-durable-object.js'), 'utf8');
    workerModule = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  }
  return workerModule;
}

function socket() {
  return { readyState:1, messages:[], send(body) { this.messages.push(JSON.parse(body)); } };
}

async function fixture(state = 'lobby') {
  const { RoomDurableObject } = await loadWorker();
  const storage = { writes:[], async put(key, value) { this.writes.push([key, structuredClone(value)]); }, async get() { return null; } };
  const room = new RoomDurableObject({ storage }, {});
  room.room = {
    roomCode:'ABCDE', hostPlayerId:'host', maxPlayers:4, state, seed:null,
    district:0, wave:0, waveDelay:0, phase:state === 'run' ? 'combat' : 'lobby',
    pending:[], directorThreat:0.5, worldRevision:0, createdAt:1, updatedAt:1,
    players:{
      host:{ id:'host', name:'Host', color:'#fff', ready:false, connected:true, state:'alive' },
      guest:{ id:'guest', name:'Guest', color:'#000', ready:false, connected:true, state:'alive' }
    },
    playerStates:{}, enemies:{ e1:{ id:'e1', state:'active', hp:10, maxHp:10 } }, pickups:{}
  };
  const host = socket(), guest = socket();
  room.sessions.set('host', host); room.sessions.set('guest', guest);
  return { room, host, guest, storage };
}

function message(type, payload = {}) {
  return JSON.stringify({ protocolVersion:2, type, ...payload });
}
function errors(ws) { return ws.messages.filter(m => m.type === 'error'); }

test('browser protocol exposes a send allowlist and marks reward_grant server-only', () => {
  const source = fs.readFileSync(path.join(root, 'js/net/net-protocol.js'), 'utf8');
  const context = { window:{} };
  vm.runInNewContext(source, context, { filename:'net-protocol.js' });
  const P = context.window.NetProtocol;
  assert.equal(P.canClientSend(P.MSG.PLAYER_STATE), true);
  assert.equal(P.canClientSend(P.MSG.BOSS_STATE), true);
  assert.equal(P.canClientSend(P.MSG.OBJECTIVE_STATE), true);
  assert.equal(P.canClientSend(P.MSG.REWARD_GRANT), false);
  assert.equal(P.canClientSend(P.MSG.ROOM_STATE), false);
  assert.equal(P.canClientSend('invented_message'), false);
});

test('NetClient refuses server-origin messages before touching the socket', () => {
  const protocolSource = fs.readFileSync(path.join(root, 'js/net/net-protocol.js'), 'utf8');
  const clientSource = fs.readFileSync(path.join(root, 'js/net/net-client.js'), 'utf8');
  class FakeEventTarget { dispatchEvent(event) { this.lastEvent = event; } addEventListener() {} }
  class FakeCustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  const context = { window:{}, EventTarget:FakeEventTarget, CustomEvent:FakeCustomEvent, WebSocket:{ OPEN:1 }, setTimeout, clearTimeout, URLSearchParams };
  vm.runInNewContext(protocolSource, context, { filename:'net-protocol.js' });
  context.NetProtocol = context.window.NetProtocol;
  vm.runInNewContext(clientSource, context, { filename:'net-client.js' });
  const client = new context.window.NetClient({});
  const sent = [];
  client.ws = { readyState:1, send(value) { sent.push(value); } };
  assert.equal(client.send(context.NetProtocol.MSG.REWARD_GRANT, { reward:{ gt:999 } }), false);
  assert.equal(client.lastEvent.detail.error, 'client_message_type_not_allowed');
  assert.deepEqual(sent, []);
  assert.equal(client.send(context.NetProtocol.MSG.PLAYER_READY, { ready:true }), true);
  assert.equal(sent.length, 1);
});

test('room rejects reward forgery and server/unknown message types without rebroadcast', async () => {
  const { room, host, guest } = await fixture('run');
  await room.onMessage('guest', message('reward_grant', { playerId:'guest', reward:{ gt:999999 } }));
  await room.onMessage('guest', message('room_state', { room:{ state:'complete' } }));
  await room.onMessage('guest', message('invented_message', { reward:{ gt:999999 } }));
  assert.deepEqual(host.messages, []);
  assert.equal(errors(guest).length, 3);
  assert.match(errors(guest)[0].message, /server-origin only/);
  assert.equal(room.room.state, 'run');
});

test('host-only boss, objective/district, and completion transitions reject guests', async () => {
  const attempts = [
    ['boss_state', { boss:{ bossId:'boss', hp:0, maxHp:100 } }],
    ['objective_state', { objectiveId:'extract', state:'complete', progress:1 }],
    ['district_complete', { district:2 }],
    ['run_complete', { reason:'forged' }],
    ['run_failed', { reason:'forged' }],
    ['enemy_state', { enemies:[] }],
    ['pickup_spawn', { pickup:{ id:'p1', kind:'gt', val:999 } }]
  ];
  for (const [type, payload] of attempts) {
    const { room, host, guest } = await fixture('run');
    const before = structuredClone(room.room);
    await room.onMessage('guest', message(type, payload));
    assert.equal(errors(guest).at(-1).message, 'Host authority required', type);
    assert.deepEqual(host.messages, [], type);
    assert.deepEqual(room.room, before, type);
  }
});

test('server enforces all connected players ready and prevents transition replay', async () => {
  const { room, host } = await fixture('lobby');
  room.room.players.host.ready = true;
  await room.onMessage('host', message('start_run', { seed:42, district:1, tier:3 }));
  assert.match(errors(host).at(-1).message, /All connected players must be ready/);
  assert.equal(room.room.state, 'lobby');

  room.room.players.guest.ready = true;
  await room.onMessage('host', message('start_run', { seed:42, district:1, tier:3 }));
  assert.equal(room.room.state, 'run');
  assert.equal(room.room.seed, 42);
  assert.equal(host.messages.filter(m => m.type === 'start_run').length, 1);

  await room.onMessage('host', message('start_run', { seed:666, district:99 }));
  assert.match(errors(host).at(-1).message, /already started/);
  assert.equal(room.room.seed, 42);
});

test('authorized host transitions are sanitized, bounded, and terminal', async () => {
  const { room, guest } = await fixture('run');
  await room.onMessage('host', message('boss_state', {
    boss:{ bossId:'x'.repeat(200), hp:50, maxHp:100, injected:{ reward:{ gt:999 } } },
    phase:'rage'.repeat(20), injected:'not relayed'
  }));
  const boss = guest.messages.find(m => m.type === 'boss_state');
  assert.equal(boss.boss.bossId.length, 80);
  assert.equal(boss.phase.length, 40);
  assert.equal(boss.injected, undefined);
  assert.equal(boss.boss.injected, undefined);

  await room.onMessage('host', message('objective_state', { objectiveId:'extract', state:'active', progress:4, injected:{ reward:999 } }));
  const objective = guest.messages.find(m => m.type === 'objective_state');
  assert.equal(objective.objective.progress, 1);
  assert.equal(objective.objective.injected, undefined);

  await room.onMessage('host', message('run_complete', { reason:'done'.repeat(40), reward:{ gt:999999 } }));
  const complete = guest.messages.find(m => m.type === 'run_complete');
  assert.equal(room.room.state, 'complete');
  assert.equal(complete.reason.length, 80);
  assert.equal(complete.reward, undefined);
});

test('room bounds payload bytes and per-player message rate', async () => {
  const { SECURITY_LIMITS } = await loadWorker();
  const oversized = await fixture('run');
  await oversized.room.onMessage('guest', message('ping', { padding:'x'.repeat(SECURITY_LIMITS.maxMessageBytes) }));
  assert.match(errors(oversized.guest).at(-1).message, /too large/);
  assert.deepEqual(oversized.host.messages, []);

  const limited = await fixture('run');
  for (let i = 0; i <= SECURITY_LIMITS.maxMessagesPerSecond; i++) {
    await limited.room.onMessage('guest', message('ping'));
  }
  assert.match(errors(limited.guest).at(-1).message, /rate exceeded/);
  assert.equal(limited.guest.messages.filter(m => m.type === 'pong').length, SECURITY_LIMITS.maxMessagesPerSecond);
});
