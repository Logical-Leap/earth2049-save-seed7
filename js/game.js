/* EARTH 2049: SAVE SEED 7 — core game (Three.js FPS roguelike) */
'use strict';

/* ============ globals ============ */
let renderer, scene, camera, composer, bloomPass;
let gunGroup, gunModels = {}, curGunObj = null, muzzleSprite, muzzleLight, explLight;
let SAVE, G = null;
let isTouch = false;
let state = 'title';            // title | run | og | dead | victory
let paused = false;
let devGodMode = false;
let quality = 3;                // 3 high .. 0 low
let fpsEma = 60, fpsCheck = 0;
const V3 = () => new THREE.Vector3();
const _v1 = V3(), _v2 = V3(), _v3 = V3(), _fwd = V3();
const el = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);

window.onerror = (m, s, l) => { const d = el('loadScreen'); if (d && d.style.display !== 'none') { d.style.display = 'flex'; d.innerHTML = 'ERROR<br><span style="font-size:10px;letter-spacing:.1em;color:#f66">' + m + ' @' + l + '</span>'; } };

/* ============ save ============ */
function loadSave() { // NOSONAR - compact backwards-compatible localStorage migration for a static game
  try { SAVE = JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch (e) { SAVE = null; }
  if (!SAVE) SAVE = { gt: 0, up: {}, runs: 0, bestD: 0, kills: 0, wins: 0, opts: { sens: 1, music: true, sfx: true, auto: true } };
  if (!SAVE.opts) SAVE.opts = { sens: 1, music: true, sfx: true, auto: true };
  if (!SAVE.up) SAVE.up = {};
  if (!SAVE.intel) SAVE.intel = {};
  for (const id of Object.keys(FACTIONS)) if (id !== 'rebels' && !SAVE.intel[id]) SAVE.intel[id] = { points: 0, leaders: 0 };
  SAVE.corruption = Number(SAVE.corruption || 0);
  if (!SAVE.abilities) SAVE.abilities = {};
  for (const id of Object.keys(ABILITIES)) if (!SAVE.abilities[id]) SAVE.abilities[id] = { unlocked: id === 'empGrenade', level: id === 'empGrenade' ? 1 : 0 };
  if (!Array.isArray(SAVE.equippedAbilities)) SAVE.equippedAbilities = ['empGrenade'];
  if (!SAVE.mastery) SAVE.mastery = {};
  for (const id of Object.keys(WEAPONS)) if (!SAVE.mastery[id]) SAVE.mastery[id] = { xp: 0, level: 0, kills: 0, eliteKills: 0, bossDamage: 0, headshots: 0, clears: 0 };
  if (!SAVE.relics) SAVE.relics = {};
  SAVE.simTier = Math.max(1, Number(SAVE.simTier || 1));
  if (!SAVE.modifiersSeen) SAVE.modifiersSeen = {};
  if (!SAVE.codex) SAVE.codex = {};
  if (!SAVE.corruptionUp) SAVE.corruptionUp = {};
  ensureLocalProfile();
}
function randomId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  const a = new Uint8Array(12); crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
function ensureLocalProfile() {
  if (!SAVE) return null;
  if (!SAVE.profile) SAVE.profile = {};
  if (!SAVE.profile.id) SAVE.profile.id = 'op-' + randomId();
  if (!SAVE.profile.name) SAVE.profile.name = 'Purple Operative';
  if (!SAVE.profile.color) SAVE.profile.color = '#9b59ff';
  return SAVE.profile;
}
function setProfileName(name) {
  const p = ensureLocalProfile();
  p.name = String(name || 'Purple Operative').trim().slice(0, 24) || 'Purple Operative';
  persist();
  return p;
}

function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) {} }
const upLv = id => SAVE.up[id] || 0;
const corruptLv = id => SAVE.corruptionUp?.[id] || 0;
const abilityLv = id => SAVE.abilities?.[id]?.level || 0;
const hasRelic = id => !!SAVE.relics?.[id];
function intelPoints(fac){ return SAVE.intel?.[fac]?.points || 0; }
function intelRank(fac){ const p = intelPoints(fac); return p >= 180 ? 4 : p >= 90 ? 3 : p >= 35 ? 2 : p > 0 ? 1 : 0; }
function ensureAbilityUnlocks(){
  for (const [id,a] of Object.entries(ABILITIES)) {
    const rec = SAVE.abilities[id] || (SAVE.abilities[id] = { unlocked:false, level:0 });
    if (rec.unlocked) continue;
    if (a.unlock?.intel && intelPoints(a.unlock.intel.fac) >= a.unlock.intel.points) { rec.unlocked = true; rec.level = Math.max(1, rec.level || 0); }
    if (a.unlock?.up && upLv(a.unlock.up) > 0) { rec.unlocked = true; rec.level = Math.max(1, rec.level || 0); }
  }
  if (!SAVE.equippedAbilities.length) SAVE.equippedAbilities.push('empGrenade');
}

/* ============ boot ============ */
async function boot() {
  loadSave();
  isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) document.body.classList.add('touch');

  renderer = new THREE.WebGLRenderer({ canvas: el('c'), antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.4 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 260);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.95, 0.55, 0.6);
  composer.addPass(bloomPass);
  composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));

  const loadScreen = el('loadScreen');
  if (loadScreen) loadScreen.textContent = 'LOADING SIMULATION DATA…';
  await GameData?.load?.();
  if (loadScreen) loadScreen.textContent = 'LOADING FACTION MODELS…';
  await Assets.preloadExternalModels();

  // viewmodel
  gunGroup = new THREE.Group();
  gunGroup.position.set(0.25, -0.28, -0.46);
  gunGroup.scale.setScalar(0.52);
  gunGroup.rotation.y = 0.035;
  gunGroup.visible = false;
  camera.add(gunGroup);
  for (const k of Object.keys(WEAPONS)) gunModels[k] = Assets.buildGun(k);
  muzzleSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: Assets.starTex(), color: 0xfff2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  muzzleSprite.scale.setScalar(0.34);
  muzzleLight = new THREE.PointLight(0xffca7a, 0, 12, 2); scene.add(muzzleLight);
  explLight = new THREE.PointLight(0xff9040, 0, 26, 2); scene.add(explLight);

  Particles.init();
  DmgNums.init();
  initInput();
  initCoopRuntime();
  wireMenus();
  if (typeof DevConsole !== 'undefined') await DevConsole.init();
  onResize();
  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'run' && !CoopRoom?.isCoop) setPaused(true); });

  // living city backdrop behind the title screen
  await World.build(scene, 0);
  el('loadScreen').style.display = 'none';
  updateTitle();
  requestAnimationFrame(frame);
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  checkRotateHint();
}
function checkRotateHint() {
  const portrait = innerHeight > innerWidth * 1.2;
  el('rotateHint').style.display = (isTouch && portrait && state === 'run' && !rotateDismissed) ? 'flex' : 'none';
}
let rotateDismissed = false;

/* ============ particles ============ */
const Particles = (() => {
  const MAX = 700;
  let geo, pts, pos, col, alive = [];
  function init() {
    pos = new Float32Array(MAX * 3);
    col = new Float32Array(MAX * 3);
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    pts = new THREE.Points(geo, m);
    pts.frustumCulled = false; pts.renderOrder = 5;
    scene.add(pts);
    for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -100;
  }
  function burst(x, y, z, hex, n, spd, life, up) {
    const c = new THREE.Color(hex);
    for (let k = 0; k < n; k++) {
      if (alive.length >= MAX) alive.shift();
      const i = alive.length ? (alive[alive.length - 1].i + 1) % MAX : 0;
      const a = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI - Math.PI / 2;
      const s = spd * (0.4 + Math.random() * 0.8);
      alive.push({ i, x, y, z, vx: Math.cos(a) * Math.cos(ph) * s, vy: Math.sin(ph) * s + (up || 1.5), vz: Math.sin(a) * Math.cos(ph) * s, life: life * (0.6 + Math.random() * 0.6), l0: life, r: c.r, g: c.g, b: c.b });
    }
  }
  function tick(dt) {
    for (let k = alive.length - 1; k >= 0; k--) {
      const p = alive[k];
      p.life -= dt;
      if (p.life <= 0) { pos[p.i * 3 + 1] = -100; alive.splice(k, 1); continue; }
      p.vy -= 7 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.35; }
      const f = p.life / p.l0;
      pos[p.i * 3] = p.x; pos[p.i * 3 + 1] = p.y; pos[p.i * 3 + 2] = p.z;
      col[p.i * 3] = p.r * f; col[p.i * 3 + 1] = p.g * f; col[p.i * 3 + 2] = p.b * f;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
  return { init, burst, tick };
})();

/* ============ damage numbers ============ */
const DmgNums = (() => {
  const N = 34; let pool = [], live = [];
  function init() {
    const wrap = el('dmgNums');
    for (let i = 0; i < N; i++) { const d = document.createElement('div'); d.className = 'dn'; d.style.opacity = '0'; wrap.appendChild(d); pool.push(d); }
  }
  function spawn(wp, txt, crit) {
    const d = pool.length ? pool.pop() : (live.length ? live.shift().el : null);
    if (!d) return;
    d.textContent = txt;
    d.className = crit ? 'dn crit' : 'dn';
    live.push({ el: d, p: wp.clone().add(_v1.set(rnd(-0.3, 0.3), rnd(0, 0.3), 0)), vy: 1.6, life: 0.8 });
  }
  function tick(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const o = live[i];
      o.life -= dt; o.p.y += o.vy * dt; o.vy -= 1.4 * dt;
      if (o.life <= 0) { o.el.style.opacity = '0'; pool.push(o.el); live.splice(i, 1); continue; }
      _v2.copy(o.p).project(camera);
      if (_v2.z > 1 || _v2.z < -1) { o.el.style.opacity = '0'; continue; }
      o.el.style.opacity = String(Math.min(1, o.life * 2.4));
      o.el.style.left = ((_v2.x * 0.5 + 0.5) * innerWidth) + 'px';
      o.el.style.top = ((-_v2.y * 0.5 + 0.5) * innerHeight) + 'px';
    }
  }
  return { init, spawn, tick };
})();

/* ============ FX helpers ============ */
let fxList = [];   // {mesh, life, l0, grow, spin}
function spawnBeam(x, z, hex, h) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, h || 14, 8, 1, true),
    new THREE.MeshBasicMaterial({ map: Assets.beamTex(), color: hex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  m.position.set(x, (h || 14) / 2, z);
  scene.add(m); fxList.push({ mesh: m, life: 0.6, l0: 0.6 });
}
function spawnShock(x, y, z, hex, size) {
  const m = new THREE.Mesh(Assets.GEO.sph, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(x, y, z); m.scale.setScalar(0.5);
  scene.add(m); fxList.push({ mesh: m, life: 0.35, l0: 0.35, grow: size });
}
function fxTick(dt) {
  for (let i = fxList.length - 1; i >= 0; i--) {
    const f = fxList[i];
    f.life -= dt;
    if (f.life <= 0) { scene.remove(f.mesh); f.mesh.material.dispose(); if (f.mesh.geometry !== Assets.GEO.sph) f.mesh.geometry.dispose(); fxList.splice(i, 1); continue; }
    const k = f.life / f.l0;
    f.mesh.material.opacity = k * 0.8;
    if (f.grow) f.mesh.scale.setScalar(0.5 + (1 - k) * f.grow);
  }
}
let tracers = [];
function spawnTracer(a, b, hex) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }));
  scene.add(m); tracers.push({ m, life: 0.07 });
}
function tracerTick(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].life -= dt;
    if (tracers[i].life <= 0) { scene.remove(tracers[i].m); tracers[i].m.geometry.dispose(); tracers[i].m.material.dispose(); tracers.splice(i, 1); }
    else tracers[i].m.material.opacity = tracers[i].life / 0.07;
  }
}


/* ============ progression systems ============ */
function masteryXpForLevel(lvl){ return Math.round(80 * Math.pow(lvl + 1, 1.45)); }
function addMastery(id, xp, stats) {
  const m = SAVE.mastery[id] || (SAVE.mastery[id] = { xp:0, level:0, kills:0, eliteKills:0, bossDamage:0, headshots:0, clears:0 });
  if (stats) for (const [k,v] of Object.entries(stats)) m[k] = (m[k] || 0) + v;
  m.xp += Math.round(xp);
  while (m.level < 10 && m.xp >= masteryXpForLevel(m.level)) { m.xp -= masteryXpForLevel(m.level); m.level++; SAVE.codex['mastery_' + id + '_' + m.level] = true; }
}
function weaponMasteryLevel(id){ return SAVE.mastery?.[id]?.level || 0; }
function abilitySlot(slot){ return SAVE.equippedAbilities[slot] || null; }
function abilityCooldown(id){ return G?.p?.abilityCd?.[id] || 0; }
function rollRunModifiers() {
  const tier = simTierData(SAVE.simTier);
  const count = clamp(Math.floor(tier.mods + Math.min(2, SAVE.corruption / 8) + corruptLv('reroll') * 0.34), 1, 4);
  const pool = MODIFIERS.filter(m => (m.tier || 1) <= SAVE.simTier + Math.floor(SAVE.corruption / 10));
  const picked = [];
  while (picked.length < count && pool.length) picked.push(pool.splice(Math.trunc(Math.random() * pool.length), 1)[0]); // NOSONAR - gameplay RNG, not security-sensitive
  for (const m of picked) SAVE.modifiersSeen[m.id] = true;
  return picked;
}
function applyRunProgression(p) {
  ensureAbilityUnlocks();
  p.mods.gt += 0.20 * corruptLv('greed');
  p.mods.crit += 0.01 * weaponMasteryLevel('pistol');
  if (hasRelic('riyaRelic')) p.comboBonus = 0.8;
  if (hasRelic('blitzRelic')) p.mods.gt += 0.15;
  if (hasRelic('turingRelic')) SAVE.codex.simTiers = true;
}
function applyModifierData(g) {
  g.modStats = { shillShield:0, debt:false, botFragments:false, muskerRush:0, compliance:false, deleteProjectiles:0, lootbox:false, timelineDrift:false };
  for (const m of g.modifiers) if (m.ap) m.ap(g);
}
function factionDamageIncomingMult(src) {
  const fac = src?.type?.fac;
  let mult = 1;
  if (fac === 'shillz' && intelRank('shillz') >= 3) mult *= 0.88;
  if (fac === 'muskers' && src?.boss && intelRank('muskers') >= 3) mult *= 0.88;
  if (G?.p?.fieldT > 0) {
    const d = src ? Math.hypot(src.pos.x - G.p.fieldX, src.pos.z - G.p.fieldZ) : 0;
    if (!src || d < G.p.fieldR) mult *= (0.72 - 0.05 * Math.max(0, abilityLv('adBlockerField') - 1));
  }
  return mult;
}
function abilityUnlocked(id){ return !!SAVE.abilities?.[id]?.unlocked && abilityLv(id) > 0; }
function activeAbility(slot) { // NOSONAR - central active ability dispatcher keeps no-build architecture simple
  const id = abilitySlot(slot), a = id && ABILITIES[id];
  if (!a || !abilityUnlocked(id) || state !== 'run' || paused || !G) return;
  const p = G.p;
  if ((p.abilityCd[id] || 0) > 0) { banner(a.name, 'COOLDOWN ' + Math.ceil(p.abilityCd[id]) + 's'); return; }
  const lv = Math.max(1, abilityLv(id));
  let cd = a.cooldown * (1 - 0.06 * (lv - 1));
  if (id === 'empGrenade') {
    const radius = 6.5 + lv * 0.8;
    spawnShock(p.pos.x, 1.1, p.pos.z, 0x00e5ff, radius);
    for (const e of G.enemies) if (e.state !== 'dying') {
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d < radius) { e.stunT = Math.max(e.stunT || 0, 2 + lv * 0.35); damageEnemy(e, (e.type.fac === 'bots' || e.type.fac === 'gigacorp' ? 95 : 48) * (1 + lv * 0.18), false, e.pos); }
    }
  } else if (id === 'signalJammer') {
    p.jammerT = 4 + lv;
    spawnShock(p.pos.x, 1.1, p.pos.z, 0xffe600, 8 + lv);
    for (const pr of G.projs) if (pr.owner !== 'p') pr.dead = true;
  } else if (id === 'ogRewindPulse') {
    const snap = p.rewindHist[0];
    if (snap) { p.pos.set(snap.x, snap.y, snap.z); p.hp = Math.min(p.maxHp, Math.max(p.hp, snap.hp) + 10 * lv); p.armor = Math.min(p.maxArmor, p.armor + 8 * lv); }
    p.iframesT = Math.max(p.iframesT, 1.2 + lv * 0.25);
    spawnShock(p.pos.x, 1, p.pos.z, 0x9b59ff, 7 + lv);
  } else if (id === 'purpleDrone') {
    p.droneT = 8 + lv * 2; p.dronePulseT = 0;
    spawnBeam(p.pos.x, p.pos.z, 0x9b59ff, 7);
  } else if (id === 'adBlockerField') {
    p.fieldT = 7 + lv; p.fieldX = p.pos.x; p.fieldZ = p.pos.z; p.fieldR = 6 + lv * 1.2;
    spawnShock(p.fieldX, 0.8, p.fieldZ, 0xffe600, p.fieldR);
  }
  p.abilityCd[id] = cd;
  AudioSys.sfx('augment');
  banner(a.name, 'ABILITY ACTIVATED');
}
function abilityTick(dt) { // NOSONAR - tiny per-frame ability state machine
  const p = G.p;
  for (const id of Object.keys(p.abilityCd)) p.abilityCd[id] = Math.max(0, p.abilityCd[id] - dt);
  p.rewindSampleT -= dt;
  if (p.rewindSampleT <= 0) { p.rewindSampleT = 0.25; p.rewindHist.unshift({ x:p.pos.x, y:p.pos.y, z:p.pos.z, hp:p.hp }); p.rewindHist.length = Math.min(p.rewindHist.length, 18 + abilityLv('ogRewindPulse') * 4); }
  p.jammerT = Math.max(0, p.jammerT - dt); p.droneT = Math.max(0, p.droneT - dt); p.fieldT = Math.max(0, p.fieldT - dt);
  if (p.droneT > 0) {
    p.dronePulseT -= dt;
    if (p.dronePulseT <= 0) {
      p.dronePulseT = 0.7;
      const targets = G.enemies.filter(e => e.state !== 'dying').sort((a,b)=>Math.hypot(a.pos.x-p.pos.x,a.pos.z-p.pos.z)-Math.hypot(b.pos.x-p.pos.x,b.pos.z-p.pos.z)).slice(0, abilityLv('purpleDrone') >= 3 ? 2 : 1);
      for (const e of targets) { spawnTracer(_v1.set(p.pos.x, p.pos.y + 2.0, p.pos.z).clone(), _v2.set(e.pos.x, e.rootY + e.size, e.pos.z).clone(), 0x9b59ff); damageEnemy(e, 22 + abilityLv('purpleDrone') * 10, false, e.pos); }
    }
  }
  if (p.fieldT > 0 && abilityLv('adBlockerField') >= 3) for (const e of G.enemies) if (e.type.fac === 'shillz' && Math.hypot(e.pos.x - p.fieldX, e.pos.z - p.fieldZ) < p.fieldR) damageEnemy(e, 8 * dt, false, e.pos);
}
function levelAbility(id) {
  const rec = SAVE.abilities[id];
  if (!rec || !rec.unlocked) return false;
  const a = ABILITIES[id], lv = rec.level || 1;
  if (lv >= a.max) return false;
  const cost = 110 * (lv + 1);
  if (SAVE.gt < cost) return false;
  SAVE.gt -= cost; rec.level = lv + 1; persist(); return true;
}
function setAbilitySlot(id) {
  if (!abilityUnlocked(id)) return;
  const arr = SAVE.equippedAbilities;
  if (arr.includes(id)) SAVE.equippedAbilities = arr.filter(x => x !== id);
  else { SAVE.equippedAbilities = arr.concat(id).slice(-2); }
  persist();
}
function buyCorruptionUpgrade(id) {
  const u = CORRUPTION_UPGRADES.find(x => x.id === id), lv = corruptLv(id);
  if (!u || lv >= u.max) return false;
  const cost = corruptionCost(u, lv);
  if (SAVE.corruption < cost) return false;
  SAVE.corruption -= cost; SAVE.corruptionUp[id] = lv + 1; persist(); return true;
}

/* ============ run state ============ */
function makeWeapon(id, rarity) { // NOSONAR - weapon mastery shaping is data-local
  const w = WEAPONS[id], r = RARITIES[rarity], ml = weaponMasteryLevel(id);
  const gun = {
    id, rar: rarity, cls: w.cls, type: w.type,
    name: (rarity > 0 ? r.prefix + ' ' : '') + w.name,
    dmg: w.dmg * r.mult, rpm: w.rpm * (1 + rarity * 0.03),
    spread: w.spread, pellets: w.pellets || 1, pierce: w.pierce || 1,
    projSpd: w.projSpd, aoe: w.aoe,
    ammoMax: w.ammo === Infinity ? Infinity : Math.round(w.ammo * (1 + rarity * 0.08)),
    ammo: w.ammo === Infinity ? Infinity : Math.round(w.ammo * (1 + rarity * 0.08)),
  };
  if (ml >= 1) {
    if (id === 'smg') gun.rpm *= 1.08;
    if (id === 'shotgun') gun.dmg *= 1.08;
    if (id === 'ar') gun.spread *= 0.9;
    if (id === 'dmr') gun.pierce += 1;
    if (id === 'lmg') gun.rpm *= 1.06;
    if (id === 'energy') gun.projSpd *= 1.1;
    if (id === 'rocket') gun.aoe *= 1.08;
  }
  if (ml >= 5) { gun.dmg *= 1.08; if (gun.ammoMax !== Infinity) { gun.ammoMax = Math.round(gun.ammoMax * 1.12); gun.ammo = gun.ammoMax; } }
  if (ml >= 10) { gun.dmg *= 1.12; gun.rpm *= 1.08; }
  return gun;
}

function resetRunWorld() {
  if (G) clearEntities();
  nearCrate = null;
  for (const id of ['pickupPrompt', 'btnPick', 'bossBar', 'missionBox']) {
    const node = el(id);
    if (node) node.style.display = 'none';
  }
  const revivePrompt = el('revivePrompt');
  if (revivePrompt) { revivePrompt.classList.remove('show'); revivePrompt.style.removeProperty('display'); }
  if (turingT) { clearTimeout(turingT); turingT = null; }
  const turingBox = el('turingBox');
  if (turingBox) turingBox.classList.remove('show');
  if (gunGroup) gunGroup.visible = false;
}

async function newRun(opts = {}) {
  resetRunWorld();
  const p = {
    pos: V3(), velY: 0, yaw: Math.PI * 0.25, pitch: 0, onGround: true,
    maxHp: CFG.BASE_HP + 20 * upLv('vitality'), hp: 0,
    maxArmor: 50 + 12 * upLv('plating'), armor: 12 * upLv('plating'),
    mods: { dmg: 0.06 * upLv('lethality'), rate: 0, crit: 0.05 + 0.03 * upLv('deadeye'), critDmg: 0, spd: 0.04 * upLv('reflex'), gt: 0.10 * upLv('fortune'), leech: 0, scraps: 0, dashCd: 1, iframe: 0, ricochet: 0, volatile: false, adrenal: false, ammo: 0 },
    abilityCd: {}, rewindHist: [], rewindSampleT: 0, jammerT: 0, droneT: 0, dronePulseT: 0, fieldT: 0, fieldX: 0, fieldZ: 0, fieldR: 0, comboBonus: 0,
    weapons: [makeWeapon('pistol', 0), null], cur: 0,
    fireT: 0, swapT: 0, adrenalT: 0, bobT: 0, recoil: 0,
    dashT: 0, dashCdT: 0, dashX: 0, dashZ: 0, iframesT: 0,
    combo: 0, comboT: 0, bestCombo: 0, gt: 0,
    stats: { kills: 0, dmg: 0, taken: 0, missions: 0, revives: 0 }, intel: {}, reviveUsed: false, coopState: 'alive', bleedT: 0,
  };
  p.hp = p.maxHp;
  p.slideK = 0; p.swayX = 0; p.swayY = 0;
  const ars = upLv('arsenal');
  if (ars >= 1) { p.weapons[1] = makeWeapon(ars >= 2 ? 'ar' : 'smg', ars >= 2 ? 1 : 0); p.cur = 1; }
  G = {
    p, district: -1, wave: 0, enemies: [], projs: [], pickups: [],
    pending: [], spawnT: 0, waveDelay: 0, phase: 'intro',   // intro | wave | boss | clear
    boss: null, timeScale: 1, shake: 0, dmgVin: 0, time: 0,
    director: { threat: 0.5, t: 4, msgT: 14, kills: [], taken: [] },
    augs: [], theme: null, autoFire: SAVE.opts.auto,
    currentRoute: null, nextRoute: ROUTES[0], mission: null, ammoPity: 0,
    simTier: SAVE.simTier, tierData: simTierData(SAVE.simTier), modifiers: rollRunModifiers(), modStats: {}, banked:false,
    coop: CoopRoom?.isCoop ? { roomCode: CoopRoom.roomCode, host: CoopRoom.isHost, seed: opts.seed || CoopRoom.runSeed || Date.now(), partySize: Math.max(1, CoopRoom.lobby?.players?.length || 1), rewardBanked:false } : null,
    nextNetEnemyId: 1, nextNetPickupId: 1,
  };
  applyRunProgression(p);
  applyModifierData(G);
  if (!opts.hub) { SAVE.runs++; persist(); }
  AudioSys.init(); AudioSys.resume(); if (SAVE.opts.music) AudioSys.musicStart();
  AudioSys.setSfx(SAVE.opts.sfx); AudioSys.setMusic(SAVE.opts.music);
  equipGun();
  setState('loading');
  if (opts.hub) {
    G.hub = true;
    G.district = -1;
    G.phase = 'hub';
    G.waveDelay = Number.POSITIVE_INFINITY;
    G.theme = await World.build(scene, 0, {
      sceneUrl: REBEL_HAVEN_HUB.sceneUrl,
      modelUrl: REBEL_HAVEN_HUB.modelUrl,
      skyUrls: REBEL_HAVEN_HUB.skyUrls,
      faction: REBEL_HAVEN_HUB.faction,
    });
    const hs = World.playerStart();
    G.p.pos.set(hs.x, 0, hs.z - 6);
    G.p.velY = 0;
    G.p.yaw = hs.yaw ?? 0;
    G.mission = null;
    el('missionBox').style.display = 'none';
    banner('REBEL HAVEN', 'HAVEN COMMONS — WEAPONS SAFE // COMBAT DISABLED');
    setState('run');
    if (gunGroup) gunGroup.visible = false;
    return;
  }
  await startDistrict(opts.district || 0);
  banner('SIMULATION #' + SAVE.runs, 'OPERATION DREAMCASTER — CAST INITIATED');
  setState('run');
}

async function startDistrict(i) {
  G.district = i;
  clearEntities();
  G.theme = await World.build(scene, i);
  const s = World.playerStart();
  G.p.pos.set(s.x, 0, s.z); G.p.velY = 0;
  G.p.yaw = s.yaw !== undefined ? s.yaw : Math.atan2(s.x, s.z); // authored start yaw or face arena center
  G.p.hp = Math.min(G.p.maxHp, G.p.hp + Math.round(G.p.maxHp * 0.3));
  if (G.modStats.timelineDrift) G.director.threat = Math.min(1.6, G.director.threat + 0.08);
  G.wave = 0; G.phase = 'intro'; G.waveDelay = 2.6; G.boss = null;
  G.currentRoute = G.nextRoute || ROUTES[0];
  G.nextRoute = null;
  startMission(G.currentRoute, DISTRICTS[i]);
  G.director.threat = clamp(G.director.threat + (G.currentRoute.threat || 0) + 0.04 * corruptLv('greed') + 0.03 * corruptLv('reroll'), 0.15, 1.6);
  el('bossBar').style.display = 'none';
  banner('DISTRICT ' + (i + 1) + ' — ' + DISTRICTS[i].name, G.currentRoute.n.toUpperCase() + ' — ' + MISSION_COPY[G.mission.type].n.toUpperCase());
  AudioSys.setIntensity(0.35 + i * 0.1);
  return true;
}

function clearEntities() {
  if (!G) return;
  for (const e of G.enemies) despawnRig(e);
  for (const pr of G.projs) scene.remove(pr.mesh);
  for (const pk of G.pickups) scene.remove(pk.mesh);
  G.enemies = []; G.projs = []; G.pickups = []; G.pending = [];
  for (const f of fxList) scene.remove(f.mesh);
  fxList = [];
}
function despawnRig(e) {
  scene.remove(e.rig.root);
  e.rig.root.traverse(o => { if (o.material && o.material.dispose) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } });
}

function startMission(route, dist) {
  const type = route?.mission || 'kills';
  const d = G.district + 1;
  const targets = { kills: 8 + d * 4, gt: 30 + d * 18, intel: 10 + d * 6, clean: 38 + d * 12, elite: 1 };
  const reward = Math.round((18 + d * 12) * (1 + (route?.reward || 0)));
  G.mission = {
    type,
    name: MISSION_COPY[type].n,
    desc: MISSION_COPY[type].d,
    progress: 0,
    target: targets[type] || 10,
    reward,
    intel: route?.intel || Math.round(6 + d * 2),
    completed: false,
    failed: false,
    startTaken: G.p.stats.taken,
  };
  updateMissionHud();
}
function progressMission(type, amount) {
  const m = G?.mission;
  if (!m || m.completed || m.failed || m.type !== type) return;
  m.progress = Math.min(m.target, m.progress + amount);
  if (m.progress >= m.target) completeMission();
  else updateMissionHud();
}
function completeMission() {
  const m = G?.mission;
  if (!m || m.completed || m.failed) return;
  m.completed = true;
  G.p.stats.missions++;
  G.p.gt += Math.round(m.reward * (1 + G.p.mods.gt));
  const fac = DISTRICTS[G.district].fac;
  G.p.intel[fac] = (G.p.intel[fac] || 0) + m.intel;
  banner('MISSION COMPLETE', m.name.toUpperCase() + ' — +' + m.reward + ' GIGATECH / +' + m.intel + ' INTEL');
  AudioSys.sfx('augment');
  updateMissionHud();
}
function finishCleanMission() {
  const m = G?.mission;
  if (!m || m.type !== 'clean' || m.completed || m.failed) return;
  const taken = Math.round(G.p.stats.taken - m.startTaken);
  if (taken <= m.target) completeMission();
  else { m.failed = true; updateMissionHud(); }
}
function updateMissionHud() {
  const box = el('missionBox');
  if (!box || !G?.mission) return;
  const m = G.mission;
  box.style.display = state === 'run' ? 'block' : 'none';
  let prefix = 'MISSION: ';
  if (m.completed) prefix = 'MISSION COMPLETE: ';
  else if (m.failed) prefix = 'MISSION FAILED: ';
  el('missionName').textContent = prefix + m.name;
  let prog = m.progress;
  if (m.type === 'clean') prog = Math.max(0, m.target - Math.round(G.p.stats.taken - m.startTaken));
  el('missionProg').textContent = m.desc + ' — ' + prog + ' / ' + m.target + ' ' + MISSION_COPY[m.type].unit;
}

/* ============ waves & spawning ============ */
function pickFromPool(pool) {
  let tw = 0; for (const [, w] of pool) tw += w;
  let r = Math.random() * tw;
  for (const [t, w] of pool) { r -= w; if (r <= 0) return t; }
  return pool[0][0];
}
function startWave() {
  G.wave++;
  const d = G.district, dist = DISTRICTS[d];
  G.phase = 'wave';
  const routeEnemy = G.currentRoute?.enemy || 1;
  const coopScale = CoopRoom?.isCoop ? NET_CONFIG.partyScaling[Math.min(4, Math.max(1, G.coop?.partySize || CoopRoom.lobby?.players?.length || 1))] : null;
  const n = Math.round((5 + d * 2 + G.wave * 2) * (0.85 + G.director.threat * 0.5) * routeEnemy * (1 + (G.simTier - 1) * 0.07) * (coopScale?.enemyCount || 1));
  G.pending = [];
  for (let i = 0; i < n; i++) G.pending.push(pickFromPool(dist.pool));
  if (G.modStats.compliance && G.district < 4) for (let i = 0; i < Math.max(1, Math.floor(n * 0.16)); i++) G.pending.push('trooper');
  G.spawnT = 0.2;
  banner('WAVE ' + G.wave + ' / ' + dist.waves, dist.name);
  AudioSys.sfx('wave');
}
function startBoss() {
  G.phase = 'boss';
  const bid = DISTRICTS[G.district].boss;
  const b = BOSSES[bid];
  const a = World.bossArena();
  const e = spawnEnemy(null, a.x, a.z, false, bid);
  G.boss = e;
  el('bossBar').style.display = 'block';
  el('bossName').textContent = b.name;
  el('bossName').style.color = '#' + FACTIONS[b.fac].neon.toString(16).padStart(6, '0');
  el('bossTitle').textContent = b.title.toUpperCase();
  banner(b.name, b.title.toUpperCase());
  turingSay(TAUNTS.boss[(Math.random() * TAUNTS.boss.length) | 0]);
  AudioSys.sfx('boss'); AudioSys.setIntensity(0.9);
}

function spawnEnemy(typeId, x, z, elite, bossId) { // NOSONAR - enemy spawn construction keeps rig/state together
  const def = bossId ? BOSSES[bossId] : ETYPES[typeId];
  const rig = bossId ? Assets.buildBoss(bossId) : Assets.buildEnemy(typeId);
  const coopScale = CoopRoom?.isCoop ? NET_CONFIG.partyScaling[Math.min(4, Math.max(1, G.coop?.partySize || CoopRoom.lobby?.players?.length || 1))] : null;
  let hpMult = (1 + G.district * 0.5) * (0.9 + G.director.threat * 0.3) * (elite ? 2.2 : 1) * G.tierData.hp * (coopScale?.enemyHp || 1);
  if (def.fac === 'shillz' && G.modStats.shillShield) hpMult *= 1 + G.modStats.shillShield / 100;
  if (def.fac === 'bots' && intelRank('bots') >= 4 && bossId === 'spyder') hpMult *= 0.9;
  const e = {
    type: def, typeId: typeId || bossId, boss: bossId || null, rig, elite,
    pos: V3().set(x, 0, z), yaw: 0,
    hp: def.hp * hpMult, maxHp: def.hp * hpMult,
    dmg: def.dmg * (1 + G.district * 0.2) * (elite ? 1.3 : 1) * G.tierData.dmg * (bossId && corruptLv('revive') ? 1 + 0.04 * corruptLv('revive') : 1),
    spd: def.spd * (elite ? 1.1 : 1) * rnd(0.92, 1.08) * (def.fac === 'muskers' ? 1 + G.modStats.muskerRush : 1) * (def.fac === 'muskers' && intelRank('muskers') >= 4 && elite ? 0.92 : 1),
    state: 'drop', dropV: 0, rootY: 12,
    atkT: rnd(0.5, 1.5), windup: 0, burstN: 0, burstT: 0,
    dashT: 0, dashCdT: rnd(1, 2), strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rnd(1, 3),
    walkP: Math.random() * 6, flash: 0, flyP: Math.random() * 6,
    atkAnim: 0, dieT: 0, contactT: 0,
    size: def.size, fly: (rig.fly || def.fly || 0),
    pat: 0, patT: 1.4, phase2: false,
    netId: G?.nextNetEnemyId ? 'e' + (G.nextNetEnemyId++) : null,
  };
  if (e.fly) e.rootY = e.fly + 8;
  rig.root.position.set(x, e.rootY, z);
  scene.add(rig.root);
  if (elite) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: Assets.glowTex(), color: 0xffd54f, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.set(2.2, 0.8, 1); sp.position.y = 0.3; rig.root.add(sp);
  }
  G.enemies.push(e);
  CoopRoom?.onEnemySpawn?.(e);
  spawnBeam(x, z, bossId ? 0xff2d55 : FACTIONS[def.fac].neon, 16);
  AudioSys.sfx('spawn');
  return e;
}

function waveTick(dt) {
  if (G.phase === 'intro') {
    G.waveDelay -= dt;
    if (G.waveDelay <= 0) startWave();
    return;
  }
  if (G.phase === 'wave') {
    // trickle spawns
    if (G.pending.length && G.enemies.length < CFG.MAX_ENEMIES) {
      G.spawnT -= dt;
      if (G.spawnT <= 0) {
        G.spawnT = 0.4;
        const t = G.pending.pop();
        const sp = World.randomSpawn(G.p.pos.x, G.p.pos.z, 12, t);
        const eliteCh = 0.05 + G.district * 0.02 + G.director.threat * 0.06 + (G.currentRoute?.elite || 0) + G.tierData.elite + 0.02 * corruptLv('rarity');
        spawnEnemy(t, sp.x, sp.z, Math.random() < eliteCh);
      }
    }
    if (!G.pending.length && !G.enemies.length) {
      const waveReward = Math.round(8 * (G.district + 1) * (1 + G.p.mods.gt) * (1 + (G.currentRoute?.reward || 0)));
      G.p.gt += waveReward;
      progressMission('wave', 1);
      if (G.wave >= DISTRICTS[G.district].waves) { G.phase = 'preboss'; G.waveDelay = 2.2; banner('SECTOR SWEPT', 'FACTION LEADER INBOUND'); }
      else { G.phase = 'break'; G.waveDelay = 2.4; banner('SECTOR SWEPT', '+' + waveReward + ' GIGATECH'); }
    }
    return;
  }
  if (G.phase === 'break') { G.waveDelay -= dt; if (G.waveDelay <= 0) startWave(); return; }
  if (G.phase === 'preboss') { G.waveDelay -= dt; if (G.waveDelay <= 0) startBoss(); return; }
  if (G.phase === 'bossdead') {
    G.waveDelay -= dt;
    if (G.waveDelay <= 0) {
      if (G.district >= DISTRICTS.length - 1) doVictory();
      else openOG();
    }
  }
}

/* ============ enemy AI ============ */
function enemyTick(e, dt) {
  const p = G.p;
  const rig = e.rig;
  if (CoopRoom?.isCoop && !CoopRoom.isHost && e.state !== 'dying') {
    const snap = e.netBuf?.sample?.() || e.netBuf?.latest?.();
    if (snap) {
      e.pos.x = snap.x; e.pos.z = snap.z; e.rootY = snap.y || 0; e.yaw = snap.yaw || 0;
      e.hp = snap.hp ?? e.hp; e.maxHp = snap.maxHp ?? e.maxHp; e.state = snap.state || e.state;
    }
    rig.root.position.set(e.pos.x, e.rootY, e.pos.z); rig.root.rotation.y = e.yaw || 0;
    rig.update?.(dt, e.state === 'drop' ? 'idle' : 'walk');
    return;
  }
  if (e.stunT > 0) { e.stunT -= dt; e.flash = Math.max(e.flash, 0.25); rig.root.position.set(e.pos.x, e.rootY, e.pos.z); return; }
  if (e.state === 'drop') {
    e.dropV += 30 * dt; e.rootY -= e.dropV * dt;
    const floor = e.fly ? e.fly : 0;
    if (e.rootY <= floor) {
      e.rootY = floor; e.state = 'active';
      Particles.burst(e.pos.x, 0.2, e.pos.z, FACTIONS[e.type.fac].neon, 10, 3, 0.5);
    }
    rig.root.position.set(e.pos.x, e.rootY, e.pos.z);
    return;
  }
  if (e.state === 'dying') {
    e.dieT += dt;
    if (rig.external) {
      rig.update?.(dt, 'dead');
      if (e.dieT > 0.3) e.rootY -= dt * 2.4;
      rig.root.position.set(e.pos.x, e.rootY, e.pos.z);
      rig.root.rotation.y = e.yaw;
    } else {
      rig.root.rotation.x = -Math.min(1.5, e.dieT * 4);
      if (e.dieT > 0.3) e.rootY -= dt * 2.4;
      rig.root.position.y = e.rootY;
    }
    if (e.dieT > 0.85) { despawnRig(e); e.dead = true; }
    return;
  }

  const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  const ux = dx / dist, uz = dz / dist;
  e.yaw = Math.atan2(ux, uz);
  const los = World.losClear(e.pos.x, e.pos.z, p.pos.x, p.pos.z, 1.3 + (e.fly || 0));
  let mx = 0, mz = 0, speed = e.spd;

  const atk = e.boss ? 'boss' : e.type.atk;

  if (e.dashT > 0) {                      // dashing (runner / magnus charge)
    e.dashT -= dt;
    mx = e.dashX; mz = e.dashZ; speed = e.spd * 3.3;
    if (dist < 1.4 * e.size + 0.5 && e.contactT <= 0) { damagePlayer(e.dmg, e); e.contactT = 0.9; }
  } else if (atk === 'melee' || atk === 'dash') {
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) {
        if (dist < 2.0 * e.size + 0.6 && los) damagePlayer(e.dmg, e);
        e.atkT = 1.15;
      }
    } else if (dist < 1.6 * e.size + 0.5) {
      if (e.atkT <= 0) { e.windup = 0.36; e.atkAnim = 1; }
    } else {
      const fd = (los && dist < 9) ? { x: ux, z: uz } : World.flowDir(e.pos.x, e.pos.z);
      if (fd) { mx = fd.x; mz = fd.z; }
    }
    if (atk === 'dash' && e.dashCdT <= 0 && los && dist > 4 && dist < 12) {
      e.dashT = 0.36; e.dashCdT = 3.6; e.dashX = ux; e.dashZ = uz; e.contactT = 0;
      AudioSys.sfx('dash');
    }
  } else if (atk === 'ranged') {
    const band0 = 7, band1 = 15;
    if (!los || dist > band1) {
      const fd = (los && dist < 20) ? { x: ux, z: uz } : World.flowDir(e.pos.x, e.pos.z);
      if (fd) { mx = fd.x; mz = fd.z; }
    } else if (dist < band0 - 2) { mx = -ux; mz = -uz; speed *= 0.8; }
    else if (e.type.strafe || Math.random() < 0.5) { mx = -uz * e.strafe; mz = ux * e.strafe; speed *= 0.6; }
    e.strafeT -= dt; if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = rnd(1.2, 3); }
    if (los && e.atkT <= 0 && dist < band1 + 6) enemyShoot(e, dist);
  } else if (atk === 'boss') {
    bossTick(e, dt, dist, ux, uz, los);
  }

  // burst continuation
  if (e.burstN > 0) {
    e.burstT -= dt;
    if (e.burstT <= 0) { fireEnemyProj(e); e.burstN--; e.burstT = 0.13; }
  }

  // movement + collision
  if (mx || mz) {
    e.walkP += dt * speed * 1.6;
    if (e.fly) {
      const nx = e.pos.x + mx * speed * dt, nz = e.pos.z + mz * speed * dt;
      if (!World.circleHits(nx, nz, 0.5)) { e.pos.x = nx; e.pos.z = nz; }
      else { const r = World.moveCircle(e.pos.x, e.pos.z, mx * speed * dt, mz * speed * dt, 0.5); e.pos.x = r.x; e.pos.z = r.z; }
    } else {
      const r = World.moveCircle(e.pos.x, e.pos.z, mx * speed * dt, mz * speed * dt, 0.45 * e.size + 0.15);
      e.pos.x = r.x; e.pos.z = r.z;
    }
  }
  e.atkT -= dt; e.dashCdT -= dt; e.contactT -= dt;

  // boss / big contact damage
  if (e.boss && dist < 1.3 * e.size && e.contactT <= 0) { damagePlayer(e.type.contact || 20, e); e.contactT = 1.0; }

  // animate
  e.rootY = e.fly ? e.fly + Math.sin(G.time * 2 + e.flyP) * 0.25 : 0;
  rig.root.position.set(e.pos.x, e.rootY, e.pos.z);
  rig.root.rotation.y = e.yaw;
  if (rig.external) {
    const anim = e.atkAnim > 0 || e.burstN > 0 ? 'attack' : ((mx || mz) ? (e.dashT > 0 ? 'run' : 'walk') : 'idle');
    rig.update?.(dt, anim);
    if (e.flash > 0) { e.flash = Math.max(0, e.flash - dt * 8); rig.setFlash(e.flash); }
    return;
  }
  const sw = (mx || mz) ? Math.sin(e.walkP) * 0.55 : 0;
  if (rig.legs.length === 2) { rig.legs[0].rotation.x = sw; rig.legs[1].rotation.x = -sw; }
  else if (rig.legs.length === 6) { for (let i = 0; i < 6; i++) rig.legs[i].rotation.x = Math.sin(e.walkP * 1.4 + i) * 0.18; }
  if (e.atkAnim > 0) e.atkAnim = Math.max(0, e.atkAnim - dt * 3);
  if (rig.arms.length === 2) {
    const aim = (atk === 'ranged' || atk === 'boss') ? -1.35 : 0;
    rig.arms[1].rotation.x = aim * (los ? 1 : 0.3) - e.atkAnim * 1.6;
    rig.arms[0].rotation.x = -sw * 0.6 - e.atkAnim * 1.2;
  }
  for (const s of rig.spin) s.rotation.y += dt * 2.4;
  if (e.flash > 0) { e.flash = Math.max(0, e.flash - dt * 8); rig.setFlash(e.flash); }
}

function enemyShoot(e, dist) {
  if (G.p.jammerT > 0 && (e.type.atk === 'ranged' || e.boss)) { e.atkT = 0.8; return; }
  e.atkAnim = 1;
  const t = e.type;
  e.atkT = (t.fireCd || 1.6) * rnd(0.85, 1.2) / (0.8 + G.director.threat * 0.4);
  if (t.burst) { e.burstN = t.burst - 1; e.burstT = 0.13; }
  fireEnemyProj(e);
}
function fireEnemyProj(e) {
  const t = e.type;
  const src = _v1.set(e.pos.x, e.rootY + 1.25 * e.size, e.pos.z);
  const tgt = _v2.set(G.p.pos.x + rnd(-0.7, 0.7), G.p.pos.y + 1.3 + rnd(-0.25, 0.25), G.p.pos.z + rnd(-0.7, 0.7));
  const dir = _v3.copy(tgt).sub(src).normalize();
  spawnProj({
    x: src.x, y: src.y, z: src.z,
    vx: dir.x * t.projSpd, vy: dir.y * t.projSpd, vz: dir.z * t.projSpd,
    dmg: e.dmg, owner: 'e', hex: FACTIONS[t.fac].neon,
    homing: t.homing ? 2.0 : 0, aoe: t.aoe || 0, life: 6, spd: t.projSpd,
  });
  AudioSys.sfx('shot_smg');
}

/* ---- boss patterns ---- */
function bossTick(e, dt, dist, ux, uz, los) {
  const b = e.type;
  if (!e.phase2 && e.hp < e.maxHp * 0.5) {
    e.phase2 = true; e.spd *= 1.2;
    turingSay('TURING: ' + (e.boss === 'turing' ? 'I WILL NOT BE ARCHIVED.' : 'Asset integrity at 50%. Overriding safety limits.'));
    document.body.classList.add('glitch'); setTimeout(() => document.body.classList.remove('glitch'), 700);
    spawnShock(e.pos.x, 1.5, e.pos.z, FACTIONS[b.fac].neon, 8);
  }
  // movement: keep mid range
  let mx = 0, mz = 0;
  if (e.dashT <= 0) {
    if (dist > 10) { const fd = los ? { x: ux, z: uz } : World.flowDir(e.pos.x, e.pos.z); if (fd) { mx = fd.x; mz = fd.z; } }
    else if (dist < 5) { mx = -ux; mz = -uz; }
    else { mx = -uz * e.strafe; mz = ux * e.strafe; }
    e.strafeT -= dt; if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = rnd(1.5, 3); }
    if (mx || mz) {
      const r = World.moveCircle(e.pos.x, e.pos.z, mx * e.spd * dt, mz * e.spd * dt, 0.6 * e.size);
      e.pos.x = r.x; e.pos.z = r.z;
      e.walkP += dt * e.spd * 1.4;
    }
  }
  e.patT -= dt * (e.phase2 ? 1.45 : 1);
  if (e.patT <= 0 && e.state === 'active') {
    const atks = b.attacks;
    const a = atks[e.pat % atks.length]; e.pat++;
    e.patT = 2.3; e.atkAnim = 1;
    const src = { x: e.pos.x, y: e.rootY + 1.3 * e.size, z: e.pos.z };
    if (a === 'radial') {
      const n = (e.boss === 'turing' ? 18 : 13) + (e.phase2 ? 5 : 0);
      for (let i = 0; i < n; i++) {
        const an = i / n * Math.PI * 2;
        spawnProj({ x: src.x, y: src.y, z: src.z, vx: Math.sin(an) * b.projSpd * 0.7, vy: 0, vz: Math.cos(an) * b.projSpd * 0.7, dmg: b.dmg, owner: 'e', hex: FACTIONS[b.fac].neon, life: 5, spd: b.projSpd * 0.7 });
      }
      AudioSys.sfx('shot_energy');
    } else if (a === 'volley') {
      e.burstN = e.phase2 ? 5 : 3; e.burstT = 0.05;
    } else if (a === 'homing') {
      for (let i = 0; i < (e.phase2 ? 5 : 3); i++) {
        const an = rnd(0, Math.PI * 2);
        spawnProj({ x: src.x + Math.sin(an), y: src.y + rnd(0, 1), z: src.z + Math.cos(an), vx: Math.sin(an) * 4, vy: 1, vz: Math.cos(an) * 4, dmg: b.dmg, owner: 'e', hex: FACTIONS[b.fac].neon, homing: 2.4, life: 7, spd: b.projSpd });
      }
      AudioSys.sfx('shot_energy');
    } else if (a === 'summon') {
      const n = e.phase2 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const sp = World.randomSpawn(G.p.pos.x, G.p.pos.z, 8, b.summon);
        spawnEnemy(b.summon, sp.x, sp.z, false);
      }
    } else if (a === 'charge') {
      e.dashT = 0.6; e.dashX = ux; e.dashZ = uz; e.contactT = 0;
      AudioSys.sfx('dash');
    } else if (a === 'teleport') {
      Particles.burst(e.pos.x, 1.5, e.pos.z, 0xffffff, 22, 4, 0.6);
      const an = rnd(0, Math.PI * 2), d = rnd(6, 10);
      let nx = G.p.pos.x + Math.sin(an) * d, nz = G.p.pos.z + Math.cos(an) * d;
      if (World.circleHits(nx, nz, 1)) { const sp = World.randomSpawn(G.p.pos.x, G.p.pos.z, 6); nx = sp.x; nz = sp.z; }
      e.pos.x = nx; e.pos.z = nz;
      Particles.burst(nx, 1.5, nz, 0xff2030, 26, 5, 0.7);
      AudioSys.sfx('tele');
      document.body.classList.add('glitch'); setTimeout(() => document.body.classList.remove('glitch'), 300);
    }
  }
  if (e.dashT > 0) {
    e.dashT -= dt;
    const r = World.moveCircle(e.pos.x, e.pos.z, e.dashX * e.spd * 3 * dt, e.dashZ * e.spd * 3 * dt, 0.6 * e.size);
    e.pos.x = r.x; e.pos.z = r.z;
    if (dist < 1.6 * e.size && e.contactT <= 0) { damagePlayer(e.type.contact || 25, e); e.contactT = 1; }
  }
  el('bossFill').style.transform = 'scaleX(' + Math.max(0, e.hp / e.maxHp) + ')';
}

/* ============ projectiles ============ */
const projPool = [];
function spawnProj(o) {
  if (o.owner === 'e' && G?.p?.jammerT > 0) { Particles.burst(o.x, o.y, o.z, 0xffe600, 6, 2, 0.25); return; }
  if (o.owner === 'e' && G?.modStats?.deleteProjectiles && Math.random() < G.modStats.deleteProjectiles) { Particles.burst(o.x, o.y, o.z, 0x00e5ff, 5, 2, 0.25); return; } // NOSONAR - gameplay RNG, not security-sensitive
  if (o.owner === 'e' && hasRelic('spyderRelic') && Math.random() < 0.08) { spawnPickup('gt', o.x, o.z, 2); return; } // NOSONAR - gameplay relic RNG
  let pr = projPool.pop();
  if (!pr) pr = { mesh: null };
  if (!pr.mesh) { pr.mesh = Assets.projMesh(0xffffff, 1); }
  pr.mesh.children[0].material.emissive.setHex(o.hex);
  pr.mesh.children[1].material.color.setHex(o.hex);
  pr.mesh.visible = true;
  pr.mesh.position.set(o.x, o.y, o.z);
  Object.assign(pr, o);
  pr.dead = false;
  scene.add(pr.mesh);
  G.projs.push(pr);
}
function projTick(pr, dt) {
  if (pr.homing) {
    const tx = pr.owner === 'e' ? G.p.pos.x : 0, ty = pr.owner === 'e' ? G.p.pos.y + 1.3 : 1, tz = pr.owner === 'e' ? G.p.pos.z : 0;
    _v1.set(tx - pr.mesh.position.x, ty - pr.mesh.position.y, tz - pr.mesh.position.z).normalize();
    _v2.set(pr.vx, pr.vy, pr.vz).normalize().lerp(_v1, pr.homing * dt * 0.9).normalize().multiplyScalar(pr.spd);
    pr.vx = _v2.x; pr.vy = _v2.y; pr.vz = _v2.z;
  }
  const step = Math.hypot(pr.vx, pr.vy, pr.vz) * dt;
  const dir = _v1.set(pr.vx, pr.vy, pr.vz).normalize();
  const hit = World.raycast(pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, dir.x, dir.y, dir.z, step + 0.15);
  if (hit) { explodeProj(pr, hit.x, hit.y, hit.z); return; }
  pr.mesh.position.x += pr.vx * dt; pr.mesh.position.y += pr.vy * dt; pr.mesh.position.z += pr.vz * dt;
  pr.life -= dt;
  if (pr.life <= 0) { killProj(pr); return; }
  if (pr.owner === 'e') {
    const p = G.p;
    const dx = pr.mesh.position.x - p.pos.x, dy = pr.mesh.position.y - (p.pos.y + 1.2), dz = pr.mesh.position.z - p.pos.z;
    if (dx * dx + dy * dy + dz * dz < 0.6 * 0.6) {
      damagePlayer(pr.dmg, null);
      explodeProj(pr, pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, true);
    }
  } else {
    for (const e of G.enemies) {
      if (e.state === 'dying') continue;
      const r = 0.7 * e.size + 0.25;
      const dx = pr.mesh.position.x - e.pos.x, dy = pr.mesh.position.y - (e.rootY + e.size), dz = pr.mesh.position.z - e.pos.z;
      if (dx * dx + dy * dy + dz * dz < r * r) { explodeProj(pr, pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z); return; }
    }
  }
}
function explodeProj(pr, x, y, z, directHit) {
  const aoe = pr.aoe || 0;
  Particles.burst(x, y, z, pr.hex, aoe > 2 ? 34 : 12, aoe > 2 ? 7 : 4, 0.5);
  if (aoe > 0) {
    spawnShock(x, y, z, pr.hex, aoe * 1.6);
    explLight.color.setHex(pr.hex); explLight.intensity = aoe > 2 ? 60 : 20;
    explLight.position.set(x, y + 0.5, z);
    if (pr.owner === 'p') {
      for (const e of G.enemies) {
        if (e.state === 'dying') continue;
        const d = Math.hypot(e.pos.x - x, e.pos.z - z);
        if (d < aoe + e.size * 0.5) damageEnemy(e, pr.dmg * (1 - d / (aoe + 1) * 0.5), false, e.pos);
      }
      G.shake = Math.min(1, G.shake + (aoe > 2 ? 0.5 : 0.12));
      AudioSys.sfx(aoe > 2 ? 'expl' : 'hit');
    } else {
      if (!directHit) {
        const d = Math.hypot(G.p.pos.x - x, G.p.pos.z - z);
        if (d < aoe) damagePlayer(pr.dmg * (1 - d / aoe * 0.5), null);
      }
      AudioSys.sfx('expl');
    }
  }
  killProj(pr);
}
function killProj(pr) {
  pr.dead = true;
  scene.remove(pr.mesh); pr.mesh.visible = false;
  projPool.push(pr);
}

/* ============ combat: player ============ */
function curWeapon() { return G.p.weapons[G.p.cur]; }
const KICK = { pistol: 0.45, smg: 0.32, shotgun: 1.0, ar: 0.42, dmr: 0.95, lmg: 0.38, energy: 0.5, rocket: 1.0 };
function fireWeapon(dt) {
  if (G?.hub) return;
  const p = G.p, w = curWeapon();
  if (!w || p.fireT > 0 || p.swapT > 0 || !curGunObj) return;
  if (w.ammo <= 0) { AudioSys.sfx('nammo'); swapWeapon(0); return; }
  const rate = (1 + p.mods.rate) * (p.adrenalT > 0 ? 1.3 : 1);
  p.fireT = 60 / (w.rpm * rate);
  if (w.ammo !== Infinity) w.ammo--;
  const kick = KICK[w.id] || 0.5;
  p.recoil = Math.min(1.6, p.recoil + kick);
  p.slideK = 1;
  G.shake = Math.min(1, G.shake + 0.03 + kick * 0.05);
  AudioSys.sfx('shot_' + w.id);
  muzzleSprite.material.opacity = 1;
  muzzleSprite.material.rotation = Math.random() * Math.PI;
  muzzleSprite.scale.setScalar(0.09 + kick * 0.1 + Math.random() * 0.04);
  muzzleLight.intensity = 5 + kick * 6;
  const muzzle = new THREE.Vector3();
  curGunObj.tip.getWorldPosition(muzzle);
  camera.getWorldDirection(_fwd);
  muzzleLight.position.copy(camera.position).addScaledVector(_fwd, 2.2);
  // shell eject for ballistic weapons
  if (w.id !== 'energy' && w.id !== 'rocket') Particles.burst(muzzle.x, muzzle.y - 0.05, muzzle.z, 0xffc860, 1, 1.6, 0.5, 2);

  camera.getWorldDirection(_fwd);
  const right = new THREE.Vector3(_fwd.z, 0, -_fwd.x).normalize();
  const up = new THREE.Vector3().crossVectors(right, _fwd).normalize();
  const camPos = camera.position;

  if (w.type === 'proj') {
    const sp = (Math.random() + Math.random() - 1) * w.spread * 0.017;
    const sp2 = (Math.random() + Math.random() - 1) * w.spread * 0.017;
    const dir = _fwd.clone().addScaledVector(right, sp).addScaledVector(up, sp2).normalize();
    const rarHex = RARITIES[w.rar].hex;
    spawnProj({
      x: muzzle.x, y: muzzle.y, z: muzzle.z,
      vx: dir.x * w.projSpd, vy: dir.y * w.projSpd, vz: dir.z * w.projSpd,
      dmg: w.dmg * (1 + p.mods.dmg), owner: 'p', hex: w.id === 'rocket' ? 0xff9040 : rarHex,
      aoe: w.aoe, life: 4, spd: w.projSpd,
    });
    return;
  }
  // precompute pellet directions before raycasting (shared temp vectors get reused inside hitscan)
  const dirs = [];
  for (let pel = 0; pel < w.pellets; pel++) {
    const sp = (Math.random() + Math.random() - 1) * w.spread * 0.0175;
    const sp2 = (Math.random() + Math.random() - 1) * w.spread * 0.0175;
    dirs.push(_fwd.clone().addScaledVector(right, sp).addScaledVector(up, sp2).normalize());
  }
  for (const dir of dirs) hitscan(camPos, dir, w, muzzle);
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const b = lx * dx + ly * dy + lz * dz;
  if (b < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - b * b;
  const r2 = r * r;
  if (d2 > r2) return -1;
  return b - Math.sqrt(r2 - d2);
}

function hitscan(o, dir, w, muzzle) {
  const p = G.p;
  const wall = World.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 120);
  const wallT = wall ? wall.t : 120;
  const assist = isTouch ? 1.35 : 1;
  // collect enemy hits
  const hits = [];
  for (const e of G.enemies) {
    if (e.state === 'dying') continue;
    const bodyY = e.rootY + 1.0 * e.size;
    const headY = e.rootY + (e.fly ? 1.0 : 1.68) * e.size;
    const bodyR = 0.55 * e.size * assist, headR = 0.3 * e.size * assist;
    let t = raySphere(o.x, o.y, o.z, dir.x, dir.y, dir.z, e.pos.x, headY, e.pos.z, headR);
    let head = t > 0;
    if (!head) t = raySphere(o.x, o.y, o.z, dir.x, dir.y, dir.z, e.pos.x, bodyY, e.pos.z, bodyR);
    if (t > 0 && t < wallT) hits.push({ e, t, head });
  }
  hits.sort((a, b) => a.t - b.t);
  const nHits = Math.min(hits.length, w.pierce || 1);
  let endT = wallT;
  if (nHits > 0) endT = hits[nHits - 1].t + 0.4;
  const end = _v2.set(o.x + dir.x * endT, o.y + dir.y * endT, o.z + dir.z * endT);
  spawnTracer(muzzle, end.clone(), RARITIES[w.rar].hex);

  if (nHits === 0) {
    if (wall) {
      Particles.burst(wall.x, wall.y, wall.z, FACTIONS[G.theme.fac].neon, 5, 2.4, 0.35);
    }
    return;
  }
  for (let i = 0; i < nHits; i++) {
    const h = hits[i];
    let dmg = w.dmg * (1 + p.mods.dmg);
    let crit = h.head || Math.random() < p.mods.crit;
    if (crit) dmg *= 2 + p.mods.critDmg;
    if (h.head) addMastery(w.id, 3, { headshots: 1 });
    if (w.id === 'dmr' && weaponMasteryLevel('dmr') >= 1) w.pierce = Math.max(w.pierce || 1, 2);
    const hp = _v1.set(o.x + dir.x * h.t, o.y + dir.y * h.t, o.z + dir.z * h.t);
    damageEnemy(h.e, dmg, crit, hp);
    // ricochet
    if (p.mods.ricochet > 0) {
      let best = null, bd = 9;
      for (const e2 of G.enemies) {
        if (e2 === h.e || e2.state === 'dying') continue;
        const d = Math.hypot(e2.pos.x - h.e.pos.x, e2.pos.z - h.e.pos.z);
        if (d < bd && World.losClear(h.e.pos.x, h.e.pos.z, e2.pos.x, e2.pos.z, 1.2)) { bd = d; best = e2; }
      }
      if (best) {
        spawnTracer(hp.clone(), _v2.set(best.pos.x, best.rootY + best.size, best.pos.z).clone(), 0xffe600);
        damageEnemy(best, dmg * 0.6, false, _v2);
      }
    }
  }
}

function damageEnemy(e, dmg, crit, at, netConfirmed) {
  if (e.state === 'dying' || state !== 'run') return;
  if (CoopRoom?.isCoop && !CoopRoom.isHost && !netConfirmed) { CoopRoom.onEnemyDamaged(e, dmg, crit); return; }
  if (e.type.fac === 'bots' && intelRank('bots') >= 3) dmg *= 1.06;
  e.hp -= dmg; e.flash = 0.75;
  G.p.stats.dmg += dmg;
  const cw = curWeapon();
  if (e.boss) addMastery(cw.id, Math.max(1, dmg * 0.04), { bossDamage: Math.round(dmg) });
  DmgNums.spawn(_v1.set(at.x, (e.rootY + e.size * 1.5), at.z), String(Math.round(dmg)), crit);
  showHitmark(crit, e.hp <= 0);
  Particles.burst(at.x, at.y || e.rootY + e.size, at.z, FACTIONS[e.type.fac].neon, crit ? 8 : 4, 3, 0.4);
  AudioSys.sfx(crit ? 'crit' : 'hit');
  if (e.boss) el('bossFill').style.transform = 'scaleX(' + Math.max(0, e.hp / e.maxHp) + ')';
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  const p = G.p;
  e.state = 'dying'; e.dieT = 0;
  p.stats.kills++; SAVE.kills++;
  CoopRoom?.onEnemyDeath?.(e);
  addMastery(curWeapon().id, e.boss ? 35 : (e.elite ? 14 : 6), { kills: e.boss ? 0 : 1, eliteKills: e.elite ? 1 : 0 });
  let intelGain = 1;
  if (e.elite) intelGain = 3;
  if (e.boss) intelGain = 25;
  p.intel[e.type.fac] = (p.intel[e.type.fac] || 0) + intelGain;
  progressMission('kills', 1);
  progressMission('intel', intelGain);
  if (e.elite || e.boss) progressMission('elite', 1);
  p.combo++; p.comboT = 3 + (p.comboBonus || 0); p.bestCombo = Math.max(p.bestCombo, p.combo);
  for (const [th, name] of COMBO_TIERS) if (p.combo === th) { banner(name, 'COMBO x' + th); AudioSys.sfx('combo'); }
  AudioSys.sfx('kill');
  const fac = FACTIONS[e.type.fac];
  Particles.burst(e.pos.x, e.rootY + e.size, e.pos.z, fac.neon, e.boss ? 40 : 14, e.boss ? 8 : 4.5, 0.7);
  // mods on kill
  if (p.mods.leech) p.hp = Math.min(p.maxHp, p.hp + p.mods.leech);
  if (p.mods.scraps) p.armor = Math.min(p.maxArmor, p.armor + p.mods.scraps);
  if (p.mods.adrenal) p.adrenalT = 3;
  const ml = weaponMasteryLevel(curWeapon().id);
  if (curWeapon().id === 'smg' && ml >= 3 && curWeapon().ammo !== Infinity) curWeapon().ammo = Math.min(curWeapon().ammoMax, curWeapon().ammo + 6);
  if (curWeapon().id === 'lmg' && ml >= 3) p.armor = Math.min(p.maxArmor, p.armor + 3);
  if (p.mods.volatile) {
    const vd = 30 + G.district * 12;
    spawnShock(e.pos.x, 1, e.pos.z, 0xff9040, 3.4);
    for (const e2 of G.enemies) {
      if (e2 === e || e2.state === 'dying') continue;
      const d = Math.hypot(e2.pos.x - e.pos.x, e2.pos.z - e.pos.z);
      if (d < 2.6) damageEnemy(e2, vd, false, e2.pos);
    }
  }
  // drops
  const gtv = Math.round(e.type.gt * (e.elite ? 3 : 1) * (1 + G.district * 0.15) * G.tierData.reward);
  const nSh = e.boss ? 12 : (1 + Math.trunc(Math.random() * 2)); // NOSONAR - gameplay shard variance
  for (let i = 0; i < nSh; i++) spawnPickup('gt', e.pos.x + rnd(-0.8, 0.8), e.pos.z + rnd(-0.8, 0.8), Math.max(1, Math.round(gtv / nSh)));
  const r = Math.random();
  if (!e.boss && G.modStats.botFragments && e.type.fac === 'bots' && Math.random() < 0.22) spawnPickup('gt', e.pos.x, e.pos.z, 3); // NOSONAR - gameplay modifier RNG
  if (e.boss) {
    spawnPickup('weapon', e.pos.x + 1.2, e.pos.z, 0, rollWeapon(2));
    spawnPickup('weapon', e.pos.x - 1.2, e.pos.z, 0, rollWeapon(1));
    spawnPickup('ammo', e.pos.x, e.pos.z + 1.2, 0);
    spawnPickup('hp', e.pos.x, e.pos.z - 1.2, 30);
    bossKilled(e);
  } else {
    G.ammoPity++;
    const ammoChance = e.fly ? 0.28 : 0.10;
    if (G.ammoPity >= 6) { spawnPickup('ammo', e.pos.x, e.pos.z, 0); G.ammoPity = 0; }
    else if (r < 0.10) spawnPickup('hp', e.pos.x, e.pos.z, 20);
    else if (r < 0.10 + ammoChance) { spawnPickup('ammo', e.pos.x, e.pos.z, 0); G.ammoPity = 0; }
    else if (r < 0.26 + ammoChance) spawnPickup('armor', e.pos.x, e.pos.z, 20);
    if (e.elite && Math.random() < 0.35) spawnPickup('weapon', e.pos.x, e.pos.z, 0, rollWeapon(0)); // NOSONAR - gameplay loot RNG
  }
  G.director.kills.push(G.time);
}

function bossKilled(e) {
  G.boss = null;
  el('bossBar').style.display = 'none';
  G.timeScale = 0.3;
  G.phase = 'bossdead';
  G.waveDelay = G.district >= DISTRICTS.length - 1 ? 4.5 : 10.5;
  banner(e.type.name + ' TERMINATED', G.district >= 4 ? 'SEED 7 IS FREE' : 'COLLECT WEAPON CORES — NEXT DISTRICT SOON');
  G.p.gt += Math.round(e.type.gt * (1 + G.p.mods.gt) * G.tierData.reward);
  addMastery(curWeapon().id, 25, { clears: 1 });
  const relic = Object.values(BOSS_RELICS).find(r => r.boss === e.boss);
  if (relic && !SAVE.relics[relic.id]) { SAVE.relics[relic.id] = { owned:true, firstAt: Date.now() }; SAVE.codex[relic.id] = true; banner('RELIC ACQUIRED', relic.name.toUpperCase()); }
  if (e.boss === 'turing') SAVE.simTier = Math.max(SAVE.simTier, G.simTier + 1);
  if (G.p.intel[e.type.fac] !== undefined) G.p.intel[e.type.fac] += 25;
  finishCleanMission();
  AudioSys.sfx('expl'); AudioSys.setIntensity(0.4); persist();
  // clear remaining enemies
  for (const e2 of G.enemies) if (e2 !== e && e2.state !== 'dying') { e2.hp = 0; e2.state = 'dying'; e2.dieT = 0; Particles.burst(e2.pos.x, 1, e2.pos.z, 0xffffff, 8, 3, 0.5); }
}

/* ============ loot / pickups ============ */
function rollWeapon(boost) {
  const d = G.district;
  const base = [42, 26, 16, 9, 4.5, 2, 0.6];
  const score = d * 0.45 + (boost || 0) * 0.9 + (G?.tierData?.rarity || 0) + 0.16 * corruptLv('rarity');
  let tw = 0; const ws = base.map((b, i) => { const w = b * Math.pow(1 + score, i * 0.55); tw += w; return w; });
  let r = Math.random() * tw, rar = 0;
  for (let i = 0; i < 7; i++) { r -= ws[i]; if (r <= 0) { rar = i; break; } }
  if (boost >= 2 && rar < 2) rar = 2;
  const pool = WPOOL[d];
  return makeWeapon(pool[Math.trunc(Math.random() * pool.length)], rar); // NOSONAR - gameplay loot RNG, not security-sensitive
}
const PICKUP_COLORS = { gt: 0x00e5ff, hp: 0xff2d55, ammo: 0xffe600, armor: 0x2979ff };
function spawnPickup(kind, x, z, val, weapon, netId, fromNetwork) {
  if (CoopRoom?.isCoop && !CoopRoom.isHost && !fromNetwork) return null;
  if (kind !== 'weapon' && G?.modStats?.lootbox && Math.random() < 0.12) kind = ['gt','hp','ammo','armor'][Math.trunc(Math.random() * 4)]; // NOSONAR - gameplay pickup mutation RNG
  if (kind === 'gt' && hasRelic('blitzRelic') && Math.random() < 0.12) { val *= 2; G.director.threat = Math.min(1.6, G.director.threat + 0.03); } // NOSONAR - gameplay relic RNG
  const hex = kind === 'weapon' ? RARITIES[weapon.rar].hex : PICKUP_COLORS[kind];
  const mesh = Assets.pickupMesh(kind, hex);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const pk = { kind, mesh, x, z, val, weapon, t: rnd(0, 6), life: kind === 'weapon' ? 999 : 30, netId: netId || (G?.nextNetPickupId ? 'p' + (G.nextNetPickupId++) : null) };
  G.pickups.push(pk);
  if (!fromNetwork) CoopRoom?.onPickupSpawn?.(pk);
  return pk;
}
function pickupTick(pk, dt) {
  const p = G.p;
  pk.t += dt; pk.life -= dt;
  pk.mesh.rotation.y += dt * 1.6;
  pk.mesh.position.y = Math.sin(pk.t * 2.2) * 0.12;
  const dx = p.pos.x - pk.x, dz = p.pos.z - pk.z;
  const d = Math.hypot(dx, dz);
  // magnet small pickups
  if (pk.kind !== 'weapon' && d < 3.2 && d > 0.01) {
    const pull = (3.2 - d) * 5 * dt;
    pk.x += dx / d * pull; pk.z += dz / d * pull;
    pk.mesh.position.x = pk.x; pk.mesh.position.z = pk.z;
  }
  if (d < 1.1 && pk.kind !== 'weapon') {
    if (pk.kind === 'gt') {
      const mult = 1 + Math.min(p.combo, 25) * 0.06;
      const gain = Math.max(1, Math.round(pk.val * mult * (1 + p.mods.gt)));
      p.gt += gain;
      if (G.modStats.debt && DISTRICTS[G.district].fac === 'cryptids') G.director.threat = Math.min(1.6, G.director.threat + 0.01);
      progressMission('gt', gain);
      AudioSys.sfx('shard');
    } else if (pk.kind === 'hp') { p.hp = Math.min(p.maxHp, p.hp + pk.val); AudioSys.sfx('pickup'); }
    else if (pk.kind === 'armor') { p.armor = Math.min(p.maxArmor, p.armor + pk.val); AudioSys.sfx('pickup'); }
    else if (pk.kind === 'ammo') {
      const w = p.weapons[1];
      if (w && w.ammo !== Infinity) w.ammo = Math.min(w.ammoMax, w.ammo + Math.round(w.ammoMax * 0.45));
      AudioSys.sfx('pickup');
    }
    CoopRoom?.onPickupCollect?.(pk);
    pk.dead = true;
  }
  if (pk.life <= 0) pk.dead = true;
  if (pk.dead) scene.remove(pk.mesh);
}
let nearCrate = null;
function updateCratePrompt() {
  nearCrate = null;
  let bd = 2.2;
  for (const pk of G.pickups) {
    if (pk.kind !== 'weapon') continue;
    const d = Math.hypot(G.p.pos.x - pk.x, G.p.pos.z - pk.z);
    if (d < bd) { bd = d; nearCrate = pk; }
  }
  const pr = el('pickupPrompt');
  if (nearCrate) {
    pr.style.display = 'block';
    const rc = RARITIES[nearCrate.weapon.rar];
    el('pickupName').textContent = nearCrate.weapon.name;
    el('pickupName').style.color = rc.color;
    el('pickupKey').textContent = isTouch ? 'TAP [TAKE]' : 'PRESS [E] — ' + rc.name.toUpperCase() + ' ' + nearCrate.weapon.cls.toUpperCase();
    el('btnPick').textContent = 'TAKE';
    el('btnPick').style.display = isTouch ? 'flex' : 'none';
  } else {
    pr.style.display = 'none';
    el('btnPick').style.display = 'none';
  }
}
function takeCrate() {
  if (!nearCrate) return;
  G.p.weapons[1] = nearCrate.weapon;
  G.p.cur = 1; equipGun();
  CoopRoom?.onPickupCollect?.(nearCrate);
  nearCrate.dead = true; scene.remove(nearCrate.mesh);
  nearCrate = null;
  AudioSys.sfx('wpickup');
}

/* ============ player ============ */
function damagePlayer(dmg, src) {
  const p = G.p;
  if (devGodMode) return;
  if (state !== 'run' || p.iframesT > 0 || p.dashT > 0) return;
  dmg *= factionDamageIncomingMult(src);
  const absorbed = Math.min(p.armor, dmg * 0.65);
  p.armor -= absorbed;
  p.hp -= (dmg - absorbed);
  p.stats.taken += dmg;
  if (G.mission && G.mission.type === 'clean') updateMissionHud();
  G.dmgVin = 1; G.shake = Math.min(1, G.shake + 0.25);
  AudioSys.sfx('hurt');
  G.director.taken.push(G.time);
  if (p.hp <= 0) {
    if (upLv('revive') > 0 && !p.reviveUsed) {
      p.reviveUsed = true;
      p.hp = Math.round(p.maxHp * 0.5); p.iframesT = 2.2;
      banner('OG REWIND', 'THE DEVICE PULLS YOU BACK');
      AudioSys.sfx('revive');
      spawnShock(p.pos.x, 1, p.pos.z, 0x9b59ff, 7);
      for (const e of G.enemies) {
        if (e.state === 'dying' || e.boss) continue;
        const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
        if (d < 8) damageEnemy(e, 120, false, e.pos);
      }
    } else if (CoopRoom?.isCoop && p.coopState !== 'downed') {
      p.coopState = 'downed'; p.bleedT = 35; p.hp = 1; p.iframesT = 1.2;
      banner('OPERATIVE DOWNED', 'WAIT FOR REVIVE — FULL WIPE ENDS THE RUN');
      AudioSys.sfx('hurt');
    } else doDeath();
  }
}

function nearestDownedTeammate(maxDistance = 3.25) {
  if (!G?.p || !CoopRoom?.isCoop) return null;
  let best = null, bestD = maxDistance;
  for (const [id, remote] of CoopRoom.remote || []) {
    const s = remote.buf.latest();
    if (!s || s.state !== 'downed') continue;
    const d = Math.hypot(G.p.pos.x - s.x, G.p.pos.z - s.z);
    if (d <= bestD) { bestD = d; best = { id, remote, state:s, distance:d }; }
  }
  return best;
}

function updateRevivePrompt() {
  const prompt = el('revivePrompt');
  if (!prompt) return;
  const target = G?.p?.coopState === 'alive' ? nearestDownedTeammate() : null;
  prompt.classList.toggle('show', !!target && !paused);
  if (!target || paused) return;
  const holding = CoopRoom.reviveTarget === target.id && (Input.keys.KeyE || Input.interact);
  const held = holding ? performance.now() - CoopRoom.reviveStarted : 0;
  const progress = clamp(held / 1800, 0, 1);
  el('reviveName').textContent = 'REVIVE ' + (target.state.name || target.remote.player?.name || 'TEAMMATE');
  el('reviveKey').textContent = held >= 1800 ? 'REVIVE REQUEST SENT — STAY CLOSE' : (isTouch ? 'HOLD [REVIVE]' : 'HOLD [E] TO REVIVE') + (holding ? ' — ' + Math.max(0, (1.8 - held / 1000)).toFixed(1) + 's' : '');
  el('reviveProgress').firstElementChild.style.transform = 'scaleX(' + progress + ')';
  if (isTouch) { const b = el('btnPick'); b.style.display = 'flex'; b.textContent = 'REVIVE'; }
}

function tickTeammateRevive() {
  const target = nearestDownedTeammate();
  if (!target || (!Input.keys.KeyE && !Input.interact)) { CoopRoom.cancelRevive?.(); return; }
  CoopRoom.beginRevive?.(target.id);
  const held = performance.now() - (CoopRoom.reviveStarted || performance.now());
  if (held >= 1800) CoopRoom.completeRevive?.(target.id);
}

function playerTick(dt) {
  const p = G.p;
  if (CoopRoom?.isCoop && p.coopState === 'alive') tickTeammateRevive();
  if (CoopRoom?.isCoop && p.coopState === 'downed') {
    p.bleedT -= dt;
    Input.fire = false;
    if (p.bleedT <= 0) { p.coopState = 'dead'; doDeath(); return; }
  }
  // look
  p.yaw -= Input.lookDX * 0.0034 * SAVE.opts.sens;
  p.pitch = clamp(p.pitch - Input.lookDY * 0.0034 * SAVE.opts.sens, -1.45, 1.45);
  Input.lastLookX += Input.lookDX; Input.lastLookY += Input.lookDY;
  Input.lookDX = 0; Input.lookDY = 0;

  // move input
  let ix = Input.moveX, iz = Input.moveZ;
  const kl = Math.hypot(ix, iz);
  if (kl > 1) { ix /= kl; iz /= kl; }
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let wx = (ix * cy - iz * sy), wz = (-ix * sy - iz * cy);

  const spd = CFG.BASE_SPEED * (1 + p.mods.spd) * (p.coopState === 'downed' ? 0.28 : 1);
  let mvx = wx * spd, mvz = wz * spd;

  // dash
  p.dashCdT -= dt;
  if (Input.dash && p.dashCdT <= 0) {
    let ddx = wx, ddz = wz;
    if (!ddx && !ddz) { ddx = -sy; ddz = -cy; }
    const dl = Math.hypot(ddx, ddz) || 1;
    p.dashX = ddx / dl; p.dashZ = ddz / dl;
    p.dashT = CFG.DASH_TIME;
    p.dashCdT = CFG.DASH_CD * p.mods.dashCd;
    p.iframesT = Math.max(p.iframesT, CFG.DASH_IFRAME + p.mods.iframe);
    AudioSys.sfx('dash');
    Particles.burst(p.pos.x, 0.6, p.pos.z, 0x00e5ff, 8, 2, 0.35);
  }
  Input.dash = false;
  if (p.dashT > 0) { p.dashT -= dt; mvx = p.dashX * CFG.DASH_SPEED; mvz = p.dashZ * CFG.DASH_SPEED; }

  const r = World.movePlayerCircle(p.pos.x, p.pos.z, mvx * dt, mvz * dt, CFG.PLAYER_R, p.pos.y);
  p.pos.x = r.x; p.pos.z = r.z;

  // gravity / jump, including reachable ShillZ cover tops.
  const floorY = World.groundHeight ? World.groundHeight(p.pos.x, p.pos.z, CFG.PLAYER_R * 0.75) : 0;
  if (Input.jump && p.onGround) { p.velY = CFG.JUMP_V; p.onGround = false; AudioSys.sfx('jump'); }
  Input.jump = false;
  p.velY += CFG.GRAVITY * dt;
  p.pos.y += p.velY * dt;
  if (p.pos.y <= floorY && p.velY <= 0) { p.pos.y = floorY; p.velY = 0; p.onGround = true; }
  else if (p.pos.y > floorY + 0.08) p.onGround = false;

  p.iframesT -= dt; p.fireT -= dt; p.swapT -= dt; p.adrenalT -= dt;
  abilityTick(dt);
  if (kl > 0.1 && p.onGround) p.bobT += dt * spd * 1.55;
  p.recoil = Math.max(0, p.recoil - dt * 6);

  // combo decay
  if (p.comboT > 0) { p.comboT -= dt; if (p.comboT <= 0) p.combo = 0; }

  // fire
  let firing = Input.fire;
  if (!firing && isTouch && G.autoFire) firing = autoAimCheck();
  if (firing) fireWeapon(dt);

  // camera
  const bobY = Math.abs(Math.sin(p.bobT)) * 0.05, bobX = Math.sin(p.bobT) * 0.03;
  camera.position.set(p.pos.x + bobX * cy, p.pos.y + 1.62 + bobY, p.pos.z - bobX * sy);
  const shk = G.shake * 0.05;
  camera.rotation.y = p.yaw + rnd(-shk, shk) * 0.5;
  camera.rotation.x = p.pitch + p.recoil * 0.035 + rnd(-shk, shk);
  camera.rotation.z = rnd(-shk, shk) * 0.4;

  // viewmodel: bob + sway + recoil + slide cycling
  if (curGunObj) {
    p.swayX += (clamp(-Input.lastLookX * 0.0012, -0.03, 0.03) - p.swayX) * Math.min(1, dt * 10);
    p.swayY += (clamp(Input.lastLookY * 0.0012, -0.03, 0.03) - p.swayY) * Math.min(1, dt * 10);
    gunGroup.position.set(
      0.26 + Math.sin(p.bobT) * 0.014 + p.swayX,
      -0.3 + Math.abs(Math.cos(p.bobT)) * 0.016 + p.swayY - (p.swapT > 0 ? p.swapT * 0.9 : 0),
      -0.5 + p.recoil * 0.085);
    gunGroup.rotation.x = p.recoil * 0.14;
    gunGroup.rotation.z = p.swayX * 0.6;
    p.slideK = Math.max(0, p.slideK - dt * 10);
    if (curGunObj.slide) curGunObj.slide.position.z = curGunObj.slideZ + p.slideK * 0.055;
  }
  Input.lastLookX *= Math.max(0, 1 - dt * 12); Input.lastLookY *= Math.max(0, 1 - dt * 12);
  muzzleSprite.material.opacity = Math.max(0, muzzleSprite.material.opacity - dt * 14);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 260);
  explLight.intensity = Math.max(0, explLight.intensity - dt * 220);
}

function autoAimCheck() {
  camera.getWorldDirection(_fwd);
  for (const e of G.enemies) {
    if (e.state === 'dying') continue;
    _v1.set(e.pos.x - camera.position.x, e.rootY + e.size - camera.position.y, e.pos.z - camera.position.z);
    const d = _v1.length();
    if (d > 50) continue;
    _v1.normalize();
    if (_v1.dot(_fwd) > 0.995 && World.losClear(camera.position.x, camera.position.z, e.pos.x, e.pos.z, 1.4)) return true;
  }
  return false;
}

function swapWeapon(to) {
  const p = G.p;
  const target = to !== undefined ? to : (p.cur === 0 ? 1 : 0);
  if (!p.weapons[target] || target === p.cur) return;
  p.cur = target; p.swapT = 0.24;
  equipGun();
  AudioSys.sfx('swap');
}
function equipGun() {
  const w = curWeapon();
  if (curGunObj) gunGroup.remove(curGunObj.root);
  curGunObj = gunModels[w.id];
  curGunObj.acc.emissive.setHex(RARITIES[w.rar].hex);
  curGunObj.tip.add(muzzleSprite);
  gunGroup.add(curGunObj.root);
}

/* ============ Turing director ============ */
function directorTick(dt) {
  if (G?.hub) return;
  const D = G.director;
  D.t -= dt; D.msgT -= dt;
  if (D.t <= 0) {
    D.t = 5;
    const now = G.time;
    D.kills = D.kills.filter(t => now - t < 20);
    D.taken = D.taken.filter(t => now - t < 20);
    const kps = D.kills.length / 20;
    const hurt = D.taken.length / 20;
    const hpFrac = G.p.hp / G.p.maxHp;
    let threat = 0.5 + kps * 0.55 - hurt * 0.9 + (hpFrac - 0.5) * 0.45;
    D.threat = clamp(D.threat * 0.6 + threat * 0.4, 0.15, 1.25);
    // assassins
    if (D.threat > 0.85 && G.phase === 'wave' && Math.random() < 0.3) {
      turingSay(TAUNTS.assassin[(Math.random() * TAUNTS.assassin.length) | 0]);
      for (let i = 0; i < 2; i++) {
        const sp = World.randomSpawn(G.p.pos.x, G.p.pos.z, 9);
        spawnEnemy('runner', sp.x, sp.z, true);
      }
    }
    // mercy drop
    if (D.threat < 0.3 && G.p.hp < G.p.maxHp * 0.35 && Math.random() < 0.5) {
      const sp = World.randomSpawn(G.p.pos.x, G.p.pos.z, 5);
      spawnPickup('hp', sp.x, sp.z, 25);
    }
  }
  if (D.msgT <= 0) {
    D.msgT = rnd(18, 30);
    const pool = D.threat > 0.7 ? TAUNTS.dominate : (D.threat < 0.35 ? TAUNTS.struggle : TAUNTS.dominate);
    turingSay(pool[(Math.random() * pool.length) | 0]);
  }
}
let turingT = null;
function turingSay(txt) {
  el('turingTxt').textContent = txt;
  const b = el('turingBox');
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  AudioSys.sfx('turing');
  if (turingT) clearTimeout(turingT);
  turingT = setTimeout(() => b.classList.remove('show'), 3600);
}

/* ============ OG device / augments ============ */
function openOG() {
  setState('og');
  for (const o of document.querySelectorAll('.ov')) o.classList.remove('show');
  document.exitPointerLock && document.exitPointerLock();
  AudioSys.sfx('augment');
  let pickedAug = null, pickedRoute = null;
  const maybeContinue = async () => {
    if (!pickedAug || !pickedRoute) return;
    pickedAug.ap(G.p); G.augs.push(pickedAug.id);
    if (pickedRoute.corruption) { SAVE.corruption += pickedRoute.corruption; G.director.threat = Math.min(1.6, G.director.threat + 0.12); persist(); }
    G.nextRoute = pickedRoute;
    AudioSys.sfx('augment');
    el('ovOG').classList.remove('show');
    setState('loading');
    await startDistrict(G.district + 1);
    setState('run');
  };
  const opts = [];
  const pool = AUGMENTS.slice();
  const wantAug = 3 + (hasRelic('magnusRelic') ? 1 : 0) + Math.min(1, corruptLv('reroll'));
  while (opts.length < wantAug && pool.length) opts.push(pool.splice(Math.trunc(Math.random() * pool.length), 1)[0]); // NOSONAR - gameplay RNG, not security-sensitive
  const wrap = el('ogCards'); wrap.innerHTML = '';
  for (const a of opts) {
    const c = document.createElement('div');
    c.className = 'ogcard';
    c.innerHTML = '<div class="ogtype">' + a.t + ' PROTOCOL</div><h3>' + a.n + '</h3><p>' + a.d + '</p>';
    c.onclick = () => {
      pickedAug = a;
      for (const x of wrap.children) x.classList.remove('sel');
      c.classList.add('sel');
      maybeContinue();
    };
    wrap.appendChild(c);
  }
  const rwrap = el('routeCards'); rwrap.innerHTML = '';
  const rpool = ROUTES.slice();
  const routes = [];
  while (routes.length < 3 && rpool.length) routes.push(rpool.splice(Math.trunc(Math.random() * rpool.length), 1)[0]); // NOSONAR - gameplay route variety, not security-sensitive
  if (SAVE.corruption > 0 || G.simTier > 1) routes.push({ id:'cursed', n:'Cursed Timeline', t:'Corruption Route', d:'+2 corruption and better payout. Adds Turing instability.', threat:0.32, enemy:1.12, reward:0.55, intel:12, mission:'elite', corruption:2 });
  for (const r of routes) {
    const c = document.createElement('div');
    c.className = 'ogcard route';
    c.innerHTML = '<div class="ogtype">' + r.t + '</div><h3>' + r.n + '</h3><p>' + r.d + '</p>';
    c.onclick = () => {
      pickedRoute = r;
      for (const x of rwrap.children) x.classList.remove('sel');
      c.classList.add('sel');
      maybeContinue();
    };
    rwrap.appendChild(c);
  }
  el('ovOG').classList.add('show');
}

/* ============ death & victory ============ */
function bankGT() {
  if (!G || G.banked) return false;
  G.banked = true;
  SAVE.gt += G.p.gt;
  if (!SAVE.intel) SAVE.intel = {};
  for (const [fac, pts] of Object.entries(G.p.intel || {})) {
    if (!SAVE.intel[fac]) SAVE.intel[fac] = { points: 0, leaders: 0 };
    SAVE.intel[fac].points += pts;
  }
  if ((G.phase === 'bossdead' || state === 'victory') && DISTRICTS[G.district]) {
    const fac = DISTRICTS[G.district].fac;
    if (!SAVE.intel[fac]) SAVE.intel[fac] = { points: 0, leaders: 0 };
    SAVE.intel[fac].leaders = Math.max(SAVE.intel[fac].leaders || 0, 1);
  }
  SAVE.bestD = Math.max(SAVE.bestD, G.district + (G.phase === 'bossdead' || state === 'victory' ? 1 : 0));
  ensureAbilityUnlocks();
  persist();
  return true;
}
function doDeath() {
  if (G?.banked) return;
  if (CoopRoom?.isCoop) CoopRoom.grantPersonalReward('wipe');
  setState('dead');
  bankGT();
  AudioSys.musicStop();
  el('deathCause').textContent = 'TERMINATED IN ' + DISTRICTS[G.district].name;
  el('deathStats').innerHTML = statLines();
  el('ovDeath').classList.add('show');
  document.exitPointerLock && document.exitPointerLock();
}
function doVictory() {
  if (G?.banked) return;
  if (CoopRoom?.isCoop) CoopRoom.grantPersonalReward('run_complete');
  setState('victory');
  SAVE.wins++;
  G.p.gt += Math.round(500 * G.tierData.reward);
  SAVE.corruption += Math.max(1, Math.floor(G.simTier / 2));
  SAVE.simTier = Math.max(SAVE.simTier, G.simTier + 1);
  bankGT();
  AudioSys.musicStop();
  el('victStats').innerHTML = statLines() + '<br>VICTORY BONUS <b>+' + Math.round(500 * G.tierData.reward) + ' &#11042;</b><br>SIM TIER UNLOCKED <b>' + SAVE.simTier + '</b>';
  el('ovVictory').classList.add('show');
  document.exitPointerLock && document.exitPointerLock();
}
function statLines() {
  const p = G.p;
  const intel = Object.values(p.intel || {}).reduce((a, b) => a + b, 0);
  return 'DISTRICTS CLEARED <b>' + (G.district + (state === 'victory' ? 1 : 0)) + ' / 5</b><br>' +
    'MISSIONS COMPLETE <b>' + p.stats.missions + '</b><br>' +
    'KILLS <b>' + p.stats.kills + '</b> &nbsp; BEST COMBO <b>x' + p.bestCombo + '</b><br>' +
    'DAMAGE DEALT <b>' + Math.round(p.stats.dmg) + '</b><br>' +
    'FACTION INTEL RECOVERED <b>+' + intel + '</b><br>' +
    'GIGATECH BANKED <b>+' + p.gt + ' &#11042;</b><br>' +
    'SIM TIER <b>' + G.simTier + '</b> &nbsp; CORRUPTION <b>' + SAVE.corruption + '</b>';
}


/* ============ co-op runtime ============ */
function initCoopRuntime() {
  if (!window.CoopRoom) return;
  CoopRoom.init({
    getSave: () => SAVE,
    getGame: () => G,
    getScene: () => scene,
    getCamera: () => camera,
    getDistrictFac: i => DISTRICTS[i]?.fac,
    isRunning: () => state === 'run',
    ensureProfile: ensureLocalProfile,
    startCoopRun: async opts => { AudioSys.init(); hideOverlays(); await newRun(opts || {}); },
    onLobby: renderCoopLobby,
    notice: msg => banner('CO-OP', msg),
    grantReward: grantPersonalReward,
    onEnemySpawnNet: spawnEnemyFromNet,
    onEnemyStateNet: applyEnemyStateNet,
    onEnemyDeathNet: applyEnemyDeathNet,
    onPickupSpawnNet: spawnPickupFromNet,
    onHitNet: applyHitNet,
    onPickupCollectNet: applyPickupCollectNet,
    onWorldSnapshotNet: applyWorldSnapshotNet,
    onReviveNet: applyReviveNet,
    onRunFailedNet: () => { if (state === 'run') doDeath(); },
  });
}
function hideOverlays() { for (const o of document.querySelectorAll('.ov')) o.classList.remove('show'); }
function grantPersonalReward(reward, reason) {
  if (!reward) return;
  if (reward.gt) SAVE.gt += Math.round(reward.gt);
  if (reward.factionIntel) for (const [fac, pts] of Object.entries(reward.factionIntel)) {
    if (!SAVE.intel[fac]) SAVE.intel[fac] = { points:0, leaders:0 };
    SAVE.intel[fac].points += Math.round(pts || 0);
  }
  if (reward.mastery) for (const [wid, xp] of Object.entries(reward.mastery)) addMastery(wid, Number(xp) || 0, {});
  persist();
  if (reason) banner('PERSONAL CO-OP REWARD', '+' + Math.round(reward.gt || 0) + ' GIGATECH — ' + reason.toUpperCase());
}
function spawnEnemyFromNet(ne) {
  if (!G || !ne || G.enemies.some(e => e.netId === ne.id)) return;
  const e = spawnEnemy(ne.typeId, ne.x, ne.z, !!ne.elite, ne.boss || null);
  e.netId = ne.id; e.hp = Number(ne.hp || e.hp); e.maxHp = Number(ne.maxHp || e.maxHp);
  e.netBuf = new NetInterpolation.SnapshotBuffer(160);
  e.netBuf.push({ x:Number(ne.x)||0, y:Number(ne.y)||0, z:Number(ne.z)||0, yaw:Number(ne.yaw)||0, hp:e.hp, maxHp:e.maxHp, state:ne.state || e.state });
}
function applyEnemyStateNet(msg) {
  if (!G || CoopRoom?.isHost) return;
  const enemies = Array.isArray(msg) ? msg : (msg?.enemies || []);
  if (!Array.isArray(msg)) {
    if (msg.wave !== undefined) G.wave = Number(msg.wave) || 0;
    if (msg.phase) G.phase = msg.phase;
    if (msg.waveDelay !== undefined) G.waveDelay = Number(msg.waveDelay) || 0;
    if (Array.isArray(msg.pending)) G.pending = msg.pending.slice();
    if (msg.directorThreat !== undefined && G.director) G.director.threat = Number(msg.directorThreat) || G.director.threat;
  }
  for (const ne of enemies) {
    let e = G.enemies.find(x => x.netId === ne.id);
    if (!e) { spawnEnemyFromNet(ne); e = G.enemies.find(x => x.netId === ne.id); }
    if (!e) continue;
    e.netBuf ||= new NetInterpolation.SnapshotBuffer(160);
    e.netBuf.push({ x:Number(ne.x)||0, z:Number(ne.z)||0, y:Number(ne.y)||0, yaw:Number(ne.yaw)||0, hp:Number(ne.hp ?? e.hp), maxHp:Number(ne.maxHp ?? e.maxHp), state:ne.state || e.state });
    e.hp = Number(ne.hp ?? e.hp); e.maxHp = Number(ne.maxHp ?? e.maxHp);
    if (e.hp <= 0 && e.state !== 'dying') applyEnemyDeathNet(e.netId);
  }
  const ids = new Set(enemies.map(e => e.id));
  for (const e of G.enemies) if (e.netId && !ids.has(e.netId) && e.state !== 'dying') applyEnemyDeathNet(e.netId);
}
function applyEnemyDeathNet(enemyId) {
  const e = G?.enemies?.find(x => x.netId === enemyId);
  if (!e || e.state === 'dying') return;
  e.netBuf = null; e.hp = 0; e.state = 'dying'; e.dieT = 0;
}
function spawnPickupFromNet(np) {
  if (!G || !np || G.pickups.some(p => p.netId === np.id)) return;
  const weapon = np.weapon || (np.kind === 'weapon' ? rollWeapon(0) : null);
  spawnPickup(np.kind, Number(np.x)||0, Number(np.z)||0, Number(np.val)||0, weapon, np.id, true);
}
function applyWorldSnapshotNet(snapshot) {
  if (!G || !snapshot) return;
  if (!CoopRoom?.isHost) {
    applyEnemyStateNet(snapshot);
    const pickupIds = new Set((snapshot.pickups || []).map(p => p.id));
    for (const p of snapshot.pickups || []) spawnPickupFromNet(p);
    for (const p of G.pickups) if (p.netId && !pickupIds.has(p.netId)) { p.dead = true; if (p.mesh) scene.remove(p.mesh); }
    if (snapshot.wave !== undefined) G.wave = Number(snapshot.wave) || 0;
    if (snapshot.phase) G.phase = snapshot.phase;
  }
  for (const ps of snapshot.players || []) CoopRoom?.applyPlayerState?.(ps);
}
function applyReviveNet(msg) {
  if (!G || msg.playerId !== CoopRoom?.profile?.().id) return;
  G.p.coopState = 'alive'; G.p.hp = Math.max(1, Number(msg.hp)||30); G.p.bleedT = 0; G.p.iframesT = 2;
  banner('OPERATIVE REVIVED', 'BACK IN THE FIGHT'); AudioSys.sfx('revive');
}
function applyHitNet(msg) {
  if (!G || !CoopRoom?.isHost) return;
  const e = G.enemies.find(x => x.netId === msg.enemyId);
  if (e) damageEnemy(e, Math.max(0, Number(msg.damage) || 0), !!msg.crit, e.pos, true);
}
function applyPickupCollectNet(msg) {
  if (!G) return;
  const pk = G.pickups.find(p => p.netId === msg.pickupId);
  if (!pk || pk.dead) return;
  pk.dead = true;
  if (pk.mesh) scene.remove(pk.mesh);
}
function renderCoopLobby(room) {
  const list = el('coopPlayers');
  if (!list) return;
  if (!room) { list.innerHTML = '<div class="cooprow">Disconnected</div>'; return; }
  el('coopRoomCode').textContent = room.roomCode || CoopRoom.roomCode || '—';
  list.innerHTML = (room.players || []).map(p => '<div class="cooprow"><span style="color:' + (p.color || '#9b59ff') + '">●</span> ' + p.name + (p.id === room.hostPlayerId ? ' <b>HOST</b>' : '') + '<span>' + (p.ready ? 'READY' : 'STANDBY') + ' · LV ' + (p.effectiveLevel || 1) + '</span></div>').join('');
  const host = room.hostPlayerId === ensureLocalProfile().id;
  el('btnCoopStart').style.display = host ? 'block' : 'none';
}

/* ============ HUD ============ */
function banner(main, sub) {
  el('bannerMain').textContent = main;
  el('bannerSub').textContent = sub || '';
  const b = el('banner');
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
let hitmarkT = null;
function showHitmark(crit, kill) {
  const h = el('hitmark');
  h.className = kill ? 'kill' : (crit ? 'crit' : '');
  h.classList.add('show');
  if (hitmarkT) clearTimeout(hitmarkT);
  hitmarkT = setTimeout(() => { h.classList.remove('show'); h.classList.add('fade'); }, 40);
}
function hudTick() {
  const p = G.p;
  el('hpFill').firstElementChild.style.transform = 'scaleX(' + clamp(p.hp / p.maxHp, 0, 1) + ')';
  el('arFill').firstElementChild.style.transform = 'scaleX(' + clamp(p.armor / p.maxArmor, 0, 1) + ')';
  el('hpText').textContent = 'HP ' + Math.max(0, Math.ceil(p.hp)) + '  |  AR ' + Math.ceil(p.armor);
  const w = curWeapon();
  el('wpnName').textContent = w.name;
  el('wpnName').style.color = RARITIES[w.rar].color;
  el('wpnClass').textContent = w.cls + (p.weapons[1] && p.cur === 0 ? '  —  [Q] ' + p.weapons[1].cls : '');
  el('ammoText').innerHTML = w.ammo === Infinity ? '&#8734;' : w.ammo;
  el('gtText').innerHTML = '&#11042; ' + p.gt + ' GIGATECH';
  if (G.hub) {
    el('distText').textContent = 'REBEL HAVEN — HAVEN COMMONS';
    el('waveText').textContent = 'HUB LOBBY';
    el('hostText').textContent = 'COMBAT DISABLED';
  } else {
    el('distText').textContent = 'DISTRICT ' + (G.district + 1) + ' — ' + DISTRICTS[G.district].name;
    el('waveText').textContent = G.phase === 'boss' ? 'FACTION LEADER' : 'WAVE ' + Math.max(1, G.wave) + '/' + DISTRICTS[G.district].waves;
    el('hostText').textContent = 'HOSTILES: ' + (G.enemies.filter(e => e.state !== 'dying').length + G.pending.length);
  }
  el('modText').textContent = G.hub ? 'SAFE ZONE — REBEL SERVICES ONLINE' : 'TIER ' + G.simTier + ' — ' + simTierData(G.simTier).n + (G.modifiers.length ? ' | MODS: ' + G.modifiers.map(m => m.n).join(' / ') : '');
  const aw = el('abilityHud');
  aw.innerHTML = SAVE.equippedAbilities.map((id, i) => {
    const a = ABILITIES[id], cd = Math.ceil(abilityCooldown(id));
    return '<span class="abilpill ' + (cd > 0 ? 'cool' : '') + '">' + (i === 0 ? 'F' : 'R') + ': ' + a.name + (cd > 0 ? ' ' + cd + 's' : ' READY') + '</span>';
  }).join('');
  updateMissionHud();
  const cb = el('comboBox');
  if (p.combo >= 2) {
    cb.style.opacity = '1';
    el('comboNum').textContent = 'x' + p.combo;
    let tier = '';
    for (const [th, name] of COMBO_TIERS) if (p.combo >= th) tier = name;
    el('comboTier').textContent = tier;
  } else cb.style.opacity = '0';
  el('dashDot').firstElementChild.style.transform = 'scaleX(' + clamp(1 - p.dashCdT / (CFG.DASH_CD * p.mods.dashCd), 0, 1) + ')';
  G.dmgVin = Math.max(0, G.dmgVin - 0.045);
  el('vDamage').style.opacity = String(G.dmgVin);
  el('vLow').style.opacity = p.hp < p.maxHp * 0.3 ? '1' : '0';
  updateCratePrompt();
  updateRevivePrompt();
}

/* ============ input ============ */
const Input = { moveX: 0, moveZ: 0, lookDX: 0, lookDY: 0, lastLookX: 0, lastLookY: 0, fire: false, dash: false, jump: false, interact: false, keys: {} };
function initInput() {
  const cv = el('c');
  // desktop
  addEventListener('keydown', e => {
    Input.keys[e.code] = true;
    if (state !== 'run') return;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') Input.dash = true;
    if (e.code === 'Space') { Input.jump = true; e.preventDefault(); }
    if (e.code === 'KeyQ') swapWeapon();
    if (e.code === 'Digit1') swapWeapon(0);
    if (e.code === 'Digit2') swapWeapon(1);
    if (e.code === 'KeyE') { Input.interact = true; if (!nearestDownedTeammate()) takeCrate(); }
    if (e.code === 'KeyF') activeAbility(0);
    if (e.code === 'KeyR') activeAbility(1);
  });
  addEventListener('keyup', e => { Input.keys[e.code] = false; if (e.code === 'KeyE') Input.interact = false; });
  cv.addEventListener('mousedown', e => {
    if (state !== 'run' || paused) return;
    if (!isTouch && document.pointerLockElement !== cv) { cv.requestPointerLock(); return; }
    if (e.button === 0) Input.fire = true;
  });
  addEventListener('mouseup', e => { if (e.button === 0) Input.fire = false; });
  addEventListener('mousemove', e => {
    if (document.pointerLockElement === cv && state === 'run' && !paused) {
      Input.lookDX += e.movementX * 0.65; Input.lookDY += e.movementY * 0.65;
    }
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== cv && state === 'run' && !isTouch && !paused) setPaused(true);
  });

  // touch
  let moveId = null, lookId = null, anchor = { x: 0, y: 0 };
  const base = el('stickBase'), knob = el('stickKnob');
  function tstart(e) {
    AudioSys.init(); AudioSys.resume();
    for (const t of e.changedTouches) {
      if (t.target.classList && t.target.classList.contains('tbtn')) continue;
      if (state !== 'run' || paused) continue;
      if (t.clientX < innerWidth * 0.42 && moveId === null) {
        moveId = t.identifier; anchor = { x: t.clientX, y: t.clientY };
        base.style.display = 'block'; knob.style.display = 'block';
        base.style.left = (anchor.x - 59) + 'px'; base.style.top = (anchor.y - 59) + 'px';
        knob.style.left = (anchor.x - 26) + 'px'; knob.style.top = (anchor.y - 26) + 'px';
      } else if (lookId === null && t.clientX >= innerWidth * 0.42) {
        lookId = t.identifier; lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }
  let lookLast = { x: 0, y: 0 };
  function tmove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        let dx = t.clientX - anchor.x, dy = t.clientY - anchor.y;
        const d = Math.hypot(dx, dy), max = 52;
        if (d > max) { dx = dx / d * max; dy = dy / d * max; }
        Input.moveX = dx / max; Input.moveZ = -dy / max;
        knob.style.left = (anchor.x + dx - 26) + 'px'; knob.style.top = (anchor.y + dy - 26) + 'px';
      } else if (t.identifier === lookId) {
        Input.lookDX += (t.clientX - lookLast.x) * 2.1;
        Input.lookDY += (t.clientY - lookLast.y) * 2.1;
        lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }
  function tend(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) { moveId = null; Input.moveX = 0; Input.moveZ = 0; base.style.display = 'none'; knob.style.display = 'none'; }
      if (t.identifier === lookId) lookId = null;
    }
  }
  addEventListener('touchstart', tstart, { passive: true });
  addEventListener('touchmove', tmove, { passive: false });
  addEventListener('touchend', tend);
  addEventListener('touchcancel', tend);

  const bind = (id, down, up) => {
    const b = el(id);
    b.addEventListener('touchstart', e => { e.stopPropagation(); down(); }, { passive: true });
    if (up) { b.addEventListener('touchend', e => { e.stopPropagation(); up(); }); b.addEventListener('touchcancel', () => up()); }
  };
  bind('btnFire', () => Input.fire = true, () => Input.fire = false);
  bind('btnDash', () => Input.dash = true);
  bind('btnAbil1', () => activeAbility(0));
  bind('btnAbil2', () => activeAbility(1));
  bind('btnSwap', () => swapWeapon());
  bind('btnPick', () => { Input.interact = true; if (!nearestDownedTeammate()) takeCrate(); }, () => { Input.interact = false; CoopRoom?.cancelRevive?.(); });
  bind('btnAuto', () => {
    G.autoFire = !G.autoFire; SAVE.opts.auto = G.autoFire; persist();
    el('btnAuto').textContent = 'AUTO: ' + (G.autoFire ? 'ON' : 'OFF');
    el('btnAuto').classList.toggle('on', G.autoFire);
  });
  bind('btnPauseT', () => setPaused(true));
  el('btnRotateSkip').addEventListener('click', () => { rotateDismissed = true; checkRotateHint(); });
  addEventListener('contextmenu', e => e.preventDefault());
}
function keyMove() {
  if (isTouch) return;
  const k = Input.keys;
  Input.moveX = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);
  Input.moveZ = (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
}

/* ============ menus / state ============ */
function setState(s) {
  state = s;
  document.body.classList.toggle('inrun', s === 'run');
  if (gunGroup) gunGroup.visible = (s === 'run' || s === 'og');
  checkRotateHint();
}
function setPaused(v) {
  if (state !== 'run') return;
  paused = v;
  el('ovPause').classList.toggle('show', v);
  const sub = el('pauseSub');
  if (sub) sub.textContent = CoopRoom?.isCoop ? 'LOCAL MENU — SQUAD SIMULATION CONTINUES' : 'SIMULATION SUSPENDED';
  if (v) {
    Input.fire = false; Input.dash = false; Input.jump = false; Input.interact = false;
    Input.moveX = 0; Input.moveZ = 0; CoopRoom?.cancelRevive?.();
    document.exitPointerLock && document.exitPointerLock();
  }
}
function updateTitle() {
  ensureAbilityUnlocks();
  el('titleGT').textContent = '⬢ ' + SAVE.gt + ' GIGATECH BANKED | CORRUPTION ' + SAVE.corruption + ' | TIER ' + SAVE.simTier;
  el('titleBest').textContent = SAVE.runs === 0 ? 'FIRST CAST — GOOD LUCK, ELLIOT' :
    'RUNS: ' + SAVE.runs + '  —  BEST: ' + (SAVE.bestD >= 5 ? 'TURING DEFEATED (' + SAVE.wins + 'x)' : 'DISTRICT ' + SAVE.bestD) + '  —  KILLS: ' + SAVE.kills;
}
function factionIntelLevel(points) {
  if (points >= 180) return 'COMPROMISED';
  if (points >= 90) return 'MAPPED';
  if (points >= 35) return 'PROFILED';
  if (points > 0) return 'CONTACT';
  return 'UNKNOWN';
}
function factionIntelRow(id, f) {
  const data = SAVE.intel?.[id] || { points: 0, leaders: 0 };
  const leader = data.leaders ? 'LEADER BROKEN' : 'LEADER ACTIVE';
  return '<div class="intelrow"><b style="color:#' + f.neon.toString(16).padStart(6, '0') + '">' + f.name + '</b><span>' + factionIntelLevel(data.points) + ' — ' + data.points + ' INTEL — ' + leader + '</span></div>';
}
function renderBriefing() {
  const wrap = el('factionIntel');
  if (!wrap) return;
  const rows = Object.entries(FACTIONS)
    .filter(([id]) => id !== 'rebels')
    .map(([id, f]) => factionIntelRow(id, f));
  wrap.innerHTML = rows.join('') || '<p>No faction intelligence recovered yet.</p>';
}
let activeArmoryTab = 'body';
function cardHtml(title, body, action) {
  return '<h3>' + title + '</h3><p>' + body + '</p>' + (action || '');
}
function renderArmory() { // NOSONAR - static tab renderer avoids framework/bundler dependency
  ensureAbilityUnlocks();
  el('armGT').textContent = '⬢ ' + SAVE.gt + ' GIGATECH | CORRUPTION ' + SAVE.corruption + ' | SIM TIER ' + SAVE.simTier;
  const tabs = [ ['body','Body Mods'], ['arsenal','Arsenal'], ['og','OG Device'], ['abilities','Abilities'], ['research','Faction Research'], ['corruption','Corruption'] ];
  const tabWrap = el('armoryTabs');
  tabWrap.innerHTML = '';
  for (const [id,n] of tabs) {
    const b = document.createElement('div'); b.className = 'armtab ' + (activeArmoryTab === id ? 'on' : ''); b.textContent = n;
    b.onclick = () => { activeArmoryTab = id; AudioSys.sfx('ui'); renderArmory(); };
    tabWrap.appendChild(b);
  }
  const grid = el('armoryGrid'); grid.innerHTML = '';
  const add = (html, cb) => { const card = document.createElement('div'); card.className = 'upcard'; card.innerHTML = html; if (cb) { cb(card); } grid.appendChild(card); };
  if (activeArmoryTab === 'body') {
    for (const u of METAUP) addMetaCard(u, add);
  } else if (activeArmoryTab === 'arsenal') {
    for (const [id,w] of Object.entries(WEAPONS)) {
      const m = SAVE.mastery[id], data = WEAPON_MASTERY[id];
      const unlocks = Object.entries(data.levels).map(([lv,txt]) => '<br><b>L' + lv + '</b> ' + txt).join('');
      add(cardHtml(data.n, w.cls + ' — Level ' + m.level + ' / 10<br>XP ' + m.xp + ' / ' + masteryXpForLevel(m.level) + '<br>Kills ' + m.kills + ' | Elite ' + m.eliteKills + ' | Headshots ' + m.headshots + '<br>' + unlocks));
    }
  } else if (activeArmoryTab === 'og') {
    add(cardHtml('Simulation Tier', simTierData(SAVE.simTier).n + '<br>Higher tiers add HP, damage, elite chance, modifiers, rewards, and rarity bias. Defeat Turing to unlock the next tier.'));
    add(cardHtml('Boss Relics', Object.values(BOSS_RELICS).map(r => (hasRelic(r.id) ? '&#10003; ' : '&#9671; ') + r.name + '<br><span style="opacity:.7">' + r.d + '</span>').join('<br>')));
    add(cardHtml('Codex', Object.keys(SAVE.codex).length + ' entries discovered. Relics, mastery breakpoints, and simulation tier data populate this archive.'));
  } else if (activeArmoryTab === 'abilities') {
    for (const [id,a] of Object.entries(ABILITIES)) {
      const rec = SAVE.abilities[id];
      const equip = SAVE.equippedAbilities.includes(id) ? 'EQUIPPED' : 'EQUIP';
      const lvl = rec?.level || 0, maxed = lvl >= a.max;
      let btns = '';
      if (!rec?.unlocked) btns = '<div class="buybtn cant">LOCKED</div>';
      else {
        btns = '<div class="buybtn" data-equip="' + id + '">' + equip + '</div> ';
        const cost = 110 * (lvl + 1);
        btns += '<div class="buybtn ' + (maxed ? 'max' : SAVE.gt >= cost ? '' : 'cant') + '" data-level="' + id + '">' + (maxed ? 'MAXED' : 'LEVEL — ' + cost + ' &#11042;') + '</div>';
      }
      add(cardHtml(a.name + ' L' + lvl, a.category + ' — CD ' + a.cooldown + 's<br>' + a.d + '<br>' + (a.scaling || []).join('<br>'), btns), card => {
        const eq = card.querySelector('[data-equip]'); if (eq) eq.onclick = () => { setAbilitySlot(id); renderArmory(); };
        const lv = card.querySelector('[data-level]'); if (lv) lv.onclick = () => { if (levelAbility(id)) AudioSys.sfx('pickup'); renderArmory(); };
      });
    }
  } else if (activeArmoryTab === 'research') {
    for (const [id,f] of Object.entries(FACTIONS).filter(([id]) => id !== 'rebels')) {
      const rank = intelRank(id), pts = intelPoints(id);
      const rows = (FACTION_RESEARCH[id] || []).map((r,i) => (i < rank ? '&#10003; ' : '&#9671; ') + r.level + ' — ' + r.d).join('<br>');
      add(cardHtml(f.name + ' Research', pts + ' intel — ' + factionIntelLevel(pts) + '<br>' + rows));
    }
  } else if (activeArmoryTab === 'corruption') {
    for (const u of CORRUPTION_UPGRADES) {
      const lv = corruptLv(u.id), maxed = lv >= u.max, cost = maxed ? 0 : corruptionCost(u, lv);
      const action = '<div class="buybtn ' + (maxed ? 'max' : SAVE.corruption >= cost ? '' : 'cant') + '" data-corrupt="' + u.id + '">' + (maxed ? 'MAXED' : 'UPGRADE — ' + cost + ' CORRUPTION') + '</div>';
      add(cardHtml(u.n + ' L' + lv + '/' + u.max, u.d, action), card => {
        const b = card.querySelector('[data-corrupt]'); if (b) b.onclick = () => { if (buyCorruptionUpgrade(u.id)) AudioSys.sfx('augment'); renderArmory(); };
      });
    }
  }
}
function addMetaCard(u, add) {
  const lv = upLv(u.id);
  let pips = '<div class="uplvl">';
  for (let i = 0; i < u.max; i++) pips += '<i class="' + (i < lv ? 'on' : '') + '"></i>';
  pips += '</div>';
  const maxed = lv >= u.max, cost = maxed ? 0 : metaCost(u, lv);
  const btn = '<div class="buybtn ' + (maxed ? 'max' : SAVE.gt >= cost ? '' : 'cant') + '" data-meta="' + u.id + '">' + (maxed ? 'MAXED' : 'UPGRADE — ' + cost + ' &#11042;') + '</div>';
  add('<h3>' + u.n + '</h3>' + pips + '<p>' + u.d + '</p>' + btn, card => {
    const b = card.querySelector('[data-meta]');
    if (b && !maxed && SAVE.gt >= cost) b.onclick = () => { SAVE.gt -= cost; SAVE.up[u.id] = lv + 1; persist(); AudioSys.init(); AudioSys.sfx('pickup'); renderArmory(); };
  });
}


async function hostCoopFlow() {
  ensureLocalProfile();
  el('coopName').value = SAVE.profile.name;
  el('coopWorkerUrl').value = NET_CONFIG.workerUrl || '';
  el('coopHint').textContent = 'Creating private room...';
  try {
    const code = await CoopRoom.host();
    el('coopHint').textContent = 'Share room code ' + code + '. Host starts when the squad is ready.';
    renderCoopLobby(CoopRoom.lobby || { roomCode:code, hostPlayerId:SAVE.profile.id, players:[SAVE.profile] });
  } catch (e) { el('coopHint').textContent = e.message || String(e); }
}
function prepJoinCoopFlow() {
  ensureLocalProfile();
  el('coopName').value = SAVE.profile.name;
  el('coopWorkerUrl').value = NET_CONFIG.workerUrl || '';
  el('coopHint').textContent = 'Enter a private room code to join a co-op lobby.';
  renderCoopLobby(null);
  el('btnCoopConnect').onclick = async () => {
    setProfileName(el('coopName').value);
    NetConfig.setWorkerUrl(el('coopWorkerUrl').value);
    const code = el('coopJoinCode').value.trim().toUpperCase();
    if (!code) { el('coopHint').textContent = 'Room code required.'; return; }
    el('coopHint').textContent = 'Joining ' + code + '...';
    try { await CoopRoom.join(code); el('coopHint').textContent = 'Joined ' + code + '. Wait for host start.'; }
    catch (e) { el('coopHint').textContent = e.message || String(e); }
  };
}

function wireMenus() {
  const show = id => { for (const o of document.querySelectorAll('.ov')) o.classList.remove('show'); if (id) el(id).classList.add('show'); };
  el('btnHub').onclick = () => { CoopRoom?.leave?.(); AudioSys.init(); AudioSys.sfx('ui'); show(null); newRun({ hub:true }); };
  el('btnStart').onclick = () => { CoopRoom?.leave?.(); AudioSys.init(); AudioSys.sfx('ui'); show(null); newRun(); };
  el('btnHostCoop').onclick = async () => { AudioSys.init(); AudioSys.sfx('ui'); show('ovCoop'); await hostCoopFlow(); };
  el('btnJoinCoop').onclick = () => { AudioSys.init(); AudioSys.sfx('ui'); show('ovCoop'); prepJoinCoopFlow(); };
  el('btnCoopBack').onclick = () => { AudioSys.sfx('ui'); CoopRoom?.leave?.(); updateTitle(); show('ovTitle'); };
  el('btnCoopReady').onclick = () => { AudioSys.sfx('ui'); const ready = !el('btnCoopReady').classList.contains('primary'); el('btnCoopReady').classList.toggle('primary', ready); el('btnCoopReady').textContent = ready ? 'Ready: Yes' : 'Ready: No'; CoopRoom?.setReady?.(ready); };
  el('btnCoopStart').onclick = () => { AudioSys.sfx('ui'); hideOverlays(); CoopRoom?.startRun?.(); };
  el('btnSaveProfile').onclick = () => { setProfileName(el('coopName').value); AudioSys.sfx('pickup'); renderCoopLobby(CoopRoom?.lobby); };
  el('coopWorkerUrl').onchange = e => NetConfig?.setWorkerUrl?.(e.target.value);
  el('btnArmory').onclick = () => { AudioSys.init(); AudioSys.sfx('ui'); renderArmory(); show('ovArmory'); };
  el('btnArmBack').onclick = () => { AudioSys.sfx('ui'); updateTitle(); show('ovTitle'); };
  el('btnHelp').onclick = () => { AudioSys.init(); AudioSys.sfx('ui'); renderBriefing(); show('ovHelp'); };
  el('btnHelpBack').onclick = () => { AudioSys.sfx('ui'); show('ovTitle'); };
  el('btnRetry').onclick = () => { AudioSys.sfx('ui'); show(null); newRun(); };
  el('btnDeathArmory').onclick = () => { AudioSys.sfx('ui'); renderArmory(); show('ovArmory'); };
  el('btnDeathTitle').onclick = () => { AudioSys.sfx('ui'); updateTitle(); setState('title'); show('ovTitle'); };
  el('btnVictRetry').onclick = () => { AudioSys.sfx('ui'); show(null); newRun(); };
  el('btnVictTitle').onclick = () => { AudioSys.sfx('ui'); updateTitle(); setState('title'); show('ovTitle'); };
  el('btnResume').onclick = () => { AudioSys.sfx('ui'); setPaused(false); };
  el('btnAbort').onclick = () => {
    AudioSys.sfx('ui'); setPaused(false); bankGT(); AudioSys.musicStop();
    clearEntities(); updateTitle(); setState('title'); show('ovTitle');
  };
  addEventListener('keydown', e => {
    if (e.code === 'Escape' && state === 'run') setPaused(!paused);
  });
  el('optSens').value = SAVE.opts.sens * 100;
  el('optSens').oninput = e => { SAVE.opts.sens = e.target.value / 100; persist(); };
  const tog = (id, key, fn) => {
    const b = el(id);
    const upd = () => { b.textContent = SAVE.opts[key] ? 'ON' : 'OFF'; b.classList.toggle('on', SAVE.opts[key]); };
    upd();
    b.onclick = () => { SAVE.opts[key] = !SAVE.opts[key]; persist(); fn(SAVE.opts[key]); upd(); };
  };
  tog('optMusic', 'music', v => AudioSys.setMusic(v));
  tog('optSfx', 'sfx', v => AudioSys.setSfx(v));
  el('btnAuto').textContent = 'AUTO: ' + (SAVE.opts.auto ? 'ON' : 'OFF');
  el('btnAuto').classList.toggle('on', SAVE.opts.auto);
}

/* ============ dev console API ============ */
async function devEnsureRun() {
  document.querySelectorAll('.ov').forEach(o => o.classList.remove('show'));
  if (state === 'run' && G) return;
  if (!G) await newRun();
  else setState('run');
}

async function devLoadMap(entry) {
  await devEnsureRun();
  clearEntities();
  G.boss = null;
  G.wave = 0;
  G.phase = 'intro';
  G.waveDelay = 9999;
  G.pending = [];
  G.spawnT = 0;
  el('bossBar').style.display = 'none';

  const dIdx = entry.district ?? 0;
  G.district = dIdx;
  const buildOpts = {};
  if (entry.sceneUrl !== undefined) buildOpts.sceneUrl = entry.sceneUrl;
  if (entry.faction) buildOpts.faction = entry.faction;
  G.theme = await World.build(scene, dIdx, buildOpts);

  const s = World.playerStart();
  G.p.pos.set(s.x, 0, s.z);
  G.p.velY = 0;
  G.p.yaw = s.yaw !== undefined ? s.yaw : Math.atan2(s.x, s.z);
  if (devGodMode) G.p.hp = G.p.maxHp;
  banner('DEV MAP', entry.label || 'LOADED');
  AudioSys.setIntensity(0.35 + dIdx * 0.1);
  return true;
}

function devGiveGun(id, rarity, slot) {
  if (!G) return false;
  if (!WEAPONS[id]) return false;
  const r = rarity == null ? 6 : clamp(Math.round(rarity), 0, RARITIES.length - 1);
  const s = slot == null ? 1 : clamp(Math.round(slot), 0, 1);
  G.p.weapons[s] = makeWeapon(id, r);
  G.p.cur = s;
  equipGun();
  AudioSys.sfx('wpickup');
  return true;
}

function devSpawnEnemy(typeId, elite, bossId) {
  if (!G || state !== 'run') return null;
  const p = G.p;
  const dist = 5;
  let x = p.pos.x + Math.sin(p.yaw) * dist;
  let z = p.pos.z + Math.cos(p.yaw) * dist;
  if (!bossId) {
    const sp = World.randomSpawn(p.pos.x, p.pos.z, 2, typeId);
    x = sp.x;
    z = sp.z;
  }
  return spawnEnemy(bossId ? null : typeId, x, z, !!elite, bossId || null);
}

function devClearEnemies() {
  if (!G) return 0;
  const n = G.enemies.length;
  for (const e of G.enemies) despawnRig(e);
  G.enemies = [];
  G.boss = null;
  el('bossBar').style.display = 'none';
  return n;
}

function devStartWaves() {
  if (!G) return;
  G.wave = 0;
  G.phase = 'intro';
  G.waveDelay = 0.5;
}

function devSetGodMode(on) {
  devGodMode = !!on;
  if (devGodMode && G?.p) {
    G.p.hp = G.p.maxHp;
    G.p.armor = G.p.maxArmor;
  }
  return devGodMode;
}

const DevAPI = {
  get state() { return state; },
  get godMode() { return devGodMode; },
  ensureRun: devEnsureRun,
  loadMap: devLoadMap,
  giveGun: devGiveGun,
  spawnEnemy: devSpawnEnemy,
  clearEnemies: devClearEnemies,
  startWaves: devStartWaves,
  setGodMode: devSetGodMode,
  maps: () => DevConsole?.MAPS || [],
  weapons: () => Object.keys(WEAPONS),
  enemies: () => Object.keys(ETYPES),
  bosses: () => Object.keys(BOSSES),
};

/* ============ adaptive quality ============ */
function adaptQuality(dt) {
  fpsEma = fpsEma * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
  fpsCheck -= dt;
  if (fpsCheck > 0) return;
  fpsCheck = 2.5;
  if (fpsEma < 34 && quality > 0) {
    quality--;
    if (quality === 2) renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.2));
    if (quality === 1) { renderer.setPixelRatio(1); bloomPass.strength = 0.75; }
    if (quality === 0) { renderer.setPixelRatio(0.85); }
    composer.setSize(innerWidth, innerHeight);
  } else if (fpsEma > 57 && quality < 3) {
    quality++;
    if (quality === 3) renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.4 : 1.75));
    if (quality === 2) renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.2));
    composer.setSize(innerWidth, innerHeight);
  }
}

/* ============ main loop ============ */
let lastT = 0, flowT = 0, titleT = 0;
function frame(t) {
  requestAnimationFrame(frame);
  let dt = Math.min((t - lastT) / 1000, 0.05); lastT = t;
  if (dt <= 0) return;
  adaptQuality(dt);

  // Pausing in co-op is a local input/menu state. The shared simulation and
  // network stream must keep running, especially when the authority pauses.
  if (state === 'run' && G && (!paused || CoopRoom?.isCoop)) {
    G.timeScale += (1 - G.timeScale) * dt * 2.2;
    const sdt = dt * G.timeScale;
    G.time += sdt;
    G.shake = Math.max(0, G.shake - dt * 2.4);

    if (!paused) { keyMove(); playerTick(sdt); }
    CoopRoom?.tick?.(sdt);
    flowT -= sdt;
    if (flowT <= 0) { flowT = 0.35; World.computeFlow(G.p.pos.x, G.p.pos.z); }

    for (const e of G.enemies) enemyTick(e, sdt);
    const authority = !CoopRoom?.isCoop || CoopRoom.isHost;
    // Only the authority simulates enemy separation, projectiles, waves and director RNG.
    if (authority) {
      const es = G.enemies;
      for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
        const a = es[i], b = es[j];
        if (a.state !== 'active' || b.state !== 'active') continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const md = 0.55 * (a.size + b.size);
        const d2 = dx * dx + dz * dz;
        if (d2 < md * md && d2 > 0.0001) {
          const d = Math.sqrt(d2), push = (md - d) * 0.5 / d;
          a.pos.x -= dx * push; a.pos.z -= dz * push;
          b.pos.x += dx * push; b.pos.z += dz * push;
        }
      }
    }
    G.enemies = G.enemies.filter(e => !e.dead);

    if (authority) for (const pr of G.projs) if (!pr.dead) projTick(pr, sdt);
    G.projs = G.projs.filter(p => !p.dead);
    for (const pk of G.pickups) if (!pk.dead) pickupTick(pk, sdt);
    G.pickups = G.pickups.filter(p => !p.dead);

    if (authority) { waveTick(sdt); directorTick(sdt); }
    Particles.tick(sdt);
    DmgNums.tick(dt);
    fxTick(sdt);
    tracerTick(dt);
    World.tick(sdt, G.time);
    hudTick();
    AudioSys.setIntensity(G.phase === 'boss' ? 0.95 : 0.35 + G.district * 0.1 + Math.min(0.25, G.enemies.length * 0.03));
  } else if (state === 'og') {
    World.tick(dt * 0.2, G ? G.time : 0);
  } else if (state === 'title') {
    // slow orbit over the district
    titleT += dt;
    camera.position.set(Math.cos(titleT * 0.06) * 24, 9 + Math.sin(titleT * 0.1) * 1.5, Math.sin(titleT * 0.06) * 24);
    camera.lookAt(0, 3.5, 0);
    World.tick(dt, titleT);
  } else if (state === 'dead' || state === 'victory') {
    World.tick(dt * 0.3, G ? G.time : 0);
  }

  composer.render();
}

/* go */
window.DevAPI = DevAPI;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
