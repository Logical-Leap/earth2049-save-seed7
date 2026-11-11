/* EARTH 2049: SAVE SEED 7 — RNG character variants
 *
 * Crowd and enemy base models from game-art-pipeline carry their own variant recipe in
 * the glTF scene extras (scene.userData once loaded):
 *   slots       mask value -> palette name ("1": "top", "2": "accent", ...)
 *   palettes    palette name -> list of RGB multipliers
 *   mask_image  the 3rd texture: a per-texel slot index (value * mask_scale)
 *   hair / acc  node names to show one of (accessory groups); '' = none
 *   blocks      accessory -> hair nodes it can't be worn with
 *   clip_alias  this archetype's own Idle / Walk / Run / attack clips
 *   tint_emissive  also tint the emissive map
 *
 * roll(gltf, root, seed) re-tints a private copy of the albedo (and emissive) texture
 * and shows/hides accessory nodes, exactly like the pipeline's model viewer, so a seed
 * gives the same person in the viewer and in the game.
 */
'use strict';

const Variants = (() => {
  const base = new WeakMap();      // gltf -> { d, mapImg, emImg, mask, w, h } (decoded once per model)

  function mulberry32(a) {
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function pixels(img) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    return x.getImageData(0, 0, c.width, c.height);
  }

  async function prepare(gltf) {
    if (!gltf || base.has(gltf)) return base.get(gltf) || null;
    const d = gltf.scene?.userData;
    if (!d || !d.crowd || !d.slots) { base.set(gltf, null); return null; }
    let map = null, em = null;
    gltf.scene.traverse(o => { if (o.isMesh && o.material?.map && !map) { map = o.material.map; em = o.material.emissiveMap || null; } });
    if (!map?.image) { base.set(gltf, null); return null; }
    const mt = await gltf.parser.getDependency('texture', 2).catch(() => null);
    if (!mt?.image) { base.set(gltf, null); return null; }
    const mb = pixels(mt.image).data;
    const mask = new Uint8Array(mb.length / 4);
    for (let p = 0; p < mask.length; p++) mask[p] = Math.round(mb[p * 4] / (d.mask_scale || 32));
    const rec = { d, mapData: pixels(map.image), emData: em?.image && d.tint_emissive ? pixels(em.image) : null, mask };
    base.set(gltf, rec);
    return rec;
  }

  function tinted(src, mask, tint) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    const out = x.createImageData(src.width, src.height);
    const b = src.data, o = out.data;
    for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
      const t = tint[mask[p]] || tint[0];
      o[i] = Math.min(255, b[i] * t[0]); o[i + 1] = Math.min(255, b[i + 1] * t[1]); o[i + 2] = Math.min(255, b[i + 2] * t[2]); o[i + 3] = 255;
    }
    x.putImageData(out, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = false; tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /** Apply seed's variant to a cloned instance. Materials on root must already be per-instance. */
  function roll(gltf, root, seed, type) {
    const rec = base.get(gltf);
    if (!rec) return null;
    const d = rec.d, r = mulberry32(seed | 0), pick = a => a[Math.floor(r() * a.length)];
    const tint = [[1, 1, 1]];
    for (const k of Object.keys(d.slots).sort((a, b) => a - b)) { const p = d.palettes[d.slots[k]]; tint[+k] = p ? pick(p) : [1, 1, 1]; }
    const acc = d.acc || {}, hairs = d.hair || [''];
    const on = Object.keys(acc).map(k => pick(acc[k]));
    const blocked = new Set(on.flatMap(a => (d.blocks || {})[a] || []));
    let hair = pick(hairs); if (blocked.has(hair)) hair = pick(hairs.filter(h => !blocked.has(h)));
    on.push(hair);
    const split = a => a.flatMap(x => (x || '').split('+')).filter(Boolean);
    const forced = (d.types && type && d.types[type]?.force) || [];
    const shown = new Set(split([...on, ...forced])), nodes = new Set(split([...hairs, ...Object.values(acc).flat(), ...forced]));
    for (const n of nodes) { const o = root.getObjectByName(n); if (o) o.scale.setScalar(shown.has(n) ? 1 : 0); }
    const map = tinted(rec.mapData, rec.mask, tint);
    const em = rec.emData ? tinted(rec.emData, rec.mask, tint) : null;
    root.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (m.map) m.map = map;
        if (em && m.emissiveMap) m.emissiveMap = em;
        m.needsUpdate = true;
      }
    });
    return { seed, alias: d.clip_alias || {}, title: d.title, archetype: d.archetype || d.unit };
  }

  return { prepare, roll, mulberry32, alias: gltf => gltf?.scene?.userData?.clip_alias || {} };
})();

if (typeof window !== 'undefined') window.Variants = Variants;
