/* Earth 2049 centralized faction skybox registry (Three.js r147 compatible). */
const Skyboxes = (() => {
  const ROOT = 'assets/textures/earth2049_all_faction_district_skyboxes/earth2049_faction_skyboxes';
  const CONFIG = Object.freeze({
    deadzone: { basePath: 'assets/textures/rebel-hub-haven-commons-final/skybox/', prefix: 'earth2049_deadzone', fallback: 0x59616a, fog: 0x6e7477, density: 0.0030 },
    shillz: { basePath: `${ROOT}/shillz/`, prefix: 'earth2049_shillz', fallback: 0x423616, fog: 0x52451f, density: 0.0023 },
    muskers: { basePath: `${ROOT}/muskers/`, prefix: 'earth2049_muskers', fallback: 0x172a22, fog: 0x21342d, density: 0.0025 },
    gigacorp: { basePath: `${ROOT}/gigacorp/`, prefix: 'earth2049_gigacorp', fallback: 0x172735, fog: 0x263846, density: 0.0021 },
    bots: { basePath: `${ROOT}/bots/`, prefix: 'earth2049_bots', fallback: 0x101b13, fog: 0x16271b, density: 0.0028 },
    cryptids: { basePath: `${ROOT}/cryptids/`, prefix: 'earth2049_cryptids', fallback: 0x21152b, fog: 0x241b30, density: 0.0024 },
  });
  const sourceCache = new Map();
  const rotatedCache = new Map();
  const aliases = { rebel: 'deadzone', rebels: 'deadzone', haven: 'deadzone', deadzone: 'deadzone', 'dead-zone': 'deadzone', shillz: 'shillz', musker: 'muskers', muskers: 'muskers', bot: 'bots', bots: 'bots', cryptid: 'cryptids', cryptids: 'cryptids', giga: 'gigacorp', gigacorp: 'gigacorp' };

  function normalize(value) {
    const s = String(value || '').toLowerCase();
    for (const [needle, faction] of Object.entries(aliases)) if (s.includes(needle)) return faction;
    return null;
  }

  function resolveFaction(scene, levelFileName, configuredFaction) {
    const u = scene?.userData || {};
    const resolved = normalize(u.skyboxFaction) || normalize(u.faction) || normalize(u.district) || normalize(u.area) || normalize(levelFileName) || normalize(configuredFaction);
    if (resolved) return resolved;
    console.warn(`[Skybox] No faction mapping found for ${levelFileName || scene?.name || 'level'}; using Dead Zone fallback.`);
    return 'deadzone';
  }

  function markerPosition(scene, types) {
    let hit = null;
    scene?.traverse?.(obj => {
      if (hit) return;
      const t = String(obj.userData?.gameplayType || '').toLowerCase();
      const n = String(obj.name || '').toLowerCase();
      if (types.some(type => t === type || n.includes(type))) hit = obj.getWorldPosition(new THREE.Vector3());
    });
    return hit;
  }

  function resolveYaw(scene, fallbackStart, fallbackTarget) {
    const explicit = Number(scene?.userData?.skyboxYawDegrees);
    if (Number.isFinite(explicit)) return { yaw: THREE.MathUtils.degToRad(explicit), source: 'explicit skyboxYawDegrees' };
    const start = markerPosition(scene, ['playerstart']) || fallbackStart;
    const objective = markerPosition(scene, ['primaryobjective', 'missionobjective', 'objective', 'bossarena']);
    const extraction = markerPosition(scene, ['extractiongate', 'extraction', 'travelgate', 'missionlaunch']);
    const target = objective || extraction || fallbackTarget;
    if (start && target) {
      const forward = new THREE.Vector3().subVectors(target, start).setY(0);
      if (forward.lengthSq() > 1e-6) {
        forward.normalize();
        return { yaw: Math.atan2(forward.x, forward.z), source: objective ? 'playerStart → primaryObjective' : extraction ? 'playerStart → extraction' : 'runtime start → objective' };
      }
    }
    return { yaw: 0, source: 'zero-degree fallback' };
  }

  function urlsFor(faction) {
    const c = CONFIG[faction] || CONFIG.deadzone;
    return ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map(face => `${c.basePath}${c.prefix}_${face}.png?v=20260713-faction-skyboxes`);
  }

  function loadFaction(faction) {
    faction = CONFIG[faction] ? faction : 'deadzone';
    if (sourceCache.has(faction)) return sourceCache.get(faction);
    const promise = new Promise((resolve, reject) => {
      new THREE.CubeTextureLoader().load(urlsFor(faction), texture => {
        texture.encoding = THREE.sRGBEncoding;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.userData = { skyboxFaction: faction, sourceUrls: urlsFor(faction) };
        resolve(texture);
      }, undefined, reject);
    });
    sourceCache.set(faction, promise);
    promise.catch(() => sourceCache.delete(faction));
    return promise;
  }

  function rotatedCubemap(source, faction, yaw, renderer) {
    if (Math.abs(yaw) < 1e-6) return source;
    const key = `${faction}:${yaw.toFixed(6)}`;
    if (rotatedCache.has(key)) return rotatedCache.get(key);
    const size = source.image?.[0]?.width || 1024;
    const target = new THREE.WebGLCubeRenderTarget(size, {
      encoding: THREE.sRGBEncoding,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const captureScene = new THREE.Scene();
    const material = new THREE.ShaderMaterial({
      uniforms: { sky: { value: source }, yaw: { value: yaw } },
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform samplerCube sky; uniform float yaw; varying vec3 vDir; void main(){ vec3 d=normalize(vDir); float c=cos(yaw), s=sin(yaw); vec3 r=vec3(c*d.x-s*d.z,d.y,s*d.x+c*d.z); gl_FragColor=textureCube(sky,r); }',
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), material);
    captureScene.add(sphere);
    const cubeCamera = new THREE.CubeCamera(0.1, 20, target);
    captureScene.add(cubeCamera);
    cubeCamera.update(renderer, captureScene);
    sphere.geometry.dispose(); material.dispose();
    target.texture.userData = { skyboxFaction: faction, yawRadians: yaw, rotatedFrom: source.uuid };
    rotatedCache.set(key, target.texture);
    return target.texture;
  }

  async function applyDistrictSkybox(scene, faction, yawRadians, renderer) {
    faction = CONFIG[faction] ? faction : 'deadzone';
    const c = CONFIG[faction];
    scene.background = new THREE.Color(c.fallback);
    scene.environment = null;
    scene.fog = new THREE.FogExp2(c.fog, c.density);
    try {
      const source = await loadFaction(faction);
      const texture = rotatedCubemap(source, faction, yawRadians || 0, renderer);
      scene.background = texture;
      if ('backgroundIntensity' in scene) scene.backgroundIntensity = 0.85;
      return texture;
    } catch (error) {
      console.error(`[Skybox] Failed to load ${faction} cubemap; retaining safe fallback.`, error);
      return null;
    }
  }

  function preload(faction) { return loadFaction(faction).catch(() => null); }
  function diagnostics() { return { sourceCache: [...sourceCache.keys()], rotatedCache: [...rotatedCache.keys()] }; }
  return { CONFIG, resolveFaction, resolveYaw, applyDistrictSkybox, preload, diagnostics, urlsFor };
})();
