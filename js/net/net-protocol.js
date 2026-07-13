/* EARTH 2049 co-op protocol (UMD/no-build) */
'use strict';
(function (global) {
  const PROTOCOL_VERSION = 2;
  const MSG = Object.freeze({
    HELLO:'hello', CREATE_ROOM:'create_room', JOIN_ROOM:'join_room', LEAVE_ROOM:'leave_room', ROOM_STATE:'room_state', WORLD_SNAPSHOT:'world_snapshot',
    PLAYER_READY:'player_ready', START_RUN:'start_run', PLAYER_INPUT:'player_input', PLAYER_STATE:'player_state',
    SHOOT:'shoot', HIT:'hit', DAMAGE:'damage', ENEMY_SPAWN:'enemy_spawn', ENEMY_STATE:'enemy_state', ENEMY_DEATH:'enemy_death',
    PICKUP_SPAWN:'pickup_spawn', PICKUP_COLLECT:'pickup_collect', BOSS_STATE:'boss_state', OBJECTIVE_STATE:'objective_state', DISTRICT_COMPLETE:'district_complete',
    RUN_COMPLETE:'run_complete', RUN_FAILED:'run_failed', REWARD_GRANT:'reward_grant',
    DOWNED:'downed', REVIVE:'revive', PLAYER_ELIMINATED:'player_eliminated', PING:'ping', PONG:'pong', ERROR:'error'
  });
  const REQUIRED = {
    [MSG.HELLO]: ['player'], [MSG.JOIN_ROOM]: ['roomCode','player'], [MSG.PLAYER_READY]: ['ready'],
    [MSG.START_RUN]: ['seed','district'], [MSG.PLAYER_STATE]: ['playerId','position','yaw'], [MSG.HIT]: ['enemyId','damage'],
    [MSG.ENEMY_SPAWN]: ['enemy'], [MSG.ENEMY_STATE]: ['enemies'], [MSG.ENEMY_DEATH]: ['enemyId'],
    [MSG.PICKUP_SPAWN]: ['pickup'], [MSG.PICKUP_COLLECT]: ['pickupId'], [MSG.REWARD_GRANT]: ['playerId','reward'],
    [MSG.REVIVE]: ['targetPlayerId','heldMs']
  };
  // Direction is part of the protocol contract. Server-origin messages must
  // never be put on the browser -> room socket, even if a caller is compromised.
  const CLIENT_SEND_TYPES = Object.freeze([
    MSG.PING, MSG.PLAYER_READY, MSG.START_RUN, MSG.PLAYER_STATE, MSG.HIT,
    MSG.ENEMY_SPAWN, MSG.ENEMY_STATE, MSG.ENEMY_DEATH, MSG.PICKUP_SPAWN,
    MSG.PICKUP_COLLECT, MSG.BOSS_STATE, MSG.OBJECTIVE_STATE, MSG.DISTRICT_COMPLETE,
    MSG.RUN_COMPLETE, MSG.RUN_FAILED, MSG.REVIVE
  ]);
  const CLIENT_SEND_SET = new Set(CLIENT_SEND_TYPES);
  function withMeta(type, payload) {
    return Object.assign({ type, protocolVersion: PROTOCOL_VERSION, t: Date.now() }, payload || {});
  }
  function parse(raw) {
    let msg;
    try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return { ok:false, error:'invalid_json' }; }
    const valid = validate(msg);
    return valid.ok ? { ok:true, msg } : valid;
  }
  function validate(msg) {
    if (!msg || typeof msg !== 'object') return { ok:false, error:'message_not_object' };
    if (msg.protocolVersion !== PROTOCOL_VERSION) return { ok:false, error:'protocol_version_mismatch' };
    if (!Object.values(MSG).includes(msg.type)) return { ok:false, error:'unknown_message_type' };
    for (const f of REQUIRED[msg.type] || []) if (msg[f] === undefined || msg[f] === null) return { ok:false, error:'missing_' + f };
    return { ok:true };
  }
  function safePlayer(profile) {
    return {
      id: String(profile?.id || ''),
      name: String(profile?.name || 'Purple Operative').slice(0, 24),
      color: String(profile?.color || '#9b59ff').slice(0, 16),
      effectiveLevel: Math.max(1, Number(profile?.effectiveLevel || 1))
    };
  }
  function canClientSend(type) { return CLIENT_SEND_SET.has(type); }
  global.NetProtocol = { PROTOCOL_VERSION, MSG, CLIENT_SEND_TYPES, withMeta, parse, validate, safePlayer, canClientSend };
})(window);
