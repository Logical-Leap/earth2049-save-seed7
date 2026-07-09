/* EARTH 2049: SAVE SEED 7 — editor scene / asset / data loading layer */
'use strict';

const AssetLoader = (() => {
  const jsonCache = {};
  const sceneCache = {};
  const modelCache = {};
  const imageTexCache = {};
  let manifest = null;
  let textureLoader = null;

  const FACTION_TEXTURE_COUNT = { shillz: 10, cryptids: 8, bots: 11 };
  const TILE_METERS = 4;
  const SKIP_MATERIAL_RE = /^mat-(?:marker|route)/;
  const SKIP_MESH_RE = /E2049_(?:PLAYER_START|BOSS_ARENA|ENEMY_SPAWN|PICKUP_SPAWN|ROUTE_|COLLIDER)/;
  const MATERIAL_TEXTURE_INDEX = {
    'mat-floor': 1,
    'mat-floor-concrete': 1,
    'mat-floor-dark': 1,
    'mat-floor-vault': 1,
    'mat-wall-concrete': 2,
    'mat-wall-black': 2,
    'mat-vault-steel': 3,
    'mat-metal-dark': 4,
    'mat-metal-muted-gold': 4,
    'mat-cover': 4,
    'mat-emerald-dim': 5,
    'mat-vr-cyan-dim': 6,
    'mat-vr-purple-dim': 7,
    'mat-screen-emerald': 5,
    'mat-screen-gold': 5,
    'mat-screen-red': 5,
    'mat-screen-blue': 6,
    'mat-screen-purple': 7,
  };

  function warn(...args) { console.warn('[E2049]', ...args); }

  function factionFromSceneUrl(url) {
    if (!url) return null;
    const file = url.split('/').pop() || '';
    if (file.includes('cryptids')) return 'cryptids';
    if (file.includes('shillz')) return 'shillz';
    if (file.includes('bots') || file.includes('bot-')) return 'bots';
    if (file.includes('musker')) return 'muskers';
    if (file.includes('gigacorp')) return 'gigacorp';
    return null;
  }

  function textureUrl(faction, index) {
    const max = FACTION_TEXTURE_COUNT[faction];
    if (!max || index < 1 || index > max) return null;
    return `assets/textures/${faction}_texture${index}.png`;
  }

  function loadImageTexture(url) {
    if (!url || !THREE.TextureLoader) return Promise.resolve(null);
    if (imageTexCache[url]) return imageTexCache[url];
    if (!textureLoader) textureLoader = new THREE.TextureLoader();
    imageTexCache[url] = new Promise(resolve => {
      textureLoader.load(url, tex => {
        tex.encoding = THREE.sRGBEncoding;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 4;
        resolve(tex);
      }, undefined, () => {
        warn('Failed to load district texture:', url);
        resolve(null);
      });
    });
    return imageTexCache[url];
  }

  function meshMaterialId(mesh, matIdByRef) {
    const mat = mesh.material;
    if (!mat) return '';
    if (matIdByRef?.has(mat)) return matIdByRef.get(mat);
    return mat.uuid || mat.name || '';
  }

  function buildMaterialIdMap(data, root) {
    const matIdByRef = new WeakMap();
    if (!data?.object || !root) return matIdByRef;
    function walk(jsonNode, objNode) {
      if (!jsonNode || !objNode) return;
      if (jsonNode.material && objNode.material) matIdByRef.set(objNode.material, jsonNode.material);
      const jsonKids = jsonNode.children || [];
      const objKids = objNode.children || [];
      for (let i = 0; i < jsonKids.length; i++) walk(jsonKids[i], objKids[i]);
    }
    walk(data.object, root);
    return matIdByRef;
  }

  function textureIndexForMesh(mesh, matIdByRef) {
    const name = (mesh.name || '').toUpperCase();
    const matId = meshMaterialId(mesh, matIdByRef);

    if (/_FLOOR\b|_BASE_FLOOR/.test(name)) return 1;
    if (/BLOCKER.*WALL|_WALL\b/.test(name)) return 2;
    if (/_GATE\b|VAULT_DOOR/.test(name)) return 3;
    if (/TRUSS|SERVER[-_]?RACK/.test(name)) return 4;
    if (/WINDOW/.test(name)) return null;

    if (MATERIAL_TEXTURE_INDEX[matId] != null) return MATERIAL_TEXTURE_INDEX[matId];

    if (/COVER|CRATE/.test(name)) return 4;
    if (/SIGN|SCREEN|TERMINAL|HAZARD/.test(name)) return 5;
    return null;
  }

  function shouldSkipMesh(mesh, matIdByRef) {
    if (!mesh?.isMesh) return true;
    const name = (mesh.name || '').toUpperCase();
    if (SKIP_MESH_RE.test(name)) return true;
    const matId = meshMaterialId(mesh, matIdByRef);
    if (!matId || matId === 'mat-glass-dim') return true;
    if (SKIP_MATERIAL_RE.test(matId)) return true;
    return textureIndexForMesh(mesh, matIdByRef) == null;
  }

  function repeatForMesh(mesh) {
    mesh.updateMatrixWorld(true);
    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(mesh).getSize(size);
    const ax = Math.max(size.x, 0.05);
    const ay = Math.max(size.y, 0.05);
    const az = Math.max(size.z, 0.05);
    if (ay <= ax && ay <= az) return { x: ax / TILE_METERS, y: az / TILE_METERS };
    if (ax <= ay && ax <= az) return { x: az / TILE_METERS, y: ay / TILE_METERS };
    return { x: ax / TILE_METERS, y: ay / TILE_METERS };
  }

  function applyMapToMaterial(mat, baseTex, repeat) {
    const map = baseTex.clone();
    map.repeat.set(Math.max(repeat.x, 1), Math.max(repeat.y, 1));
    map.needsUpdate = true;
    mat.map = map;
    if (mat.color) mat.color.setHex(0xffffff);
    mat.needsUpdate = true;
  }

  async function applyDistrictTextures(root, opts = {}) {
    if (!root) return root;
    const faction = opts.faction || factionFromSceneUrl(opts.sceneUrl);
    if (!faction || !FACTION_TEXTURE_COUNT[faction]) return root;

    const matIdByRef = opts.materialIdMap || null;
    const needed = new Set();
    root.traverse(obj => {
      if (shouldSkipMesh(obj, matIdByRef)) return;
      needed.add(textureIndexForMesh(obj, matIdByRef));
    });
    if (!needed.size) return root;

    const texByIndex = {};
    await Promise.all([...needed].map(async index => {
      const url = textureUrl(faction, index);
      if (!url) return;
      texByIndex[index] = await loadImageTexture(url);
    }));

    let wrapped = 0;
    root.traverse(obj => {
      if (shouldSkipMesh(obj, matIdByRef)) return;
      const index = textureIndexForMesh(obj, matIdByRef);
      const baseTex = texByIndex[index];
      if (!baseTex) return;
      applyMapToMaterial(obj.material, baseTex, repeatForMesh(obj));
      wrapped++;
    });
    if (wrapped) console.info(`[E2049] Wrapped ${wrapped} district meshes with ${faction} textures`);
    return root;
  }

  async function fetchJson(url, opts = {}) {
    if (!url) return null;
    if (jsonCache[url]) return jsonCache[url];
    try {
      const res = await fetch(url, { cache: opts.cache || 'default' });
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      const text = await res.text();
      if (text.length > 650000) warn('Large JSON asset may affect load time:', url, Math.round(text.length / 1024) + 'KB');
      const data = JSON.parse(text);
      jsonCache[url] = data;
      return data;
    } catch (err) {
      if (!opts.optional) warn('Failed to load JSON:', url, err);
      return null;
    }
  }

  async function loadScene(url, opts = {}) {
    if (!url || !THREE.ObjectLoader) return null;
    if (sceneCache[url]) return cloneObject(sceneCache[url]);
    const data = await fetchJson(url);
    if (!data) return null;
    try {
      const loader = new THREE.ObjectLoader();
      const obj = loader.parse(data);
      const materialIdMap = buildMaterialIdMap(data, obj);
      await applyDistrictTextures(obj, { ...opts, sceneUrl: url, materialIdMap });
      sceneCache[url] = obj;
      return cloneObject(obj);
    } catch (err) {
      warn('Failed to parse Three.js Editor scene, falling back to procedural:', url, err);
      return null;
    }
  }

  function loadModel(id, url) {
    if (!id || !url || !THREE.GLTFLoader) return Promise.resolve(null);
    if (modelCache[id]) return modelCache[id].promise;
    const rec = { id, url, gltf: null, error: null };
    rec.promise = new Promise(resolve => {
      const loader = new THREE.GLTFLoader();
      loader.load(url, gltf => {
        rec.gltf = gltf;
        resolve(gltf);
      }, undefined, err => {
        rec.error = err;
        warn('Failed to load GLB model, procedural fallback remains active:', id, url, err);
        resolve(null);
      });
    });
    modelCache[id] = rec;
    return rec.promise;
  }

  async function preloadManifest(url = 'assets/data/asset-manifest.json') {
    const data = await fetchJson(url, { optional: true });
    manifest = data || { models: {} };
    const models = manifest.models || {};
    await Promise.all(Object.entries(models).map(([id, modelUrl]) => loadModel(id, modelUrl)));
    return manifest;
  }

  function getModel(id) {
    const rec = modelCache[id];
    return rec && rec.gltf && !rec.error ? rec.gltf : null;
  }

  function cloneObject(obj) {
    if (THREE.SkeletonUtils?.clone) return THREE.SkeletonUtils.clone(obj);
    return obj.clone(true);
  }

  function cloneModel(id) {
    const gltf = getModel(id);
    return gltf ? cloneObject(gltf.scene) : null;
  }

  return {
    fetchJson, loadScene, loadModel, preloadManifest, getModel, cloneModel, applyDistrictTextures,
    get manifest() { return manifest; },
  };
})();

const GameData = (() => {
  function mergeDeep(target, src) {
    if (!src || typeof src !== 'object') return target;
    for (const [key, value] of Object.entries(src)) {
      if (Array.isArray(value)) target[key] = value;
      else if (value && typeof value === 'object') {
        if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
        mergeDeep(target[key], value);
      } else target[key] = value;
    }
    return target;
  }

  function mergeArrayByIndex(target, src) {
    if (!Array.isArray(target) || !Array.isArray(src)) return;
    for (let i = 0; i < src.length; i++) {
      if (!src[i]) continue;
      if (!target[i]) target[i] = src[i];
      else mergeDeep(target[i], src[i]);
    }
  }

  async function load(url = 'assets/data/game-data.json') {
    const data = await AssetLoader.fetchJson(url, { optional: true });
    if (!data) return null;
    if (data.CFG && typeof CFG !== 'undefined') mergeDeep(CFG, data.CFG);
    if (data.WEAPONS && typeof WEAPONS !== 'undefined') mergeDeep(WEAPONS, data.WEAPONS);
    if (data.ETYPES && typeof ETYPES !== 'undefined') mergeDeep(ETYPES, data.ETYPES);
    if (data.BOSSES && typeof BOSSES !== 'undefined') mergeDeep(BOSSES, data.BOSSES);
    if (data.DISTRICTS && typeof DISTRICTS !== 'undefined') mergeArrayByIndex(DISTRICTS, data.DISTRICTS);
    if (data.ABILITIES && typeof ABILITIES !== 'undefined') mergeDeep(ABILITIES, data.ABILITIES);
    if (data.METAUP && typeof METAUP !== 'undefined') mergeArrayByIndex(METAUP, data.METAUP);
    return data;
  }

  return { load, mergeDeep };
})();
