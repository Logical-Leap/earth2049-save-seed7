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
  let themeRef = null, spawnCell = null, bossCell = null, colliders = [], spawnCursor = 0;

  const idx = (cx, cy) => cy * W + cx;
  const inG = (cx, cy) => cx >= 0 && cy >= 0 && cx < W && cy < H;
  function worldToCell(x, z) { return { cx: Math.floor((x + HALF_W) / CELL), cy: Math.floor((z + HALF_H) / CELL) }; }
  function cellCenter(cx, cy) { return { x: (cx + 0.5) * CELL - HALF_W, z: (cy + 0.5) * CELL - HALF_H }; }
  function cellH(cx, cy) { return inG(cx, cy) ? grid[idx(cx, cy)] : CFG.WALL_H; }
  function solidAt(x, z, h) { const c = worldToCell(x, z); return cellH(c.cx, c.cy) > (h || 0.5); }

  /* ---------- layout generation ---------- */
  function rebuildFreeCells() {
    freeCells = [];
    for (let cy = 1; cy < H - 1; cy++) for (let cx = 1; cx < W - 1; cx++)
      if (grid[idx(cx, cy)] === 0) freeCells.push({ cx, cy });
  }

  function cellFromWorld(x, z) {
    return {
      cx: clampInt(Math.floor((x + HALF_W) / CELL), 1, W - 2),
      cy: clampInt(Math.floor((z + HALF_H) / CELL), 1, H - 2),
    };
  }
  function clampInt(v, a, b) { return v < a ? a : v > b ? b : v; }
  function stampRect(cx, cy, sx, sy, h) {
    const rx = Math.max(0, Math.ceil(sx / CELL / 2) - 1);
    const ry = Math.max(0, Math.ceil(sy / CELL / 2) - 1);
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      if (inG(x, y) && x > 0 && y > 0 && x < W - 1 && y < H - 1) grid[idx(x, y)] = h;
    }
  }
  function stampWorldRect(x, z, sx, sz, h) {
    const c = cellFromWorld(x, z);
    stampRect(c.cx, c.cy, sx, sz, h);
  }

  function genEngagementSquareLayout() {
    grid.fill(0);
    for (let i = 0; i < W; i++) { grid[idx(i, 0)] = CFG.WALL_H; grid[idx(i, H - 1)] = CFG.WALL_H; }
    for (let j = 0; j < H; j++) { grid[idx(0, j)] = CFG.WALL_H; grid[idx(W - 1, j)] = CFG.WALL_H; }

    const S = 0.72;
    // Keep the navigation grid open through the plaza; physical cover is handled
    // by fine-grained colliders so players can jump onto reachable props.
    for (const [x, z, sx, sz] of [[-34,18,13,7],[28,22,17,12]]) {
      stampWorldRect(x * S, z * S, sx * S, sz * S, 2.3);
    }
    for (const [x, z, sx, sz] of [[0,-36.2,29,1.2],[-52,1,2.8,62],[52,1,2.8,62],[0,31.5,74,2.4]]) {
      stampWorldRect(x * S, z * S, sx * S, sz * S, CFG.WALL_H);
    }
    spawnCell = cellFromWorld(0, 22 * S);
    bossCell = cellFromWorld(0, -28 * S);
    grid[idx(spawnCell.cx, spawnCell.cy)] = 0;
    grid[idx(bossCell.cx, bossCell.cy)] = 0;
    rebuildFreeCells();
  }

  function genLayout() {
    spawnCell = null; bossCell = null;
    if (themeRef && themeRef.map === 'engagementSquare') { genEngagementSquareLayout(); return; }
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
    rebuildFreeCells();
  }

  function mapMat(color, emissive, intensity) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.18, emissive: emissive || 0x000000, emissiveIntensity: intensity || 0 });
  }
  function registerCollider(name, dims, opts) {
    const [x, y, z, sx, sy, sz] = dims;
    const top = y + sy;
    colliders.push({ name, x, z, sx, sz, y0: y, h: top, climb: opts?.climb ?? (y <= 0.15 && top <= 1.25) });
  }
  function mapBox(name, dims, mat, opts) {
    const [x, y, z, sx, sy, sz] = dims;
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.position.set(x, y + sy / 2, z);
    group.add(m);
    if (opts?.collide !== false) registerCollider(name, dims, opts);
    return m;
  }
  function rectCircleHit(c, x, z, r) {
    const hx = c.sx / 2, hz = c.sz / 2;
    const px = Math.max(c.x - hx, Math.min(x, c.x + hx));
    const pz = Math.max(c.z - hz, Math.min(z, c.z + hz));
    return (px - x) * (px - x) + (pz - z) * (pz - z) < r * r;
  }
  function pointInRect(c, x, z) {
    return Math.abs(x - c.x) <= c.sx / 2 && Math.abs(z - c.z) <= c.sz / 2;
  }

  function mapPlane(name, x, y, z, sx, sz, mat) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), mat);
    m.name = name;
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }
  function mapSign(text, x, y, z, w, h, color, rotY) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: Assets.signTex(text, color), transparent: true, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY || 0;
    group.add(mesh);
    return mesh;
  }
  function buildEngagementSquareBlockout(fac) {
    const S = 0.72;
    const sc = (v) => v * S;
    const yellow = mapMat(fac.neon, fac.neon, 0.1);
    const orange = mapMat(0xff6a00, 0xff6a00, 0.05);
    const purple = mapMat(0x9b59ff, 0x9b59ff, 0.14);
    const cyan = mapMat(0x00e5ff, 0x00e5ff, 0.18);
    const black = mapMat(0x06070a, 0x000000, 0);
    const metal = mapMat(0x30343b, 0x000000, 0);
    const contain = mapMat(0x15171d, 0x000000, 0);
    const soft = mapMat(0xff3158, 0xff3158, 0.08);

    mapPlane('ENGAGEMENT_SQUARE_MAIN_PLAZA_KILLZONE', 0, 0.045, 0, sc(72), sc(50), new THREE.MeshBasicMaterial({ color: 0x3b3400, transparent: true, opacity: 0.15, depthWrite: false }));
    mapPlane('ENGAGEMENT_SQUARE_OBJECTIVE_RING', 0, 0.06, sc(-4), sc(18), sc(18), new THREE.MeshBasicMaterial({ color: fac.neon, transparent: true, opacity: 0.18, depthWrite: false }));

    mapBox('ENGAGEMENT_STAGE_platform_objective_control', [0, 0, sc(-32), sc(24), 1.4, sc(8)], black);
    mapBox('ENGAGEMENT_STAGE_back_wall_billboard_support', [0, 1.4, sc(-36.2), sc(29), 8.2, 0.8], metal);
    mapSign('SHILLZ LIVE\nOBEY. REPEAT.', 0, 9.2, sc(-37), sc(24), 5.2, fac.neon, 0);
    mapBox('speaker_tower_L', [sc(-16.5), 0, sc(-33), 1.4, 7.8, 1.4], black);
    mapBox('speaker_tower_R', [sc(16.5), 0, sc(-33), 1.4, 7.8, 1.4], black);

    const cover = [
      [-22,-6,5,2,'sponsor_barrier'],[-15,-3,4,2,'speaker_case'],[-7,-5,5,2,'media_riser'],[3,-7,5,2,'ad_block'],
      [12,-5,5,2,'newsstand'],[21,-8,7,2,'barricade'],[27,-5,4,2,'speaker_case'],[32,-1,6,2,'ad_block'],
      [-29,5,7,2,'merch_table'],[-20,9,5,2,'sponsor_barrier'],[-9,8,6,2,'speaker_case'],[7,9,5,2,'ad_block'],
      [18,8,8,2,'merch_table'],[28,10,5,2,'newsstand'],
    ];
    function addCoverVariant(c, i) {
      const [x, z, sx, sz, type] = c;
      const bx = sc(x), bz = sc(z), bsx = sc(sx), bsz = sc(sz);
      if (type === 'speaker_case') {
        mapBox('SHILLZ_SPEAKER_CASE_collidable_' + i, [bx, 0, bz, bsx, 0.95, bsz], black, { climb: true });
        mapBox('SHILLZ_SPEAKER_STACK_visual_' + i, [bx - bsx * 0.22, 0.95, bz, bsx * 0.28, 1.1, bsz * 0.75], yellow, { collide: false });
      } else if (type === 'merch_table') {
        mapBox('SHILLZ_MERCH_TABLE_jumpable_' + i, [bx, 0, bz, bsx, 0.82, bsz], yellow, { climb: true });
        mapBox('SHILLZ_MERCH_CANOPY_visual_' + i, [bx, 1.95, bz, bsx * 1.08, 0.22, bsz * 1.35], black, { collide: false });
      } else if (type === 'newsstand') {
        mapBox('SHILLZ_NEWSSTAND_blocker_' + i, [bx, 0, bz, bsx, 1.65, bsz], metal, { climb: false });
        mapSign('BUY\nRISE', bx, 1.95, bz - bsz * 0.54, Math.max(2.2, bsx * 0.9), 1.2, fac.neon, 0);
      } else if (type === 'media_riser') {
        mapBox('SHILLZ_MEDIA_RISER_jumpable_' + i, [bx, 0, bz, bsx, 1.05, bsz], cyan, { climb: true });
        mapBox('SHILLZ_MEDIA_RISER_trim_' + i, [bx, 1.05, bz, bsx, 0.12, bsz], yellow, { collide: false });
      } else if (type === 'barricade') {
        mapBox('SHILLZ_CROWD_BARRICADE_' + i, [bx, 0, bz, bsx, 1.15, bsz], orange, { climb: true });
      } else {
        mapBox('SHILLZ_SPONSOR_BARRIER_' + i, [bx, 0, bz, bsx, 0.92, bsz], i % 2 ? metal : yellow, { climb: true });
      }
    }
    cover.forEach((c, i) => addCoverVariant(c, i));
    mapBox('ENGAGEMENT_CHOKE_right_barricade_A', [sc(26), 0, sc(-3), sc(13), 1.15, sc(2)], orange, { climb: true });
    mapBox('ENGAGEMENT_CHOKE_right_barricade_B', [sc(32), 0, sc(5), sc(2), 1.15, sc(14)], orange, { climb: true });
    mapBox('ENGAGEMENT_CHOKE_mid_low_wall', [0, 0, sc(8), sc(16), 0.9, 0.8], metal, { climb: true });

    mapBox('MERCH_KIOSK_LOOT_counter', [sc(-34), 0, sc(18), sc(13), 2.0, sc(7)], black);
    mapBox('MERCH_KIOSK_LOOT_awning', [sc(-34), 2.0, sc(18), sc(15), 0.45, sc(8.5)], yellow);
    mapSign('MERCH\nOBEY', sc(-34), 4.4, sc(13.4), sc(11), 2.8, fac.neon, 0);
    mapBox('SUBWAY_ACCESS_stair_void', [sc(28), -0.02, sc(22), sc(17), 0.12, sc(12)], black);
    mapSign('SHILLZ TRANSIT\nOBEY ON TIME', sc(28), 3.5, sc(14.6), sc(12), 2.8, fac.neon, 0);

    mapBox('UPPER_FLANK_left_bridge', [sc(-33.5), 5.2, sc(-5), sc(5), 0.45, sc(32)], cyan);
    mapBox('UPPER_FLANK_crosscatwalk', [sc(-14), 6.1, sc(-24), sc(34), 0.45, sc(4)], cyan);
    mapBox('REBEL_GRAFFITI_ALLEY_wall', [sc(43), 0, sc(16), 0.8, 5.4, sc(24)], purple);
    mapSign('THE FEED\nIS A LIE', sc(42.5), 4.0, sc(16), 5.0, 3.4, 0x9b59ff, Math.PI / 2);
    mapPlane('REBEL_GRAFFITI_ALLEY_floor_route', sc(40), 0.07, sc(16), sc(7), sc(24), new THREE.MeshBasicMaterial({ color: 0x9b59ff, transparent: true, opacity: 0.16, depthWrite: false }));

    mapPlane('main_route_forward', 0, 0.08, sc(13), sc(4), sc(34), new THREE.MeshBasicMaterial({ color: fac.neon, transparent: true, opacity: 0.18, depthWrite: false }));
    mapPlane('left_flank_route', sc(-30), 0.08, sc(3), sc(4), sc(34), new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.16, depthWrite: false }));
    mapPlane('right_flank_route_to_graffiti_alley', sc(38), 0.08, sc(10), sc(3), sc(28), new THREE.MeshBasicMaterial({ color: 0x9b59ff, transparent: true, opacity: 0.16, depthWrite: false }));
    mapPlane('hazard_pressure_lane', sc(20), 0.09, sc(-6), sc(5), sc(18), new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0.16, depthWrite: false }));

    mapBox('CONTAINMENT_SOUTH_main_shutter_wall', [0, 0, sc(31.5), sc(74), 5.4, 1.4], contain);
    mapBox('CONTAINMENT_NORTH_stage_backstop_wall', [0, 0, sc(-42.5), sc(78), 8.6, 1.6], contain);
    mapBox('CONTAINMENT_WEST_service_wall', [sc(-52), 0, sc(1), 1.8, 8.2, sc(62)], contain);
    mapBox('CONTAINMENT_EAST_back_alley_wall', [sc(52), 0, sc(1), 1.8, 8.2, sc(62)], contain);
    mapBox('CONTAINMENT_LOW_RAIL_south_left', [sc(-20), 0, sc(24.7), sc(24), 0.9, 0.8], soft);
    mapBox('CONTAINMENT_LOW_RAIL_south_right', [sc(12), 0, sc(24.7), sc(18), 0.9, 0.8], soft);
    mapBox('CONTAINMENT_LOW_RAIL_west_front', [sc(-38.8), 0, sc(12), 0.8, 0.9, sc(18)], soft);
    mapBox('CONTAINMENT_LOW_RAIL_east_front', [sc(38.8), 0, sc(4), 0.8, 0.9, sc(22)], soft);

    mapSign('EXTRACTION\nLOCKED UNTIL\nOBJECTIVE CLEAR', sc(28), 4.2, sc(29), sc(10), 2.4, fac.neon, 0);
    mapSign('TRUST\nTHE FEED', sc(-31), 10.5, sc(-25), sc(12), 5, fac.neon, 0.25);
    mapSign('RESIST? LOL.\nCONSUME.', sc(31), 10.5, sc(-18), sc(12), 5, fac.neon, -0.25);
  }

  /* ---------- build scenery ---------- */
  function build(scene, dIdx) {
    if (group) { scene.remove(group); disposeGroup(group); }
    group = new THREE.Group(); scene.add(group);
    signMats = []; holos = []; colliders = []; spawnCursor = 0;
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
    if (theme.map !== 'engagementSquare' && wallGeos.length) {
      const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(wallGeos);
      const wm = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.8, metalness: 0.2 }));
      group.add(wm);
      wallGeos.forEach(g => g.dispose());
    }
    if (theme.map !== 'engagementSquare' && crateGeos.length) {
      const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(crateGeos);
      const cm = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ map: Assets.crateTex(theme), roughness: 0.7, metalness: 0.3 }));
      group.add(cm);
      crateGeos.forEach(g => g.dispose());
    }
    if (theme.map === 'engagementSquare') { wallGeos.forEach(g => g.dispose()); crateGeos.forEach(g => g.dispose()); }

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

    if (theme.map === 'engagementSquare') buildEngagementSquareBlockout(fac);

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
    if (colliders.length) {
      const steps = Math.max(2, Math.min(80, Math.ceil(maxDist / 0.35)));
      for (let i = 1; i <= steps; i++) {
        const t = maxDist * i / steps;
        if (t >= best) break;
        const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
        for (const c of colliders) {
          if (y >= c.y0 - 0.05 && y <= c.h + 0.05 && pointInRect(c, x, z)) {
            best = t; hit = true; ground = false;
            break;
          }
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

  // Enemy/nav movement remains grid-only. Player movement adds authored prop collision.
  function moveCircle(x, z, dx, dz, r) {
    return moveWithHitTest(x, z, dx, dz, r, circleHits);
  }
  function movePlayerCircle(x, z, dx, dz, r, y) {
    return moveWithHitTest(x, z, dx, dz, r, (cx, cz, cr) => circleHits(cx, cz, cr) || playerPropHits(cx, cz, cr, y));
  }
  function moveWithHitTest(x, z, dx, dz, r, hitTest) {
    let nx = x + dx, nz = z + dz;
    if (hitTest(nx, z, r)) nx = x;
    if (hitTest(nx, nz, r)) nz = z;
    if (hitTest(nx, nz, r)) { nx = x; nz = z; }
    return { x: nx, z: nz };
  }
  function gridCircleHits(x, z, r) {
    const minCx = Math.floor((x - r + HALF_W) / CELL), maxCx = Math.floor((x + r + HALF_W) / CELL);
    const minCy = Math.floor((z - r + HALF_H) / CELL), maxCy = Math.floor((z + r + HALF_H) / CELL);
    for (let cy = minCy; cy <= maxCy; cy++) for (let cx = minCx; cx <= maxCx; cx++) {
      if (cellH(cx, cy) <= 0.5) continue;
      const x0 = cx * CELL - HALF_W, z0 = cy * CELL - HALF_H;
      const px = Math.max(x0, Math.min(x, x0 + CELL)), pz = Math.max(z0, Math.min(z, z0 + CELL));
      if ((px - x) * (px - x) + (pz - z) * (pz - z) < r * r) return true;
    }
    return false;
  }
  function playerColliderBlocks(c, x, z, r, y) {
    if (!rectCircleHit(c, x, z, r)) return false;
    if (c.y0 > y + CFG.PLAYER_H) return false;
    return !(c.climb && y + 0.18 >= c.h);
  }
  function spawnBlockedByProp(x, z, r) {
    return colliders.some(c => rectCircleHit(c, x, z, r));
  }
  function circleHits(x, z, r) {
    return gridCircleHits(x, z, r);
  }
  function playerPropHits(x, z, r, y) {
    return colliders.some(c => playerColliderBlocks(c, x, z, r, y));
  }
  function groundHeight(x, z, r) {
    let h = 0;
    for (const c of colliders) {
      if (c.climb && rectCircleHit(c, x, z, r || CFG.PLAYER_R * 0.8)) h = Math.max(h, c.h);
    }
    return h;
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

  function engagementSpawnZone(x, z) {
    // Authored ShillZ play space is inside the visible containment walls. The
    // coarse 17x17 nav grid extends behind those walls, so do not use every
    // grid-free cell as a wave spawn candidate on this map.
    return Math.abs(x) <= 28 && z >= -24 && z <= 20;
  }
  function spawnZoneAllows(x, z) {
    return themeRef?.map !== 'engagementSquare' || engagementSpawnZone(x, z);
  }
  function spawnPointSafe(x, z, px, pz, minD) {
    return spawnZoneAllows(x, z)
      && Math.hypot(x - px, z - pz) >= minD
      && !circleHits(x, z, 0.8)
      && !spawnBlockedByProp(x, z, 0.8);
  }
  function randomSpawn(px, pz, minD) {
    const safeCells = freeCells.filter(c => {
      const { x, z } = cellCenter(c.cx, c.cy);
      return spawnPointSafe(x, z, px, pz, minD);
    });
    if (safeCells.length) {
      const c = safeCells[spawnCursor % safeCells.length];
      spawnCursor += 7;
      return cellCenter(c.cx, c.cy);
    }

    // If the player is standing near the only safe cells, still pick an in-map,
    // unblocked spawn instead of falling back to cells behind containment.
    const inMapCells = freeCells.filter(c => {
      const { x, z } = cellCenter(c.cx, c.cy);
      return spawnZoneAllows(x, z) && !circleHits(x, z, 0.8) && !spawnBlockedByProp(x, z, 0.8);
    });
    const fallbackCells = inMapCells.length ? inMapCells : freeCells;
    const c = fallbackCells[spawnCursor % fallbackCells.length];
    spawnCursor += 7;
    return cellCenter(c.cx, c.cy);
  }

  function playerStart() {
    if (spawnCell) return cellCenter(spawnCell.cx, spawnCell.cy);
    // clear corner near (2,2)
    for (const c of freeCells) if (c.cx <= 3 && c.cy <= 3) return cellCenter(c.cx, c.cy);
    return cellCenter(freeCells[0].cx, freeCells[0].cy);
  }
  function bossArena() {
    if (bossCell) return cellCenter(bossCell.cx, bossCell.cy);
    return cellCenter((W - 1) / 2, (H - 1) / 2);
  }

  return { build, tick, raycast, losClear, moveCircle, movePlayerCircle, circleHits, playerPropHits, groundHeight, computeFlow, flowDir, randomSpawn, playerStart, bossArena, worldToCell, cellCenter, cellH, get group() { return group; }, get colliders() { return colliders; } };
})();
