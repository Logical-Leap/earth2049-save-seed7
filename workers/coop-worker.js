import { RoomDurableObject } from './room-durable-object.js';
import { handleApi } from './account-api.js';
import { LobbyDirectory } from './lobby-directory.js';
import { PvpMatchDurableObject } from './pvp-match.js';
export { RoomDurableObject, LobbyDirectory, PvpMatchDurableObject };
function cors(res) { const h = new Headers(res.headers); h.set('access-control-allow-origin','*'); h.set('access-control-allow-methods','GET,POST,PUT,DELETE,OPTIONS'); h.set('access-control-allow-headers','content-type'); return new Response(res.body, { status:res.status, statusText:res.statusText, headers:h }); }
function json(data, status = 200) { return cors(new Response(JSON.stringify(data), { status, headers:{ 'content-type':'application/json' } })); }
function roomCode() { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let out = ''; const a = new Uint8Array(5); crypto.getRandomValues(a); for (const n of a) out += alphabet[n % alphabet.length]; return out; }
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handleApi(request, env);   // accounts and cloud saves
    if (request.method === 'OPTIONS') return cors(new Response(null));
    if (url.pathname === '/health') return json({ ok:true, service:'earth2049-coop', durableObjects:true, browser:!!env.LOBBIES, pvp:!!env.PVP });
    const directory = () => env.LOBBIES?.get(env.LOBBIES.idFromName('directory'));
    async function create(body, listed) {
      const code = roomCode();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      await stub.fetch(new Request(url.origin + '/rooms/' + code + '/init', { method:'POST', headers:{ 'content-type':'application/json' },
        body:JSON.stringify({ roomCode:code, player:body.player, maxPlayers:body.maxPlayers || 4, public:listed, name:body.name }) }));
      return code;
    }
    // the server browser: public rooms with space in them
    if (url.pathname === '/rooms' && request.method === 'GET') {
      const dir = directory(); if (!dir) return json({ rooms:[] });
      const r = await dir.fetch('https://directory/list?protocol=' + (url.searchParams.get('protocol') || '')); return json(await r.json());
    }
    if (url.pathname === '/rooms' && request.method === 'POST') {
      const body = await request.json().catch(()=>({}));
      return json({ roomCode: await create(body, body.public === true) });
    }
    // quick match: join the best open public lobby, or open a new public one and wait there
    if (url.pathname === '/matchmake' && request.method === 'POST') {
      const body = await request.json().catch(()=>({}));
      const dir = directory();
      const found = dir ? (await (await dir.fetch('https://directory/match?protocol=' + (Number(body.protocol) || ''))).json()).room : null;
      if (found) return json({ roomCode:found.code, created:false, room:found });
      return json({ roomCode: await create(Object.assign({}, body, { name: body.name }), true), created:true });
    }
    // GigaLeague (PvP): rooms, the open-room list, quickplay by playlist, and the match socket
    if (url.pathname.startsWith('/pvp/')) {
      if (!env.PVP) return json({ error:'pvp_unavailable' }, 503);
      const pdir = () => env.LOBBIES?.get(env.LOBBIES.idFromName('pvp-directory'));
      async function pvpCreate(body, opts) {
        const code = roomCode();
        await env.PVP.get(env.PVP.idFromName(code)).fetch(new Request(url.origin + '/pvp/' + code + '/init', { method:'POST', headers:{ 'content-type':'application/json' },
          body:JSON.stringify({ code, hostId:String(body.playerId||'').slice(0,80), name:body.name, playlist:body.playlist, settings:body.settings, listed:opts.listed, quick:opts.quick }) }));
        return code;
      }
      if (url.pathname === '/pvp/rooms' && request.method === 'GET') { const d = pdir(); if (!d) return json({ rooms:[] }); return json(await (await d.fetch('https://directory/list?protocol=101')).json()); }
      if (url.pathname === '/pvp/rooms' && request.method === 'POST') { const body = await request.json().catch(()=>({})); return json({ roomCode: await pvpCreate(body, { listed: body.public === true, quick:false }) }); }
      if (url.pathname === '/pvp/matchmake' && request.method === 'POST') {
        // 'any' (the big QUICK MATCH button): the best open match in any playlist, else a new CORE one
        const body = await request.json().catch(()=>({})), any = !['core','classic','party'].includes(body.playlist), playlist = any ? 'core' : body.playlist;
        const d = pdir(), found = d ? (await (await d.fetch('https://directory/match?protocol=101&playlist=' + (any ? '' : playlist))).json()).room : null;
        if (found) return json({ roomCode: found.code, created:false });
        return json({ roomCode: await pvpCreate(Object.assign({}, body, { playlist, name: 'QUICKPLAY // ' + playlist.toUpperCase() }), { listed:true, quick:true }), created:true });
      }
      const pm = url.pathname.match(/^\/pvp\/([A-Z0-9]+)\/(ws|state)$/i);
      if (pm) return env.PVP.get(env.PVP.idFromName(pm[1].toUpperCase())).fetch(request);
      return json({ error:'not_found' }, 404);
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
