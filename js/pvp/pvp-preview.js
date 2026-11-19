/* EARTH 2049: SAVE SEED 7 — gun pictures for create-a-class: a live, turnable 3D preview of the gun with its attachments,
 * and side-view thumbnails for the loadout and the weapon cards. The models are the first-person rig's GLBs
 * ('weapon.<vis>'); the GigaLeague's five load on demand through AR.Arsenal.fpModel. Two small WebGL canvases:
 * one live (moved into whichever panel shows it), one off-screen for thumbnails.
 */
(function (root) {
  'use strict';
  let live = null, thumbR = null;
  const thumbs = {}, pending = {};
  const VIEW = new THREE.Vector3(-1, 0.22, 0.32).normalize();       // gun points +Z: from -X the muzzle is on the right

  async function model(vis) {
    let g = root.AssetLoader?.getModel?.('weapon.' + vis);
    if (!g && root.AR?.Arsenal?.fpModel) g = await AR.Arsenal.fpModel(vis);
    return g?.scene?.userData?.weapon ? g : null;
  }
  /** a gun object with the rarity's parts and the class's attachments showing; flat painted look like the viewmodel */
  function assemble(g, att, tier, vis) {
    const man = g.scene.userData, R0 = man.rarities[Math.min(tier || 0, man.rarities.length - 1)];
    const fit = root.PvpAttach ? PvpAttach.apply(man, R0, att) : { show: R0.show };
    const obj = THREE.SkeletonUtils ? THREE.SkeletonUtils.clone(g.scene) : g.scene.clone(true);
    const show = new Set(fit.show);
    for (const n of Object.values(man.options || {}).flat()) { const o = obj.getObjectByName(n); if (o) { o.visible = show.has(n); o.scale.setScalar(show.has(n) ? 1 : 0); } }
    for (const n of ['shell', 'round']) { const o = obj.getObjectByName(n); if (o) o.visible = false; }
    const glass = new THREE.MeshBasicMaterial({ color: 0x9fe8d8, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
    let mat = null;
    obj.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      for (let q = o; q; q = q.parent) if (/_glass$/.test(q.name)) { o.material = glass; return; }
      if (!mat) mat = new THREE.MeshBasicMaterial({ map: o.material.map, side: THREE.DoubleSide, color: new THREE.Color(0.95, 0.95, 0.98) });
      o.material = mat;
    });
    // the rarity's paint, as the first-person gun wears it (async; the plain texture shows until it is ready)
    const fin = root.GunFeel?.finish?.(vis, tier || 0);
    if (fin && mat) obj.userData.ready = fin.then(t => { if (t) { mat.map = t; mat.needsUpdate = true; } });
    return obj;
  }
  // bounds of the visible parts only (hidden options sit at scale 0 but still count for Box3)
  function bounds(obj) {
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3(), tmp = new THREE.Box3();
    obj.traverse(o => {
      if (!o.isMesh) return;
      for (let q = o; q; q = q.parent) if (!q.visible || q.scale.x === 0) return;
      o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); b.union(tmp);
    });
    return b;
  }
  function stage() {
    const scene = new THREE.Scene(), pivot = new THREE.Group(); scene.add(pivot);
    const cam = new THREE.PerspectiveCamera(24, 2, 0.01, 30);
    return { scene, pivot, cam };
  }
  function frame(S, obj, aspect, pad = 1.0) {
    while (S.pivot.children.length) S.pivot.remove(S.pivot.children[0]);
    const b = bounds(obj), c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
    obj.position.sub(c); S.pivot.add(obj);
    const len = Math.max(size.z, size.y * aspect * 0.9, 0.2);
    const dist = (len / 2) / Math.tan(THREE.MathUtils.degToRad(S.cam.fov / 2)) / Math.max(1, aspect) * 1.25 * pad + size.x;
    S.cam.aspect = aspect; S.cam.updateProjectionMatrix();
    S.cam.position.copy(VIEW).multiplyScalar(dist); S.cam.lookAt(0, 0, 0);
  }

  /** a side-view picture of a gun (data URL), cached per gun + attachments + rarity */
  function thumb(vis, att, tier = 0, w = 300, h = 120) {
    const k = [vis, root.PvpAttach ? PvpAttach.key(att) : '', tier, w, h].join('|');
    if (thumbs[k]) return Promise.resolve(thumbs[k]);
    if (pending[k]) return pending[k];
    pending[k] = (async () => {
      const g = await model(vis); if (!g) return null;
      if (!thumbR) { const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); thumbR = { ren, S: stage() }; }
      const obj = assemble(g, att, tier, vis); await obj.userData.ready;
      // from here to toDataURL nothing awaits, so thumbnails drawn at the same time cannot share a half-set canvas
      thumbR.ren.setPixelRatio(1); thumbR.ren.setSize(w, h, false); thumbR.ren.setClearColor(0x000000, 0);
      frame(thumbR.S, obj, w / h, 0.92);
      thumbR.S.pivot.rotation.set(0, 0, 0);
      thumbR.ren.render(thumbR.S.scene, thumbR.S.cam);
      return (thumbs[k] = thumbR.ren.domElement.toDataURL('image/png'));
    })();
    return pending[k];
  }
  /** fill every <img data-thumb="vis|att+att|tier"> inside el */
  function fillThumbs(el) {
    el.querySelectorAll('img[data-thumb]').forEach(img => {
      const [vis, att, tier] = img.dataset.thumb.split('|');
      thumb(vis, att ? att.split('+') : [], +tier || 0).then(u => { if (u && img.isConnected) { img.src = u; img.classList.add('ok'); } });
    });
  }

  /** the live preview: put the canvas in host, show this gun; drag to turn it, it drifts back to the side view */
  async function show(host, vis, att, tier = 0) {
    if (!live) {
      const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });   // readable for screenshots
      ren.setPixelRatio(Math.min(2, root.devicePixelRatio || 1)); ren.setClearColor(0x000000, 0);
      live = { ren, S: stage(), yaw: 0, vy: 0, drag: null, key: '', raf: 0 };
      const cv = ren.domElement; cv.className = 'cacCanvas';
      cv.addEventListener('pointerdown', e => { live.drag = { x: e.clientX, yaw: live.yaw }; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', e => { if (live.drag) live.yaw = live.drag.yaw + (e.clientX - live.drag.x) * 0.012; });
      const up = () => { live.drag = null; };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    }
    const cv = live.ren.domElement;
    if (cv.parentNode !== host) host.appendChild(cv);
    const k = [vis, root.PvpAttach ? PvpAttach.key(att) : '', tier].join('|');
    const wh = () => [Math.max(200, host.clientWidth), Math.max(110, host.clientHeight)];
    if (k !== live.key) {
      live.key = k;
      host.classList.add('loading');
      const g = await model(vis);
      if (live.key !== k) return;                             // a newer request won
      host.classList.remove('loading');
      if (!g) return;
      const [w, h] = wh();
      frame(live.S, assemble(g, att, tier, vis), w / h);
    }
    if (!live.raf) {
      const tick = () => {
        if (!cv.isConnected) { live.raf = 0; return; }
        live.raf = requestAnimationFrame(tick);
        const [w, h] = wh();
        if (cv.width !== Math.round(w * live.ren.getPixelRatio()) || cv.height !== Math.round(h * live.ren.getPixelRatio())) {
          live.ren.setSize(w, h, false); live.S.cam.aspect = w / h; live.S.cam.updateProjectionMatrix();
        }
        if (!live.drag) live.yaw += (Math.sin(performance.now() / 2600) * 0.35 - live.yaw) * 0.03;      // a slow sway round the side view
        live.S.pivot.rotation.y = live.yaw;
        live.ren.render(live.S.scene, live.S.cam);
      };
      live.raf = requestAnimationFrame(tick);
    }
  }

  root.PvpPreview = { show, thumb, fillThumbs };
})(typeof window !== 'undefined' ? window : globalThis);
