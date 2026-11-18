// The public game list behind the co-op server browser and quick match.
// One Durable Object (named 'directory') holds a small entry per public room. Rooms report themselves when
// someone joins or leaves, when a mission starts or ends, and every 30 s while anyone is connected. An entry
// that stops reporting for 90 s drops off the list, so a crashed room can never sit there forever.
export const DIRECTORY_TTL_MS = 90_000;
export const MAX_LISTED = 50;

const clip = (v, n) => String(v ?? '').slice(0, n);
const int = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(Number(v) || 0)));

export function sanitizeEntry(raw) {
  const code = clip(raw?.code, 8).replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!code) return null;
  return {
    code,
    name: clip(raw.name, 32) || 'Open squad',
    host: clip(raw.host, 24) || 'Operative',
    players: int(raw.players, 0, 4),
    max: int(raw.max, 1, 4) || 4,
    state: ['lobby', 'run'].includes(raw.state) ? raw.state : 'lobby',
    district: int(raw.district, 0, 100),
    protocol: int(raw.protocol, 0, 99),
    updatedAt: Date.now(),
  };
}

/** what the server browser shows: live, not full, lobbies before missions in progress, fuller first */
export function listable(entries, now = Date.now(), protocol = 0) {
  return entries
    .filter(e => now - e.updatedAt < DIRECTORY_TTL_MS && e.players > 0 && e.players < e.max && (!protocol || e.protocol === protocol))
    .sort((a, b) => (a.state === 'lobby' ? 0 : 1) - (b.state === 'lobby' ? 0 : 1) || b.players - a.players || b.updatedAt - a.updatedAt)
    .slice(0, MAX_LISTED);
}

/** quick match: the best open lobby (a mission already running is a fallback, since drop-in works) */
export function bestMatch(entries, now = Date.now(), protocol = 0) {
  const open = listable(entries, now, protocol);
  return open.find(e => e.state === 'lobby') || open[0] || null;
}

export class LobbyDirectory {
  constructor(state) { this.state = state; this.rooms = null; }
  async load() {
    if (!this.rooms) this.rooms = (await this.state.storage.get('rooms')) || {};
    const now = Date.now();
    for (const [k, e] of Object.entries(this.rooms)) if (now - e.updatedAt > DIRECTORY_TTL_MS * 4) delete this.rooms[k];
    return this.rooms;
  }
  async persist() { await this.state.storage.put('rooms', this.rooms); }
  async fetch(request) {
    const url = new URL(request.url);
    const rooms = await this.load();
    const protocol = int(url.searchParams.get('protocol'), 0, 99);
    if (url.pathname.endsWith('/update') && request.method === 'POST') {
      const e = sanitizeEntry(await request.json().catch(() => ({})));
      if (!e) return Response.json({ ok: false }, { status: 400 });
      if (e.players <= 0) delete rooms[e.code]; else rooms[e.code] = e;
      await this.persist();
      return Response.json({ ok: true });
    }
    if (url.pathname.endsWith('/remove') && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      delete rooms[clip(body.code, 8).toUpperCase()];
      await this.persist();
      return Response.json({ ok: true });
    }
    if (url.pathname.endsWith('/match')) return Response.json({ room: bestMatch(Object.values(rooms), Date.now(), protocol) });
    if (url.pathname.endsWith('/list')) return Response.json({ rooms: listable(Object.values(rooms), Date.now(), protocol) });
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}
