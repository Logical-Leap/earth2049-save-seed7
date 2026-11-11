/* EARTH 2049: SAVE SEED 7 — explosions
 *
 * Grenade blasts that feel like bombs: a white flash and a hard light pop, a fireball that boils out and
 * cools from yellow to red, a ground shockwave ring, chunks of debris and burning embers thrown up and
 * bouncing, a column of dark smoke that hangs around, and a scorch mark left behind. Plasma impacts get a
 * smaller hot-blue version. Everything is pixel-hard billboards in the PS1 look, pooled, no allocations
 * per frame. Sound comes from GunAudio.boom.
 *
 *   Boom.init({ scene, camera })
 *   Boom.explode(pos, { kind: 'grenade' | 'plasma', tier, hex, radius, groundY })  -> how hard it hits the camera (0..1)
 *   Boom.update(dt)
 */
'use strict';

const Boom = (() => {
  let scene = null, camera = null, texSoft = null, texPuff = null, texScorch = null, texRing = null;
  const live = [];          // { kind, obj, life, max, ... }
  const lights = [];

  function canvasTex(size, draw) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    return t;
  }
  function init(o) {
    scene = o.scene; camera = o.camera;
    // a blocky fire puff: a soft core broken into chunky 4px cells, like a PS1 sprite
    texSoft = canvasTex(32, (x, n) => {
      for (let y = 0; y < n; y += 2) for (let X = 0; X < n; X += 2) {
        const d = Math.hypot(X - n / 2 + 1, y - n / 2 + 1) / (n / 2);
        const a = Math.max(0, 1 - d) ** 1.2 * (0.75 + Math.random() * 0.5);
        if (a > .05) { x.fillStyle = `rgba(255,255,255,${Math.min(1, a)})`; x.fillRect(X, y, 2, 2); }
      }
    });
    texPuff = canvasTex(32, (x, n) => {
      for (let y = 0; y < n; y += 2) for (let X = 0; X < n; X += 2) {
        const d = Math.hypot(X - n / 2 + 1, y - n / 2 + 1) / (n / 2);
        const a = (d < 1 ? (1 - d * d) : 0) * (0.55 + Math.random() * 0.45);
        if (a > .05) { x.fillStyle = `rgba(255,255,255,${a})`; x.fillRect(X, y, 2, 2); }
      }
    });
    texScorch = canvasTex(32, (x, n) => {
      for (let y = 0; y < n; y += 2) for (let X = 0; X < n; X += 2) {
        const d = Math.hypot(X - n / 2 + 1, y - n / 2 + 1) / (n / 2);
        const a = d < 1 ? (1 - d) ** .7 * (.6 + Math.random() * .4) : 0;
        if (a > .05) { x.fillStyle = `rgba(0,0,0,${a})`; x.fillRect(X, y, 2, 2); }
      }
    });
    texRing = canvasTex(64, (x, n) => {
      x.strokeStyle = 'rgba(255,255,255,1)'; x.lineWidth = 6; x.beginPath(); x.arc(n / 2, n / 2, n / 2 - 5, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 3; x.beginPath(); x.arc(n / 2, n / 2, n / 2 - 12, 0, Math.PI * 2); x.stroke();
    });
    for (let i = 0; i < 3; i++) { const L = new THREE.PointLight(0xffa040, 0, 30, 2); scene.add(L); lights.push(L); }
  }

  function sprite(tex, color, additive, opacity) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: opacity ?? 1, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !additive }));
    scene.add(m);
    return m;
  }
  const debrisGeo = () => new THREE.BoxGeometry(.06, .05, .07);
  let _dg = null;

  function explode(pos, o = {}) {
    if (!scene) return 0;
    const kind = o.kind || 'grenade', tier = o.tier | 0, r = o.radius || (kind === 'grenade' ? 4.5 : 1.4);
    const gy = o.groundY ?? pos.y, P = pos.clone();
    const rar = new THREE.Color(o.hex ?? 0xffa040);
    const grenade = kind === 'grenade', sc = grenade ? r / 4.5 : r / 1.4;
    // light pop
    const L = lights.find(l => l.intensity < 1) || lights[0];
    L.position.copy(P).setY(P.y + .6); L.color.set(grenade ? (tier >= 3 ? rar.clone().lerp(new THREE.Color(0xffb050), .5) : new THREE.Color(0xffb050)) : rar);
    L.intensity = grenade ? 120 : 35; L.distance = grenade ? 34 : 14;
    live.push({ kind: 'light', obj: L, life: grenade ? .42 : .25, max: grenade ? .42 : .25, i0: L.intensity });
    // flash
    const fl = sprite(texSoft, 0xffffff, true); fl.position.copy(P);
    live.push({ kind: 'grow', obj: fl, life: .12, max: .12, s0: .5 * sc, s1: (grenade ? 7 : 3) * sc, o0: 1 });
    // fireball: puffs boil out and cool yellow -> orange -> red
    const nFire = grenade ? 20 : 6;
    for (let i = 0; i < nFire; i++) {
      // half the puffs glow (additive), half are solid flame that chars to black smoke as it cools
      const solid = grenade && i % 2 === 1;
      const s = sprite(solid ? texPuff : texSoft, 0xffe080, !solid);
      const d = new THREE.Vector3(Math.random() - .5, Math.random() * .7 + .1, Math.random() - .5).normalize().multiplyScalar(Math.random() * r * .35);
      s.position.copy(P).add(d.clone().multiplyScalar(.3));
      const life = (grenade ? .5 : .28) + Math.random() * .25;
      const hot = grenade ? (tier >= 3 && i % 3 === 0 ? rar : null) : rar;
      live.push({ kind: 'fire', obj: s, life: solid ? life * 1.5 : life, max: solid ? life * 1.5 : life, v: d.multiplyScalar(grenade ? 3.4 : 2.2),
                  s0: .5 * sc, s1: (grenade ? 2.4 + Math.random() * 2 : 1.4 + Math.random()) * sc, hot, solid });
    }
    // shockwave ring on the ground
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texRing, color: grenade ? 0xffd090 : rar, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(P.x, gy + .05, P.z); scene.add(ring);
    live.push({ kind: 'ring', obj: ring, life: grenade ? .45 : .3, max: grenade ? .45 : .3, s0: .3, s1: r * (grenade ? 2.6 : 2.0) });
    // a second, faster ring in the air for big ones
    if (grenade) {
      const ring2 = ring.clone(); ring2.material = ring.material.clone(); ring2.rotation.set(0, 0, 0); ring2.position.copy(P);
      ring2.lookAt(camera.position); scene.add(ring2);
      live.push({ kind: 'ring', obj: ring2, life: .25, max: .25, s0: .5, s1: r * 2.2 });
    }
    // debris and embers
    _dg = _dg || debrisGeo();
    const nDeb = grenade ? 16 : 0, nEmb = grenade ? 22 : 12;
    for (let i = 0; i < nDeb; i++) {
      const m = new THREE.Mesh(_dg, new THREE.MeshBasicMaterial({ color: [0x2a2622, 0x3a352f, 0x1c1a18][i % 3] }));
      m.position.copy(P); m.scale.setScalar(.5 + Math.random() * 1.1); scene.add(m);
      const v = new THREE.Vector3(Math.random() - .5, .6 + Math.random() * 1.1, Math.random() - .5).normalize().multiplyScalar(5 + Math.random() * 7);
      live.push({ kind: 'deb', obj: m, life: 1.6, max: 1.6, v, rot: new THREE.Vector3(Math.random() * 14, Math.random() * 14, Math.random() * 14), gy });
    }
    for (let i = 0; i < nEmb; i++) {
      const s = sprite(texSoft, grenade ? (i % 4 === 0 && tier >= 3 ? rar : new THREE.Color(0xffa030)) : rar, true);
      s.position.copy(P); s.scale.setScalar(.09 + Math.random() * .08);
      const v = new THREE.Vector3(Math.random() - .5, .4 + Math.random(), Math.random() - .5).normalize().multiplyScalar((grenade ? 6 : 4) + Math.random() * 8);
      live.push({ kind: 'ember', obj: s, life: .7 + Math.random() * .7, max: 1.4, v, gy });
    }
    // smoke column
    const nSmoke = grenade ? 12 : 3;
    for (let i = 0; i < nSmoke; i++) {
      const g = grenade ? .16 + Math.random() * .1 : .5;
      const s = sprite(texPuff, new THREE.Color(g, g * .95, g * .9), false, 0);
      const d = new THREE.Vector3((Math.random() - .5) * r * .5, Math.random() * r * .25, (Math.random() - .5) * r * .5);
      s.position.copy(P).add(d);
      const life = (grenade ? 1.8 : .7) + Math.random() * 1.2;
      live.push({ kind: 'smoke', obj: s, life, max: life, delay: .08 + Math.random() * .2, v: new THREE.Vector3((Math.random() - .5) * .6, .9 + Math.random() * 1.2, (Math.random() - .5) * .6),
                  s0: .8 * sc, s1: (2.6 + Math.random() * 2) * sc, o: grenade ? .82 : .35 });
    }
    // scorch mark
    if (grenade) {
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.4, r * 1.4), new THREE.MeshBasicMaterial({ map: texScorch, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2 }));
      sm.rotation.x = -Math.PI / 2; sm.rotation.z = Math.random() * 6; sm.position.set(P.x, gy + .02, P.z); scene.add(sm);
      live.push({ kind: 'fade', obj: sm, life: 9, max: 9 });
    }
    // how hard it hits the camera
    const d = camera ? camera.position.distanceTo(P) : 10;
    return Math.max(0, Math.min(1, (grenade ? 1.15 : .35) * (1 - d / (grenade ? 32 : 14))));
  }

  const _c = new THREE.Color();
  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const f = live[i];
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.life -= dt;
      const k = 1 - Math.max(0, f.life) / f.max;               // 0 -> 1 over the effect's life
      if (f.life <= 0) {
        if (f.kind === 'light') f.obj.intensity = 0;
        else { scene.remove(f.obj); f.obj.material.dispose?.(); if (f.obj.isMesh && f.obj.geometry !== _dg) f.obj.geometry.dispose(); }
        live.splice(i, 1); continue;
      }
      const o = f.obj;
      switch (f.kind) {
        case 'light': o.intensity = f.i0 * (1 - k) ** 2; break;
        case 'grow': o.scale.setScalar(f.s0 + (f.s1 - f.s0) * Math.sqrt(k)); o.material.opacity = 1 - k; break;
        case 'fire': {
          o.position.addScaledVector(f.v, dt); f.v.multiplyScalar(Math.max(0, 1 - dt * 5)); o.position.y += dt * .8;
          o.scale.setScalar(f.s0 + (f.s1 - f.s0) * (1 - (1 - k) ** 3));
          if (f.solid) {                                         // flame -> char -> smoke
            if (k < .35) _c.setRGB(1, .55 - k * .9, .12 - k * .3); else _c.setRGB(Math.max(.08, .7 - (k - .35) * 1.6), Math.max(.06, .24 - (k - .35) * .5), .05);
            o.material.opacity = Math.min(1, (1 - k) * 1.6) * .95;
          } else {
            if (f.hot) _c.copy(f.hot).lerp(new THREE.Color(0x601008), k * .8);
            else _c.setRGB(.95, .62 - k * .45, Math.max(0, .22 - k * .5));
            o.material.opacity = (1 - k) ** 1.6 * .85;
          }
          o.material.color.copy(_c);
          break;
        }
        case 'ring': o.scale.setScalar(f.s0 + (f.s1 - f.s0) * (1 - (1 - k) ** 2)); o.material.opacity = (1 - k) ** 1.5; break;
        case 'deb': case 'ember': {
          f.v.y -= (f.kind === 'deb' ? 16 : 9) * dt; o.position.addScaledVector(f.v, dt);
          if (o.position.y < f.gy + .03 && f.v.y < 0) { o.position.y = f.gy + .03; f.v.y *= -.3; f.v.x *= .55; f.v.z *= .55; }
          if (f.kind === 'deb') { o.rotation.x += f.rot.x * dt; o.rotation.y += f.rot.y * dt; o.rotation.z += f.rot.z * dt; }
          else o.material.opacity = 1 - k * k;
          break;
        }
        case 'smoke':
          o.position.addScaledVector(f.v, dt); f.v.multiplyScalar(Math.max(0, 1 - dt * .6));
          o.scale.setScalar(f.s0 + (f.s1 - f.s0) * Math.sqrt(k));
          o.material.opacity = f.o * Math.min(1, k * 6) * (1 - k) ** 1.2;
          break;
        case 'fade': o.material.opacity = Math.min(1, (1 - k) * 3) * .85; break;
      }
    }
  }

  return { init, explode, update };
})();

if (typeof window !== 'undefined') window.Boom = Boom;
