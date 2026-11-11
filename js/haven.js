/* EARTH 2049: SAVE SEED 7 — Rebel Haven runtime ("the Undercroft")
 *
 * The level itself (geometry, baked lighting, colliders) comes from game-art-pipeline's
 * forge.maps build (assets/maps/haven/). This module brings it to life from the layout:
 *
 *   props        pipeline prop GLBs, lit by the level's baked light probes
 *   named NPCs   5on, Box, Ninj, the Commander, Kat and the market vendors: idle cycles,
 *                head tracking, barks, dialogue that opens the hub's services
 *   holograms    faction leaders over the Ops holotable, the Commander on the relay
 *   crowds       RNG-variant civilians and couch surfers walking a waypoint graph and doing
 *                things at points of interest; dancers locked to the music's bar clock;
 *                the Serverless horde, which shambles to the quarantine fence when you come near
 *   wardrobe     the Fitting Room: Seam (built from the player avatar kit), the player's own avatar on the dais,
 *                two mannequins wearing today's Daily Drop; haven feats (walk, hang out, dance, talk) feed js/wardrobe.js
 *   jumbotron    live equaliser from the music, a news ticker, and Turing breaking in
 *   fx           rain through the street grates, barrel fires, the Dreamcaster portal, dust
 *   light        dynamic lights that flicker, pulse and beat with the song; everything that
 *                moves samples the baked probe grid so it sits in the same light as the walls
 *   sound        the song plays from the speaker tower; fires, crowd and the horde are positional
 */
'use strict';

const Haven = (() => {
  const S = { active: false };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const rand = (a, b) => a + Math.random() * (b - a);              // NOSONAR - ambient life, not security
  const pick = a => a[Math.floor(Math.random() * a.length)];        // NOSONAR
  const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * Math.min(1, t); };
  const STEP = () => (window.PS1Mode?.enabled ? 1 / 15 : 0);

  /* ------------------------------------------------------------ loading */
  async function loadModel(key) {
    const url = HAVEN_MODELS[key];
    if (!url) return null;
    const g = await AssetLoader.loadModel('haven.' + key, url);
    if (g) await Variants.prepare(g);
    return g;
  }
  async function loadProp(name) {
    return AssetLoader.loadModel('prop.' + name, 'assets/models/haven/props/' + name + '.glb');
  }

  /* ------------------------------------------------------------ light probes */
  function decodeProbes(p) {
    if (!p) return null;
    const bin = atob(p.rgb8); const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    return { ...p, data };
  }
  const probeCol = new THREE.Color();
  function probeAt(x, y, z, out = probeCol) {
    const P = S.probes;
    if (!P) return out.setRGB(1, 1, 1);
    const [nx, ny, nz] = P.dims, [ox, oy, oz] = P.origin, [sx, sy, sz] = P.step;
    const fx = Math.min(nx - 1.001, Math.max(0, (x - ox) / sx)), fy = Math.min(ny - 1.001, Math.max(0, (y - oy) / sy)), fz = Math.min(nz - 1.001, Math.max(0, (z - oz) / sz));
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz), tx = fx - ix, ty = fy - iy, tz = fz - iz;
    let r = 0, g = 0, b = 0;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
      const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz);
      const i = (((ix + dx) * ny + (iy + dy)) * nz + (iz + dz)) * 3;
      r += P.data[i] * w; g += P.data[i + 1] * w; b += P.data[i + 2] * w;
    }
    const k = P.scale / 255;
    return out.setRGB(r * k, g * k, b * k);
  }

  /* ------------------------------------------------------------ materials */
  const holoMats = {};
  function holoMaterial(hex) {
    if (holoMats[hex]) return holoMats[hex];
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(hex) }, uTime: { value: 0 }, uBeat: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vW; varying vec3 vV;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uBeat; varying vec3 vN; varying vec3 vW; varying vec3 vV;
        void main(){ float rim = pow(1.0 - abs(dot(normalize(vN), vV)), 1.6);
          float scan = 0.55 + 0.45 * step(0.5, fract(vW.y * 18.0 - uTime * 2.0));
          float band = smoothstep(0.0, 0.08, abs(fract(vW.y * 0.6 - uTime * 0.35) - 0.5));
          float flick = 0.86 + 0.14 * sin(uTime * 47.0 + vW.y * 3.0);
          float a = (0.3 + rim * 1.0) * scan * flick * (0.7 + 0.3 * band) * (0.9 + uBeat * 0.25);
          gl_FragColor = vec4(uColor * (0.6 + rim * 1.4), a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    holoMats[hex] = m;
    S.holoMats.push(m);
    return m;
  }
  /** Per-instance PS1 materials: per-vertex Lambert, tinted every few frames by the probe grid. */
  function litMaterials(root) {
    const mats = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const conv = m => {
        if (!m) return m;
        if (m.name === 'glow') return new THREE.MeshBasicMaterial({ vertexColors: true, map: m.map || null });
        const lm = new THREE.MeshLambertMaterial({
          map: m.map || null, vertexColors: !!o.geometry.attributes.color,
          emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0, 0, 0), emissiveMap: m.emissiveMap || null,
          side: m.side, transparent: m.transparent, alphaTest: m.alphaTest || 0,
        });
        if (m.name === 'prop' && !m.map) lm.flatShading = true;
        mats.push(lm);
        return lm;
      };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
    return mats;
  }
  function holoize(root, hex) {
    const m = holoMaterial(hex);
    root.traverse(o => { if (o.isMesh) { o.material = m; o.frustumCulled = false; } });
  }

  /* ------------------------------------------------------------ characters */
  function makeChar(key, opts = {}) {
    const gltf = AssetLoader.getModel('haven.' + key);
    if (!gltf) return null;
    const root = THREE.SkeletonUtils.clone(gltf.scene);
    let mats = [];
    if (opts.hologram) holoize(root, opts.hologram); else mats = litMaterials(root);
    let info = null;
    if (opts.seed != null && !opts.hologram) info = Variants.roll(gltf, root, opts.seed);
    // normalise to a human height, feet on the floor
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const h = Math.max(0.1, box.max.y - box.min.y);
    const k = (opts.height || 1.76) * (opts.scale || 1) / h;
    root.scale.multiplyScalar(k);
    root.position.y -= box.min.y * k;
    const obj = new THREE.Group(); obj.add(root);
    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    for (const clip of gltf.animations || []) actions[clip.name] = mixer.clipAction(clip);
    const alias = { ...(gltf.scene.userData?.clip_alias || {}), ...(opts.alias || {}) };
    const ch = { key, obj, root, mixer, actions, alias, mats, head: root.getObjectByName('head'), cur: null, acc: 0,
      lightT: 0, yaw: opts.yaw || 0, title: info?.title };
    ch.play = (name, fade = 0.3, loop = true) => {
      let n = alias[name] || name;
      if (!actions[n]) n = actions['Idle'] ? 'Idle' : Object.keys(actions)[0];
      if (!n || ch.cur === n) return;
      const next = actions[n];
      next.reset(); next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); next.clampWhenFinished = !loop; next.play();
      if (ch.cur && actions[ch.cur]) actions[ch.cur].crossFadeTo(next, fade, false);
      ch.cur = n;
    };
    ch.play(opts.anim || 'Idle', 0);
    if (opts.phase) mixer.update(opts.phase);
    return ch;
  }
  const _q = new THREE.Quaternion(), _up = V3(0, 1, 0);
  function animate(ch, dt) {
    const step = STEP();
    if (!step) ch.mixer.update(dt);
    else { ch.acc += dt; if (ch.acc >= step) { const n = Math.floor(ch.acc / step); ch.acc -= n * step; ch.mixer.update(n * step); } }
    ch.obj.rotation.y = ch.yaw;
    if (ch.head && ch.lookYaw) { _q.setFromAxisAngle(_up, ch.lookYaw); ch.head.quaternion.multiply(_q); }
    ch.lightT -= dt;
    if (ch.lightT <= 0 && ch.mats.length) {
      ch.lightT = 0.25;
      const p = ch.obj.position;
      probeAt(p.x, p.y + 1.1, p.z);
      for (const m of ch.mats) m.color.copy(probeCol);
    }
  }
  function lookAtPlayer(ch, px, pz, maxDist, dt) {
    const p = ch.obj.position;
    const dx = px - p.x, dz = pz - p.z, d = Math.hypot(dx, dz);
    let want = 0;
    if (d < maxDist) {
      const toP = Math.atan2(dx, dz);                       // model faces +Z at yaw 0
      let rel = ((toP - ch.yaw + Math.PI) % (Math.PI * 2)) - Math.PI; if (rel < -Math.PI) rel += Math.PI * 2;
      if (Math.abs(rel) < 1.9) want = Math.max(-1.05, Math.min(1.05, rel));
    }
    ch.lookYaw = (ch.lookYaw || 0) + (want - (ch.lookYaw || 0)) * Math.min(1, dt * 4);
  }

  /* ------------------------------------------------------------ text sprites (name tags, barks) */
  function textSprite(lines, color = '#ffffff', sub = null, w = 512) {
    const c = document.createElement('canvas'); c.width = w; c.height = 96;
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    spr.renderOrder = 20;
    const draw = (text, col = color, subText = sub) => {
      const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 30px Consolas, monospace'; x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.fillStyle = col;
      const words = String(text).split(' '); const ls = []; let line = '';
      for (const wd of words) { if ((line + ' ' + wd).length > 30) { ls.push(line); line = wd; } else line = line ? line + ' ' + wd : wd; }
      ls.push(line);
      const y0 = subText ? 34 : 48 - (ls.length - 1) * 16;
      ls.slice(0, 3).forEach((l, i) => { x.strokeText(l, w / 2, y0 + i * 32); x.fillText(l, w / 2, y0 + i * 32); });
      if (subText) { x.font = '20px Consolas, monospace'; x.fillStyle = 'rgba(220,210,255,0.9)'; x.strokeText(subText, w / 2, 74); x.fillText(subText, w / 2, 74); }
      tex.needsUpdate = true;
    };
    draw(lines);
    spr.scale.set(2.6 * (w / 512), 0.49, 1);
    spr.userData.draw = draw;
    return spr;
  }

  /* ------------------------------------------------------------ waypoints */
  function buildGraph(wp) {
    const nodes = {}, adj = {};
    for (const [k, n] of Object.entries(wp.nodes)) { nodes[k] = n; adj[k] = []; }
    for (const [a, b] of wp.edges) { if (adj[a] && adj[b]) { adj[a].push(b); adj[b].push(a); } }
    return { nodes, adj };
  }
  function nearestNode(x, z, filter) {
    let best = null, bd = Infinity;
    for (const [k, n] of Object.entries(S.graph.nodes)) {
      if (filter && !filter(n, k)) continue;
      const d = (n.pos[0] - x) ** 2 + (n.pos[2] - z) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  function path(a, b) {
    const { nodes, adj } = S.graph;
    const dist = { [a]: 0 }, prev = {}, open = new Set([a]);
    while (open.size) {
      let u = null; for (const k of open) if (u === null || dist[k] < dist[u]) u = k;
      open.delete(u);
      if (u === b) break;
      for (const v of adj[u]) {
        const d = dist[u] + Math.hypot(nodes[u].pos[0] - nodes[v].pos[0], nodes[u].pos[2] - nodes[v].pos[2]);
        if (dist[v] === undefined || d < dist[v]) { dist[v] = d; prev[v] = u; open.add(v); }
      }
    }
    if (dist[b] === undefined) return [b];
    const out = []; for (let k = b; k !== undefined; k = prev[k]) out.unshift(k);
    return out;
  }

  /* ------------------------------------------------------------ crowd */
  const TAG_ACT = { bench: ['Check Feed', 'Idle Hip'], screen: ['Idle', 'Selfie'], feed: ['Check Feed', 'Selfie'], shop: ['Talk', 'Idle Hip'],
    fire: ['Idle', 'Talk'], fence: ['Talk', 'Check Feed'], dance: ['Dance', 'Hype'], clinic: ['Idle Hip'], holo: ['Idle'], rig: ['Wave'] };
  function spawnAgent(kind, model, x, y, z, seed) {
    const ch = makeChar(model, { seed, yaw: rand(-Math.PI, Math.PI), phase: rand(0, 3) });
    if (!ch) return null;
    ch.obj.position.set(x, y, z);
    S.group.add(ch.obj);
    const a = { ch, kind, y, speed: kind === 'horde' ? rand(0.35, 0.55) : rand(1.0, 1.45), state: 'idle', t: rand(0.5, 6), path: [], target: null,
      barkT: rand(4, 20), tag: null, focus: null };
    S.agents.push(a);
    return a;
  }
  function zoneRand(z) { return [rand(z.min[0], z.max[0]), rand(z.min[2], z.max[2])]; }
  function buildCrowds(layout) {
    let seed = 1000;
    const fires = layout.fx.filter(f => f.kind === 'fire');
    for (const z of layout.zones) {
      const models = HAVEN_CROWD_MODELS[z.kind === 'camp' ? 'camp' : z.kind === 'horde' ? 'horde' : z.kind === 'dance' ? 'dance' : 'wander'];
      if (!models || !z.count) continue;
      const n = Math.round(z.count * (S.lowSpec ? 0.5 : 1));
      for (let i = 0; i < n; i++) {
        const model = models[i % models.length];
        let [x, zz] = zoneRand(z);
        if (z.kind === 'camp' && fires.length) {
          const f = fires[i % fires.length]; const a = rand(0, Math.PI * 2), r = rand(1.4, 2.4);
          x = f.pos[0] + Math.cos(a) * r; zz = f.pos[2] + Math.sin(a) * r;
        }
        const ag = spawnAgent(z.kind === 'market' ? 'wander' : z.kind, model, x, z.min[1], zz, seed += 7919);
        if (!ag) continue;
        ag.zone = z;
        if (z.kind === 'camp') { const f = fires[i % fires.length]; ag.focus = f ? [f.pos[0], f.pos[2]] : null; ag.ch.play(Math.random() < 0.6 ? 'VR Idle' : 'Idle', 0); }
        if (z.kind === 'dance') { ag.focus = [rand(-1, 1), -2]; ag.state = 'dance'; ag.ch.play(pick(['Dance', 'Hype', 'Dance']), 0); }
        if (z.kind === 'horde') ag.ch.play('Idle', 0);
      }
    }
  }
  function steer(a, tx, tz, dt, speed) {
    const p = a.ch.obj.position;
    let dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) return true;
    dx /= d; dz /= d;
    // personal space: slow down and sidestep for the player
    const pp = S.player;
    const px = pp.x - p.x, pz = pp.z - p.z, pd = Math.hypot(px, pz);
    let sp = speed;
    if (pd < 1.6 && (px * dx + pz * dz) > 0) { sp *= 0.35; dx -= pz / pd * 0.8; dz += px / pd * 0.8; }
    const l = Math.hypot(dx, dz) || 1;
    p.x += dx / l * sp * dt; p.z += dz / l * sp * dt;
    a.ch.yaw = lerpAngle(a.ch.yaw, Math.atan2(dx, dz), dt * 6);
    return false;
  }
  function separate(dt) {
    const A = S.agents;
    for (let i = 0; i < A.length; i++) {
      const p = A[i].ch.obj.position;
      for (let j = i + 1; j < A.length; j++) {
        const q = A[j].ch.obj.position;
        const dx = q.x - p.x, dz = q.z - p.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.5 && d2 > 1e-6 && Math.abs(p.y - q.y) < 1) {
          const d = Math.sqrt(d2), push = (0.71 - d) * 0.5 / d * Math.min(1, dt * 8);
          p.x -= dx * push; p.z -= dz * push; q.x += dx * push; q.z += dz * push;
        }
      }
    }
  }
  function tickAgent(a, dt, beat) {
    const ch = a.ch, p = ch.obj.position;
    a.t -= dt;
    if (a.kind === 'dance') {
      if (beat.live && beat.bar !== a.lastBar && beat.bar % 4 === 0) { a.lastBar = beat.bar; if (Math.random() < 0.5) ch.play(pick(['Dance', 'Hype', 'Dance', 'Wave'])); } // NOSONAR
      ch.yaw = lerpAngle(ch.yaw, Math.atan2(a.focus[0] - p.x, a.focus[1] - p.z), dt * 2);
      // bounce to the beat
      ch.root.position.y = ch.root.userData.y0 ?? (ch.root.userData.y0 = ch.root.position.y);
      ch.root.position.y += Math.max(0, Math.sin(beat.phase * Math.PI)) * 0.06 * (beat.live ? 1 : 0.4);
      return;
    }
    if (a.kind === 'horde') return tickHorde(a, dt);
    if (a.kind === 'camp') {
      if (a.state === 'walk') {
        if (steer(a, a.target[0], a.target[1], dt, 0.7)) { a.state = 'idle'; a.t = rand(10, 24); ch.play(Math.random() < 0.6 ? 'VR Idle' : 'Idle'); } // NOSONAR
      } else {
        if (a.focus) ch.yaw = lerpAngle(ch.yaw, Math.atan2(a.focus[0] - p.x, a.focus[1] - p.z), dt * 2);
        if (a.t <= 0) {
          const fires = S.layout.fx.filter(f => f.kind === 'fire'); const f = pick(fires);
          const an = rand(0, Math.PI * 2), r = rand(1.4, 2.4);
          a.target = [f.pos[0] + Math.cos(an) * r, f.pos[2] + Math.sin(an) * r]; a.focus = [f.pos[0], f.pos[2]];
          a.state = 'walk'; ch.play('VR Walk');
          if (!ch.actions[ch.alias['VR Walk'] || 'VR Walk']) ch.play('Walk');
        }
      }
      return;
    }
    // wanderers: walk the graph, do something at each stop
    if (a.state === 'walk') {
      const nk = a.path[0];
      const n = S.graph.nodes[nk];
      if (!n) { a.state = 'idle'; return; }
      const jitter = a.jit || (a.jit = [rand(-0.8, 0.8), rand(-0.8, 0.8)]);
      if (steer(a, n.pos[0] + jitter[0], n.pos[2] + jitter[1], dt, a.speed)) {
        a.path.shift(); a.jit = null;
        if (!a.path.length) {
          a.state = 'act'; a.tag = (n.tags || [])[0] || null;
          a.t = rand(5, 14);
          ch.play(a.tag ? pick(TAG_ACT[a.tag] || ['Idle']) : pick(['Idle', 'Check Feed', 'Idle Hip']));
          a.face = a.tag === 'screen' || a.tag === 'fence' ? Math.PI : a.tag === 'shop' ? (p.x > 26.8 ? Math.PI / 2 : -Math.PI / 2) : a.tag === 'dance' ? Math.atan2(0 - p.x, -2 - p.z) : null;
        }
      }
      if (n) p.y += ((n.pos[1] || 0) - p.y) * Math.min(1, dt * 4);
    } else {
      if (a.face != null) ch.yaw = lerpAngle(ch.yaw, a.face, dt * 2.5);
      if (a.t <= 0) {
        const here = nearestNode(p.x, p.z);
        let dest = pick(Object.keys(S.graph.nodes));
        if (a.zone?.name === 'market' && Math.random() < 0.7) dest = pick(['m_n', 'm_c', 'm_s', 'm_data', 'm_gate']); // NOSONAR
        if (dest === here) return;
        a.path = path(here, dest); a.state = 'walk'; ch.play('Walk');
      }
    }
  }
  function tickHorde(a, dt) {
    const ch = a.ch, p = ch.obj.position, pl = S.player;
    const z = a.zone;
    const near = pl.x > z.min[0] - 2 && pl.x < z.max[0] + 2 && pl.z > -19 && pl.z < -13 && Math.hypot(pl.x - p.x, pl.z - p.z) < 11;
    if (near) {
      const fx = Math.max(z.min[0] + 0.4, Math.min(z.max[0] - 0.4, pl.x + (a.off ?? (a.off = rand(-1.6, 1.6)))));
      const fz = -19.45;
      if (Math.hypot(fx - p.x, fz - p.z) > 0.35) {
        steer(a, fx, fz, dt, a.speed * 2.1);
        if (a.state !== 'lurch') { a.state = 'lurch'; ch.play('Run'); }
      } else {
        ch.yaw = lerpAngle(ch.yaw, Math.PI * 0, dt * 3);
        if (a.state !== 'grab') { a.state = 'grab'; ch.play('Punch Combo'); }
        S.fenceRattle = Math.min(1, (S.fenceRattle || 0) + dt * 0.8);
      }
      return;
    }
    if (a.state === 'lurch' || a.state === 'grab') { a.state = 'idle'; a.t = rand(1, 4); ch.play('Idle'); }
    if (a.state === 'walk') {
      if (steer(a, a.target[0], a.target[1], dt, a.speed)) { a.state = 'idle'; a.t = rand(3, 9); ch.play('Idle'); }
    } else if (a.t <= 0) {
      a.target = zoneRand(z); a.state = 'walk'; ch.play('Walk');
    }
  }

  /* ------------------------------------------------------------ named NPCs + holograms */
  function buildNPCs(layout) {
    for (const a of layout.actors) {
      const def = HAVEN_NPCS[a.model];
      if (!def || def.avatar) continue;              // avatar-kit NPCs are built in buildWardrobe once the kit loads
      const holo = def.hologram || null;
      const ch = makeChar(def.model, { hologram: holo, yaw: a.yaw, seed: def.seed, scale: a.scale || def.scale || 1 });
      if (!ch) continue;
      ch.obj.position.set(a.pos[0], a.pos[1], a.pos[2]);
      S.group.add(ch.obj);
      const npc = { id: a.model, def, ch, home: a.yaw, x: a.pos[0], y: a.pos[1], z: a.pos[2], holo: !!holo, intel: !!def.intel,
        idleT: rand(4, 10), barkT: rand(2, 8), seen: false, waveT: 0 };
      if (!npc.intel) {
        npc.tag = textSprite(def.name, '#ffffff', def.title);
        npc.tag.position.set(0, (a.scale || 1) * 2.15, 0);
        ch.obj.add(npc.tag);
      }
      if (holo) {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, npc.intel ? 0.35 : 0.6, npc.intel ? 0.9 : 2.2, 12, 1, true),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(holo), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.set(a.pos[0], a.pos[1] + (npc.intel ? 0.45 : 1.1), a.pos[2]);
        beam.rotation.x = Math.PI;
        S.group.add(beam); npc.beam = beam;
        ch.play(npc.intel ? pick(['Taunt', 'Idle', 'Idle Combat']) : 'Talk', 0);
      }
      S.npcs.push(npc);
    }
    // the faction leaders slowly orbit the holotable
    const table = layout.markers.find(m => m.kind === 'holotable');
    S.table = table ? table.pos : null;
  }
  function tickNPC(n, dt, beat) {
    const ch = n.ch, pl = S.player;
    const dx = pl.x - n.x, dz = pl.z - n.z, d = Math.hypot(dx, dz);
    if (n.intel && S.table) {
      const a = Math.atan2(n.z - S.table[2], n.x - S.table[0]) + dt * 0.12;
      const r = Math.hypot(n.x - S.table[0], (n.z - S.table[2]) / 0.7);
      n.x = S.table[0] + Math.cos(a) * r; n.z = S.table[2] + Math.sin(a) * r * 0.7;
      ch.obj.position.set(n.x, n.y + Math.sin(S.t * 1.3 + a) * 0.04, n.z);
      n.beam.position.set(n.x, n.y + 0.45, n.z);
      ch.yaw += dt * 0.6;
    } else if (!n.holo || n.id === 'npc:commander') {
      const talking = S.dialog?.npc === n;
      if (d < 4.2 || talking) ch.yaw = lerpAngle(ch.yaw, Math.atan2(dx, dz), dt * (talking ? 6 : 1.6));
      else ch.yaw = lerpAngle(ch.yaw, n.home, dt * 0.8);
      lookAtPlayer(ch, pl.x, pl.z, 6, dt);
      if (talking) ch.play('Talk');
      else if (d < 4.2 && !n.seen && n.waveT <= 0) { n.seen = true; n.waveT = 30; ch.play('Wave', 0.2); n.idleT = 2.2; }
      else {
        n.idleT -= dt;
        if (n.idleT <= 0) { n.idleT = rand(5, 11); ch.play(n.holo ? 'Talk' : pick(['Idle', 'Idle', 'Check Feed', 'Idle Hip', 'Talk'])); }
      }
      n.waveT -= dt; if (d > 8) n.seen = false;
    }
    if (n.tag) n.tag.visible = d < 10 && !S.dialog;
    n.barkT -= dt;
    if (n.barkT <= 0 && d < 7 && !S.dialog && n.def.barks) { n.barkT = rand(14, 26); bark(n.ch, pick(n.def.barks), n.holo ? n.def.hologram : '#ffe9a8'); }
  }

  /* ------------------------------------------------------------ the Fitting Room */
  // wrap an AvatarKit avatar so the NPC/animation code can drive it like a model character
  function avatarChar(L, yaw) {
    const av = window.AvatarKit.create(L);
    const obj = new THREE.Group(); obj.add(av.root);
    const ch = { key: 'avatar', av, obj, root: av.root, mixer: av.mixer, actions: {}, alias: {}, mats: Object.values(av.mats), head: null,   // no head-tracking: kit clips may not key the head
      cur: null, acc: 0, lightT: 0, yaw: yaw || 0 };
    ch.play = name => { av.play(name); ch.cur = av.clipName; };
    ch.play('Idle');
    return ch;
  }
  function mannequinLook(id) {
    const K = window.AvatarKit;
    const sex = K.item('m', id) ? (K.item('f', id) && Math.random() < 0.5 ? 'f' : 'm') : 'f';   // NOSONAR - which body models it
    const L = K.defaultLoadout(sex), it = K.item(sex, id);
    L.items[it.cat] = id;
    // dress the rest from the same rarity band so the featured piece reads as an outfit
    for (const c of K.catalog.categories) {
      if (c.id === it.cat || Math.random() < 0.4) continue;                                     // NOSONAR
      const pool = K.itemsIn(sex, c.id).filter(i => Math.abs(i.rarity - it.rarity) <= 1 && i.id !== id);
      if (pool.length) L.items[c.id] = pick(pool).id;
    }
    for (const k of ['prim', 'sec', 'acc', 'glow']) L.colors[k] = pick(K.catalog.palettes[k]).name;
    return L;
  }
  async function buildWardrobe(layout) {
    if (!window.AvatarKit) return;
    try { await window.AvatarKit.ready(); } catch (e) { console.warn('[Haven] avatar kit did not load', e); return; }
    if (!S.active || S.layout !== layout) return;
    const W = window.Wardrobe;
    S.statues = [];
    // Seam and any other avatar-kit NPCs
    for (const a of layout.actors) {
      const def = HAVEN_NPCS[a.model];
      if (!def || !def.avatar) continue;
      const ch = avatarChar(def.avatar, a.yaw);
      ch.obj.position.set(a.pos[0], a.pos[1], a.pos[2]); S.group.add(ch.obj);
      const npc = { id: a.model, def, ch, home: a.yaw, x: a.pos[0], y: a.pos[1], z: a.pos[2], holo: false, intel: false, idleT: rand(4, 10), barkT: rand(2, 8), seen: false, waveT: 0 };
      npc.tag = textSprite(def.name, '#ffffff', def.title); npc.tag.position.set(0, 2.15, 0); ch.obj.add(npc.tag);
      S.npcs.push(npc);
    }
    // the player's current fit on the dais
    const dais = layout.markers.find(m => m.kind === 'dais');
    if (dais) {
      const ch = avatarChar(window.AvatarKit.load(), dais.yaw);
      ch.obj.position.set(dais.pos[0], dais.pos[1], dais.pos[2]); S.group.add(ch.obj);
      ch.tag = textSprite('YOU', '#ff2fd6', 'CURRENT FIT // TALK TO SEAM'); ch.tag.position.set(0, 2.1, 0); ch.obj.add(ch.tag);
      S.dais = { ch, marker: dais, poseT: 4 };
      S.statues.push(ch.obj.position);
    }
    // mannequins: today's Daily Drop, dressed into an outfit
    const featured = W?.ready ? W.featured() : [];
    S.mannequins = [];
    layout.markers.filter(m => m.kind === 'mannequin').forEach((m, i) => {
      const id = featured[i]; if (!id) return;
      const ch = avatarChar(mannequinLook(id), m.yaw);
      ch.obj.position.set(m.pos[0], m.pos[1], m.pos[2]); S.group.add(ch.obj);
      ch.play(i ? 'Taunt' : 'Hype'); ch.mixer.timeScale = 0.35;
      const it = window.AvatarKit.item('m', id) || window.AvatarKit.item('f', id);
      ch.tag = textSprite('DAILY DROP', '#ffd54f', `${it.name.toUpperCase()} // ◆${W.price(id)}`); ch.tag.position.set(0, 2.05, 0); ch.obj.add(ch.tag);
      S.mannequins.push({ ch, id });
      S.statues.push(ch.obj.position);
    });
  }
  function refreshWardrobe() {
    if (!S.dais || !window.AvatarKit?.loaded) return;
    const L = window.AvatarKit.load(), d = S.dais;
    if (L.sex !== d.ch.av.sex) {
      d.ch.obj.remove(d.ch.av.root); d.ch.av.dispose();
      const n = avatarChar(L, d.ch.yaw); d.ch.obj.add(n.av.root); Object.assign(d.ch, { av: n.av, root: n.root, mixer: n.mixer, mats: n.mats, play: n.play });
      d.ch.play('Hype');
    } else { d.ch.av.apply(L); d.ch.play('Hype'); }
    d.poseT = 3;
  }
  function tickWardrobe(dt) {
    const d = S.dais;
    if (d) {
      d.ch.yaw += dt * 0.45;
      d.poseT -= dt;
      if (d.poseT <= 0) { d.poseT = rand(5, 9); d.ch.play(pick(['Idle', 'Idle', 'Hype', 'Dance', 'Taunt', 'Wave', 'Selfie'])); }
      animate(d.ch, dt);
      d.ch.tag.visible = Math.hypot(S.player.x - d.marker.pos[0], S.player.z - d.marker.pos[2]) < 9 && !S.dialog;
    }
    for (const m of S.mannequins || []) { animate(m.ch, dt); m.ch.tag.visible = Math.hypot(S.player.x - m.ch.obj.position.x, S.player.z - m.ch.obj.position.z) < 10 && !S.dialog; }
    // haven feats: time spent, ground walked, dancing; flushed every few seconds
    const W = window.Wardrobe; if (!W?.ready) return;
    const T = S.track || (S.track = { x: S.player.x, z: S.player.z, s: 0, m: 0, d: 0, t: 0 });
    const step = Math.hypot(S.player.x - T.x, S.player.z - T.z); T.x = S.player.x; T.z = S.player.z;
    if (step < 2) T.m += step;                                   // ignore teleports
    T.s += dt;
    const dz = S.danceZone;
    if (dz && S.player.x > dz.min[0] && S.player.x < dz.max[0] && S.player.z > dz.min[2] && S.player.z < dz.max[2]) T.d += dt;
    T.t += dt;
    if (T.t >= 5) {
      T.t = 0;
      if (T.s) W.bump('havenS', T.s); if (T.m >= 1) W.bump('havenM', T.m); if (T.d) W.bump('danceS', T.d);
      T.s = 0; T.m = 0; T.d = 0;
      W.syncGT();
    }
  }

  /* ------------------------------------------------------------ barks */
  function bark(ch, text, color = '#ffffff') {
    if (S.barks.length >= 3) return;
    const spr = textSprite(text, color, null, 640);
    spr.position.set(0, 2.55, 0);
    ch.obj.add(spr);
    S.barks.push({ spr, ch, t: 4.2 });
  }
  function tickBarks(dt) {
    for (const b of S.barks) {
      b.t -= dt;
      b.spr.material.opacity = Math.min(1, b.t / 0.6);
      b.spr.position.y = 2.55 + (4.2 - b.t) * 0.04;
      if (b.t <= 0) { b.ch.obj.remove(b.spr); b.spr.material.map.dispose(); b.spr.material.dispose(); }
    }
    S.barks = S.barks.filter(b => b.t > 0);
    S.crowdBarkT -= dt;
    if (S.crowdBarkT <= 0) {
      S.crowdBarkT = rand(5, 10);
      const pl = S.player;
      const near = S.agents.filter(a => Math.hypot(a.ch.obj.position.x - pl.x, a.ch.obj.position.z - pl.z) < 8);
      if (near.length) {
        const a = pick(near);
        bark(a.ch, pick(HAVEN_BARKS[a.kind] || HAVEN_BARKS.wander), a.kind === 'horde' ? '#b5ff7a' : '#e6e0ff');
        if (a.kind === 'horde') moan(a.ch.obj.position);
      }
    }
  }

  /* ------------------------------------------------------------ props */
  async function buildProps(layout) {
    const names = [...new Set(layout.props.map(p => p.model))];
    await Promise.all(names.map(loadProp));
    for (const p of layout.props) {
      const g = AssetLoader.getModel('prop.' + p.model);
      if (!g) continue;
      const o = THREE.SkeletonUtils.clone(g.scene);
      const mats = litMaterials(o);
      o.position.set(p.pos[0], p.pos[1], p.pos[2]);
      o.rotation.y = p.yaw || 0;
      o.scale.setScalar(p.scale || 1);
      probeAt(p.pos[0], p.pos[1] + 0.8, p.pos[2]);
      for (const m of mats) m.color.copy(probeCol);
      S.group.add(o);
      if (p.hover) S.hovers.push({ o, y: p.pos[1], ph: rand(0, 6) });
      const spin = []; o.traverse(c => { if (/^spin_/.test(c.name)) spin.push(c); });
      if (spin.length) S.spinners.push(...spin);
      if (p.name === 'SPEAKER_TOWER') S.speaker = o;
    }
  }

  /* ------------------------------------------------------------ dynamic lights */
  function buildLights(layout) {
    const max = S.lowSpec ? 5 : 9;
    const rank = l => (l.beat ? 4 : 0) + (l.flicker > 0.3 ? 3 : 0) + (l.pulse ? 2 : 0) + l.intensity;
    for (const l of [...layout.lights].sort((a, b) => rank(b) - rank(a)).slice(0, max)) {
      const pl = new THREE.PointLight(new THREE.Color(...l.color), l.intensity * 1.6, l.radius * 1.15, 1.6);
      pl.position.set(...l.pos);
      S.group.add(pl);
      S.lights.push({ pl, base: l.intensity * 1.6, def: l, ph: rand(0, 10) });
    }
  }
  function tickLights(dt, beat) {
    const kick = beat.live ? Math.pow(1 - beat.phase, 3) : 0;
    for (const L of S.lights) {
      const d = L.def; let k = 1;
      if (d.flicker) k *= 1 - d.flicker * (0.5 + 0.5 * Math.sin(S.t * 13 + L.ph) * Math.sin(S.t * 7.3 + L.ph * 2)) * (Math.random() < 0.03 ? 1.6 : 1); // NOSONAR
      if (d.beat) k *= 0.55 + kick * 1.2 + beat.energy * 0.6;
      if (d.pulse) k *= 1 - d.pulse * 0.5 * (1 + Math.sin(S.t * 2.2 + L.ph));
      if (d.beacon) k *= Math.sin(S.t * 5 + L.ph) > 0.2 ? 1 : 0.15;
      L.pl.intensity = L.base * Math.max(0, k);
    }
    for (const m of S.holoMats) { m.uniforms.uTime.value = S.t; m.uniforms.uBeat.value = kick; }
  }

  /* ------------------------------------------------------------ fx */
  function rainShaft(pos, size, height) {
    const N = S.lowSpec ? 60 : 140;
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 6), sp = new Float32Array(N);
    for (let i = 0; i < N; i++) { sp[i] = rand(9, 13); resetDrop(arr, i, pos, size, height, rand(0, height)); }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.55 }));
    lines.frustumCulled = false;
    S.group.add(lines);
    // the shaft of light coming down through the grate: two crossed soft-edged planes
    const shaftMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uT; varying vec2 vU; void main(){
        float edge = smoothstep(0.0, 0.35, vU.x) * smoothstep(1.0, 0.65, vU.x);
        float s = 0.6 + 0.4 * sin(vU.x * 9.0 + uT * 0.6);
        gl_FragColor = vec4(vec3(0.42, 0.52, 1.0) * 0.07 * edge * s * pow(vU.y, 1.4), 1.0); }`,
    });
    const shaft = new THREE.Group();
    for (const r of [0, Math.PI / 2]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(size[0], size[1]) * 1.1, height), shaftMat);
      pl.rotation.y = r + Math.PI / 4; shaft.add(pl);
    }
    shaft.position.set(pos[0], height / 2, pos[2]);
    shaft.material = shaftMat;
    S.group.add(shaft);
    S.fx.push({ kind: 'rain', lines, arr, sp, pos, size, height, N, shaft });
  }
  function resetDrop(arr, i, pos, size, height, y) {
    const x = pos[0] + rand(-size[0] / 2, size[0] / 2), z = pos[2] + rand(-size[1] / 2, size[1] / 2);
    arr.set([x, y, z, x, y + 0.38, z], i * 6);
  }
  function fire(pos) {
    const N = S.lowSpec ? 14 : 30;
    const g = new THREE.BufferGeometry(); const arr = new Float32Array(N * 3), life = new Float32Array(N);
    for (let i = 0; i < N; i++) { life[i] = rand(0, 1.6); arr.set([pos[0], pos[1] + rand(0, 1), pos[2]], i * 3); }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffa040, size: 0.09, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false;
    S.group.add(pts);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ff8a20'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.position.set(pos[0], pos[1] + 0.35, pos[2]);
    S.group.add(flame);
    S.fx.push({ kind: 'fire', pts, arr, life, pos, N, flame });
  }
  let glowTex = {};
  function glowTexture(col) {
    if (glowTex[col]) return glowTex[col];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 40, 2, 32, 34, 30);
    gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.25, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return (glowTex[col] = t);
  }
  function portal(pos, radius) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uBeat: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uT; uniform float uBeat; varying vec2 vU;
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        void main(){ vec2 p = vU * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
          float a = atan(p.y, p.x);
          float sw = sin(a * 5.0 + r * 9.0 - uT * 3.2) * 0.5 + 0.5;
          float sw2 = sin(a * 3.0 - r * 14.0 + uT * 2.1) * 0.5 + 0.5;
          float core = smoothstep(1.0, 0.0, r);
          vec3 c = mix(vec3(0.61, 0.35, 1.0), vec3(0.0, 0.9, 1.0), sw2) * (0.35 + sw * 0.65);
          float edge = smoothstep(0.82, 1.0, r) * 1.4;
          float al = (core * 0.55 + edge) * (0.75 + uBeat * 0.35);
          gl_FragColor = vec4(c * (0.6 + core) + edge * vec3(0.8, 0.6, 1.0), al * 0.8); }`,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), m);
    disc.position.set(pos[0], pos[1], pos[2]);
    S.group.add(disc);
    S.fx.push({ kind: 'portal', m, disc });
  }
  function dust() {
    const N = S.lowSpec ? 80 : 220;
    const g = new THREE.BufferGeometry(); const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) arr.set([rand(-19, 19), rand(0.3, 8), rand(-13, 13)], i * 3);
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8a7cc0, size: 0.03, transparent: true, opacity: 0.3, depthWrite: false }));
    pts.frustumCulled = false;
    S.group.add(pts);
    S.fx.push({ kind: 'dust', pts, arr, N });
  }
  function tickFx(dt, beat) {
    for (const f of S.fx) {
      if (f.kind === 'rain') {
        const a = f.arr;
        for (let i = 0; i < f.N; i++) {
          const y = a[i * 6 + 1] - f.sp[i] * dt;
          if (y < 0) resetDrop(a, i, f.pos, f.size, f.height, f.height);
          else { a[i * 6 + 1] = y; a[i * 6 + 4] = y + 0.38; }
        }
        f.lines.geometry.attributes.position.needsUpdate = true;
        f.shaft.material.uniforms.uT.value = S.t;
      } else if (f.kind === 'fire') {
        const a = f.arr;
        for (let i = 0; i < f.N; i++) {
          f.life[i] -= dt;
          if (f.life[i] <= 0) { f.life[i] = rand(0.8, 1.8); a.set([f.pos[0] + rand(-0.18, 0.18), f.pos[1], f.pos[2] + rand(-0.18, 0.18)], i * 3); }
          else { a[i * 3] += Math.sin(S.t * 3 + i) * dt * 0.3; a[i * 3 + 1] += dt * rand(0.7, 1.3); a[i * 3 + 2] += Math.cos(S.t * 2.4 + i) * dt * 0.3; }
        }
        f.pts.geometry.attributes.position.needsUpdate = true;
        const s = 0.75 + Math.sin(S.t * 17 + f.pos[0]) * 0.08 + Math.random() * 0.12; // NOSONAR
        f.flame.scale.set(s * 0.8, s * 1.15, 1);
      } else if (f.kind === 'portal') {
        f.m.uniforms.uT.value = S.t; f.m.uniforms.uBeat.value = beat.live ? Math.pow(1 - beat.phase, 2) : 0;
        f.disc.rotation.z += dt * 0.15;
      } else if (f.kind === 'dust') {
        const a = f.arr;
        for (let i = 0; i < f.N; i++) { a[i * 3] += Math.sin(S.t * 0.3 + i) * dt * 0.05; a[i * 3 + 1] += Math.sin(S.t * 0.2 + i * 1.7) * dt * 0.04; }
        f.pts.geometry.attributes.position.needsUpdate = true;
      }
    }
    for (const h of S.hovers) { h.o.position.y = h.y + Math.sin(S.t * 1.4 + h.ph) * 0.18; h.o.rotation.y += dt * 0.25; }
    for (const s of S.spinners) s.rotation.y += dt * 2.4;
    if (S.speaker) { const k = beat.live ? Math.pow(1 - beat.phase, 4) : 0; S.speaker.scale.setScalar(1.8 * (1 + k * 0.025)); }
  }

  /* ------------------------------------------------------------ jumbotron */
  function buildScreen(layout) {
    const m = layout.markers.find(k => k.kind === 'screen');
    if (!m) return;
    const W = 320, H = 120;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const [sw, sh] = m.size || [16, 6];
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
    plane.position.set(m.pos[0], m.pos[1], m.pos[2] + 0.04);
    S.group.add(plane);
    // Turing lives in his own little scene, rendered into a texture when he breaks in
    const rt = new THREE.WebGLRenderTarget(160, 120);
    const tScene = new THREE.Scene(); tScene.background = new THREE.Color(0x200006);
    tScene.add(new THREE.AmbientLight(0xffffff, 0.7)); const dl = new THREE.DirectionalLight(0xff5470, 1.2); dl.position.set(1, 2, 3); tScene.add(dl);
    const tCam = new THREE.PerspectiveCamera(28, 160 / 120, 0.1, 20); tCam.position.set(0, 1.55, 3.0); tCam.lookAt(0, 1.45, 0);
    const turing = makeChar('turing', { yaw: 0, anim: 'Talk' });
    if (turing) { for (const mm of turing.mats) mm.color.setRGB(1, 1, 1); tScene.add(turing.obj); }
    const tPlane = new THREE.Mesh(new THREE.PlaneGeometry(sh * 1.3, sh * 0.98), new THREE.MeshBasicMaterial({ map: rt.texture, fog: false, transparent: true, opacity: 0 }));
    tPlane.position.set(m.pos[0] - sw * 0.3, m.pos[1], m.pos[2] + 0.08);
    S.group.add(tPlane);
    S.screen = { c, ctx: c.getContext('2d'), tex, W, H, tick: 0, ticker: 0, takeover: 0, nextTakeover: 24, line: '', typed: 0, rt, tScene, tCam, turing, tPlane, plane };
  }
  function tickScreen(dt, beat) {
    const s = S.screen; if (!s) return;
    s.nextTakeover -= dt;
    if (s.takeover <= 0 && s.nextTakeover <= 0 && !S.dialog) { s.takeover = 13; s.line = pick(HAVEN_TURING); s.typed = 0; s.nextTakeover = rand(50, 80); AudioSys.sfx?.('glitch'); }
    if (s.takeover > 0) {
      s.takeover -= dt; s.typed = Math.min(s.line.length, s.typed + dt * 28);
      if (s.turing) { animate(s.turing, dt); s.turing.yaw = Math.sin(S.t * 0.7) * 0.25; }
      const glitch = Math.random() < 0.08; // NOSONAR
      s.tPlane.material.opacity = Math.min(1, s.takeover * 2, (13 - s.takeover) * 3) * (glitch ? 0.4 : 1);
      s.tPlane.position.x = (glitch ? rand(-0.3, 0.3) : 0) + s.plane.position.x - s.plane.geometry.parameters.width * 0.3;
      renderer.setRenderTarget(s.rt); renderer.render(s.tScene, s.tCam); renderer.setRenderTarget(null);
    } else s.tPlane.material.opacity = 0;
    s.tick -= dt; if (s.tick > 0) return; s.tick = 1 / 15;
    const x = s.ctx, W = s.W, H = s.H;
    const intrude = s.takeover > 0;
    x.fillStyle = intrude ? '#16000a' : '#07040f'; x.fillRect(0, 0, W, H);
    x.font = 'bold 13px Consolas, monospace'; x.textBaseline = 'top';
    if (!intrude) {
      x.fillStyle = '#b884ff'; x.fillText('REBEL HAVEN // FREE BROADCAST', 8, 6);
      x.fillStyle = '#00e5ff'; x.fillText(beat.live ? 'NOW PLAYING: EARTH 2069 - MAIN THEME' : 'SIGNAL: CLEAN', 8, 22);
      const spec = Music.spectrum(); const bars = 40, bw = (W - 16) / bars;
      for (let i = 0; i < bars; i++) {
        const v = spec ? spec[Math.floor(2 + i * 1.4)] / 255 : (0.2 + 0.2 * Math.sin(S.t * 3 + i));
        const h = Math.max(2, v * 58);
        x.fillStyle = `hsl(${270 - i * 2.4}, 100%, ${45 + v * 25}%)`;
        x.fillRect(8 + i * bw, 96 - h, bw - 2, h);
      }
    } else {
      x.fillStyle = '#ff2d55'; x.fillText('!! SIGNAL INTRUSION !!', W * 0.42, 8);
      x.fillStyle = '#ffd0d8'; x.font = '12px Consolas, monospace';
      const t = s.line.slice(0, Math.floor(s.typed)); const words = t.split(' '); let line = '', y = 30;
      for (const wd of words) { if ((line + ' ' + wd).length > 24) { x.fillText(line, W * 0.42, y); y += 15; line = wd; } else line = line ? line + ' ' + wd : wd; }
      x.fillText(line + (Math.floor(S.t * 3) % 2 ? '_' : ''), W * 0.42, y);
      x.fillStyle = '#ff5470'; x.fillText('- TURING', W * 0.42, 96);
    }
    // ticker
    x.fillStyle = intrude ? '#3a0010' : '#1b0a35'; x.fillRect(0, 104, W, 16);
    x.font = 'bold 12px Consolas, monospace'; x.fillStyle = intrude ? '#ff5470' : '#ffe600';
    const text = HAVEN_TICKER.join('   ///   ') + '   ///   ';
    s.ticker = (s.ticker + 40 / 15) % (text.length * 7.2);
    x.fillText(text + text, -s.ticker, 106);
    for (let yy = 0; yy < H; yy += 2) { x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, yy, W, 1); }
    s.tex.needsUpdate = true;
  }

  /* ------------------------------------------------------------ sound */
  let noiseBuf = null;
  function ac() { return AudioSys?.ctx || null; }
  function noise() {
    const c = ac(); if (!c) return null;
    if (noiseBuf) return noiseBuf;
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; // NOSONAR
    return noiseBuf;
  }
  function panner(pos, radius) {
    const c = ac(); const p = c.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1.5; p.maxDistance = radius * 2; p.rolloffFactor = 1.6;
    p.positionX ? (p.positionX.value = pos[0], p.positionY.value = pos[1], p.positionZ.value = pos[2]) : p.setPosition(...pos);
    p.connect(S.amb);
    return p;
  }
  function buildSound(layout) {
    const c = ac(); if (!c || !noise()) return;
    S.amb = c.createGain(); S.amb.gain.value = 0; S.amb.connect(AudioSys.master || c.destination);
    S.amb.gain.setTargetAtTime(AudioSys.sfxOn === false ? 0 : 0.7, c.currentTime, 1.0);
    for (const s of layout.audio) {
      if (s.kind === 'fire') {
        const src = c.createBufferSource(); src.buffer = noise(); src.loop = true;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.6;
        const g = c.createGain(); g.gain.value = 0.18;
        src.connect(bp); bp.connect(g); g.connect(panner(s.pos, s.radius)); src.start();
        S.sources.push(src); S.crackles.push({ g, pos: s.pos });
      } else if (s.kind === 'crowd') {
        const src = c.createBufferSource(); src.buffer = noise(); src.loop = true;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 1.4;
        const g = c.createGain(); g.gain.value = 0.22;
        const lfo = c.createOscillator(); lfo.frequency.value = 0.37; const lg = c.createGain(); lg.gain.value = 0.09;
        lfo.connect(lg); lg.connect(g.gain); lfo.start();
        src.connect(bp); bp.connect(g); g.connect(panner(s.pos, s.radius)); src.start();
        S.sources.push(src, lfo);
      } else if (s.kind === 'serverless') {
        S.hordePan = panner(s.pos, s.radius);
      }
    }
    for (const f of layout.fx.filter(f => f.kind === 'rainShaft')) {
      const src = c.createBufferSource(); src.buffer = noise(); src.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
      const g = c.createGain(); g.gain.value = 0.08;
      src.connect(hp); hp.connect(g); g.connect(panner([f.pos[0], 1, f.pos[2]], 10)); src.start(); S.sources.push(src);
    }
  }
  function moan(pos) {
    const c = ac(); if (!c || !S.amb) return;
    const t = c.currentTime, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; const f0 = rand(85, 140);
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * rand(0.7, 0.9), t + 1.6);
    f.type = 'bandpass'; f.frequency.setValueAtTime(rand(500, 800), t); f.frequency.linearRampToValueAtTime(rand(300, 450), t + 1.6); f.Q.value = 4;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 1.7);
    o.connect(f); f.connect(g); g.connect(S.hordePan || panner([pos.x, pos.y, pos.z], 14)); o.start(t); o.stop(t + 1.8);
  }
  function tickSound(dt) {
    const c = ac(); if (!c) return;
    const L = c.listener, p = camera.position, f = V3(0, 0, -1).applyQuaternion(camera.quaternion);
    if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
    for (const k of S.crackles) k.g.gain.value = 0.12 + Math.max(0, Math.sin(S.t * 31 + k.pos[0]) * Math.sin(S.t * 17)) * 0.3;
    S.moanT -= dt;
    if (S.moanT <= 0) { S.moanT = rand(3, 7); const h = S.agents.filter(a => a.kind === 'horde'); if (h.length && Math.hypot(S.player.x + 21, S.player.z + 22) < 22) moan(pick(h).ch.obj.position); }
    Music.listen(p.x, p.y, p.z);
  }

  /* ------------------------------------------------------------ area label */
  function areaLabel(dt) {
    const pl = S.player;
    const z = HAVEN_ZONES.find(z => pl.x >= z.x0 && pl.x <= z.x1 && pl.z >= z.z0 && pl.z <= z.z1);
    if (z && z !== S.zone) {
      S.zone = z;
      const el = document.getElementById('havenArea');
      if (el) { el.querySelector('b').textContent = z.name; el.querySelector('span').textContent = z.sub; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
    }
  }

  /* ------------------------------------------------------------ dialogue */
  function nearestTalk() {
    const pl = S.player;
    let best = null, bd = 2.9;
    for (const n of S.npcs) {
      const d = Math.hypot(pl.x - n.x, pl.z - n.z);
      if (Math.abs((pl.y || 0) - n.y) > 2.2 && !n.intel) continue;
      const reach = n.intel ? 3.4 : bd;
      if (d < reach && d < (best ? best.d : 99)) best = { n, d };
    }
    return best?.n || null;
  }
  function openDialog(n, onAction) {
    const def = n.def;
    const box = document.getElementById('havenDlg');
    if (!box) return false;
    S.dialog = { npc: n, onAction };
    if (!n.intel && window.Wardrobe?.ready) window.Wardrobe.talk(n.id);
    box.querySelector('.who').textContent = def.name;
    box.querySelector('.who').style.color = def.hologram || '#ffe600';
    box.querySelector('.role').textContent = def.title || '';
    const opts = def.intel
      ? [{ t: 'Open the full briefing.', action: 'briefing' }, { t: 'Close.' }]
      : (def.options || [{ t: 'Bye.' }]);
    say(def.intel || def.greet, opts);
    box.classList.add('show');
    document.exitPointerLock?.();
    AudioSys.sfx?.('ui');
    return true;
  }
  function say(text, opts) {
    const box = document.getElementById('havenDlg');
    const txt = box.querySelector('.txt'), list = box.querySelector('.opts');
    clearInterval(S.typeTimer);
    txt.textContent = ''; let i = 0;
    S.typeTimer = setInterval(() => { i += 2; txt.textContent = text.slice(0, i); if (i >= text.length) clearInterval(S.typeTimer); }, 16);
    S.fullText = text;
    list.innerHTML = '';
    opts.forEach((o, k) => {
      const b = document.createElement('button');
      b.className = 'opt'; b.innerHTML = `<kbd>${k + 1}</kbd> ` + o.t.replace(/[<>&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[ch]);
      b.onclick = () => choose(o);
      list.appendChild(b);
    });
    S.opts = opts;
  }
  function choose(o) {
    const n = S.dialog?.npc; if (!n) return;
    AudioSys.sfx?.('ui');
    if (o.action === 'train') { const tips = n.def.tips || []; say(pick(tips), n.def.options); return; }
    if (o.reply && !o.action) { say(o.reply, n.def.options.filter(x => x !== o)); return; }
    const act = S.dialog.onAction;
    if (o.reply && o.action) {                         // say the line, then do the thing
      say(o.reply, [{ t: 'Continue.', run: o.action }]);
      return;
    }
    closeDialog();
    if (o.action || o.run) act?.(o.action || o.run, n);
  }
  function closeDialog() {
    clearInterval(S.typeTimer);
    const box = document.getElementById('havenDlg');
    box?.classList.remove('show');
    S.dialog = null;
  }
  function dialogKey(code) {
    if (!S.dialog) return false;
    if (code === 'Escape') { closeDialog(); return true; }
    const txt = document.querySelector('#havenDlg .txt');
    if ((code === 'Space' || code === 'Enter' || code === 'KeyE') && txt && txt.textContent.length < (S.fullText || '').length) { clearInterval(S.typeTimer); txt.textContent = S.fullText; return true; }
    const m = /^Digit([1-9])$/.exec(code);
    if (m && S.opts?.[+m[1] - 1]) { choose(S.opts[+m[1] - 1]); return true; }
    return true;
  }

  /* ------------------------------------------------------------ lifecycle */
  async function enter(scene, opts = {}) {
    exit(scene);
    const layout = await AssetLoader.fetchJson(HAVEN_BASE + 'haven.layout.json?v=20261111-wardrobe');
    if (!layout) return false;
    Object.assign(S, { active: true, layout, group: new THREE.Group(), npcs: [], agents: [], barks: [], lights: [], fx: [], hovers: [], spinners: [],
      sources: [], crackles: [], holoMats: [], t: 0, dais: null, mannequins: [], statues: [], track: null, crowdBarkT: 4, moanT: 3, zone: null, dialog: null, player: { x: 0, y: 0, z: 0 },
      lowSpec: !!opts.lowSpec, probes: decodeProbes(layout.probes), graph: buildGraph(layout.waypoints), onAction: opts.onAction });
    S.group.name = 'RebelHaven_Runtime';
    scene.add(S.group);
    const models = new Set(['turing']);
    for (const a of layout.actors) { const d = HAVEN_NPCS[a.model]; if (d?.model) models.add(d.model); }
    for (const z of layout.zones) for (const m of HAVEN_CROWD_MODELS[z.kind === 'market' ? 'wander' : z.kind] || []) models.add(m);
    await Promise.all([...models].map(loadModel));
    if (!S.active) return false;
    await buildProps(layout);
    buildNPCs(layout);
    S.danceZone = layout.zones.find(z => z.kind === 'dance') || null;
    buildWardrobe(layout);                               // async: the avatar kit streams in after the Haven is up
    buildCrowds(layout);
    buildLights(layout);
    buildScreen(layout);
    for (const f of layout.fx) {
      if (f.kind === 'rainShaft') rainShaft(f.pos, f.size, f.height);
      else if (f.kind === 'fire') fire(f.pos);
      else if (f.kind === 'portal') portal(f.pos, f.radius);
    }
    dust();
    S.ambient = new THREE.AmbientLight(0xffffff, 1.0); S.group.add(S.ambient);
    const hemi = new THREE.HemisphereLight(0x8070c0, 0x100818, 0.35); S.group.add(hemi);
    const fog = layout.meta?.fog;
    if (fog) { S.prevFog = scene.fog; scene.fog = new THREE.FogExp2(new THREE.Color(fog.color), fog.density); }
    buildSound(layout);
    const spk = layout.audio.find(a => a.kind === 'music');
    if (spk) Music.setDiegetic({ x: spk.pos[0], y: spk.pos[1], z: spk.pos[2], radius: spk.radius || 30 });
    Music.play(spk?.cue || 'hub', { fade: 2.5 });
    console.info('[E2049] Rebel Haven runtime:', { npcs: S.npcs.length, crowd: S.agents.length, props: layout.props.length, lights: S.lights.length });
    return true;
  }
  function exit(scene) {
    if (!S.group) { S.active = false; return; }
    closeDialog();
    for (const src of S.sources || []) { try { src.stop(); } catch (_) { /* already stopped */ } }
    if (S.amb) { try { S.amb.disconnect(); } catch (_) { /* gone */ } }
    for (const b of S.barks || []) b.spr.material.map.dispose();
    for (const n of S.npcs || []) if (n.ch.av) n.ch.av.dispose();
    if (S.dais) S.dais.ch.av.dispose();
    for (const m of S.mannequins || []) m.ch.av.dispose();
    if (S.screen) { S.screen.rt.dispose(); S.screen.tex.dispose(); }
    (scene || S.group.parent)?.remove(S.group);
    if (S.prevFog !== undefined && scene) scene.fog = S.prevFog;
    Music.setDiegetic(null);
    Object.assign(S, { active: false, group: null, npcs: [], agents: [], screen: null, amb: null, prevFog: undefined, dais: null, mannequins: [], statues: [] });
  }

  function tick(dt, player) {
    if (!S.active || !S.group) return;
    S.t += dt;
    S.player = { x: player.pos.x, y: player.pos.y || 0, z: player.pos.z };
    const beat = Music.beat();
    for (const n of S.npcs) { tickNPC(n, dt, beat); animate(n.ch, dt); }
    for (const a of S.agents) { tickAgent(a, dt, beat); animate(a.ch, dt); }
    separate(dt);
    // keep the player out of people
    for (const list of [S.npcs.map(n => n.ch.obj.position), S.agents.filter(a => a.kind !== 'horde').map(a => a.ch.obj.position), S.statues || []]) {
      for (const q of list) {
        const dx = player.pos.x - q.x, dz = player.pos.z - q.z, d = Math.hypot(dx, dz);
        if (d < 0.55 && d > 1e-4 && Math.abs((player.pos.y || 0) - q.y) < 1.2) { player.pos.x = q.x + dx / d * 0.55; player.pos.z = q.z + dz / d * 0.55; }
      }
    }
    tickWardrobe(dt);
    tickBarks(dt);
    tickLights(dt, beat);
    tickFx(dt, beat);
    tickScreen(dt, beat);
    tickSound(dt);
    areaLabel(dt);
  }

  return {
    enter, exit, tick,
    nearestTalk, openDialog, closeDialog, dialogKey, refreshWardrobe,
    get active() { return S.active; }, get dialogOpen() { return !!S.dialog; },
    probeAt: (x, y, z) => probeAt(x, y, z).clone(),
    debug: () => S,
  };
})();

if (typeof window !== 'undefined') window.Haven = Haven;
