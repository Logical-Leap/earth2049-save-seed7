/* EARTH 2049: SAVE SEED 7 — GigaLeague transports. The PvP client talks to a match the same way wherever it runs:
 *
 *   PvpNet.local(opts)     an offline match against bots. The simulation (js/pvp/pvp-sim.js) runs in this browser.
 *   PvpNet.online(code)    a room on the match server (workers/pvp-match.js) over a WebSocket. It carries the lobby too.
 *
 * Both deliver server messages in the same shapes ({t:'s', s:snapshot}, {t:'ev', v:event}, {t:'room'}, {t:'start'}, ...) to
 * every handler added with on(fn), and take client messages ({t:'input'|'fire'|...}) through send(msg).
 */
(function (root) {
  'use strict';
  const PVP = root.PVP, Sim = root.PvpSim;

  function emitter() {
    const hs = new Set();
    return { on(fn) { hs.add(fn); return () => hs.delete(fn); }, emit(m) { for (const h of [...hs]) { try { h(m); } catch (e) { console.error('[pvp]', e); } } } };
  }

  /* ------------------------------------------------------------------ offline: the sim runs here */
  function local(opts) {
    const E = emitter();
    const me = 'local:me';
    let match = null, acc = 0, snapT = 0, started = false;
    const T = {
      kind: 'local', id: me, on: E.on, offline: true,
      /** build the match once the arena has the map loaded */
      begin(layout) {
        const map = Sim.mapFromLayout(layout, opts.map);
        match = Sim.create({ map, mode: opts.mode, seed: (Math.random() * 2 ** 31) | 0, botSkill: opts.botSkill || 'regular', fill: true,   // NOSONAR
          custom: opts.custom || {}, customGame: !!opts.custom, size: opts.size, pregame: 4 });
        match.join(me, { name: opts.name || 'YOU', look: opts.look || '', input: opts.input || 'mouse' });
        match.setClasses(me, opts.classes || PVP.PREMADE, opts.level || 1);
        match.pickClass(me, opts.cls || 0);
        match.fillBots();
        started = true;
        E.emit({ t: 'start', mode: match.mode.id, map: opts.map, playlist: match.playlist, roster: match.roster() });
        flush();
      },
      send(m) {
        if (!match) return;
        switch (m.t) {
          case 'input': return match.onInput(me, m);
          case 'fire': return match.onFire(me, m);
          case 'reload': return match.onReload(me, m);
          case 'swap': return match.onSwap(me, m);
          case 'melee': return match.onMelee(me);
          case 'nade': return match.onNade(me, m, false);
          case 'tac': return match.onNade(me, m, true);
          case 'use': return match.onUse(me);
          case 'streak': return match.onStreak(me, m);
          case 'skip': return match.onSkip(me);
          case 'class': return match.pickClass(me, m.i);
          case 'classes': return match.setClasses(me, m.classes, opts.level || 1);
          case 'ping': return E.emit({ t: 'pong', c: m.c, s: match.now });
        }
      },
      /** advance the sim by real time; called every frame by the arena while the match is up */
      tick(dt) {
        if (!started || !match) return;
        acc += Math.min(0.25, dt);
        while (acc >= Sim.TICK) { match.tick(Sim.TICK); acc -= Sim.TICK; flush(); snapT += Sim.TICK; }
        if (snapT >= 1 / 20) { snapT = 0; E.emit({ t: 's', s: match.snapshot(me) }); }
      },
      get now() { return match ? match.now : 0; },
      get match() { return match; },
      close() { match = null; started = false; },
    };
    function flush() {
      for (const [to, msg] of match.drain()) {
        if (to === '*' || to === me || (typeof to === 'object' && match.players.get(me)?.team === to.team)) E.emit({ t: 'ev', v: msg });
      }
    }
    return T;
  }

  /* ------------------------------------------------------------------ online: a room on the match server */
  function api(path, body) {
    const url = root.NetConfig ? NetConfig.httpUrl(path) : path;
    return fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined).then(r => r.json());
  }
  const createRoom = (o) => api('/pvp/rooms', o);
  const quickplay = (o) => api('/pvp/matchmake', o);
  const listRooms = () => api('/pvp/rooms').then(r => r.rooms || []).catch(() => []);

  function online(code, who) {
    const E = emitter();
    let ws = null, closed = false, retry = 0, pingT = null, room = null;
    const T = {
      kind: 'online', id: who.id, code, on: E.on, offline: false, rtt: 0.08, clockOffset: 0,
      get room() { return room; },
      get connected() { return ws && ws.readyState === 1; },
      send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); },
      tick() {},
      begin() {},
      close() { closed = true; clearInterval(pingT); try { T.send({ t: 'leave' }); ws?.close(1000); } catch (e) {} },
    };
    function connect() {
      const q = new URLSearchParams({ playerId: who.id, name: who.name || 'OPERATIVE', look: who.look || '', input: who.input || 'mouse', level: String(who.level || 1) });
      const url = (root.NetConfig ? NetConfig.wsUrl('/pvp/' + code + '/ws') : '/pvp/' + code + '/ws') + '?' + q;
      ws = new WebSocket(url);
      ws.onopen = () => {
        retry = 0;
        if (who.classes) T.send({ t: 'classes', classes: who.classes });
        clearInterval(pingT);
        pingT = setInterval(() => T.send({ t: 'ping', c: performance.now() }), 2000);
        E.emit({ t: 'open' });
      };
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'pong') { const r = (performance.now() - m.c) / 1000; T.rtt = T.rtt * 0.7 + r * 0.3; }
        if (m.t === 'room') room = m.room;
        E.emit(m);
      };
      ws.onclose = ev => {
        clearInterval(pingT);
        if (closed) return;
        if (ev.code === 4001) { E.emit({ t: 'closed', why: 'replaced' }); return; }
        if (retry++ < 6) { E.emit({ t: 'reconnecting', n: retry }); setTimeout(connect, 800 * retry); }       // the server holds the slot for 60 s
        else E.emit({ t: 'closed', why: 'lost' });
      };
    }
    connect();
    return T;
  }

  root.PvpNet = { local, online, createRoom, quickplay, listRooms };
})(typeof window !== 'undefined' ? window : globalThis);
