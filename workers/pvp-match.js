// GigaLeague (PvP) match server: one Durable Object per room code. It owns the lobby (host, settings, the map/mode vote)
// and, during a match, runs the authoritative simulation (js/pvp/pvp-sim.js) at 30 ticks a second, sending each player
// a snapshot 20 times a second plus the events meant for them. Design: docs/PVP.md.
import '../js/pvp/pvp-data.js';
import '../js/pvp/pvp-sim.js';
import { PVP_MAPS } from './pvp-maps.generated.js';

const PVP = globalThis.PVP, Sim = globalThis.PvpSim;
export const PVP_PROTOCOL = 1;
export const PVP_LIMITS = Object.freeze({ maxMessageBytes: 8 * 1024, maxMessagesPerSecond: 150, maxPlayers: 16 });
// everything a browser may send; anything else is refused, never relayed
export const PVP_CLIENT_TYPES = Object.freeze(['hello', 'settings', 'start', 'vote', 'classes', 'class', 'team', 'input', 'fire', 'reload', 'swap', 'melee', 'nade', 'tac', 'use',
  'streak', 'skip', 'chat', 'ping', 'leave']);
const TYPE_SET = new Set(PVP_CLIENT_TYPES);
const HOST_ONLY = new Set(['settings', 'start']);

const clip = (v, n) => String(v ?? '').slice(0, n);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });

/** host settings, bounded and checked against the content tables */
export function sanitizeSettings(raw, prev = {}) {
  const mode = PVP.MODES[raw?.mode] ? raw.mode : (prev.mode || 'tdm');
  const map = PVP.MAPS[raw?.map] ? raw.map : (prev.map || 'plaza');
  const c = raw?.custom || {};
  const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  return {
    mode, map,
    botSkill: PVP.BOT_SKILL[raw?.botSkill] ? raw.botSkill : (prev.botSkill || 'regular'),
    bots: raw?.bots === false ? false : true,
    custom: raw?.custom ? {
      scoreLimit: num(c.scoreLimit, 0, 500, 0), timeLimit: num(c.timeLimit, 0, 3600, 0), hpMul: num(c.hpMul, 0.25, 4, 1),
      headshotsOnly: !!c.headshotsOnly, noStreaks: !!c.noStreaks, oneGun: PVP.GUNS[c.oneGun] ? c.oneGun : null, lowGrav: !!c.lowGrav,
      size: num(c.size, 1, 8, 0) | 0,
    } : null,
  };
}

/** two map + mode options for the vote, from the room's playlist */
export function voteOptions(playlist, rnd = Math.random) {
  const modes = PVP.PLAYLISTS[playlist]?.modes || PVP.PLAYLISTS.core.modes;
  const a = { mode: modes[Math.floor(rnd() * modes.length)], map: PVP.MAP_ORDER[Math.floor(rnd() * PVP.MAP_ORDER.length)] };
  let b = a;
  for (let i = 0; i < 10 && b.map === a.map; i++) b = { mode: modes[Math.floor(rnd() * modes.length)], map: PVP.MAP_ORDER[Math.floor(rnd() * PVP.MAP_ORDER.length)] };
  return [a, b];
}

export class PvpMatchDurableObject {
  constructor(state, env) {
    this.state = state; this.env = env;
    this.sessions = new Map();           // playerId -> { ws, name, look, input, level, classes, rate }
    this.room = null; this.match = null; this.loop = null; this.voteT = null;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/init') && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      this.room = { code: clip(body.code, 8), host: clip(body.hostId, 80), listed: body.listed === true, quick: body.quick === true,
        playlist: PVP.PLAYLISTS[body.playlist] ? body.playlist : 'core', name: clip(body.name, 32) || 'GigaLeague lobby',
        settings: sanitizeSettings(body.settings || {}), state: 'lobby', votes: {}, options: null, createdAt: Date.now(), last: null };
      if (!body.settings?.mode) this.room.settings.mode = PVP.PLAYLISTS[this.room.playlist].modes[0];
      if (this.room.quick) this.openVote();
      await this.state.storage.put('room', this.room);
      return json({ ok: true, code: this.room.code });
    }
    await this.load();
    if (!this.room) return json({ error: 'room_not_found' }, 404);
    if (url.pathname.endsWith('/state')) return json({ room: this.publicRoom() });
    if (request.headers.get('upgrade') === 'websocket') return this.connect(url);
    return json({ error: 'not_found' }, 404);
  }
  async load() { if (!this.room) this.room = await this.state.storage.get('room'); }
  publicRoom() {
    const r = this.room;
    return { code: r.code, host: r.host, listed: r.listed, quick: r.quick, playlist: r.playlist, name: r.name, settings: r.settings, state: r.state,
      options: r.options, votes: Object.values(r.votes || {}), voteLeft: r.voteAt ? Math.max(0, Math.round((r.voteAt - Date.now()) / 1000)) : 0,
      players: [...this.sessions.entries()].map(([id, s]) => ({ id: id.slice(0, 6), name: s.name, host: id === r.host, input: s.input, level: s.level })),
      last: r.last, inMatch: !!this.match };
  }

  connect(url) {
    const id = clip(url.searchParams.get('playerId'), 80);
    if (!id) return json({ error: 'missing_player_id' }, 400);
    if (!this.sessions.has(id) && this.sessions.size >= PVP_LIMITS.maxPlayers) return json({ error: 'room_full' }, 409);
    const old = this.sessions.get(id); try { old?.ws.close(4001, 'replaced'); } catch {}
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    server.accept();
    const s = { ws: server, name: clip(url.searchParams.get('name'), 20) || 'OPERATIVE', look: clip(url.searchParams.get('look'), 800), input: clip(url.searchParams.get('input'), 8) || 'mouse',
      level: Math.max(1, Math.min(PVP.MAX_LEVEL, Number(url.searchParams.get('level')) || 1)), classes: null, rate: { since: 0, n: 0 } };
    this.sessions.set(id, s);
    if (!this.room.host || !this.sessions.has(this.room.host)) this.room.host = id;
    server.addEventListener('message', ev => this.onMessage(id, ev.data));
    server.addEventListener('close', () => this.disconnect(id, server));
    server.addEventListener('error', () => this.disconnect(id, server));
    this.send(id, { t: 'room', room: this.publicRoom(), you: id, protocol: PVP_PROTOCOL });
    if (this.match) this.joinMatch(id);
    this.broadcastRoom();
    this.report();
    if (this.room.quick && !this.match && !this.room.options) this.openVote();
    return new Response(null, { status: 101, webSocket: client });
  }
  disconnect(id, ws) {
    const s = this.sessions.get(id); if (!s || s.ws !== ws) return;
    this.sessions.delete(id);
    this.match?.leave(id);
    if (this.room.host === id) this.room.host = this.sessions.keys().next().value || '';
    if (!this.sessions.size) this.stopMatch(true);
    this.broadcastRoom();
    this.report();
  }

  onMessage(id, raw) {
    const s = this.sessions.get(id); if (!s) return;
    if (typeof raw !== 'string' || raw.length > PVP_LIMITS.maxMessageBytes) return this.send(id, { t: 'err', m: 'message_too_large' });
    const now = Date.now();
    if (now - s.rate.since >= 1000) { s.rate.since = now; s.rate.n = 0; }
    if (++s.rate.n > PVP_LIMITS.maxMessagesPerSecond) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || !TYPE_SET.has(m.t)) return this.send(id, { t: 'err', m: 'type_not_allowed' });
    if (HOST_ONLY.has(m.t) && id !== this.room.host) return this.send(id, { t: 'err', m: 'host_only' });
    const M = this.match;
    switch (m.t) {
      case 'ping': return this.send(id, { t: 'pong', c: m.c, s: M ? M.now : 0 });
      case 'hello': s.name = clip(m.name, 20) || s.name; s.look = clip(m.look, 800); s.level = Math.max(1, Math.min(PVP.MAX_LEVEL, Number(m.level) || s.level)); return this.broadcastRoom();
      case 'classes': s.classes = Array.isArray(m.classes) ? m.classes.slice(0, 15) : null; if (M) M.setClasses(id, s.classes, s.level); return;
      case 'settings': if (this.match) return; this.room.settings = sanitizeSettings(m.settings, this.room.settings); this.room.playlist = PVP.MODES[this.room.settings.mode].playlist; return this.broadcastRoom();
      case 'start': if (!this.match) this.startMatch(); return;
      case 'vote': if (this.room.options && [0, 1, 2].includes(m.i)) { this.room.votes[id] = m.i; this.broadcastRoom(); } return;
      case 'chat': { const txt = clip(m.text, 140).replace(/[<>]/g, ''); if (txt) this.broadcast({ t: 'chat', from: s.name, text: txt }); return; }
      case 'leave': try { s.ws.close(1000, 'left'); } catch {} return this.disconnect(id, s.ws);
    }
    if (!M) return;
    switch (m.t) {
      case 'class': return M.pickClass(id, m.i);
      case 'input': return M.onInput(id, m);
      case 'fire': return M.onFire(id, m);
      case 'reload': return M.onReload(id, m);
      case 'swap': return M.onSwap(id, m);
      case 'melee': return M.onMelee(id);
      case 'nade': return M.onNade(id, m, false);
      case 'tac': return M.onNade(id, m, true);
      case 'use': return M.onUse(id);
      case 'streak': return M.onStreak(id, m);
      case 'skip': return M.onSkip(id);
    }
  }

  /* ------------------------------------------------ the vote (quickplay rooms, and between matches) */
  openVote() {
    this.room.options = voteOptions(this.room.playlist);
    this.room.votes = {};
    this.room.voteAt = Date.now() + 15_000;
    clearTimeout(this.voteT);
    this.voteT = setTimeout(() => this.closeVote(), 15_000);
    this.broadcastRoom();
  }
  closeVote() {
    const r = this.room; if (!r.options) return;
    const tally = [0, 0, 0]; for (const v of Object.values(r.votes)) tally[v]++;
    let pick = tally[0] > tally[1] ? 0 : tally[1] > tally[0] ? 1 : Math.random() < 0.5 ? 0 : 1;   // NOSONAR
    if (tally[2] > tally[pick]) pick = 2;
    const o = pick === 2 ? voteOptions(r.playlist)[0] : r.options[pick];
    r.settings = sanitizeSettings(Object.assign({}, r.settings, o), r.settings);
    r.options = null; r.voteAt = 0;
    if (this.sessions.size && (r.quick || r.autoNext)) this.startMatch();
    else this.broadcastRoom();
  }

  /* ------------------------------------------------ the match */
  startMatch() {
    const r = this.room, set = r.settings;
    const map = PVP_MAPS[set.map]; if (!map) return;
    clearTimeout(this.voteT); r.options = null;
    const M = this.match = Sim.create({ map, mode: set.mode, seed: (Math.random() * 2 ** 31) | 0, botSkill: set.botSkill, fill: set.bots, custom: set.custom || {}, // NOSONAR
      customGame: !!set.custom, size: set.custom?.size || undefined, pregame: 8 });
    r.state = 'match';
    for (const id of this.sessions.keys()) this.joinMatch(id, false);
    M.fillBots();
    this.broadcast({ t: 'start', mode: set.mode, map: set.map, playlist: M.playlist, custom: set.custom, roster: M.roster() });
    this.lastTick = Date.now(); this.acc = 0;
    clearInterval(this.loop);
    this.loop = setInterval(() => this.step(), 1000 / 30);
    this.report();
  }
  joinMatch(id, late = true) {
    const s = this.sessions.get(id), M = this.match; if (!s || !M) return;
    const p = M.join(id, { name: s.name, look: s.look, input: s.input });
    if (!p) return this.send(id, { t: 'err', m: 'match_full' });
    M.setClasses(id, s.classes || PVP.PREMADE, s.level);
    if (late) this.send(id, { t: 'start', mode: M.mode.id, map: M.mapId, playlist: M.playlist, custom: this.room.settings.custom, roster: M.roster(), late: true });
  }
  step() {
    const M = this.match; if (!M) return;
    const now = Date.now();
    this.acc += Math.min(250, now - this.lastTick) / 1000; this.lastTick = now;
    let ticked = 0;
    while (this.acc >= Sim.TICK && ticked < 4) { M.tick(Sim.TICK); this.acc -= Sim.TICK; this.flush(); ticked++; }
    if (this.acc > Sim.TICK * 4) this.acc = 0;                     // fell far behind: drop time rather than spiral
    if (ticked && M.tickN % 3 !== 0) for (const id of this.sessions.keys()) this.send(id, { t: 's', s: M.snapshot(id) });
    if (M.state === 'over' && !this.endAt) this.endAt = now + 12_000;
    if (this.endAt && now >= this.endAt) this.stopMatch(false);
    if (M.tickN % 150 === 0) this.report();
  }
  flush() {
    const M = this.match;
    for (const [to, msg] of M.drain()) {
      const body = JSON.stringify({ t: 'ev', v: msg });
      if (to === '*') for (const s of this.sessions.values()) this.raw(s, body);
      else if (typeof to === 'object') { for (const [id, s] of this.sessions) if (M.players.get(id)?.team === to.team) this.raw(s, body); }
      else { const s = this.sessions.get(to); if (s) this.raw(s, body); }
    }
  }
  stopMatch(empty) {
    clearInterval(this.loop); this.loop = null; this.endAt = 0;
    if (this.match && this.match.state === 'over') this.room.last = { mode: this.match.mode.id, map: this.match.mapId, score: this.match.teamScore };
    this.match = null;
    this.room.state = 'lobby';
    if (!empty) {
      this.broadcast({ t: 'lobby' });
      this.room.autoNext = this.room.quick;
      this.openVote();                                  // the next vote starts at once; the party stays together
    }
    this.state.storage.put('room', this.room).catch(() => {});
    this.report();
  }

  /* ------------------------------------------------ transport */
  raw(s, body) { try { if (s.ws.readyState === 1) s.ws.send(body); } catch {} }
  send(id, msg) { const s = this.sessions.get(id); if (s) this.raw(s, JSON.stringify(msg)); }
  broadcast(msg) { const b = JSON.stringify(msg); for (const s of this.sessions.values()) this.raw(s, b); }
  broadcastRoom() { this.broadcast({ t: 'room', room: this.publicRoom() }); }
  async report() {
    const dir = this.env?.LOBBIES; if (!dir || !this.room) return;
    const r = this.room;
    const entry = { code: r.code, name: r.name, host: this.sessions.get(r.host)?.name || 'Operative', players: r.listed ? this.sessions.size : 0,
      max: PVP_LIMITS.maxPlayers, state: this.match ? 'run' : 'lobby', district: 0, protocol: 100 + PVP_PROTOCOL, kind: 'pvp', playlist: r.playlist };
    try { await dir.get(dir.idFromName('pvp-directory')).fetch('https://directory/update', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) }); } catch {}
  }
}
