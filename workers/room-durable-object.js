const PROTOCOL_VERSION = 1;
const MSG = {
  HELLO:'hello', LEAVE_ROOM:'leave_room', ROOM_STATE:'room_state', PLAYER_READY:'player_ready', START_RUN:'start_run',
  PLAYER_STATE:'player_state', HIT:'hit', DAMAGE:'damage', ENEMY_SPAWN:'enemy_spawn', ENEMY_STATE:'enemy_state',
  ENEMY_DEATH:'enemy_death', PICKUP_SPAWN:'pickup_spawn', PICKUP_COLLECT:'pickup_collect', BOSS_STATE:'boss_state',
  DISTRICT_COMPLETE:'district_complete', RUN_COMPLETE:'run_complete', RUN_FAILED:'run_failed', REWARD_GRANT:'reward_grant', PING:'ping', PONG:'pong', ERROR:'error'
};
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers:{ 'content-type':'application/json', 'access-control-allow-origin':'*' } }); }
function sanitizePlayer(raw) { return { id:String(raw?.id || '').slice(0,80), name:String(raw?.name || 'Purple Operative').slice(0,24), color:String(raw?.color || '#9b59ff').slice(0,16), effectiveLevel:Math.max(1, Number(raw?.effectiveLevel || 1)), ready:false, connected:true }; }
function parseMessage(raw) { try { const m = JSON.parse(raw); if (m.protocolVersion !== PROTOCOL_VERSION || !m.type) return null; return m; } catch { return null; } }
function codeFromId(id) { return String(id || '').replace(/[^A-Z0-9]/gi,'').slice(0,8).toUpperCase(); }
export class RoomDurableObject {
  constructor(state, env) { this.state = state; this.env = env; this.sessions = new Map(); this.room = null; }
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers:{ 'access-control-allow-origin':'*', 'access-control-allow-methods':'GET,POST,OPTIONS', 'access-control-allow-headers':'content-type' } });
    if (url.pathname.endsWith('/init') && request.method === 'POST') {
      const body = await request.json().catch(()=>({}));
      await this.initRoom(codeFromId(body.roomCode), sanitizePlayer(body.player), Number(body.maxPlayers || 4));
      return json(this.publicRoom());
    }
    if (url.pathname.endsWith('/state')) { await this.loadRoom(); return this.room ? json(this.publicRoom()) : json({ error:'room_not_found' }, 404); }
    if (request.headers.get('upgrade') === 'websocket') return this.handleWebSocket(request);
    return json({ error:'not_found' }, 404);
  }
  async initRoom(roomCode, host, maxPlayers) {
    this.room = { roomCode, hostPlayerId:host.id, maxPlayers:Math.min(4, Math.max(1, maxPlayers || 4)), players:{ [host.id]:host }, state:'lobby', seed:null, district:0, wave:0, phase:'lobby', createdAt:Date.now(), updatedAt:Date.now() };
    await this.state.storage.put('room', this.room);
  }
  async loadRoom() { if (!this.room) this.room = await this.state.storage.get('room'); }
  publicRoom() { const r = this.room; return { roomCode:r.roomCode, hostPlayerId:r.hostPlayerId, maxPlayers:r.maxPlayers, state:r.state, seed:r.seed, district:r.district, wave:r.wave, phase:r.phase, players:Object.values(r.players) }; }
  async save() { if (this.room) { this.room.updatedAt = Date.now(); await this.state.storage.put('room', this.room); } }
  async handleWebSocket(request) {
    await this.loadRoom();
    if (!this.room) return json({ error:'room_not_found' }, 404);
    const url = new URL(request.url);
    const player = sanitizePlayer({ id:url.searchParams.get('playerId'), name:url.searchParams.get('name'), color:url.searchParams.get('color'), effectiveLevel:url.searchParams.get('effectiveLevel') });
    if (!player.id) return json({ error:'missing_player_id' }, 400);
    if (!this.room.players[player.id] && Object.keys(this.room.players).length >= this.room.maxPlayers) return json({ error:'room_full' }, 409);
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    server.accept();
    this.sessions.set(player.id, server);
    this.room.players[player.id] = Object.assign({}, this.room.players[player.id] || {}, player, { connected:true });
    await this.save();
    server.addEventListener('message', ev => this.onMessage(player.id, ev.data));
    server.addEventListener('close', () => this.disconnect(player.id));
    server.addEventListener('error', () => this.disconnect(player.id));
    this.broadcast(MSG.ROOM_STATE, { room:this.publicRoom() });
    return new Response(null, { status:101, webSocket:client });
  }
  async disconnect(playerId) {
    this.sessions.delete(playerId);
    if (this.room?.players?.[playerId]) this.room.players[playerId].connected = false;
    if (this.room?.hostPlayerId === playerId) {
      const nextHost = Object.values(this.room.players).find(p => p.connected);
      if (nextHost) this.room.hostPlayerId = nextHost.id;
    }
    await this.save();
    if (this.room) this.broadcast(MSG.ROOM_STATE, { room:this.publicRoom() });
  }
  async onMessage(playerId, raw) {
    const msg = parseMessage(raw);
    if (!msg || !this.room?.players?.[playerId]) return this.send(playerId, MSG.ERROR, { message:'Invalid message' });
    if (msg.type === MSG.PING) return this.send(playerId, MSG.PONG, { now:Date.now() });
    if (msg.type === MSG.PLAYER_READY) { this.room.players[playerId].ready = !!msg.ready; await this.save(); return this.broadcast(MSG.ROOM_STATE, { room:this.publicRoom() }); }
    if (msg.type === MSG.START_RUN) {
      if (playerId !== this.room.hostPlayerId) return this.send(playerId, MSG.ERROR, { message:'Only host can start run' });
      this.room.state = 'run'; this.room.seed = Number(msg.seed || Date.now()); this.room.district = Number(msg.district || 0); this.room.wave = 0; this.room.phase = 'intro';
      await this.save(); this.broadcast(MSG.START_RUN, { seed:this.room.seed, district:this.room.district, tier:msg.tier || 1 });
      return this.broadcast(MSG.ROOM_STATE, { room:this.publicRoom() });
    }
    if (msg.type === MSG.DISTRICT_COMPLETE) { this.room.district = Number(msg.district ?? this.room.district); this.room.phase = 'district_complete'; await this.save(); }
    if (msg.type === MSG.RUN_COMPLETE || msg.type === MSG.RUN_FAILED) this.room.state = msg.type === MSG.RUN_COMPLETE ? 'complete' : 'failed';
    this.broadcast(msg.type, Object.assign({}, msg, { from:playerId }), playerId);
  }
  send(playerId, type, payload) { const ws = this.sessions.get(playerId); if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ protocolVersion:PROTOCOL_VERSION, type, t:Date.now(), ...payload })); }
  broadcast(type, payload, except) { const body = JSON.stringify({ protocolVersion:PROTOCOL_VERSION, type, t:Date.now(), ...payload }); for (const [id, ws] of this.sessions) if (id !== except && ws.readyState === WebSocket.OPEN) ws.send(body); }
}
