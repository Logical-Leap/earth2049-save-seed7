/* EARTH 2049: SAVE SEED 7 — editor scene / asset / data loading layer */
'use strict';

const AssetLoader = (() => {
  const jsonCache = {};
  const sceneCache = {};
  const modelCache = {};
  let manifest = null;

  function warn(...args) { console.warn('[E2049]', ...args); }

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

  async function loadScene(url) {
    if (!url || !THREE.ObjectLoader) return null;
    if (sceneCache[url]) return cloneObject(sceneCache[url]);
    const data = await fetchJson(url);
    if (!data) return null;
    try {
      const loader = new THREE.ObjectLoader();
      const obj = loader.parse(data);
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

  return { fetchJson, loadScene, loadModel, preloadManifest, getModel, cloneModel, get manifest() { return manifest; } };
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
