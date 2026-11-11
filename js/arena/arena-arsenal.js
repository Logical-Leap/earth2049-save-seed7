/* EARTH 2049: SAVE SEED 7 — ARENA Arsenal: the pipeline's first-person guns (projects/earth2049/props/arsenal.py).
 *
 * Each GLB carries all seven rarities. Its scene extras ('weapon' manifest) give:
 *   options / rarities[tier].show   toggle nodes (optics, muzzles, mags, stocks, deco, halo rings)
 *   rarities[tier].tints            per-slot finish, applied through the slot mask (texture 2) to albedo + emissive
 *   anchors                         grip, fore, mag, muzzle, eject, sight_<optic>, ... in gun space (metres, +Z forward)
 *   moving                          slide / bolt / pump / drum / cover nodes for first-person animation
 * This module builds a gun for a given rarity (tinted textures cached per gun+tier) and exposes its parts.
 */
'use strict';

AR.Arsenal = (() => {
  const FILES = { pistol: 'volt9_pistol', smg: 'vx2_ripper', shotgun: 'riptide12_shotgun', ar: 'm52_revenant', dmr: 'lrx7_harbinger',
    energy: 'plasma_lancer', rocket: 'mgl6_thunderer', lmg: 'compliance_saw' };
  const base = {}, texCache = {};
  const TIER = [
    { n: 'COMMON', p: 'SURPLUS', c: '#4caf50' }, { n: 'UNCOMMON', p: 'MODDED', c: '#42a5f5' }, { n: 'RARE', p: 'BLACKMARKET', c: '#ab47bc' },
    { n: 'EPIC', p: 'PROTOTYPE', c: '#ff9800' }, { n: 'LEGENDARY', p: 'COLLAPSE-ERA', c: '#ef5350' }, { n: 'MYTHIC', p: 'OG-FORGED', c: '#ffd54f' },
    { n: 'RELIC', p: 'TURING-SLAYER', c: '#00e5ff' }];

  function pixels(img) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    return x.getImageData(0, 0, c.width, c.height);
  }
  async function preload() {
    await Promise.all(Object.entries(FILES).map(async ([id, f]) => {
      if (base[id]) return;
      const g = await AssetLoader.loadModel('arsenal.' + id, `assets/models/ps1/weapons/${f}.glb?v=${AR.VERSION}`);
      if (!g) return;
      const W = g.scene.userData || {};
      const tex = await Promise.all([0, 1, 2].map(i => g.parser.getDependency('texture', i).catch(() => null)));
      const rec = { gltf: g, W, albedo: tex[0]?.image ? pixels(tex[0].image) : null, emis: tex[1]?.image ? pixels(tex[1].image) : null, mask: null };
      if (tex[2]?.image) {
        const m = pixels(tex[2].image).data, out = new Uint8Array(m.length / 4);
        for (let i = 0; i < out.length; i++) out[i] = Math.round(m[i * 4] / (W.mask_scale || 32));
        rec.mask = out;
      }
      base[id] = rec;
    }));
  }
  function tinted(src, mask, tintBySlot) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'), out = x.createImageData(src.width, src.height), a = src.data, o = out.data;
    for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
      const t = tintBySlot[mask[p]] || [1, 1, 1];
      o[i] = Math.min(255, a[i] * t[0]); o[i + 1] = Math.min(255, a[i + 1] * t[1]); o[i + 2] = Math.min(255, a[i + 2] * t[2]); o[i + 3] = a[i + 3];
    }
    x.putImageData(out, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.encoding = THREE.sRGBEncoding;
    return tex;
  }
  function textures(id, tier) {
    const k = id + ':' + tier;
    if (texCache[k]) return texCache[k];
    const r = base[id], W = r.W, rar = W.rarities?.[tier] || W.rarities?.[0];
    const bySlot = [];
    for (const [slot, name] of Object.entries(W.slots || {})) bySlot[+slot] = rar?.tints?.[name] || [1, 1, 1];
    const t = { map: r.albedo && r.mask ? tinted(r.albedo, r.mask, bySlot) : null, emis: r.emis && r.mask && W.tint_emissive ? tinted(r.emis, r.mask, bySlot) : null };
    texCache[k] = t;
    return t;
  }

  /** Build a gun at a rarity. Returns { root (points -Z), holder, parts, anchors, tier, sight, W }. */
  function build(id, tier = 0, opts = {}) {
    const r = base[id];
    if (!r) return null;
    const W = r.W;
    tier = Math.max(0, Math.min((W.rarities?.length || 1) - 1, tier));
    const scene = r.gltf.scene.clone(true);
    const T = textures(id, tier);
    const mats = [];
    scene.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const m = opts.unlit
        ? new THREE.MeshBasicMaterial({ map: T.map, side: THREE.DoubleSide })
        : new THREE.MeshLambertMaterial({ map: T.map, emissiveMap: T.emis, emissive: new THREE.Color(T.emis ? 1 : 0, T.emis ? 1 : 0, T.emis ? 1 : 0), side: THREE.DoubleSide });
      o.material = m; mats.push(m);
    });
    // rarity: hide every option node, show this tier's list; loose rounds start hidden
    const all = Object.values(W.options || {}).flat();
    const show = new Set(W.rarities?.[tier]?.show || []);
    for (const n of all) { const o = scene.getObjectByName(n); if (o) o.visible = show.has(n); }
    for (const n of ['shell', 'round']) { const o = scene.getObjectByName(n); if (o) o.visible = false; }
    const holder = new THREE.Group(); holder.add(scene);
    holder.rotation.y = Math.PI;                                          // +Z forward in the file, -Z forward in view space
    const root = new THREE.Group(); root.add(holder);
    const A = {};
    for (const [k, v] of Object.entries(W.anchors || {})) A[k] = new THREE.Vector3(-v[0], v[1], -v[2]);   // rotated by PI about Y
    const tip = new THREE.Object3D(); tip.position.copy(A.muzzle || new THREE.Vector3(0, 0, -(W.length || 0.6))); root.add(tip);
    const parts = {};
    for (const n of ['slide', 'bolt', 'pump', 'mag', 'drum', 'cover', 'shell', 'round', 'spin_halo', 'spin_coil', 'spin_barrel']) {
      const o = scene.getObjectByName(n);
      if (o) parts[n] = { o, p: o.position.clone(), q: o.quaternion.clone() };
    }
    const sight = W.rarities?.[tier]?.sight || 'iron';
    return { root, holder, parts, anchors: A, tier, sight, sightA: A['sight_' + sight] || A.sight_iron || new THREE.Vector3(0, 0.08, 0), tip, mats, W, length: W.length || 0.6 };
  }
  const tierInfo = t => TIER[Math.max(0, Math.min(6, t))];
  return { preload, build, tierInfo, FILES, get loaded() { return Object.keys(base); } };
})();
