/* EARTH 2049: SAVE SEED 7 — the player's own body in first person (Halo-style), from the avatar kit.
 *
 *   FPBody.attach(scene)        put your avatar (your saved Fitting Room look) at your feet in this scene
 *   FPBody.update(dt, s)        s = { x, y, z, yaw, pitch, speed, onGround, crouch, slide, arms }   (camera yaw/pitch)
 *   FPBody.detach()             take it out of the scene
 *   FPBody.refresh()            re-dress after the look changed (the Fitting Room calls this)
 *
 * The head and everything on it is hidden, so looking down shows your top, legs and shoes. The body stands a
 * little behind the camera so the lens never sits inside the chest. In combat (arms: false) the body's arms are
 * hidden and GunFeel's viewmodel hands wear your equipped gloves and sleeves instead: FPBody builds those pieces
 * from the same look (hand + forearm of each side) and hands them to GunFeel.setArms().
 */
'use strict';

const FPBody = (() => {
  const BACK = 0.12;                      // metres behind the camera
  let spine = null;
  let body = null, armsAv = null, scene = null, code = null, building = null, poseT = 0, clip = '';
  const basicCache = new Map();

  const K = () => window.AvatarKit;
  async function ensure() {
    if (!K()) return null;
    if (building) return building;
    building = (async () => {
      await K().ready();
      build();
      return body;
    })();
    building.catch(() => { building = null; });
    return building;
  }
  function look() { return K().load(); }
  function build() {
    const L = look();
    const c = K().encode(L);
    if (body && c === code) return;
    const parent = body?.root.parent || scene;
    if (body) { body.dispose(); body = null; }
    if (armsAv) { armsAv.dispose(); armsAv = null; }
    code = c;
    body = K().create(L);
    body.root.name = 'fp-body';
    body.setFirstPerson(true);
    body.root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    if (parent) parent.add(body.root);
    body.root.visible = shown;
    body.play('Idle Combat', 0); clip = 'Idle Combat';
    spine = body.root.getObjectByName('spine');
    // a second, never-rendered copy whose hand and forearm pieces dress the viewmodel arms
    armsAv = K().create(L);
    window.GunFeel?.setArms?.({ L: armParts('L'), R: armParts('R') });
  }

  // the meshes worn on one side's hand and forearm, re-materialled unlit for the viewmodel
  function basic(m) {
    if (!basicCache.has(m)) basicCache.set(m, new THREE.MeshBasicMaterial({ map: m.map, color: 0xc4c0cc }));
    return basicCache.get(m);
  }
  function cloneBone(bone, skip) {
    const g = new THREE.Group();
    for (const ch of bone.children) {
      if (ch === skip || !ch.visible) continue;
      if (/^(upperarm|forearm|hand)_[LR]$/.test(ch.name)) continue;            // only meshes, not child bones
      const c = ch.clone(true);
      c.traverse(o => { if (o.isMesh) { o.material = basic(o.material); o.frustumCulled = false; o.renderOrder = 9; } });
      g.add(c);
    }
    return g;
  }
  function armParts(side) {
    const fore = armsAv.root.getObjectByName('forearm_' + side), hand = armsAv.root.getObjectByName('hand_' + side);
    if (!fore || !hand) return null;
    return { fore: cloneBone(fore, hand), hand: cloneBone(hand, null), foreLen: Math.abs(hand.position.y) || 0.245 };
  }

  function attach(sc) {
    scene = sc;
    ensure().then(() => { if (body && scene && body.root.parent !== scene) scene.add(body.root); });
  }
  function detach() {
    if (body?.root.parent) body.root.parent.remove(body.root);
    scene = null;
  }
  function refresh() { if (body || armsAv) build(); }
  let shown = false;
  function show(v) { shown = !!v; if (body) body.root.visible = shown; }

  function play(name, speed = 1) {
    if (clip !== name) { body.play(name, 0.2); clip = name; }
    if (body.action) body.action.timeScale = speed;
  }
  const _arms = ['upperarm_L', 'upperarm_R'];
  function update(dt, s) {
    if (!body || !scene || !body.root.parent || !shown) return;
    const yaw = s.yaw;
    // stand behind the camera, facing where it faces (the kit faces +Z; the camera looks down -Z)
    const k = Math.max(0, Math.min(1, (-(s.pitch || 0) - 0.7) / 0.35));
    const back = BACK + 0.2 * k;              // further back as you look down: you see the fronts of your legs and shoes
    body.root.position.set(s.x + Math.sin(yaw) * back, s.y, s.z + Math.cos(yaw) * back);
    // glance down and you see your top and sleeves; look further down and the upper body steps aside so you see
    // your legs and shoes (it would otherwise fill the view: the eye sits right above your own chest)
    if (spine) spine.visible = (s.pitch || 0) > -0.78;
    body.root.rotation.y = yaw + Math.PI;
    for (const n of _arms) { const o = body.root.getObjectByName(n); if (o) o.visible = s.arms !== false; }
    const sp = s.speed || 0;
    if (!s.onGround) play('Jump', 0.8);
    else if (s.slide) play('Crouch Idle');
    else if (s.crouch) play(sp > 0.6 ? 'Crouch Walk' : 'Crouch Idle', Math.max(0.6, Math.min(1.6, sp / 2.5)));
    else if (sp > 5.2) play('Run', Math.max(0.8, Math.min(2.2, sp / 5.5)));
    else if (sp > 0.5) play('Walk', Math.max(0.7, Math.min(1.8, sp / 1.8)));
    else {
      poseT -= dt;
      if (poseT <= 0 || (clip !== 'Idle Combat' && clip !== 'Idle')) { poseT = 6; play(s.arms === false ? 'Idle Combat' : 'Idle'); }
    }
    body.update(dt);
  }

  return { ensure, attach, detach, update, refresh, show, get body() { return body; }, get ready() { return !!body; } };
})();

if (typeof window !== 'undefined') window.FPBody = FPBody;
