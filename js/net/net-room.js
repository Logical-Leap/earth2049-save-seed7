/* EARTH 2049 co-op room/runtime bridge (UMD/no-build) */
'use strict';
(function (global) {
  const REMOTE_HEIGHT = 1.72;
  function hexColor(css) { try { return new THREE.Color(css || '#9b59ff').getHex(); } catch (e) { return 0x9b59ff; } }
  function profileLevel(save) {
    const up = save?.up || {}, mastery = save?.mastery || {};
    let lvl = 1 + Object.values(up).reduce((a,b)=>a + Number(b || 0), 0);
    lvl += Object.values(mastery).reduce((a,b)=>a + Number(b?.level || 0), 0) * 0.25;
    return Math.max(1, Math.round(lvl));
  }
  function makeAvatar(color) {
    const root = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color:0x222838, roughness:0.72, metalness:0.08 });
    const accent = new THREE.MeshStandardMaterial({ color:hexColor(color), emissive:hexColor(color), emissiveIntensity:0.25, roughness:0.55 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.82, 4, 8), mat); body.position.y = 0.98; root.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), accent); head.position.y = 1.62; root.add(head);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.48, 0.12), accent); pack.position.set(0, 1.08, 0.36); root.add(pack);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.72), accent); gun.position.set(0.36, 1.18, -0.32); root.add(gun);
    const name = document.createElement('div'); name.className = 'coop-nameplate'; name.textContent = 'OPERATIVE';
    name.style.cssText = 'position:fixed;z-index:32;pointer-events:none;font:700 10px Segoe UI,sans-serif;letter-spacing:.14em;color:#fff;text-shadow:0 0 8px #00e5ff,0 1px 2px #000;text-transform:uppercase;';
    document.body.appendChild(name);
    return { root, name, hp:1 };
  }
  function removeAvatar(a) { if (!a) return; if (a.root?.parent) a.root.parent.remove(a.root); if (a.name?.parentNode) a.name.parentNode.removeChild(a.name); }

  const CoopRoom = {
    isCoop:false, isHost:false, roomCode:'', lobby:null, client:null, remote:new Map(), opts:null, lastStateSend:0, lastEnemySend:0, runSeed:0, reviveTarget:null, reviveStarted:0, revivePendingAt:0, pendingSnapshot:null,
    init(opts) { this.opts = opts || {}; },
    profile() { return NetProtocol.safePlayer(Object.assign({}, this.opts?.getSave?.()?.profile, { effectiveLevel:profileLevel(this.opts?.getSave?.()) })); },
    status() { return { isCoop:this.isCoop, isHost:this.isHost, roomCode:this.roomCode, lobby:this.lobby }; },
    async host() { this.ensureProfile(); const c = new NetClient(NET_CONFIG); this.bind(c); const code = await c.createRoom(this.profile()); this.client = c; this.isCoop = true; this.isHost = true; this.roomCode = code; return code; },
    async join(code) { this.ensureProfile(); const c = new NetClient(NET_CONFIG); this.bind(c); await c.joinRoom(code, this.profile()); this.client = c; this.isCoop = true; this.isHost = false; this.roomCode = String(code).toUpperCase(); return this.roomCode; },
    leave() { if (this.client) this.client.close(); this.client = null; this.isCoop = false; this.isHost = false; this.roomCode = ''; this.lobby = null; this.clearRemotes(); this.opts?.onLobby?.(null); },
    setReady(ready) { this.client?.send(NetProtocol.MSG.PLAYER_READY, { ready:!!ready }); },
    startRun() { if (!this.isHost) return false; const connected = (this.lobby?.players || []).filter(p => p.connected !== false); if (!connected.length || connected.some(p => !p.ready)) { this.opts?.notice?.('Every connected operative must be ready.'); return false; } const seed = Math.floor(Math.random() * 2147483647); this.runSeed = seed; return !!this.client?.send(NetProtocol.MSG.START_RUN, { seed, district:0, tier:this.opts?.getSave?.()?.simTier || 1 }); },
    bind(c) {
      c.addEventListener('message', ev => this.onMessage(ev.detail));
      c.addEventListener('close', ev => { this.opts?.notice?.(ev.detail?.reconnecting ? 'Connection lost — reconnecting…' : 'Disconnected'); this.opts?.onLobby?.(this.lobby); });
      c.addEventListener('reconnect', () => { this.isCoop = true; this.opts?.notice?.('Reconnected — synchronizing mission'); });
    },
    onMessage(msg) {
      const M = NetProtocol.MSG;
      if (msg.type === M.ROOM_STATE) {
        this.lobby = msg.room; this.isHost = msg.room?.hostPlayerId === this.profile().id; this.opts?.onLobby?.(this.lobby); this.syncRemotePlayers();
        if (msg.room?.state === 'run' && !this.opts?.isRunning?.()) Promise.resolve(this.opts?.startCoopRun?.({ seed:msg.room.seed, district:msg.room.district, reconnect:true })).then(() => { if (this.pendingSnapshot) { this.opts?.onWorldSnapshotNet?.(this.pendingSnapshot); this.pendingSnapshot = null; } });
      }
      else if (msg.type === M.WORLD_SNAPSHOT) { if (this.opts?.isRunning?.()) this.opts?.onWorldSnapshotNet?.(msg.snapshot || {}); else this.pendingSnapshot = msg.snapshot || {}; }
      else if (msg.type === M.START_RUN) { this.runSeed = msg.seed; if (!this.opts?.isRunning?.()) this.opts?.startCoopRun?.(msg); }
      else if (msg.type === M.PLAYER_STATE) this.applyPlayerState(msg);
      else if (msg.type === M.ENEMY_SPAWN && !this.isHost) this.opts?.onEnemySpawnNet?.(msg.enemy);
      else if (msg.type === M.ENEMY_STATE && !this.isHost) this.opts?.onEnemyStateNet?.(msg);
      else if (msg.type === M.ENEMY_DEATH && !this.isHost) this.opts?.onEnemyDeathNet?.(msg.enemyId);
      else if (msg.type === M.PICKUP_SPAWN && !this.isHost) this.opts?.onPickupSpawnNet?.(msg.pickup);
      else if (msg.type === M.HIT && this.isHost && msg.playerId !== this.profile().id) this.opts?.onHitNet?.(msg);
      else if (msg.type === M.PICKUP_COLLECT) this.opts?.onPickupCollectNet?.(msg);
      else if (msg.type === M.REVIVE) { this.cancelRevive(); this.opts?.onReviveNet?.(msg); }
      else if (msg.type === M.RUN_FAILED) this.opts?.onRunFailedNet?.(msg);
      else if (msg.type === M.REWARD_GRANT && msg.playerId === this.profile().id) this.opts?.grantReward?.(msg.reward, msg.reason || 'co-op');
      else if (msg.type === M.ERROR) { if (/revive/i.test(msg.message || '')) this.cancelRevive(); this.opts?.notice?.(msg.message || 'Co-op room error'); }
    },
    syncRemotePlayers() {
      const local = this.profile().id, players = this.lobby?.players || [];
      const wanted = new Set(players.filter(p => p.id !== local).map(p => p.id));
      for (const id of [...this.remote.keys()]) if (!wanted.has(id)) { removeAvatar(this.remote.get(id).avatar); this.remote.delete(id); }
      for (const p of players) if (p.id !== local && !this.remote.has(p.id)) {
        const avatar = makeAvatar(p.color); avatar.name.textContent = p.name || 'OPERATIVE';
        this.opts?.getScene?.()?.add(avatar.root);
        this.remote.set(p.id, { player:p, avatar, buf:new NetInterpolation.SnapshotBuffer(120) });
      }
    },
    applyPlayerState(msg) {
      if (!this.isCoop || msg.playerId === this.profile().id) return;
      let r = this.remote.get(msg.playerId);
      if (!r) { this.lobby = this.lobby || { players:[] }; this.lobby.players.push({ id:msg.playerId, name:msg.name, color:msg.color }); this.syncRemotePlayers(); r = this.remote.get(msg.playerId); }
      if (!r) return;
      const p = msg.position || {};
      r.buf.push({ x:Number(p.x)||0, y:Number(p.y)||0, z:Number(p.z)||0, yaw:Number(msg.yaw)||0, hp:msg.hp, armor:msg.armor, state:msg.state, name:msg.name, color:msg.color });
    },
    tick(dt) {
      if (!this.isCoop) return;
      const g = this.opts?.getGame?.();
      if (g?.p && this.client?.connected && performance.now() - this.lastStateSend > 1000 / NET_CONFIG.snapshotHz) {
        this.lastStateSend = performance.now();
        this.client.send(NetProtocol.MSG.PLAYER_STATE, { playerId:this.profile().id, name:this.profile().name, color:this.profile().color, position:{ x:g.p.pos.x, y:g.p.pos.y || 0, z:g.p.pos.z }, yaw:g.p.yaw, pitch:g.p.pitch, hp:Math.round(g.p.hp), armor:Math.round(g.p.armor), state:g.p.coopState || 'alive', weapon:g.p.weapons?.[g.p.cur]?.id || 'pistol' });
      }
      if (this.isHost && g?.enemies && performance.now() - this.lastEnemySend > 1000 / NET_CONFIG.enemySnapshotHz) {
        this.lastEnemySend = performance.now();
        this.client?.send(NetProtocol.MSG.ENEMY_STATE, { wave:g.wave, phase:g.phase, waveDelay:g.waveDelay, pending:(g.pending || []).slice(0, 200), directorThreat:g.director?.threat, enemies:g.enemies.filter(e=>e.netId && !e.dead).map(e=>({ id:e.netId, typeId:e.typeId, boss:e.boss, elite:!!e.elite, x:e.pos.x, z:e.pos.z, y:e.rootY || 0, yaw:e.yaw || 0, hp:e.hp, maxHp:e.maxHp, state:e.state })) });
      }
      this.tickRemotes();
    },
    tickRemotes() {
      for (const r of this.remote.values()) {
        const s = r.buf.sample() || r.buf.latest(); if (!s) continue;
        r.avatar.root.visible = s.state !== 'dead';
        r.avatar.root.position.set(s.x, s.y || 0, s.z);
        r.avatar.root.rotation.y = s.yaw || 0;
        r.avatar.root.rotation.z = s.state === 'downed' ? Math.PI * 0.42 : 0;
        const stateLabel = s.state === 'downed' ? '  ⚠ DOWNED — HOLD E' : (s.state === 'dead' ? '  ELIMINATED' : '');
        r.avatar.name.textContent = (s.name || r.player.name || 'OPERATIVE') + stateLabel + (s.hp !== undefined && s.state === 'alive' ? '  HP ' + Math.max(0, Math.round(s.hp)) : '');
        const cam = this.opts?.getCamera?.() || global.camera; if (!cam) continue;
        const v = new THREE.Vector3(s.x, REMOTE_HEIGHT + 0.35, s.z).project(cam);
        if (v.z < 1) { r.avatar.name.style.display = 'block'; r.avatar.name.style.left = ((v.x * 0.5 + 0.5) * innerWidth - 80) + 'px'; r.avatar.name.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px'; } else r.avatar.name.style.display = 'none';
      }
    },
    clearRemotes() { for (const r of this.remote.values()) removeAvatar(r.avatar); this.remote.clear(); },
    onEnemySpawn(e) { if (this.isCoop && this.isHost && e?.netId) this.client?.send(NetProtocol.MSG.ENEMY_SPAWN, { enemy:{ id:e.netId, typeId:e.typeId, boss:e.boss, elite:!!e.elite, x:e.pos.x, z:e.pos.z, hp:e.hp, maxHp:e.maxHp } }); },
    onEnemyDamaged(e, dmg, crit) { if (this.isCoop && e?.netId && !this.isHost) this.client?.send(NetProtocol.MSG.HIT, { playerId:this.profile().id, enemyId:e.netId, damage:Math.round(dmg), crit:!!crit }); },
    onEnemyDeath(e) { if (this.isCoop && this.isHost && e?.netId) this.client?.send(NetProtocol.MSG.ENEMY_DEATH, { enemyId:e.netId }); },
    onPickupSpawn(pk) { if (this.isCoop && this.isHost && pk?.netId) this.client?.send(NetProtocol.MSG.PICKUP_SPAWN, { pickup:{ id:pk.netId, kind:pk.kind, x:pk.x, z:pk.z, val:pk.val, weapon:pk.weapon || null } }); },
    onPickupCollect(pk) { if (this.isCoop && pk?.netId) this.client?.send(NetProtocol.MSG.PICKUP_COLLECT, { pickupId:pk.netId, playerId:this.profile().id, kind:pk.kind, val:pk.val }); },
    beginRevive(targetId) { if (!targetId || !this.client?.connected) return; if (this.reviveTarget !== targetId) { this.reviveTarget = targetId; this.reviveStarted = performance.now(); this.revivePendingAt = 0; } },
    cancelRevive() { this.reviveTarget = null; this.reviveStarted = 0; this.revivePendingAt = 0; },
    completeRevive(targetId) {
      if (this.reviveTarget !== targetId || !this.client?.connected) return false;
      const now = performance.now(), heldMs = now - this.reviveStarted;
      if (heldMs < 1800 || (this.revivePendingAt && now - this.revivePendingAt < 1500)) return false;
      const sent = this.client.send(NetProtocol.MSG.REVIVE, { targetPlayerId:targetId, heldMs:Math.round(heldMs), hp:30 });
      if (sent) this.revivePendingAt = now;
      return sent;
    },
    personalReward(reason) {
      const g = this.opts?.getGame?.(); if (!this.isCoop || !g?.p) return null;
      const fac = this.opts?.getDistrictFac?.(g.district) || 'shillz';
      return { gt:Math.max(25, Math.round((g.p.gt || 0) * 0.18)), xp:Math.round((g.p.stats?.dmg || 0) * 0.03 + (g.p.stats?.kills || 0) * 6), factionIntel:{ [fac]: Math.max(2, Math.round((g.p.stats?.kills || 0) * 0.5)) }, mastery:{ [g.p.weapons?.[g.p.cur]?.id || 'pistol']: Math.round((g.p.stats?.dmg || 0) * 0.01) }, reason };
    },
    grantPersonalReward(reason) { const reward = this.personalReward(reason); if (reward) this.opts?.grantReward?.(reward, reason); return reward; },
    ensureProfile() { this.opts?.ensureProfile?.(); }
  };
  global.CoopRoom = CoopRoom;
})(window);
