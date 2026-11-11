/* EARTH 2049: SAVE SEED 7 — gunfeel: first-person weapons
 *
 * Drives everything between the trigger and the screen, after the gold standards (Halo CE's weight and
 * readability, Call of Duty's snap and recoil): one viewmodel per gun and rarity built from the
 * game-art-pipeline arsenal GLBs, gloved hands, spring-based recoil and sway, aim-down-sights, magazines and
 * full reload animations, draw/holster, muzzle flashes, ejected casings, camera kick, and the layered gun
 * audio in gunaudio.js. Higher rarities hit harder in every channel: less recoil, faster handling, bigger
 * magazines, louder and heavier shots, coloured flashes, and their own attachments and finish.
 *
 * Each gun works its own way:
 *   - pump shotgun: the support hand racks the pump after every shot and a red hull flies out; reloads push
 *     shells one at a time into the loading port, and racks the pump if it ran dry
 *   - bolt-action rifle: the firing hand leaves the grip, lifts and pulls the bolt (casing out, next round up
 *     from the magazine), pushes it home and comes back; the scope drops while it does
 *   - belt-fed LMG: the belt runs from the box into the feed tray and steps forward with every shot; reloads
 *     open the cover, swap the box and lay the new belt in the tray
 *   - red dots and holo sights are clear glass with the reticle on the sight line; scopes zoom and black out
 *
 *   GunFeel.init({ camera, scene, gunGroup })
 *   GunFeel.equip(weapon)              -> { root, tip }   (tip = muzzle Object3D)
 *   GunFeel.update(dt, s)              s: { ads, move (0..1), strafe, onGround, dash, lookX, lookY, feetY }
 *   GunFeel.fire(weapon)               call once per shot, after ammo is taken
 *   GunFeel.reload(weapon)             R; auto-called on an empty trigger pull
 *   GunFeel.canFire(weapon)
 *   GunFeel.magSize(id, tier), .fov, .spreadMul, .sensMul, .cam {pitch, yaw, roll}, .reloading, .adsK
 */
'use strict';

const GunFeel = (() => {
  const D2R = Math.PI / 180;
  /* ---------------------------------------------------------------- per-gun tuning
     mag: rounds per option; reload: [tactical, empty] seconds (tube/single: seconds per round);
     style: reload choreography; rack: how an empty gun is chambered; fire: what moves on each shot;
     kick: camera degrees per shot (pitch, yaw spread); vm: viewmodel kick (back m, up rad, roll rad);
     hip: grip position in camera space; ads: seconds to aim; draw: seconds; flash: size / kind;
     shell: casing kind; punch: FOV kick in degrees; cycle: seconds for the pump / bolt after a shot */
  const GUN = {
    pistol:  { mag: { std: 12, ext: 18 }, reload: [1.15, 1.45], style: 'mag', rack: 'slide', kick: [1.1, .35], vm: [.045, .16, .05],
               hip: [.150, -.165, -.300], ads: .16, draw: .32, flash: [.9, 'star'], shell: 'pistol', fire: 'slide', punch: .6 },
    smg:     { mag: { std: 32, ext: 48, drum: 64 }, reload: [1.55, 1.95], style: 'mag', rack: 'bolt', kick: [.42, .38], vm: [.020, .05, .03],
               hip: [.160, -.185, -.290], ads: .18, draw: .38, flash: [.85, 'star'], shell: 'pistol', fire: 'bolt', punch: .25 },
    shotgun: { mag: { std: 6, ext: 8 }, reload: [.50, .50], style: 'tube', rack: 'pump', kick: [5.0, .7], vm: [.15, .42, .10],
               hip: [.165, -.195, -.300], ads: .24, draw: .5, flash: [2.1, 'wide'], shell: 'hull', fire: 'pump', punch: 5.5, cycle: .50 },
    ar:      { mag: { std: 30, ext: 45, drum: 60 }, reload: [1.75, 2.2], style: 'mag', rack: 'bolt', kick: [.72, .32], vm: [.028, .07, .03],
               hip: [.165, -.190, -.300], ads: .22, draw: .45, flash: [1.05, 'star'], shell: 'rifle', fire: 'bolt', punch: .35 },
    dmr:     { mag: { std: 5, ext: 8 }, reload: [2.2, 2.4], style: 'mag', rack: 'boltaction', kick: [4.2, .5], vm: [.11, .4, .06],
               hip: [.165, -.190, -.310], ads: .20, draw: .55, flash: [1.5, 'star'], shell: 'rifle', fire: 'boltaction', punch: 3, cycle: .90 },
    lmg:     { mag: { box: 100, drum: 150 }, reload: [3.6, 3.6], style: 'cover', rack: 'none', kick: [.58, .48], vm: [.024, .06, .04],
               hip: [.170, -.215, -.300], ads: .34, draw: .65, flash: [1.2, 'star'], shell: 'rifle', fire: 'belt', punch: .4 },
    energy:  { mag: { cell: 24, heavy: 36 }, reload: [1.6, 2.0], style: 'cell', rack: 'vent', kick: [1.3, .35], vm: [.055, .13, .05],
               hip: [.165, -.195, -.300], ads: .24, draw: .45, flash: [1.3, 'plasma'], shell: 'none', fire: 'coil', punch: 1.2 },
    rocket:  { mag: { shell: 6 }, reload: [.5, .5], style: 'single', rack: 'drum', kick: [4.4, .6], vm: [.13, .42, .07],
               hip: [.175, -.215, -.310], ads: .3, draw: .6, flash: [1.9, 'boom'], shell: 'none', fire: 'drum', punch: 3.5 },
  };
  // aim-down-sights: eye distance to the sight and the zoomed field of view, per optic
  const SIGHT = { iron: [.30, 62], reddot: [.27, 58], holo: [.29, 56], scope: [.20, 36], long: [.19, 22], thermal: [.22, 28], ladder: [.30, 60] };
  const SCOPED = new Set(['scope', 'long', 'thermal']);
  const GLASS = new Set(['reddot', 'holo']);
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
               flashT: 0, partT: 9, spin: 0, spinV: 0, drumA: 0, drumTo: 0, fov: 75, punch: 0,
               cycleT: 9, cycleCues: 0, beltPhase: 0, beltTarget: 0, rHand: 0 };
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
  function shade(g, hexAt) {
    const n = g.attributes.normal, p = g.attributes.position, cols = [];
    for (let i = 0; i < n.count; i++) {
      const base = new THREE.Color(hexAt(p.getX(i), p.getY(i), p.getZ(i)));
      const l = .55 + .45 * Math.max(0, n.getX(i) * -.35 + n.getY(i) * .75 + n.getZ(i) * .5);
      cols.push(base.r * l, base.g * l, base.b * l);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }
  function shadedBox(w, h, d, hex, ox, oy, oz) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(ox || 0, oy || 0, oz || 0);
    return shade(g, () => hex);
  }
  const HAND_MAT = () => new THREE.MeshBasicMaterial({ vertexColors: true });
  const merge = parts => THREE.BufferGeometryUtils ? THREE.BufferGeometryUtils.mergeBufferGeometries(parts) : parts[0];
  function handMesh(side) {
    // gloved hand: palm, wrapped fingers, thumb, knuckle guard; built around the grip point (0,0,0)
    const s = side === 'R' ? 1 : -1, parts = [];
    parts.push(shadedBox(.026, .070, .050, 0x141317, s * .018, -.010, .000));         // palm round the grip
    parts.push(shadedBox(.024, .064, .020, 0x0f0e12, -s * .010, -.012, .020));        // fingers wrapped over
    parts.push(shadedBox(.016, .018, .040, 0x18171c, -s * .008, .026, .004));         // thumb
    parts.push(shadedBox(.028, .012, .044, 0x3a1466, s * .018, .028, .000));          // purple knuckle plate
    parts.push(shadedBox(.034, .040, .040, 0x1d1626, s * .016, -.012, -.040));        // wrist cuff
    const m = new THREE.Mesh(merge(parts), HAND_MAT()); m.renderOrder = 9;
    return m;
  }
  function sleeveMesh() {
    // unit-length forearm along +Z (scaled to the hand-elbow distance each frame): jacket sleeve with a neon cuff ring
    const parts = [shadedBox(.046, .044, 1, 0x120f18, 0, 0, .5), shadedBox(.050, .048, .03, 0x0090a8, 0, 0, .03),
                   shadedBox(.048, .046, .18, 0x1d1428, 0, 0, .26)];
    const m = new THREE.Mesh(merge(parts), HAND_MAT()); m.renderOrder = 9;
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
  const underGlass = o => { for (let p = o; p; p = p.parent) if (/_glass$/.test(p.name)) return true; return false; };

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
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x9fe8d8, transparent: true, opacity: .07, depthWrite: false, side: THREE.DoubleSide, fog: false });
    root.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false; o.renderOrder = 8;
      if (underGlass(o)) { o.material = glassMat; o.renderOrder = 11; return; }      // optic glass: clear, the reticle is drawn on the sight line
      const src = o.material;
      // flat PS1 viewmodel: painted shading, a little under full white so only the glow parts bloom
      if (!mat) mat = new THREE.MeshBasicMaterial({ map: src.map, side: THREE.DoubleSide, color: new THREE.Color(.66, .66, .68), fog: false });
      o.material = mat;
    });
    // finish: tint a private copy of the albedo (async; the neutral texture shows for a frame)
    const tint = [[1, 1, 1]];
    for (const k of Object.keys(man.slots)) tint[+k] = R.tints[man.slots[k]] || [1, 1, 1];
    prepare(gltf).then(mask => { if (mask && mat?.map?.image) { mat.map = tintedTexture(mat.map.image, mask, tint); mat.needsUpdate = true; } });

    const A = man.anchors, a = n => new THREE.Vector3(...(A[n] || A.fore || [0, 0, 0]));
    const model = new THREE.Group(); model.add(root); root.rotation.y = Math.PI;      // GLB points +Z; camera looks -Z
    const flip = v => new THREE.Vector3(-v.x, v.y, -v.z);
    const grip = flip(a('grip'));
    root.position.copy(grip).multiplyScalar(-1);                                       // grip point at the model origin
    model.updateMatrixWorld(true);
    const local = n => flip(a(n)).sub(grip);
    const tip = new THREE.Object3D(); tip.position.copy(local('muzzle')); model.add(tip);
    // hand targets that ride on moving parts: anchor 'hand_<node>' -> an empty on that node
    const hands = {};
    for (const k of Object.keys(A)) {
      if (!k.startsWith('hand_')) continue;
      const node = root.getObjectByName(k.slice(5)); if (!node) continue;
      const o = new THREE.Object3D(); node.add(o);
      o.position.copy(node.worldToLocal(root.localToWorld(new THREE.Vector3(...A[k]))));
      hands[k.slice(5)] = o;
    }
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
      id, tier, man, R, model, root, tip, flash, flashMat: [front.material, side1.material, side2.material], fcol, hands,
      grip: new THREE.Vector3(0, 0, 0), fore: local('fore'), magA: local('mag'), eject: local('eject'), load: local('load'), tray: local('tray'),
      sight: local('sight_' + sightName), sightName, eyeD: (SIGHT[sightName] || SIGHT.iron)[0], fov: (SIGHT[sightName] || SIGHT.iron)[1],
      node: n => root.getObjectByName(n), rest: {},
      g: GUN[id], magSize: magFor(id, R),
    };
    for (const n of ['slide', 'bolt', 'pump', 'cover', 'drum', 'mag', 'shell', 'round', 'spin_coil', 'spin_halo', 'spin_barrel']) {
      const o = v.node(n); if (o) v.rest[n] = { p: o.position.clone(), r: o.rotation.clone() };
    }
    for (const k of ['shell', 'round']) { const o = v.node(k); if (o) { o.scale.setScalar(1); o.visible = false; } }   // stored hidden (scale 0) for static displays
    // belt: rounds placed along the path (in the mag node's space) so the belt can feed
    if (man.belt) {
      const par = new THREE.Vector3(...man.belt.parent);
      const pts = man.belt.path.map(p => new THREE.Vector3(...p).sub(par));
      const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
      v.belt = { nodes: man.belt.nodes.map(n => v.node(n)).filter(Boolean), pts, cum, len: cum[cum.length - 1], sp: man.belt.spacing };
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
    st.reload = null; st.drawT = 0; st.adsK = Math.min(st.adsK, .3); st.cycleT = 9; st.rHand = 0;
    if (!vm) { armsRoot.visible = false; reticle(0); return null; }
    armsRoot.visible = true;
    gunGroup.add(vm.model);
    if (w.clip === undefined) w.clip = vm.magSize;
    GunAudio?.foley?.('draw');
    return { root: vm.model, tip: vm.tip, external: true };
  }

  /* ---------------------------------------------------------------- reload choreography
     A reload is a list of keys over normalised time 0..1. Each key: gun pose offset (pos m, rot rad), where the
     magazine is (m, relative to its rest, plus a 'swap' moment when the new one appears), where the support hand
     is (a named target), and sound cues. Keys are lerped with smoothstep. Every gun only does what its own
     mechanism needs: no charging handle on a gun that has none. */
  const ss = t => t * t * (3 - 2 * t);
  const clamp01 = t => Math.min(1, Math.max(0, t));
  function track(style, empty, rack) {
    const T = [];
    T.push({ t: 0, pose: [0, 0, 0, 0, 0, 0], mag: [0, 0, 0], hand: 'fore' });
    if (style === 'cover') {
      // LMG: cover up, lift the old belt, box off, new box on, lay the belt in the tray, slap the cover shut
      T.push({ t: .10, pose: [-.02, .02, .03, .16, 0, -.30], mag: [0, 0, 0], hand: 'hand_cover', cue: 'coverOpen', cover: 1 });
      T.push({ t: .20, pose: [-.02, .02, .03, .18, 0, -.34], mag: [0, 0, 0], hand: 'tray', cover: 1, cue: 'beltOut', belt: 1 });
      T.push({ t: .30, pose: [-.02, .02, .03, .18, 0, -.36], mag: [0, 0, 0], hand: 'mag', cover: 1, cue: 'magOut', belt: 1 });
      T.push({ t: .46, pose: [-.03, -.02, .03, .20, 0, -.40], mag: [.03, -.30, .02], hand: 'below', cover: 1, swap: true, belt: 0 });
      T.push({ t: .60, pose: [-.02, .0, .03, .20, 0, -.36], mag: [0, -.02, 0], hand: 'mag', cover: 1, belt: 0 });
      T.push({ t: .66, pose: [-.02, .01, .03, .19, 0, -.36], mag: [0, 0, 0], hand: 'mag', cover: 1, cue: 'magIn', kick: .015, belt: .15 });
      T.push({ t: .78, pose: [-.02, .02, .03, .18, 0, -.34], mag: [0, 0, 0], hand: 'tray', cover: 1, cue: 'beltIn', belt: 1 });
      T.push({ t: .86, pose: [0, .01, .02, .08, 0, -.18], mag: [0, 0, 0], hand: 'hand_cover', cover: 0, cue: 'coverClose', kick: .03, belt: 1 });
    } else {
      const lift = style === 'cell';
      T.push({ t: .14, pose: [-.015, .02, .02, .16, -.05, lift ? .25 : -.42], mag: [0, 0, 0], hand: 'mag' });
      T.push({ t: .26, pose: [-.015, .02, .02, .16, -.05, lift ? .25 : -.42], mag: lift ? [0, .05, -.01] : [0, -.05, .01], hand: 'mag', cue: lift ? 'cellOut' : 'magOut' });
      T.push({ t: .44, pose: [-.02, -.01, .02, .18, -.05, lift ? .25 : -.45], mag: lift ? [.02, .13, .03] : [-.04, -.32, .04], hand: 'below', swap: true, cue: empty && !lift ? 'magDrop' : null });
      T.push({ t: .60, pose: [-.015, .01, .02, .16, -.05, lift ? .25 : -.42], mag: lift ? [0, .05, -.01] : [0, -.04, .01], hand: 'mag' });
      T.push({ t: .70, pose: [-.012, .02, .015, .12, -.04, lift ? .2 : -.38], mag: [0, 0, 0], hand: 'mag', cue: lift ? 'cellIn' : 'magIn', kick: .02 });
      T.push({ t: .77, pose: [-.01, .022, .015, .10, -.04, lift ? .18 : -.34], mag: [0, 0, 0], hand: 'mag', cue: lift ? null : 'tap', kick: .012 });
      if (empty && rack === 'vent') {
        // energy cell: nothing to rack; the coil vents its heat while the support hand stays on the cell
        T.push({ t: .86, pose: [.0, .03, .01, .14, .06, .30], mag: [0, 0, 0], hand: 'mag', cue: 'vent', vent: 1 });
      } else if (empty && (rack === 'slide' || rack === 'bolt')) {
        const h = rack === 'slide' ? 'hand_slide' : 'hand_bolt';
        T.push({ t: .84, pose: [.0, .01, .01, .05, .1, .25], mag: [0, 0, 0], hand: h, cue: 'rackBack', rack: 1 });
        T.push({ t: .92, pose: [.0, .0, .01, .03, .04, .1], mag: [0, 0, 0], hand: h, cue: rack === 'slide' ? 'slideRelease' : 'rackFwd', rack: 0, kick: .02 });
      }
    }
    T.push({ t: 1, pose: [0, 0, 0, 0, 0, 0], mag: [0, 0, 0], hand: 'fore' });
    return T;
  }
  function sampleTrack(T, t) {
    let i = 0; while (i < T.length - 2 && t > T[i + 1].t) i++;
    const a = T[i], b = T[i + 1], k = ss(clamp01((t - a.t) / Math.max(1e-4, b.t - a.t)));
    const L = (x, y) => x.map((v, j) => v + (y[j] - v) * k);
    const n = (key, d) => (a[key] ?? d) + ((b[key] ?? d) - (a[key] ?? d)) * k;
    return { pose: L(a.pose, b.pose), mag: L(a.mag, b.mag), handA: a.hand, handB: b.hand, k, cover: n('cover', 0), rack: n('rack', 0),
             belt: n('belt', 1), vent: n('vent', 0), swapped: T.some(x => x.swap && x.t <= t) };
  }

  function reload(w) {
    if (!vm || !w || st.reload || st.drawT < 1 || cycling()) return false;
    const mag = vm.magSize;
    if (w.clip >= mag || (w.ammo !== Infinity && w.ammo <= 0)) return false;
    const tierK = R_HANDLE[vm.tier] * (1 - (window.G?.p?.mods?.reload || 0));
    const empty = w.clip === 0;
    if (vm.g.style === 'single' || vm.g.style === 'tube') {
      const tube = vm.g.style === 'tube';
      st.reload = { single: true, tube, t: 0, dur: vm.g.reload[0] * tierK, w, n: 0, open: (tube ? .24 : .28) * tierK, empty,
                    closing: -1, close: (tube && empty ? .55 : .2) * tierK, cues: 0 };
      GunAudio?.foley?.(tube ? 'adsOut' : 'drumOpen');
      return true;
    }
    const dur = vm.g.reload[empty ? 1 : 0] * tierK;
    st.reload = { t: 0, dur, w, empty, T: track(vm.g.style, empty, vm.g.rack), fired: new Set() };
    st.ads = false;
    return true;
  }
  function commitAmmo(w) {
    const need = vm.magSize - w.clip;
    if (w.ammo === Infinity) { w.clip = vm.magSize; return; }
    const take = Math.min(need, w.ammo); w.clip += take; w.ammo -= take;
  }
  function commitOne(w) {
    if (w.ammo === Infinity) { w.clip = Math.min(vm.magSize, w.clip + 1); return; }
    if (w.ammo > 0) { w.ammo--; w.clip++; }
  }

  // the pump or bolt is still cycling after a shot
  const cycling = () => vm && vm.g.cycle && st.cycleT < vm.g.cycle * R_HANDLE[vm.tier];

  function canFire(w) {
    if (!vm) return true;
    if (st.drawT < .75) return false;
    if (cycling()) return false;
    if (st.reload) {
      // shell by shell loading: a shot interrupts it (once a round is in)
      if (st.reload.single && w.clip > 0 && st.reload.closing < 0) { st.reload = null; GunAudio?.foley?.(vm.g.style === 'tube' ? 'pumpFwd' : 'drumClose'); return true; }
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
    st.punch = Math.max(st.punch, (g.punch || 0) * (1 + tier * .06));
    // moving parts
    st.partT = 0; st.spinV += 18;
    if (g.fire === 'drum') st.drumTo += Math.PI / 3;
    if (g.fire === 'pump' || g.fire === 'boltaction') { st.cycleT = 0; st.cycleCues = 0; }
    if (g.fire === 'belt') st.beltTarget += 1;
    // flash: random roll and scale, coloured by rarity from Epic up
    st.flashT = g.fire === 'pump' ? .06 : .045;
    const fs = g.flash[0] * R_FLASH[tier] * (.85 + Math.random() * .35) * .26;
    vm.flash.visible = true; vm.flash.scale.setScalar(fs); vm.flash.rotation.z = Math.random() * Math.PI;
    for (const m of vm.flashMat) m.opacity = 1;
    // casings (pump and bolt guns throw theirs when the action is worked)
    if (g.shell !== 'none' && g.fire !== 'pump' && g.fire !== 'boltaction') spawnShell(g.shell, tier);
    GunAudio?.shot?.(w.id, tier);
    if (w.clip <= Math.ceil(vm.magSize * .2) && w.clip > 0 && vm.magSize > 6) GunAudio?.foley?.('lowAmmo');
    return { pitch: kp * D2R * .22, yaw: ky * D2R * .12 };   // the permanent share of the kick (climb)
  }
  function dryFire() { GunAudio?.foley?.('dry'); S.rv[0] += .4; }

  /* ---------------------------------------------------------------- casings */
  const shellGeo = {}, shellMat = {};
  function hullGeo() {
    // shotgun hull: red plastic body on a brass head, flat-shaded with vertex colours
    const g = new THREE.CylinderGeometry(.0105, .0105, .07, 8, 1).toNonIndexed();
    g.rotateX(Math.PI / 2);
    return shade(g, (x, y, z) => z < -.022 ? 0xd2a24a : 0xb8262a);
  }
  function spawnShell(kind, tier) {
    if (!shellGeo[kind]) {
      if (kind === 'hull') { shellGeo[kind] = hullGeo(); shellMat[kind] = new THREE.MeshBasicMaterial({ vertexColors: true }); }
      else {
        const dims = kind === 'rifle' ? [.010, .010, .042] : [.009, .009, .022];
        shellGeo[kind] = new THREE.BoxGeometry(...dims);
        shellMat[kind] = new THREE.MeshBasicMaterial({ color: 0xd8a040 });
      }
    }
    let s = shells.find(x => !x.alive);
    if (!s) { if (shells.length > 40) s = shells[0]; else { s = { m: new THREE.Mesh(shellGeo[kind], shellMat[kind]) }; scene.add(s.m); shells.push(s); } }
    s.m.geometry = shellGeo[kind]; s.m.material = shellMat[kind];
    const p = vm.model.localToWorld(vm.eject.clone());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
    const big = kind === 'hull' ? 1.1 : 1;
    s.v = right.multiplyScalar((1.8 + Math.random() * .8) * big).add(up.multiplyScalar((kind === 'hull' ? 1.1 : 1.6) + Math.random() * .6)).add(back.multiplyScalar(.4 + Math.random() * .4));
    s.m.position.copy(p); s.m.quaternion.copy(camera.quaternion); s.m.visible = true; s.alive = true; s.life = kind === 'hull' ? 2.4 : 1.6; s.bounced = 0; s.kind = kind;
    s.rot = new THREE.Vector3(Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15);
  }
  function shellTick(dt, feetY) {
    for (const s of shells) {
      if (!s.alive) continue;
      s.life -= dt; if (s.life <= 0) { s.alive = false; s.m.visible = false; continue; }
      s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.rot.x * dt; s.m.rotation.y += s.rot.y * dt; s.m.rotation.z += s.rot.z * dt;
      if (s.m.position.y < feetY + .01 && s.v.y < 0) {
        s.m.position.y = feetY + .01; s.v.y *= s.kind === 'hull' ? -.42 : -.32; s.v.x *= .5; s.v.z *= .5; s.rot.multiplyScalar(.5);
        if (s.bounced++ < (s.kind === 'hull' ? 3 : 2) && Math.abs(s.v.y) > .2) GunAudio?.foley?.(s.kind === 'hull' ? (s.bounced === 1 ? 'hullDrop' : 'hullBounce') : 'tink');
      }
    }
  }

  /* ---------------------------------------------------------------- per frame */
  function spring(x, v, k, c, dt) {
    for (let i = 0; i < 3; i++) { v[i] += (-k * x[i] - c * v[i]) * dt; x[i] += v[i] * dt; }
  }
  const _v = new THREE.Vector3();
  const seg = (k, a, b) => clamp01((k - a) / (b - a));

  function update(dt, s) {
    if (armsRoot) armsRoot.visible = !!vm && gunGroup.visible;
    if (!vm) { shellTick(dt, s.feetY || 0); if (scopeEl) scopeOverlay(0); reticle(0); return; }
    dt = Math.min(dt, 1 / 20);
    const g = vm.g, tier = vm.tier, w = curW, n = vm.node, P = vm.rest;
    // the action after a shot: pump or bolt
    st.cycleT += dt;
    const cyc = g.cycle ? g.cycle * R_HANDLE[tier] : 0, ck = cyc ? clamp01(st.cycleT / cyc) : 1, inCycle = cyc && st.cycleT < cyc;
    const boltCycle = inCycle && g.fire === 'boltaction';
    // ADS (not while reloading, drawing, or working a bolt)
    const wantAds = !!s.ads && !st.reload && st.drawT >= 1 && !s.dash && !boltCycle;
    if (wantAds !== st.ads) { st.ads = wantAds; GunAudio?.foley?.(wantAds ? 'adsIn' : 'adsOut'); }
    const adsT = g.ads * R_HANDLE[tier];
    st.adsK += ((st.ads ? 1 : 0) - st.adsK) * Math.min(1, dt / Math.max(.04, adsT * .45));
    const aK = ss(clamp01(st.adsK));
    // draw
    if (st.drawT < 1) st.drawT = Math.min(1, st.drawT + dt / (g.draw * R_HANDLE[tier]));
    const dK = 1 - ss(st.drawT);
    // springs: viewmodel and camera
    spring(S.p, S.pv, 160, 17, dt); spring(S.r, S.rv, 190, 18, dt); spring(S.c, S.cv, 95, 16, dt);
    st.punch = Math.max(0, st.punch - dt * Math.max(14, st.punch * 9));
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

    // ---- reload
    let pose = [0, 0, 0, 0, 0, 0], magOff = [0, 0, 0], handA = defaultHand(), handB = handA, handK = 0, cover = 0, rack = 0, belt = 1, vent = 0;
    let shellOff = null, swapped = false;
    const R = st.reload;
    if (R) {
      R.t += dt;
      if (R.tube) {
        // pump gun: tilt the belly up, one shell at a time into the loading port, rack the pump if it ran dry
        const open = ss(clamp01(R.t / R.open));
        pose = [-.045 * open, .015 * open, .02 * open, .07 * open, -.08 * open, -.55 * open];
        handA = defaultHand(); handB = 'bag'; handK = open;
        const tt = R.t - R.open;
        if (R.closing < 0 && tt > 0) {
          const c = Math.floor(tt / R.dur), ph = (tt % R.dur) / R.dur;
          if (c > R.n) { R.n = c; R.cues = 0; }
          const full = R.w.clip >= vm.magSize || (R.w.ammo !== Infinity && R.w.ammo <= 0);
          if (full) R.closing = R.t;
          else {
            // 0-.45 hand brings the shell up to the port, .45-.62 thumbs it in, .62-1 back to the shell pouch
            const up = ss(seg(ph, .05, .45)), push = ss(seg(ph, .45, .62)), back = ss(seg(ph, .66, 1));
            shellOff = ph < .62 ? [.01 * (1 - up), -.085 * (1 - up) + .022 * push, -.035 * (1 - up) + .012 * push] : null;
            if (ph < .62) { handA = 'shell'; handB = 'shell'; handK = 0; }
            else { handA = 'load'; handB = 'bag'; handK = back; }
            pose[1] += push * .006; pose[3] += push * .03;
            if (ph >= .5 && !(R.cues & 1)) { R.cues |= 1; GunAudio?.foley?.('shellIn'); commitOne(R.w); S.pv[1] += .05; }
          }
        }
        if (R.closing >= 0) {
          // close: straighten the gun; if it ran dry, the support hand racks the pump to chamber a round
          const ct = R.t - R.closing, k = clamp01(ct / R.close);
          const st2 = 1 - ss(k);
          pose = pose.map(v => v * st2);
          handA = 'bag'; handB = defaultHand(); handK = ss(seg(k, 0, .35));
          if (R.empty) {
            rack = k < .45 ? 0 : k < .7 ? ss(seg(k, .45, .62)) : 1 - ss(seg(k, .7, .86));
            if (k > .47 && !(R.cues & 2)) { R.cues |= 2; GunAudio?.foley?.('pumpBack'); }
            if (k > .72 && !(R.cues & 4)) { R.cues |= 4; GunAudio?.foley?.('pumpFwd'); S.pv[1] -= .1; }
          }
          if (k >= 1) st.reload = null;
        }
      } else if (R.single) {
        // launcher: open the drum, a grenade per cycle, close. Fire cancels it (canFire).
        pose = [-.02, .01, .02, .12, -.08, -.32];
        const cycT = R.dur, tt = R.t - R.open;
        if (tt > 0) {
          const ph = (tt % cycT) / cycT, c = Math.floor(tt / cycT);
          if (c > R.n) {
            R.n = c; commitOne(R.w); GunAudio?.foley?.('grenadeIn'); st.drumTo += Math.PI / 3; GunAudio?.foley?.('drumClick'); S.rv[0] += .3;
            if (R.w.clip >= vm.magSize || (R.w.ammo !== Infinity && R.w.ammo <= 0)) { st.reload = null; GunAudio?.foley?.('drumClose'); S.rv[0] -= .6; }
          }
          magOff = [0, -.18 * (1 - ss(Math.min(1, ph * 1.6))), -.05 * (1 - ph)];
          handA = 'mag'; handB = 'mag'; handK = 1;
        }
      } else {
        const t = Math.min(1, R.t / R.dur), sm = sampleTrack(R.T, t);
        pose = sm.pose; magOff = sm.mag; handA = sm.handA; handB = sm.handB; handK = sm.k; cover = sm.cover; rack = sm.rack;
        belt = sm.belt; vent = sm.vent; swapped = sm.swapped;
        for (const k of R.T) if (k.t <= t && !R.fired.has(k)) {
          R.fired.add(k);
          if (k.cue) GunAudio?.foley?.(k.cue);
          if (k.kick) S.pv[1] -= k.kick * 8;
          if (k.cue === 'magIn' || k.cue === 'cellIn') commitAmmo(R.w);
        }
        if (t >= 1) {
          st.reload = null;
          if (R.w.clip === 0) commitAmmo(R.w);
          if (R.empty && g.rack === 'boltaction') { st.cycleT = cyc * .12; st.cycleCues = 0; st.chamberOnly = true; }   // work the bolt to chamber
        }
        if (vent > 0 && Math.random() < vent * .6) ventPuff();
      }
    }

    // ---- the action after a shot
    let rHandK = 0, actionPose = [0, 0, 0, 0, 0, 0];
    if (inCycle && g.fire === 'pump') {
      // brief hold for the recoil, then the support hand rips the pump back (hull out) and slams it home
      const back = ss(seg(ck, .10, .40)), fwd = ss(seg(ck, .50, .78));
      rack = Math.max(rack, back * (1 - fwd));
      actionPose = [.0, -.012 * rack, .02 * rack, .05 * rack, .03 * rack, .10 * rack];
      if (ck > .10 && !(st.cycleCues & 1)) { st.cycleCues |= 1; GunAudio?.foley?.('pumpBack'); }
      if (ck > .34 && !(st.cycleCues & 2)) { st.cycleCues |= 2; spawnShell('hull', tier); }
      if (ck > .52 && !(st.cycleCues & 4)) { st.cycleCues |= 4; GunAudio?.foley?.('pumpFwd'); S.pv[1] -= .08; S.rv[0] -= .15; }
    }
    let boltLift = 0, boltPull = 0, roundShow = false, roundOff = [0, 0, 0];
    if (inCycle && g.fire === 'boltaction') {
      // firing hand: off the grip to the knob, lift, rip back (casing out, next round up), drive home, lock, back to the grip
      rHandK = ss(seg(ck, .02, .16)) * (1 - ss(seg(ck, .80, .96)));
      boltLift = ss(seg(ck, .16, .27)) * (1 - ss(seg(ck, .70, .80)));
      boltPull = ss(seg(ck, .28, .46)) * (1 - ss(seg(ck, .52, .68)));
      const roll = ss(seg(ck, .04, .2)) * (1 - ss(seg(ck, .78, .98)));
      actionPose = [-.045 * roll, -.03 * roll, -.075 * roll + .01 * boltPull, .08 * roll, .14 * roll, .32 * roll];
      const cue = (bit, at, name, fn) => { if (ck > at && !(st.cycleCues & bit)) { st.cycleCues |= bit; if (name) GunAudio?.foley?.(name); fn && fn(); } };
      cue(1, .16, 'boltUp'); cue(2, .28, 'boltBack');
      cue(4, .44, null, () => { if (!st.chamberOnly) spawnShell('rifle', tier); S.rv[2] += .4; });
      cue(8, .53, 'boltFwd'); cue(16, .70, 'boltDown', () => { S.pv[1] -= .05; st.chamberOnly = false; });
      // the next round rises from the magazine as the bolt clears it, then rides the bolt face into the chamber
      if (w && w.clip > 0 && ck > .40 && ck < .70) {
        roundShow = true;
        const rise = ss(seg(ck, .40, .50)), ride = ss(seg(ck, .52, .68));
        roundOff = [0, -.016 * (1 - rise), -.075 * (1 - ride)];
      }
    }
    if (!inCycle) st.chamberOnly = false;

    // ---- base pose: hip -> ADS (the optic's sight line on the screen centre)
    const hip = g.hip, ads = [-vm.sight.x, -vm.sight.y, -vm.eyeD - vm.sight.z];
    const px = hip[0] + (ads[0] - hip[0]) * aK, py = hip[1] + (ads[1] - hip[1]) * aK, pz = hip[2] + (ads[2] - hip[2]) * aK;
    const dashDip = s.dash ? 1 : 0;
    for (let i = 0; i < 6; i++) pose[i] += actionPose[i] * (1 - aK * .6);
    gunGroup.position.set(
      px + bx + st.swayX * (1 - aK * .7) + pose[0] + S.p[0] - dK * .05,
      py + by + st.swayY * (1 - aK * .7) + pose[1] + S.p[1] + landY + breathe - dK * .22 - dashDip * .03,
      pz + pose[2] + S.p[2]);
    gunGroup.rotation.set(
      S.r[0] + pose[3] - dK * .9 + st.swayY * 1.2 * (1 - aK) - dashDip * .1,
      S.r[1] + pose[4] + st.swayX * 1.5 * (1 - aK) + .03 * (1 - aK) - dK * .3,
      S.r[2] + pose[5] + st.tiltZ * (1 - aK * .6) + st.swayX * .8 + dK * .4 + dashDip * .12);

    // ---- moving parts
    st.partT += dt;
    const kickPart = Math.max(0, 1 - st.partT / .07);
    if (P.slide) n('slide').position.z = P.slide.p.z - (g.fire === 'slide' ? kickPart * .022 : 0) - rack * .025 - (w && w.clip === 0 && !R ? .022 : 0);
    if (P.bolt) {
      const bo = n('bolt');
      if (g.fire === 'boltaction') {
        bo.rotation.z = P.bolt.r.z + boltLift * 1.15;
        bo.position.z = P.bolt.p.z - boltPull * .095;
      } else bo.position.z = P.bolt.p.z - kickPart * .015 - rack * .05;
    }
    if (P.round) {
      const ro = n('round'); ro.visible = roundShow;
      if (roundShow) ro.position.set(P.round.p.x + roundOff[0], P.round.p.y + roundOff[1], P.round.p.z + roundOff[2]);
    }
    if (P.pump) n('pump').position.z = P.pump.p.z - rack * .085;
    if (P.cover) n('cover').rotation.x = P.cover.r.x - cover * .95;
    if (P.mag) {
      const mg = n('mag');
      mg.position.set(P.mag.p.x - magOff[0], P.mag.p.y + magOff[1], P.mag.p.z - magOff[2]);   // GLB space (x, z flipped by the root)
    }
    if (P.shell) {
      const sh = n('shell'); sh.visible = !!shellOff;
      if (shellOff) sh.position.set(P.shell.p.x + shellOff[0], P.shell.p.y + shellOff[1], P.shell.p.z + shellOff[2]);
    }
    if (vm.belt) beltTick(dt, belt, swapped);
    st.spinV = Math.max(0, st.spinV - dt * 22); st.spin += dt * (1.2 + st.spinV);
    if (P.spin_coil) n('spin_coil').rotation.z = st.spin * 1.6;
    if (P.spin_halo) n('spin_halo').rotation.z = st.spin * .7;
    if (P.spin_barrel) n('spin_barrel').rotation.z = st.spin * .7;
    if (P.drum) { st.drumA += (st.drumTo - st.drumA) * Math.min(1, dt * 14); n('drum').rotation.z = P.drum.r.z + st.drumA; }
    // flash
    if (st.flashT > 0) { st.flashT -= dt; if (st.flashT <= 0) vm.flash.visible = false; else for (const m of vm.flashMat) m.opacity = Math.min(1, st.flashT / .03); }

    // ---- hands
    gunGroup.updateMatrixWorld(true);
    const gripW = vm.model.localToWorld(_v.set(0, 0, 0)).clone();
    const rW = rHandK > 0 && vm.hands.bolt ? gripW.lerp(vm.hands.bolt.getWorldPosition(new THREE.Vector3()), rHandK) : gripW;
    placeHand('R', rW, [.28, -.40, .12], rHandK);
    const pa = handTarget(handA), pb = handTarget(handB);
    placeHand('L', pa.lerp(pb, handK), [-.22, -.44, .10], 0);
    shellTick(dt, s.feetY || 0);
    // scoped optics: past the halfway point of the raise the eye is in the scope; swap to the scope overlay
    const scoped = SCOPED.has(vm.sightName);
    const inScope = scoped && aK > .62;
    vm.model.visible = !inScope; if (inScope) armsRoot.visible = false;
    scopeOverlay(scoped ? Math.max(0, (aK - .55) / .45) : 0, vm.sightName, tier);
    reticle(GLASS.has(vm.sightName) ? clamp01((aK - .55) / .35) : 0, vm.sightName, tier);
    // outputs
    st.fov = 75 + (vm.fov - 75) * aK + st.punch;
  }

  function defaultHand() { return vm && vm.hands.pump ? 'hand_pump' : 'fore'; }
  // where the support hand goes, in world space
  function handTarget(name) {
    const L = p => vm.model.localToWorld(p.clone());
    if (name && name.startsWith('hand_')) { const o = vm.hands[name.slice(5)]; if (o) return o.getWorldPosition(new THREE.Vector3()); return L(vm.fore); }
    switch (name) {
      case 'mag': return L(vm.magA.clone().add(new THREE.Vector3(0, .02, 0)));
      case 'below': return L(vm.magA.clone().add(new THREE.Vector3(-.06, -.26, .05)));
      case 'bag': return L(vm.load.clone().add(new THREE.Vector3(-.01, -.095, .04)));            // shell pouch on the belt
      case 'shell': { const o = vm.node('shell'); return o ? vm.model.localToWorld(vm.model.worldToLocal(o.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, -.016, .045))) : L(vm.load); }
      case 'tray': return L(vm.tray);
      case 'load': return L(vm.load.clone().add(new THREE.Vector3(0, -.012, 0)));
      default: return L(vm.fore);
    }
  }
  function placeHand(side, worldPos, elbowCam, reach) {
    const H = armsRoot.userData[side];
    const p = camera.worldToLocal(worldPos.clone());
    H.hand.position.copy(p);
    H.hand.quaternion.copy(gunGroup.quaternion);
    if (side === 'L') H.hand.rotateZ(-1.2);
    if (side === 'R' && reach) H.hand.rotateZ(-.9 * reach);                 // turn the palm over to grab the bolt knob
    const e = new THREE.Vector3(...elbowCam);
    e.y += gunGroup.position.y * .5; e.x += gunGroup.position.x * .3;
    const dir = e.clone().sub(p), L = dir.length();
    H.sleeve.position.copy(p).addScaledVector(dir, .06 / L);
    H.sleeve.scale.set(1, 1, Math.max(.05, L * 1.4));
    H.sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
  }

  /* ---------------------------------------------------------------- belt feed (LMG)
     The rounds sit on a path from the box mouth into the feed tray. Every shot pulls the belt one link toward
     the gun: each round slides one spacing along the path, the one at the tray disappears inside. While the
     reload lays a new belt (`reveal` < 1) only the part already pulled out of the box shows. */
  function beltTick(dt, reveal, swapped) {
    const B = vm.belt;
    st.beltPhase += (st.beltTarget - st.beltPhase) * Math.min(1, dt * 38);
    if (st.beltTarget - st.beltPhase < .002) { st.beltPhase = st.beltTarget = st.beltTarget % 1; }
    const f = st.beltPhase % 1, shake = Math.max(0, 1 - st.partT / .12) * Math.sin(st.partT * 90) * .0025;
    B.nodes.forEach((node, i) => {
      const u = (i + f) * B.sp;
      if (u > B.len || u > reveal * B.len + 1e-4) { node.visible = false; return; }
      node.visible = true;
      let j = 1; while (j < B.cum.length - 1 && B.cum[j] < u) j++;
      const a = B.pts[j - 1], b = B.pts[j], k = (u - B.cum[j - 1]) / Math.max(1e-6, B.cum[j] - B.cum[j - 1]);
      node.position.set(a.x + (b.x - a.x) * k + shake, a.y + (b.y - a.y) * k, a.z);
      node.rotation.z = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
    });
  }

  /* ---------------------------------------------------------------- energy vent puffs */
  const puffs = [];
  function ventPuff() {
    let p = puffs.find(x => !x.alive);
    if (!p) { if (puffs.length > 24) return; p = { m: new THREE.Mesh(new THREE.BoxGeometry(.02, .02, .02), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: .5, depthWrite: false })) }; scene.add(p.m); puffs.push(p); }
    p.m.position.copy(vm.model.localToWorld(vm.fore.clone().add(new THREE.Vector3((Math.random() - .5) * .06, .05, (Math.random() - .5) * .1))));
    p.v = new THREE.Vector3((Math.random() - .5) * .3, .6 + Math.random() * .4, (Math.random() - .5) * .3); p.alive = true; p.life = .5; p.m.visible = true;
  }
  function puffTick(dt) {
    for (const p of puffs) { if (!p.alive) continue; p.life -= dt; if (p.life <= 0) { p.alive = false; p.m.visible = false; continue; }
      p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(1 + (.5 - p.life) * 5); p.m.material.opacity = p.life; }
  }

  /* ---------------------------------------------------------------- sight overlays */
  let scopeEl = null, retEl = null;
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
  // red dot / holo: the reticle sits on the sight line, so it is drawn at the screen centre through the clear glass
  function reticle(k, sight, tier) {
    if (!retEl) {
      if (!k) return;
      retEl = document.createElement('div');
      retEl.id = 'gfReticle';
      retEl.style.cssText = 'position:fixed;left:50%;top:50%;width:0;height:0;pointer-events:none;z-index:4;opacity:0';
      document.body.appendChild(retEl);
    }
    retEl.style.opacity = String(k);
    retEl.style.display = k > .01 ? 'block' : 'none';
    if (k <= .01) return;
    const col = tier === 6 ? '#3ff3ff' : '#ff2b2b', glow = `0 0 4px ${col}, 0 0 9px ${col}`;
    const key = sight + tier;
    if (retEl.dataset.key === key) return;
    retEl.dataset.key = key;
    retEl.innerHTML = sight === 'holo'
      // EOTech: a 65 MOA ring with a 1 MOA dot and four ticks
      ? `<div style="position:absolute;left:-17px;top:-17px;width:30px;height:30px;border:2px solid ${col};border-radius:50%;box-shadow:${glow}"></div>` +
        `<div style="position:absolute;left:-2px;top:-2px;width:4px;height:4px;background:${col};border-radius:50%;box-shadow:${glow}"></div>` +
        [[-1, -18, 2, 5], [-1, 13, 2, 5], [-18, -1, 5, 2], [13, -1, 5, 2]].map(([l, t, w, h]) =>
          `<div style="position:absolute;left:${l}px;top:${t}px;width:${w}px;height:${h}px;background:${col};box-shadow:${glow}"></div>`).join('')
      : `<div style="position:absolute;left:-3px;top:-3px;width:6px;height:6px;background:${col};border-radius:50%;box-shadow:${glow}"></div>`;
  }

  function setVisible(v) { if (armsRoot) armsRoot.visible = v && !!vm; if (!v) reticle(0); }
  const _update = update;

  return {
    init, equip, update(dt, s) { _update(dt, s); puffTick(Math.min(dt, .05)); }, fire, dryFire, reload, canFire, magSize, preloadMasks, setVisible, GUN,
    get fov() { return st.fov; }, get adsK() { return st.adsK; }, get reloading() { return !!st.reload; },
    get spreadMul() { return 1 - st.adsK * (vm && SCOPED.has(vm.sightName) ? .96 : .65); },
    get sensMul() { return 1 - st.adsK * (vm ? (1 - vm.fov / 75) * .9 : 0); },
    get cam() { return { pitch: S.c[0], yaw: S.c[1], roll: S.c[2] }; },
    get active() { return !!vm; }, get drawing() { return st.drawT < 1; }, get cycling() { return !!cycling(); },
    addPunch(deg) { st.punch = Math.max(st.punch, deg || 0); },
  };
})();

if (typeof window !== 'undefined') window.GunFeel = GunFeel;
