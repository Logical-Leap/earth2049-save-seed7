const PROTOCOL_VERSION = 2;
const MSG = Object.freeze({
  ROOM_STATE:'room_state', WORLD_SNAPSHOT:'world_snapshot', PLAYER_READY:'player_ready', START_RUN:'start_run',
  PLAYER_STATE:'player_state', HIT:'hit', ENEMY_SPAWN:'enemy_spawn', ENEMY_STATE:'enemy_state', ENEMY_DEATH:'enemy_death',
  PICKUP_SPAWN:'pickup_spawn', PICKUP_COLLECT:'pickup_collect', BOSS_STATE:'boss_state', OBJECTIVE_STATE:'objective_state', DISTRICT_COMPLETE:'district_complete',
  RUN_COMPLETE:'run_complete', RUN_FAILED:'run_failed', REWARD_GRANT:'reward_grant', DOWNED:'downed', REVIVE:'revive',
  PING:'ping', PONG:'pong', ERROR:'error'
});

// This is the complete set of messages accepted from a browser. Everything else,
// including valid server message names, is rejected rather than catch-all relayed.
export const CLIENT_MESSAGE_TYPES = Object.freeze([
  MSG.PING, MSG.PLAYER_READY, MSG.START_RUN, MSG.PLAYER_STATE, MSG.HIT,
  MSG.ENEMY_SPAWN, MSG.ENEMY_STATE, MSG.ENEMY_DEATH, MSG.PICKUP_SPAWN,
  MSG.PICKUP_COLLECT, MSG.BOSS_STATE, MSG.OBJECTIVE_STATE, MSG.DISTRICT_COMPLETE,
  MSG.RUN_COMPLETE, MSG.RUN_FAILED, MSG.REVIVE
]);
const CLIENT_MESSAGE_TYPE_SET = new Set(CLIENT_MESSAGE_TYPES);
export const SECURITY_LIMITS = Object.freeze({
  maxMessageBytes: 64 * 1024,
  maxMessagesPerSecond: 120,
  maxEnemies: 160,
  maxPickups: 240
});

const HOST_ONLY_TYPES = new Set([
  MSG.START_RUN, MSG.ENEMY_SPAWN, MSG.ENEMY_STATE, MSG.ENEMY_DEATH,
  MSG.PICKUP_SPAWN, MSG.BOSS_STATE, MSG.OBJECTIVE_STATE, MSG.DISTRICT_COMPLETE,
  MSG.RUN_COMPLETE, MSG.RUN_FAILED
]);
const MAX_DAMAGE = 5000, REVIVE_RANGE = 3.25, REVIVE_HOLD_MS = 1800;

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers:{'content-type':'application/json','access-control-allow-origin':'*'} }); }
function finite(n, fallback = 0) { n = Number(n); return Number.isFinite(n) ? n : fallback; }
function boundedInt(n, fallback = 0, min = 0, max = 1_000_000) { return Math.min(max, Math.max(min, Math.floor(finite(n, fallback)))); }
function vec(raw) { return { x:finite(raw?.x), y:finite(raw?.y), z:finite(raw?.z) }; }
function sanitizePlayer(raw) { return { id:String(raw?.id || '').slice(0,80), name:String(raw?.name || 'Purple Operative').slice(0,24), color:String(raw?.color || '#9b59ff').slice(0,16), effectiveLevel:Math.max(1, finite(raw?.effectiveLevel,1)), ready:false, connected:true, state:'alive' }; }
function parseMessage(raw) { try { const m=JSON.parse(raw); return m?.protocolVersion===PROTOCOL_VERSION && typeof m.type==='string' ? m : null; } catch { return null; } }
function codeFromId(id) { return String(id||'').replace(/[^A-Z0-9]/gi,'').slice(0,8).toUpperCase(); }
function safeEnemy(raw) { const id=String(raw?.id||'').slice(0,80); if(!id) return null; return { id, typeId:String(raw.typeId||'').slice(0,40), boss:raw.boss?String(raw.boss).slice(0,40):null, elite:!!raw.elite, x:finite(raw.x), y:finite(raw.y), z:finite(raw.z), yaw:finite(raw.yaw), hp:Math.max(0,finite(raw.hp)), maxHp:Math.max(1,finite(raw.maxHp,1)), state:String(raw.state||'active').slice(0,20) }; }
function safeWeapon(raw) { if(!raw || typeof raw!=='object')return null; const cap=(v,max=1_000_000)=>Math.max(0,Math.min(max,finite(v))); return { id:String(raw.id||'').slice(0,40), rar:boundedInt(raw.rar,0,0,6), cls:String(raw.cls||'').slice(0,24), type:String(raw.type||'').slice(0,24), name:String(raw.name||'').slice(0,60), dmg:cap(raw.dmg,MAX_DAMAGE), rpm:cap(raw.rpm,10_000), spread:cap(raw.spread,10), pellets:boundedInt(raw.pellets,1,1,100), pierce:boundedInt(raw.pierce,1,1,100), projSpd:cap(raw.projSpd,100_000), aoe:cap(raw.aoe,1_000), ammoMax:cap(raw.ammoMax), ammo:cap(raw.ammo) }; }
function safePickup(raw) { const id=String(raw?.id||'').slice(0,80); if(!id) return null; return { id, kind:String(raw.kind||'gt').slice(0,20), x:finite(raw.x), z:finite(raw.z), val:Math.max(0,Math.min(1_000_000,finite(raw.val))), weapon:safeWeapon(raw.weapon) }; }
function safeBossState(raw) { return { bossId:String(raw?.bossId||raw?.id||'').slice(0,80), phase:String(raw?.phase||'').slice(0,40), state:String(raw?.state||'active').slice(0,24), hp:Math.max(0,finite(raw?.hp)), maxHp:Math.max(1,finite(raw?.maxHp,1)), position:vec(raw?.position) }; }
function safeObjectiveState(raw) { return { objectiveId:String(raw?.objectiveId||raw?.id||'').slice(0,80), state:String(raw?.state||'active').slice(0,24), progress:Math.max(0,Math.min(1,finite(raw?.progress))), current:Math.max(0,finite(raw?.current)), target:Math.max(0,finite(raw?.target)), position:vec(raw?.position) }; }
function messageBytes(raw) { return typeof raw === 'string' ? new TextEncoder().encode(raw).byteLength : SECURITY_LIMITS.maxMessageBytes + 1; }

export class RoomDurableObject {
  constructor(state, env) { this.state=state; this.env=env; this.sessions=new Map(); this.room=null; this.dirtyWorld=false; this.lastWorldSave=0; this.messageRates=new Map(); }
  async fetch(request) {
    const url=new URL(request.url);
    if(request.method==='OPTIONS') return new Response(null,{headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'}});
    if(url.pathname.endsWith('/init')&&request.method==='POST'){ const body=await request.json().catch(()=>({})); await this.initRoom(codeFromId(body.roomCode),sanitizePlayer(body.player),Number(body.maxPlayers||4)); return json(this.publicRoom()); }
    if(url.pathname.endsWith('/state')){ await this.loadRoom(); return this.room?json({room:this.publicRoom(),snapshot:this.snapshot()}):json({error:'room_not_found'},404); }
    if(request.headers.get('upgrade')==='websocket') return this.handleWebSocket(request);
    return json({error:'not_found'},404);
  }
  async initRoom(roomCode,host,maxPlayers){ this.room={roomCode,hostPlayerId:host.id,maxPlayers:Math.min(4,Math.max(1,maxPlayers||4)),players:{[host.id]:host},playerStates:{},enemies:{},pickups:{},objective:null,pending:[],state:'lobby',seed:null,district:0,wave:0,waveDelay:0,phase:'lobby',directorThreat:0.5,worldRevision:0,createdAt:Date.now(),updatedAt:Date.now()}; await this.state.storage.put('room',this.room); }
  async loadRoom(){ if(!this.room){ this.room=await this.state.storage.get('room'); if(this.room){ this.room.playerStates ||= {}; this.room.enemies ||= {}; this.room.pickups ||= {}; this.room.objective ||= null; this.room.pending ||= []; this.room.waveDelay ||= 0; this.room.directorThreat ||= 0.5; this.room.worldRevision ||= 0; } } }
  publicRoom(){ const r=this.room; return {roomCode:r.roomCode,hostPlayerId:r.hostPlayerId,maxPlayers:r.maxPlayers,state:r.state,seed:r.seed,district:r.district,wave:r.wave,phase:r.phase,worldRevision:r.worldRevision,players:Object.values(r.players)}; }
  snapshot(){ const r=this.room; return {revision:r.worldRevision,seed:r.seed,district:r.district,wave:r.wave,waveDelay:r.waveDelay,phase:r.phase,objective:r.objective||null,pending:r.pending||[],directorThreat:r.directorThreat,players:Object.values(r.playerStates),enemies:Object.values(r.enemies),pickups:Object.values(r.pickups)}; }
  async save(force=false){ if(!this.room)return; const now=Date.now(); if(force||!this.dirtyWorld||now-this.lastWorldSave>=2000){ this.room.updatedAt=now; await this.state.storage.put('room',this.room); this.dirtyWorld=false; this.lastWorldSave=now; } }
  async handleWebSocket(request){
    await this.loadRoom(); if(!this.room)return json({error:'room_not_found'},404);
    const url=new URL(request.url), player=sanitizePlayer({id:url.searchParams.get('playerId'),name:url.searchParams.get('name'),color:url.searchParams.get('color'),effectiveLevel:url.searchParams.get('effectiveLevel')});
    if(!player.id)return json({error:'missing_player_id'},400);
    if(!this.room.players[player.id]&&Object.keys(this.room.players).length>=this.room.maxPlayers)return json({error:'room_full'},409);
    const old=this.sessions.get(player.id); try{old?.close(4001,'replaced_by_reconnect');}catch{}
    const pair=new WebSocketPair(),[client,server]=Object.values(pair); server.accept(); this.sessions.set(player.id,server);
    this.room.players[player.id]=Object.assign({},this.room.players[player.id]||{},player,{connected:true}); await this.save(true);
    server.addEventListener('message',ev=>this.onMessage(player.id,ev.data)); server.addEventListener('close',()=>this.disconnect(player.id,server)); server.addEventListener('error',()=>this.disconnect(player.id,server));
    this.send(player.id,MSG.ROOM_STATE,{room:this.publicRoom()}); this.send(player.id,MSG.WORLD_SNAPSHOT,{snapshot:this.snapshot()}); this.broadcast(MSG.ROOM_STATE,{room:this.publicRoom()},player.id);
    return new Response(null,{status:101,webSocket:client});
  }
  async disconnect(playerId,socket){ if(this.sessions.get(playerId)!==socket)return; this.sessions.delete(playerId); this.messageRates.delete(playerId); if(this.room?.players?.[playerId])this.room.players[playerId].connected=false; if(this.room?.hostPlayerId===playerId){const next=Object.values(this.room.players).find(p=>p.connected);if(next)this.room.hostPlayerId=next.id;} await this.save(true); if(this.room)this.broadcast(MSG.ROOM_STATE,{room:this.publicRoom()}); }
  isHost(id){ return id===this.room.hostPlayerId; }
  reject(id,message){ this.send(id,MSG.ERROR,{message}); }
  withinRateLimit(playerId){ const now=Date.now(), current=this.messageRates.get(playerId); if(!current||now-current.since>=1000){this.messageRates.set(playerId,{since:now,count:1});return true;} current.count++; return current.count<=SECURITY_LIMITS.maxMessagesPerSecond; }
  requireRun(playerId){ if(this.room.state==='run')return true; this.reject(playerId,'Run is not active'); return false; }
  allConnectedReady(){ const players=Object.values(this.room.players).filter(p=>p.connected); return players.length>0&&players.every(p=>p.ready===true); }
  async onMessage(playerId,raw){
    if(messageBytes(raw)>SECURITY_LIMITS.maxMessageBytes)return this.reject(playerId,'Message too large');
    if(!this.withinRateLimit(playerId))return this.reject(playerId,'Message rate exceeded');
    const msg=parseMessage(raw); if(!msg||!this.room?.players?.[playerId])return this.reject(playerId,'Invalid message');
    if(!CLIENT_MESSAGE_TYPE_SET.has(msg.type))return this.reject(playerId,msg.type===MSG.REWARD_GRANT?'reward_grant is server-origin only':'Client message type not allowed');
    if(HOST_ONLY_TYPES.has(msg.type)&&!this.isHost(playerId))return this.reject(playerId,'Host authority required');
    if(msg.type===MSG.PING)return this.send(playerId,MSG.PONG,{now:Date.now()});
    if(msg.type===MSG.PLAYER_READY){if(this.room.state!=='lobby')return this.reject(playerId,'Ready state is locked after run start');this.room.players[playerId].ready=!!msg.ready;await this.save(true);return this.broadcast(MSG.ROOM_STATE,{room:this.publicRoom()});}
    if(msg.type===MSG.START_RUN){
      if(this.room.state!=='lobby')return this.reject(playerId,'Run already started');
      if(!this.allConnectedReady())return this.reject(playerId,'All connected players must be ready');
      this.room.state='run';this.room.seed=finite(msg.seed,Date.now());this.room.district=boundedInt(msg.district,0,0,100);this.room.wave=0;this.room.waveDelay=0;this.room.phase='intro';this.room.objective=null;this.room.pending=[];this.room.directorThreat=0.5;this.room.enemies={};this.room.pickups={};this.room.playerStates={};this.room.worldRevision++;await this.save(true);
      this.broadcast(MSG.START_RUN,{seed:this.room.seed,district:this.room.district,tier:boundedInt(msg.tier,1,1,100)});return this.broadcast(MSG.ROOM_STATE,{room:this.publicRoom()});
    }
    if(msg.type===MSG.PLAYER_STATE){
      if(!this.requireRun(playerId))return;
      const prior=this.room.playerStates[playerId]||{}; const state=['alive','downed','dead'].includes(msg.state)?msg.state:(prior.state||'alive'); const ps={playerId,name:this.room.players[playerId].name,color:this.room.players[playerId].color,position:vec(msg.position),yaw:finite(msg.yaw),pitch:finite(msg.pitch),hp:Math.max(0,finite(msg.hp)),armor:Math.max(0,finite(msg.armor)),state,weapon:String(msg.weapon||'pistol').slice(0,30),updatedAt:Date.now()}; this.room.playerStates[playerId]=ps;this.room.players[playerId].state=state;
      if(this.room.hostPlayerId===playerId&&state!=='alive'){const next=Object.values(this.room.players).find(p=>p.id!==playerId&&p.connected&&this.room.playerStates[p.id]?.state==='alive');if(next){this.room.hostPlayerId=next.id;this.broadcast(MSG.ROOM_STATE,{room:this.publicRoom()});}}
      const connected=Object.values(this.room.players).filter(p=>p.connected),wiped=connected.length>0&&connected.every(p=>this.room.playerStates[p.id]?.state&&this.room.playerStates[p.id].state!=='alive');if(wiped&&this.room.state==='run'){this.room.state='failed';await this.save(true);this.broadcast(MSG.RUN_FAILED,{reason:'full_wipe'});}
      this.dirtyWorld=true;await this.save();return this.broadcast(MSG.PLAYER_STATE,ps,playerId);
    }
    if(!this.requireRun(playerId))return;
    if(msg.type===MSG.ENEMY_SPAWN){const e=safeEnemy(msg.enemy);if(!e||Object.keys(this.room.enemies).length>=SECURITY_LIMITS.maxEnemies)return;this.room.enemies[e.id]=e;this.bump();await this.save();return this.broadcast(MSG.ENEMY_SPAWN,{enemy:e},playerId);}
    if(msg.type===MSG.ENEMY_STATE){const next={};for(const rawEnemy of (Array.isArray(msg.enemies)?msg.enemies:[]).slice(0,SECURITY_LIMITS.maxEnemies)){const e=safeEnemy(rawEnemy);if(e)next[e.id]=e;}this.room.enemies=next;this.room.wave=boundedInt(msg.wave,this.room.wave,0,10_000);this.room.phase=String(msg.phase||this.room.phase).slice(0,40);this.room.waveDelay=Math.max(0,Math.min(600_000,finite(msg.waveDelay,this.room.waveDelay)));this.room.pending=Array.isArray(msg.pending)?msg.pending.slice(0,200).map(v=>String(v).slice(0,40)):this.room.pending;this.room.directorThreat=Math.max(0,Math.min(2,finite(msg.directorThreat,this.room.directorThreat)));this.bump();await this.save();return this.broadcast(MSG.ENEMY_STATE,{enemies:Object.values(next),revision:this.room.worldRevision,wave:this.room.wave,phase:this.room.phase,waveDelay:this.room.waveDelay,pending:this.room.pending,directorThreat:this.room.directorThreat},playerId);}
    if(msg.type===MSG.ENEMY_DEATH){const id=String(msg.enemyId||'').slice(0,80);if(!this.room.enemies[id])return;delete this.room.enemies[id];this.bump();await this.save();return this.broadcast(MSG.ENEMY_DEATH,{enemyId:id,revision:this.room.worldRevision});}
    if(msg.type===MSG.PICKUP_SPAWN){const p=safePickup(msg.pickup);if(!p||Object.keys(this.room.pickups).length>=SECURITY_LIMITS.maxPickups)return;this.room.pickups[p.id]=p;this.bump();await this.save();return this.broadcast(MSG.PICKUP_SPAWN,{pickup:p},playerId);}
    if(msg.type===MSG.PICKUP_COLLECT){const id=String(msg.pickupId||'').slice(0,80),pickup=this.room.pickups[id];if(!pickup)return this.reject(playerId,'Pickup already collected');delete this.room.pickups[id];this.bump();await this.save();return this.broadcast(MSG.PICKUP_COLLECT,{pickupId:id,playerId,kind:pickup.kind,val:pickup.val,revision:this.room.worldRevision});}
    if(msg.type===MSG.HIT){const enemy=this.room.enemies[String(msg.enemyId||'')];if(!enemy||enemy.state==='dying')return;return this.send(this.room.hostPlayerId,MSG.HIT,{from:playerId,playerId,enemyId:enemy.id,damage:Math.min(MAX_DAMAGE,Math.max(0,finite(msg.damage))),crit:!!msg.crit});}
    if(msg.type===MSG.REVIVE)return this.handleRevive(playerId,msg);
    if(msg.type===MSG.BOSS_STATE){const boss=safeBossState(msg.boss||msg);this.room.phase=String(msg.phase||this.room.phase).slice(0,40);this.bump();await this.save();return this.broadcast(MSG.BOSS_STATE,{boss,phase:this.room.phase,revision:this.room.worldRevision},playerId);}
    if(msg.type===MSG.OBJECTIVE_STATE){this.room.objective=safeObjectiveState(msg.objective||msg);this.bump();await this.save();return this.broadcast(MSG.OBJECTIVE_STATE,{objective:this.room.objective,revision:this.room.worldRevision},playerId);}
    if(msg.type===MSG.DISTRICT_COMPLETE){this.room.district=boundedInt(msg.district,this.room.district,0,100);this.room.phase='district_complete';this.bump();await this.save(true);return this.broadcast(MSG.DISTRICT_COMPLETE,{district:this.room.district,revision:this.room.worldRevision});}
    if(msg.type===MSG.RUN_COMPLETE||msg.type===MSG.RUN_FAILED){this.room.state=msg.type===MSG.RUN_COMPLETE?'complete':'failed';this.room.phase=this.room.state;this.bump();await this.save(true);return this.broadcast(msg.type,{reason:String(msg.reason||'').slice(0,80),district:this.room.district,revision:this.room.worldRevision});}
    return this.reject(playerId,'Client message type not handled');
  }
  async handleRevive(playerId,msg){const targetId=String(msg.targetPlayerId||'').slice(0,80),a=this.room.playerStates[playerId],b=this.room.playerStates[targetId];if(!a||!b||a.state!=='alive'||b.state!=='downed')return this.reject(playerId,'Revive unavailable');const dx=a.position.x-b.position.x,dz=a.position.z-b.position.z;if(Math.hypot(dx,dz)>REVIVE_RANGE)return this.reject(playerId,'Move closer to revive');if(finite(msg.heldMs)<REVIVE_HOLD_MS)return this.reject(playerId,'Hold revive longer');b.state='alive';b.hp=30;this.room.players[targetId].state='alive';this.bump();await this.save(true);this.broadcast(MSG.REVIVE,{playerId:targetId,reviverId:playerId,hp:b.hp,revision:this.room.worldRevision});}
  bump(){this.room.worldRevision++;this.dirtyWorld=true;}
  send(playerId,type,payload){const ws=this.sessions.get(playerId);if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({protocolVersion:PROTOCOL_VERSION,type,t:Date.now(),...payload}));}
  broadcast(type,payload,except){const body=JSON.stringify({protocolVersion:PROTOCOL_VERSION,type,t:Date.now(),...payload});for(const[id,ws]of this.sessions)if(id!==except&&ws.readyState===WebSocket.OPEN)ws.send(body);}
}
