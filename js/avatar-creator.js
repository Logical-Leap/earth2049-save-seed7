/* Loadout creator: a full-screen overlay to mix and match the avatar kit (see js/avatar.js).
 *
 *   const L = await AvatarCreator.open({ loadout, ownedOnly: true, title: 'DRIP DEALER' });   // null if closed unsaved
 *
 * Options:
 *   loadout     starting loadout (default: AvatarKit.load())
 *   ownedOnly   locked items can be tried on but not saved (default true); false = free mode for dev / photo mode
 *   title       header text (the vendor's name)
 *   onSave(L)   called on SAVE (after AvatarKit.save(L) unless persist: false)
 *   onClose()   called whenever the overlay closes
 *   shop        optional vendor surface (see js/wardrobe.js Wardrobe.shop()): wallet(), collection(), featured(), closest(n),
 *               badge(id) html, detail(id) html, action(id) -> {label, enabled} | null, buy(id) -> bool, seen(ids).
 *               Adds a ★ TODAY tab (daily drop + closest unlocks), price/feat badges on cards and a BUY button.
 * Views: orbit (drag, wheel), per-category camera, first person (head hidden, look down at your arms, legs and
 * shoes), squad lineup (you plus three random players), loadout codes (copy / paste to wear).
 * It has its own renderer and canvas, so the game can pause underneath; everything is disposed on close.
 */
(function () {
  'use strict';
  const K = () => window.AvatarKit;
  const CLIPS = ['Idle', 'Walk', 'Run', 'Dance', 'Hype', 'Taunt', 'Victory', 'Wave', 'Idle Combat', 'Selfie'];
  const SLOT_LABEL = { prim: 'PRIMARY', sec: 'SECONDARY', acc: 'ACCENT', glow: 'GLOW', hair: 'HAIR', skin: 'SKIN' };
  const FOCUS = { face: [0, .02, 1.05, 1.58], hair: [.6, .05, 1.45, 1.62], head: [.5, .08, 1.8, 1.66], eyes: [.1, .02, 1.0, 1.58],
    top: [.35, .05, 2.2, 1.2], hands: [.6, .05, 1.6, 1.0], legs: [.35, .05, 2.4, .6], feet: [.5, .25, 1.4, .18],
    back: [2.8, .1, 2.4, 1.15], neck: [.2, .02, 1.3, 1.32], colors: [.35, .08, 3.2, .95] };
  const CSS = `
#avc{position:fixed;inset:0;z-index:9000;background:#0b0718;color:#cfd6f2;font-family:'JetBrains Mono',Consolas,ui-monospace,monospace;
  --bg:#07050f;--panel:rgba(16,10,34,.82);--panel2:rgba(24,16,48,.92);--accent2:#00f0ff;--hot:#ff2fd6;--warn:#ffc857;--dim:#67628c;--border:rgba(160,107,255,.25)}
#avc *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
#avc canvas{position:absolute;inset:0;width:100%!important;height:100%!important;image-rendering:pixelated;touch-action:none}
#avc button{font:inherit;color:#cfd6f2;background:var(--panel2);border:1px solid var(--border);border-radius:6px;cursor:pointer}
#avc button.on{border-color:var(--accent2);color:var(--accent2);box-shadow:0 0 10px rgba(0,240,255,.25) inset}
#avc button:disabled{opacity:.4;cursor:not-allowed}
#avc .avc-top{position:absolute;top:0;left:0;right:0;padding:10px 12px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;background:linear-gradient(var(--bg),transparent);z-index:3}
#avc h1{margin:0 auto 0 0;font-size:13px;letter-spacing:.12em;font-weight:800}
#avc h1 em{font-style:normal;color:var(--hot)}
#avc h1 small{display:block;font-size:10px;color:var(--dim);font-weight:400;letter-spacing:.06em}
#avc .avc-bar{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;flex:1 1 100%}
#avc .avc-bar::-webkit-scrollbar,#avc .avc-tabs::-webkit-scrollbar,#avc .avc-cards::-webkit-scrollbar{display:none}
#avc .avc-bar button{flex:none;font-size:11px;padding:6px 9px;font-weight:700;letter-spacing:.05em}
#avc .avc-bar .save{border-color:#39ff88;color:#39ff88}
#avc .avc-panel{position:absolute;left:0;right:0;bottom:0;z-index:3;background:var(--panel);backdrop-filter:blur(10px);border-top:1px solid var(--border);
  padding:8px 0 calc(8px + env(safe-area-inset-bottom));transition:transform .25s}
#avc.collapsed .avc-panel,#avc.fp .avc-panel{transform:translateY(calc(100% - 34px))}
#avc .avc-fold{position:absolute;top:-28px;right:12px;font-size:11px;padding:4px 10px}
#avc .avc-tabs{display:flex;gap:6px;overflow-x:auto;padding:0 10px 8px;scrollbar-width:none}
#avc .avc-tabs button{flex:none;font-size:11px;padding:6px 10px;font-weight:700;letter-spacing:.06em}
#avc .avc-cards{display:flex;gap:8px;overflow-x:auto;padding:2px 10px 8px;scrollbar-width:none}
#avc .avc-card{flex:none;width:104px;min-height:64px;padding:7px 8px;text-align:left;display:flex;flex-direction:column;gap:4px;position:relative;
  border-left:3px solid var(--r);background:linear-gradient(135deg,color-mix(in srgb,var(--r) 16%,transparent),var(--panel2) 70%)}
#avc .avc-card .rr{font-size:9px;color:var(--r);letter-spacing:.1em;font-weight:800}
#avc .avc-card .nm{font-size:12px;font-weight:700;line-height:1.2}
#avc .avc-card.on{outline:2px solid var(--r);outline-offset:-1px;box-shadow:0 0 14px color-mix(in srgb,var(--r) 45%,transparent)}
#avc .avc-card.lock .nm{opacity:.6}
#avc .avc-card .lk{position:absolute;top:5px;right:6px;font-size:10px}
#avc .avc-cols{padding:0 10px 6px;max-height:34vh;overflow-y:auto}
#avc .avc-crow{display:flex;align-items:center;gap:6px;margin:0 0 7px;overflow-x:auto;scrollbar-width:none}
#avc .avc-crow .k{flex:none;width:82px;font-size:10px;color:var(--dim);letter-spacing:.08em;font-weight:700}
#avc .avc-sw{flex:none;width:26px;height:26px;border-radius:50%;background:var(--c);border:2px solid rgba(255,255,255,.15);padding:0}
#avc .avc-sw.on{border-color:#fff;box-shadow:0 0 0 2px var(--accent2)}
#avc .avc-info{padding:0 12px;font-size:11px;line-height:1.5;min-height:50px}
#avc .avc-info b{font-size:13px}
#avc .avc-info .tier{font-size:10px;letter-spacing:.1em;text-transform:uppercase;margin-left:4px}
#avc .avc-info .un{color:var(--warn)}
#avc .avc-info .note{color:var(--hot)}
#avc .avc-tip{display:none;position:absolute;top:84px;left:0;right:0;text-align:center;font-size:11px;color:var(--dim);z-index:2;pointer-events:none}
#avc.fp .avc-tip.fpt,#avc.squad .avc-tip.sqt{display:block}
#avc .avc-dot{display:none;position:absolute;top:50%;left:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:var(--accent2);z-index:2;box-shadow:0 0 8px var(--accent2)}
#avc.fp .avc-dot{display:block}
#avc .avc-dlg{display:none;position:absolute;inset:0;z-index:9;background:rgba(0,0,0,.6);align-items:center;justify-content:center}
#avc .avc-dlg.show{display:flex}
#avc .avc-dlg>div{background:var(--panel2);border:1px solid var(--border);border-radius:10px;padding:14px;width:min(92vw,420px)}
#avc .avc-dlg textarea{width:100%;height:90px;font:11px 'JetBrains Mono',Consolas,monospace;background:var(--bg);color:var(--accent2);border:1px solid var(--border);border-radius:6px;padding:8px;word-break:break-all}
#avc .avc-dlg p{margin:0 0 8px;font-size:11px;color:var(--dim)}
#avc .avc-dlg button{padding:7px 12px;font-size:11px;font-weight:700;margin:8px 6px 0 0}
#avc .avc-load{position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;background:var(--bg);font-size:12px;letter-spacing:.14em}
#avc .avc-load b{color:var(--hot)}
#avc .avc-wal{display:inline-block;margin-left:10px;color:var(--warn);font-weight:800;letter-spacing:.06em}
#avc .avc-wal i{font-style:normal;color:var(--dim);font-weight:400;margin-left:8px}
#avc .avc-b{position:absolute;right:6px;bottom:6px;font-size:9px;font-weight:800;letter-spacing:.04em;padding:1px 4px;border-radius:3px;background:rgba(0,0,0,.45)}
#avc.shop .avc-card{padding-bottom:20px}
#avc .avc-b.cost{color:var(--dim)} #avc .avc-b.buy{color:var(--warn)} #avc .avc-b.sale{color:#0b0718;background:var(--warn)}
#avc .avc-b.feat{color:var(--hot)} #avc .avc-b.new{color:#0b0718;background:#39ff88}
#avc .avc-card .ct{font-size:9px;color:var(--dim);letter-spacing:.08em}
#avc .avc-bar2{display:inline-block;width:90px;height:6px;border-radius:3px;background:rgba(255,255,255,.1);vertical-align:middle;overflow:hidden}
#avc .avc-bar2 i{display:block;height:100%;background:linear-gradient(90deg,var(--hot),var(--warn))}
#avc .avc-ok{color:#39ff88} #avc .avc-feat{color:var(--hot)} #avc .avc-sale{color:var(--warn);font-weight:800} #avc .avc-short{color:var(--dim)}
#avc .avc-info s{color:var(--dim)}
#avc .avc-buy{float:right;margin:2px 0 0 8px;padding:7px 12px;font-size:12px;font-weight:800;border-color:var(--warn)!important;color:var(--warn)!important}
#avc .avc-buy.flash{background:var(--warn);color:#0b0718!important}
#avc .avc-toast{position:absolute;top:96px;left:50%;transform:translateX(-50%);z-index:8;padding:8px 14px;border-radius:6px;background:var(--panel2);border:1px solid var(--warn);color:var(--warn);font-size:12px;font-weight:800;letter-spacing:.08em;opacity:0;transition:opacity .25s;pointer-events:none}
#avc .avc-toast.show{opacity:1}`;

  let open = null;

  function html(title) {
    return `<div class="avc-top"><h1>${title}<small>mix, match, grind for the drip<span class="avc-wal"></span></small></h1><div class="avc-bar">
<button data-a="sex">♂ BODY A</button><button data-a="anim">▶ IDLE</button><button data-a="rand">🎲 RANDOM</button>
<button data-a="fp">👁 FIRST PERSON</button><button data-a="squad">👥 SQUAD</button><button data-a="code">⧉ CODE</button>
<button data-a="save" class="save">✔ SAVE</button><button data-a="close">✕</button></div></div>
<div class="avc-dot"></div><div class="avc-tip fpt">Drag to look around. Look down to check your fit.</div>
<div class="avc-tip sqt">Your squad, randomized. Tap SQUAD again for a new squad.</div>
<div class="avc-panel"><button class="avc-fold" data-a="fold">☰</button><div class="avc-tabs"></div><div class="avc-grid"></div><div class="avc-info"></div></div>
<div class="avc-dlg"><div><p>Loadout code. Share it with your squad, or paste one in to wear it.</p><textarea spellcheck="false"></textarea>
<button data-a="copy">COPY</button><button data-a="wear">WEAR THIS CODE</button><button data-a="dlgx">CLOSE</button></div></div>
<div class="avc-toast"></div><div class="avc-load">LOADING <b>&nbsp;DRIP</b>…</div>`;
  }

  function stage(renderer) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0718);
    scene.fog = new THREE.Fog(0x0b0718, 7, 16);
    scene.add(new THREE.HemisphereLight(0xb8a8ff, 0x201030, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.35); key.position.set(1.6, 3, 2.4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x00e5ff, .9); rim.position.set(-2, 2, -2.5); scene.add(rim);
    const pink = new THREE.DirectionalLight(0xff2fd6, .5); pink.position.set(2.5, .6, -1.5); scene.add(pink);
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#100a22'; x.fillRect(0, 0, 256, 256); x.strokeStyle = 'rgba(160,107,255,.35)';
    for (let i = 0; i <= 256; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 8); t.magFilter = THREE.NearestFilter; t.encoding = THREE.sRGBEncoding;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ map: t }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    for (const [r0, col, op] of [[.62, 0x00e5ff, .8], [.5, 0xa06bff, .6]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + .03, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = .004; scene.add(ring);
    }
    return scene;
  }

  function swatch(slot, p) {
    const ref = slot === 'skin' ? [176, 132, 100] : [120, 120, 120];
    return `rgb(${p.t.map((v, i) => Math.max(0, Math.min(255, Math.round(v * ref[i] * (slot === 'glow' ? 1 : 1.25))))).join(',')})`;
  }

  function openCreator(opts = {}) {
    if (open) return open.promise;
    const ownedOnly = opts.ownedOnly !== false;
    const shop = opts.shop || null;
    const root = document.createElement('div'); root.id = 'avc';
    if (opts.shop) root.classList.add('shop');
    const style = document.createElement('style'); style.textContent = CSS;
    root.innerHTML = html(opts.title || 'EARTH <em>2049</em> // LOADOUT');
    document.head.appendChild(style); document.body.appendChild(root);
    try { document.exitPointerLock && document.exitPointerLock(); } catch (e) { /* not locked */ }
    const $ = s => root.querySelector(s);
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.localClippingEnabled = true;              // hats trim the hair under them
    root.insertBefore(renderer.domElement, root.firstChild);
    const scene = stage(renderer);
    const camera = new THREE.PerspectiveCamera(32, 1, .02, 60);
    let resolveP; const promise = new Promise(r => { resolveP = r; });
    const S = { L: null, me: null, squad: [], mode: 'solo', tab: shop ? 'today' : 'top', viewed: new Set(), clipI: 0, saved: null, raf: 0, closed: false,
      yaw: .35, pitch: .08, dist: 3.2, ty: .95, want: { yaw: .35, pitch: .08, dist: 3.2, y: .95 }, fpYaw: 0, fpPitch: -.6, drag: null };
    open = { promise, close };

    function resize() {
      const w = innerWidth, h = innerHeight;
      renderer.setPixelRatio(Math.min(1, 480 / h)); renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.fov = S.mode === 'fp' ? Math.min(100, Math.max(72, 2 * Math.atan(Math.tan(.7) / Math.min(1, camera.aspect)) * 180 / Math.PI)) : 32;
      const ph = $('.avc-panel').offsetHeight;
      camera.setViewOffset(w, h, 0, S.mode === 'fp' ? 0 : ph * .5, w, h);
      camera.updateProjectionMatrix();
    }
    addEventListener('resize', resize);

    const item = id => K().item(S.L.sex, id);
    function focus() { const f = FOCUS[S.tab] || FOCUS.colors; S.want = { yaw: f[0], pitch: f[1], dist: f[2], y: f[3] }; }
    function dress(L) { S.L = K().validate(L); S.me.apply(S.L); refresh(); }
    function setSex(sex) {
      const prev = S.L;
      let L = K().defaultLoadout(sex);
      if (prev) { L.colors = prev.colors; for (const k of Object.keys(prev.items)) if (K().item(sex, prev.items[k])) L.items[k] = prev.items[k]; }
      body(L);
    }
    function body(L) {
      if (S.me) S.me.dispose();
      S.L = K().validate(L); S.me = K().create(S.L); scene.add(S.me.root); S.me.play(S.mode === 'fp' ? 'Idle Combat' : CLIPS[S.clipI]);
      if (S.mode === 'fp') S.me.setFirstPerson(true);
      if (S.mode === 'squad') S.me.root.position.set(-.48, 0, .15);
      $('[data-a=sex]').textContent = S.L.sex === 'm' ? '♂ BODY A' : '♀ BODY B';
      refresh();
    }
    function refresh() {
      const cats = K().catalog.categories, R = K().resolve(S.L);
      if (shop) $('.avc-wal').innerHTML = `${shop.wallet()}<i>${shop.collection()}</i>`;
      $('.avc-tabs').innerHTML = [...(shop ? [['today', '★ TODAY']] : []), ...cats.map(c => [c.id, c.label]), ['colors', 'COLOURS']]
        .map(([id, lab]) => `<button data-tab="${id}" class="${S.tab === id ? 'on' : ''}">${lab}</button>`).join('');
      const locked = ownedOnly ? K().lockedIn(S.L) : [];
      const sv = $('[data-a=save]'); sv.disabled = locked.length > 0;
      sv.title = locked.length ? 'Unlock first: ' + locked.map(id => item(id).name).join(', ') : 'Save this loadout';
      const grid = $('.avc-grid'), info = $('.avc-info');
      if (S.tab === 'colors') {
        grid.className = 'avc-grid avc-cols';
        grid.innerHTML = Object.keys(K().catalog.palettes).map(s => `<div class="avc-crow"><span class="k">${SLOT_LABEL[s]}</span>` +
          K().catalog.palettes[s].map(p => `<button class="avc-sw ${S.L.colors[s] === p.name ? 'on' : ''}" data-col="${s}" data-name="${p.name}" title="${p.name}" style="--c:${swatch(s, p)}"></button>`).join('') + '</div>').join('');
        info.innerHTML = '<b>COLOURS</b> tint every item at once, so the whole outfit always matches. Gold, chrome and novelty prints keep their own colours.';
        return;
      }
      grid.className = 'avc-grid avc-cards';
      const card = (i, withCat) => {
        const lock = ownedOnly && !K().isOwned(i.id);
        S.viewed.add(i.id);
        const label = withCat ? `<span class="ct">${cats.find(c => c.id === i.cat).label}</span>` : '';
        return `<button class="avc-card ${S.L.items[i.cat] === i.id ? 'on' : ''} ${lock ? 'lock' : ''}" data-item="${i.id}" data-cat="${i.cat}" style="--r:${K().RARITY_COLORS[i.rarity]}">` +
          `${lock ? '<span class="lk">🔒</span>' : ''}<span class="rr">${K().catalog.rarities[i.rarity].toUpperCase()}</span>${label}<span class="nm">${i.name}</span>${shop ? shop.badge(i.id) : ''}</button>`;
      };
      if (S.tab === 'today') {
        const ids = [...new Set([...shop.featured(), ...shop.closest(5)])].map(id => item(id)).filter(Boolean);
        grid.innerHTML = ids.map(i => card(i, true)).join('');
        info.innerHTML = '<b>★ TODAY</b> The first three are the <span class="avc-sale">DAILY DROP</span>: 35% off until 00:00 UTC. ' +
          'The rest are your <span class="avc-feat">closest unlocks</span>. Every run pays DRIP; your first win each day pays double.';
        return;
      }
      grid.innerHTML = K().itemsIn(S.L.sex, S.tab).map(i => card(i, false)).join('');
      const sel = grid.querySelector('.avc-card.on'); if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const cur = item(S.L.items[S.tab]), notes = [], hat = R.eq.head, hair = R.eq.hair;
      if (S.tab === 'hair' && hat.hair === 'none') notes.push(`hidden under the ${hat.name}`);
      if (S.tab === 'hair' && ((hat.hair === 'short' && hair.length !== 'short') || (hat.cut && hair.length === 'tall'))) notes.push(`too much hair for the ${hat.name}: tucked away`);
      if ((cur.blocks || []).length) notes.push('covers ' + cur.blocks.map(b => cats.find(c => c.id === b).label.toLowerCase()).join(', '));
      if (R.blocked.has(S.tab)) notes.push('hidden by what you wear');
      const col = K().RARITY_COLORS[cur.rarity];
      const act = shop && shop.action(cur.id);
      info.innerHTML = (act ? `<button class="avc-buy" data-a="buy" data-id="${cur.id}" ${act.enabled ? '' : 'disabled'}>${act.label}</button>` : '') +
        `<b style="color:${col}">${cur.name}</b> <span class="tier" style="color:${col}">${K().catalog.rarities[cur.rarity]}</span>` +
        `<br>${cur.flavor}<br>` + (shop ? shop.detail(cur.id) : `<span class="un">${ownedOnly && !K().isOwned(cur.id) ? '🔒 ' : '🔓 '}${cur.unlock}</span>`) +
        (notes.length ? `<br><span class="note">⚠ ${notes.join(' · ')}</span>` : '');
    }
    function setMode(m) {
      for (const a of S.squad) a.dispose(); S.squad.length = 0;
      if (S.mode === 'fp') S.me.setFirstPerson(false);
      S.mode = m;
      root.classList.toggle('fp', m === 'fp'); root.classList.toggle('squad', m === 'squad');
      $('[data-a=fp]').classList.toggle('on', m === 'fp'); $('[data-a=squad]').classList.toggle('on', m === 'squad');
      S.me.root.position.set(0, 0, 0);
      if (m === 'fp') { S.me.play('Idle Combat'); S.me.setFirstPerson(true); S.fpYaw = 0; S.fpPitch = -.6; }
      else S.me.play(CLIPS[S.clipI]);
      if (m === 'squad') {
        S.me.root.position.set(-.48, 0, .15);
        const xs = [-1.4, .45, 1.3], clips = ['Dance', 'Hype', 'Taunt'];
        for (let i = 0; i < 3; i++) {
          const a = K().create(K().randomLoadout());
          a.root.position.set(xs[i], 0, i === 1 ? -.35 : -.1); a.root.rotation.y = -xs[i] * .12; scene.add(a.root);
          a.play(clips[i]); a.mixer.setTime(Math.random() * 3); S.squad.push(a);
        }
        S.want = { yaw: 0, pitch: .12, dist: 7.2, y: .9 };
      } else if (m === 'solo') focus();
      refresh(); resize();
    }
    function finish(L) {
      if (S.closed) return; S.closed = true;
      cancelAnimationFrame(S.raf); removeEventListener('resize', resize); removeEventListener('keydown', onKey, true);
      for (const a of S.squad) a.dispose(); if (S.me) S.me.dispose();
      if (shop) shop.seen([...S.viewed].filter(id => K().isOwned(id)));
      renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { /* already gone */ }
      root.remove(); style.remove(); open = null;
      if (opts.onClose) opts.onClose(L);
      resolveP(L);
    }
    function close() { finish(null); }
    let toastT = 0;
    function toast(text) {
      const t = $('.avc-toast'); t.textContent = text; t.classList.add('show');
      clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } }
    addEventListener('keydown', onKey, true);

    root.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (b.dataset.tab) { S.tab = b.dataset.tab; $('.avc-grid').scrollLeft = 0; refresh(); focus(); }
      else if (b.dataset.item) { const c = b.dataset.cat || S.tab; if (S.tab === 'today') S.tab = c; S.L.items[c] = b.dataset.item; dress(S.L); focus(); }
      else if (a === 'buy') {
        const id = b.dataset.id;
        if (shop.buy(id)) { toast(`UNLOCKED // ${item(id).name.toUpperCase()}`); b.classList.add('flash'); if (opts.onBuy) opts.onBuy(id); }
        refresh();
      }
      else if (b.dataset.col) { S.L.colors[b.dataset.col] = b.dataset.name; S.me.tint(S.L.colors); refresh(); }
      else if (a === 'sex') setSex(S.L.sex === 'm' ? 'f' : 'm');
      else if (a === 'rand') dress(K().randomLoadout(S.L.sex, { ownedOnly }));
      else if (a === 'anim') { S.clipI = (S.clipI + 1) % CLIPS.length; S.me.play(CLIPS[S.clipI]); b.textContent = '▶ ' + S.me.clipName.toUpperCase(); }
      else if (a === 'fp') setMode(S.mode === 'fp' ? 'solo' : 'fp');
      else if (a === 'squad') setMode('squad');
      else if (a === 'code') { $('.avc-dlg textarea').value = K().encode(S.L); $('.avc-dlg').classList.add('show'); }
      else if (a === 'copy') { const t = $('.avc-dlg textarea'); t.select(); try { navigator.clipboard.writeText(t.value); b.textContent = 'COPIED'; } catch (err) { /* select is enough */ } }
      else if (a === 'wear') { const L = K().decode($('.avc-dlg textarea').value); if (!L) { $('.avc-dlg textarea').value = 'That code did not load.'; return; }
        if (L.sex !== S.L.sex) body(L); else dress(L); $('.avc-dlg').classList.remove('show'); }
      else if (a === 'dlgx') $('.avc-dlg').classList.remove('show');
      else if (a === 'fold') root.classList.toggle('collapsed');
      else if (a === 'save') { const L = K().validate(S.L); if (opts.persist !== false) K().save(L); if (opts.onSave) opts.onSave(L); finish(L); }
      else if (a === 'close') close();
    });
    $('[data-a=squad]').addEventListener('dblclick', () => setMode('solo'));
    const cv = renderer.domElement;
    cv.addEventListener('pointerdown', e => { S.drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      if (!S.drag || S.drag.id !== e.pointerId) return;
      const dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y; S.drag.x = e.clientX; S.drag.y = e.clientY;
      if (S.mode === 'fp') { S.fpYaw -= dx * .006; S.fpPitch = Math.max(-1.45, Math.min(1.2, S.fpPitch - dy * .006)); }
      else { S.want.yaw -= dx * .008; S.want.pitch = Math.max(-.2, Math.min(1.2, S.want.pitch + dy * .006)); }
    });
    cv.addEventListener('pointerup', () => { S.drag = null; });
    cv.addEventListener('wheel', e => { S.want.dist = Math.max(.8, Math.min(9, S.want.dist * (1 + e.deltaY * .001))); }, { passive: true });

    const clock = new THREE.Clock(), eye = new THREE.Vector3(), look = new THREE.Vector3();
    function frame() {
      S.raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), .05);
      S.me.update(dt); for (const a of S.squad) a.update(dt);
      if (S.mode === 'fp') {
        S.me.eyeWorld(eye, Math.max(0, -S.fpPitch - .25));
        camera.position.copy(eye);
        look.set(Math.sin(S.fpYaw) * Math.cos(S.fpPitch), Math.sin(S.fpPitch), Math.cos(S.fpYaw) * Math.cos(S.fpPitch)).add(eye);
        camera.lookAt(look);
      } else {
        const k = Math.min(1, dt * 6), W = S.want;
        S.yaw += (W.yaw - S.yaw) * k; S.pitch += (W.pitch - S.pitch) * k; S.dist += (W.dist - S.dist) * k; S.ty += (W.y - S.ty) * k;
        const d = S.dist * (camera.aspect < 1 ? Math.min(1.6, .85 / Math.sqrt(camera.aspect)) : 1);
        const tx = S.mode === 'squad' ? 0 : S.me.root.position.x;
        camera.position.set(tx + Math.sin(S.yaw) * Math.cos(S.pitch) * d, S.ty + Math.sin(S.pitch) * d, Math.cos(S.yaw) * Math.cos(S.pitch) * d);
        camera.lookAt(tx, S.ty, 0);
      }
      renderer.render(scene, camera);
    }

    K().ready().then(() => {
      if (S.closed) return;
      body(opts.loadout || K().load());
      $('.avc-load').remove(); resize(); focus(); frame();
      open.api = { get L() { return S.L; }, get me() { return S.me; }, setMode, refresh, equip: (c, id) => { S.L.items[c] = id; dress(S.L); },
        set tab(t) { S.tab = t; refresh(); focus(); }, look: (y, p) => { S.fpYaw = y; S.fpPitch = p; },
        view: (y, p, d, h) => { S.want = { yaw: y, pitch: p, dist: d, y: h }; Object.assign(S, { yaw: y, pitch: p, dist: d, ty: h }); } };
    }).catch(err => { $('.avc-load').textContent = 'The avatar kit did not load.'; console.error('[AvatarCreator]', err); });
    return promise;
  }

  window.AvatarCreator = { open: openCreator, close: () => open && open.close(), get isOpen() { return !!open; }, get api() { return open && open.api; } };
})();
