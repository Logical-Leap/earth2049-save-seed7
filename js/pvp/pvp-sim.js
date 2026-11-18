/* EARTH 2049: SAVE SEED 7 — GIGALEAGUE match simulation. The single source of truth for a PvP match.
 *
 * It runs in two places with the same code:
 *   - the match server (workers/pvp-match.js, one Cloudflare Durable Object per match), for online play;
 *   - the browser (js/pvp/pvp-net.js, LocalTransport), for offline matches against bots.
 *
 * Authority (docs/PVP.md):
 *   - The client predicts its own movement and sends its position 30 times a second. The sim checks the speed (MAX_HSPEED),
 *     that the move does not pass through a wall, and the map bounds, and snaps the player back when it fails.
 *   - Everything that matters is decided here: health, damage, kills, score, ammo, reloads, grenades, pickups, spawns,
 *     scorestreaks and objectives. A client only asks ("I fired along this ray").
 *   - Shots are lag-compensated: each player keeps ~1.3 s of position history and a shot is tested against where its
 *     targets were at the time the shooter saw them, rewound at most 200 ms.
 *   - Bots are simulated here too, on the map's navigation graph, with the same guns and the same hit tests.
 *
 * No DOM, no THREE. Plain numbers. Time is in seconds of match time (sim.now).
 */
(function (root) {
  'use strict';
  const PVP = root.PVP || (typeof require === 'function' ? require('./pvp-data.js') : null);

  const TICK = 1 / 30, HIST = 40, REWIND_MAX = 0.2;
  const R = 0.4, H = 1.8, HC = 1.25, EYE = 1.62, EYEC = 1.05, HEAD_R = 0.24, BODY_R = 0.42;
  const WEAPON_IDS = Object.keys(PVP.GUNS);
  const wcode = id => Math.max(0, WEAPON_IDS.indexOf(id));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const r2 = v => Math.round(v * 100) / 100;

  /* ================================================================== seeded randomness */
  function rng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    const f = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    f.range = (lo, hi) => lo + f() * (hi - lo);
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.gauss = () => (f() + f() + f() - 1.5) / 1.5;
    return f;
  }

  /* ================================================================== the map: colliders, raycasts, navigation */
  /** Compact map data from a raw level layout (assets/maps/<id>/<id>.layout.json). */
  function mapFromLayout(L, id) {
    const mk = k => (L.markers || []).filter(m => m.kind === k);
    const st = mk('playerStart')[0];
    const nav = L.meta?.nav;
    const flat = [];
    for (const c of L.colliders) flat.push(r2(c.min[0]), r2(c.min[1]), r2(c.min[2]), r2(c.max[0]), r2(c.max[1]), r2(c.max[2]));
    return {
      id: id || L.name,
      boxes: flat,
      spawns: mk('spawn').map(m => [r2(m.pos[0]), r2(m.pos[1]), r2(m.pos[2]), r2(m.yaw || 0)]),
      relays: mk('relay').map(m => [r2(m.pos[0]), r2(m.pos[1]), r2(m.pos[2])]),
      perches: mk('perch').map(m => [r2(m.pos[0]), r2(m.pos[1]), r2(m.pos[2])]),
      pads: mk('pad').map(m => [r2(m.pos[0]), r2(m.pos[1]), r2(m.pos[2]), r2(m.target[0]), r2(m.target[1]), r2(m.target[2])]),
      start: st ? [r2(st.pos[0]), r2(st.pos[1]), r2(st.pos[2]), r2(st.yaw || 0)] : [0, 0, 0, 0],
      extraction: (mk('extraction')[0]?.pos || [0, 0, 0]).map(r2),
      nav: nav ? { nodes: nav.nodes.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] * 10) / 10]), edges: nav.edges.map(e => [e[0], e[1], e[2] | 0]) } : null,
    };
  }

  class World {
    constructor(src) {
      this.src = src;
      const b = src.boxes, n = b.length / 6;
      this.n = n; this.box = new Float32Array(b); this.grid = new Map(); this.stamp = new Uint32Array(n); this.sn = 1;
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n; i++) {
        const o = i * 6;
        for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b[o + k]); mx[k] = Math.max(mx[k], b[o + 3 + k]); }
        const x0 = Math.floor(b[o] / 4), x1 = Math.floor(b[o + 3] / 4), z0 = Math.floor(b[o + 2] / 4), z1 = Math.floor(b[o + 5] / 4);
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 4096 + z; let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(i); }
      }
      this.bounds = { min: mn, max: mx };
      this.q = [];
      this.buildNav(src.nav);
    }
    query(x0, z0, x1, z1) {
      const q = this.q; q.length = 0; this.sn++;
      for (let x = Math.floor(x0 / 4); x <= Math.floor(x1 / 4); x++) for (let z = Math.floor(z0 / 4); z <= Math.floor(z1 / 4); z++) {
        const a = this.grid.get(x * 4096 + z); if (!a) continue;
        for (const i of a) if (this.stamp[i] !== this.sn) { this.stamp[i] = this.sn; q.push(i); }
      }
      return q;
    }
    /** nearest box hit along a unit ray within maxT, or null. Same slab test as js/arena/arena-core.js. */
    raycast(ox, oy, oz, dx, dy, dz, maxT) {
      const b = this.box; let best = maxT, bi = -1, bAx = 0, bS = 0;
      const ix = 1 / (dx || 1e-12), iy = 1 / (dy || 1e-12), iz = 1 / (dz || 1e-12);
      const ex = ox + dx * maxT, ez = oz + dz * maxT;
      for (const i of this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez))) {
        const o = i * 6;
        let t0x = (b[o] - ox) * ix, t1x = (b[o + 3] - ox) * ix, sx = -1; if (t0x > t1x) { const t = t0x; t0x = t1x; t1x = t; sx = 1; }
        let t0y = (b[o + 1] - oy) * iy, t1y = (b[o + 4] - oy) * iy, sy = -1; if (t0y > t1y) { const t = t0y; t0y = t1y; t1y = t; sy = 1; }
        let t0z = (b[o + 2] - oz) * iz, t1z = (b[o + 5] - oz) * iz, sz = -1; if (t0z > t1z) { const t = t0z; t0z = t1z; t1z = t; sz = 1; }
        let tn = t0x, ax = 0, sg = sx;
        if (t0y > tn) { tn = t0y; ax = 1; sg = sy; }
        if (t0z > tn) { tn = t0z; ax = 2; sg = sz; }
        const tf = Math.min(t1x, t1y, t1z);
        if (tn > tf || tf < 0 || tn >= best || tn < 0) continue;
        best = tn; bi = i; bAx = ax; bS = sg;
      }
      if (bi < 0) return null;
      return { t: best, nx: bAx === 0 ? bS : 0, ny: bAx === 1 ? bS : 0, nz: bAx === 2 ? bS : 0 };
    }
    los(ax, ay, az, bx, by, bz) {
      const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
      if (d < 1e-4) return true;
      return !this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05);
    }
    floorAt(x, z, r, maxY) {
      const b = this.box; let best = -Infinity;
      for (const i of this.query(x - r, z - r, x + r, z + r)) {
        const o = i * 6, top = b[o + 4];
        if (top > maxY || top <= best) continue;
        if (x + r < b[o] || x - r > b[o + 3] || z + r < b[o + 2] || z - r > b[o + 5]) continue;
        best = top;
      }
      return best;
    }
    blocked(x, y, z, r, h) {
      const b = this.box;
      for (const i of this.query(x - r, z - r, x + r, z + r)) {
        const o = i * 6;
        if (b[o + 4] <= y + 0.6 || b[o + 1] >= y + h) continue;
        if (x + r < b[o] || x - r > b[o + 3] || z + r < b[o + 2] || z - r > b[o + 5]) continue;
        return true;
      }
      return false;
    }
    /* ------------------------------------------------ navigation graph */
    buildNav(src) {
      if (!src || !src.nodes.length) { this.nav = null; return; }
      const n = src.nodes.length, pos = new Float32Array(n * 3);
      src.nodes.forEach((p, i) => pos.set(p, i * 3));
      const out = Array.from({ length: n }, () => []);
      const add = (a, b, t) => { const w = Math.hypot(pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]) * (t === 2 ? 0.6 : t === 1 ? 1.3 : 1); out[a].push(b, w, t); };
      for (const [a, b, t] of src.edges) { if (a >= n || b >= n) continue; add(a, b, t); if (t === 0) add(b, a, 0); }
      const hash = new Map();
      for (let i = 0; i < n; i++) { const k = Math.round(pos[i * 3] / 2) * 4096 + Math.round(pos[i * 3 + 2] / 2); let a = hash.get(k); if (!a) hash.set(k, a = []); a.push(i); }
      this.nav = { n, pos, out, hash, g: new Float64Array(n), from: new Int32Array(n), seen: new Uint32Array(n), gen: 0 };
    }
    nearestNode(x, y, z, maxR = 6) {
      const N = this.nav; if (!N) return -1;
      const cx = Math.round(x / 2), cz = Math.round(z / 2), Rr = Math.ceil(maxR / 2);
      let best = -1, bd = Infinity;
      for (let dx = -Rr; dx <= Rr; dx++) for (let dz = -Rr; dz <= Rr; dz++) {
        const a = N.hash.get((cx + dx) * 4096 + cz + dz); if (!a) continue;
        for (const i of a) {
          const vy = y - N.pos[i * 3 + 1]; if (vy < -1.5 || vy > 4.5) continue;
          const d = Math.hypot(N.pos[i * 3] - x, N.pos[i * 3 + 2] - z) + Math.abs(vy) * 2.5;
          if (d < bd) { bd = d; best = i; }
        }
      }
      return best;
    }
    node(i) { const p = this.nav.pos; return [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]; }
    /** A* over the nav graph. Returns node indices from start to goal, or null. */
    path(a, b, limit = 4000) {
      const N = this.nav; if (!N || a < 0 || b < 0) return null;
      if (a === b) return [a];
      const gen = ++N.gen, P = N.pos, bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
      const h = i => Math.hypot(P[i * 3] - bx, P[i * 3 + 1] - by, P[i * 3 + 2] - bz);
      const heap = [[h(a), a]];
      const push = (f, v) => { heap.push([f, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
      N.seen[a] = gen; N.g[a] = 0; N.from[a] = -1;
      let it = 0;
      while (heap.length && it++ < limit) {
        const [, u] = pop();
        if (u === b) { const out = []; for (let v = b; v >= 0; v = N.from[v]) out.push(v); return out.reverse(); }
        const e = N.out[u];
        for (let k = 0; k < e.length; k += 3) {
          const v = e[k], ng = N.g[u] + e[k + 1];
          if (N.seen[v] === gen && ng >= N.g[v]) continue;
          N.seen[v] = gen; N.g[v] = ng; N.from[v] = u; push(ng + h(v), v);
        }
      }
      return null;
    }
    edgeType(a, b) { const e = this.nav.out[a]; for (let k = 0; k < e.length; k += 3) if (e[k] === b) return e[k + 2]; return 0; }
  }

  /* ================================================================== geometry helpers */
  /** ray vs sphere, returns t or -1 */
  function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const lx = cx - ox, ly = cy - oy, lz = cz - oz, tc = lx * dx + ly * dy + lz * dz;
    if (tc < 0) return -1;
    const d2 = lx * lx + ly * ly + lz * lz - tc * tc; if (d2 > r * r) return -1;
    return tc - Math.sqrt(r * r - d2);
  }
  /** ray vs vertical cylinder [y0, y1], returns t or -1 */
  function rayCyl(ox, oy, oz, dx, dy, dz, cx, cz, y0, y1, r) {
    const fx = ox - cx, fz = oz - cz, a = dx * dx + dz * dz;
    if (a < 1e-9) { if (fx * fx + fz * fz > r * r) return -1; const t = (dy > 0 ? y0 - oy : y1 - oy) / dy; return t >= 0 ? t : -1; }
    const b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r, disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const s = Math.sqrt(disc);
    for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) { if (t < 0) continue; const y = oy + dy * t; if (y >= y0 && y <= y1) return t; }
    return -1;
  }
  const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const dirFrom = (yaw, pitch) => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  function jitter(dir, deg, rnd) {
    if (deg <= 0) return dir;
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * Math.tan(deg * Math.PI / 180);
    const up = Math.abs(dir[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    let rx = up[1] * dir[2] - up[2] * dir[1], ry = up[2] * dir[0] - up[0] * dir[2], rz = up[0] * dir[1] - up[1] * dir[0];
    const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
    const ux = dir[1] * rz - dir[2] * ry, uy = dir[2] * rx - dir[0] * rz, uz = dir[0] * ry - dir[1] * rx;
    return norm3([dir[0] + (rx * Math.cos(a) + ux * Math.sin(a)) * rr, dir[1] + (ry * Math.cos(a) + uy * Math.sin(a)) * rr, dir[2] + (rz * Math.cos(a) + uz * Math.sin(a)) * rr]);
  }

  /* ================================================================== loadouts */
  function gunStats(id, playlist, att, tier = 0) {
    const base = PVP.GUNS[id]; if (!base) return null;
    const g = Object.assign({ id }, base, playlist === 'classic' ? (PVP.CLASSIC_GUNS[id] || {}) : {});
    const mods = { ads: 0, range: 0, spread: 0, recoil: 0, mag: 0, reload: 0, move: 0, quiet: 0, laser: 0, stf: 0, flinch: 0 };
    for (const a of att || []) { const A = PVP.ATTACHMENTS[a]; if (!A) continue; for (const [k, v] of Object.entries(A.mods)) mods[k] += v; }
    g.mods = mods;
    g.magSize = Math.max(1, Math.round(g.mag * (1 + mods.mag)));
    g.reloadT = g.reload * (1 + mods.reload);
    g.rangeK = 1 + mods.range;
    g.tier = tier;
    g.dmgK = playlist === 'classic' && tier ? 1 + PVP.TIER_DMG * tier : 1;
    return g;
  }
  function sanitizeClass(c, level) {
    const P = PVP, lv = level || 999;
    const okGun = (id, sec) => P.GUNS[id] && !P.GUNS[id].power && !P.GUNS[id].melee && (!!P.GUNS[id].secondary === sec || (sec && c?.perks?.includes('bnpl'))) && P.GUNS[id].lvl <= lv;
    const out = { name: String(c?.name || 'CUSTOM').slice(0, 20), primary: okGun(c?.primary, false) ? c.primary : 'ar',
      secondary: okGun(c?.secondary, true) || (c?.perks?.includes('bnpl') && okGun(c?.secondary, false)) ? c.secondary : 'pistol',
      lethal: P.LETHALS[c?.lethal] && P.LETHALS[c.lethal].lvl <= lv ? c.lethal : 'frag',
      tactical: P.TACTICALS[c?.tactical] && P.TACTICALS[c.tactical].lvl <= lv ? c.tactical : 'notify', perks: [], att: {} };
    for (let t = 1; t <= 3; t++) {
      const want = (c?.perks || []).find(p => P.PERKS[p]?.tier === t && P.PERKS[p].lvl <= lv);
      out.perks.push(want || Object.keys(P.PERKS).find(p => P.PERKS[p].tier === t && P.PERKS[p].lvl <= 1));
    }
    if (!out.perks.includes('bnpl') && !P.GUNS[out.secondary]?.secondary) out.secondary = 'pistol';
    for (const gid of [out.primary, out.secondary]) {
      const list = (c?.att?.[gid] || []).filter(a => P.ATTACHMENTS[a]);
      const slots = new Set(), keep = [];
      for (const a of list) { const s = P.ATTACHMENTS[a].slot; if (slots.has(s) || keep.length >= P.MAX_ATTACH) continue; slots.add(s); keep.push(a); }
      out.att[gid] = keep;
    }
    out.streaks = (c?.streaks || P.DEFAULT_STREAKS).filter(s => P.STREAKS[s] && P.STREAKS[s].lvl <= lv).slice(0, P.STREAK_SLOTS);
    if (!out.streaks.length) out.streaks = P.DEFAULT_STREAKS.slice();
    return out;
  }

  /* ================================================================== the match */
  class Match {
    /**
     * opts: { map (compact map data), mode, seed, botSkill, fill: bool (bots fill empty slots), size (override), custom: {} }
     */
    constructor(opts) {
      this.opts = opts;
      this.mode = PVP.MODES[opts.mode] || PVP.MODES.tdm;
      this.playlist = this.mode.playlist === 'party' ? 'core' : this.mode.playlist;
      this.health = PVP.HEALTH[this.playlist === 'classic' ? 'classic' : 'core'];
      this.world = new World(opts.map);
      this.mapId = opts.map.id;
      this.rnd = rng(opts.seed || 1);
      this.now = 0; this.tickN = 0;
      this.players = new Map(); this.nextNum = 1;
      this.proj = []; this.ents = []; this.items = []; this.nextEnt = 1;
      this.out = [];
      this.state = 'pregame'; this.stateT = opts.pregame ?? 6;
      this.custom = Object.assign({ scoreLimit: 0, timeLimit: 0, hpMul: 1, headshotsOnly: false, noStreaks: false, oneGun: null, lowGrav: false }, opts.custom || {});
      this.limit = this.custom.scoreLimit || this.mode.limit;
      this.timeLeft = this.custom.timeLimit || this.mode.time || 0;
      this.teamScore = [0, 0];
      this.round = 0; this.roundWins = [0, 0];
      this.botSkill = PVP.BOT_SKILL[opts.botSkill] ? opts.botSkill : 'regular';
      this.size = opts.size || this.mode.size;
      this.capacity = this.mode.teams === 2 && !this.mode.ffaSize ? this.size * 2 : this.size;
      this.firstBlood = false; this.lastLeader = -1; this.minuteCalled = false;
      this.smokes = [];
      this.layout();
      this.modeInit();
    }

    /* ------------------------------------------------ spawn sides and objective spots */
    layout() {
      const W = this.world, src = W.src;
      const fix = p => { const f = W.floorAt(p[0], p[2], 0.3, p[1] + 1.5); return [p[0], Number.isFinite(f) ? f : p[1], p[2], p[3] || 0]; };
      let spawns = src.spawns.map(fix);
      if (spawns.length < 6) spawns = spawns.concat((src.nav ? Array.from({ length: 12 }, (_, i) => W.node(Math.floor(i * W.nav.n / 12))) : []).map(p => fix([p[0], p[1], p[2], 0])));
      spawns = spawns.filter(p => !W.blocked(p[0], p[1] + 0.05, p[2], R, H));
      this.spawns = spawns;
      // the axis between the two farthest spawn points splits the map into the two team sides
      let a = spawns[0], b = spawns[1] || spawns[0], best = -1;
      for (const p of spawns) for (const q of spawns) { const d = (p[0] - q[0]) ** 2 + (p[2] - q[2]) ** 2; if (d > best) { best = d; a = p; b = q; } }
      const ax = b[0] - a[0], az = b[2] - a[2], al = Math.hypot(ax, az) || 1;
      this.axis = [ax / al, az / al]; this.axisO = [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2];
      const side = p => (p[0] - this.axisO[0]) * this.axis[0] + (p[2] - this.axisO[1]) * this.axis[1];
      const sorted = spawns.slice().sort((p, q) => side(p) - side(q));
      const third = Math.max(2, Math.floor(sorted.length / 3));
      this.sides = [sorted.slice(0, third), sorted.slice(sorted.length - third)];
      this.base = this.sides.map(s => { const c = [0, 0, 0]; for (const p of s) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } c[0] /= s.length; c[2] /= s.length;
        let b = s[0], bd = Infinity; for (const p of s) { const d = Math.hypot(p[0] - c[0], p[2] - c[2]); if (d < bd) { bd = d; b = p; } } return [b[0], b[1], b[2]]; });
      this.sideOf = p => side(p);
      // objective points: the three relays (flags A, B, C / bomb sites / hills)
      // objectives must stand on walkable floor: snap each to the nearest nav node (relay markers can sit on props)
      const snap = p => { if (!W.nav) return p; let n = W.nearestNode(p[0], p[1] + 0.3, p[2], 6); if (n < 0) n = W.nearestNode(p[0], p[1] + 0.3, p[2], 14); if (n < 0) { let bd = Infinity; for (let i = 0; i < W.nav.n; i++) { const q = W.node(i), d = Math.hypot(q[0] - p[0], (q[1] - p[1]) * 2, q[2] - p[2]); if (d < bd) { bd = d; n = i; } } } return n >= 0 ? W.node(n).concat([0]) : p; };
      const rel = (src.relays.length >= 3 ? src.relays.map(fix) : spawns.slice(0, 3)).map(snap);
      this.flags = rel.slice(0, 3).sort((p, q) => side(p) - side(q));
      const extra = [src.extraction, src.start].filter(Boolean).map(fix).map(snap);
      this.hills = [this.flags[1], this.flags[0], extra[0], this.flags[2], extra[1]].filter(Boolean);
      // the map's middle: nearest nav node to the centroid of all spawns
      const c = [0, 0, 0]; for (const p of spawns) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } c[0] /= spawns.length; c[1] /= spawns.length; c[2] /= spawns.length;
      const mid = W.nearestNode(c[0], c[1] + 1, c[2], 30);
      this.mid = mid >= 0 ? W.node(mid) : c;
      // item spots for Classic Arena pickups: perches, pad targets, relays, the middle; power weapons nearest the middle
      const spots = [this.mid, ...src.perches.map(fix), ...src.pads.map(p => fix([p[3], p[4], p[5]])), ...rel, ...extra, ...spawns.filter(p => Math.abs(side(p)) < al * 0.2)];
      const uniq = [];
      for (const s0 of spots) { if (!s0) continue; const s = snap(s0); if (!uniq.some(u => Math.hypot(u[0] - s[0], u[2] - s[2]) < 6)) uniq.push(s); }
      uniq.sort((p, q) => Math.hypot(p[0] - this.mid[0], p[2] - this.mid[2]) - Math.hypot(q[0] - this.mid[0], q[2] - this.mid[2]));
      this.itemSpots = uniq;
      this.pads = src.pads;
    }

    /* ------------------------------------------------ messaging */
    send(to, msg) { this.out.push([to, msg]); }
    all(msg) { this.out.push(['*', msg]); }
    team(t, msg) { this.out.push([{ team: t }, msg]); }
    call(key, vars = {}) {
      const list = PVP.CALLS[key]; if (!list || this.mode.noChat && key !== 'win') return;
      let txt = list[Math.floor(this.rnd() * list.length)];
      for (const [k, v] of Object.entries(vars)) txt = txt.split('{' + k + '}').join(v);
      this.all({ e: 'call', key, txt });
    }
    drain() { const o = this.out; this.out = []; return o; }

    /* ------------------------------------------------ players */
    join(id, info = {}) {
      if (this.players.has(id)) { const p = this.players.get(id); p.connected = true; p.human = !info.bot; return p; }
      const humans = [...this.players.values()].filter(p => !p.bot).length;
      if (!info.bot && humans >= this.capacity) return null;
      if (!info.bot && this.players.size >= this.capacity) this.kickBot(info.team);      // a real player takes a bot's place
      const num = this.nextNum++;
      const p = {
        id, num, name: String(info.name || 'OPERATIVE').slice(0, 20), look: String(info.look || '').slice(0, 800), bot: info.bot ? { skill: PVP.BOT_SKILL[this.botSkill] } : null,
        input: info.input || 'mouse', team: 0, connected: true, alive: false, respawnAt: this.now + 0.5, hp: 0, maxHp: 100, shield: 0, maxShield: 0,
        pos: [0, 0, 0], vel: [0, 0, 0], yaw: 0, pitch: 0, fl: 0, lastIn: -1, hurtAt: -99, protect: 0, hist: [], classes: null, cls: 0, loadout: null,
        weapons: [], cur: 0, nades: 0, tacs: 0, perks: new Set(), streakIds: [], streakPts: 0, streakUsed: new Set(), ready: [],
        kills: 0, deaths: 0, assists: 0, score: 0, obj: 0, heads: 0, longs: 0, lifeKills: 0, best: 0, multi: 0, multiT: -9, streakEnds: 0, couch: 0, couchSpot: null,
        dmgBy: new Map(), wstats: {}, flashUntil: 0, stunUntil: 0, revealUntil: 0, camoUntil: 0, overshield: 0, gunIdx: 0, infected: false, jugg: false, carry: null,
        useHold: 0, joinedAt: this.now, xpLog: [], pts: 0, violations: 0, joinTeamAt: this.now,
      };
      p.team = this.pickTeam(p, info.team);
      this.players.set(id, p);
      if (!p.bot) this.send(id, { e: 'you', num, team: p.team, mode: this.mode.id, map: this.mapId, playlist: this.playlist });
      this.all({ e: 'joined', num, name: p.name, team: p.team, bot: !!p.bot, look: p.look, input: p.input });
      return p;
    }
    pickTeam(p, want) {
      if (this.mode.id === 'infection') return this.state === 'live' && this.infectionStarted ? 1 : 0;
      if (this.mode.teams !== 2) return p.num;              // FFA: every player is their own team
      const c = [0, 0]; for (const q of this.players.values()) if (q !== p && q.team < 2) c[q.team]++;
      if ((want === 0 || want === 1) && c[want] < this.size) return want;
      return c[0] <= c[1] ? 0 : 1;
    }
    kickBot(team) {
      const bots = [...this.players.values()].filter(p => p.bot && (team === undefined || this.mode.teams !== 2 || p.team === team));
      const pick = bots.find(b => !b.alive) || bots[0];
      if (pick) this.remove(pick.id);
    }
    leave(id) {
      const p = this.players.get(id); if (!p) return;
      p.connected = false; p.leftAt = this.now;
    }
    remove(id) {
      const p = this.players.get(id); if (!p) return;
      this.dropCarried(p);
      this.players.delete(id);
      this.all({ e: 'left', num: p.num });
    }
    /** keep the lobby full: bots fill empty slots, and step aside when real players arrive */
    fillBots() {
      if (this.opts.fill === false) return;
      const target = this.capacity;
      const live = [...this.players.values()];
      let n = live.length;
      while (n < target) {
        const used = new Set(live.map(p => p.name));
        const name = PVP.BOT_NAMES.find(x => !used.has(x)) || 'bot_' + this.nextNum;
        const id = 'bot:' + this.nextNum;
        const p = this.join(id, { bot: true, name });
        if (!p) break;
        live.push(p); n++;
      }
    }
    setClasses(id, classes, level) {
      const p = this.players.get(id); if (!p || !Array.isArray(classes)) return;
      p.classes = classes.slice(0, PVP.CUSTOM_SLOTS + PVP.PREMADE.length).map(c => sanitizeClass(c, level));
      p.level = level || 1;
    }
    pickClass(id, idx) { const p = this.players.get(id); if (p) p.cls = clamp(idx | 0, 0, (p.classes || PVP.PREMADE).length - 1); }
    classOf(p) {
      const list = p.classes || PVP.PREMADE.map(c => sanitizeClass(c, 1));
      return sanitizeClass(list[p.cls] || list[0], p.level || 99);
    }

    /* ------------------------------------------------ spawning */
    buildLoadout(p) {
      const M = this.mode, pl = this.playlist;
      let guns, lethal = null, tactical = null, perks = [], streaks = [];
      if (M.id === 'gungame') { guns = [[PVP.GUNGAME[p.gunIdx], PVP.GUNGAME_TIER[p.gunIdx]]]; }
      else if (M.id === 'infection') { guns = p.infected ? [['knife', 0]] : [['pistol', 0], ['shotgun', 0]]; }
      else if (M.id === 'influencer' && p.jugg) { guns = [['minigun', 0]]; }
      else if (pl === 'classic') { guns = PVP.CLASSIC_START.map(g => [g, 0]); lethal = 'frag'; }
      else {
        const c = this.classOf(p);
        guns = [[c.primary, 0, c.att[c.primary]], [c.secondary, 0, c.att[c.secondary]]];
        lethal = c.lethal; tactical = c.tactical; perks = c.perks; streaks = c.streaks;
      }
      if (this.custom.oneGun && PVP.GUNS[this.custom.oneGun]) guns = [[this.custom.oneGun, 0]];
      p.weapons = guns.map(([id, tier, att]) => {
        const g = gunStats(id, pl, att, tier);
        return { id, g, mag: g.magSize, res: g.reserve, next: 0, reloadAt: 0, burstLeft: 0, att: att || [] };
      });
      p.cur = 0;
      p.perks = new Set(perks);
      p.lethal = lethal; p.tactical = tactical;
      p.nades = lethal ? (pl === 'classic' ? 2 : 1) : 0; p.tacs = tactical ? 1 : 0;
      p.streakIds = M.streakMax > 0 && !this.custom.noStreaks ? streaks : [];
      p.loadout = { guns: p.weapons.map(w => [w.id, w.g.tier, w.att]), lethal, tactical, perks, streaks: p.streakIds };
    }
    spawn(p) {
      const sp = this.chooseSpawn(p);
      this.buildLoadout(p);
      const hm = this.health, hpMul = this.custom.hpMul || 1;
      p.maxHp = (p.jugg ? 400 : p.infected ? 150 : hm.hp) * hpMul; p.hp = p.maxHp;
      p.maxShield = p.infected || p.jugg ? 0 : hm.shield * hpMul; p.shield = p.maxShield; p.overshield = 0;
      p.pos = [sp[0], sp[1] + 0.02, sp[2]]; p.vel = [0, 0, 0]; p.yaw = this.faceYaw(sp); p.pitch = 0;
      p.alive = true; p.protect = this.now + PVP.SPAWN_PROTECT; p.hurtAt = -99; p.lifeKills = 0; p.streakPts = 0; p.streakUsed = new Set(); p.ready = [];
      p.dmgBy = new Map(); p.hist = []; p.lastIn = this.now; p.lastSafe = p.pos.slice(); p.flashUntil = 0; p.stunUntil = 0; p.useHold = 0; p.couchSpot = null;
      p.spawnedAt = this.now;
      if (p.bot) this.botReset(p);
      this.send(p.id, { e: 'spawn', x: r2(p.pos[0]), y: r2(p.pos[1]), z: r2(p.pos[2]), yaw: r2(p.yaw), loadout: p.loadout, hp: p.maxHp, sh: p.maxShield,
        prof: p.infected ? 'serverless' : this.playlist, prot: PVP.SPAWN_PROTECT });
    }
    faceYaw(sp) { const dx = this.mid[0] - sp[0], dz = this.mid[2] - sp[2]; return Math.atan2(-dx, -dz); }
    enemiesOf(p) { return [...this.players.values()].filter(q => q !== p && q.alive && this.hostile(p, q)); }
    hostile(a, b) { return a.team !== b.team; }
    chooseSpawn(p) {
      const W = this.world, M = this.mode;
      const enemies = this.enemiesOf(p), friends = [...this.players.values()].filter(q => q !== p && q.alive && !this.hostile(p, q));
      const fixedSides = M.id === 'snd' || M.id === 'ctf' || this.now - this.liveAt < 25 || this.state !== 'live';
      const mySide = this.sideFor(p);
      let pool = this.spawns;
      if (M.teams === 2 && fixedSides && mySide >= 0) pool = this.sides[mySide];
      let best = null, bs = -Infinity;
      for (const s of pool) {
        let sc = this.rnd() * 6, near = Infinity;
        for (const e of enemies) {
          const d = Math.hypot(e.pos[0] - s[0], e.pos[2] - s[2]); near = Math.min(near, d);
          if (d < 45 && W.los(e.pos[0], e.pos[1] + EYE, e.pos[2], s[0], s[1] + 1.2, s[2])) sc -= 60;
        }
        sc += Math.min(near, 40) * 1.2;
        if (near < 10) sc -= 80;
        for (const f of friends) { const d = Math.hypot(f.pos[0] - s[0], f.pos[2] - s[2]); if (d > 6 && d < 25) sc += 6; }
        if (M.teams === 2 && mySide >= 0 && !fixedSides) { const own = this.sideOf(s) * (mySide === 0 ? -1 : 1); sc += clamp(own, -30, 30) * 0.4; }
        if (M.id === 'dom' && this.domFlags) for (const f of this.domFlags) if (f.owner === p.team) { const d = Math.hypot(f.pos[0] - s[0], f.pos[2] - s[2]); if (d < 30) sc += 10; }
        if (sc > bs) { bs = sc; best = s; }
      }
      return best || this.spawns[0];
    }
    sideFor(p) {
      if (this.mode.teams !== 2) return -1;
      let t = p.team;
      if (this.swapped) t = 1 - t;
      return t;
    }

    /* ------------------------------------------------ client messages */
    onInput(id, m) {
      const p = this.players.get(id); if (!p || !p.alive || p.bot) return;
      const P = Array.isArray(m.p) ? m.p.map(Number) : null; if (!P || P.length !== 3 || !P.every(Number.isFinite)) return;
      const dt = Math.max(0.01, this.now - p.lastIn); p.lastIn = this.now;
      const W = this.world, b = W.bounds;
      const dh = Math.hypot(P[0] - p.pos[0], P[2] - p.pos[2]);
      const stun = p.stunUntil > this.now ? 0.6 : 1;
      const maxH = (PVP.MAX_HSPEED * stun) * dt + 1.2;
      let bad = dh > maxH || P[0] < b.min[0] - 2 || P[0] > b.max[0] + 2 || P[2] < b.min[2] - 2 || P[2] > b.max[2] + 2 || P[1] > b.max[1] + 12;
      if (!bad && dh > 0.05) {                                         // no walking through walls: test the move at knee and chest height
        const dx = (P[0] - p.pos[0]) / dh, dz = (P[2] - p.pos[2]) / dh;
        for (const y of [0.7, 1.3]) { const hit = W.raycast(p.pos[0], Math.max(p.pos[1], P[1]) + y, p.pos[2], dx, 0, dz, dh); if (hit && hit.t < dh - 0.45) { bad = true; break; } }
      }
      if (bad) {
        p.violations++;
        this.send(id, { e: 'correct', x: r2(p.pos[0]), y: r2(p.pos[1]), z: r2(p.pos[2]) });
        return;
      }
      if (P[1] < Math.min(-12, b.min[1] - 6)) { this.kill(p, null, { w: 'fall' }); return; }
      p.pos = P; p.vel = Array.isArray(m.v) ? m.v.map(v => clamp(Number(v) || 0, -60, 60)) : [0, 0, 0];
      p.yaw = Number(m.yaw) || 0; p.pitch = clamp(Number(m.pitch) || 0, -1.6, 1.6); p.fl = m.fl | 0;
      if (Number.isInteger(m.w) && p.weapons[m.w]) p.cur = m.w;
      if (p.fl & 2 && this.playlist !== 'classic') p.fl &= ~2 | 0;
    }
    onFire(id, m) {
      const p = this.players.get(id); if (!p || !p.alive || this.state === 'pregame' && this.mode.rounds) return;
      if (this.mode.id === 'hottake' && p.carry === 'ball') return;
      const w = p.weapons[p.cur]; if (!w || w.g.melee) return;
      const now = this.now, g = w.g;
      if (w.reloadAt > now) return this.ammo(p, w);
      if (w.mag <= 0) return this.ammo(p, w);
      const interval = g.fire === 'burst' ? 60 / g.burstRpm : 60 / g.rpm;
      if (now < w.next - interval * 0.35 - 0.035) return;            // generous: a little jitter is fine, a fast-fire cheat is not
      w.next = Math.max(now, w.next) + (g.fire === 'burst' && --w.burstLeft > 0 ? interval : (w.burstLeft = g.burst || 0, 60 / g.rpm));
      w.mag--;
      p.firedAt = now;
      if (g.mods?.quiet) p.quietFire = now; else p.loudAt = now;
      const eye = this.eye(p);
      let o = Array.isArray(m.o) ? m.o.map(Number) : eye;
      if (!o.every(Number.isFinite) || Math.hypot(o[0] - eye[0], o[1] - eye[1], o[2] - eye[2]) > 1.6) o = eye;
      const dirs = (Array.isArray(m.d) ? m.d : [dirFrom(p.yaw, p.pitch)]).slice(0, g.pellets).map(d => (Array.isArray(d) && d.length === 3 && d.every(Number.isFinite) ? norm3(d) : dirFrom(p.yaw, p.pitch)));
      const rt = clamp(Number(m.rt) || now, now - REWIND_MAX, now);
      if (g.proj) { this.launch(p, o, dirs[0], g, w); return; }
      for (const d of dirs) this.shot(p, o, d, g, rt);
    }
    ammo(p, w) { if (p.bot || this.now - (p.ammoSent || -9) < 0.3) return; p.ammoSent = this.now; if (!p.bot) this.send(p.id, { e: 'ammo', w: p.weapons.indexOf(w), mag: w.mag, res: w.res, rl: w.reloadAt > this.now ? r2(w.reloadAt - this.now) : 0 }); }
    onReload(id, m) {
      const p = this.players.get(id); if (!p || !p.alive) return;
      const w = p.weapons[Number.isInteger(m?.w) ? m.w : p.cur]; if (!w || w.g.melee) return;
      this.reload(p, w);
    }
    reload(p, w) {
      if (w.reloadAt > this.now || w.mag >= w.g.magSize || w.res <= 0) return;
      const k = p.perks.has('sleight') ? 0.65 : 1;
      // the server's reload is a little shorter than the client's animation, so a fair client is never refused a shot
      const t = w.g.shell ? w.g.reloadT * (w.g.magSize - w.mag) * 0.8 : w.g.reloadT * 0.75;
      w.reloadAt = this.now + t * k;
      w.pendingReload = true;
    }
    onSwap(id, m) { const p = this.players.get(id); if (p && p.weapons[m?.w | 0]) p.cur = m.w | 0; }
    onMelee(id) {
      const p = this.players.get(id); if (!p || !p.alive || (p.meleeAt || 0) > this.now) return;
      p.meleeAt = this.now + 0.55;
      const eye = this.eye(p), f = dirFrom(p.yaw, p.pitch);
      let best = null, bd = 2.4;
      for (const q of this.enemiesOf(p)) {
        const dx = q.pos[0] - p.pos[0], dz = q.pos[2] - p.pos[2], dy = q.pos[1] - p.pos[1], d = Math.hypot(dx, dz);
        if (d > bd || Math.abs(dy) > 1.8) continue;
        if ((dx * f[0] + dz * f[2]) / (d || 1) < 0.45) continue;
        if (!this.world.los(eye[0], eye[1], eye[2], q.pos[0], q.pos[1] + 1.1, q.pos[2])) continue;
        best = q; bd = d;
      }
      if (!best) return;
      const back = (Math.sin(best.yaw) * (best.pos[0] - p.pos[0]) + Math.cos(best.yaw) * (best.pos[2] - p.pos[2])) / (bd || 1) > 0.5;   // attacker behind the victim
      let dmg = this.playlist === 'classic' ? (back ? 999 : 72) : p.infected ? 60 : 55;
      const w = p.weapons[p.cur];
      if (w?.g.melee) dmg = 200;
      if (this.mode.id === 'hottake' && p.carry === 'ball') dmg = 999;
      this.damage(best, dmg, p, { w: w?.g.melee ? 'knife' : 'melee', melee: true, from: p.pos });
    }
    onNade(id, m, tactical) {
      const p = this.players.get(id); if (!p || !p.alive) return;
      const kind = tactical ? p.tactical : p.lethal; if (!kind) return;
      if (tactical ? p.tacs <= 0 : p.nades <= 0) return;
      if (tactical) p.tacs--; else p.nades--;
      const D = tactical ? PVP.TACTICALS[kind] : PVP.LETHALS[kind];
      const eye = this.eye(p);
      let d = Array.isArray(m?.d) && m.d.every(Number.isFinite) ? norm3(m.d) : dirFrom(p.yaw, p.pitch);
      if (!D.knife) d = norm3([d[0], d[1] + 0.18, d[2]]);
      const cook = clamp(Number(m?.cook) || 0, 0, (D.fuse || 3) - 0.2);
      this.proj.push({ id: this.nextEnt++, kind, tactical: !!tactical, owner: p.id, team: p.team, pos: [eye[0] + d[0] * 0.5, eye[1] - 0.15, eye[2] + d[2] * 0.5],
        vel: [d[0] * D.speed + p.vel[0] * 0.3, d[1] * D.speed, d[2] * D.speed + p.vel[2] * 0.3], grav: D.grav, fuse: D.fuse ? D.fuse - cook : 0, life: D.life || 8,
        bounce: D.bounce || 0, stick: !!D.stick, mine: !!D.mine, knife: !!D.knife, armAt: this.now + (D.arm || 0), D, born: this.now });
    }
    onUse(id) {
      const p = this.players.get(id); if (!p || !p.alive) return;
      // swap to a weapon lying on the floor (Classic Arena pickups, care packages)
      let best = null, bd = 1.8;
      for (const it of this.items) { if (!it.on || it.kind !== 'weapon') continue; const d = Math.hypot(it.pos[0] - p.pos[0], it.pos[2] - p.pos[2]); if (d < bd && Math.abs(it.pos[1] - p.pos[1]) < 2) { best = it; bd = d; } }
      if (best) this.takeWeapon(p, best);
    }
    onStreak(id, m) {
      const p = this.players.get(id); if (!p || !p.alive) return;
      const sid = String(m?.id || ''); const i = p.ready.indexOf(sid); if (i < 0) return;
      p.ready.splice(i, 1);
      this.useStreak(p, sid);
    }
    onSkip(id) { const p = this.players.get(id); if (p && !p.alive && p.respawnAt - this.now > 0 && this.now - (p.diedAt || 0) > 1.5 && !this.mode.rounds) p.respawnAt = this.now; }

    /* ------------------------------------------------ shooting */
    eye(p) { return [p.pos[0], p.pos[1] + (p.fl & 1 ? EYEC : EYE), p.pos[2]]; }
    posAt(q, t) {
      const h = q.hist; if (!h.length || t >= this.now - 1e-6) return [q.pos[0], q.pos[1], q.pos[2], q.fl & 1];
      for (let i = h.length - 1; i > 0; i--) {
        const a = h[i - 1], b = h[i];
        if (a[0] <= t && t <= b[0]) { const k = (t - a[0]) / Math.max(1e-6, b[0] - a[0]); return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k, b[4]]; }
      }
      const a = h[0]; return [a[1], a[2], a[3], a[4]];
    }
    /** a bullet: walls first, then every enemy (rewound to rt), then streak entities. */
    shot(p, o, d, g, rt) {
      const W = this.world, maxT = 220;
      const wall = W.raycast(o[0], o[1], o[2], d[0], d[1], d[2], maxT);
      let endT = wall ? wall.t : maxT, hit = null, head = false;
      for (const q of this.players.values()) {
        if (q === p || !q.alive || !this.hostile(p, q)) continue;
        const [x, y, z, c] = this.posAt(q, rt);
        const hh = c ? HC : H, hy = y + hh - 0.2;
        let t = raySphere(o[0], o[1], o[2], d[0], d[1], d[2], x, hy, z, HEAD_R);
        if (t >= 0 && t < endT) { endT = t; hit = q; head = true; }
        t = rayCyl(o[0], o[1], o[2], d[0], d[1], d[2], x, z, y, hy - HEAD_R * 0.6, BODY_R);
        if (t >= 0 && t < endT) { endT = t; hit = q; head = false; hit.hitY = o[1] + d[1] * t - y; }
      }
      let ent = null;
      for (const e of this.ents) {
        if (!e.hp || e.team === p.team && this.mode.teams === 2 || e.owner === p.id) continue;
        const t = raySphere(o[0], o[1], o[2], d[0], d[1], d[2], e.pos[0], e.pos[1], e.pos[2], e.radius || 0.9);
        if (t >= 0 && t < endT) { endT = t; ent = e; hit = null; }
      }
      if (ent) { this.hurtEnt(ent, this.falloff(g, endT) * g.dmgK, p); if (!p.bot) this.send(p.id, { e: 'hit', ent: ent.id, d: 1 }); return; }
      if (!hit) return;
      if (this.custom.headshotsOnly && !head) return;
      let dmg = this.falloff(g, endT) * g.dmgK;
      if (g.limb && !head && (hit.hitY ?? 1.2) < 1.0) dmg = g.limb;
      const shieldsUp = hit.shield > 0 || hit.overshield > 0;
      if (head) {
        if (this.playlist === 'classic' && PVP.PRECISION[g.id] && !shieldsUp) dmg = 999;
        else dmg *= g.head || 1.4;
      }
      const long = endT >= (PVP.LONGSHOT[g.cls] || PVP.LONGSHOT[g.id] || 40);
      this.damage(hit, dmg, p, { w: g.id, head, long, dist: endT, from: o });
    }
    falloff(g, dist) {
      const k = g.rangeK || 1, n = g.near[1] * k, f = g.far[1] * k;
      if (dist <= n) return g.near[0];
      if (dist >= f) return g.far[0];
      return g.near[0] + (g.far[0] - g.near[0]) * (dist - n) / Math.max(0.01, f - n);
    }
    launch(p, o, d, g, w) {
      const P2 = g.proj;
      let target = null;
      if (g.lockOn) {                                                  // the launcher locks onto airborne streaks in front of you
        let best = 0.94;
        for (const e of this.ents) { if (!e.air || !e.hp || e.team === p.team && this.mode.teams === 2) continue;
          const dx = e.pos[0] - o[0], dy = e.pos[1] - o[1], dz = e.pos[2] - o[2], l = Math.hypot(dx, dy, dz);
          const c = (dx * d[0] + dy * d[1] + dz * d[2]) / l; if (c > best && l < 120) { best = c; target = e; } }
      }
      this.proj.push({ id: this.nextEnt++, kind: 'shell', gun: g.id, owner: p.id, team: p.team, pos: o.slice(), vel: [d[0] * P2.speed, d[1] * P2.speed, d[2] * P2.speed],
        grav: P2.grav, fuse: P2.grenade ? 0 : 0, life: P2.life, bounce: P2.bounce || 0, impact: !P2.grenade, grenade: !!P2.grenade, D: { radius: P2.splash, dmg: P2.dmg * g.dmgK, direct: P2.direct },
        homing: target?.id, born: this.now });
      void w;
    }

    /* ------------------------------------------------ damage, kills, assists */
    damage(q, amt, by, info) {
      if (!q.alive || this.state === 'over') return;
      if (q.protect > this.now && by && by !== q) return;
      if (this.state === 'pregame' && this.mode.rounds) return;
      if (info.explosive && q.perks.has('bubblewrap')) amt *= 0.65;
      if (by === q) amt *= 0.5;
      let left = amt, broke = false;
      if (q.overshield > 0) { const a = Math.min(q.overshield, left); q.overshield -= a; left -= a; }
      if (q.shield > 0 && left > 0) { const a = Math.min(q.shield, left); q.shield -= a; left -= a; if (q.shield <= 0) broke = true; }
      q.hp -= left;
      q.hurtAt = this.now;
      if (by && by !== q) {
        const rec = q.dmgBy.get(by.id) || { d: 0, t: 0 }; rec.d += amt; rec.t = this.now; q.dmgBy.set(by.id, rec);
        if (q.bot) this.botAlert(q, by);
      }
      const killed = q.hp <= 0;
      if (by && !by.bot && by !== q) this.send(by.id, { e: 'hit', v: q.num, d: Math.round(amt), h: info.head ? 1 : 0, k: killed ? 1 : 0, sh: broke ? 1 : 0 });
      if (!q.bot) this.send(q.id, { e: 'hurt', a: by?.num || 0, d: Math.round(amt), x: r2(info.from?.[0] ?? q.pos[0]), z: r2(info.from?.[2] ?? q.pos[2]), hp: Math.max(0, Math.round(q.hp)), sh: Math.round(q.shield + q.overshield) });
      if (killed) this.kill(q, by === q ? null : by, info);
    }
    kill(q, by, info = {}) {
      if (!q.alive) return;
      q.alive = false; q.hp = 0; q.deaths++; q.diedAt = this.now;
      const M = this.mode;
      q.respawnAt = this.now + (M.respawn || 3) + (q.perks.has('bnpl') ? 1 : 0);
      if (M.rounds && M.id !== 'infection') q.respawnAt = Infinity;
      const wasStreak = q.lifeKills;
      // assists: anyone else who did 20+ damage in the last 10 s
      const assists = [];
      for (const [aid, rec] of q.dmgBy) { if (by && aid === by.id) continue; const a = this.players.get(aid); if (a && rec.d >= 20 && this.now - rec.t < 10 && this.hostile(a, q)) { a.assists++; this.award(a, 'assist', PVP.POINTS.assist); assists.push(a.num); } }
      let fb = false;
      if (by && this.hostile(by, q)) {
        by.kills++; by.lifeKills++; by.best = Math.max(by.best, by.lifeKills);
        const ws = by.wstats[info.w] || (by.wstats[info.w] = { kills: 0, heads: 0, longs: 0 }); ws.kills++;
        this.award(by, 'kill', PVP.POINTS.kill);
        if (info.head) { by.heads++; ws.heads++; this.award(by, 'head', PVP.POINTS.head); }
        if (info.long) { by.longs++; ws.longs++; this.award(by, 'longshot', PVP.POINTS.longshot); }
        if (wasStreak >= 3) { by.streakEnds++; this.award(by, 'endStreak', PVP.POINTS.endStreak); }
        if (!this.firstBlood) { this.firstBlood = true; fb = true; this.award(by, 'firstBlood', PVP.POINTS.firstBlood); this.call('firstBlood'); }
        if (this.now - by.multiT < 4) by.multi++; else by.multi = 1;
        by.multiT = this.now;
        if (by.multi === 2) this.call('double'); else if (by.multi === 3) this.call('triple'); else if (by.multi > 3) this.call('multi');
        if (by.lifeKills === 5) this.call('streak5', { N: by.name }); else if (by.lifeKills === 10) this.call('streak10', { N: by.name });
        if (wasStreak >= 5) this.call('endStreak', { K: by.name, V: q.name });
        if (by.perks.has('dumpster')) { for (const w of by.weapons) if (!w.g.melee) w.res = Math.min(w.g.reserve * 1.5, w.res + Math.ceil(w.g.magSize * 0.5)); if (by.lethal && by.nades < 1) by.nades = 1; }
        if (by.perks.has('quickfix')) by.hurtAt = -99;
        if (q.carry === 'jugg' || q.jugg) this.award(by, 'influencerKill', PVP.POINTS.influencerKill);
      }
      this.all({ e: 'kill', k: by?.num || 0, v: q.num, w: info.w || 'world', h: info.head ? 1 : 0, a: assists, s: by?.lifeKills || 0, fb: fb ? 1 : 0, x: r2(q.pos[0]), y: r2(q.pos[1]), z: r2(q.pos[2]) });
      this.dropCarried(q);
      this.modeKill(q, by, info);
      this.lead();
    }
    award(p, why, pts) {
      if (!pts) return;
      p.score += pts;
      if (this.mode.streakMax > 0 && !this.custom.noStreaks) {
        const loyal = p.perks.has('loyalty') ? 100 : 0;
        const before = p.streakPts; p.streakPts += pts;
        for (const s of p.streakIds) {
          const cost = Math.max(100, PVP.STREAKS[s].pts - loyal);
          if (cost > this.mode.streakMax) continue;
          if (before < cost && p.streakPts >= cost && !p.streakUsed.has(s)) { p.streakUsed.add(s); p.ready.push(s); if (!p.bot) this.send(p.id, { e: 'streak', id: s, st: 'ready' }); }
        }
      }
      if (!p.bot) this.send(p.id, { e: 'pts', n: pts, why });
    }

    /* ------------------------------------------------ projectiles: grenades, rockets, plasma, knives */
    tickProj(dt) {
      const W = this.world;
      for (let i = this.proj.length - 1; i >= 0; i--) {
        const pr = this.proj[i];
        const owner = this.players.get(pr.owner);
        let boom = false;
        if (pr.homing) { const e = this.ents.find(x => x.id === pr.homing && x.hp > 0); if (e) { const dx = e.pos[0] - pr.pos[0], dy = e.pos[1] - pr.pos[1], dz = e.pos[2] - pr.pos[2], l = Math.hypot(dx, dy, dz) || 1, sp = Math.hypot(...pr.vel); pr.vel = [pr.vel[0] * 0.9 + dx / l * sp * 0.1, pr.vel[1] * 0.9 + dy / l * sp * 0.1, pr.vel[2] * 0.9 + dz / l * sp * 0.1]; if (l < 1.5) { this.hurtEnt(e, 500, owner); boom = true; } } }
        if (!pr.stuck && !pr.resting) {
          pr.vel[1] += (pr.grav || 0) * dt * (this.custom.lowGrav ? 0.4 : 1);
          const sp = Math.hypot(...pr.vel), step = sp * dt;
          if (step > 1e-4) {
            const d = [pr.vel[0] / sp, pr.vel[1] / sp, pr.vel[2] / sp];
            // players along the path (rockets, plasma and knives hit people directly)
            if (pr.impact || pr.knife) {
              for (const q of this.players.values()) {
                if (!q.alive || q.id === pr.owner && this.now - pr.born < 0.25) continue;
                if (owner && !this.hostile(owner, q) && q !== owner) continue;
                const t = rayCyl(pr.pos[0], pr.pos[1], pr.pos[2], d[0], d[1], d[2], q.pos[0], q.pos[2], q.pos[1], q.pos[1] + H, R + 0.1);
                if (t >= 0 && t <= step) {
                  if (pr.knife) { this.damage(q, pr.D.dmg, owner, { w: 'throwknife', from: pr.pos }); pr.life = 0; }
                  else { if (pr.D.direct && owner) this.damage(q, pr.D.direct, owner, { w: pr.gun, explosive: true, from: pr.pos }); boom = true; }
                  break;
                }
              }
            }
            const hit = !boom && W.raycast(pr.pos[0], pr.pos[1], pr.pos[2], d[0], d[1], d[2], step);
            if (hit) {
              pr.pos = [pr.pos[0] + d[0] * (hit.t - 0.02), pr.pos[1] + d[1] * (hit.t - 0.02), pr.pos[2] + d[2] * (hit.t - 0.02)];
              if (pr.impact) boom = true;
              else if (pr.stick || pr.knife) { pr.stuck = true; pr.vel = [0, 0, 0]; }
              else if (pr.mine) { pr.resting = true; pr.vel = [0, 0, 0]; }
              else {
                const n = [hit.nx, hit.ny, hit.nz], vn = pr.vel[0] * n[0] + pr.vel[1] * n[1] + pr.vel[2] * n[2];
                pr.vel = [(pr.vel[0] - 2 * vn * n[0]) * 0.45, (pr.vel[1] - 2 * vn * n[1]) * 0.45, (pr.vel[2] - 2 * vn * n[2]) * 0.45];
                if (hit.ny > 0.5 && Math.hypot(...pr.vel) < 2) { pr.resting = true; pr.vel = [0, 0, 0]; }
                if (pr.bounce-- <= 0 && pr.grenade) boom = true;
              }
            } else if (!boom) { pr.pos = [pr.pos[0] + pr.vel[0] * dt, pr.pos[1] + pr.vel[1] * dt, pr.pos[2] + pr.vel[2] * dt]; }
          }
        }
        pr.life -= dt;
        if (pr.fuse > 0) { pr.fuse -= dt; if (pr.fuse <= 0) boom = true; }
        if (pr.mine && this.now > pr.armAt) {
          for (const q of this.players.values()) if (q.alive && owner && this.hostile(owner, q) && Math.hypot(q.pos[0] - pr.pos[0], q.pos[1] - pr.pos[1], q.pos[2] - pr.pos[2]) < pr.D.trigger) { if (!pr.tripAt) pr.tripAt = this.now + 0.35; }
          if (pr.tripAt && this.now >= pr.tripAt) boom = true;
        }
        if (pr.life <= 0 && !boom && !pr.knife) boom = !pr.mine || pr.life < -1;
        if (pr.knife && (pr.life <= 0)) { this.proj.splice(i, 1); continue; }
        if (pr.pos[1] < this.world.bounds.min[1] - 20) { this.proj.splice(i, 1); continue; }
        if (boom) { this.detonate(pr, owner); this.proj.splice(i, 1); }
      }
    }
    detonate(pr, owner) {
      const W = this.world, x = pr.pos[0], y = pr.pos[1] + 0.15, z = pr.pos[2];
      const D = pr.D || {};
      if (pr.tactical) {
        this.all({ e: 'boom', x: r2(x), y: r2(y), z: r2(z), r: D.radius, k: pr.kind });
        if (pr.kind === 'vape') { this.smokes.push({ pos: [x, y + 1, z], r: D.radius, until: this.now + D.dur }); return; }
        for (const q of this.players.values()) {
          if (!q.alive) continue;
          const e = this.eye(q), d = Math.hypot(e[0] - x, e[1] - y, e[2] - z);
          if (d > D.radius || !W.los(x, y, z, e[0], e[1], e[2])) continue;
          const self = owner && q === owner;
          if (owner && !this.hostile(owner, q) && !self && pr.kind !== 'stun') continue;
          if (pr.kind === 'cookie') { if (owner && this.hostile(owner, q)) { q.revealUntil = this.now + D.dur; q.revealTeam = owner.team; } continue; }
          const terms = q.perks.has('termsunread') ? 0.5 : 1;
          if (pr.kind === 'notify') {
            const f = dirFrom(q.yaw, q.pitch), facing = ((x - e[0]) * f[0] + (y - e[1]) * f[1] + (z - e[2]) * f[2]) / (d || 1);
            const k = clamp((1 - d / D.radius) * 0.6 + (facing > 0 ? facing * 0.6 : 0.15), 0.15, 1) * (self ? 0.5 : 1);
            q.flashUntil = this.now + D.dur * k * terms;
            if (!q.bot) this.send(q.id, { e: 'flash', k: r2(k), dur: r2(D.dur * k * terms) });
          } else if (pr.kind === 'stun') {
            q.stunUntil = this.now + D.dur * terms;
            if (!q.bot) this.send(q.id, { e: 'stun', dur: r2(D.dur * terms) });
          }
        }
        return;
      }
      const rad = D.radius || 4;
      this.all({ e: 'boom', x: r2(x), y: r2(y), z: r2(z), r: rad, k: pr.kind });
      for (const q of this.players.values()) {
        if (!q.alive) continue;
        if (owner && q !== owner && !this.hostile(owner, q)) continue;
        const cy = q.pos[1] + 0.9, d = Math.hypot(q.pos[0] - x, cy - y, q.pos[2] - z);
        if (d > rad + R) continue;
        if (!W.los(x, y, z, q.pos[0], cy, q.pos[2]) && !W.los(x, y, z, q.pos[0], q.pos[1] + 1.6, q.pos[2])) continue;
        const f = 1 - Math.max(0, d - R) / rad * 0.75;
        this.damage(q, (D.dmg || 120) * f, owner, { w: pr.gun || pr.kind, explosive: true, from: pr.pos });
      }
      for (const e of this.ents) if (e.hp > 0 && (!owner || e.team !== owner.team || this.mode.teams !== 2) && Math.hypot(e.pos[0] - x, e.pos[1] - y, e.pos[2] - z) < rad + 1) this.hurtEnt(e, (D.dmg || 120) * 0.8, owner);
    }
    smoked(ax, ay, az, bx, by, bz) {
      for (const s of this.smokes) {
        const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz) || 1;
        const t = clamp(((s.pos[0] - ax) * dx + (s.pos[1] - ay) * dy + (s.pos[2] - az) * dz) / (l * l), 0, 1);
        if (Math.hypot(ax + dx * t - s.pos[0], ay + dy * t - s.pos[1], az + dz * t - s.pos[2]) < s.r * 0.8) return true;
      }
      return false;
    }

    /* ------------------------------------------------ scorestreaks */
    useStreak(p, sid) {
      const S = PVP.STREAKS[sid]; if (!S) return;
      const foes = t => [...this.players.values()].filter(q => q.alive && this.hostile(p, q) && (!t || !q.perks.has('donottrack')));
      this.all({ e: 'streak', id: sid, st: 'used', by: p.num, team: p.team });
      if (sid === 'ping') { this.pingUntil = this.pingUntil || {}; this.pingUntil[p.team] = this.now + S.dur; }
      else if (sid === 'downtime') { this.jamUntil = this.jamUntil || {}; for (const q of foes(false)) q.jamUntil = this.now + S.dur; this.jamUntil[p.team] = this.now + S.dur; }
      else if (sid === 'dronedrop') {
        const f = dirFrom(p.yaw, 0), x = p.pos[0] + f[0] * 3, z = p.pos[2] + f[2] * 3, fy = this.world.floorAt(x, z, 0.4, p.pos[1] + 2);
        const loot = this.rnd() < 0.5 ? { kind: 'streak', id: this.rnd.pick(['ping', 'downtime', 'broadcaster', 'sponsored', 'collab']) } : { kind: 'weapon', gun: this.rnd.pick(['plasma', 'mgl', 'launcher']), tier: 4 };
        this.items.push({ id: this.nextEnt++, kind: loot.kind === 'weapon' ? 'weapon' : 'crate', gun: loot.gun, tier: loot.tier || 0, streak: loot.id, pos: [x, Number.isFinite(fy) ? fy : p.pos[1], z], on: true, once: true, team: p.team, owner: p.id, landAt: this.now + 2.5 });
      }
      else if (sid === 'broadcaster') {
        const f = dirFrom(p.yaw, 0), x = p.pos[0] + f[0] * 1.6, z = p.pos[2] + f[2] * 1.6, fy = this.world.floorAt(x, z, 0.5, p.pos[1] + 1.5);
        this.ents.push({ id: this.nextEnt++, kind: 'broadcaster', owner: p.id, team: p.team, pos: [x, (Number.isFinite(fy) ? fy : p.pos[1]) + 1.1, z], hp: S.hp, maxHp: S.hp, until: this.now + S.dur, fireT: 1, yaw: p.yaw, radius: 0.8, range: 32, dmg: 13, rate: 0.22, err: 2.2 });
      }
      else if (sid === 'sponsored') this.ents.push({ id: this.nextEnt++, kind: 'sponsored', owner: p.id, team: p.team, pos: [this.mid[0], this.mid[1] + 14, this.mid[2]], hp: S.hp, maxHp: S.hp, until: this.now + S.dur, fireT: 1.5, ang: 0, orbit: 22, alt: 14, air: true, radius: 1.1, range: 60, dmg: 16, rate: 0.55, err: 2.6, yaw: 0 });
      else if (sid === 'gunship') this.ents.push({ id: this.nextEnt++, kind: 'gunship', owner: p.id, team: p.team, pos: [this.mid[0], this.mid[1] + 20, this.mid[2]], hp: S.hp, maxHp: S.hp, until: this.now + S.dur, fireT: 1.5, ang: 1.5, orbit: 26, alt: 20, air: true, radius: 1.8, range: 80, dmg: 45, rate: 0.85, err: 1.6, splash: 2.5, yaw: 0 });
      else if (sid === 'collab') {
        const b = this.join('collab:' + this.nextEnt++, { bot: true, name: p.name + "'s COLLAB", team: p.team });
        if (b) { b.team = p.team; b.collab = { owner: p.id, until: this.now + S.dur }; b.respawnAt = this.now; b.noScore = true; }
      }
      else if (sid === 'wipe') { this.wipe = { by: p.id, team: p.team, at: this.now + S.siren }; this.call('wipeSiren'); }
    }
    hurtEnt(e, dmg, by) {
      if (!e.hp) return;
      e.hp -= dmg;
      if (e.hp <= 0) { e.hp = 0; e.dead = true; if (by) this.award(by, 'shootDown', PVP.POINTS.shootDown); this.all({ e: 'entdown', id: e.id, by: by?.num || 0, x: r2(e.pos[0]), y: r2(e.pos[1]), z: r2(e.pos[2]) }); }
    }
    tickEnts(dt) {
      for (let i = this.ents.length - 1; i >= 0; i--) {
        const e = this.ents[i], owner = this.players.get(e.owner);
        if (e.dead || this.now > e.until || !owner) { this.ents.splice(i, 1); if (!e.dead) this.all({ e: 'entdown', id: e.id, by: 0, x: r2(e.pos[0]), y: r2(e.pos[1]), z: r2(e.pos[2]), quiet: 1 }); continue; }
        if (e.orbit) { e.ang += dt * (e.kind === 'gunship' ? 0.18 : 0.32); e.pos = [this.mid[0] + Math.cos(e.ang) * e.orbit, this.mid[1] + e.alt, this.mid[2] + Math.sin(e.ang) * e.orbit]; e.yaw = -e.ang; }
        e.fireT -= dt;
        if (e.fireT > 0) continue;
        // target: the nearest visible enemy not hidden by DO NOT TRACK or smoke
        let best = null, bd = e.range;
        for (const q of this.players.values()) {
          if (!q.alive || !this.hostile(owner, q) || q.perks.has('donottrack') || q.protect > this.now) continue;
          const d = Math.hypot(q.pos[0] - e.pos[0], q.pos[1] + 1 - e.pos[1], q.pos[2] - e.pos[2]);
          if (d > bd || !this.world.los(e.pos[0], e.pos[1], e.pos[2], q.pos[0], q.pos[1] + 1.1, q.pos[2]) || this.smoked(e.pos[0], e.pos[1], e.pos[2], q.pos[0], q.pos[1] + 1.1, q.pos[2])) continue;
          best = q; bd = d;
        }
        e.fireT = e.rate;
        if (!best) continue;
        const aim = norm3([best.pos[0] - e.pos[0], best.pos[1] + 1.0 - e.pos[1], best.pos[2] - e.pos[2]]);
        e.yaw = Math.atan2(-aim[0], -aim[2]);
        const d = jitter(aim, e.err, this.rnd);
        this.all({ e: 'efire', id: e.id, x: r2(best.pos[0]), y: r2(best.pos[1] + 1), z: r2(best.pos[2]) });
        if (e.splash) {
          const hit = this.world.raycast(e.pos[0], e.pos[1], e.pos[2], d[0], d[1], d[2], bd + 4);
          const t = hit ? hit.t : bd; const pt = [e.pos[0] + d[0] * t, e.pos[1] + d[1] * t, e.pos[2] + d[2] * t];
          this.detonate({ pos: pt, D: { radius: e.splash, dmg: e.dmg }, kind: 'gunship', gun: e.kind }, owner);
        } else this.shot(owner, e.pos, d, { id: e.kind, near: [e.dmg, 30], far: [e.dmg * 0.7, 60], head: 1.2, dmgK: 1, cls: 'ent' }, this.now);
      }
      if (this.wipe && this.now >= this.wipe.at) {
        const by = this.players.get(this.wipe.by);
        for (const q of this.players.values()) if (q.alive && by && this.hostile(by, q)) { this.kill(q, by, { w: 'wipe' }); if (!q.bot) this.send(q.id, { e: 'blackout', dur: 10 }); }
        this.call('turingWipe');
        this.wipe = null;
      }
      for (let i = this.smokes.length - 1; i >= 0; i--) if (this.now > this.smokes[i].until) this.smokes.splice(i, 1);
    }

    /* ------------------------------------------------ items: pickups, care packages, data drives, flags */
    tickItems() {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        if (!it.on) { if (it.every && this.now >= it.backAt) { it.on = true; this.all({ e: 'item', id: it.id, on: 1 }); } continue; }
        if (it.expire && this.now > it.expire) { this.items.splice(i, 1); continue; }
        if (it.landAt && this.now < it.landAt) continue;
        for (const p of this.players.values()) {
          if (!p.alive) continue;
          const d = Math.hypot(it.pos[0] - p.pos[0], it.pos[2] - p.pos[2]);
          if (d > (it.r || 1.3) || Math.abs(it.pos[1] - p.pos[1]) > 2.2) continue;
          if (this.touch(p, it)) break;
        }
      }
    }
    touch(p, it) {
      if (it.kind === 'weapon') {
        const have = p.weapons.find(w => w.id === it.gun);
        if (have) { have.res = Math.min(have.g.reserve * 2, have.res + have.g.magSize * 2); this.take(it); this.ammo(p, have); return true; }
        if (p.bot) { this.takeWeapon(p, it); return true; }
        return false;                                                // humans press USE to swap
      }
      if (it.kind === 'crate') { if (it.team !== p.team && this.mode.teams === 2) return false; if (it.streak && !p.ready.includes(it.streak)) { p.ready.push(it.streak); if (!p.bot) this.send(p.id, { e: 'streak', id: it.streak, st: 'ready' }); } this.take(it); return true; }
      if (it.kind === 'health') { if (p.hp >= p.maxHp) return false; p.hp = p.maxHp; this.take(it); return true; }
      if (it.kind === 'nades') { if (p.nades >= 3) return false; p.nades = Math.min(3, p.nades + 2); this.take(it); return true; }
      if (it.kind === 'overshield') { p.overshield = 100; p.overUntil = this.now + 30; this.take(it); this.all({ e: 'power', num: p.num, k: 'overshield' }); return true; }
      if (it.kind === 'camo') { p.camoUntil = this.now + 30; this.take(it); this.all({ e: 'power', num: p.num, k: 'camo' }); return true; }
      return this.modeTouch(p, it);
    }
    take(it) {
      if (it.once) { const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1); this.all({ e: 'item', id: it.id, gone: 1 }); return; }
      it.on = false; it.backAt = this.now + (it.every || 30); this.all({ e: 'item', id: it.id, on: 0 });
    }
    takeWeapon(p, it) {
      const g = gunStats(it.gun, this.playlist, [], it.tier || 0);
      const w = { id: it.gun, g, mag: g.magSize, res: g.reserve, next: 0, reloadAt: 0, burstLeft: 0, att: [] };
      const slot = p.weapons.length < 2 ? p.weapons.length : p.cur;
      const old = p.weapons[slot];
      p.weapons[slot] = w; p.cur = slot;
      this.take(it);
      if (old && !old.g.melee && this.playlist === 'classic' && !it.once) {
        this.items.push({ id: this.nextEnt++, kind: 'weapon', gun: old.id, tier: old.g.tier, pos: p.pos.slice(), on: true, once: true, expire: this.now + 30 });
      }
      p.loadout = { ...p.loadout, guns: p.weapons.map(x => [x.id, x.g.tier, x.att]) };
      if (!p.bot) this.send(p.id, { e: 'weapons', guns: p.loadout.guns, cur: p.cur, mag: p.weapons.map(x => x.mag), res: p.weapons.map(x => x.res) });
    }
    placeClassicItems() {
      const spots = this.itemSpots;
      PVP.CLASSIC_PICKUPS.forEach((d, i) => {
        const s = spots[i % spots.length]; if (!s) return;
        const off = i >= spots.length ? 2.5 : 0;
        this.items.push({ id: this.nextEnt++, kind: d.kind, gun: d.gun, tier: d.tier, pos: [s[0] + off, s[1], s[2]], on: true, every: d.every, name: d.name });
      });
    }

    /* ------------------------------------------------ modes */
    modeInit() {
      const M = this.mode;
      if (M.id === 'dom') this.domFlags = this.flags.map((f, i) => ({ id: 'ABC'[i], pos: f, owner: -1, prog: 0, cap: -1, scoreT: 0 }));
      if (M.id === 'hardpoint') { this.hill = { i: 0, pos: this.hills[0], moveAt: M.hillTime, owner: -1, tickT: 0 }; }
      if (M.id === 'ctf') this.ctf = [0, 1].map(t => ({ team: t, home: this.base[t], pos: this.base[t].slice(), carrier: null, droppedAt: 0, atHome: true }));
      if (M.id === 'hottake') this.ball = { pos: this.mid.slice(), carrier: null, droppedAt: -99, home: this.mid.slice(), tickT: 0 };
      if (M.id === 'snd') this.snd = { attack: 0, sites: this.flags.slice(0, 2).length ? [this.flags[0], this.flags[2] || this.flags[1]] : [this.mid, this.mid], bomb: null, carrier: null, planted: null, roundOver: false };
      if (this.playlist === 'classic') this.placeClassicItems();
    }
    start() { this.state = 'pregame'; }
    goLive() {
      this.state = 'live'; this.liveAt = this.now;
      this.call('start');
      if (this.mode.rounds) this.startRound();
      if (this.mode.id === 'influencer') this.influencerT = this.now + 8;
    }
    startRound() {
      const M = this.mode;
      this.round++;
      this.roundStart = this.now; this.roundLeft = M.roundTime;
      if (M.id === 'snd') {
        if (this.round === Math.ceil(M.limit) ) this.swapped = !this.swapped;              // halftime: sides swap after 5 rounds
        this.snd.attack = this.swapped ? 1 : 0;
        this.snd.planted = null; this.snd.roundOver = false; this.snd.carrier = null;
        const base = this.base[this.sideFor({ team: this.snd.attack })];
        this.snd.bomb = { pos: base.slice(), carrier: null };
        for (const p of this.players.values()) { p.alive = false; p.respawnAt = this.now + 0.1; }
      }
      if (M.id === 'infection') {
        this.infectionStarted = false; this.infectAt = this.now + 10;
        for (const p of this.players.values()) { p.infected = false; p.team = 0; p.alive = false; p.respawnAt = this.now + 0.1; }
      }
      this.all({ e: 'round', n: this.round, wins: this.roundWins.slice(), attack: this.snd?.attack ?? -1 });
    }
    endRound(winner, why) {
      if (this.roundEnding) return;
      this.roundEnding = true;
      if (winner >= 0) this.roundWins[winner]++;
      this.teamScore = this.roundWins.slice();
      this.all({ e: 'roundEnd', winner, why, wins: this.roundWins.slice() });
      if (this.mode.id === 'infection') for (const p of this.players.values()) if (p.alive && !p.infected) this.award(p, 'survive', PVP.POINTS.survive);
      const need = this.mode.id === 'snd' ? this.limit : Math.ceil(this.limit / 2 + 0.01);
      if (this.roundWins[0] >= need || this.roundWins[1] >= need || this.mode.id === 'infection' && this.round >= this.limit) { this.finish(this.roundWins[0] === this.roundWins[1] ? -1 : this.roundWins[0] > this.roundWins[1] ? 0 : 1); return; }
      this.nextRoundAt = this.now + 5;
    }
    modeTick(dt) {
      const M = this.mode, alive = [...this.players.values()].filter(p => p.alive);
      if (M.id === 'dom') {
        for (const f of this.domFlags) {
          const on = [0, 0];
          for (const p of alive) if (Math.hypot(p.pos[0] - f.pos[0], p.pos[2] - f.pos[2]) < 4.2 && Math.abs(p.pos[1] - f.pos[1]) < 3) on[p.team]++;
          f.contested = on[0] > 0 && on[1] > 0;
          if (!f.contested && (on[0] || on[1])) {
            const t = on[0] ? 0 : 1, n = on[t], rate = (1 + Math.min(1, (n - 1) * 0.5)) / 10;            // 10 s alone, up to 2x faster with company
            if (f.owner !== t) {
              f.prog += (t === 0 ? -1 : 1) * rate * dt * (f.owner === -1 ? 1 : 1);
              if (f.prog <= -1 || f.prog >= 1) {
                f.owner = t; f.prog = t === 0 ? -1 : 1;
                for (const p of alive) if (p.team === t && Math.hypot(p.pos[0] - f.pos[0], p.pos[2] - f.pos[2]) < 4.5) { this.award(p, 'capture', PVP.POINTS.capture); p.obj += 10; }
                this.call('capture', { T: PVP.TEAM_NAMES[t], F: f.id });
                this.all({ e: 'obj', k: 'flag', id: f.id, owner: t });
              }
            }
          }
          if (!f.contested && !on[0] && !on[1] && f.owner >= 0) f.prog = f.owner === 0 ? -1 : 1;
          for (const p of alive) if (Math.hypot(p.pos[0] - f.pos[0], p.pos[2] - f.pos[2]) < 4.2 && p.team === f.owner) p.obj += dt;
        }
        this.domT = (this.domT || 0) + dt;
        if (this.domT >= 5) { this.domT -= 5; for (const f of this.domFlags) if (f.owner >= 0) this.teamScore[f.owner]++; this.lead(); }
        if (M.halftime && !this.halfDone && this.now - this.liveAt >= M.halftime) { this.halfDone = true; this.swapped = true; this.all({ e: 'obj', k: 'halftime' }); }
      }
      if (M.id === 'hardpoint') {
        const h = this.hill;
        if (this.now - this.liveAt >= h.moveAt) { h.i = (h.i + 1) % this.hills.length; h.pos = this.hills[h.i]; h.moveAt += M.hillTime; this.call('hill'); this.all({ e: 'obj', k: 'hill', i: h.i }); }
        const on = [0, 0]; for (const p of alive) if (Math.hypot(p.pos[0] - h.pos[0], p.pos[2] - h.pos[2]) < 5 && Math.abs(p.pos[1] - h.pos[1]) < 3) on[p.team]++;
        h.owner = on[0] && !on[1] ? 0 : on[1] && !on[0] ? 1 : on[0] && on[1] ? -2 : -1;
        h.tickT += dt;
        if (h.tickT >= 1) { h.tickT -= 1; if (h.owner >= 0) { this.teamScore[h.owner]++; for (const p of alive) if (p.team === h.owner && Math.hypot(p.pos[0] - h.pos[0], p.pos[2] - h.pos[2]) < 5) { this.award(p, 'hill', PVP.POINTS.hillSec); p.obj += 1; } this.lead(); } }
      }
      if (M.id === 'ctf') {
        for (const f of this.ctf) {
          if (f.carrier) { const c = this.players.get(f.carrier); if (c && c.alive) f.pos = c.pos.slice(); else { f.carrier = null; f.droppedAt = this.now; } }
          else if (!f.atHome && this.now - f.droppedAt > M.flagReturn) { f.pos = f.home.slice(); f.atHome = true; this.all({ e: 'obj', k: 'flagReturn', team: f.team }); }
          for (const p of alive) {
            if (Math.hypot(p.pos[0] - f.pos[0], p.pos[2] - f.pos[2]) > 1.6 || Math.abs(p.pos[1] - f.pos[1]) > 2.5 || f.carrier) continue;
            if (p.team !== f.team && !p.carry) { f.carrier = p.id; f.atHome = false; p.carry = 'flag'; this.award(p, 'flagTake', PVP.POINTS.flagTake); this.call('flagTaken', { T: PVP.TEAM_NAMES[p.team] }); this.all({ e: 'obj', k: 'flagTaken', team: f.team, by: p.num }); }
            else if (p.team === f.team && !f.atHome) { f.pos = f.home.slice(); f.atHome = true; this.award(p, 'flagReturn', PVP.POINTS.flagReturn); this.all({ e: 'obj', k: 'flagReturn', team: f.team, by: p.num }); }
          }
        }
        for (const f of this.ctf) {
          if (!f.carrier) continue;
          const c = this.players.get(f.carrier), mine = this.ctf[c.team];
          if (mine.atHome && Math.hypot(c.pos[0] - mine.home[0], c.pos[2] - mine.home[2]) < 2.5) {
            this.teamScore[c.team]++; c.obj += 30; this.award(c, 'flagCap', PVP.POINTS.flagCap); c.carry = null;
            f.carrier = null; f.pos = f.home.slice(); f.atHome = true;
            this.call('flagCap', { T: PVP.TEAM_NAMES[c.team] }); this.all({ e: 'obj', k: 'flagCap', team: c.team, by: c.num }); this.lead();
          }
        }
      }
      if (M.id === 'hottake') {
        const b = this.ball;
        if (b.carrier) {
          const c = this.players.get(b.carrier);
          if (!c || !c.alive) { b.carrier = null; b.droppedAt = this.now; }
          else { b.pos = c.pos.slice(); b.tickT += dt; if (b.tickT >= 1) { b.tickT -= 1; this.teamScore[c.team]++; c.obj++; this.award(c, 'ball', PVP.POINTS.ballSec); this.lead(); } }
        } else {
          if (this.now - b.droppedAt > M.ballReset && Math.hypot(b.pos[0] - b.home[0], b.pos[2] - b.home[2]) > 1) { b.pos = b.home.slice(); this.all({ e: 'obj', k: 'ballReset' }); }
          for (const p of alive) if (Math.hypot(p.pos[0] - b.pos[0], p.pos[2] - b.pos[2]) < 1.4 && Math.abs(p.pos[1] - b.pos[1]) < 2.5) { b.carrier = p.id; p.carry = 'ball'; this.all({ e: 'obj', k: 'ball', by: p.num }); break; }
        }
      }
      if (M.id === 'harvest') for (const it of this.items) if (it.kind === 'drive' && this.now > it.expire) it.on = false;
      if (M.id === 'snd' && !this.roundEnding) this.sndTick(dt, alive);
      if (M.id === 'infection' && !this.roundEnding) {
        if (!this.infectionStarted && this.now >= this.infectAt) {
          const pool = alive.length ? alive : [...this.players.values()];
          const z = pool[Math.floor(this.rnd() * pool.length)];
          if (z) { this.infect(z, null); this.infectionStarted = true; this.patientZero = z.id; }
        }
        this.roundLeft -= dt;
        const surv = [...this.players.values()].filter(p => !p.infected);
        if (this.infectionStarted) {
          if (!surv.length) this.endRound(1, 'all_infected');
          else if (this.roundLeft <= 0) this.endRound(0, 'survived');
          else if (surv.length === 1 && !this.lastCalled) { this.lastCalled = true; this.call('lastSurvivor'); }
        }
      }
      if (M.id === 'influencer') {
        const j = [...this.players.values()].find(p => p.jugg);
        if (!j && this.now >= (this.influencerT || 0)) {
          const pool = alive.length ? alive : [];
          const pick = pool[Math.floor(this.rnd() * pool.length)];
          if (pick) this.makeInfluencer(pick);
        }
        if (j && j.alive) { this.juggT = (this.juggT || 0) + dt; if (this.juggT >= 1) { this.juggT -= 1; j.ipts = (j.ipts || 0) + 1; j.score += 10; j.obj += 1; this.lead(); } }
      }
    }
    sndTick(dt, alive) {
      const S = this.snd, M = this.mode, att = S.attack, def = 1 - att;
      this.roundLeft -= dt;
      const aliveTeam = t => alive.filter(p => p.team === t).length;
      if (this.now - this.roundStart > 1) {
        if (!S.planted && aliveTeam(att) === 0) return this.endRound(def, 'eliminated');
        if (aliveTeam(def) === 0 && !S.planted) return this.endRound(att, 'eliminated');
        if (S.planted && aliveTeam(def) === 0) return this.endRound(att, 'eliminated');
      }
      if (!S.planted && this.roundLeft <= 0) return this.endRound(def, 'time');
      // the charge: carried by an attacker, dropped on death
      if (!S.planted) {
        if (S.bomb.carrier) { const c = this.players.get(S.bomb.carrier); if (!c || !c.alive) { S.bomb.carrier = null; } else S.bomb.pos = c.pos.slice(); }
        else for (const p of alive) if (p.team === att && Math.hypot(p.pos[0] - S.bomb.pos[0], p.pos[2] - S.bomb.pos[2]) < 1.4) { S.bomb.carrier = p.id; p.carry = 'bomb'; break; }
        const c = S.bomb.carrier && this.players.get(S.bomb.carrier);
        if (c) {
          const site = S.sites.findIndex(s => Math.hypot(c.pos[0] - s[0], c.pos[2] - s[2]) < 3.2);
          const holding = site >= 0 && (c.bot ? true : (c.fl & 32));
          c.useHold = holding ? c.useHold + dt : 0;
          if (c.useHold >= M.plantTime) {
            S.planted = { site, pos: S.sites[site].slice(), at: this.now, boomAt: this.now + M.fuse, defuse: 0 };
            S.bomb.carrier = null; c.carry = null; c.useHold = 0; this.award(c, 'plant', PVP.POINTS.plant); c.obj += 20;
            this.call('planted'); this.all({ e: 'obj', k: 'planted', site });
          }
        }
      } else {
        const P = S.planted;
        let defuser = null;
        for (const p of alive) if (p.team === def && Math.hypot(p.pos[0] - P.pos[0], p.pos[2] - P.pos[2]) < 2.2 && (p.bot || p.fl & 32)) { defuser = p; break; }
        P.defuse = defuser ? P.defuse + dt : 0;
        if (defuser && P.defuse >= M.defuseTime) { this.award(defuser, 'defuse', PVP.POINTS.defuse); defuser.obj += 20; this.call('defused'); this.all({ e: 'obj', k: 'defused' }); return this.endRound(def, 'defused'); }
        if (this.now >= P.boomAt) {
          this.detonate({ pos: P.pos, D: { radius: 12, dmg: 400 }, kind: 'charge', gun: 'charge' }, null);
          return this.endRound(att, 'detonated');
        }
      }
    }
    infect(p, by) {
      p.infected = true; p.team = 1;
      if (p.alive) { p.alive = false; p.respawnAt = this.now + 1; }
      this.call('infected', { N: p.name });
      this.all({ e: 'obj', k: 'infected', num: p.num });
      if (by) { this.award(by, 'infect', PVP.POINTS.infect); by.obj += 5; }
    }
    makeInfluencer(p) {
      for (const q of this.players.values()) q.jugg = false;
      p.jugg = true; this.call('influencer', { N: p.name }); this.all({ e: 'obj', k: 'influencer', num: p.num });
      if (p.alive) { const keep = p.pos.slice(); p.alive = true; this.buildLoadout(p); p.maxHp = 400; p.hp = 400; p.shield = 0; p.maxShield = 0; p.pos = keep;
        this.send(p.id, { e: 'spawn', x: r2(p.pos[0]), y: r2(p.pos[1]), z: r2(p.pos[2]), yaw: r2(p.yaw), loadout: p.loadout, hp: p.maxHp, sh: 0, prof: 'core', keep: 1 }); }
    }
    modeKill(q, by, info) {
      const M = this.mode;
      if (M.teams === 2 && by && this.hostile(by, q) && ['tdm', 'slayer'].includes(M.id)) this.teamScore[by.team]++;
      if (M.id === 'dom' && by && this.domFlags) for (const f of this.domFlags) if (f.owner === by.team && Math.hypot(q.pos[0] - f.pos[0], q.pos[2] - f.pos[2]) < 9) { this.award(by, 'defend', PVP.POINTS.defend); break; }
      if (M.id === 'harvest') this.items.push({ id: this.nextEnt++, kind: 'drive', team: q.team, pos: [q.pos[0], q.pos[1] + 0.3, q.pos[2]], on: true, once: true, expire: this.now + 30, victim: q.num });
      if (M.id === 'gungame' && by && this.hostile(by, q)) {
        if (info.w === 'melee' || info.w === 'knife') { if (q.gunIdx > 0) q.gunIdx--; }
        if (info.w === PVP.GUNGAME[by.gunIdx] || info.w === 'knife' && PVP.GUNGAME[by.gunIdx] === 'knife') {
          by.gunIdx++;
          if (by.gunIdx >= PVP.GUNGAME.length) { by.gunIdx = PVP.GUNGAME.length - 1; return this.finish(by.team, by); }
          const keep = by.pos.slice(); this.buildLoadout(by); by.pos = keep;
          if (!by.bot) this.send(by.id, { e: 'weapons', guns: by.loadout.guns, cur: 0, mag: by.weapons.map(x => x.mag), res: by.weapons.map(x => x.res) });
        }
      }
      if (M.id === 'infection' && this.infectionStarted && !q.infected) this.infect(q, by && by.infected ? by : null);
      if (M.id === 'influencer') {
        if (q.jugg && by) { by.ipts = (by.ipts || 0) + 10; this.makeInfluencer(by); }
        else if (by && by.jugg) { by.ipts = (by.ipts || 0) + 5; }
        if (q.jugg && !by) { q.jugg = false; this.influencerT = this.now + 5; }
      }
    }
    modeTouch(p, it) {
      if (it.kind === 'drive') {
        if (p.team !== it.team) { this.teamScore[p.team]++; this.award(p, 'harvest', PVP.POINTS.harvest); p.obj += 5; this.all({ e: 'obj', k: 'harvest', by: p.num, team: p.team }); this.lead(); }
        else { this.award(p, 'deny', PVP.POINTS.deny); p.obj += 2; this.all({ e: 'obj', k: 'deny', by: p.num }); }
        this.take(it); return true;
      }
      return false;
    }
    dropCarried(p) {
      if (p.carry === 'flag' && this.ctf) for (const f of this.ctf) if (f.carrier === p.id) { f.carrier = null; f.droppedAt = this.now; f.pos = p.pos.slice(); this.all({ e: 'obj', k: 'flagDrop', team: f.team }); }
      if (p.carry === 'ball' && this.ball) { this.ball.carrier = null; this.ball.droppedAt = this.now; this.ball.pos = p.pos.slice(); }
      if (p.carry === 'bomb' && this.snd) { this.snd.bomb.carrier = null; this.snd.bomb.pos = p.pos.slice(); }
      p.carry = null;
    }
    scoreOf(p) { return this.mode.teams === 2 ? this.teamScore[p.team] : this.mode.id === 'gungame' ? p.gunIdx : this.mode.id === 'influencer' ? (p.ipts || 0) : p.kills; }
    leaderInfo() {
      if (this.mode.teams === 2) { const s = this.teamScore; return { lead: s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1, top: Math.max(...s) }; }
      let best = null; for (const p of this.players.values()) if (!best || this.scoreOf(p) > this.scoreOf(best)) best = p;
      return { lead: best ? best.team : -1, top: best ? this.scoreOf(best) : 0, best };
    }
    lead() {
      if (this.state !== 'live' || this.mode.rounds) return;
      const L = this.leaderInfo();
      if (L.lead >= 0 && L.lead !== this.lastLeader && this.mode.teams === 2) { if (this.lastLeader !== -1) this.call('lead', { T: PVP.TEAM_NAMES[L.lead] }); this.lastLeader = L.lead; }
      if (L.top >= this.limit) this.finish(L.lead, L.best);
    }

    /* ------------------------------------------------ the end */
    finish(winnerTeam, winnerPlayer) {
      if (this.state === 'over') return;
      this.state = 'over'; this.overAt = this.now;
      const M = this.mode;
      if (M.teams !== 2 && !winnerPlayer) winnerPlayer = this.leaderInfo().best;
      const humans = [...this.players.values()].filter(p => !p.bot).length;
      const list = [...this.players.values()].filter(p => !p.noScore);
      const won = p => (M.teams === 2 ? p.team === winnerTeam : winnerPlayer && p.id === winnerPlayer.id);
      // commendations: each goes to the player who leads its stat; a player keeps at most 3
      const lead = (f) => { let b = null, bv = 0; for (const p of list) { const v = f(p); if (v > bv) { bv = v; b = p; } } return b; };
      const comm = new Map();
      const give = (p, id) => { if (!p) return; const a = comm.get(p.id) || []; if (a.length < 3) { a.push(id); comm.set(p.id, a); } };
      give(lead(p => p.score), 'main');
      give(lead(p => p.longs * 2 + (p.best >= 3 ? p.best : 0)), 'clipped');
      give(lead(p => (p.kills + 1) / (p.deaths + 1) * (p.kills >= 3 ? 1 : 0)), 'ratio');
      give(lead(p => p.obj), 'farmer');
      give(lead(p => p.couch), 'couch');
      give(lead(p => p.streakEnds), 'collector');
      const rows = list.map(p => ({ num: p.num, name: p.name, team: p.team, bot: !!p.bot, kills: p.kills, deaths: p.deaths, assists: p.assists, score: p.score, obj: Math.round(p.obj), best: p.best,
        heads: p.heads, comm: comm.get(p.id) || [], won: !!won(p), look: p.look })).sort((a, b) => b.score - a.score);
      const res = { mode: M.id, map: this.mapId, winnerTeam: M.teams === 2 ? winnerTeam : -1, winner: winnerPlayer?.num || 0, teamScore: this.teamScore.slice(), rows, duration: Math.round(this.now - (this.liveAt || 0)) };
      this.all({ e: 'end', res });
      this.call(M.teams === 2 ? 'win' : 'win', { T: M.teams === 2 ? (winnerTeam >= 0 ? PVP.TEAM_NAMES[winnerTeam] : 'NOBODY') : (winnerPlayer?.name || 'NOBODY') });
      // personal rewards (the client applies the daily GigaTech cap and keeps the progression)
      for (const p of this.players.values()) {
        if (p.bot) continue;
        const played = clamp((this.now - Math.max(this.liveAt || 0, p.joinedAt)) / Math.max(60, this.now - (this.liveAt || 0)), 0.1, 1);
        const w = !!won(p), c = comm.get(p.id) || [];
        const custom = !!this.opts.customGame;
        const solo = humans <= 1;
        let xp = p.score + PVP.XP.finish * played + (w ? PVP.XP.win : 0);
        let drip = (w ? PVP.DRIP.win : PVP.DRIP.loss) * played + c.length * PVP.DRIP.perCommendation;
        let gt = Math.min(PVP.GT.maxPerMatch, (w ? PVP.GT.win : PVP.GT.loss) * played + p.kills * PVP.GT.perKill);
        if (solo) { xp *= PVP.BOTS_ONLY.xp; drip *= PVP.BOTS_ONLY.drip; gt *= PVP.BOTS_ONLY.gt; }
        if (custom) { xp = 0; gt = 0; drip = 0; }
        if (M.playlist === 'party') gt = 0;
        const wstats = {}; for (const [k, v] of Object.entries(p.wstats)) if (PVP.GUNS[k]) wstats[k] = Object.assign({}, v, { xp: v.kills * 100 + v.heads * 25 });
        this.send(p.id, { e: 'reward', xp: Math.round(xp), drip: Math.round(drip), gt: Math.round(gt), won: w, comm: c, wstats, solo, custom, kills: p.kills, deaths: p.deaths, score: p.score,
          bestStreak: p.best, revivals: p.deaths });
      }
    }

    /* ------------------------------------------------ the frame */
    tick(dt = TICK) {
      this.now += dt; this.tickN++;
      if (this.state === 'pregame') { this.stateT -= dt; if (this.stateT <= 0) this.goLive(); }
      if (this.state === 'over') return;
      if (this.state === 'live' && this.timeLeft > 0 && !this.mode.rounds) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 60 && !this.minuteCalled) { this.minuteCalled = true; this.call('minute'); }
        if (this.timeLeft <= 0) { const L = this.leaderInfo(); return this.finish(L.lead, L.best); }
      }
      if (this.roundEnding && this.now >= (this.nextRoundAt || Infinity)) { this.roundEnding = false; this.lastCalled = false; this.startRound(); }
      for (const p of [...this.players.values()]) {
        if (!p.connected && !p.bot && this.now - (p.leftAt || 0) > 60) { this.remove(p.id); continue; }          // a 60 s reconnect window, then the slot goes
        if (p.collab && this.now > p.collab.until) { this.remove(p.id); continue; }
        if (!p.alive) { if (this.now >= p.respawnAt && (p.connected || p.bot || this.now - (p.leftAt || 0) < 60)) this.spawn(p); continue; }
        // health: core regenerates after a delay; Classic Arena recharges shields
        const hm = this.health;
        if (hm.regenDelay && this.now - p.hurtAt > hm.regenDelay && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp / hm.regenTime * dt);
        if (hm.shieldDelay && this.now - p.hurtAt > hm.shieldDelay && p.shield < p.maxShield) p.shield = Math.min(p.maxShield, p.shield + p.maxShield / hm.shieldTime * dt);
        if (p.overshield > 0 && this.now > (p.overUntil || 0)) p.overshield = 0;
        for (const w of p.weapons) if (w.pendingReload && this.now >= w.reloadAt) {
          w.pendingReload = false;
          const need = w.g.magSize - w.mag, take = Math.min(need, w.res); w.mag += take; w.res -= take;
        }
        // the couch: time crouched in one spot
        if (p.fl & 1 || p.bot && p.bot.camp) { if (!p.couchSpot || Math.hypot(p.pos[0] - p.couchSpot[0], p.pos[2] - p.couchSpot[1]) > 1.5) p.couchSpot = [p.pos[0], p.pos[2]]; else p.couch += dt; }
        if (p.bot) this.botTick(p, dt);
        p.hist.push([this.now, p.pos[0], p.pos[1], p.pos[2], p.fl & 1]);
        if (p.hist.length > HIST) p.hist.shift();
      }
      if (this.state === 'live' || !this.mode.rounds) { this.tickProj(dt); this.tickEnts(dt); this.tickItems(); }
      if (this.state === 'live') this.modeTick(dt);
      if (this.tickN % 60 === 0) this.all({ e: 'board', r: this.roster().map(x => [x.num, x.kills, x.deaths, x.assists, x.score, x.team]) });
    }

    /* ------------------------------------------------ snapshots */
    snapshot(forId) {
      const me = this.players.get(forId);
      const pingTeam = this.pingUntil && Object.entries(this.pingUntil).filter(([, t]) => t > this.now).map(([k]) => +k);
      const pl = [];
      for (const p of this.players.values()) {
        let f = 0;
        if (p.alive) f |= 1; if (p.fl & 1) f |= 2; if (p.fl & 2) f |= 4; if (p.fl & 4) f |= 8; if (p.fl & 8) f |= 16; if (p.fl & 16 || p.bot) f |= 32;
        if (this.now - (p.firedAt || -9) < 0.2) f |= 64; if (p.camoUntil > this.now) f |= 128; if (p.jugg) f |= 256; if (p.carry) f |= 512; if (p.infected) f |= 1024;
        if (p.weapons[p.cur]?.g.mods?.laser) f |= 2048; if (p.protect > this.now) f |= 4096; if (p.perks.has('noisecancel')) f |= 8192;
        // on my radar: a teammate, an enemy who fired loud, an Oracular ping, a cookie, the Influencer, a carrier
        let radar = 0;
        if (me && p !== me) {
          const jammed = me.jamUntil > this.now;
          if (!this.hostile(me, p)) radar = 1;
          else if (!jammed && (this.now - (p.loudAt || -9) < 1.2 || pingTeam?.includes(me.team) && !p.perks.has('donottrack') || p.revealUntil > this.now && p.revealTeam === me.team || p.jugg || p.carry)) radar = 2;
        }
        const w = p.weapons[p.cur];
        pl.push([p.num, r2(p.pos[0]), r2(p.pos[1]), r2(p.pos[2]), r2(p.yaw), r2(p.pitch), f, Math.round(Math.max(0, p.hp) / p.maxHp * 100), w ? wcode(w.id) : 0, p.team, radar, w?.g.tier || 0,
          Math.round((p.shield + p.overshield) / Math.max(1, p.maxShield || 1) * 100)]);
      }
      const snap = { e: 'snap', t: r2(this.now), st: this.state, pg: this.state === 'pregame' ? r2(this.stateT) : 0, tl: Math.max(0, Math.round(this.mode.rounds ? (this.roundLeft || 0) : this.timeLeft)), ts: this.teamScore, pl,
        pr: this.proj.map(p => [p.id, p.kind, r2(p.pos[0]), r2(p.pos[1]), r2(p.pos[2]), this.players.get(p.owner)?.num || 0]),
        en: this.ents.map(e => [e.id, e.kind, r2(e.pos[0]), r2(e.pos[1]), r2(e.pos[2]), r2(e.yaw || 0), e.team, Math.round(e.hp / e.maxHp * 100)]),
        it: this.items.filter(i => i.on).map(i => [i.id, i.kind, r2(i.pos[0]), r2(i.pos[1]), r2(i.pos[2]), i.gun || i.streak || '', i.tier || 0, i.team ?? -1]),
        sm: this.smokes.map(s => [r2(s.pos[0]), r2(s.pos[1]), r2(s.pos[2]), s.r]),
        ob: this.objState() };
      if (me) {
        snap.me = { hp: Math.max(0, Math.round(me.hp)), sh: Math.round(me.shield + me.overshield), msh: me.maxShield, mhp: me.maxHp, sp: me.streakPts, rd: me.ready, n: me.nades, tc: me.tacs,
          k: me.kills, d: me.deaths, s: me.score, gi: me.gunIdx, rs: me.alive ? 0 : Math.max(0, r2(me.respawnAt - this.now)), jam: me.jamUntil > this.now ? 1 : 0, uh: r2(me.useHold),
          am: me.weapons.map(w => [w.mag, w.res, w.reloadAt > this.now ? 1 : 0]) };
      }
      return snap;
    }
    objState() {
      const M = this.mode;
      if (M.id === 'dom') return { k: 'dom', f: this.domFlags.map(f => [f.id, r2(f.pos[0]), r2(f.pos[1]), r2(f.pos[2]), f.owner, r2(f.prog), f.contested ? 1 : 0]), sw: this.swapped ? 1 : 0 };
      if (M.id === 'hardpoint') return { k: 'hill', p: this.hill.pos.map(r2), o: this.hill.owner, mv: Math.max(0, Math.round(this.hill.moveAt - (this.now - (this.liveAt || 0)))) };
      if (M.id === 'ctf') return { k: 'ctf', f: this.ctf.map(f => [f.team, r2(f.pos[0]), r2(f.pos[1]), r2(f.pos[2]), f.atHome ? 1 : 0, this.players.get(f.carrier)?.num || 0]), h: this.ctf.map(f => f.home.map(r2)) };
      if (M.id === 'hottake') return { k: 'ball', p: this.ball.pos.map(r2), c: this.players.get(this.ball.carrier)?.num || 0 };
      if (M.id === 'snd') { const S = this.snd; return { k: 'snd', att: S.attack, sites: S.sites.map(s => s.map(r2)), bomb: S.bomb ? S.bomb.pos.map(r2) : null, bc: this.players.get(S.bomb?.carrier)?.num || 0,
        pl: S.planted ? { site: S.planted.site, left: r2(S.planted.boomAt - this.now), df: r2(S.planted.defuse) } : null, rw: this.roundWins, r: this.round }; }
      if (M.id === 'infection') return { k: 'inf', started: this.infectionStarted ? 1 : 0, r: this.round, rw: this.roundWins, surv: [...this.players.values()].filter(p => !p.infected).length };
      if (M.id === 'influencer') return { k: 'jugg', num: [...this.players.values()].find(p => p.jugg)?.num || 0 };
      if (M.id === 'gungame') return { k: 'gg', top: Math.max(0, ...[...this.players.values()].map(p => p.gunIdx)) };
      return null;
    }
    roster() { return [...this.players.values()].map(p => ({ num: p.num, name: p.name, team: p.team, bot: !!p.bot, look: p.look, input: p.input, kills: p.kills, deaths: p.deaths, assists: p.assists, score: p.score, gunIdx: p.gunIdx, connected: p.connected })); }

    /* ================================================================== BOTS
     * Bots walk the map's nav graph (A*), pick targets they can actually see (or hear, or that shot them), take a
     * reaction time to start shooting, aim with a skill-based error that shrinks while they track, fire in bursts, and
     * go after the mode's objective. They use the same guns and the same hit tests as players. */
    botReset(p) { p.bot.path = null; p.bot.pi = 0; p.bot.repath = 0; p.bot.target = null; p.bot.seen = 0; p.bot.track = 0; p.bot.burstT = 0; p.bot.pauseT = 0; p.bot.strafe = 0; p.bot.strafeT = 0; p.bot.nadeT = 8 + this.rnd() * 10; p.bot.goal = null; p.bot.thinkT = 0; p.bot.stuck = 0; p.bot.camp = false; p.bot.campSpot = null; }
    botAlert(p, by) { if (!p.bot.target || p.bot.target.id !== by.id) { p.bot.alertBy = by.id; p.bot.alertT = this.now; } }
    botTick(p, dt) {
      const B = p.bot, sk = B.skill, W = this.world;
      if (this.state === 'pregame' && this.mode.rounds) return;
      const flashed = p.flashUntil > this.now, stunned = p.stunUntil > this.now;
      B.thinkT -= dt;
      if (B.thinkT <= 0) { B.thinkT = 0.15 + this.rnd() * 0.08; this.botThink(p); }
      // streaks: use them as soon as they are ready
      if (p.ready.length) this.useStreak(p, p.ready.shift());
      const T = B.target && this.players.get(B.target);
      const eye = this.eye(p);
      // move
      let speed = (this.playlist === 'classic' ? 6.0 : 5.4) * (p.infected ? 1.25 : p.jugg ? 0.8 : 1) * (stunned ? 0.5 : 1);
      let goal = B.goal;
      if (T && T.alive) {
        const dx = T.pos[0] - p.pos[0], dz = T.pos[2] - p.pos[2], d = Math.hypot(dx, dz);
        const w = p.weapons[p.cur], want = p.infected || w?.g.melee ? 0.8 : w?.g.cls === 'shotgun' ? 5 : w?.g.cls === 'smg' ? 10 : w?.g.cls === 'sniper' ? 35 : 18;
        const objMode = ['dom', 'hardpoint', 'ctf', 'snd'].includes(this.mode.id);
        if (B.grab || p.carry && this.mode.id !== 'hottake' || objMode && B.objGoal && d > 10 && p.num % 4 !== 0) { if (B.objGoal && !B.grab && !p.carry) goal = B.objGoal; /* objective first: keep walking, shoot on the way */ }
        else if (B.seen > 0.05) {
          if (d > want * 1.4 || p.infected) goal = T.pos;
          else { goal = null; B.strafeT -= dt; if (B.strafeT <= 0) { B.strafeT = 0.5 + this.rnd() * 1.2; B.strafe = this.rnd() < 0.5 ? -1 : 1; } speed *= 0.75; }
        } else goal = T.pos;
        p.yaw = this.turn(p.yaw, Math.atan2(-dx, -dz), dt * (4 + sk.track * 6));
      }
      if (B.camp && B.campSpot && !T) goal = Math.hypot(p.pos[0] - B.campSpot[0], p.pos[2] - B.campSpot[2]) > 1.5 ? B.campSpot : null;
      let mvx = 0, mvz = 0;
      if (goal) {
        if (!B.path || this.now > B.repath || !B.goalAt || Math.hypot(goal[0] - B.goalAt[0], goal[2] - B.goalAt[2]) > 4) {
          const a = W.nearestNode(p.pos[0], p.pos[1] + 0.3, p.pos[2], 6), b = W.nearestNode(goal[0], goal[1] + 0.3, goal[2], 8);
          B.path = W.path(a, b) || null; B.pi = 0; B.repath = this.now + 1.5 + this.rnd() * 1.5; B.goalAt = goal.slice();
        }
        if (B.path && B.pi < B.path.length) {
          const n = W.node(B.path[B.pi]);
          const dx = n[0] - p.pos[0], dz = n[2] - p.pos[2], d = Math.hypot(dx, dz);
          if (d < 0.7 && Math.abs(n[1] - p.pos[1]) < 2.2) B.pi++;
          else { mvx = dx / d; mvz = dz / d; B.edgeT = B.pi > 0 ? W.edgeType(B.path[B.pi - 1], B.path[B.pi]) : 0; B.edgeY = n[1]; }
        } else if (Math.hypot(goal[0] - p.pos[0], goal[2] - p.pos[2]) > 0.8) { const dx = goal[0] - p.pos[0], dz = goal[2] - p.pos[2], d = Math.hypot(dx, dz); mvx = dx / d; mvz = dz / d; }
        if (!T || B.seen <= 0.05) p.yaw = this.turn(p.yaw, Math.atan2(-mvx, -mvz), dt * 6);
      }
      if (B.strafe && T && !goal) { const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw); mvx = cy * B.strafe; mvz = -sy * B.strafe; }
      const nx = p.pos[0] + mvx * speed * dt, nz = p.pos[2] + mvz * speed * dt;
      if (mvx || mvz) {
        let ny;
        if (B.edgeT && B.edgeT !== 0) ny = p.pos[1] + clamp((B.edgeY ?? p.pos[1]) - p.pos[1], -12 * dt, 9 * dt);      // jump / drop edges: arc toward the next node
        else { const f = W.floorAt(nx, nz, 0.3, p.pos[1] + 0.7); ny = Number.isFinite(f) && f > p.pos[1] - 3 ? f : p.pos[1] + clamp((B.edgeY ?? p.pos[1]) - p.pos[1], -10 * dt, 8 * dt); }
        const onPath = !!(goal && (B.path && B.pi < B.path.length || Math.hypot(goal[0] - p.pos[0], goal[2] - p.pos[2]) < 3));          // nav edges are walkable by construction: trust them
        if (onPath || B.edgeT || !W.blocked(nx, ny + 0.05, nz, R * 0.9, H)) { p.pos[0] = nx; p.pos[1] = ny; p.pos[2] = nz; B.stuck = 0; }
        else { B.stuck += dt; if (B.stuck > 0.6) { B.path = null; B.stuck = 0; if (B.path === null && B.pi === 0) B.goal = null; } }
        p.fl = 16 | (T ? 0 : 4);
      } else p.fl = 16 | (B.camp ? 1 : 0);
      // shoot
      if (T && T.alive && B.seen >= sk.react && !flashed) this.botFire(p, T, eye, dt);
      else B.track = Math.max(0, B.track - dt);
      // a grenade now and then, at someone behind cover
      B.nadeT -= dt;
      if (B.nadeT <= 0 && p.nades > 0 && B.lastSeen && this.now - B.lastSeen.t < 3 && this.now - B.lastSeen.t > 0.6) {
        B.nadeT = 14 + this.rnd() * 12;
        const L = B.lastSeen, dx = L.x - p.pos[0], dz = L.z - p.pos[2], d = Math.hypot(dx, dz);
        if (d > 7 && d < 28) { const pitch = Math.atan2(4 + d * 0.15, d); p.pitch = pitch * 0.6; p.yaw = Math.atan2(-dx, -dz); this.onNade(p.id, { d: dirFrom(p.yaw, pitch * 0.55) }, false); }
      }
      // reload when empty, or between fights
      const w = p.weapons[p.cur];
      if (w && !w.g.melee && (w.mag <= 0 || !T && w.mag < w.g.magSize * 0.4)) this.reload(p, w);
    }
    turn(a, b, k) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + clamp(d, -k, k); }
    botThink(p) {
      const B = p.bot, W = this.world, eye = this.eye(p);
      // targets: visible enemies within range and in view, anyone who just shot me, anyone loud and close
      let best = null, bs = Infinity;
      for (const q of this.players.values()) {
        if (!q.alive || !this.hostile(p, q) || q.protect > this.now) continue;
        const dx = q.pos[0] - p.pos[0], dy = q.pos[1] - p.pos[1], dz = q.pos[2] - p.pos[2], d = Math.hypot(dx, dy, dz);
        if (d > (q.camoUntil > this.now ? 8 : 75)) continue;
        const f = dirFrom(p.yaw, 0), inView = (dx * f[0] + dz * f[2]) / (Math.hypot(dx, dz) || 1) > -0.2;
        const heard = this.now - (q.loudAt || -9) < 1 && d < 35 || d < 6 || B.alertBy === q.id && this.now - B.alertT < 2.5 || q.jugg || q.carry;
        if (!inView && !heard) continue;
        const qe = this.eye(q);
        const visible = (W.los(eye[0], eye[1], eye[2], qe[0], qe[1], qe[2]) || W.los(eye[0], eye[1], eye[2], q.pos[0], q.pos[1] + 1.0, q.pos[2])) && !this.smoked(eye[0], eye[1], eye[2], q.pos[0], q.pos[1] + 1, q.pos[2]);
        if (!visible) continue;
        const sc = d - (B.target === q.id ? 12 : 0) - (q.jugg || q.carry ? 15 : 0);
        if (sc < bs) { bs = sc; best = q; }
      }
      B.grab = false;
      if (best) {
        if (B.target !== best.id) { B.target = best.id; B.seen = 0; B.track = 0; }
        else B.seen += 0.17;
        B.lastSeen = { x: best.pos[0], y: best.pos[1], z: best.pos[2], t: this.now };
      } else {
        if (B.target && B.lastSeen && this.now - B.lastSeen.t < 4) B.goal = [B.lastSeen.x, B.lastSeen.y, B.lastSeen.z];
        B.target = null; B.seen = 0;
      }
      if (this.mode.id === 'harvest') { for (const it of this.items) if (it.kind === 'drive' && it.on && Math.hypot(it.pos[0] - p.pos[0], it.pos[2] - p.pos[2]) < 9) { B.goal = it.pos; B.grab = true; break; } }
      B.objGoal = null;
      if (['dom', 'hardpoint', 'ctf', 'snd'].includes(this.mode.id)) { const g = this.botGoal(p); if (g) { B.objGoal = g; if (best && p.num % 4 !== 0) B.goal = g; } }
      if (!best && !B.grab) { const g = B.objGoal || this.botGoal(p); if (g) B.goal = g; else if (!B.goal || Math.hypot(B.goal[0] - p.pos[0], B.goal[2] - p.pos[2]) < 2) B.goal = this.rnd.pick(this.spawns); }
      // swap to the best gun for the distance
      if (best && p.weapons.length > 1 && !p.infected) {
        const d = Math.hypot(best.pos[0] - p.pos[0], best.pos[2] - p.pos[2]);
        const want = p.weapons.findIndex(w => w.mag > 0 && (w.g.cls === 'shotgun' ? d < 8 : w.g.secondary ? false : true));
        if (want >= 0 && p.weapons[p.cur].mag <= 0) p.cur = want;
        if (p.weapons[p.cur].mag <= 0) { const any = p.weapons.findIndex(w => w.mag > 0); if (any >= 0) p.cur = any; }
      }
    }
    botFire(p, T, eye, dt) {
      const B = p.bot, sk = B.skill, w = p.weapons[p.cur]; if (!w) return;
      const d = Math.hypot(T.pos[0] - p.pos[0], T.pos[1] - p.pos[1], T.pos[2] - p.pos[2]);
      if (w.g.melee || p.infected || this.mode.id === 'hottake' && p.carry === 'ball') { if (d < 2.2) { p.yaw = Math.atan2(-(T.pos[0] - p.pos[0]), -(T.pos[2] - p.pos[2])); this.onMelee(p.id); } return; }
      if (d < 1.6) { this.onMelee(p.id); return; }
      B.track = Math.min(1, B.track + dt * sk.track);
      B.burstT -= dt;
      if (B.pauseT > 0) { B.pauseT -= dt; return; }
      if (B.burstT <= 0) { B.burstT = 0.3 + this.rnd() * 0.6 * sk.burst; B.pauseT = (1 - sk.burst) * 0.6 * this.rnd(); return; }
      if (this.now < w.next || w.reloadAt > this.now || w.mag <= 0) return;
      const head = this.rnd() < 0.25 * sk.track;
      const ty = T.pos[1] + (head ? ((T.fl & 1) ? HC : H) - 0.2 : 1.05);
      const aim = norm3([T.pos[0] - eye[0], ty - eye[1], T.pos[2] - eye[2]]);
      const moving = Math.hypot(T.vel?.[0] || 0, T.vel?.[2] || 0) > 3 ? 1.3 : 1;
      const err = sk.aimErr * (1.6 - B.track) * moving * (p.stunUntil > this.now ? 2.5 : 1) * (T.camoUntil > this.now ? 3 : 1) + (d > 40 ? 0.6 : 0);
      p.pitch = Math.asin(clamp(aim[1], -1, 1));
      const dirs = [];
      for (let i = 0; i < w.g.pellets; i++) dirs.push(jitter(jitter(aim, err, this.rnd), w.g.pellets > 1 ? w.g.spread[0] : w.g.spread[1] * 0.5, this.rnd));
      this.onFire(p.id, { o: eye, d: dirs, rt: this.now });
    }
    botGoal(p) {
      const M = this.mode, r = this.rnd;
      if (p.collab) { const o = this.players.get(p.collab.owner); if (o?.alive) return o.pos; }
      if (M.id === 'dom') {
        const mine = this.domFlags.filter(f => f.owner !== p.team);
        const pool = mine.length ? mine : this.domFlags;
        let best = null, bd = Infinity; for (const f of pool) { const d = Math.hypot(f.pos[0] - p.pos[0], f.pos[2] - p.pos[2]) + r() * 15; if (d < bd) { bd = d; best = f; } }
        return best ? [best.pos[0] + r.range(-2, 2), best.pos[1], best.pos[2] + r.range(-2, 2)] : null;
      }
      if (M.id === 'hardpoint') return [this.hill.pos[0] + r.range(-3, 3), this.hill.pos[1], this.hill.pos[2] + r.range(-3, 3)];
      if (M.id === 'harvest') {
        let best = null, bd = 28; for (const it of this.items) if (it.kind === 'drive' && it.on) { const d = Math.hypot(it.pos[0] - p.pos[0], it.pos[2] - p.pos[2]); if (d < bd) { bd = d; best = it; } }
        return best ? best.pos : null;
      }
      if (M.id === 'ctf') {
        const mine = this.ctf[p.team], theirs = this.ctf[1 - p.team];
        if (p.carry === 'flag') return mine.home;
        if (!mine.atHome) return mine.pos;
        return p.num % 3 === 0 ? mine.home : theirs.pos;
      }
      if (M.id === 'hottake') { const b = this.ball; if (b.carrier === p.id) return this.base[this.sideFor(p)] || this.mid; return b.pos; }
      if (M.id === 'snd') {
        const S = this.snd;
        if (p.team === S.attack) { if (S.bomb.carrier === p.id) return S.sites[p.num % 2]; if (!S.planted && !S.bomb.carrier) return S.bomb.pos; return S.planted ? S.planted.pos : S.sites[p.num % 2]; }
        return S.planted ? S.planted.pos : S.sites[p.num % 2];
      }
      if (M.id === 'infection') {
        if (p.infected) { let best = null, bd = Infinity; for (const q of this.players.values()) if (q.alive && !q.infected) { const d = Math.hypot(q.pos[0] - p.pos[0], q.pos[2] - p.pos[2]); if (d < bd) { bd = d; best = q; } } return best ? best.pos : null; }
        if (!p.bot.campSpot) { const s = this.itemSpots[p.num % Math.max(1, this.itemSpots.length)] || this.mid; p.bot.campSpot = [s[0] + r.range(-2, 2), s[1], s[2] + r.range(-2, 2)]; p.bot.camp = true; }
        return p.bot.campSpot;
      }
      if (M.id === 'influencer') { const j = [...this.players.values()].find(q => q.jugg && q.alive && q !== p); if (j) return j.pos; }
      if (this.playlist === 'classic' && r() < 0.35) { const it = this.items.filter(i => i.on && (i.kind === 'weapon' || i.kind === 'overshield')); if (it.length) return r.pick(it).pos; }
      // roam toward the fight: a rough read on where an enemy is (bots hunt), else the middle or a random spawn
      const foes = this.enemiesOf(p);
      if (foes.length && r() < 0.5) { const f = r.pick(foes); return [f.pos[0] + r.range(-6, 6), f.pos[1], f.pos[2] + r.range(-6, 6)]; }
      return r() < 0.5 ? this.mid : r.pick(this.spawns);
    }
  }

  const PvpSim = {
    TICK, WEAPON_IDS, mapFromLayout, World, Match, gunStats, sanitizeClass, rng, dirFrom, wcode,
    create: opts => new Match(opts),
    /** run a whole bots-only match headless (tests, balance). Returns { match, ticks }. */
    simulate(opts, maxSeconds = 1200) {
      const m = new Match(Object.assign({ fill: true, pregame: 1 }, opts));
      m.fillBots();
      let ticks = 0;
      while (m.state !== 'over' && m.now < maxSeconds) { m.tick(TICK); m.drain(); ticks++; }
      return { match: m, ticks };
    },
  };
  root.PvpSim = PvpSim;
  if (typeof module !== 'undefined' && module.exports) module.exports = PvpSim;
})(typeof globalThis !== 'undefined' ? globalThis : this);
