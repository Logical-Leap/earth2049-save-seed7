/* EARTH 2049: SAVE SEED 7 — procedural asset factory v2 (concept-art matched) */
'use strict';

const Assets = (() => {
  const texCache = {};

  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function ctex(canvas, repeat) {
    const t = new THREE.CanvasTexture(canvas);
    t.encoding = THREE.sRGBEncoding;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    return t;
  }
  function hexCss(hex) { return '#' + hex.toString(16).padStart(6, '0'); }

  /* ================= sprite/util textures ================= */
  function glowTex() {
    if (texCache.glow) return texCache.glow;
    const c = cv(64, 64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    texCache.glow = new THREE.CanvasTexture(c); return texCache.glow;
  }
  function starTex() {
    if (texCache.star) return texCache.star;
    const c = cv(64, 64), x = c.getContext('2d');
    x.translate(32, 32);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,220,140,.6)'); g.addColorStop(1, 'rgba(255,180,60,0)');
    x.fillStyle = g;
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.moveTo(0, -30); x.lineTo(4.5, -4); x.lineTo(-4.5, -4); x.closePath(); x.fill();
      x.rotate(Math.PI / 2);
    }
    x.rotate(Math.PI / 4); x.scale(0.55, 0.55);
    for (let i = 0; i < 4; i++) {
      x.beginPath(); x.moveTo(0, -30); x.lineTo(4, -4); x.lineTo(-4, -4); x.closePath(); x.fill();
      x.rotate(Math.PI / 2);
    }
    texCache.star = new THREE.CanvasTexture(c); return texCache.star;
  }
  function beamTex() {
    if (texCache.beam) return texCache.beam;
    const c = cv(32, 128), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 128);
    texCache.beam = new THREE.CanvasTexture(c); return texCache.beam;
  }

  /* ================= environment textures ================= */
  function groundTex(theme) {
    const c = cv(512, 512), x = c.getContext('2d');
    x.fillStyle = hexCss(theme.ground); x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      const v = Math.random() * 22 | 0;
      x.fillStyle = `rgba(${v},${v},${v + 6},${0.25 + Math.random() * 0.3})`;
      x.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    const nc = hexCss(FACTIONS[theme.fac].neon);
    x.strokeStyle = nc; x.globalAlpha = 0.16; x.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128, 512); x.stroke();
      x.beginPath(); x.moveTo(0, i * 128); x.lineTo(512, i * 128); x.stroke();
    }
    x.globalAlpha = 0.18; x.fillStyle = '#000';
    for (let i = 0; i < 14; i++) {
      x.beginPath();
      x.ellipse(Math.random() * 512, Math.random() * 512, 20 + Math.random() * 60, 14 + Math.random() * 40, Math.random() * 3, 0, 7);
      x.fill();
    }
    x.globalAlpha = 1;
    return ctex(c, true);
  }

  function wallTex(theme) {
    const fac = FACTIONS[theme.fac];
    const c = cv(256, 256), x = c.getContext('2d');
    x.fillStyle = hexCss(fac.dark); x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 3;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) x.strokeRect(i * 64 + 2, j * 64 + 2, 60, 60);
    x.fillStyle = 'rgba(255,255,255,.045)';
    for (let i = 0; i < 8; i++) x.fillRect(Math.random() * 256, Math.random() * 256, 40 + Math.random() * 60, 3);
    const nc = hexCss(fac.neon);
    x.fillStyle = nc; x.shadowColor = nc; x.shadowBlur = 14;
    x.fillRect(0, 118, 256, 5);
    x.shadowBlur = 0;
    x.font = 'bold 26px Arial'; x.textAlign = 'center';
    x.fillStyle = 'rgba(255,255,255,.12)';
    x.fillText(theme.slogans[(Math.random() * theme.slogans.length) | 0], 128, 180);
    x.fillStyle = 'rgba(0,0,0,.3)';
    for (let i = 0; i < 10; i++) x.fillRect(Math.random() * 256, 200 + Math.random() * 56, 30 + Math.random() * 50, 20 + Math.random() * 30);
    return ctex(c, true);
  }

  function crateTex(theme) {
    const fac = FACTIONS[theme.fac];
    const c = cv(256, 256), x = c.getContext('2d');
    x.fillStyle = '#181c22'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(255,255,255,.1)'; x.lineWidth = 8; x.strokeRect(8, 8, 240, 240);
    x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 4; x.strokeRect(24, 24, 208, 208);
    for (let i = -6; i < 8; i++) {
      x.fillStyle = i % 2 ? '#0e0f12' : hexCss(fac.accent);
      x.globalAlpha = 0.8;
      x.beginPath(); x.moveTo(i * 24, 0); x.lineTo(i * 24 + 24, 0); x.lineTo(i * 24 + 44, 20); x.lineTo(i * 24 + 20, 20); x.fill();
    }
    x.globalAlpha = 1;
    x.font = 'bold 34px Arial'; x.textAlign = 'center';
    const nc = hexCss(fac.neon);
    x.fillStyle = nc; x.shadowColor = nc; x.shadowBlur = 12;
    x.fillText('GIGA-7', 128, 148);
    x.shadowBlur = 0;
    x.font = 'bold 15px Arial'; x.fillStyle = 'rgba(255,255,255,.35)';
    x.fillText('PROPERTY OF GIGACORP', 128, 190);
    return ctex(c);
  }

  function windowTex(neonHex) {
    const c = cv(128, 256), x = c.getContext('2d');
    x.fillStyle = '#05070c'; x.fillRect(0, 0, 128, 256);
    const warm = ['#ffd27a', '#a8c6ff', hexCss(neonHex), '#ffffff'];
    for (let j = 0; j < 16; j++) for (let i = 0; i < 6; i++) {
      if (Math.random() < 0.42) {
        x.fillStyle = warm[(Math.random() * warm.length) | 0];
        x.globalAlpha = 0.35 + Math.random() * 0.65;
        x.fillRect(6 + i * 20, 6 + j * 15, 12, 8);
      }
    }
    x.globalAlpha = 1;
    return ctex(c, true);
  }

  function signTex(text, colorHex, sub) {
    const c = cv(512, 160), x = c.getContext('2d');
    x.fillStyle = 'rgba(4,6,12,.92)'; x.fillRect(0, 0, 512, 160);
    const nc = hexCss(colorHex);
    x.strokeStyle = nc; x.lineWidth = 5; x.shadowColor = nc; x.shadowBlur = 18;
    x.strokeRect(8, 8, 496, 144);
    let fs = 64;
    x.font = `900 ${fs}px Arial`;
    while (x.measureText(text).width > 460 && fs > 22) { fs -= 4; x.font = `900 ${fs}px Arial`; }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#fff'; x.shadowBlur = 24; x.shadowColor = nc;
    x.fillText(text, 256, sub ? 66 : 80);
    if (sub) { x.font = '700 22px Arial'; x.fillStyle = nc; x.fillText(sub, 256, 122); }
    x.shadowBlur = 0;
    return ctex(c);
  }

  function skyTex(theme) {
    const c = cv(32, 512), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    const f = hexCss(theme.fog), s = hexCss(theme.sky);
    g.addColorStop(0, '#010102'); g.addColorStop(0.55, s); g.addColorStop(0.82, f); g.addColorStop(1, f);
    x.fillStyle = g; x.fillRect(0, 0, 32, 512);
    x.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 40; i++) x.fillRect(Math.random() * 32, Math.random() * 220, 1, 1);
    return ctex(c);
  }

  /* ================= character detail textures ================= */
  function scanlines(x, w, h) {
    x.fillStyle = 'rgba(0,0,0,.28)';
    for (let y = 0; y < h; y += 3) x.fillRect(0, y, w, 1);
  }
  // ShillZ sponsor-patch jacket panel
  function texPatches() {
    const key = 'patches' + ((Math.random() * 3) | 0);
    if (texCache[key]) return texCache[key];
    const c = cv(128, 128), x = c.getContext('2d');
    x.fillStyle = '#15130c'; x.fillRect(0, 0, 128, 128);
    const words = ['OBEY', '#AD', 'CONSOOM', 'TREND', 'LIKE', 'SUBSCRIBE', 'RESIST™', '999K', 'SPONSORED', 'CLAP 4\nCHANGE'];
    const cols = ['#ffe600', '#ff8c00', '#ffffff', '#111111'];
    for (let i = 0; i < 7; i++) {
      const px = Math.random() * 90, py = Math.random() * 100, pw = 30 + Math.random() * 34, ph = 14 + Math.random() * 14;
      const bg = cols[(Math.random() * cols.length) | 0];
      x.fillStyle = bg; x.fillRect(px, py, pw, ph);
      x.strokeStyle = 'rgba(0,0,0,.6)'; x.strokeRect(px, py, pw, ph);
      x.fillStyle = bg === '#111111' ? '#ffe600' : '#111';
      x.font = 'bold 9px Arial'; x.textAlign = 'center';
      x.fillText(words[(Math.random() * words.length) | 0].split('\n')[0], px + pw / 2, py + ph / 2 + 3);
    }
    // QR code patch
    const qx = 6 + Math.random() * 80, qy = 6 + Math.random() * 80;
    x.fillStyle = '#fff'; x.fillRect(qx, qy, 26, 26);
    x.fillStyle = '#000';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (Math.random() < 0.5) x.fillRect(qx + 1 + i * 3, qy + 1 + j * 3, 3, 3);
    texCache[key] = ctex(c);
    return texCache[key];
  }
  // Bot screens: smile | spider | 404 | ads | chart | eye
  function texScreen(kind) {
    const key = 'scr_' + kind;
    if (texCache[key]) return texCache[key];
    const c = cv(128, 96), x = c.getContext('2d');
    x.fillStyle = '#020604'; x.fillRect(0, 0, 128, 96);
    if (kind === 'smile') {
      x.strokeStyle = '#39ff14'; x.lineWidth = 5; x.shadowColor = '#39ff14'; x.shadowBlur = 8;
      x.beginPath(); x.arc(44, 36, 7, 0, 7); x.stroke();
      x.beginPath(); x.arc(84, 36, 7, 0, 7); x.stroke();
      x.beginPath(); x.arc(64, 52, 24, 0.25, Math.PI - 0.25); x.stroke();
    } else if (kind === 'spider') {
      x.strokeStyle = '#ff00d4'; x.fillStyle = '#ff00d4'; x.lineWidth = 4; x.shadowColor = '#ff00d4'; x.shadowBlur = 8;
      x.beginPath(); x.arc(64, 44, 13, 0, 7); x.fill();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + 0.4;
        x.beginPath(); x.moveTo(64 + Math.cos(a) * 12, 44 + Math.sin(a) * 12);
        x.lineTo(64 + Math.cos(a) * 30, 44 + Math.sin(a) * 30 - 6); x.stroke();
      }
      x.font = 'bold 12px Consolas,monospace'; x.textAlign = 'center';
      x.fillText('SPYD3R.exe', 64, 86);
    } else if (kind === '404') {
      x.fillStyle = '#39ff14'; x.shadowColor = '#39ff14'; x.shadowBlur = 10;
      x.font = '900 38px Arial'; x.textAlign = 'center';
      x.fillText('404', 64, 48);
      x.font = 'bold 11px Arial';
      x.fillText('HUMANITY', 64, 68); x.fillText('NOT FOUND', 64, 82);
    } else if (kind === 'ads') {
      const lines = ['BUY. OBEY.', 'CONSUME.', 'CLICK. LIKE. DIE.'];
      x.textAlign = 'center'; x.shadowBlur = 8;
      x.fillStyle = '#00e5ff'; x.shadowColor = '#00e5ff'; x.font = '900 17px Arial';
      x.fillText(lines[0], 64, 28);
      x.fillStyle = '#ffe600'; x.shadowColor = '#ffe600';
      x.fillText(lines[1], 64, 52);
      x.fillStyle = '#ff00d4'; x.shadowColor = '#ff00d4'; x.font = '900 12px Arial';
      x.fillText(lines[2], 64, 76);
    } else if (kind === 'chart') {
      x.strokeStyle = '#00ff88'; x.fillStyle = '#00ff88'; x.shadowColor = '#00ff88'; x.shadowBlur = 5;
      let y = 70;
      for (let i = 0; i < 14; i++) {
        const h = 8 + Math.random() * 26;
        x.fillStyle = Math.random() < 0.7 ? '#00ff88' : '#ff4455';
        x.fillRect(6 + i * 9, y - h, 5, h);
        y += (Math.random() - 0.55) * 8;
      }
      x.fillStyle = '#ffd700'; x.font = 'bold 12px Consolas,monospace';
      x.fillText('+999%', 90, 18);
    } else if (kind === 'eye') {
      x.strokeStyle = '#4da6ff'; x.fillStyle = '#4da6ff'; x.lineWidth = 4; x.shadowColor = '#4da6ff'; x.shadowBlur = 10;
      x.beginPath(); x.ellipse(64, 48, 36, 20, 0, 0, 7); x.stroke();
      x.beginPath(); x.arc(64, 48, 9, 0, 7); x.fill();
    }
    scanlines(x, 128, 96);
    texCache[key] = ctex(c);
    return texCache[key];
  }
  // LED visor strip
  function texVisor(text, color) {
    const key = 'vis_' + text + color;
    if (texCache[key]) return texCache[key];
    const c = cv(96, 32), x = c.getContext('2d');
    x.fillStyle = '#050505'; x.fillRect(0, 0, 96, 32);
    x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 6;
    x.font = '900 20px Consolas,monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 48, 17);
    scanlines(x, 96, 32);
    texCache[key] = ctex(c);
    return texCache[key];
  }

  /* ================= materials / geo ================= */
  function mat(color, o = {}) {
    return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.82, metalness: 0.25 }, o));
  }
  function emat(color, i = 1.6) {
    return new THREE.MeshStandardMaterial({ color: 0x0a0a0f, emissive: color, emissiveIntensity: i, roughness: 0.5, metalness: 0.1 });
  }
  function screenMat(kind) { return new THREE.MeshBasicMaterial({ map: texScreen(kind) }); }

  const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sph: new THREE.SphereGeometry(0.5, 12, 10),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    oct: new THREE.OctahedronGeometry(0.5, 0),
    tet: new THREE.TetrahedronGeometry(0.5, 0),
    cone: new THREE.ConeGeometry(0.5, 1, 8),
    torus: new THREE.TorusGeometry(0.5, 0.08, 8, 20),
    plane: new THREE.PlaneGeometry(1, 1),
  };

  function part(geo, m, sx, sy, sz, x, y, z) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.scale.set(sx, sy, sz); mesh.position.set(x, y, z);
    return mesh;
  }

  /* ================= rig core ================= */
  function newRig() {
    return { root: new THREE.Group(), legs: [], arms: [], head: null, torso: null, spin: [], fly: 0, baseY: 0, flash: [] };
  }
  function reg(rig, m) {
    rig.flash.push({ m, e: m.emissive ? m.emissive.clone() : new THREE.Color(0), i: m.emissiveIntensity || 0 });
    return m;
  }
  function setFlash(rig, f) {
    for (const r of rig.flash) {
      if (f > 0) { r.m.emissive.setRGB(1, 1, 1); r.m.emissiveIntensity = Math.max(r.i, 1.0) * f + r.i * (1 - f); }
      else { r.m.emissive.copy(r.e); r.m.emissiveIntensity = r.i; }
    }
  }
  function shadowBlob(rig, size) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    sp.scale.set(1.3 * size, 0.5 * size, 1);
    sp.position.y = 0.12;
    rig.root.add(sp);
  }

  /* ---------- generic humanoid chassis ---------- */
  // o: bodyW/D, skin, suit(top), pants, head opts, decor callbacks
  function humanoid(facId, o = {}) {
    const fac = FACTIONS[facId];
    const rig = newRig();
    const suit = reg(rig, mat(o.suit !== undefined ? o.suit : fac.dark, { roughness: 0.75 }));
    const pants = reg(rig, mat(o.pants !== undefined ? o.pants : 0x101318));
    const neon = reg(rig, emat(fac.neon, 1.8));
    const acc = reg(rig, emat(fac.accent, 1.4));
    const skin = reg(rig, mat(o.skin !== undefined ? o.skin : fac.skin, { roughness: 0.9, metalness: 0 }));
    rig.mats = { suit, pants, neon, acc, skin };
    const bw = o.bodyW || 1, bd = o.bodyD || 1;

    // legs
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(0.18 * s * bw, 0.85, 0);
      piv.add(part(GEO.box, pants, 0.17 * bw, 0.5, 0.2, 0, -0.25, 0));
      piv.add(part(GEO.box, pants, 0.15 * bw, 0.42, 0.18, 0, -0.65, 0.02));
      piv.add(part(GEO.box, reg(rig, mat(0x1c2027)), 0.17 * bw, 0.1, 0.3, 0, -0.85, 0.06)); // shoe
      if (o.kneePads) piv.add(part(GEO.box, suit, 0.16 * bw, 0.12, 0.08, 0, -0.42, 0.11));
      if (o.legTech) { piv.add(part(GEO.box, acc, 0.05, 0.3, 0.03, 0.09 * s * bw, -0.5, 0.1)); }
      rig.root.add(piv); rig.legs.push(piv);
    }
    // torso
    const torso = new THREE.Group(); torso.position.y = 0.85;
    torso.add(part(GEO.box, suit, 0.52 * bw, 0.62, 0.3 * bd, 0, 0.34, 0));
    torso.add(part(GEO.box, suit, 0.44 * bw, 0.16, 0.28 * bd, 0, 0.02, 0));  // waist
    if (o.belly) torso.add(part(GEO.sph, suit, 0.64 * bw, 0.62, 0.52 * bd, 0, 0.22, 0.05));
    rig.root.add(torso); rig.torso = torso;
    // arms
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set((0.33 * bw + 0.02) * s, 1.4, 0);
      const isCyber = (o.cyberArms === 'both') || (o.cyberArms && s === 1);
      if (isCyber) {
        const metal = reg(rig, mat(0x565e6b, { metalness: 0.7, roughness: 0.35 }));
        piv.add(part(GEO.box, metal, 0.16, 0.3, 0.16, 0, -0.14, 0));
        piv.add(part(GEO.sph, acc, 0.14, 0.14, 0.14, 0, -0.32, 0));
        piv.add(part(GEO.box, metal, 0.13, 0.32, 0.13, 0, -0.5, 0));
        piv.add(part(GEO.box, acc, 0.03, 0.28, 0.03, 0.07 * s, -0.36, 0.05));
        for (let f = -1; f <= 1; f++) piv.add(part(GEO.cone, metal, 0.035, 0.14, 0.035, f * 0.045, -0.72, 0.02));
      } else {
        piv.add(part(GEO.box, o.bareArms ? skin : suit, 0.14, 0.36, 0.14, 0, -0.16, 0));
        piv.add(part(GEO.box, o.bareArms ? skin : pants, 0.12, 0.3, 0.12, 0, -0.48, 0));
        piv.add(part(GEO.box, reg(rig, mat(0x181b22)), 0.13, 0.1, 0.13, 0, -0.64, 0)); // glove
      }
      rig.root.add(piv); rig.arms.push(piv);
    }
    // head
    const headG = new THREE.Group(); headG.position.y = 1.6;
    headG.add(part(GEO.box, skin, 0.26, 0.28, 0.26, 0, 0.15, 0));
    rig.root.add(headG); rig.head = headG;
    return rig;
  }

  /* ---------- faction dressing helpers ---------- */
  function dressShill(rig, big) {
    const { neon, acc } = rig.mats;
    const t = rig.torso, h = rig.head;
    const yell = reg(rig, mat(0xd8c400, { roughness: 0.6 }));
    // hi-vis jacket panels
    t.add(part(GEO.box, yell, 0.56 * (big ? 1.55 : 1.25), 0.2, 0.34, 0, 0.52, 0));            // shoulders yoke
    t.add(part(GEO.box, neon, 0.08, 0.62, 0.02, -0.14 * (big ? 1.5 : 1.2), 0.3, big ? 0.34 : 0.24)); // straps
    t.add(part(GEO.box, neon, 0.08, 0.62, 0.02, 0.14 * (big ? 1.5 : 1.2), 0.3, big ? 0.34 : 0.24));
    // sponsor patch panel
    const patch = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: texPatches() }));
    patch.scale.set(0.34, 0.4, 1); patch.position.set(0, 0.26, (big ? 0.36 : 0.26));
    t.add(patch);
    // LED visor + mohawk
    const vis = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: texVisor(big ? 'TRUST' : 'X  X', '#ffe600') }));
    vis.scale.set(0.3, 0.1, 1); vis.position.set(0, 0.17, 0.135);
    h.add(vis);
    h.add(part(GEO.box, neon, 0.05, 0.14, 0.3, 0, 0.36, 0));   // mohawk
    h.add(part(GEO.box, rig.mats.suit, 0.3, 0.1, 0.3, 0, 0.29, 0)); // headset band
    h.add(part(GEO.sph, acc, 0.09, 0.09, 0.09, -0.16, 0.15, 0)); // ear cups
    h.add(part(GEO.sph, acc, 0.09, 0.09, 0.09, 0.16, 0.15, 0));
  }
  function attachMegaphone(rig) {
    const g = new THREE.Group();
    const cone = part(GEO.cone, mat(0xcfd3d8, { metalness: 0.5 }), 0.16, 0.2, 0.16, 0, -0.74, 0.18);
    cone.rotation.x = -Math.PI / 2;
    g.add(cone);
    g.add(part(GEO.cyl, rig.mats.neon, 0.05, 0.12, 0.05, 0, -0.74, 0.04));
    rig.arms[1].add(g);
  }
  function attachBat(rig) {
    const bat = part(GEO.box, reg(rig, mat(0xc9a227)), 0.07, 0.8, 0.07, 0, -0.9, 0.1);
    bat.rotation.x = 0.4;
    rig.arms[1].add(bat);
  }
  function attachPhone(rig) {
    const ph = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: texScreen('ads') }));
    ph.scale.set(0.12, 0.18, 1); ph.position.set(0, -0.68, 0.1); ph.rotation.x = -0.5;
    rig.arms[0].add(ph);
    rig.arms[0].rotation.x = -0.9;
  }
  function dressMusker(rig, boss) {
    const { acc, neon } = rig.mats;
    const t = rig.torso, h = rig.head;
    // spine implant + chest port
    t.add(part(GEO.cyl, reg(rig, mat(0x565e6b, { metalness: 0.7 })), 0.07, 0.5, 0.07, 0, 0.32, -0.17));
    t.add(part(GEO.box, acc, 0.04, 0.46, 0.03, 0, 0.32, -0.2));
    t.add(part(GEO.sph, neon, 0.08, 0.08, 0.05, -0.12, 0.42, 0.16));
    t.add(part(GEO.sph, acc, 0.06, 0.06, 0.04, 0.1, 0.3, 0.16));
    // neural cables head->back
    const cbl = part(GEO.cyl, reg(rig, mat(0x1a1d24)), 0.03, 0.36, 0.03, 0.1, 0.62, -0.16);
    cbl.rotation.x = 0.5; t.add(cbl);
    // mask + glowing eyes
    h.add(part(GEO.box, reg(rig, mat(0x22262e)), 0.27, 0.12, 0.1, 0, 0.08, 0.11));
    h.add(part(GEO.box, neon, 0.07, 0.035, 0.02, -0.07, 0.2, 0.135));
    h.add(part(GEO.box, neon, 0.07, 0.035, 0.02, 0.07, 0.2, 0.135));
    if (boss) h.add(part(GEO.box, acc, 0.3, 0.04, 0.04, 0, 0.28, 0.1));
  }
  function attachArcBlade(rig, side) {
    const bl = part(GEO.box, rig.mats.acc, 0.03, 0.55, 0.06, 0, -0.62, 0.14);
    bl.rotation.x = -0.35;
    rig.arms[side].add(bl);
  }
  function attachArmCannon(rig) {
    const metal = reg(rig, mat(0x565e6b, { metalness: 0.7 }));
    const c1 = part(GEO.cyl, metal, 0.14, 0.36, 0.14, 0, -0.6, 0.12);
    c1.rotation.x = Math.PI / 2;
    rig.arms[1].add(c1);
    const ring = part(GEO.torus, rig.mats.acc, 0.16, 0.16, 0.16, 0, -0.6, 0.24);
    rig.arms[1].add(ring);
  }
  function dressBotNode(rig) {
    const { neon, acc } = rig.mats;
    const h = rig.head, t = rig.torso;
    h.children.length = 0;
    h.add(part(GEO.box, reg(rig, mat(0x232830, { metalness: 0.6, roughness: 0.4 })), 0.36, 0.3, 0.26, 0, 0.15, 0));
    const face = new THREE.Mesh(GEO.plane, screenMat(Math.random() < 0.5 ? 'smile' : '404'));
    face.scale.set(0.3, 0.22, 1); face.position.set(0, 0.15, 0.135);
    h.add(face);
    h.add(part(GEO.cyl, rig.mats.pants, 0.02, 0.24, 0.02, 0.13, 0.4, 0));
    h.add(part(GEO.sph, acc, 0.05, 0.05, 0.05, 0.13, 0.53, 0));
    h.add(part(GEO.cyl, rig.mats.pants, 0.015, 0.16, 0.015, -0.11, 0.37, 0));
    // chest mini-screen + cables
    const cs = new THREE.Mesh(GEO.plane, screenMat('ads'));
    cs.scale.set(0.2, 0.14, 1); cs.position.set(0, 0.34, 0.16);
    t.add(cs);
    t.add(part(GEO.box, neon, 0.4, 0.03, 0.02, 0, 0.06, 0.16));
    const cbl = part(GEO.cyl, reg(rig, mat(0x14171c)), 0.025, 0.3, 0.025, -0.15, 0.55, -0.14);
    cbl.rotation.x = 0.6; t.add(cbl);
  }
  function dressCryptid(rig, boss) {
    const { neon } = rig.mats;
    const t = rig.torso, h = rig.head;
    const coat = reg(rig, mat(0x0c0b09, { roughness: 0.6 }));
    const gold = reg(rig, emat(0xffd700, 1.1));
    const goldSolid = reg(rig, mat(0xc9a227, { metalness: 0.85, roughness: 0.3 }));
    // long coat body + skirt flaps
    t.add(part(GEO.box, coat, 0.58, 0.86, 0.36, 0, 0.24, 0));
    const flapL = part(GEO.box, coat, 0.22, 0.5, 0.3, -0.18, -0.4, -0.02); flapL.rotation.z = 0.12; t.add(flapL);
    const flapR = part(GEO.box, coat, 0.22, 0.5, 0.3, 0.18, -0.4, -0.02); flapR.rotation.z = -0.12; t.add(flapR);
    // gold trim
    t.add(part(GEO.box, gold, 0.02, 0.84, 0.02, -0.09, 0.24, 0.185));
    t.add(part(GEO.box, gold, 0.02, 0.84, 0.02, 0.09, 0.24, 0.185));
    t.add(part(GEO.box, gold, 0.5, 0.02, 0.02, 0, 0.62, 0.185));
    // shirt + chain
    t.add(part(GEO.box, reg(rig, mat(0xe8e4da)), 0.16, 0.3, 0.02, 0, 0.45, 0.19));
    const chain = part(GEO.torus, goldSolid, 0.24, 0.24, 0.24, 0, 0.58, 0.12);
    chain.rotation.x = 1.2; t.add(chain);
    // slick hair + VR rig
    h.add(part(GEO.box, reg(rig, mat(0x0a0a0c)), 0.28, 0.1, 0.28, 0, 0.31, -0.01));
    const vr = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: texScreen('chart') }));
    vr.scale.set(0.3, 0.12, 1); vr.position.set(0, 0.17, 0.15);
    h.add(vr);
    h.add(part(GEO.box, goldSolid, 0.34, 0.04, 0.1, 0, 0.25, 0.08));
    if (boss) {
      const crown = part(GEO.oct, gold, 0.24, 0.32, 0.24, 0, 0.55, 0);
      h.add(crown); rig.spin.push(crown);
    }
  }
  function attachTablet(rig) {
    const tab = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: texScreen('chart'), transparent: true, opacity: 0.92 }));
    tab.scale.set(0.26, 0.34, 1); tab.position.set(0, -0.6, 0.16); tab.rotation.x = -0.7;
    rig.arms[0].add(tab);
    rig.arms[0].rotation.x = -0.85;
  }
  function dressTrooper(rig) {
    const { neon } = rig.mats;
    const t = rig.torso, h = rig.head;
    const armor = reg(rig, mat(0x151b26, { metalness: 0.55, roughness: 0.4 }));
    t.add(part(GEO.box, armor, 0.5, 0.34, 0.1, 0, 0.42, 0.14));
    t.add(part(GEO.box, armor, 0.44, 0.2, 0.08, 0, 0.12, 0.14));
    t.add(part(GEO.box, neon, 0.3, 0.03, 0.02, 0, 0.5, 0.2));
    t.add(part(GEO.box, armor, 0.2, 0.12, 0.34, -0.34, 0.58, 0));
    t.add(part(GEO.box, armor, 0.2, 0.12, 0.34, 0.34, 0.58, 0));
    t.add(part(GEO.box, neon, 0.18, 0.025, 0.3, -0.34, 0.65, 0));
    t.add(part(GEO.box, neon, 0.18, 0.025, 0.3, 0.34, 0.65, 0));
    h.children.length = 0;
    h.add(part(GEO.box, armor, 0.3, 0.32, 0.3, 0, 0.15, 0));
    h.add(part(GEO.box, neon, 0.24, 0.05, 0.03, 0, 0.16, 0.16));
  }
  function attachRifle(rig) {
    const dark = reg(rig, mat(0x14171d, { metalness: 0.6, roughness: 0.4 }));
    const g = new THREE.Group();
    g.position.set(0, -0.6, 0.1);
    g.add(part(GEO.box, dark, 0.07, 0.1, 0.55, 0, 0, 0.14));
    const brl = part(GEO.cyl, dark, 0.04, 0.24, 0.04, 0, 0.02, 0.5); brl.rotation.x = Math.PI / 2; g.add(brl);
    g.add(part(GEO.box, dark, 0.05, 0.16, 0.06, 0, -0.11, 0.08));
    g.add(part(GEO.box, rig.mats.acc, 0.03, 0.03, 0.2, 0, 0.07, 0.2));
    rig.arms[1].add(g);
  }

  /* ---------- special chassis ---------- */
  function droneRig() {
    const fac = FACTIONS.cryptids;
    const rig = newRig();
    const gold = reg(rig, mat(0xc9a227, { metalness: 0.85, roughness: 0.3 }));
    const neon = reg(rig, emat(0xffd700, 1.6));
    const lens = reg(rig, emat(0x00ff88, 2.2));
    rig.root.add(part(GEO.oct, gold, 0.66, 0.9, 0.66, 0, 0, 0));
    const ring = part(GEO.torus, neon, 1.05, 1.05, 1.05, 0, 0, 0); ring.rotation.x = Math.PI / 2;
    rig.root.add(ring); rig.spin.push(ring);
    rig.root.add(part(GEO.sph, lens, 0.17, 0.17, 0.17, 0, -0.02, 0.3));
    for (const s of [-1, 1]) {
      const scr = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: texScreen('chart') }));
      scr.scale.set(0.24, 0.18, 1); scr.position.set(0.28 * s, 0.05, 0); scr.rotation.y = s * Math.PI / 2;
      rig.root.add(scr);
    }
    rig.fly = 2.3; rig.baseY = rig.fly;
    return rig;
  }

  function sentinelRig() {   // Bot "Ad Broadcaster" — quad walker plastered in screens
    const rig = newRig();
    const body = reg(rig, mat(0x1a1f27, { metalness: 0.55, roughness: 0.45 }));
    const neon = reg(rig, emat(0x39ff14, 1.8));
    const acc = reg(rig, emat(0xff00d4, 1.5));
    const core = new THREE.Group(); core.position.y = 1.15;
    core.add(part(GEO.box, body, 0.85, 0.9, 0.55, 0, 0.1, 0));
    const big = new THREE.Mesh(GEO.plane, screenMat('ads'));
    big.scale.set(0.72, 0.55, 1); big.position.set(0, 0.16, 0.285);
    core.add(big);
    const sL = new THREE.Mesh(GEO.plane, screenMat('smile'));
    sL.scale.set(0.4, 0.3, 1); sL.position.set(-0.43, 0.15, 0); sL.rotation.y = -Math.PI / 2;
    core.add(sL);
    const sR = new THREE.Mesh(GEO.plane, screenMat('404'));
    sR.scale.set(0.4, 0.3, 1); sR.position.set(0.43, 0.15, 0); sR.rotation.y = Math.PI / 2;
    core.add(sR);
    core.add(part(GEO.box, neon, 0.88, 0.05, 0.58, 0, 0.6, 0));
    for (const s of [-1, 1]) {
      const horn = part(GEO.cone, body, 0.14, 0.24, 0.14, 0.24 * s, 0.78, 0.1);
      horn.rotation.x = -Math.PI / 2.4; core.add(horn);
      core.add(part(GEO.sph, acc, 0.06, 0.06, 0.06, 0.24 * s, 0.84, 0.2));
    }
    core.add(part(GEO.cyl, body, 0.025, 0.5, 0.025, 0, 0.95, -0.15));
    core.add(part(GEO.sph, neon, 0.07, 0.07, 0.07, 0, 1.22, -0.15));
    rig.root.add(core); rig.torso = core;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const piv = new THREE.Group();
      piv.position.set(Math.cos(a) * 0.42, 0.9, Math.sin(a) * 0.42);
      piv.rotation.y = -a;
      const seg = part(GEO.cyl, body, 0.1, 1.15, 0.1, 0.42, -0.3, 0); seg.rotation.z = 1.0;
      piv.add(seg);
      const seg2 = part(GEO.cyl, body, 0.08, 0.7, 0.08, 0.85, -0.72, 0); seg2.rotation.z = -0.4;
      piv.add(seg2);
      piv.add(part(GEO.sph, neon, 0.08, 0.08, 0.08, 0.98, -1.05, 0));
      rig.root.add(piv); rig.legs.push(piv);
    }
    return rig;
  }

  function enforcerRig() {
    const rig = newRig();
    const body = reg(rig, mat(0x0c1018, { metalness: 0.55, roughness: 0.45 }));
    const grey = reg(rig, mat(0x2a3342, { metalness: 0.5, roughness: 0.5 }));
    const neon = reg(rig, emat(0x4da6ff, 1.8));
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(0.34 * s, 0.98, 0);
      piv.add(part(GEO.box, body, 0.3, 0.5, 0.36, 0, -0.24, 0));
      piv.add(part(GEO.box, grey, 0.26, 0.44, 0.3, 0, -0.7, 0.04));
      piv.add(part(GEO.cyl, neon, 0.04, 0.3, 0.04, 0.14 * s, -0.42, 0.12));
      piv.add(part(GEO.box, body, 0.3, 0.12, 0.44, 0, -0.94, 0.06));
      rig.root.add(piv); rig.legs.push(piv);
    }
    const torso = new THREE.Group(); torso.position.y = 1.0;
    torso.add(part(GEO.box, body, 0.95, 0.72, 0.6, 0, 0.4, 0));
    torso.add(part(GEO.box, grey, 0.7, 0.4, 0.1, 0, 0.42, 0.3));
    torso.add(part(GEO.sph, neon, 0.2, 0.2, 0.1, 0, 0.44, 0.36));
    for (const s of [-1, 1]) {
      torso.add(part(GEO.box, body, 0.34, 0.3, 0.5, 0.6 * s, 0.7, 0));
      for (let i = 0; i < 3; i++) torso.add(part(GEO.cyl, grey, 0.05, 0.08, 0.05, 0.6 * s + (i - 1) * 0.09, 0.76, 0.22));
      for (let i = 0; i < 3; i++) torso.add(part(GEO.sph, reg(rig, emat(0xff5533, 1.4)), 0.035, 0.035, 0.035, 0.6 * s + (i - 1) * 0.09, 0.76, 0.27));
    }
    rig.root.add(torso); rig.torso = torso;
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(0.66 * s, 1.6, 0);
      piv.add(part(GEO.cyl, body, 0.17, 0.5, 0.17, 0, -0.22, 0.05));
      const cn = part(GEO.cyl, grey, 0.12, 0.4, 0.12, 0, -0.5, 0.14); cn.rotation.x = Math.PI / 2.6;
      piv.add(cn);
      rig.root.add(piv); rig.arms.push(piv);
    }
    const headG = new THREE.Group(); headG.position.y = 1.92;
    headG.add(part(GEO.box, body, 0.3, 0.22, 0.32, 0, 0.1, 0));
    headG.add(part(GEO.box, neon, 0.24, 0.05, 0.03, 0, 0.1, 0.17));
    rig.root.add(headG); rig.head = headG;
    return rig;
  }

  function spyderRig() {
    const rig = newRig();
    const body = reg(rig, mat(0x10141a, { metalness: 0.55, roughness: 0.45 }));
    const neon = reg(rig, emat(0x39ff14, 2));
    const acc = reg(rig, emat(0xff00d4, 1.7));
    const core = new THREE.Group(); core.position.y = 1.05;
    core.add(part(GEO.sph, body, 1.15, 0.95, 1.15, 0, 0, 0));
    core.add(part(GEO.box, body, 0.66, 0.55, 0.5, 0, 0.6, 0));
    const face = new THREE.Mesh(GEO.plane, screenMat('spider'));
    face.scale.set(0.56, 0.42, 1); face.position.set(0, 0.6, 0.26);
    core.add(face);
    const adL = new THREE.Mesh(GEO.plane, screenMat('ads'));
    adL.scale.set(0.4, 0.3, 1); adL.position.set(-0.5, 0.1, 0.28); adL.rotation.y = -0.5;
    core.add(adL);
    const adR = new THREE.Mesh(GEO.plane, screenMat('smile'));
    adR.scale.set(0.4, 0.3, 1); adR.position.set(0.5, 0.1, 0.28); adR.rotation.y = 0.5;
    core.add(adR);
    core.add(part(GEO.sph, acc, 0.15, 0.15, 0.15, -0.28, 0.14, 0.5));
    core.add(part(GEO.sph, acc, 0.15, 0.15, 0.15, 0.28, 0.14, 0.5));
    for (const s of [-1, 1]) {
      core.add(part(GEO.cyl, body, 0.02, 0.5, 0.02, 0.2 * s, 1.0, -0.1));
      core.add(part(GEO.sph, neon, 0.06, 0.06, 0.06, 0.2 * s, 1.28, -0.1));
    }
    rig.root.add(core); rig.torso = core;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.26;
      const piv = new THREE.Group();
      piv.position.set(Math.cos(a) * 0.5, 1.05, Math.sin(a) * 0.5);
      piv.rotation.y = -a;
      const seg = part(GEO.cyl, body, 0.09, 1.5, 0.09, 0.6, -0.35, 0); seg.rotation.z = 1.1;
      piv.add(seg);
      const seg2 = part(GEO.cyl, body, 0.07, 0.9, 0.07, 1.15, -0.85, 0); seg2.rotation.z = -0.3;
      piv.add(seg2);
      piv.add(part(GEO.sph, neon, 0.09, 0.09, 0.09, 1.25, -1.28, 0));
      rig.root.add(piv); rig.legs.push(piv);
    }
    return rig;
  }

  function turingRig() {
    const rig = newRig();
    const body = reg(rig, mat(0x05060a, { metalness: 0.75, roughness: 0.28 }));
    const white = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    const red = reg(rig, emat(0xff2030, 2.6));
    function edged(sx, sy, sz, x, y, z, parent) {
      const m = part(GEO.box, body, sx, sy, sz, x, y, z);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sx * 1.01, sy * 1.01, sz * 1.01)), white);
      e.position.set(x, y, z);
      parent.add(m); parent.add(e);
      return m;
    }
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(0.16 * s, 0.95, 0);
      edged(0.14, 0.95, 0.16, 0, -0.48, 0, piv);
      rig.root.add(piv); rig.legs.push(piv);
    }
    const torso = new THREE.Group(); torso.position.y = 0.95;
    edged(0.5, 0.75, 0.26, 0, 0.38, 0, torso);
    edged(0.36, 0.14, 0.2, 0, -0.05, 0, torso);
    rig.root.add(torso); rig.torso = torso;
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(0.34 * s, 1.62, 0);
      edged(0.11, 0.8, 0.11, 0, -0.36, 0, piv);
      rig.root.add(piv); rig.arms.push(piv);
    }
    const headG = new THREE.Group(); headG.position.y = 1.84;
    edged(0.26, 0.32, 0.26, 0, 0.16, 0, headG);
    headG.add(part(GEO.sph, red, 0.11, 0.11, 0.11, 0, 0.16, 0.14));
    rig.root.add(headG); rig.head = headG;
    const shardM = reg(rig, emat(0xffffff, 1.1));
    const orbit = new THREE.Group(); orbit.position.y = 1.4;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      orbit.add(part(GEO.tet, shardM, 0.15, 0.3, 0.15, Math.cos(a) * 0.95, Math.sin(i * 2.3) * 0.35, Math.sin(a) * 0.95));
    }
    rig.root.add(orbit); rig.spin.push(orbit);
    return rig;
  }

  /* ---------- enemy builder ---------- */
  function buildEnemy(typeId) {
    const t = ETYPES[typeId];
    let rig;
    switch (typeId) {
      case 'shill':
        rig = humanoid('shillz', { belly: true, bodyW: 1.25, suit: 0x17150e });
        dressShill(rig, false); attachPhone(rig);
        break;
      case 'hypebeast':
        rig = humanoid('shillz', { belly: true, bodyW: 1.6, bodyD: 1.4, suit: 0x17150e });
        dressShill(rig, true); attachBat(rig);
        break;
      case 'streamer': {
        rig = humanoid('shillz', { belly: true, bodyW: 1.15, suit: 0x17150e });
        dressShill(rig, false); attachMegaphone(rig);
        const halo = part(GEO.torus, reg(rig, emat(0xfff6d0, 2)), 0.52, 0.52, 0.52, 0, 0.16, 0.06);
        rig.head.add(halo); rig.spin.push(halo);
        break;
      }
      case 'runner':
        rig = humanoid('muskers', { bareArms: true, cyberArms: true, pants: 0x14161c, legTech: true });
        dressMusker(rig, false); attachArcBlade(rig, 1);
        break;
      case 'lancer':
        rig = humanoid('muskers', { bareArms: true, pants: 0x14161c });
        dressMusker(rig, false); attachArmCannon(rig);
        break;
      case 'node':
        rig = humanoid('bots', { skin: 0x30363d, suit: 0x232830, pants: 0x1a1e26, bodyW: 0.85 });
        dressBotNode(rig); attachRifle(rig);
        break;
      case 'sentinel': rig = sentinelRig(); break;
      case 'cdrone': rig = droneRig(); break;
      case 'broker':
        rig = humanoid('cryptids', { suit: 0x0c0b09 });
        dressCryptid(rig, false); attachTablet(rig);
        break;
      case 'trooper':
        rig = humanoid('gigacorp', { suit: 0x11161f, pants: 0x0d1119, kneePads: true });
        dressTrooper(rig); attachRifle(rig);
        break;
      case 'enforcer': rig = enforcerRig(); break;
      default: rig = humanoid('gigacorp', {});
    }
    rig.root.scale.setScalar(t.size);
    rig.size = t.size;
    shadowBlob(rig, 1);
    rig.setFlash = f => setFlash(rig, f);
    return rig;
  }

  function buildBoss(bossId) {
    const b = BOSSES[bossId];
    let rig;
    switch (bossId) {
      case 'riya': {
        rig = humanoid('shillz', { bodyW: 1.15, suit: 0x17150e });
        dressShill(rig, false); attachMegaphone(rig);
        const halo = part(GEO.torus, reg(rig, emat(0xfff6d0, 2.2)), 0.7, 0.7, 0.7, 0, 0.2, 0.04);
        rig.head.add(halo); rig.spin.push(halo);
        const skirt = new THREE.Group(); skirt.position.y = 1.0;
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * Math.PI * 2 + 0.4;
          const p = new THREE.Mesh(GEO.plane, screenMat('ads'));
          p.scale.set(0.34, 0.44, 1);
          p.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
          p.rotation.y = -a + Math.PI / 2;
          skirt.add(p);
        }
        rig.root.add(skirt); rig.spin.push(skirt);
        break;
      }
      case 'magnus':
        rig = humanoid('muskers', { bareArms: true, cyberArms: 'both', pants: 0x14161c, legTech: true, bodyW: 1.35 });
        dressMusker(rig, true); attachArcBlade(rig, 0); attachArcBlade(rig, 1);
        for (const s of [-1, 1]) {
          const spike = part(GEO.cone, rig.mats.acc, 0.09, 0.5, 0.09, 0.24 * s, 1.62, -0.24);
          spike.rotation.x = 0.5; rig.root.add(spike);
        }
        break;
      case 'spyder': rig = spyderRig(); break;
      case 'blitz': {
        rig = humanoid('cryptids', { suit: 0x0c0b09, bodyW: 1.2 });
        dressCryptid(rig, true); attachTablet(rig);
        const gold = reg(rig, emat(0xffd700, 1.5));
        const orbit = new THREE.Group(); orbit.position.y = 1.3;
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2;
          const cn = part(GEO.cyl, gold, 0.3, 0.05, 0.3, Math.cos(a) * 0.95, Math.sin(i) * 0.2, Math.sin(a) * 0.95);
          cn.rotation.x = Math.PI / 2; orbit.add(cn);
        }
        rig.root.add(orbit); rig.spin.push(orbit);
        rig.fly = b.fly || 0; rig.baseY = rig.fly ? b.fly : 0;
        break;
      }
      case 'turing': rig = turingRig(); break;
      default: rig = humanoid('gigacorp', {});
    }
    rig.root.scale.setScalar(b.size);
    rig.size = b.size;
    shadowBlob(rig, 1.4);
    rig.setFlash = f => setFlash(rig, f);
    return rig;
  }

  /* ================= gun viewmodels (Global Arsenal) ================= */
  function buildGun(clsKey) {
    const g = new THREE.Group();
    const dark = mat(0x14171d, { metalness: 0.65, roughness: 0.35 });
    const mid = mat(0x252b36, { metalness: 0.55, roughness: 0.4 });
    const grip = mat(0x1b1e26, { roughness: 0.7 });
    const glove = mat(0x1a1d26, { roughness: 0.8 });
    const acc = emat(0x4caf50, 1.6);  // recolored per rarity
    let slide = null, tipZ = -0.5;
    const B = (m, sx, sy, sz, x, y, z) => { const p = part(GEO.box, m, sx, sy, sz, x, y, z); g.add(p); return p; };
    const C = (m, r, len, x, y, z) => { const p = part(GEO.cyl, m, r * 2, len, r * 2, x, y, z); p.rotation.x = Math.PI / 2; g.add(p); return p; };
    const handR = (x, y, z) => { const h = B(glove, 0.075, 0.09, 0.1, x, y, z); h.rotation.x = 0.3; B(glove, 0.06, 0.06, 0.16, x + 0.01, y - 0.07, z + 0.1).rotation.x = 0.9; return h; };
    const handL = (x, y, z) => { const h = B(glove, 0.075, 0.08, 0.1, x, y, z); B(glove, 0.06, 0.06, 0.18, x - 0.02, y - 0.06, z + 0.12).rotation.x = 1.1; return h; };

    switch (clsKey) {
      case 'pistol':
        slide = B(mid, 0.055, 0.07, 0.3, 0, 0.045, -0.1);
        B(dark, 0.05, 0.08, 0.26, 0, -0.02, -0.08);
        C(dark, 0.02, 0.08, 0, 0.045, -0.27);
        B(grip, 0.05, 0.14, 0.08, 0, -0.12, 0.03).rotation.x = 0.22;
        B(dark, 0.04, 0.02, 0.09, 0, -0.055, -0.03);
        B(acc, 0.058, 0.014, 0.12, 0, 0.085, -0.13);
        B(mid, 0.012, 0.03, 0.012, 0, 0.095, -0.24);
        handR(0, -0.12, 0.05);
        tipZ = -0.3; break;
      case 'smg':
        B(dark, 0.06, 0.1, 0.4, 0, 0, -0.1);
        slide = B(mid, 0.05, 0.05, 0.16, 0, 0.03, 0.02);
        C(dark, 0.035, 0.22, 0, 0.02, -0.4);
        for (let i = 0; i < 3; i++) B(mid, 0.065, 0.02, 0.05, 0, 0.035 - i * 0.035, -0.26);
        B(grip, 0.05, 0.15, 0.07, 0, -0.13, 0.05).rotation.x = 0.2;
        B(acc, 0.045, 0.16, 0.05, 0, -0.14, -0.1).rotation.x = -0.12;   // glowing mag
        B(dark, 0.05, 0.05, 0.14, 0, -0.02, 0.16);                      // stock
        B(acc, 0.062, 0.012, 0.24, 0, 0.062, -0.12);
        handR(0, -0.13, 0.07); handL(-0.01, -0.05, -0.24);
        tipZ = -0.53; break;
      case 'shotgun':
        C(dark, 0.037, 0.5, 0, 0.05, -0.2);
        C(dark, 0.037, 0.5, 0, -0.01, -0.2);
        B(mid, 0.075, 0.11, 0.26, 0, 0, 0.08);
        C(mid, 0.075, 0.12, 0, -0.06, -0.02);                            // drum
        slide = B(grip, 0.07, 0.06, 0.14, 0, -0.045, -0.25);            // pump
        B(grip, 0.05, 0.13, 0.08, 0, -0.12, 0.13).rotation.x = 0.25;
        B(mid, 0.055, 0.07, 0.16, 0, -0.01, 0.22);
        B(acc, 0.08, 0.014, 0.1, 0, 0.062, 0.0);
        handR(0, -0.12, 0.15); handL(0, -0.09, -0.25);
        tipZ = -0.47; break;
      case 'ar':
        B(dark, 0.06, 0.1, 0.34, 0, 0, 0.0);                             // lower
        B(mid, 0.055, 0.06, 0.44, 0, 0.065, -0.08);                      // upper
        B(dark, 0.06, 0.08, 0.26, 0, 0.01, -0.3);                        // handguard
        for (let i = 0; i < 3; i++) B(mid, 0.068, 0.015, 0.04, 0, 0.045, -0.24 - i * 0.08);
        C(dark, 0.022, 0.2, 0, 0.03, -0.52);
        B(mid, 0.05, 0.05, 0.06, 0, 0.03, -0.6);                         // brake
        B(grip, 0.045, 0.14, 0.07, 0, -0.13, 0.08).rotation.x = 0.25;
        slide = B(acc, 0.02, 0.03, 0.06, 0.045, 0.06, 0.04);             // charging handle glow
        B(acc, 0.05, 0.14, 0.06, 0, -0.13, -0.08).rotation.x = -0.2;     // mag
        B(mid, 0.05, 0.06, 0.18, 0, 0.0, 0.2);                           // stock
        B(mid, 0.014, 0.05, 0.014, 0, 0.11, -0.05);                      // sight
        B(mid, 0.014, 0.04, 0.014, 0, 0.105, -0.45);
        handR(0, -0.13, 0.1); handL(-0.005, -0.06, -0.32);
        tipZ = -0.64; break;
      case 'dmr':
        B(dark, 0.055, 0.09, 0.5, 0, 0, -0.05);
        C(dark, 0.024, 0.5, 0, 0.02, -0.55);
        B(mid, 0.06, 0.06, 0.1, 0, 0.02, -0.78);                         // brake
        C(mid, 0.05, 0.2, 0, 0.115, -0.12);                              // scope
        C(mid, 0.06, 0.05, 0, 0.115, -0.24);
        C(mid, 0.06, 0.05, 0, 0.115, -0.02);
        B(acc, 0.02, 0.02, 0.2, 0.05, 0.05, -0.3);                       // side rail glow
        B(grip, 0.05, 0.15, 0.08, 0, -0.13, 0.09).rotation.x = 0.3;
        B(acc, 0.045, 0.12, 0.05, 0, -0.11, -0.12).rotation.x = -0.15;
        B(mid, 0.05, 0.08, 0.2, 0, -0.01, 0.22);
        slide = B(mid, 0.03, 0.03, 0.08, 0.055, 0.02, 0.02);             // bolt
        handR(0, -0.13, 0.11); handL(0, -0.06, -0.36);
        tipZ = -0.84; break;
      case 'lmg':
        B(dark, 0.075, 0.13, 0.45, 0, 0, 0.0);
        C(dark, 0.032, 0.4, 0, 0.03, -0.42);
        for (let i = 0; i < 3; i++) C(mid, 0.045, 0.03, 0, 0.03, -0.3 - i * 0.1);
        C(mid, 0.1, 0.14, 0, -0.13, 0.02);                               // drum
        B(acc, 0.02, 0.02, 0.3, 0, 0.085, -0.15);
        B(mid, 0.05, 0.06, 0.14, 0, 0.13, 0.02);                         // handle
        B(grip, 0.05, 0.14, 0.08, 0, -0.14, 0.12).rotation.x = 0.25;
        B(mid, 0.055, 0.08, 0.16, 0, -0.01, 0.24);
        slide = B(mid, 0.03, 0.04, 0.1, 0.06, 0.0, -0.05);
        handR(0, -0.14, 0.14); handL(0, -0.07, -0.3);
        tipZ = -0.64; break;
      case 'energy':
        B(dark, 0.06, 0.1, 0.44, 0, 0, -0.06);
        C(acc, 0.028, 0.34, 0, 0.02, -0.3);                              // plasma core
        for (let i = 0; i < 3; i++) { const t = part(GEO.torus, acc, 0.12, 0.12, 0.12, 0, 0.02, -0.18 - i * 0.12); g.add(t); }
        const emit = part(GEO.cone, mid, 0.09, 0.14, 0.09, 0, 0.02, -0.52); emit.rotation.x = -Math.PI / 2; g.add(emit);
        B(mid, 0.02, 0.14, 0.3, 0.055, 0.0, -0.1);                       // side fin
        B(mid, 0.02, 0.14, 0.3, -0.055, 0.0, -0.1);
        B(grip, 0.05, 0.15, 0.08, 0, -0.13, 0.07).rotation.x = 0.22;
        B(dark, 0.05, 0.06, 0.14, 0, -0.005, 0.18);
        slide = B(acc, 0.03, 0.05, 0.05, 0, 0.085, 0.0);
        handR(0, -0.13, 0.09); handL(0, -0.07, -0.28);
        tipZ = -0.6; break;
      case 'rocket':
        C(dark, 0.08, 0.62, 0, 0.05, -0.12);
        C(mid, 0.09, 0.08, 0, 0.05, -0.45);
        C(mid, 0.11, 0.16, 0, 0.05, 0.14);                               // rear drum
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; C(dark, 0.025, 0.05, Math.cos(a) * 0.055, 0.05 + Math.sin(a) * 0.055, 0.24); }
        const rt = part(GEO.torus, acc, 0.2, 0.2, 0.2, 0, 0.05, -0.4); g.add(rt);
        const warhead = part(GEO.cone, emat(0xff5533, 1.2), 0.05, 0.08, 0.05, 0, 0.05, -0.46); warhead.rotation.x = -Math.PI / 2; g.add(warhead);
        B(grip, 0.05, 0.15, 0.08, 0, -0.12, 0.05).rotation.x = 0.25;
        B(grip, 0.05, 0.12, 0.07, 0, -0.1, -0.2).rotation.x = -0.2;
        slide = B(acc, 0.02, 0.06, 0.06, 0.09, 0.05, 0.05);
        handR(0, -0.12, 0.07); handL(0, -0.11, -0.2);
        tipZ = -0.5; break;
    }
    const tip = new THREE.Object3D(); tip.position.set(0, 0.03, tipZ); g.add(tip);
    return { root: g, tip, acc, slide, slideZ: slide ? slide.position.z : 0 };
  }

  /* ================= pickups / projectiles ================= */
  function pickupMesh(kind, colorHex) {
    const g = new THREE.Group();
    const em = emat(colorHex, 1.8);
    if (kind === 'gt') {
      g.add(part(GEO.oct, em, 0.28, 0.42, 0.28, 0, 0.5, 0));
    } else if (kind === 'hp') {
      g.add(part(GEO.box, em, 0.34, 0.12, 0.12, 0, 0.5, 0));
      g.add(part(GEO.box, em, 0.12, 0.34, 0.12, 0, 0.5, 0));
    } else if (kind === 'ammo') {
      g.add(part(GEO.box, em, 0.3, 0.22, 0.22, 0, 0.45, 0));
      g.add(part(GEO.box, mat(0x14171d), 0.32, 0.06, 0.24, 0, 0.58, 0));
    } else if (kind === 'armor') {
      const sh = part(GEO.cone, em, 0.34, 0.44, 0.2, 0, 0.5, 0);
      sh.rotation.x = Math.PI;
      g.add(sh);
    } else if (kind === 'weapon') {
      g.add(part(GEO.box, mat(0x181c24, { metalness: 0.5 }), 0.55, 0.4, 0.55, 0, 0.28, 0));
      g.add(part(GEO.box, em, 0.58, 0.06, 0.58, 0, 0.42, 0));
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 7, 8, 1, true),
        new THREE.MeshBasicMaterial({ map: beamTex(), color: colorHex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.y = 3.5; g.add(beam);
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: colorHex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(1.4); sp.position.y = 0.4; g.add(sp);
    return g;
  }

  function projMesh(colorHex, scale) {
    const g = new THREE.Group();
    g.add(part(GEO.sph, emat(colorHex, 2.4), 0.22, 0.22, 0.22, 0, 0, 0));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: colorHex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(1.1); g.add(sp);
    g.scale.setScalar(scale || 1);
    return g;
  }

  return { glowTex, starTex, beamTex, groundTex, wallTex, crateTex, windowTex, signTex, skyTex, texScreen, mat, emat, GEO, part, buildEnemy, buildBoss, buildGun, pickupMesh, projMesh };
})();
