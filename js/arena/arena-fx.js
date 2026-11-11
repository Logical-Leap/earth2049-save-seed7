/* EARTH 2049: SAVE SEED 7 — ARENA effects: sparks, debris, gibs, shells, decals, tracers, explosions,
 * ground telegraphs, beams and floating damage numbers. Everything is pooled; nothing allocates per shot.
 */
'use strict';

AR.Fx = (() => {
  const { V3, rand } = AR;
  let scene = null, group = null;
  const tmpC = new THREE.Color(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = V3(), tmpP = V3(), up = V3(0, 1, 0);

  /* ------------------------------------------------------------------ point particles (glow + debris) */
  function pointPool(max, additive, size) {
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size, vertexColors: true, transparent: additive, opacity: 1, sizeAttenuation: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !additive, map: additive ? Assets.starTex() : null });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = additive ? 6 : 2;
    for (let i = 0; i < max; i++) pos[i * 3 + 1] = -999;
    const P = { pts, geo, pos, col, max, live: [], free: Array.from({ length: max }, (_, i) => max - 1 - i) };
    return P;
  }
  let glow = null, debris = null;
  function emit(P, x, y, z, hex, n, spd, life, opts = {}) {
    tmpC.setHex(hex);
    for (let k = 0; k < n; k++) {
      let i;
      if (P.free.length) i = P.free.pop(); else { const o = P.live.shift(); i = o.i; }
      const a = Math.random() * Math.PI * 2, ph = (opts.cone ?? 1) * (Math.random() * Math.PI - Math.PI / 2);   // NOSONAR
      const s = spd * (0.35 + Math.random() * 0.9);                                                        // NOSONAR
      let vx = Math.cos(a) * Math.cos(ph) * s, vy = Math.sin(ph) * s + (opts.up ?? 1.5), vz = Math.sin(a) * Math.cos(ph) * s;
      if (opts.dir) { vx = vx * 0.5 + opts.dir.x * spd; vy = vy * 0.5 + opts.dir.y * spd; vz = vz * 0.5 + opts.dir.z * spd; }
      const v = opts.var || 0.25;
      P.live.push({ i, x, y, z, vx, vy, vz, life: life * (0.6 + Math.random() * 0.7), l0: life,                 // NOSONAR
        r: tmpC.r * (1 - v + Math.random() * v), g: tmpC.g * (1 - v + Math.random() * v), b: tmpC.b * (1 - v + Math.random() * v),  // NOSONAR
        grav: opts.grav ?? -14, floor: opts.floor ?? AR.World.floorAt(x, z, 0.05, y + 0.2), drag: opts.drag ?? 0.6 });
    }
  }
  function tickPoints(P, dt, fade) {
    const { pos, col } = P;
    for (let k = P.live.length - 1; k >= 0; k--) {
      const p = P.live[k];
      p.life -= dt;
      if (p.life <= 0) { pos[p.i * 3 + 1] = -999; P.free.push(p.i); P.live.splice(k, 1); continue; }
      p.vy += p.grav * dt;
      const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) { p.y = p.floor + 0.01; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const f = fade ? Math.min(1, p.life / p.l0 * 1.6) : 1;
      pos[p.i * 3] = p.x; pos[p.i * 3 + 1] = p.y; pos[p.i * 3 + 2] = p.z;
      col[p.i * 3] = p.r * f; col[p.i * 3 + 1] = p.g * f; col[p.i * 3 + 2] = p.b * f;
    }
    P.geo.attributes.position.needsUpdate = true; P.geo.attributes.color.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ instanced bodies (gibs, shells) */
  function bodyPool(max, geo, mat) {
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    for (let i = 0; i < max; i++) { tmpM.makeScale(0, 0, 0); mesh.setMatrixAt(i, tmpM); }
    return { mesh, max, live: [], next: 0 };
  }
  let gibs = null, shells = null;
  function spawnBody(B, x, y, z, vx, vy, vz, hex, size, life, spin = 12) {
    const i = B.next; B.next = (B.next + 1) % B.max;
    const old = B.live.findIndex(o => o.i === i); if (old >= 0) B.live.splice(old, 1);
    B.mesh.setColorAt(i, tmpC.setHex(hex)); B.mesh.instanceColor.needsUpdate = true;
    B.live.push({ i, x, y, z, vx, vy, vz, size, life, l0: life, rx: rand(0, 6), ry: rand(0, 6), wx: rand(-spin, spin), wy: rand(-spin, spin),
      floor: AR.World.floorAt(x, z, 0.05, y + 0.3), rest: false });
  }
  const euler = new THREE.Euler();
  function tickBodies(B, dt) {
    for (let k = B.live.length - 1; k >= 0; k--) {
      const o = B.live[k];
      o.life -= dt;
      if (o.life <= 0) { tmpM.makeScale(0, 0, 0); B.mesh.setMatrixAt(o.i, tmpM); B.live.splice(k, 1); continue; }
      if (!o.rest) {
        o.vy -= 22 * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt; o.rx += o.wx * dt; o.ry += o.wy * dt;
        if (o.y < o.floor + o.size * 0.5) {
          o.y = o.floor + o.size * 0.5; o.vy *= -0.38; o.vx *= 0.55; o.vz *= 0.55; o.wx *= 0.5; o.wy *= 0.5;
          if (Math.abs(o.vy) < 0.6) { o.rest = true; o.rx = Math.round(o.rx / 1.5708) * 1.5708; }
        }
      }
      const s = o.size * Math.min(1, o.life / 0.4);
      tmpQ.setFromEuler(euler.set(o.rx, o.ry, 0));
      tmpM.compose(tmpP.set(o.x, o.y, o.z), tmpQ, tmpS.set(s, s, s));
      B.mesh.setMatrixAt(o.i, tmpM);
    }
    B.mesh.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ decals */
  let decals = null;
  function decal(x, y, z, nx, ny, nz, size, dark = 0.0) {
    const D = decals, i = D.next; D.next = (D.next + 1) % D.max;
    tmpQ.setFromUnitVectors(V3(0, 0, 1), tmpP.set(nx, ny, nz));
    const spin = new THREE.Quaternion().setFromAxisAngle(tmpP, Math.random() * 6.28);      // NOSONAR
    tmpQ.premultiply(spin);
    tmpM.compose(tmpP.set(x + nx * 0.015, y + ny * 0.015, z + nz * 0.015), tmpQ, tmpS.set(size, size, 1));
    D.mesh.setMatrixAt(i, tmpM);
    D.mesh.setColorAt(i, tmpC.setRGB(dark, dark, dark));
    D.mesh.instanceMatrix.needsUpdate = true; D.mesh.instanceColor.needsUpdate = true;
  }
  function decalTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.35, 'rgba(10,8,6,0.95)'); g.addColorStop(0.6, 'rgba(30,24,20,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 16, 16);
    const t = new THREE.CanvasTexture(c); return t;
  }

  /* ------------------------------------------------------------------ tracers */
  let tracer = null;
  function tracerPool(max) {
    const pos = new Float32Array(max * 6), col = new Float32Array(max * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false; line.renderOrder = 7;
    return { line, geo, pos, col, max, live: [], next: 0 };
  }
  function trace(ax, ay, az, bx, by, bz, hex, life = 0.07) {
    const T = tracer, i = T.next; T.next = (T.next + 1) % T.max;
    const old = T.live.findIndex(o => o.i === i); if (old >= 0) T.live.splice(old, 1);
    tmpC.setHex(hex);
    T.live.push({ i, ax, ay, az, bx, by, bz, r: tmpC.r, g: tmpC.g, b: tmpC.b, life, l0: life });
  }
  function tickTracers(dt) {
    const T = tracer;
    for (let k = T.live.length - 1; k >= 0; k--) {
      const o = T.live[k]; o.life -= dt;
      const j = o.i * 6;
      if (o.life <= 0) { T.pos.fill(0, j, j + 6); T.col.fill(0, j, j + 6); T.live.splice(k, 1); continue; }
      const f = o.life / o.l0, t0 = 1 - f;                         // the bolt flies toward the hit point
      T.pos[j] = o.ax + (o.bx - o.ax) * t0 * 0.7; T.pos[j + 1] = o.ay + (o.by - o.ay) * t0 * 0.7; T.pos[j + 2] = o.az + (o.bz - o.az) * t0 * 0.7;
      T.pos[j + 3] = o.bx; T.pos[j + 4] = o.by; T.pos[j + 5] = o.bz;
      T.col[j] = o.r * f * 0.4; T.col[j + 1] = o.g * f * 0.4; T.col[j + 2] = o.b * f * 0.4;
      T.col[j + 3] = o.r * f; T.col[j + 4] = o.g * f; T.col[j + 5] = o.b * f;
    }
    T.geo.attributes.position.needsUpdate = true; T.geo.attributes.color.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ meshes with lifetimes (flashes, rings, beams) */
  const live = [];
  let flashMat = null, ringGeo = null, discGeo = null, beamGeo = null;
  function flash(x, y, z, hex, size, life = 0.12) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: Assets.starTex(), color: hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.set(x, y, z); s.scale.setScalar(size); group.add(s);
    live.push({ o: s, life, l0: life, grow: size * 3, fade: true });
  }
  function shock(x, y, z, hex, radius, life = 0.35) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.06, z); m.scale.setScalar(0.2); group.add(m);
    live.push({ o: m, life, l0: life, ring: radius, fade: true });
  }
  let lights = [];
  function light(x, y, z, hex, intensity, dist, life) {
    // a fixed pool (created at init) so the light count never changes mid-fight and shaders never recompile
    let L = lights.find(l => l.t <= 0) || lights.reduce((a, b) => (a.t < b.t ? a : b));
    L.l.color.setHex(hex); L.l.distance = dist; L.l.position.set(x, y, z); L.i0 = intensity; L.t = life; L.t0 = life; L.l.intensity = intensity;
  }
  /** Ground telegraph: a ring that fills toward `life`, then pops. Returns a handle. */
  function telegraph(x, y, z, radius, hex, life) {
    const g = new THREE.Group(); g.position.set(x, y + 0.05, z);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(radius);
    const fill = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    fill.rotation.x = -Math.PI / 2; fill.scale.setScalar(0.01);
    g.add(ring, fill); group.add(g);
    const h = { o: g, life, l0: life, tele: radius, fill, ring };
    live.push(h);
    return h;
  }
  function beam(ax, ay, az, bx, by, bz, hex, width, life) {
    const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const d = Math.hypot(bx - ax, by - ay, bz - az);
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.quaternion.setFromUnitVectors(up, tmpP.set(bx - ax, by - ay, bz - az).normalize());
    m.scale.set(width, d, width); group.add(m);
    live.push({ o: m, life, l0: life, fade: true, beamW: width });
    return m;
  }
  function tickLive(dt) {
    for (let k = live.length - 1; k >= 0; k--) {
      const L = live[k]; L.life -= dt;
      const f = Math.max(0, L.life / L.l0);
      if (L.life <= 0) { group.remove(L.o); L.o.traverse?.(o => o.material?.dispose?.()); L.o.material?.dispose?.(); live.splice(k, 1); continue; }
      if (L.grow) L.o.scale.setScalar(L.grow * (1 - f) + 0.2);
      if (L.ring) L.o.scale.setScalar(0.2 + L.ring * (1 - f * f));
      if (L.tele) { L.fill.scale.setScalar(Math.max(0.01, L.tele * (1 - f))); L.ring.material.opacity = 0.5 + 0.5 * Math.sin((1 - f) * 40); }
      if (L.beamW) L.o.scale.x = L.o.scale.z = L.beamW * f;
      if (L.fade) { const m = L.o.material; if (m) m.opacity = f; }
    }
    for (const L of lights) if (L.t > 0) { L.t -= dt; L.l.intensity = Math.max(0, L.i0 * (L.t / L.t0)); }
  }

  /* ------------------------------------------------------------------ composite effects */
  function impact(x, y, z, nx, ny, nz, hex = 0xffd27a, big = false) {
    emit(glow, x, y, z, hex, big ? 10 : 5, big ? 6 : 4, 0.25, { dir: tmpP.set(nx, ny, nz), up: 0.5, grav: -10 });
    emit(debris, x, y, z, 0x3a3640, big ? 6 : 3, 3, 0.6, { dir: tmpP.set(nx, ny, nz), up: 1 });
    decal(x, y, z, nx, ny, nz, big ? 0.32 : 0.16);
  }
  function blood(x, y, z, cols, n, dir) {
    for (let k = 0; k < n; k++) emit(debris, x, y, z, cols[k % cols.length], 1, 4.5, 0.9, { dir, up: 1.5, var: 0.4 });
  }
  function gib(x, y, z, cols, n, force = 1, dir = null) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, s = rand(2, 6) * force;                       // NOSONAR
      spawnBody(gibs, x + rand(-0.3, 0.3), y + rand(-0.5, 0.5), z + rand(-0.3, 0.3),
        Math.cos(a) * s + (dir ? dir.x * 6 * force : 0), rand(3, 8) * force, Math.sin(a) * s + (dir ? dir.z * 6 * force : 0),
        cols[k % cols.length], rand(0.1, 0.24), rand(2.5, 4));
    }
    emit(glow, x, y, z, cols[0], 14, 6, 0.4, { up: 2 });
  }
  function shell(x, y, z, rightX, rightZ, hex = 0xc9a040) {
    spawnBody(shells, x, y, z, rightX * rand(1.8, 3) + rand(-0.4, 0.4), rand(2, 3.4), rightZ * rand(1.8, 3) + rand(-0.4, 0.4), hex, 0.06, 2.2, 22);
  }
  function explosion(x, y, z, radius, hex = 0xffa040) {
    flash(x, y, z, 0xfff0c0, radius * 1.1, 0.16);
    flash(x, y, z, hex, radius * 0.7, 0.32);
    shock(x, AR.World.floorAt(x, z, 0.3, y + 0.5), z, hex, radius * 1.1, 0.4);
    light(x, y + 0.6, z, hex, 9, radius * 5, 0.35);
    emit(glow, x, y, z, hex, 40, radius * 3, 0.55, { up: 3 });
    emit(debris, x, y, z, 0x2a2626, 24, radius * 2.2, 1.3, { up: 4, grav: -9 });
    emit(debris, x, y + 0.5, z, 0x4a4450, 14, 1.2, 1.6, { up: 1.2, grav: 0.6, drag: 2 });     // smoke puffs
    const f = AR.World.floorAt(x, z, 0.3, y + 0.5);
    if (y - f < 1.0) decal(x, f, z, 0, 1, 0, radius * 0.8, 0.0);
  }

  /* ------------------------------------------------------------------ damage numbers (DOM) */
  const dn = { pool: [], live: [] };
  function initNumbers() {
    const wrap = AR.el('arDmg');
    for (let i = 0; i < 40; i++) { const d = document.createElement('div'); d.className = 'ardn'; wrap.appendChild(d); dn.pool.push(d); }
  }
  function number(x, y, z, val, kind) {
    const d = dn.pool.length ? dn.pool.pop() : dn.live.shift()?.el;
    if (!d) return;
    d.textContent = kind === 'head' ? val + '!' : String(val);
    d.className = 'ardn ' + (kind || '');
    dn.live.push({ el: d, p: V3(x + rand(-0.25, 0.25), y, z + rand(-0.25, 0.25)), vy: kind === 'head' ? 2.6 : 1.8, life: kind ? 0.9 : 0.6, l0: kind ? 0.9 : 0.6 });
  }
  const proj = V3();
  function tickNumbers(dt, camera) {
    for (let i = dn.live.length - 1; i >= 0; i--) {
      const o = dn.live[i];
      o.life -= dt; o.p.y += o.vy * dt; o.vy -= 3 * dt;
      if (o.life <= 0) { o.el.style.opacity = '0'; dn.pool.push(o.el); dn.live.splice(i, 1); continue; }
      proj.copy(o.p).project(camera);
      if (proj.z > 1) { o.el.style.opacity = '0'; continue; }
      const t = 1 - o.life / o.l0;
      o.el.style.opacity = String(Math.min(1, o.life / o.l0 * 2.5));
      o.el.style.transform = `translate(${((proj.x * 0.5 + 0.5) * innerWidth) | 0}px,${((-proj.y * 0.5 + 0.5) * innerHeight) | 0}px) translate(-50%,-50%) scale(${t < 0.12 ? 1.6 - t * 5 : 1})`;
    }
  }

  /* ------------------------------------------------------------------ lifecycle */
  function init(sc) {
    scene = sc;
    group = new THREE.Group(); group.name = 'arena-fx'; scene.add(group);
    glow = pointPool(900, true, 0.18); group.add(glow.pts);
    debris = pointPool(700, false, 0.08); group.add(debris.pts);
    gibs = bodyPool(220, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    shells = bodyPool(64, new THREE.BoxGeometry(0.4, 0.4, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    group.add(gibs.mesh, shells.mesh);
    decals = bodyPool(220, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: decalTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    decals.mesh.renderOrder = 1; group.add(decals.mesh);
    tracer = tracerPool(96); group.add(tracer.line);
    lights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); group.add(l); lights.push({ l, t: 0, t0: 1, i0: 0 }); }
    ringGeo = new THREE.RingGeometry(0.9, 1.0, 40); discGeo = new THREE.CircleGeometry(1, 32); beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true);
    if (!dn.pool.length && !dn.live.length) initNumbers();
  }
  function dispose() {
    if (group) scene.remove(group);
    for (const d of dn.live) { d.el.style.opacity = '0'; dn.pool.push(d.el); }
    dn.live.length = 0; live.length = 0; lights = [];
    group = null;
  }
  function tick(dt, camera) {
    if (!group) return;
    tickPoints(glow, dt, true); tickPoints(debris, dt, false);
    tickBodies(gibs, dt); tickBodies(shells, dt);
    tickTracers(dt); tickLive(dt); tickNumbers(dt, camera);
  }

  return { init, dispose, tick, emit, impact, blood, gib, shell, explosion, flash, shock, light, telegraph, beam, trace, decal, number,
    get glow() { return glow; }, get debris() { return debris; } };
})();
