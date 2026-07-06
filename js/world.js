/* EARTH 2049: SAVE SEED 7 — district world builder + spatial queries */
'use strict';

const World = (() => {
  const W = CFG.GW, H = CFG.GH, CELL = CFG.CELL;
  const HALF_W = W * CELL / 2, HALF_H = H * CELL / 2;

  let grid = new Float32Array(W * H);       // cell height (0 = free)
  let flow = new Int16Array(W * H);         // BFS dist to player
  let group = null;
  let freeCells = [];
  let rain = null, rainPos = null, rainVel = null;
  let embers = null, emberPos = null;
  let signMats = [], holos = [];
  let themeRef = null;

  const idx = (cx, cy) => cy * W + cx;
  const inG = (cx, cy) => cx >= 0 && cy >= 0 && cx < W && cy < H;
  function worldToCell(x, z) { return { cx: Math.floor((x + HALF_W) / CELL), cy: Math.floor((z + HALF_H) / CELL) }; }
  function cellCenter(cx, cy) { return { x: (cx + 0.5) * CELL - HALF_W, z: (cy + 0.5) * CELL - HALF_H }; }
  function cellH(cx, cy) { return inG(cx, cy) ? grid[idx(cx, cy)] : CFG.WALL_H; }
  function solidAt(x, z, h) { const c = worldToCell(x, z); return cellH(c.cx, c.cy) > (h || 0.5); }

  /* ---------- layout generation ---------- */
  function genLayout(rng) {
    for (let attempt = 0; attempt < 30; attempt++) {
      grid.fill(0);
      for (let i = 0; i < W; i++) { grid[idx(i, 0)] = CFG.WALL_H; grid[idx(i, H - 1)] = CFG.WALL_H; }
      for (let j = 0; j < H; j++) { grid[idx(0, j)] = CFG.WALL_H; grid[idx(W - 1, j)] = CFG.WALL_H; }
      const mid = (W - 1) / 2;
      const count = 16 + (Math.random() * 6 | 0);
      for (let n = 0; n < count; n++) {
        const cx = 1 + (Math.random() * (W - 2)) | 0, cy = 1 + (Math.random() * (H - 2)) | 0;
        if (Math.abs(cx - mid) <= 1 && Math.abs(cy - mid) <= 1) continue;      // keep boss arena clear
        if (cx <= 3 && cy <= 3) continue;                                       // player spawn corner
        if (grid[idx(cx, cy)] > 0) continue;
        grid[idx(cx, cy)] = Math.random() < 0.62 ? 2.3 : CFG.WALL_H;            // crate or pillar
      }
      // connectivity check via BFS
      const seen = new Uint8Array(W * H);
      let total = 0;
      for (let i = 0; i < W * H; i++) if (grid[i] === 0) total++;
      const q = [[2, 2]]; seen[idx(2, 2)] = 1; let cnt = 1;
      while (q.length) {
        const [cx, cy] = q.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (inG(nx, ny) && !seen[idx(nx, ny)] && grid[idx(nx, ny)] === 0) { seen[idx(nx, ny)] = 1; cnt++; q.push([nx, ny]); }
        }
      }
      if (cnt === total) break;
    }
    freeCells = [];
    for (let cy = 1; cy < H - 1; cy++) for (let cx = 1; cx < W - 1; cx++)
      if (grid[idx(cx, cy)] === 0) freeCells.push({ cx, cy });
  }

  /* ---------- build scenery ---------- */
  function build(scene, dIdx) {
    if (group) { scene.remove(group); disposeGroup(group); }
    group = new THREE.Group(); scene.add(group);
    signMats = []; holos = [];
    const theme = DISTRICTS[dIdx]; themeRef = theme;
    const fac = FACTIONS[theme.fac];
    genLayout();

    scene.fog = new THREE.FogExp2(theme.fog, CFG.FOG_DENS);
    scene.background = new THREE.Color(theme.sky);

    // sky dome
    const sky = new THREE.Mesh(new THREE.SphereGeometry(190, 16, 12),
      new THREE.MeshBasicMaterial({ map: Assets.skyTex(theme), side: THREE.BackSide, fog: false, depthWrite: false }));
    group.add(sky);

    // ground
    const gt = Assets.groundTex(theme); gt.repeat.set(30, 30);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ map: gt, roughness: 0.85, metalness: 0.15 }));
    ground.rotation.x = -Math.PI / 2; group.add(ground);

    // lights
    group.add(new THREE.HemisphereLight(theme.fog, 0x04050c, 3.4));
    const dir = new THREE.DirectionalLight(0xaebbdd, 0.9);
    dir.position.set(20, 40, 12); group.add(dir);
    const facLight = new THREE.PointLight(fac.neon, 2.2, 70, 1.6);
    facLight.position.set(0, 12, 0); group.add(facLight);

    // arena walls (merged)
    const wallTexture = Assets.wallTex(theme);
    const wallGeos = [], crateGeos = [];
    for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
      const h = grid[idx(cx, cy)];
      if (h <= 0) continue;
      const { x, z } = cellCenter(cx, cy);
      if (h > 3) {
        const g = new THREE.BoxGeometry(CELL, h, CELL);
        g.translate(x, h / 2, z); wallGeos.push(g);
      } else {
        const g = new THREE.BoxGeometry(3.5, h, 3.5);
        g.translate(x, h / 2, z); crateGeos.push(g);
        if (Math.random() < 0.4) {
          const g2 = new THREE.BoxGeometry(1.7, 1.1, 1.7);
          g2.translate(x + (Math.random() - 0.5), h + 0.55, z + (Math.random() - 0.5));
          crateGeos.push(g2);
        }
      }
    }
    if (wallGeos.length) {
      const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(wallGeos);
      const wm = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.8, metalness: 0.2 }));
      group.add(wm);
      wallGeos.forEach(g => g.dispose());
    }
    if (crateGeos.length) {
      const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(crateGeos);
      const cm = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ map: Assets.crateTex(theme), roughness: 0.7, metalness: 0.3 }));
      group.add(cm);
      crateGeos.forEach(g => g.dispose());
    }

    // neon trim on top of arena walls
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(W * CELL + 0.2, 0.18, H * CELL + 0.2),
      Assets.emat(fac.neon, 1.8));
    trim.position.y = CFG.WALL_H + 0.05;
    // hollow look: use 4 bars instead
    group.remove(trim);
    for (const [bx, bz, sx, sz] of [[0, -HALF_H, W * CELL, 0.25], [0, HALF_H, W * CELL, 0.25], [-HALF_W, 0, 0.25, H * CELL], [HALF_W, 0, 0.25, H * CELL]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.16, sz), Assets.emat(fac.neon, 1.7));
      bar.position.set(bx, CFG.WALL_H + 0.08, bz); group.add(bar);
    }

    // tower skyline
    const winTexA = Assets.windowTex(fac.neon), winTexB = Assets.windowTex(fac.accent);
    winTexA.repeat.set(2, 4); winTexB.repeat.set(3, 5);
    const towerMatA = new THREE.MeshBasicMaterial({ map: winTexA });
    const towerMatB = new THREE.MeshBasicMaterial({ map: winTexB });
    const towerGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const r = 52 + Math.random() * 46;
      const tw = 8 + Math.random() * 12, th = 24 + Math.random() * 55;
      const t = new THREE.Mesh(towerGeo, Math.random() < 0.5 ? towerMatA : towerMatB);
      t.scale.set(tw, th, tw);
      t.position.set(Math.cos(a) * r, th / 2 - 1, Math.sin(a) * r);
      t.rotation.y = Math.random() * Math.PI;
      group.add(t);
      // neon sign on some towers, facing arena
      if (i % 3 === 0) {
        const slog = theme.slogans[(Math.random() * theme.slogans.length) | 0];
        const sm = new THREE.MeshBasicMaterial({ map: Assets.signTex(slog, Math.random() < 0.5 ? fac.neon : fac.accent), transparent: true, side: THREE.DoubleSide });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 3.4), sm);
        const sr = r - tw / 2 - 1.5;
        sign.position.set(Math.cos(a) * sr, 10 + Math.random() * (th - 14), Math.sin(a) * sr);
        sign.lookAt(0, sign.position.y, 0);
        group.add(sign); signMats.push(sm);
      }
    }
    // GigaCorp megatower landmark (always north)
    const mega = new THREE.Mesh(towerGeo, towerMatB);
    mega.scale.set(26, 130, 26); mega.position.set(0, 64, -120); group.add(mega);
    const megaSign = new THREE.Mesh(new THREE.PlaneGeometry(30, 9),
      new THREE.MeshBasicMaterial({ map: Assets.signTex('GIGACORP', 0x4da6ff, 'ONE WORLD. ONE CORP.'), transparent: true }));
    megaSign.position.set(0, 108, -106); group.add(megaSign);
    const eye = new THREE.Mesh(Assets.GEO.sph, Assets.emat(0x4da6ff, 2.4));
    eye.scale.setScalar(4); eye.position.set(0, 126, -106); group.add(eye);

    // holo ads floating above arena
    for (let i = 0; i < 3; i++) {
      const slog = theme.slogans[(Math.random() * theme.slogans.length) | 0];
      const hm = new THREE.MeshBasicMaterial({
        map: Assets.signTex(slog, fac.neon), transparent: true, opacity: 0.34,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
      const holo = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.4), hm);
      const a = i / 3 * Math.PI * 2 + 0.5;
      holo.position.set(Math.cos(a) * 22, 13 + i * 2.5, Math.sin(a) * 22);
      group.add(holo); holos.push(holo);
    }

    // pillar cell neon rings
    for (let cy = 1; cy < H - 1; cy++) for (let cx = 1; cx < W - 1; cx++) {
      if (grid[idx(cx, cy)] > 3) {
        const { x, z } = cellCenter(cx, cy);
        const ring = new THREE.Mesh(new THREE.BoxGeometry(CELL + 0.1, 0.14, CELL + 0.1), Assets.emat(fac.accent, 1.5));
        ring.position.set(x, 2.6, z); group.add(ring);
      }
    }

    // rain
    rain = null;
    if (theme.rain) {
      const N = 420;
      rainPos = new Float32Array(N * 6); rainVel = new Float32Array(N);
      for (let i = 0; i < N; i++) resetDrop(i, true);
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
      rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x7788aa, transparent: true, opacity: 0.34 }));
      rain.frustumCulled = false;
      group.add(rain);
    }
    // drifting embers
    {
      const N = 90;
      emberPos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        emberPos[i * 3] = (Math.random() - 0.5) * 60;
        emberPos[i * 3 + 1] = Math.random() * 8;
        emberPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
      }
      const eg = new THREE.BufferGeometry();
      eg.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
      embers = new THREE.Points(eg, new THREE.PointsMaterial({
        color: fac.neon, size: 0.09, transparent: true, opacity: 0.65,
        blending: THREE.AdditiveBlending, depthWrite: false }));
      embers.frustumCulled = false;
      group.add(embers);
    }
    return theme;
  }

  function resetDrop(i, init) {
    const x = (Math.random() - 0.5) * 80, z = (Math.random() - 0.5) * 80;
    const y = init ? Math.random() * 26 : 22 + Math.random() * 6;
    rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
    rainPos[i * 6 + 3] = x + 0.06; rainPos[i * 6 + 4] = y - 0.55; rainPos[i * 6 + 5] = z;
    rainVel[i] = 19 + Math.random() * 9;
  }

  function disposeGroup(g) {
    g.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(m => { if (m.map && !m.map.__keep) m.map.dispose(); m.dispose(); });
      }
    });
  }

  let flickT = 0;
  function tick(dt, t) {
    if (rain) {
      const N = rainVel.length;
      for (let i = 0; i < N; i++) {
        const dy = rainVel[i] * dt;
        rainPos[i * 6 + 1] -= dy; rainPos[i * 6 + 4] -= dy;
        if (rainPos[i * 6 + 1] < 0) resetDrop(i, false);
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
    if (embers) {
      const N = emberPos.length / 3;
      for (let i = 0; i < N; i++) {
        emberPos[i * 3 + 1] += dt * 0.35;
        emberPos[i * 3] += Math.sin(t * 0.6 + i) * dt * 0.25;
        if (emberPos[i * 3 + 1] > 9) emberPos[i * 3 + 1] = 0;
      }
      embers.geometry.attributes.position.needsUpdate = true;
    }
    for (const h of holos) { h.rotation.y += dt * 0.25; }
    flickT -= dt;
    if (flickT <= 0 && signMats.length) {
      flickT = 0.12 + Math.random() * 0.3;
      const m = signMats[(Math.random() * signMats.length) | 0];
      m.opacity = Math.random() < 0.12 ? 0.25 + Math.random() * 0.4 : 1;
    }
  }

  /* ---------- spatial queries ---------- */
  // 3D ray vs grid columns & ground. dir must be normalized.
  const _rc = {};
  function raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist, hit = false, ground = false;
    if (dy < -1e-5) {
      const tG = -oy / dy;
      if (tG > 0 && tG < best) { best = tG; hit = true; ground = true; }
    }
    const hLen = Math.hypot(dx, dz);
    if (hLen > 1e-6) {
      const rdx = dx / hLen, rdz = dz / hLen;
      let { cx, cy } = worldToCell(ox, oz);
      const stepX = rdx > 0 ? 1 : -1, stepY = rdz > 0 ? 1 : -1;
      const dDX = Math.abs(1 / rdx) * CELL, dDZ = Math.abs(1 / rdz) * CELL;
      const fx = (ox + HALF_W) / CELL - cx, fz = (oz + HALF_H) / CELL - cy;
      let sideX = (rdx > 0 ? (1 - fx) : fx) * dDX;
      let sideZ = (rdz > 0 ? (1 - fz) : fz) * dDZ;
      if (!isFinite(sideX)) sideX = Infinity;
      if (!isFinite(sideZ)) sideZ = Infinity;
      for (let n = 0; n < 64; n++) {
        let tEdge;
        if (sideX < sideZ) { tEdge = sideX; sideX += dDX; cx += stepX; }
        else { tEdge = sideZ; sideZ += dDZ; cy += stepY; }
        const t3 = tEdge / hLen;                 // distance along full 3D ray at cell entry
        if (t3 > best) break;
        if (!inG(cx, cy)) { break; }
        const h = grid[idx(cx, cy)];
        if (h > 0) {
          const yAt = oy + dy * t3;
          if (yAt <= h && yAt >= -0.5) { best = t3; hit = true; ground = false; break; }
        }
      }
    }
    if (!hit) return null;
    return { t: best, ground, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best };
  }

  function losClear(x1, z1, x2, z2, h) {
    const dx = x2 - x1, dz = z2 - z1;
    const d = Math.hypot(dx, dz);
    if (d < 0.001) return true;
    const r = raycast(x1, h || 1.4, z1, dx / d, 0, dz / d, d);
    return !r;
  }

  // axis-separated circle vs grid movement
  function moveCircle(x, z, dx, dz, r) {
    let nx = x + dx, nz = z + dz;
    if (circleHits(nx, z, r)) nx = x;
    if (circleHits(nx, nz, r)) nz = z;
    if (circleHits(nx, nz, r)) { nx = x; nz = z; }
    return { x: nx, z: nz };
  }
  function circleHits(x, z, r) {
    const minCx = Math.floor((x - r + HALF_W) / CELL), maxCx = Math.floor((x + r + HALF_W) / CELL);
    const minCy = Math.floor((z - r + HALF_H) / CELL), maxCy = Math.floor((z + r + HALF_H) / CELL);
    for (let cy = minCy; cy <= maxCy; cy++) for (let cx = minCx; cx <= maxCx; cx++) {
      if (cellH(cx, cy) > 0.5) {
        const x0 = cx * CELL - HALF_W, z0 = cy * CELL - HALF_H;
        const px = Math.max(x0, Math.min(x, x0 + CELL)), pz = Math.max(z0, Math.min(z, z0 + CELL));
        if ((px - x) * (px - x) + (pz - z) * (pz - z) < r * r) return true;
      }
    }
    return false;
  }

  /* flow field toward player */
  function computeFlow(px, pz) {
    flow.fill(9999);
    const c = worldToCell(px, pz);
    if (!inG(c.cx, c.cy)) return;
    const q = [[c.cx, c.cy]];
    flow[idx(c.cx, c.cy)] = 0;
    let head = 0;
    while (head < q.length) {
      const [cx, cy] = q[head++];
      const d = flow[idx(cx, cy)];
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + ddx, ny = cy + ddy;
        if (inG(nx, ny) && grid[idx(nx, ny)] === 0 && flow[idx(nx, ny)] > d + 1) {
          flow[idx(nx, ny)] = d + 1; q.push([nx, ny]);
        }
      }
    }
  }
  function flowDir(x, z) {
    const c = worldToCell(x, z);
    if (!inG(c.cx, c.cy)) return null;
    let bd = flow[idx(c.cx, c.cy)], bx = 0, bz = 0, found = false;
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.cx + ddx, ny = c.cy + ddy;
      if (inG(nx, ny) && flow[idx(nx, ny)] < bd) { bd = flow[idx(nx, ny)]; bx = ddx; bz = ddy; found = true; }
    }
    if (!found) return null;
    const tc = cellCenter(c.cx + bx, c.cy + bz);
    const dx = tc.x - x, dz = tc.z - z, d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, z: dz / d };
  }

  function randomSpawn(px, pz, minD) {
    for (let i = 0; i < 60; i++) {
      const c = freeCells[(Math.random() * freeCells.length) | 0];
      const { x, z } = cellCenter(c.cx, c.cy);
      if (Math.hypot(x - px, z - pz) >= minD) return { x, z };
    }
    const c = freeCells[(Math.random() * freeCells.length) | 0];
    return cellCenter(c.cx, c.cy);
  }

  function playerStart() {
    // clear corner near (2,2)
    for (const c of freeCells) if (c.cx <= 3 && c.cy <= 3) return cellCenter(c.cx, c.cy);
    return cellCenter(freeCells[0].cx, freeCells[0].cy);
  }
  function bossArena() { return cellCenter((W - 1) / 2, (H - 1) / 2); }

  return { build, tick, raycast, losClear, moveCircle, circleHits, computeFlow, flowDir, randomSpawn, playerStart, bossArena, worldToCell, cellCenter, cellH, get group() { return group; } };
})();
