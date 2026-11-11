/* Player avatar kit: mix-and-match player characters from the game-art-pipeline avatar kit.
 *
 *   assets/models/ps1/avatar/catalog.json      categories, items (rarity, flavor, unlock), palettes, rules
 *   assets/models/ps1/avatar/avatar_<sex>_base.glb   body (segments on b_* nodes) + every animation clip
 *   assets/models/ps1/avatar/avatar_<sex>_<kit>.glb  item pieces on '<item>@<bone>' nodes, stored hidden
 *
 * Rules (also in catalog.rules):
 *  - wearing an item clones its '<item>@<bone>' nodes onto the body's bone of that name (scale 1)
 *  - item.replaces: 'b_*' hides that body segment; a bare bone name hides that bone's pieces from items of a
 *    lower-priority category (gloves over sleeves, boots over trouser cuffs)
 *  - headgear.hair: 'all' any hair, 'short' only short hair, 'none' no hair (the buzz scalp stays)
 *  - item.blocks: hides a whole category (sealed helmets hide face gear)
 *  - tint: image 2 of every kit is a slot mask (value = slot * 32); texel *= the player's colour for that slot
 *  - first person: hide everything under the head bone; arms, legs and feet stay visible
 *
 * API (window.AvatarKit):
 *   await AvatarKit.ready()                       load catalog + every kit once (cached)
 *   AvatarKit.create(loadout) -> avatar           { root, mixer, clips, loadout, apply(L), play(name), update(dt),
 *                                                   setFirstPerson(on), eyeWorld(v3), dispose() }
 *   AvatarKit.defaultLoadout(sex) / randomLoadout(sex, {ownedOnly})
 *   AvatarKit.encode(L) / decode(code)            short shareable string (send this over the network for co-op)
 *   AvatarKit.load() / save(L)                    the player's saved loadout (SAVE.wardrobe.look via Wardrobe; localStorage fallback)
 *   AvatarKit.isOwned(id) / grant(id) / owned()   unlocks (Default items are always owned; SAVE.wardrobe.owned via Wardrobe)
 */
(function () {
  'use strict';
  const BASE = 'assets/models/ps1/avatar/';
  const STORE = 'e2049.avatar.v1';
  const OWNED = 'e2049.avatar.owned.v1';
  const RARITY_COLORS = ['#a7b0c2', '#4fd17a', '#42a5f5', '#b65cff', '#ff9800', '#ffd54f', '#00e5ff'];
  // first-person eye, in the head bone's space (the head bone sits at the base of the skull)
  const EYE = new THREE.Vector3(0, .15, .11);

  let CAT = null, ITEMS = null, PRIO = null, SLOT_OF = null, loading = null;
  const KITS = { m: {}, f: {} };

  function storage(fn, fallback) { try { return fn(window.localStorage); } catch (e) { return fallback; } }

  function pixels(img) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height);
  }

  function loadGLB(url) {
    return new Promise((ok, bad) => new THREE.GLTFLoader().load(url, ok, undefined, bad));
  }

  async function loadKit(sex, kit) {
    const g = await loadGLB(`${BASE}avatar_${sex}_${kit}.glb`);
    let map = null, emi = null;
    g.scene.traverse(o => { if (o.isMesh && o.material.map && !map) { map = o.material.map; emi = o.material.emissiveMap; } });
    const mt = await g.parser.getDependency('texture', 2).catch(() => null);
    const raw = mt ? pixels(mt.image).data : null;
    const mask = new Uint8Array(raw ? raw.length / 4 : 0);
    for (let p = 0; p < mask.length; p++) mask[p] = Math.round(raw[p * 4] / 32);
    KITS[sex][kit] = { gltf: g, albedo: pixels(map.image), emissive: emi ? pixels(emi.image) : null, mask, w: map.image.width, h: map.image.height };
  }

  function ready() {
    if (loading) return loading;
    loading = (async () => {
      const r = await fetch(BASE + 'catalog.json');
      CAT = await r.json();
      ITEMS = { m: {}, f: {} };
      for (const s of ['m', 'f']) for (const it of CAT.items[s]) ITEMS[s][it.id] = it;
      PRIO = Object.fromEntries(CAT.categories.map(c => [c.id, c.priority]));
      SLOT_OF = Object.fromEntries(Object.entries(CAT.slots).map(([k, v]) => [v, +k]));
      const jobs = [];
      for (const sex of ['m', 'f']) for (const k of ['base', ...CAT.kits]) jobs.push(loadKit(sex, k));
      await Promise.all(jobs);
      return CAT;
    })();
    loading.catch(() => { loading = null; });
    return loading;
  }

  // ------------------------------------------------------------------ loadouts
  const byCat = (sex, cat) => CAT.items[sex].filter(i => i.cat === cat);
  const defaultItem = (sex, cat) => (byCat(sex, cat).find(i => i.default) || byCat(sex, cat)[0]).id;
  const palette = (slot, name) => CAT.palettes[slot].find(p => p.name === name) || CAT.palettes[slot][0];

  function defaultLoadout(sex = 'm') {
    const L = { sex, items: {}, colors: Object.assign({}, CAT.defaults) };
    for (const c of CAT.categories) L.items[c.id] = defaultItem(sex, c.id);
    return L;
  }
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function randomLoadout(sex, opts = {}) {
    sex = sex || (Math.random() < .5 ? 'm' : 'f');
    const L = defaultLoadout(sex);
    const core = new Set(['face', 'hair', 'top', 'legs', 'feet']);
    for (const c of CAT.categories) {
      const pool = byCat(sex, c.id).filter(i => !opts.ownedOnly || isOwned(i.id));
      if (pool.length && Math.random() < (core.has(c.id) ? .92 : .6)) L.items[c.id] = pick(pool).id;
    }
    for (const s of Object.keys(CAT.palettes)) L.colors[s] = pick(CAT.palettes[s]).name;
    return L;
  }
  // keep only ids/colours that exist (codes from older builds, other players, hand edits)
  function validate(o) {
    const L = defaultLoadout(o && o.sex === 'f' ? 'f' : 'm');
    for (const [k, v] of Object.entries((o && o.items) || {})) if (ITEMS[L.sex][v] && ITEMS[L.sex][v].cat === k) L.items[k] = v;
    for (const [k, v] of Object.entries((o && o.colors) || {})) if (CAT.palettes[k] && CAT.palettes[k].some(p => p.name === v)) L.colors[k] = v;
    return L;
  }
  function encode(L) { return btoa(JSON.stringify({ v: 1, s: L.sex, i: L.items, c: L.colors })); }
  function decode(code) {
    try { const o = JSON.parse(atob(String(code).trim())); return validate({ sex: o.s, items: o.i, colors: o.c }); } catch (e) { return null; }
  }
  // the game's save (SAVE.wardrobe, via window.Wardrobe) owns the look and the unlocks once it is attached;
  // localStorage is the fallback for the standalone creator and dev pages
  const WR = () => (window.Wardrobe && window.Wardrobe.ready ? window.Wardrobe : null);
  function load() {
    const w = WR();
    return (w && w.save.look && decode(w.save.look)) || storage(s => decode(s.getItem(STORE)), null) || defaultLoadout('m');
  }
  function save(L) {
    const w = WR();
    if (w) { w.save.look = encode(L); if (typeof window.persistSave === 'function') window.persistSave(); }
    storage(s => s.setItem(STORE, encode(L)));
  }

  // ------------------------------------------------------------------ unlocks
  function owned() {
    const w = WR();
    return new Set(w ? w.save.owned : storage(s => JSON.parse(s.getItem(OWNED) || '[]'), []));
  }
  function isOwned(id) {
    for (const s of ['m', 'f']) { const it = ITEMS && ITEMS[s][id]; if (it && (it.default || it.unlock === 'Default')) return true; }
    return owned().has(id);
  }
  function grant(id) {
    const w = WR();
    if (w) { w.grant(id, 'dev'); return; }
    const o = owned(); o.add(id); storage(s => s.setItem(OWNED, JSON.stringify([...o])));
  }
  function lockedIn(L) { return Object.values(L.items).filter(id => !isOwned(id)); }

  // ------------------------------------------------------------------ what is on show for a loadout
  function resolve(L) {
    const eq = {};
    for (const c of CAT.categories) eq[c.id] = ITEMS[L.sex][L.items[c.id]] || ITEMS[L.sex][defaultItem(L.sex, c.id)];
    const blocked = new Set(Object.values(eq).flatMap(i => i.blocks || []));
    const hat = eq.head, hair = eq.hair;
    const hairOk = !hat.hair || hat.hair === 'all' || (hat.hair === 'short' && hair.length === 'short');
    const show = {}, baseHide = new Set(), pieceHide = [];
    for (const c of CAT.categories) show[c.id] = !blocked.has(c.id) && !(c.id === 'hair' && !hairOk);
    for (const c of CAT.categories) {
      if (!show[c.id]) continue;
      for (const r of eq[c.id].replaces || []) {
        if (r.startsWith('b_')) baseHide.add(r); else pieceHide.push({ bone: r, prio: PRIO[c.id] });
      }
    }
    return { eq, show, baseHide, pieceHide, hairOk, blocked };
  }

  // ------------------------------------------------------------------ an avatar instance
  class Avatar {
    constructor(L) {
      L = validate(L || defaultLoadout('m'));
      this.sex = L.sex;
      const base = KITS[this.sex].base;
      this.root = base.gltf.scene.clone(true);           // rigid parts, no skinning: a plain clone keeps the clips' node names
      this.root.name = 'avatar';
      this.mixer = new THREE.AnimationMixer(this.root);
      this.clips = base.gltf.animations;
      this.head = this.root.getObjectByName('head');
      this.tex = {}; this.mats = {};
      for (const k of Object.keys(KITS[this.sex])) {
        const K = KITS[this.sex][k];
        const layer = src => {
          const c = document.createElement('canvas'); c.width = K.w; c.height = K.h;
          const ctx = c.getContext('2d'); const t = new THREE.CanvasTexture(c);
          t.flipY = false; t.encoding = THREE.sRGBEncoding; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
          return { ctx, t, img: ctx.createImageData(K.w, K.h), src };
        };
        this.tex[k] = { a: layer(K.albedo), e: K.emissive ? layer(K.emissive) : null };
        this.mats[k] = new THREE.MeshLambertMaterial({ map: this.tex[k].a.t, emissiveMap: this.tex[k].e ? this.tex[k].e.t : null,
          emissive: this.tex[k].e ? 0xffffff : 0x000000, side: THREE.DoubleSide });
      }
      this.root.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true;
        if (o.material.name !== 'prop' && o.material.name !== 'glow') o.material = this.mats.base;
      });
      this.worn = {}; this.firstPerson = false; this.action = null;
      this.apply(L);
    }
    apply(L) {
      L = validate(L);
      if (L.sex !== this.sex) throw new Error('AvatarKit: body type changed; create a new avatar instead');
      this.loadout = L;
      const R = resolve(L);
      this.root.traverse(o => { if (/^b_/.test(o.name)) o.visible = !R.baseHide.has(o.name); });
      for (const k of Object.keys(this.worn)) for (const n of this.worn[k]) if (n.parent) n.parent.remove(n);
      this.worn = {};
      for (const c of CAT.categories) {
        if (!R.show[c.id]) continue;
        const item = R.eq[c.id], K = KITS[this.sex][c.kit]; if (!K) continue;
        const src = [];
        K.gltf.scene.traverse(o => { if (o.name.startsWith(item.id + '@')) src.push(o); });
        this.worn[c.id] = [];
        for (const s of src) {
          const bone = s.name.split('@')[1];
          if (R.pieceHide.some(h => h.bone === bone && h.prio > PRIO[c.id])) continue;
          const target = this.root.getObjectByName(bone); if (!target) continue;
          const n = s.clone(true);
          n.scale.setScalar(1); n.position.set(0, 0, 0); n.quaternion.identity(); n.visible = true;
          n.traverse(o => { if (o.isMesh) { o.material = this.mats[c.kit]; o.frustumCulled = false; o.castShadow = true; } });
          target.add(n); this.worn[c.id].push(n);
        }
      }
      this.tint(L.colors);
      if (this.firstPerson) this.setFirstPerson(true);
      return this;
    }
    tint(colors) {
      const t = [[1, 1, 1]];
      for (const [slot, id] of Object.entries(SLOT_OF)) t[id] = palette(slot, colors[slot]).t;
      for (const k of Object.keys(this.tex)) {
        const M = KITS[this.sex][k].mask;
        for (const layer of [this.tex[k].a, this.tex[k].e]) {
          if (!layer) continue;
          const b = layer.src.data, o = layer.img.data;
          for (let p = 0, i = 0; p < M.length; p++, i += 4) {
            const q = t[M[p]] || t[0];
            o[i] = Math.min(255, b[i] * q[0]); o[i + 1] = Math.min(255, b[i + 1] * q[1]); o[i + 2] = Math.min(255, b[i + 2] * q[2]); o[i + 3] = 255;
          }
          layer.ctx.putImageData(layer.img, 0, 0); layer.t.needsUpdate = true;
        }
      }
    }
    play(name, fade = .25) {
      const clip = this.clips.find(c => c.name === name) || this.clips.find(c => c.name === 'Idle');
      const a = this.mixer.clipAction(clip);
      if (this.action === a) return a;
      a.reset().fadeIn(fade).play(); if (this.action) this.action.fadeOut(fade);
      this.action = a; this.clipName = clip.name; return a;
    }
    update(dt) { this.mixer.update(dt); }
    // first person: hide the head and everything worn on it; arms, legs and feet stay so the player sees their fit
    setFirstPerson(on) {
      this.firstPerson = !!on;
      this.head.traverse(o => { if (o !== this.head && o.isMesh) o.visible = !on; });
      if (!on) this.root.traverse(o => { if (/^b_/.test(o.name)) o.visible = !resolve(this.loadout).baseHide.has(o.name); });
    }
    // eye position in world space; lean > 0 (looking down) moves the eye out over the chest so the body is visible
    eyeWorld(out = new THREE.Vector3(), lean = 0) {
      this.head.updateWorldMatrix(true, false);
      return this.head.localToWorld(out.set(EYE.x, EYE.y - .05 * lean, EYE.z + .17 * lean));
    }
    dispose() {
      if (this.root.parent) this.root.parent.remove(this.root);
      this.mixer.stopAllAction();
      for (const k of Object.keys(this.tex)) { this.tex[k].a.t.dispose(); if (this.tex[k].e) this.tex[k].e.t.dispose(); this.mats[k].dispose(); }
    }
  }

  window.AvatarKit = {
    BASE, RARITY_COLORS, EYE,
    ready, get catalog() { return CAT; }, get loaded() { return !!CAT && !!KITS.f.base; },
    item: (sex, id) => ITEMS && ITEMS[sex][id],
    itemsIn: (sex, cat) => byCat(sex, cat),
    create: L => new Avatar(L),
    defaultLoadout, randomLoadout, validate, encode, decode, load, save, resolve,
    owned, isOwned, grant, lockedIn,
  };
})();
