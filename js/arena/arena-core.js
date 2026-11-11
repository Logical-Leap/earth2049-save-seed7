/* EARTH 2049: SAVE SEED 7 — ARENA core: level, collision, raycasts, navigation, light probes
 *
 * The combat arena (Operation: Unsubscribe) runs as its own runtime on top of the game's renderer.
 * Everything here is level-agnostic: it loads a forge.maps level (GLB + layout JSON) and gives the
 * rest of the arena code a small 3D physics world:
 *
 *   boxes       every collider as an AABB, hashed on a 4 m XZ grid
 *   moveBody    capsule-ish body (vertical cylinder) move-and-slide with step-up, ledge mantle, ceilings
 *   raycast     ray vs boxes (slab test) with hit normal, for bullets, LOS and decals
 *   floorAt     highest surface under a point (enemies, pickups, telegraphs)
 *   nav         the layout's nav graph: nearest node, and a flow field toward the player
 *               (Dijkstra over reversed edges, rebuilt a few times a second) that every ground enemy follows
 *   probes      baked irradiance grid so characters sit in the level's light
 */
'use strict';

const AR = window.AR = {
  V3: (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z),
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a, b) => a + Math.random() * (b - a),                        // NOSONAR - gameplay randomness
  pick: a => a[Math.floor(Math.random() * a.length)],                  // NOSONAR
  damp: (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt),
  angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; },
  el: id => document.getElementById(id),
};

AR.World = (() => {
  const CELL = 4;
  let boxes = null, nBox = 0, walkable = null, grid = new Map(), stamp = null, stampN = 1;
  let probes = null, layout = null, levelRoot = null;
  let nav = null;                 // { pos: Float32Array, n, out: [[to, w, type]], inn: [[from, w, type]], hash: Map }
  const tmp = { x: 0, z: 0 };

  /* ------------------------------------------------------------------ loading */
  async function load(scene, base, name) {
    layout = await fetch(base + name + '.layout.json?v=' + AR.VERSION).then(r => r.json());
    const gltf = await AssetLoader.loadModel('arena.level.' + name, base + name + '.glb?v=' + AR.VERSION);
    levelRoot = gltf.scene;
    const ls = gltf.scene.userData?.lightScale || 4;
    levelRoot.traverse(o => {
      if (!o.isMesh) return;
      o.matrixAutoUpdate = false; o.updateMatrix();
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) { if (m.color) m.color.setScalar(ls); m.fog = true; }
    });
    levelRoot.updateMatrixWorld(true);
    scene.add(levelRoot);
    buildColliders(layout.colliders);
    probes = decodeProbes(layout.probes);
    buildNav(layout.meta?.nav);
    return layout;
  }
  function unload(scene) {
    if (levelRoot) scene.remove(levelRoot);
    levelRoot = null;
  }

  function buildColliders(list) {
    nBox = list.length;
    boxes = new Float32Array(nBox * 6);
    walkable = new Uint8Array(nBox);
    stamp = new Uint32Array(nBox);
    grid = new Map();
    list.forEach((c, i) => {
      boxes.set([c.min[0], c.min[1], c.min[2], c.max[0], c.max[1], c.max[2]], i * 6);
      walkable[i] = c.walkable ? 1 : 0;
      const x0 = Math.floor(c.min[0] / CELL), x1 = Math.floor(c.max[0] / CELL);
      const z0 = Math.floor(c.min[2] / CELL), z1 = Math.floor(c.max[2] / CELL);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = x * 4096 + z;
        let a = grid.get(k); if (!a) grid.set(k, a = []);
        a.push(i);
      }
    });
  }
  /** Indices of boxes whose XZ footprint may touch the rect [x0,x1]x[z0,z1]. Reuses one array. */
  const near = [];
  function query(x0, z0, x1, z1) {
    near.length = 0; stampN++;
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL), cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) {
      const a = grid.get(x * 4096 + z); if (!a) continue;
      for (const i of a) if (stamp[i] !== stampN) { stamp[i] = stampN; near.push(i); }
    }
    return near;
  }

  /* ------------------------------------------------------------------ queries */
  /** Highest box top under the disc (x,z,r) that is <= maxY. -Infinity if none. */
  function floorAt(x, z, r, maxY) {
    let best = -Infinity;
    const q = query(x - r, z - r, x + r, z + r);
    for (const i of q) {
      const b = i * 6, top = boxes[b + 4];
      if (top > maxY || top <= best) continue;
      if (x + r < boxes[b] || x - r > boxes[b + 3] || z + r < boxes[b + 2] || z - r > boxes[b + 5]) continue;
      best = top;
    }
    return best;
  }
  /** Lowest box bottom above y within the disc. +Infinity if none. */
  function ceilAt(x, z, r, y) {
    let best = Infinity;
    const q = query(x - r, z - r, x + r, z + r);
    for (const i of q) {
      const b = i * 6, bot = boxes[b + 1];
      if (bot < y || bot >= best) continue;
      if (x + r < boxes[b] || x - r > boxes[b + 3] || z + r < boxes[b + 2] || z - r > boxes[b + 5]) continue;
      best = bot;
    }
    return best;
  }

  /**
   * Move a vertical-cylinder body. body: { pos (feet), vel, r, h, onGround, step }.
   * Horizontal: move, then push out of every box that overlaps the body's vertical span (boxes low enough to
   * step onto are ignored and become the floor). Vertical: gravity, floor snap (step-up / mantle), ceilings.
   * Returns flags { hitWall, landed, hitCeil, wallNx, wallNz }.
   */
  const res = { hitWall: false, landed: false, hitCeil: false, wallNx: 0, wallNz: 0, impactVy: 0 };
  function moveBody(body, dt, gravity) {
    const p = body.pos, v = body.vel, r = body.r, h = body.h, step = body.step ?? 0.55;
    res.hitWall = false; res.landed = false; res.hitCeil = false; res.wallNx = 0; res.wallNz = 0; res.impactVy = 0;
    // sub-step fast movers so dashes cannot tunnel through thin rails
    const sp = Math.hypot(v.x, v.z) * dt;
    const n = Math.min(6, Math.max(1, Math.ceil(sp / (r * 0.8))));
    const sdt = dt / n;
    for (let s = 0; s < n; s++) {
      p.x += v.x * sdt; p.z += v.z * sdt;
      for (let it = 0; it < 3; it++) {
        let pushed = false;
        const q = query(p.x - r, p.z - r, p.x + r, p.z + r);
        for (const i of q) {
          const b = i * 6;
          if (boxes[b + 4] <= p.y + step || boxes[b + 1] >= p.y + h) continue;
          const cx = p.x < boxes[b] ? boxes[b] : p.x > boxes[b + 3] ? boxes[b + 3] : p.x;
          const cz = p.z < boxes[b + 2] ? boxes[b + 2] : p.z > boxes[b + 5] ? boxes[b + 5] : p.z;
          let dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          let nx, nz, pen;
          if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
          else {                                                     // centre inside: shortest way out
            const l = p.x - boxes[b], rr = boxes[b + 3] - p.x, f = p.z - boxes[b + 2], bk = boxes[b + 5] - p.z;
            const m = Math.min(l, rr, f, bk);
            if (m === l) { nx = -1; nz = 0; pen = l + r; } else if (m === rr) { nx = 1; nz = 0; pen = rr + r; }
            else if (m === f) { nx = 0; nz = -1; pen = f + r; } else { nx = 0; nz = 1; pen = bk + r; }
          }
          p.x += nx * pen; p.z += nz * pen;
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; }
          res.hitWall = true; res.wallNx = nx; res.wallNz = nz; pushed = true;
        }
        if (!pushed) break;
      }
    }
    // vertical
    v.y += gravity * dt;
    if (v.y < -60) v.y = -60;
    const ny = p.y + v.y * dt;
    if (v.y <= 0) {
      const f = floorAt(p.x, p.z, r * 0.7, p.y + step);
      if (ny <= f) {
        if (!body.onGround) { res.landed = true; res.impactVy = v.y; }
        p.y = f; v.y = 0; body.onGround = true;
      } else {
        p.y = ny;
        body.onGround = ny - f < 0.04;
      }
    } else {
      const c = ceilAt(p.x, p.z, r * 0.7, p.y + h - 0.2);
      if (ny + h > c) { p.y = c - h; v.y = 0; res.hitCeil = true; } else p.y = ny;
      body.onGround = false;
    }
    return res;
  }

  /** Is the body overlapping anything solid right now (for safe respawn checks)? */
  function bodyBlocked(x, y, z, r, h) {
    const q = query(x - r, z - r, x + r, z + r);
    for (const i of q) {
      const b = i * 6;
      if (boxes[b + 4] <= y + 0.05 || boxes[b + 1] >= y + h) continue;
      if (x + r < boxes[b] || x - r > boxes[b + 3] || z + r < boxes[b + 2] || z - r > boxes[b + 5]) continue;
      return true;
    }
    return false;
  }

  /** Ray vs every box. Returns { t, nx, ny, nz, i } of the nearest hit within maxT, or null. */
  const hit = { t: 0, nx: 0, ny: 0, nz: 0, i: -1 };
  function raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, bi = -1, bAxis = 0, bSign = 0;
    const ix = 1 / (dx || 1e-12), iy = 1 / (dy || 1e-12), iz = 1 / (dz || 1e-12);
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const q = query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez));
    for (const i of q) {
      const b = i * 6;
      let t0x = (boxes[b] - ox) * ix, t1x = (boxes[b + 3] - ox) * ix;
      let t0y = (boxes[b + 1] - oy) * iy, t1y = (boxes[b + 4] - oy) * iy;
      let t0z = (boxes[b + 2] - oz) * iz, t1z = (boxes[b + 5] - oz) * iz;
      let ax = 0, sx = -1;
      if (t0x > t1x) { const t = t0x; t0x = t1x; t1x = t; sx = 1; }
      let sy = -1; if (t0y > t1y) { const t = t0y; t0y = t1y; t1y = t; sy = 1; }
      let sz = -1; if (t0z > t1z) { const t = t0z; t0z = t1z; t1z = t; sz = 1; }
      let tn = t0x, sgn = sx; ax = 0;
      if (t0y > tn) { tn = t0y; ax = 1; sgn = sy; }
      if (t0z > tn) { tn = t0z; ax = 2; sgn = sz; }
      const tf = Math.min(t1x, t1y, t1z);
      if (tn > tf || tf < 0 || tn >= best) continue;
      if (tn < 0) continue;                                  // origin inside the box: ignore it
      best = tn; bi = i; bAxis = ax; bSign = sgn;
    }
    if (bi < 0) return null;
    hit.t = best; hit.i = bi;
    hit.nx = bAxis === 0 ? bSign : 0; hit.ny = bAxis === 1 ? bSign : 0; hit.nz = bAxis === 2 ? bSign : 0;
    return hit;
  }
  function los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return true;
    return !raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05);
  }

  /* ------------------------------------------------------------------ probes */
  function decodeProbes(p) {
    if (!p) return null;
    const bin = atob(p.rgb8); const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    return { ...p, data };
  }
  function probeAt(x, y, z, out) {
    const P = probes;
    if (!P) return out.setRGB(1, 1, 1);
    const [nx, ny, nz] = P.dims, [ox, oy, oz] = P.origin, [sx, , sz] = P.step;
    const fx = Math.min(nx - 1.001, Math.max(0, (x - ox) / sx)), fz = Math.min(nz - 1.001, Math.max(0, (z - oz) / sz));
    // heights may be irregular (0.6, 2.0, 5.2, 6.8): find the bracket
    const H = P.heights || (P.heights = [0.6, 2.0, 5.2, 6.8].slice(0, ny));
    let iy = 0; while (iy < ny - 2 && y > H[iy + 1]) iy++;
    const ty = Math.min(1, Math.max(0, (y - H[iy]) / ((H[iy + 1] ?? H[iy] + 1) - H[iy])));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    let r = 0, g = 0, b = 0;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
      const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz);
      const i = (((ix + dx) * ny + Math.min(ny - 1, iy + dy)) * nz + (iz + dz)) * 3;
      r += P.data[i] * w; g += P.data[i + 1] * w; b += P.data[i + 2] * w;
    }
    const k = P.scale / 255;
    return out.setRGB(r * k, g * k, b * k);
  }

  /* ------------------------------------------------------------------ navigation */
  function buildNav(src) {
    if (!src) { nav = null; return; }
    const n = src.nodes.length;
    const pos = new Float32Array(n * 3);
    src.nodes.forEach((p, i) => pos.set(p, i * 3));
    const out = Array.from({ length: n }, () => []), inn = Array.from({ length: n }, () => []);
    const add = (a, b, type) => {
      const w = Math.hypot(pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]) * (type === 2 ? 0.6 : type === 1 ? 1.3 : 1);
      out[a].push([b, w, type]); inn[b].push([a, w, type]);
    };
    for (const [a, b, t] of src.edges) { add(a, b, t); if (t === 0) add(b, a, 0); }
    const hash = new Map();
    for (let i = 0; i < n; i++) {
      const k = Math.round(pos[i * 3] / 2) * 4096 + Math.round(pos[i * 3 + 2] / 2);
      let a = hash.get(k); if (!a) hash.set(k, a = []); a.push(i);
    }
    nav = { pos, n, out, inn, hash, dist: new Float64Array(n).fill(Infinity), next: new Int32Array(n).fill(-1), nextType: new Int8Array(n), target: -1 };
  }
  /** Nearest nav node to a point, preferring nodes at or just below y. */
  function nearestNode(x, y, z, maxR = 3) {
    if (!nav) return -1;
    const cx = Math.round(x / 2), cz = Math.round(z / 2);
    let best = -1, bd = Infinity;
    const R = Math.ceil(maxR / 2);
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const a = nav.hash.get((cx + dx) * 4096 + cz + dz); if (!a) continue;
      for (const i of a) {
        const ny = nav.pos[i * 3 + 1];
        const vy = y - ny;
        if (vy < -1.0 || vy > 4.0) continue;
        const d = Math.hypot(nav.pos[i * 3] - x, nav.pos[i * 3 + 2] - z) + Math.abs(vy) * 2.5;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }
  /** Rebuild the flow field toward a goal node (Dijkstra over reversed edges). */
  function flowTo(goal) {
    if (!nav || goal < 0) return;
    const { n, inn, dist, next, nextType } = nav;
    dist.fill(Infinity); next.fill(-1);
    dist[goal] = 0; nav.target = goal;
    // binary heap of [d, node]
    const heap = [[0, goal]];
    const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, u] = pop();
      if (d > dist[u]) continue;
      for (const [v, w, type] of inn[u]) {         // v -> u exists
        const nd = d + w;
        if (nd < dist[v]) { dist[v] = nd; next[v] = u; nextType[v] = type; push(nd, v); }
      }
    }
    void n;
  }
  function nodePos(i, out) { return out.set(nav.pos[i * 3], nav.pos[i * 3 + 1], nav.pos[i * 3 + 2]); }

  return {
    load, unload, floorAt, ceilAt, moveBody, bodyBlocked, raycast, los, probeAt, nearestNode, flowTo, nodePos,
    get layout() { return layout; }, get nav() { return nav; }, get root() { return levelRoot; },
    markers: kind => (layout?.markers || []).filter(m => m.kind === kind),
    tmp,
  };
})();
