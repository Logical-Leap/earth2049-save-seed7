/* EARTH 2049: SAVE SEED 7 — gunfeel: first-person weapons
 *
 * Drives everything between the trigger and the screen, after the gold standards (Halo CE's weight and
 * readability, Call of Duty's snap and recoil): one viewmodel per gun and rarity built from the
 * game-art-pipeline arsenal GLBs, gloved hands, spring-based recoil and sway, aim-down-sights, magazines and
 * full reload animations (tactical and empty), draw/holster, muzzle flashes, ejected casings, camera kick, and
 * the layered gun audio in gunaudio.js. Higher rarities hit harder in every channel: less recoil, faster
 * handling, bigger magazines, louder and heavier shots, coloured flashes, and their own attachments and finish.
 *
 *   GunFeel.init({ camera, scene, gunGroup })
 *   GunFeel.equip(weapon)              -> { root, tip }   (tip = muzzle Object3D)
 *   GunFeel.update(dt, s)              s: { w, ads, move (0..1), onGround, dash, lookX, lookY, firing, feetY }
 *   GunFeel.fire(weapon)               call once per shot, after ammo is taken
 *   GunFeel.reload(weapon)             R; auto-called on an empty trigger pull
 *   GunFeel.canFire(weapon)
 *   GunFeel.magSize(id, tier), .fov, .spreadMul, .sensMul, .cam {pitch, yaw, roll}, .reloading, .adsK
 */
'use strict';

const GunFeel = (() => {
  const D2R = Math.PI / 180;
  /* ---------------------------------------------------------------- per-gun tuning
     mag: rounds per option; reload: [tactical, empty] seconds; style: reload choreography;
     kick: camera degrees per shot (pitch, yaw spread); vm: viewmodel kick (back m, up rad, roll rad);
     hip: grip position in camera space; ads: seconds to aim; draw: seconds; flash: size / kind; shell: casing kind */
  const GUN = {
    pistol:  { mag: { std: 12, ext: 18 }, reload: [1.15, 1.45], style: 'mag', rack: 'slide', kick: [1.1, .35], vm: [.045, .16, .05],
               hip: [.150, -.165, -.300], ads: .16, draw: .32, flash: [.9, 'star'], shell: 'pistol', fire: 'slide' },
    smg:     { mag: { std: 32, ext: 48, drum: 64 }, reload: [1.55, 1.95], style: 'mag', rack: 'bolt', kick: [.42, .38], vm: [.020, .05, .03],
               hip: [.160, -.185, -.290], ads: .18, draw: .38, flash: [.85, 'star'], shell: 'pistol', fire: 'bolt' },
    shotgun: { mag: { box: 6, drum: 10 }, reload: [1.9, 2.4], style: 'mag', rack: 'pump', kick: [3.6, .6], vm: [.10, .34, .08],
               hip: [.170, -.200, -.300], ads: .26, draw: .5, flash: [1.7, 'wide'], shell: 'shell', fire: 'none' },
    ar:      { mag: { std: 30, ext: 45, drum: 60 }, reload: [1.75, 2.2], style: 'mag', rack: 'bolt', kick: [.72, .32], vm: [.028, .07, .03],
               hip: [.165, -.190, -.300], ads: .22, draw: .45, flash: [1.05, 'star'], shell: 'rifle', fire: 'bolt' },
    dmr:     { mag: { std: 5, ext: 8 }, reload: [2.3, 2.8], style: 'mag', rack: 'boltaction', kick: [4.2, .5], vm: [.11, .4, .06],
               hip: [.165, -.190, -.310], ads: .32, draw: .55, flash: [1.5, 'star'], shell: 'rifle', fire: 'boltaction' },
    lmg:     { mag: { box: 100, drum: 150 }, reload: [3.6, 4.1], style: 'cover', rack: 'bolt', kick: [.58, .48], vm: [.024, .06, .04],
               hip: [.170, -.215, -.300], ads: .34, draw: .65, flash: [1.2, 'star'], shell: 'rifle', fire: 'belt' },
    energy:  { mag: { cell: 24, heavy: 36 }, reload: [1.6, 2.0], style: 'cell', rack: 'vent', kick: [1.0, .3], vm: [.045, .1, .04],
               hip: [.165, -.195, -.300], ads: .24, draw: .45, flash: [1.1, 'plasma'], shell: 'none', fire: 'coil' },
    rocket:  { mag: { shell: 6 }, reload: [.5, .5], style: 'single', rack: 'drum', kick: [4.4, .6], vm: [.13, .42, .07],
               hip: [.175, -.215, -.310], ads: .3, draw: .6, flash: [1.9, 'boom'], shell: 'none', fire: 'drum' },
  };
  // aim-down-sights: eye distance to the sight and the zoomed field of view, per optic
  const SIGHT = { iron: [.30, 62], reddot: [.27, 58], holo: [.29, 56], scope: [.20, 36], long: [.19, 22], thermal: [.22, 28], ladder: [.30, 60] };
  // rarity scaling (tier 0..6): recoil, reload and aim speed, flash size
  const R_RECOIL = [1, .93, .86, .79, .73, .67, .6];
  const R_HANDLE = [1, .95, .9, .85, .8, .76, .72];
  const R_FLASH = [1, 1.05, 1.1, 1.2, 1.35, 1.45, 1.6];
  const TIER_COL = [0xffc870, 0x9fd0ff, 0xd28cff, 0xffa63c, 0xff5a4a, 0xffd85a, 0x40f0ff];

  let camera, scene, gunGroup, armsRoot, flashTex, flashTexWide;
  const cache = {};                  // id:tier -> viewmodel
  let vm = null, curW = null;

  // springs: viewmodel position/rotation offsets and the camera kick
  const S = { p: [0, 0, 0], pv: [0, 0, 0], r: [0, 0, 0], rv: [0, 0, 0], c: [0, 0, 0], cv: [0, 0, 0] };
  const st = { adsK: 0, ads: false, drawT: 1, reload: null, bobT: 0, land: 0, wasGround: true, swayX: 0, swayY: 0, tiltZ: 0,
               flashT: 0, boltT: 9, partT: 9, spin: 0, spinV: 0, drumA: 0, drumTo: 0, lowWarn: 0, fov: 75 };
  const shells = [];

  /* ---------------------------------------------------------------- textures and hands */
  function makeFlashTex(wide) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,240,190,.9)'); g.addColorStop(1, 'rgba(255,120,20,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(255,230,160,.85)';
    const n = wide ? 9 : 6;
    for (let i = 0; i < n; i++) {                   // jagged prongs, pixel-hard like a PS1 sprite
      const a = i / n * Math.PI * 2 + (i % 2) * .2, L = (i % 2 ? 18 : 30) * (wide ? 1.05 : 1);
      x.beginPath(); x.moveTo(32 + Math.cos(a - .18) * 6, 32 + Math.sin(a - .18) * 6); x.lineTo(32 + Math.cos(a) * L, 32 + Math.sin(a) * L);
      x.lineTo(32 + Math.cos(a + .18) * 6, 32 + Math.sin(a + .18) * 6); x.fill();
    }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    return t;
  }
  // flat-shaded box with per-face colour (PS1 Gouraud look without scene lights)
  function shadedBox(w, h, d, hex, ox, oy, oz) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(ox || 0, oy || 0, oz || 0);
    const base = new THREE.Color(hex), n = g.attributes.normal, cols = [];
    for (let i = 0; i < n.count; i++) {
      const l = .55 + .45 * Math.max(0, n.getX(i) * -.35 + n.getY(i) * .75 + n.getZ(i) * .5);
      cols.push(base.r * l, base.g * l, base.b * l);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }
  const HAND_MAT = () => new THREE.MeshBasicMaterial({ vertexColors: true });
  function handMesh(side) {
    // gloved hand: palm, wrapped fingers, thumb, knuckle guard; built around the grip point (0,0,0)
    const s = side === 'R' ? 1 : -1, parts = [];
    parts.push(shadedBox(.026, .070, .050, 0x141317, s * .018, -.010, .000));         // palm round the grip
    parts.push(shadedBox(.024, .064, .020, 0x0f0e12, -s * .010, -.012, .020));        // fingers wrapped over
    parts.push(shadedBox(.016, .018, .040, 0x18171c, -s * .008, .026, .004));         // thumb
    parts.push(shadedBox(.028, .012, .044, 0x3a1466, s * .018, .028, .000));          // purple knuckle plate
    parts.push(shadedBox(.034, .040, .040, 0x1d1626, s * .016, -.012, -.040));        // wrist cuff
    const g = THREE.BufferGeometryUtils ? THREE.BufferGeometryUtils.mergeBufferGeometries(parts) : parts[0];
    const m = new THREE.Mesh(g, HAND_MAT()); m.renderOrder = 9;
    return m;
  }
  function sleeveMesh() {
    // unit-length forearm along +Z (scaled to the hand-elbow distance each frame): jacket sleeve with a neon cuff ring
    const parts = [shadedBox(.046, .044, 1, 0x120f18, 0, 0, .5), shadedBox(.050, .048, .03, 0x0090a8, 0, 0, .03),
                   shadedBox(.048, .046, .18, 0x1d1428, 0, 0, .26)];
    const g = THREE.BufferGeometryUtils ? THREE.BufferGeometryUtils.mergeBufferGeometries(parts) : parts[0];
    const m = new THREE.Mesh(g, HAND_MAT()); m.renderOrder = 9;
    return m;
  }

  function init(o) {
    camera = o.camera; scene = o.scene; gunGroup = o.gunGroup;
    gunGroup.scale.setScalar(1); gunGroup.rotation.set(0, 0, 0); gunGroup.position.set(0, 0, 0);
    flashTex = makeFlashTex(false); flashTexWide = makeFlashTex(true);
    armsRoot = new THREE.Group(); camera.add(armsRoot);
    armsRoot.userData.L = { hand: handMesh('L'), sleeve: sleeveMesh() };
    armsRoot.userData.R = { hand: handMesh('R'), sleeve: sleeveMesh() };
    for (const k of ['L', 'R']) { armsRoot.add(armsRoot.userData[k].hand); armsRoot.add(armsRoot.userData[k].sleeve); }
    GunAudio?.init?.();
  }

  /* ---------------------------------------------------------------- viewmodel build (one per gun + rarity) */
  function tintedTexture(img, mask, tint) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
      const t = tint[mask[p]] || tint[0];
      d[i] = Math.min(255, d[i] * t[0]); d[i + 1] = Math.min(255, d[i + 1] * t[1]); d[i + 2] = Math.min(255, d[i + 2] * t[2]);
    }
    x.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); t.flipY = false; t.encoding = THREE.sRGBEncoding;
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    return t;
  }
  const maskCache = new WeakMap();
  async function prepare(gltf) {
    if (maskCache.has(gltf)) return maskCache.get(gltf);
    const p = (async () => {
      const mt = await gltf.parser.getDependency('texture', 2).catch(() => null);
      if (!mt?.image) return null;
      const c = document.createElement('canvas'); c.width = mt.image.width; c.height = mt.image.height;
      const x = c.getContext('2d'); x.drawImage(mt.image, 0, 0);
      const md = x.getImageData(0, 0, c.width, c.height).data, mask = new Uint8Array(md.length / 4);
      for (let i = 0; i < mask.length; i++) mask[i] = Math.round(md[i * 4] / 32);
      return mask;
    })();
    maskCache.set(gltf, p);
    return p;
  }
  function preloadMasks() {
    for (const id of Object.keys(GUN)) { const g = AssetLoader?.getModel?.('weapon.' + id); if (g?.scene?.userData?.weapon) prepare(g); }
  }

  function build(id, tier) {
    const key = id + ':' + tier;
    if (cache[key]) return cache[key];
    const gltf = AssetLoader?.getModel?.('weapon.' + id);
    const man = gltf?.scene?.userData;
    if (!man?.weapon) return null;                               // not an arsenal GLB: leave it to the old path
    const R = man.rarities[Math.min(tier, man.rarities.length - 1)];
    const root = THREE.SkeletonUtils ? THREE.SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true);
    const opts = Object.values(man.options).flat();
    for (const n of opts) { const o = root.getObjectByName(n); if (o) o.scale.setScalar(R.show.includes(n) ? 1 : 0); }
    let mat = null;
    root.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false; o.renderOrder = 8;
      const src = o.material;
      // flat PS1 viewmodel: painted shading, a little under full white so only the glow parts bloom
      if (!mat) mat = new THREE.MeshBasicMaterial({ map: src.map, side: THREE.DoubleSide, color: new THREE.Color(.66, .66, .68), fog: false });
      o.material = mat;
    });
    // finish: tint a private copy of the albedo (async; the neutral texture shows for a frame)
    const tint = [[1, 1, 1]];
    for (const k of Object.keys(man.slots)) tint[+k] = R.tints[man.slots[k]] || [1, 1, 1];
    prepare(gltf).then(mask => { if (mask && mat?.map?.image) { mat.map = tintedTexture(mat.map.image, mask, tint); mat.needsUpdate = true; } });

    const A = man.anchors, a = n => new THREE.Vector3(...(A[n] || [0, 0, 0]));
    const model = new THREE.Group(); model.add(root); root.rotation.y = Math.PI;      // GLB points +Z; camera looks -Z
    const flip = v => new THREE.Vector3(-v.x, v.y, -v.z);
    const grip = flip(a('grip'));
    root.position.copy(grip).multiplyScalar(-1);                                       // grip point at the model origin
    const local = n => flip(a(n)).sub(grip);
    const tip = new THREE.Object3D(); tip.position.copy(local('muzzle')); model.add(tip);
    // muzzle flash: a front star and two crossed side blades, additive, a frame or two long
    const fcol = new THREE.Color(TIER_COL[tier]).lerp(new THREE.Color(0xffd8a0), tier >= 3 ? .25 : .75);
    const fm = (tex) => new THREE.MeshBasicMaterial({ map: tex, color: fcol, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const flash = new THREE.Group(); tip.add(flash);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fm(GUN[id].flash[1] === 'wide' ? flashTexWide : flashTex));
    const side1 = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), fm(flashTex)); side1.rotation.y = Math.PI / 2; side1.rotation.z = Math.PI / 2; side1.position.z = -.5;
    const side2 = side1.clone(); side2.rotation.x = Math.PI / 2;
    flash.add(front, side1, side2); flash.visible = false;
    for (const m of [front, side1, side2]) m.renderOrder = 10;
    const sightName = R.sight || 'iron';
    const v = {
      id, tier, man, R, model, tip, flash, flashMat: [front.material, side1.material, side2.material], fcol,
      grip: new THREE.Vector3(0, 0, 0), fore: local('fore'), magA: local('mag'), eject: local('eject'),
      sight: local('sight_' + sightName), sightName, eyeD: (SIGHT[sightName] || SIGHT.iron)[0], fov: (SIGHT[sightName] || SIGHT.iron)[1],
      node: n => root.getObjectByName(n), rest: {},
      g: GUN[id], magSize: magFor(id, R),
    };
    for (const n of ['slide', 'bolt', 'pump', 'cover', 'drum', 'mag', 'belt', 'spin_coil', 'spin_halo', 'spin_barrel']) {
      const o = v.node(n); if (o) v.rest[n] = { p: o.position.clone(), r: o.rotation.clone(), q: o.quaternion.clone() };
    }
    cache[key] = v;
    return v;
  }
  function magFor(id, R) {
    const g = GUN[id], m = g.mag;
    for (const n of R.show) if (n.startsWith('opt_mag_')) { const k = n.slice(8); if (m[k]) return m[k]; }
    return Object.values(m)[0];
  }
  function magSize(id, tier) {
    const gltf = AssetLoader?.getModel?.('weapon.' + id), man = gltf?.scene?.userData;
    if (man?.weapon) return magFor(id, man.rarities[Math.min(tier, man.rarities.length - 1)]);
    return Object.values(GUN[id]?.mag || { std: 30 })[0];
  }

  /* ---------------------------------------------------------------- equip / draw */
  function equip(w) {
    const nv = build(w.id, w.rar | 0);
    if (vm) gunGroup.remove(vm.model);
    vm = nv; curW = w;
    st.reload = null; st.drawT = 0; st.adsK = Math.min(st.adsK, .3);
    if (!vm) { armsRoot.visible = false; return null; }
    armsRoot.visible = true;
    gunGroup.add(vm.model);
    if (w.clip === undefined) w.clip = Math.min(vm.magSize, w.ammo === Infinity ? vm.magSize : vm.magSize);
    GunAudio?.foley?.('draw');
    return { root: vm.model, tip: vm.tip, external: true };
  }

  /* ---------------------------------------------------------------- reload choreography
     A reload is a list of keys over normalised time 0..1. Each key: gun pose offset (pos m, rot rad), where the
     magazine is (m, relative to its rest, plus a 'swap' moment when the new one appears), where the support hand
     is (anchor name or point), and sound cues. Keys are lerped with smoothstep. */
  const ss = t => t * t * (3 - 2 * t);
  function track(style, empty, rack) {
    const T = [];
    if (style === 'mag' || style === 'cover' || style === 'cell') {
      const lift = style === 'cell';
      T.push({ t: 0, pose: [0, 0, 0, 0, 0, 0], mag: [0, 0, 0], hand: 'fore' });
      if (style === 'cover') {
        T.push({ t: .12, pose: [-.02, .02, .03, .18, 0, -.35], mag: [0, 0, 0], hand: 'cover', cue: 'coverOpen', cover: 1 });
        T.push({ t: .26, pose: [-.02, .02, .03, .18, 0, -.35], mag: [0, 0, 0], hand: 'mag', cover: 1, cue: 'magOut' });
        T.push({ t: .42, pose: [-.03, -.02, .03, .2, 0, -.4], mag: [-.05, -.30, .02], hand: 'below', cover: 1, swap: true });
        T.push({ t: .60, pose: [-.02, .0, .03, .2, 0, -.35], mag: [0, -.02, 0], hand: 'mag', cover: 1, cue: 'magIn' });
        T.push({ t: .70, pose: [-.02, .02, .03, .18, 0, -.35], mag: [0, 0, 0], hand: 'cover', cover: 1, cue: 'beltIn' });
        T.push({ t: .82, pose: [0, .0, .01, .06, 0, -.15], mag: [0, 0, 0], hand: 'cover', cover: 0, cue: 'coverClose' });
      } else {
        T.push({ t: .14, pose: [-.015, .02, .02, .16, -.05, lift ? .25 : -.42], mag: [0, 0, 0], hand: 'mag' });
        T.push({ t: .26, pose: [-.015, .02, .02, .16, -.05, lift ? .25 : -.42], mag: lift ? [0, .05, -.01] : [0, -.05, .01], hand: 'mag', cue: lift ? 'cellOut' : 'magOut' });
        T.push({ t: .44, pose: [-.02, -.01, .02, .18, -.05, lift ? .25 : -.45], mag: lift ? [.02, .13, .03] : [-.04, -.32, .04], hand: 'below', swap: true, cue: empty && !lift ? 'magDrop' : null });
        T.push({ t: .60, pose: [-.015, .01, .02, .16, -.05, lift ? .25 : -.42], mag: lift ? [0, .05, -.01] : [0, -.04, .01], hand: 'mag' });
        T.push({ t: .70, pose: [-.012, .02, .015, .12, -.04, lift ? .2 : -.38], mag: [0, 0, 0], hand: 'mag', cue: lift ? 'cellIn' : 'magIn', kick: .02 });
        T.push({ t: .77, pose: [-.01, .022, .015, .10, -.04, lift ? .18 : -.34], mag: [0, 0, 0], hand: 'mag', cue: lift ? null : 'tap', kick: .012 });
      }
      if (empty) {
        const handTo = rack === 'pump' ? 'pump' : (rack === 'slide' ? 'slide' : 'bolt');
        T.push({ t: .84, pose: [.0, .01, .01, .05, .1, .25], mag: [0, 0, 0], hand: handTo, cue: rack === 'pump' ? 'pumpBack' : rack === 'slide' ? null : rack === 'vent' ? 'vent' : rack === 'boltaction' ? 'boltUp' : 'rackBack', rack: 1 });
        T.push({ t: .92, pose: [.0, .0, .01, .03, .04, .1], mag: [0, 0, 0], hand: handTo, cue: rack === 'pump' ? 'pumpFwd' : rack === 'slide' ? 'slideRelease' : rack === 'vent' ? null : rack === 'boltaction' ? 'boltDown' : 'rackFwd', rack: 0, kick: .02 });
      }
      T.push({ t: 1, pose: [0, 0, 0, 0, 0, 0], mag: [0, 0, 0], hand: 'fore' });
    }
    return T;
  }
  function sampleTrack(T, t) {
    let i = 0; while (i < T.length - 2 && t > T[i + 1].t) i++;
    const a = T[i], b = T[i + 1], k = ss(Math.min(1, Math.max(0, (t - a.t) / Math.max(1e-4, b.t - a.t))));
    const L = (x, y) => x.map((v, j) => v + (y[j] - v) * k);
    return { pose: L(a.pose, b.pose), mag: L(a.mag, b.mag), handA: a.hand, handB: b.hand, k, cover: (a.cover || 0) + ((b.cover || 0) - (a.cover || 0)) * k,
             rack: (a.rack || 0) + ((b.rack || 0) - (a.rack || 0)) * k, swapped: T.some(x => x.swap && x.t <= t) };
  }

  function reload(w) {
    if (!vm || !w || st.reload || st.drawT < 1) return false;
    const mag = vm.magSize;
    if (w.clip >= mag || (w.ammo !== Infinity && w.ammo <= 0)) return false;
    const tierK = R_HANDLE[vm.tier] * (1 - (window.G?.p?.mods?.reload || 0));
    if (vm.g.style === 'single') {
      st.reload = { single: true, t: 0, dur: (vm.g.reload[0]) * tierK, w, n: 0, open: .28 * tierK, opened: false };
      GunAudio?.foley?.('drumOpen');
      return true;
    }
    const empty = w.clip === 0;
    const dur = vm.g.reload[empty ? 1 : 0] * tierK;
    st.reload = { t: 0, dur, w, empty, T: track(vm.g.style, empty, vm.g.rack), fired: new Set(), done: false };
    st.ads = false;
    return true;
  }
  function commitAmmo(w) {
    const need = vm.magSize - w.clip;
    if (w.ammo === Infinity) { w.clip = vm.magSize; return; }
    const take = Math.min(need, w.ammo); w.clip += take; w.ammo -= take;
  }

  function canFire(w) {
    if (!vm) return true;
    if (st.drawT < .75) return false;
    if (st.reload) {
      if (st.reload.single && w.clip > 0) { st.reload = null; GunAudio?.foley?.('drumClose'); return true; }   // fire interrupts shell-by-shell loading
      return false;
    }
    return true;
  }

  /* ---------------------------------------------------------------- firing */
  function fire(w) {
    if (!vm) return { pitch: 0, yaw: 0 };
    const g = vm.g, tier = vm.tier, rk = R_RECOIL[tier], adsF = 1 - st.adsK * .45;
    // viewmodel kick: back, up, a little random roll (springs carry it back)
    S.pv[2] += g.vm[0] * 20 * rk * adsF; S.pv[1] += g.vm[0] * 4 * rk * adsF; S.rv[0] += g.vm[1] * 14 * rk * adsF;
    S.rv[2] += (Math.random() - .5) * g.vm[2] * 26 * rk; S.rv[1] += (Math.random() - .5) * g.vm[2] * 12 * rk;
    // camera kick: pitch up with a little yaw wander; most of it recovers, some of it climbs (CoD-style)
    const kp = g.kick[0] * rk * (1 - st.adsK * .25), ky = (Math.random() - .5) * 2 * g.kick[1] * rk;
    S.cv[0] += kp * D2R * 14; S.cv[1] += ky * D2R * 14; S.cv[2] += (Math.random() - .5) * kp * D2R * 4;
    // moving parts
    st.partT = 0; st.spinV += 18;
    if (g.fire === 'drum') st.drumTo += Math.PI / 3;
    if (g.fire === 'boltaction') { st.boltT = 0; }
    // flash: random roll and scale, coloured by rarity from Epic up
    st.flashT = .045;
    const fs = g.flash[0] * R_FLASH[tier] * (.85 + Math.random() * .35) * .26;
    vm.flash.visible = true; vm.flash.scale.setScalar(fs); vm.flash.rotation.z = Math.random() * Math.PI;
    for (const m of vm.flashMat) m.opacity = 1;
    // casings
    if (g.shell !== 'none') spawnShell(g.shell, tier);
    GunAudio?.shot?.(w.id, tier);
    if (w.clip <= Math.ceil(vm.magSize * .2) && w.clip > 0 && vm.magSize > 6) GunAudio?.foley?.('lowAmmo');
    return { pitch: kp * D2R * .22, yaw: ky * D2R * .12 };   // the permanent share of the kick (climb)
  }
  function dryFire() { GunAudio?.foley?.('dry'); S.rv[0] += .4; }

  /* ---------------------------------------------------------------- casings */
  const shellGeo = {}, shellMat = {};
  function spawnShell(kind, tier) {
    if (!shellGeo[kind]) {
      const dims = kind === 'shell' ? [.018, .018, .055] : kind === 'rifle' ? [.010, .010, .042] : [.009, .009, .022];
      shellGeo[kind] = new THREE.BoxGeometry(...dims);
      shellMat[kind] = new THREE.MeshBasicMaterial({ color: kind === 'shell' ? 0xc0302a : 0xd8a040 });
    }
    let s = shells.find(x => !x.alive);
    if (!s) { if (shells.length > 40) s = shells[0]; else { s = { m: new THREE.Mesh(shellGeo[kind], shellMat[kind]) }; scene.add(s.m); shells.push(s); } }
    s.m.geometry = shellGeo[kind]; s.m.material = shellMat[kind];
    const p = vm.model.localToWorld(vm.eject.clone());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
    s.v = right.multiplyScalar(1.8 + Math.random() * .8).add(up.multiplyScalar(1.6 + Math.random() * .7)).add(back.multiplyScalar(.4 + Math.random() * .4));
    s.m.position.copy(p); s.m.visible = true; s.alive = true; s.life = 1.6; s.bounced = 0; s.kind = kind;
    s.rot = new THREE.Vector3(Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15);
  }
  function shellTick(dt, feetY) {
    for (const s of shells) {
      if (!s.alive) continue;
      s.life -= dt; if (s.life <= 0) { s.alive = false; s.m.visible = false; continue; }
      s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.rot.x * dt; s.m.rotation.y += s.rot.y * dt; s.m.rotation.z += s.rot.z * dt;
      if (s.m.position.y < feetY + .01 && s.v.y < 0) {
        s.m.position.y = feetY + .01; s.v.y *= -.32; s.v.x *= .5; s.v.z *= .5; s.rot.multiplyScalar(.5);
        if (s.bounced++ < 2 && Math.abs(s.v.y) > .2) GunAudio?.foley?.(s.kind === 'shell' ? 'shellTink' : 'tink');
      }
    }
  }

  /* ---------------------------------------------------------------- per frame */
  function spring(x, v, k, c, dt) {
    for (let i = 0; i < 3; i++) { v[i] += (-k * x[i] - c * v[i]) * dt; x[i] += v[i] * dt; }
  }
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

  function update(dt, s) {
    if (armsRoot) armsRoot.visible = !!vm && gunGroup.visible;
    if (!vm) { shellTick(dt, s.feetY || 0); if (scopeEl) scopeOverlay(0); return; }
    dt = Math.min(dt, 1 / 20);
    const g = vm.g, tier = vm.tier, w = curW;
    // ADS (not while reloading or drawing)
    const wantAds = !!s.ads && !st.reload && st.drawT >= 1 && !s.dash;
    if (wantAds !== st.ads) { st.ads = wantAds; GunAudio?.foley?.(wantAds ? 'adsIn' : 'adsOut'); }
    const adsT = g.ads * R_HANDLE[tier];
    st.adsK += ((st.ads ? 1 : 0) - st.adsK) * Math.min(1, dt / Math.max(.04, adsT * .45));
    const aK = ss(Math.min(1, Math.max(0, st.adsK)));
    // draw
    if (st.drawT < 1) st.drawT = Math.min(1, st.drawT + dt / (g.draw * R_HANDLE[tier]));
    const dK = 1 - ss(st.drawT);
    // springs: viewmodel and camera
    spring(S.p, S.pv, 160, 17, dt); spring(S.r, S.rv, 190, 18, dt); spring(S.c, S.cv, 95, 16, dt);
    // bob (figure eight), sway (lags the look), strafe tilt, landing dip, breathing
    const mv = Math.min(1, s.move || 0) * (s.onGround ? 1 : .2);
    st.bobT += dt * (5.6 + mv * 3.2) * (mv > .05 ? 1 : .25);
    const bobAmp = (mv * .012 + .0015) * (1 - aK * .85);
    const bx = Math.sin(st.bobT) * bobAmp, by = Math.abs(Math.cos(st.bobT)) * bobAmp * 1.2 - bobAmp * .6;
    st.swayX += (Math.max(-.035, Math.min(.035, -(s.lookX || 0) * .0011)) - st.swayX) * Math.min(1, dt * 9);
    st.swayY += (Math.max(-.035, Math.min(.035, (s.lookY || 0) * .0011)) - st.swayY) * Math.min(1, dt * 9);
    st.tiltZ += ((s.strafe || 0) * -.05 - st.tiltZ) * Math.min(1, dt * 6);
    if (s.onGround && !st.wasGround) { st.land = .06; GunAudio?.foley?.('holster'); }
    st.wasGround = s.onGround; st.land = Math.max(0, st.land - dt * .35);
    const landY = -Math.sin(Math.min(1, (.06 - st.land) / .06) * Math.PI) * (st.land > 0 ? .03 : 0);
    const breathe = Math.sin(performance.now() * .0012) * .002 * (1 - aK * .7);
    // reload
    let pose = [0, 0, 0, 0, 0, 0], magOff = [0, 0, 0], handA = 'fore', handB = 'fore', handK = 0, cover = 0, rack = 0, swapped = false;
    const R = st.reload;
    if (R) {
      R.t += dt;
      if (R.single) {
        // shell by shell: open, then a load cycle per round, then close. Fire cancels it (canFire).
        pose = [-.02, .01, .02, .12, -.08, -.32];
        const cyc = R.dur, tt = R.t - R.open;
        if (tt > 0) {
          const ph = (tt % cyc) / cyc, n = Math.floor(tt / cyc);
          if (n > R.n) {
            R.n = n; commitOne(R.w); GunAudio?.foley?.('grenadeIn'); st.drumTo += Math.PI / 3; GunAudio?.foley?.('drumClick'); S.rv[0] += .3;
            if (R.w.clip >= vm.magSize || (R.w.ammo !== Infinity && R.w.ammo <= 0)) { st.reload = null; GunAudio?.foley?.('drumClose'); S.rv[0] -= .6; }
          }
          magOff = [0, -.18 * (1 - ss(Math.min(1, ph * 1.6))), -.05 * (1 - ph)];
          handA = 'mag'; handB = 'mag'; handK = 1;
        }
      } else {
        const t = Math.min(1, R.t / R.dur), sm = sampleTrack(R.T, t);
        pose = sm.pose; magOff = sm.mag; handA = sm.handA; handB = sm.handB; handK = sm.k; cover = sm.cover; rack = sm.rack; swapped = sm.swapped;
        for (const k of R.T) if (k.t <= t && !R.fired.has(k)) {
          R.fired.add(k);
          if (k.cue) GunAudio?.foley?.(k.cue);
          if (k.kick) S.pv[1] -= k.kick * 8;
          if (k.cue === 'magIn' || k.cue === 'cellIn' || k.cue === 'beltIn') commitAmmo(R.w);
        }
        if (t >= 1) { st.reload = null; if (R.w.clip < vm.magSize && R.w.clip === 0) commitAmmo(R.w); }
      }
    }
    // base pose: hip -> ADS (the optic's sight line on the screen centre)
    const hip = g.hip, ads = [-vm.sight.x, -vm.sight.y, -vm.eyeD - vm.sight.z];
    const px = hip[0] + (ads[0] - hip[0]) * aK, py = hip[1] + (ads[1] - hip[1]) * aK, pz = hip[2] + (ads[2] - hip[2]) * aK;
    const dashDip = s.dash ? 1 : 0;
    gunGroup.position.set(
      px + bx + st.swayX * (1 - aK * .7) + pose[0] + S.p[0] - dK * .05,
      py + by + st.swayY * (1 - aK * .7) + pose[1] + S.p[1] + landY + breathe - dK * .22 - dashDip * .03,
      pz + pose[2] + S.p[2]);
    gunGroup.rotation.set(
      S.r[0] + pose[3] - dK * .9 + st.swayY * 1.2 * (1 - aK) - dashDip * .1,
      S.r[1] + pose[4] + st.swayX * 1.5 * (1 - aK) + .03 * (1 - aK) - dK * .3,
      S.r[2] + pose[5] + st.tiltZ * (1 - aK * .6) + st.swayX * .8 + dK * .4 + dashDip * .12);
    // moving parts
    st.partT += dt; st.boltT += dt;
    const P = vm.rest, n = vm.node;
    const kickPart = Math.max(0, 1 - st.partT / .07);
    if (P.slide) n('slide').position.z = P.slide.p.z - (g.fire === 'slide' ? kickPart * .022 : 0) - (R && R.empty && rack ? rack * .025 : 0) - (w && w.clip === 0 && !R ? .022 : 0);
    if (P.bolt) {
      const bo = n('bolt');
      if (g.fire === 'boltaction') {                      // lift, pull, push, drop after every shot
        const T = .45 * R_HANDLE[tier], k = Math.min(1, st.boltT / T);
        if (st.boltT < T) {
          if (k > 0 && !st.ba1) { st.ba1 = 1; GunAudio?.foley?.('boltUp'); }
          if (k > .3 && !st.ba2) { st.ba2 = 1; GunAudio?.foley?.('boltBack'); }
          if (k > .6 && !st.ba3) { st.ba3 = 1; GunAudio?.foley?.('boltFwd'); }
          if (k > .85 && !st.ba4) { st.ba4 = 1; GunAudio?.foley?.('boltDown'); }
        } else st.ba1 = st.ba2 = st.ba3 = st.ba4 = 0;
        const lift = k < .25 ? k / .25 : k > .8 ? (1 - k) / .2 : 1, pull = k < .25 ? 0 : k < .55 ? (k - .25) / .3 : k < .8 ? 1 - (k - .55) / .25 : 0;
        bo.rotation.z = P.bolt.r.z + (st.boltT < T ? lift : 0) * 1.1;
        bo.position.z = P.bolt.p.z - (st.boltT < T ? pull : 0) * .08 - rack * .08;
        if (st.boltT < T) { gunGroup.rotation.z += lift * .12; gunGroup.rotation.x += lift * .05; }
      } else bo.position.z = P.bolt.p.z - kickPart * .015 - rack * .05;
    }
    if (P.pump) n('pump').position.z = P.pump.p.z - rack * .09;
    if (P.cover) n('cover').rotation.x = P.cover.r.x - cover * .95;
    if (P.mag) {
      const mg = n('mag');
      mg.position.set(P.mag.p.x - magOff[0], P.mag.p.y + magOff[1], P.mag.p.z - magOff[2]);   // GLB space (x, z flipped by the root)
    }
    if (P.belt) n('belt').rotation.x = P.belt.r.x + Math.sin(st.partT * 60) * Math.max(0, 1 - st.partT / .1) * .08;
    st.spinV = Math.max(0, st.spinV - dt * 22); st.spin += dt * (1.2 + st.spinV);
    if (P.spin_coil) n('spin_coil').rotation.z = st.spin * 1.6;
    if (P.spin_halo) n('spin_halo').rotation.z = st.spin * .7;
    if (P.spin_barrel) n('spin_barrel').rotation.z = st.spin * .7;
    if (P.drum) { st.drumA += (st.drumTo - st.drumA) * Math.min(1, dt * 14); n('drum').rotation.z = P.drum.r.z + st.drumA; }
    // flash
    if (st.flashT > 0) { st.flashT -= dt; if (st.flashT <= 0) vm.flash.visible = false; else for (const m of vm.flashMat) m.opacity = Math.min(1, st.flashT / .03); }
    // hands
    gunGroup.updateMatrixWorld(true);
    placeHand('R', vm.model.localToWorld(_v.set(0, 0, 0)), [.28, -.40, .12], 0);
    const pa = handPoint(handA), pb = handPoint(handB);
    const hp = pa.lerp(pb, handK);
    placeHand('L', vm.model.localToWorld(hp), [-.22, -.44, .10], 1);
    shellTick(dt, s.feetY || 0);
    // scoped optics: past the halfway point of the raise the eye is in the scope; swap to the scope overlay
    const scoped = SCOPED.has(vm.sightName);
    const inScope = scoped && aK > .62;
    vm.model.visible = !inScope; if (inScope) armsRoot.visible = false;
    scopeOverlay(scoped ? Math.max(0, (aK - .55) / .45) : 0, vm.sightName, tier);
    // outputs
    st.fov = 75 + (vm.fov - 75) * aK;
  }
  function commitOne(w) {
    if (w.ammo === Infinity) { w.clip = Math.min(vm.magSize, w.clip + 1); return; }
    if (w.ammo > 0) { w.ammo--; w.clip++; }
  }
  function handPoint(name) {
    switch (name) {
      case 'mag': return vm.magA.clone().add(new THREE.Vector3(0, .02, 0));
      case 'below': return vm.magA.clone().add(new THREE.Vector3(-.06, -.26, .05));
      case 'pump': return vm.fore.clone().add(new THREE.Vector3(0, 0, .09));
      case 'slide': return new THREE.Vector3(-.02, .06, .05);
      case 'bolt': return vm.eject.clone().add(new THREE.Vector3(-.02, .01, .03));
      case 'cover': return new THREE.Vector3(0, .1, -.05);
      default: return vm.fore.clone();
    }
  }
  function placeHand(side, worldPos, elbowCam, mirror) {
    const H = armsRoot.userData[side];
    const p = camera.worldToLocal(worldPos.clone());
    H.hand.position.copy(p);
    H.hand.quaternion.copy(gunGroup.quaternion);
    if (side === 'L') H.hand.rotateZ(-1.2);
    const e = new THREE.Vector3(...elbowCam);
    e.y += gunGroup.position.y * .5; e.x += gunGroup.position.x * .3;
    const dir = e.clone().sub(p), L = dir.length();
    H.sleeve.position.copy(p).addScaledVector(dir, .06 / L);
    H.sleeve.scale.set(1, 1, Math.max(.05, L * 1.4));
    H.sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
  }

  const SCOPED = new Set(['scope', 'long', 'thermal']);
  let scopeEl = null;
  function scopeOverlay(k, sight, tier) {
    if (!scopeEl) {
      scopeEl = document.createElement('div');
      scopeEl.id = 'gfScope';
      scopeEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;transition:none;' +
        'background:radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0 31vmin, rgba(0,0,0,.92) 32vmin, #000 46vmin);';
      scopeEl.innerHTML = '<div class="r" style="position:absolute;left:50%;top:50%;width:62vmin;height:62vmin;transform:translate(-50%,-50%);border-radius:50%;' +
        'box-shadow:inset 0 0 6vmin rgba(0,0,0,.8);"></div>' +
        '<div class="h" style="position:absolute;left:calc(50% - 31vmin);width:62vmin;top:50%;height:2px;margin-top:-1px;background:rgba(0,0,0,.85)"></div>' +
        '<div class="v" style="position:absolute;top:calc(50% - 31vmin);height:62vmin;left:50%;width:2px;margin-left:-1px;background:rgba(0,0,0,.85)"></div>' +
        '<div class="d" style="position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2px 0 0 -2px;border-radius:50%"></div>' +
        '<div class="t" style="position:absolute;left:50%;top:50%;width:62vmin;height:62vmin;transform:translate(-50%,-50%);border-radius:50%;mix-blend-mode:multiply"></div>';
      document.body.appendChild(scopeEl);
    }
    scopeEl.style.opacity = String(Math.min(1, k));
    scopeEl.style.display = k > 0.01 ? 'block' : 'none';
    if (k > 0.01) {
      const hex = '#' + TIER_COL[tier].toString(16).padStart(6, '0');
      scopeEl.querySelector('.d').style.background = hex;
      scopeEl.querySelector('.d').style.boxShadow = '0 0 8px ' + hex;
      scopeEl.querySelector('.t').style.background = sight === 'thermal' ? 'rgba(120,255,170,.55)' : 'transparent';
    }
  }

  function setVisible(v) { if (armsRoot) armsRoot.visible = v && !!vm; }

  return {
    init, equip, update, fire, dryFire, reload, canFire, magSize, preloadMasks, setVisible, GUN,
    get fov() { return st.fov; }, get adsK() { return st.adsK; }, get reloading() { return !!st.reload; },
    get spreadMul() { return 1 - st.adsK * .65; }, get sensMul() { return 1 - st.adsK * (vm ? (1 - vm.fov / 75) * .9 : 0); },
    get cam() { return { pitch: S.c[0], yaw: S.c[1], roll: S.c[2] }; },
    get active() { return !!vm; }, get drawing() { return st.drawT < 1; },
  };
})();

if (typeof window !== 'undefined') window.GunFeel = GunFeel;
