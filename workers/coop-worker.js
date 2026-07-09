import { RoomDurableObject } from './room-durable-object.js';
export { RoomDurableObject };
function cors(res) { const h = new Headers(res.headers); h.set('access-control-allow-origin','*'); h.set('access-control-allow-methods','GET,POST,OPTIONS'); h.set('access-control-allow-headers','content-type'); return new Response(res.body, { status:res.status, statusText:res.statusText, headers:h }); }
function json(data, status = 200) { return cors(new Response(JSON.stringify(data), { status, headers:{ 'content-type':'application/json' } })); }
function roomCode() { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let out = ''; const a = new Uint8Array(5); crypto.getRandomValues(a); for (const n of a) out += alphabet[n % alphabet.length]; return out; }
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(new Response(null));
    if (url.pathname === '/health') return json({ ok:true, service:'earth2049-coop', durableObjects:true });
    if (url.pathname === '/rooms' && request.method === 'POST') {
      const body = await request.json().catch(()=>({}));
      const code = roomCode();
      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);
      await stub.fetch(new Request(url.origin + '/rooms/' + code + '/init', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ roomCode:code, player:body.player, maxPlayers:body.maxPlayers || 4 }) }));
      return json({ roomCode:code });
    }
    const m = url.pathname.match(/^\/rooms\/([A-Z0-9]+)\/(ws|state)$/i);
    if (m) {
      const code = m[1].toUpperCase();
      const id = env.ROOMS.idFromName(code);
      return env.ROOMS.get(id).fetch(request);
    }
    return json({ error:'not_found' }, 404);
  }
};
