/* EARTH 2049 co-op WebSocket client (UMD/no-build) */
'use strict';
(function (global) {
  class NetClient extends EventTarget {
    constructor(config) { super(); this.config = config || global.NET_CONFIG; this.ws = null; this.roomCode = ''; this.connected = false; this.player = null; this.seq = 0; this.closedByUser = false; this.reconnectTimer = null; }
    async api(path, opts) {
      if (!this.config.workerUrl) throw new Error('Co-op server unavailable');
      let res;
      try { res = await fetch(NetConfig.httpUrl(path), opts); }
      catch (e) { throw new Error('Could not reach the co-op server. Check your connection and try again.'); }
      if (!res.ok) throw new Error('Co-op server error (' + res.status + '). Try again in a moment.');
      return res.json();
    }
    async createRoom(player, opts = {}) {
      this.player = NetProtocol.safePlayer(player);
      const data = await this.api('/rooms', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ player:this.player, maxPlayers:this.config.maxPlayers, public:!!opts.public, name:opts.name || '' }) });
      await this.connect(data.roomCode, this.player);
      return data.roomCode;
    }
    /** public rooms with space, for the server browser */
    async listRooms() { const d = await this.api('/rooms?protocol=' + this.config.protocolVersion, { method:'GET' }); return Array.isArray(d.rooms) ? d.rooms : []; }
    /** join the best open public lobby, or open one and wait in it; returns { roomCode, created } */
    async matchmake(player, opts = {}) {
      this.player = NetProtocol.safePlayer(player);
      const d = await this.api('/matchmake', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ player:this.player, maxPlayers:this.config.maxPlayers, protocol:this.config.protocolVersion, name:opts.name || '' }) });
      await this.connect(d.roomCode, this.player);
      return d;
    }
    async joinRoom(roomCode, player) { this.player = NetProtocol.safePlayer(player); await this.connect(roomCode, this.player); return roomCode; }
    connect(roomCode, player, reconnecting) {
      return new Promise((resolve, reject) => {
        this.roomCode = String(roomCode || '').trim().toUpperCase();
        if (!this.config.workerUrl) { reject(new Error('Missing Worker URL')); return; }
        const qs = new URLSearchParams({ playerId:player.id, name:player.name, color:player.color, effectiveLevel:String(player.effectiveLevel || 1) });
        const ws = new WebSocket(NetConfig.wsUrl('/rooms/' + encodeURIComponent(this.roomCode) + '/ws?' + qs.toString()));
        this.ws = ws;
        const timer = setTimeout(() => { try { ws.close(); } catch (e) {} reject(new Error('That room did not answer. It may be full or closed.')); }, 8000);
        ws.onopen = () => { clearTimeout(timer); this.connected = true; this.everConnected = true; this.closedByUser = false; this.emit(reconnecting ? 'reconnect' : 'open', { roomCode:this.roomCode }); resolve(); };
        ws.onmessage = ev => { const parsed = NetProtocol.parse(ev.data); if (parsed.ok) this.emit('message', parsed.msg); else this.emit('error', parsed); };
        ws.onerror = () => { this.emit('error', { error:'websocket_error' }); if (!this.connected) { clearTimeout(timer); reject(new Error('Could not join that room. It may be full or closed.')); } };
        ws.onclose = ev => { clearTimeout(timer); this.connected = false; this.emit('close', { code:ev.code, reason:ev.reason, reconnecting:!this.closedByUser }); if (!this.closedByUser) this.scheduleReconnect(); };
      });
    }
    send(type, payload) { if (!NetProtocol.canClientSend(type)) { this.emit('error', { error:'client_message_type_not_allowed', type }); return false; } if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false; this.ws.send(JSON.stringify(NetProtocol.withMeta(type, Object.assign({ seq:++this.seq }, payload || {})))); return true; }
    scheduleReconnect() { if (this.reconnectTimer || !this.roomCode || !this.player || !this.everConnected || this.closedByUser) return; this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(this.roomCode, this.player, true).catch(() => this.scheduleReconnect()); }, this.config.reconnectMs || 2500); }
    close() { this.closedByUser = true; clearTimeout(this.reconnectTimer); this.reconnectTimer = null; if (this.ws) this.ws.close(1000, 'client_leave'); this.ws = null; this.connected = false; }
    emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  }
  global.NetClient = NetClient;
})(window);
