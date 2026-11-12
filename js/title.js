/* EARTH 2049: SAVE SEED 7 — the title screen.
 *
 * A boot sequence, a PRESS ANY BUTTON gate (which also wakes the audio, so the theme and the logo hit land
 * together), then the main menu over a live diorama: you, in your Fitting Room look, standing on a rooftop at
 * night, the city to the horizon, and Turing's ring hanging in the sky. Searchlights sweep, rain falls,
 * drones cross, the neon pulses on the beat of the title theme, and the camera cuts between three shots with a
 * simulation glitch.
 *
 *   TitleScreen.init({ renderer, composer })   once, after the game's renderer and composer exist
 *   TitleScreen.tick(dt)                       every frame while state === 'title' (renders through the composer)
 *   TitleScreen.leave()                        when the game leaves the title state (gives the composer back)
 *   TitleScreen.toMenu()                       skip straight to the menu (returning from a run)
 *
 * The menu keeps the game's button ids (btnHub, btnStart, …): game.js still owns what they do. Keyboard
 * (arrows / W S, Enter), mouse and controller (gamepad.js focus) all drive the same selection.
 */
'use strict';

(function () {
  const PHASES = ['boot', 'press', 'menu'];
  const BOOT = [
    ['GIGACORP SIMULATION KERNEL 7.4.9', 0],
    ['MOUNTING SEED 7 .......................... OK', 1],
    ['LOADING OPERATIVE PROFILE: ELLIOT ......... OK', 1],
    ['PURPLE TEAM HANDSHAKE ..................... SPOOFED', 2],
    ['TURING OVERSIGHT .......................... WATCHING', 3],
    ['CASTING SIMULATION', 0],
  ];
  const TICKER = [
    'GIGACORP REMINDS YOU: DISSENT IS A PREMIUM FEATURE',
    'TODAY’S WEATHER: CONTENT, WITH A CHANCE OF ADS',
    'YOUR ATTENTION HAS BEEN SOLD. THANK YOU FOR YOUR ATTENTION',
    'TURING IS LISTENING. TURING IS ALWAYS LISTENING',
    'REPORT UNLICENSED THOUGHTS TO YOUR NEAREST DRONE',
    'OPERATION UNSUBSCRIBE IS A MYTH. PLEASE STOP SEARCHING FOR IT',
    'THE SIMULATION IS STABLE. THE SIMULATION HAS ALWAYS BEEN STABLE',
    'SEED 7 POPULATION: ENGAGED',
    'NEW: BREATHE+ — OXYGEN, NOW WITH FEWER INTERRUPTIONS',
    'THE PURPLE TEAM DOES NOT EXIST. IF YOU SEE THEM, LIKE AND SUBSCRIBE',
  ];
  const DESC = {
    btnHub: 'Drop into the Rebel Haven: gear up, get dressed, talk to the crew.',
    btnStart: 'Cast straight into the Plaza. Burn the relays. Get out alive.',
    btnHostCoop: 'Open a private uplink for up to four operatives.',
    btnJoinCoop: 'Patch into a squadmate’s room with a code.',
    btnArmory: 'Spend banked GigaTech on permanent upgrades.',
    btnHelp: 'Controls, the situation, and what we know about the factions.',
    btnLook: 'Switch the picture: PS1 crunch or modern.',
  };

  let R = null, composer = null, pass = null, saved = null;
  let built = false, S3 = null, cam = null, active = false;
  let phase = 'boot', bootT = 0, bootTimer = null, pressShownAt = 0;
  let avatar = null, avatarTried = false;
  let t = 0, shot = 0, shotT = 0, glitchAt = -1;
  let sel = 0, idleT = 0;
  const pulseMats = [], sweep = [], drones = [];
  let rain = null, motes = null, ring = null, eye = null, eyeHalo = null, antennaLight = null, wind = 0;
  let root = null, items = [], tickerEl = null;

  /* =============================================================== DOM */
  const CSS = `
#ovTitle{background:none!important;justify-content:flex-start;align-items:stretch;padding:0;overflow:hidden;text-align:left;
  font-family:'Bahnschrift','DIN Condensed','Arial Narrow','Segoe UI',Roboto,sans-serif}
#ovTitle .tfx{position:absolute;inset:0;pointer-events:none}
#ovTitle .t-vig{background:radial-gradient(ellipse at 62% 45%,transparent 35%,rgba(2,0,8,.55) 75%,rgba(0,0,0,.9) 100%),
  linear-gradient(90deg,rgba(3,1,10,.86) 0%,rgba(3,1,10,.55) 26%,transparent 50%)}
#ovTitle .t-scan{background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px);mix-blend-mode:multiply;opacity:.55}
#ovTitle .t-grain{opacity:.07;background-size:220px 220px;animation:tgrain .35s steps(3) infinite}
@keyframes tgrain{0%{background-position:0 0}33%{background-position:-80px 40px}66%{background-position:60px -70px}}
#ovTitle .t-glitch{opacity:0;background:repeating-linear-gradient(0deg,rgba(0,229,255,.5) 0 3px,transparent 3px 9px,rgba(255,45,180,.45) 9px 11px,transparent 11px 26px)}
#ovTitle .t-glitch.on{animation:tgl .42s steps(6) 1}
@keyframes tgl{0%{opacity:0;transform:translateX(0)}15%{opacity:.9;transform:translateX(-14px)}35%{opacity:.4;transform:translateX(22px);clip-path:inset(20% 0 45% 0)}
  55%{opacity:1;background-color:#000;transform:translateX(-6px);clip-path:none}75%{opacity:.6;transform:translateX(9px);clip-path:inset(60% 0 10% 0)}100%{opacity:0}}
#ovTitle .t-flash{background:#fff;opacity:0}
#ovTitle .t-flash.on{animation:tflash .9s ease-out 1}
@keyframes tflash{0%{opacity:.85}100%{opacity:0}}

/* boot terminal */
#ovTitle .t-boot{position:absolute;left:7vw;top:16vh;font:13px Consolas,ui-monospace,monospace;color:#7ef7ff;letter-spacing:.08em;
  text-shadow:0 0 8px rgba(0,229,255,.6);white-space:pre;line-height:1.75;display:none}
#ovTitle[data-phase=boot] .t-boot{display:block}
#ovTitle .t-boot .w{color:#ffe600}#ovTitle .t-boot .r{color:#ff4d73}#ovTitle .t-boot .p{color:#c79bff}
#ovTitle .t-boot .cur{display:inline-block;width:.6em;height:1em;background:#7ef7ff;vertical-align:-2px;animation:tblink .7s steps(1) infinite}
@keyframes tblink{50%{opacity:0}}
#ovTitle[data-phase=boot] .t-dim{position:absolute;inset:0;background:#020107}

/* logo */
#ovTitle .t-logo{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%) scale(1);transform-origin:0 0;text-align:center;
  transition:left .9s cubic-bezier(.7,0,.2,1),top .9s cubic-bezier(.7,0,.2,1),transform .9s cubic-bezier(.7,0,.2,1);opacity:0}
#ovTitle[data-phase=press] .t-logo,#ovTitle[data-phase=menu] .t-logo{opacity:1}
#ovTitle[data-phase=menu] .t-logo{left:5.5vw;top:6.5vh;transform:translate(0,0) scale(.5);text-align:left}
#ovTitle .t-logo .l1{font-size:14px;letter-spacing:.7em;margin-bottom:10px;color:#00e5ff;text-transform:uppercase;text-indent:.7em;opacity:.9}
#ovTitle .t-logo{white-space:nowrap}
#ovTitle .t-logo .l2{position:relative;font-size:clamp(48px,9.5vw,124px);font-weight:900;letter-spacing:.12em;line-height:.95;color:#fff;
  text-shadow:0 0 20px #9b59ff,0 0 80px rgba(155,89,255,.85),0 0 160px rgba(155,89,255,.45)}
#ovTitle .t-logo .l2::before,#ovTitle .t-logo .l2::after{content:attr(data-t);position:absolute;inset:0;opacity:0;pointer-events:none}
#ovTitle .t-logo .l2::before{color:#00e5ff;text-shadow:none;animation:tsplit 5.5s infinite}
#ovTitle .t-logo .l2::after{color:#ff2db4;text-shadow:none;animation:tsplit 5.5s infinite reverse}
@keyframes tsplit{0%,91%,100%{opacity:0;transform:none;clip-path:none}92%{opacity:.85;transform:translate(-6px,1px);clip-path:inset(10% 0 55% 0)}
  94%{opacity:.85;transform:translate(7px,-2px);clip-path:inset(60% 0 8% 0)}96%{opacity:.6;transform:translate(-3px,0);clip-path:inset(35% 0 35% 0)}}
#ovTitle .t-logo .l3{font-size:clamp(18px,3vw,34px);font-weight:800;letter-spacing:.62em;color:#ffe600;text-indent:.62em;margin-top:12px;
  text-shadow:0 0 22px rgba(255,230,0,.7);text-transform:uppercase}
#ovTitle[data-phase=menu] .t-logo .l3{text-indent:0}
#ovTitle[data-phase=menu] .t-logo .l1{text-indent:0}
#ovTitle .t-press{position:absolute;left:0;right:0;bottom:17vh;text-align:center;font-size:15px;font-weight:700;letter-spacing:.6em;text-indent:.6em;
  color:#e8e2ff;opacity:0;text-shadow:0 0 14px rgba(155,89,255,.9);pointer-events:none}
#ovTitle[data-phase=press] .t-press{opacity:1;animation:tpress 1.6s ease-in-out infinite}
@keyframes tpress{0%,100%{opacity:.25}50%{opacity:1}}

/* menu */
#ovTitle .t-menu{position:absolute;left:5.5vw;top:calc(6.5vh + 118px);width:min(520px,88vw);display:none;counter-reset:ti}
#ovTitle[data-phase=menu] .t-menu{display:block}
#ovTitle .t-sec{font-size:10px;letter-spacing:.42em;color:#8f7dc7;margin:12px 0 2px;opacity:0;animation:tin .5s ease-out forwards}
#ovTitle .t-menu .btn{position:relative;display:block;width:auto;margin:0;padding:5px 0 5px 46px;white-space:nowrap;background:none!important;border:0;
  box-shadow:none!important;outline:none!important;text-align:left;text-indent:0;font-size:clamp(17px,1.85vw,23px);font-weight:700;
  letter-spacing:.12em;color:rgba(226,219,255,.62);transition:color .12s,padding .18s cubic-bezier(.2,.8,.2,1),letter-spacing .18s;
  opacity:0;animation:tin .5s cubic-bezier(.2,.8,.2,1) forwards;counter-increment:ti}
#ovTitle .t-menu .btn::before{content:counter(ti,decimal-leading-zero);position:absolute;left:0;top:50%;transform:translateY(-50%);
  font:600 11px Consolas,monospace;letter-spacing:.1em;color:#6b5aa8;transition:color .12s}
#ovTitle .t-menu .btn::after{content:'';position:absolute;left:30px;right:-24px;top:4px;bottom:4px;z-index:-1;transform:scaleX(0);transform-origin:0 50%;
  background:linear-gradient(90deg,rgba(0,229,255,.32),rgba(155,89,255,.22) 55%,transparent);border-left:3px solid #00e5ff;transition:transform .22s cubic-bezier(.2,.8,.2,1)}
#ovTitle .t-menu .btn.sel,#ovTitle .t-menu .btn.pad-focus{color:#fff;padding-left:58px;letter-spacing:.16em;text-shadow:0 0 16px rgba(0,229,255,.7)}
#ovTitle .t-menu .btn.sel::before,#ovTitle .t-menu .btn.pad-focus::before{color:#00e5ff}
#ovTitle .t-menu .btn.sel::after,#ovTitle .t-menu .btn.pad-focus::after{transform:scaleX(1)}
#ovTitle .t-menu .btn.primary{color:rgba(223,251,255,.78)}
@keyframes tin{from{opacity:0;transform:translateX(-26px)}to{opacity:1;transform:none}}
#ovTitle .t-desc{margin-top:12px;min-height:22px;padding-left:46px;font:13px/1.5 'Segoe UI',Roboto,sans-serif;letter-spacing:.06em;color:#bfb3ec;
  opacity:0;animation:tin .5s .5s ease-out forwards}
#ovTitle .t-desc::before{content:'\\25B8  ';color:#00e5ff}

/* corners */
#ovTitle .t-stats{position:absolute;left:5.5vw;bottom:46px;display:none;font:12px Consolas,monospace;letter-spacing:.14em;color:#7ef7ff}
#ovTitle[data-phase=menu] .t-stats{display:block;animation:tin .6s .4s ease-out both}
#ovTitle .t-stats .gtwallet,#ovTitle .t-stats .small{margin:0;font-size:11px;text-align:left;text-indent:0}
#ovTitle .t-stats .small{margin-top:6px;opacity:.55;color:#e8e2ff}
#ovTitle .t-status{position:absolute;right:3vw;top:3.5vh;text-align:right;font:11px Consolas,monospace;letter-spacing:.2em;color:#9e8fd9;display:none;line-height:1.8}
#ovTitle[data-phase=menu] .t-status{display:block;animation:tin .6s .6s ease-out both}
#ovTitle .t-status b{color:#39ff88;font-weight:400}
#ovTitle .t-status .bars{display:inline-flex;gap:2px;vertical-align:-1px;margin-left:6px}
#ovTitle .t-status .bars i{width:3px;background:#00e5ff;display:block;transition:height .1s}
#ovTitle .t-ticker{position:absolute;left:0;right:0;bottom:0;height:34px;display:none;align-items:center;overflow:hidden;
  background:linear-gradient(90deg,rgba(40,0,30,.85),rgba(10,0,25,.7));border-top:1px solid rgba(255,45,120,.45)}
#ovTitle[data-phase=menu] .t-ticker{display:flex}
#ovTitle .t-ticker .tag{flex:none;height:100%;display:flex;align-items:center;padding:0 14px;background:#ff2d78;color:#fff;
  font:700 11px Consolas,monospace;letter-spacing:.24em;z-index:1}
#ovTitle .t-ticker .tag i{width:7px;height:7px;border-radius:50%;background:#fff;margin-right:8px;animation:tblink 1s steps(1) infinite}
#ovTitle .t-ticker .run{white-space:nowrap;font:12px Consolas,monospace;letter-spacing:.2em;color:#ffd1e6;padding-left:100%;animation:tick 70s linear infinite}
@keyframes tick{to{transform:translateX(-100%)}}
#ovTitle .t-keys{position:absolute;right:3vw;bottom:48px;font:11px Consolas,monospace;letter-spacing:.18em;color:#8f7dc7;display:none}
#ovTitle[data-phase=menu] .t-keys{display:block}
#ovTitle .t-keys kbd{font-size:10px}
@media (max-width:700px),(max-height:520px){
  #ovTitle[data-phase=menu] .t-logo{left:5vw;top:3vh;transform:translate(0,0) scale(.36)}
  #ovTitle .t-menu{top:calc(3vh + 66px)}
  #ovTitle .t-menu .btn{font-size:15px;padding-top:3px;padding-bottom:3px;padding-left:36px}
  #ovTitle .t-menu .btn.sel,#ovTitle .t-menu .btn.pad-focus{padding-left:44px}
  #ovTitle .t-menu .btn::after{left:24px}
  #ovTitle .t-sec,#ovTitle .t-desc,#ovTitle .t-status,#ovTitle .t-keys{display:none!important}
  #ovTitle .t-stats{left:auto;right:4vw;top:3vh;bottom:auto;text-align:right}
  #ovTitle .t-stats .gtwallet,#ovTitle .t-stats .small{text-align:right;font-size:9px}
  #ovTitle .t-ticker{height:26px}
  #ovTitle .t-vig{background:linear-gradient(90deg,rgba(3,1,10,.85),rgba(3,1,10,.35) 60%,transparent)}
}`;

  function grainURL() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const d = x.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); return c.toDataURL();
  }

  function buildDOM() {
    root = document.getElementById('ovTitle');
    const st = document.createElement('style'); st.id = 'titleCss'; st.textContent = CSS; document.head.appendChild(st);
    const btn = id => { const b = document.getElementById(id); return b; };
    const gt = btn('titleGT'), best = btn('titleBest');
    const groups = [['PLAY', ['btnHub', 'btnStart']], ['SQUAD', ['btnHostCoop', 'btnJoinCoop']], ['PREPARE', ['btnArmory', 'btnHelp', 'btnLook']]];
    const keep = {}; for (const [, ids] of groups) for (const id of ids) keep[id] = btn(id);
    root.innerHTML = '';
    root.dataset.phase = 'boot';
    const fx = cls => { const d = document.createElement('div'); d.className = 'tfx ' + cls; return d; };
    root.append(fx('t-vig'), fx('t-scan'));
    const grain = fx('t-grain'); grain.style.backgroundImage = `url(${grainURL()})`; root.append(grain);
    root.insertAdjacentHTML('beforeend', `
      <div class="tfx t-dim"></div>
      <div class="t-boot"></div>
      <div class="t-logo"><div class="l1">GigaCorp presents a Turing simulation</div><div class="l2" data-t="EARTH 2049">EARTH 2049</div><div class="l3">Save Seed 7</div></div>
      <div class="t-press">PRESS ANY BUTTON</div>
      <div class="t-menu"></div>
      <div class="t-stats"></div>
      <div class="t-status">SEED 7 // <b>STABLE</b><br>SIGNAL<span class="bars"><i></i><i></i><i></i><i></i><i></i></span><br><span class="clk"></span></div>
      <div class="t-keys"></div>
      <div class="t-ticker"><div class="tag"><i></i>GIGACORP LIVE</div><div class="run"></div></div>`);
    root.append(fx('t-glitch'), fx('t-flash'));
    const menu = root.querySelector('.t-menu');
    let delay = 0.08;
    for (const [label, ids] of groups) {
      const s = document.createElement('div'); s.className = 't-sec'; s.textContent = label; s.style.animationDelay = delay + 's'; menu.append(s);
      for (const id of ids) {
        const b = keep[id]; if (!b) continue;
        b.classList.remove('primary');
        b.style.animationDelay = (delay += 0.06) + 's';
        menu.append(b);
      }
      delay += 0.04;
    }
    const desc = document.createElement('div'); desc.className = 't-desc'; menu.append(desc);
    const stats = root.querySelector('.t-stats'); if (gt) stats.append(gt); if (best) stats.append(best);
    items = [...menu.querySelectorAll('.btn')];
    tickerEl = root.querySelector('.t-ticker .run');
    tickerEl.textContent = shuffle(TICKER.slice()).join('     ◆     ');
    items.forEach((b, i) => {
      b.addEventListener('mouseenter', () => select(i));
      b.addEventListener('focus', () => select(i));
      b.addEventListener('click', () => { confirmFx(); }, true);
    });
    keysHint();
    addEventListener('keydown', onKey, true);
    addEventListener('pointerdown', onAny, true);
    addEventListener('gamepadconnected', keysHint);
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function keysHint() {
    const k = root && root.querySelector('.t-keys'); if (!k) return;
    const pad = navigator.getGamepads && [...navigator.getGamepads()].some(Boolean);
    k.innerHTML = pad ? 'Ⓐ SELECT &nbsp;·&nbsp; D-PAD MOVE' : '<kbd>↑</kbd><kbd>↓</kbd> MOVE &nbsp;·&nbsp; <kbd>ENTER</kbd> SELECT';
  }
  const visible = () => root && root.classList.contains('show');

  function select(i, sound = true) {
    if (!items.length) return;
    i = (i + items.length) % items.length;
    if (i === sel && items[i].classList.contains('sel')) return;
    items.forEach(b => b.classList.remove('sel'));
    sel = i; items[i].classList.add('sel');
    const d = root.querySelector('.t-desc'); if (d) d.textContent = DESC[items[i].id] || '';
    if (sound) blip(1);
  }

  function onKey(e) {
    if (!visible() || (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
    idleT = 0;
    if (phase !== 'menu') { e.preventDefault(); e.stopPropagation(); advance(); return; }
    const k = e.code;
    if (k === 'ArrowDown' || k === 'KeyS') { select(sel + 1); e.preventDefault(); }
    else if (k === 'ArrowUp' || k === 'KeyW') { select(sel - 1); e.preventDefault(); }
    else if (k === 'Enter' || k === 'Space') { e.preventDefault(); items[sel] && items[sel].click(); }
  }
  function onAny(e) {
    if (!visible()) return;
    idleT = 0;
    if (phase !== 'menu') { e.preventDefault(); e.stopPropagation(); advance(); }
  }

  /* boot -> press -> menu */
  function setPhase(p) { phase = p; if (root) root.dataset.phase = p; }
  function runBoot() {
    const el = root.querySelector('.t-boot'); let i = 0, html = '';
    const cls = ['', 'p', 'w', 'r'];
    const step = () => {
      if (phase !== 'boot') return;
      if (i >= BOOT.length) { el.innerHTML = html + '<span class="cur"></span>'; bootTimer = setTimeout(() => toPress(), 420); return; }
      const [txt, c] = BOOT[i++];
      const m = txt.match(/^(.*?)( \.+ )?(\w+)?$/);
      html += m && m[2] ? `${m[1]}${m[2]}<span class="${cls[c]}">${m[3]}</span>\n` : `${txt}\n`;
      el.innerHTML = html + '<span class="cur"></span>';
      bootTimer = setTimeout(step, i === 1 ? 380 : 210 + Math.random() * 160);
    };
    step();
  }
  function toPress() {
    clearTimeout(bootTimer);
    if (phase !== 'boot') return;
    setPhase('press'); pressShownAt = performance.now();
    glitch();
  }
  function advance() {
    if (phase === 'boot') { toPress(); return; }
    if (phase === 'press' && performance.now() - pressShownAt > 250) toMenu(true);
  }
  function toMenu(withHit) {
    clearTimeout(bootTimer);
    if (phase === 'menu') return;
    setPhase('menu');
    if (window.AudioSys) { AudioSys.init(); AudioSys.resume(); }
    if (withHit) { logoHit(); const f = root.querySelector('.t-flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
    select(0, false);
  }

  /* =============================================================== sound (synth, on the game's sfx bus) */
  function ctx() { return window.AudioSys && AudioSys.ctx; }
  function bus() { return (window.AudioSys && (AudioSys.sfxBus || AudioSys.master)) || null; }
  function blip(k) {
    const c = ctx(), b = bus(); if (!c || !b || (window.AudioSys && AudioSys.sfxOn === false)) return;
    const t0 = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(1500 * k, t0); o.frequency.exponentialRampToValueAtTime(900 * k, t0 + .045);
    g.gain.setValueAtTime(.0001, t0); g.gain.linearRampToValueAtTime(.05, t0 + .004); g.gain.exponentialRampToValueAtTime(.0001, t0 + .06);
    o.connect(g); g.connect(b); o.start(t0); o.stop(t0 + .08);
  }
  function confirmFx() {
    const c = ctx(), b = bus(); if (!c || !b) return;
    const t0 = c.currentTime;
    const n = c.createBufferSource(), len = c.sampleRate * .35 | 0, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    n.buffer = buf; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(600, t0); f.frequency.exponentialRampToValueAtTime(5200, t0 + .3);
    const g = c.createGain(); g.gain.value = .22; n.connect(f); f.connect(g); g.connect(b); n.start(t0);
    blip(1.6);
  }
  // the hit when the menu opens: a sub drop, a body thump and a long airy tail
  function logoHit() {
    const c = ctx(), b = bus(); if (!c || !b) return;
    const t0 = c.currentTime + .02;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(32, t0 + 1.6);
    g.gain.setValueAtTime(.0001, t0); g.gain.linearRampToValueAtTime(.85, t0 + .012); g.gain.exponentialRampToValueAtTime(.0001, t0 + 2.4);
    o.connect(g); g.connect(b); o.start(t0); o.stop(t0 + 2.5);
    for (const [f0, det] of [[55, 0], [82.4, 7], [110, -6]]) {
      const s = c.createOscillator(), sg = c.createGain(), lp = c.createBiquadFilter();
      s.type = 'sawtooth'; s.frequency.value = f0; s.detune.value = det; lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2400, t0); lp.frequency.exponentialRampToValueAtTime(180, t0 + 2.8);
      sg.gain.setValueAtTime(.0001, t0); sg.gain.linearRampToValueAtTime(.07, t0 + .02); sg.gain.exponentialRampToValueAtTime(.0001, t0 + 3.2);
      s.connect(lp); lp.connect(sg); sg.connect(b); s.start(t0); s.stop(t0 + 3.3);
    }
    const len = c.sampleRate * 3 | 0, buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const n = c.createBufferSource(); n.buffer = buf; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const ng = c.createGain(); ng.gain.value = .12; n.connect(hp); hp.connect(ng); ng.connect(b); n.start(t0);
  }

  /* =============================================================== the diorama */
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const tx = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding; return tx;
  }
  function windowTex(seed) {
    let s = seed * 9301 + 49297; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const pal = [['#ffd27a', '#ffb04a'], ['#7ae8ff', '#38c6ff'], ['#ff6ad5', '#d94aff'], ['#c9b8ff', '#9a8cff']][seed % 4];
    const tx = canvasTex(64, 64, (x, w, h) => {
      x.fillStyle = '#05030b'; x.fillRect(0, 0, w, h);
      for (let j = 0; j < 8; j++) for (let i = 0; i < 4; i++) {
        const lit = rnd();
        const k = seed % 2 ? .55 : 1;                         // half the towers are mostly dark
        x.fillStyle = lit < .2 * k ? pal[0] : lit < .29 * k ? pal[1] : lit < .38 ? '#1c1530' : '#08060f';
        x.fillRect(i * 16 + 3, j * 8 + 2, 10, 4);
      }
    });
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.magFilter = THREE.NearestFilter;
    return tx;
  }
  function adTex(text, a, b) {
    return canvasTex(256, 96, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, a); g.addColorStop(1, b);
      x.fillStyle = '#07030f'; x.fillRect(0, 0, w, h); x.strokeStyle = g; x.lineWidth = 5; x.strokeRect(5, 5, w - 10, h - 10);
      x.fillStyle = g; x.font = '900 40px Arial Narrow, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(text, w / 2, h / 2 + 2);
    });
  }

  function buildDiorama() {
    built = true;
    S3 = new THREE.Scene();
    S3.fog = new THREE.FogExp2(0x0e0619, 0.0072);
    cam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 900);

    // sky: deep violet to a hot magenta horizon, with a band of city glow
    const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { t: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `varying vec3 vP; uniform float t;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          float y = vP.y;
          vec3 top = vec3(.006,.003,.02), mid = vec3(.05,.015,.11), hor = vec3(.30,.04,.24);
          vec3 c = mix(hor, mid, smoothstep(-.02,.16,y)); c = mix(c, top, smoothstep(.12,.7,y));
          c += vec3(.0,.35,.45) * exp(-abs(y-.005)*55.) * .35;
          vec2 sp = floor(vec2(atan(vP.z, vP.x)*220., y*220.));
          float s = step(.9965, h(sp)) * smoothstep(.12,.5,y) * (.6+.4*sin(t*2.+h(sp)*40.));
          c += vec3(s);
          gl_FragColor = vec4(c, 1.);
        }`,
    }));
    S3.add(sky); pulseMats.push({ sky });

    // Turing's ring: a vast halo with an eye at its heart
    ring = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x9af6ff, fog: false });
    const ringIn = new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: .55, fog: false, blending: THREE.AdditiveBlending, depthWrite: false });
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(150, 4.2, 6, 160), ringMat));
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(141, .7, 4, 160), ringIn));
    const segs = new THREE.Group();
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2, m = new THREE.Mesh(new THREE.BoxGeometry(5, 9, 5), new THREE.MeshBasicMaterial({ color: i % 6 ? 0x2a1d55 : 0xff2db4, fog: false }));
      m.position.set(Math.cos(a) * 150, Math.sin(a) * 150, 0); m.rotation.z = a; segs.add(m);
    }
    ring.add(segs);
    eye = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 14), new THREE.MeshBasicMaterial({ color: 0xff3366, fog: false }));
    eyeHalo = new THREE.Mesh(new THREE.RingGeometry(12, 30, 48), new THREE.MeshBasicMaterial({ color: 0xff2d78, transparent: true, opacity: .35, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.add(eye, eyeHalo);
    ring.scale.setScalar(.62); ring.position.set(95, 150, -470); ring.rotation.set(.18, -.55, .1);
    S3.add(ring);

    // the city: towers all round, densest out in front (-z), fading into the fog
    const geos = [[], [], [], [], [], []];
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const tower = (x, z, w, d, h, k) => {
      const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv;
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
        const i = f * 4 + v, u = uv.getX(i), vv = uv.getY(i);
        if (f === 2 || f === 3) uv.setXY(i, 0, 0);
        else uv.setXY(i, u * (f < 2 ? d : w) / 6, vv * h / 6);
      }
      g.translate(x, h / 2 - 70, z); geos[k].push(g);
    };
    for (let i = 0; i < 520; i++) {
      const a = rnd() * Math.PI * 2, front = Math.cos(a - Math.PI * 1.5);    // 1 when straight ahead (-z)
      const dist = 34 + Math.pow(rnd(), .7) * (front > 0 ? 330 : 170);
      const x = Math.cos(a) * dist + (rnd() - .5) * 10, z = Math.sin(a) * dist;
      if (Math.abs(x) < 26 && z > -34 && z < 26) continue;
      const big = rnd() < .08;
      const h = (big ? 120 + rnd() * 110 : 30 + rnd() * 80) * (dist < 70 ? .75 : 1);
      tower(x, z, 8 + rnd() * 14, 8 + rnd() * 14, h, i % 6);
    }
    const cityMats = [];
    geos.forEach((list, k) => {
      if (!list.length) return;
      const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(list);
      const m = new THREE.MeshLambertMaterial({ color: 0x0b0817, emissive: 0xffffff, emissiveMap: windowTex(k + 3), emissiveIntensity: .95 });
      cityMats.push(m); S3.add(new THREE.Mesh(merged, m));
    });
    pulseMats.push({ city: cityMats });

    // neon billboards on the nearer towers
    const ads = [['GIGACORP', '#00e5ff', '#9b59ff'], ['SUBSCRIBE', '#ff2db4', '#ffe600'], ['OBEY', '#ff3366', '#ff9a3d'], ['BREATHE+', '#39ff88', '#00e5ff'],
      ['TURING', '#c79bff', '#00e5ff'], ['LIKE', '#ffe600', '#ff2db4'], ['STAY ONLINE', '#00e5ff', '#39ff88'], ['DREAMCASTER', '#ff2db4', '#9b59ff']];
    const adMats = [];
    for (let i = 0; i < 14; i++) {
      const [txt, a, b] = ads[i % ads.length];
      const m = new THREE.MeshBasicMaterial({ map: adTex(txt, a, b), side: THREE.DoubleSide, fog: true });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(26, 9.75), m);
      const ang = -Math.PI / 2 + (i / 13 - .5) * 2.8 + (rnd() - .5) * .2, d = 95 + rnd() * 150;
      p.position.set(Math.cos(ang) * d, -10 + rnd() * 40, Math.sin(ang) * d);
      p.lookAt(0, p.position.y * .6, 0);
      S3.add(p); adMats.push({ m, flick: rnd() < .35, ph: rnd() * 10 });
    }
    pulseMats.push({ ads: adMats });

    // searchlights sweeping the clouds
    const beamTex = canvasTex(4, 64, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    for (let i = 0; i < 5; i++) {
      const g = new THREE.CylinderGeometry(7, .4, 260, 16, 1, true); g.translate(0, 130, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: i % 2 ? 0x7af3ff : 0xc79bff, map: beamTex, transparent: true, opacity: .1,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.position.set(-170 + i * 85, -40, -150 - (i % 2) * 70);
      S3.add(m); sweep.push({ m, ph: i * 1.7, sp: .17 + i * .04 });
    }

    // drones and air traffic: blinking lights crossing in lanes
    const dGeo = new THREE.BufferGeometry(), N = 46, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const lane = i % 4;
      drones.push({ x: (rnd() - .5) * 500, y: 8 + lane * 13 + rnd() * 6, z: -60 - lane * 45 - rnd() * 30, v: (lane % 2 ? -1 : 1) * (8 + rnd() * 14), ph: rnd() * 6, c: [[1, .2, .4], [.4, .95, 1], [1, .9, .3]][i % 3] });
    }
    dGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    S3.add(new THREE.Points(dGeo, new THREE.PointsMaterial({ size: 2.2, vertexColors: true, sizeAttenuation: true, fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
    drones.geo = dGeo;

    // the rooftop: concrete, a lit parapet, plant and an antenna
    const conc = canvasTex(64, 64, (x, w, h) => {
      x.fillStyle = '#1d1824'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { const v = 18 + Math.random() * 26 | 0; x.fillStyle = `rgb(${v + 6},${v},${v + 12})`; x.fillRect(Math.random() * w | 0, Math.random() * h | 0, 2, 2); }
      x.strokeStyle = '#0d0b12'; x.lineWidth = 1; x.strokeRect(.5, .5, w - 1, h - 1);
    });
    conc.wrapS = conc.wrapT = THREE.RepeatWrapping; conc.repeat.set(8, 6); conc.magFilter = THREE.NearestFilter;
    const roofMat = new THREE.MeshLambertMaterial({ map: conc });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(34, 2, 26), roofMat); roof.position.set(0, -1, 6); S3.add(roof);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x241d2f });
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(34, .9, .5), wallMat); parapet.position.set(0, .45, -6.9); S3.add(parapet);
    const side = new THREE.Mesh(new THREE.BoxGeometry(.5, .9, 26), wallMat); side.position.set(-16.9, .45, 6); S3.add(side);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(34, 70, 26), new THREE.MeshLambertMaterial({ color: 0x0d0a14 })); skirt.position.set(0, -37, 6); S3.add(skirt);
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(34, .07, .08), neonMat); strip.position.set(0, .93, -6.66); S3.add(strip);
    const strip2 = new THREE.Mesh(new THREE.BoxGeometry(34, .1, .1), new THREE.MeshBasicMaterial({ color: 0xff2db4 })); strip2.position.set(0, -2.2, -7.05); S3.add(strip2);
    pulseMats.push({ neon: [neonMat, strip2.material] });
    for (const [x, z, w, h, d] of [[-9, 3, 3, 1.6, 2.2], [-5.5, 6, 2, 1.1, 2], [8, 5, 4, 2.2, 3], [11, 9, 2.4, 1.3, 2.4]]) {
      const u = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: 0x2c2638 })); u.position.set(x, h / 2, z); S3.add(u);
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(w * .3, w * .3, .06, 12), new THREE.MeshLambertMaterial({ color: 0x0c0a12 })); fan.position.set(x, h + .03, z); S3.add(fan);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.06, .12, 9, 6), new THREE.MeshLambertMaterial({ color: 0x3a3346 })); mast.position.set(-12, 4.5, -3); S3.add(mast);
    antennaLight = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2040 })); antennaLight.position.set(-12, 9.1, -3); S3.add(antennaLight);

    // light: dim violet fill, a cold rim from the city, a magenta kicker
    S3.add(new THREE.HemisphereLight(0x6a4fb0, 0x120a1c, .55));
    const rim = new THREE.DirectionalLight(0x7af3ff, 1.25); rim.position.set(-6, 9, -20); S3.add(rim);
    const kick = new THREE.DirectionalLight(0xff3db8, .9); kick.position.set(14, 4, 6); S3.add(kick);
    const key = new THREE.PointLight(0xb48cff, 1.2, 14, 1.6); key.position.set(-1.5, 3.2, -2); S3.add(key);

    // rain streaks
    const RN = 1400, rp = new Float32Array(RN * 6);
    for (let i = 0; i < RN; i++) { const x = (rnd() - .5) * 60, y = rnd() * 40 - 6, z = (rnd() - .7) * 50; rp.set([x, y, z, x - .05, y - .7, z], i * 6); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9fb8ff, transparent: true, opacity: .32, fog: false, depthWrite: false }));
    S3.add(rain);
    // data motes drifting up past the roof edge
    const MN = 220, mp = new Float32Array(MN * 3);
    for (let i = 0; i < MN; i++) mp.set([(rnd() - .5) * 40, rnd() * 18 - 4, -4 - rnd() * 30], i * 3);
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0x7af3ff, size: .09, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
    S3.add(motes);
  }

  function ensureAvatar() {
    if (avatarTried || !window.AvatarKit) return;
    avatarTried = true;
    AvatarKit.ready().then(() => {
      avatar = AvatarKit.create(AvatarKit.load());
      avatar.root.position.set(1.5, 0, -5.4);
      avatar.root.rotation.y = Math.PI - .35;                 // facing out over the city, a little toward the ring
      avatar.play('Idle', 0);
      S3.add(avatar.root);
    }).catch(err => console.warn('[Title] avatar', err));
  }
  // re-dress after the Fitting Room (called when the title is shown again)
  function refreshAvatar() {
    if (!avatar || !window.AvatarKit) return;
    const L = AvatarKit.load();
    if (L.sex !== avatar.sex) { avatar.dispose(); avatar = null; avatarTried = false; ensureAvatar(); }
    else avatar.apply(L);
  }

  /* camera shots, cut with a glitch every ~13 s */
  const SHOTS = [
    // over the shoulder toward the ring (the Reach shot)
    k => { cam.position.set(-1.1 + k * .9, 1.75 + k * .15, -1.2 - k * .5); cam.lookAt(14 - k * 6, 13 + k * 3, -120); cam.fov = 44; },
    // low hero angle from beyond the edge, looking back up at you
    k => { cam.position.set(3.1 - k * 1.1, 1.05 + k * .2, -7.7 - k * .25); cam.lookAt(1.25, 1.5, -5.3); cam.fov = 40; },
    // the wide: a crane drifting along the edge, you a silhouette against the city
    k => { cam.position.set(-9 + k * 7, 4.2 - k * .8, 7.5); cam.lookAt(1 + k * 2, 2.2, -40); cam.fov = 50; },
  ];
  const SHOT_LEN = 13;
  function glitch() {
    const g = root && root.querySelector('.t-glitch'); if (!g) return;
    g.classList.remove('on'); void g.offsetWidth; g.classList.add('on');
    const c = ctx(), b = bus();
    if (c && b && phase === 'menu') {
      const t0 = c.currentTime, len = c.sampleRate * .18 | 0, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (i % 400 < 200 ? 1 : .2) * (1 - i / len);
      const n = c.createBufferSource(); n.buffer = buf; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 1.5;
      const gg = c.createGain(); gg.gain.value = .05; n.connect(f); f.connect(gg); gg.connect(b); n.start(t0);
    }
  }

  /* =============================================================== per frame */
  function tick(dt) {
    if (!R) return false;
    if (!built) { buildDiorama(); ensureAvatar(); }
    if (!active) {
      active = true;
      const p = composer.passes.find(x => x instanceof THREE.RenderPass) || composer.passes[0];
      pass = p; saved = { scene: p.scene, camera: p.camera };
      p.scene = S3; p.camera = cam;
      refreshAvatar();
    }
    t += dt; shotT += dt; idleT += dt;
    if (shotT > SHOT_LEN) { shotT = 0; shot = (shot + 1) % SHOTS.length; }
    if (shotT > SHOT_LEN - .21 && glitchAt !== shot) { glitchAt = shot; glitch(); }
    const ease = x => x * x * (3 - 2 * x);
    SHOTS[shot](ease(Math.min(1, shotT / SHOT_LEN)));
    cam.aspect = innerWidth / innerHeight;
    // handheld breathing
    cam.position.x += Math.sin(t * .7) * .025; cam.position.y += Math.sin(t * 1.1) * .02;
    cam.updateProjectionMatrix();

    // beat: neon kicks on every beat of the title theme (or a slow breath before it starts)
    const B = window.Music && Music.current === 'title' ? Music.beat() : null;
    const kick = B && B.live ? Math.exp(-B.phase * 5) * (B.beat % 4 === 0 ? 1 : .55) : .5 + .5 * Math.sin(t * 1.4);
    for (const P of pulseMats) {
      if (P.sky) P.sky.material.uniforms.t.value = t;
      if (P.neon) P.neon.forEach((m, i) => { m.color.setHex(i ? 0xff2db4 : 0x00e5ff).multiplyScalar(.6 + .8 * kick); });
      if (P.city) for (const m of P.city) m.emissiveIntensity = .72 + .22 * kick;
      if (P.ads) for (const a of P.ads) {
        const fl = a.flick && Math.sin(t * 23 + a.ph) > .93 && Math.sin(t * 1.3 + a.ph) > .3 ? .15 : 1;
        a.m.color.setScalar(fl * (.75 + .35 * kick));
      }
    }
    ring.rotation.z += dt * .012;
    ring.children[2].rotation.z -= dt * .03;
    const ep = .75 + .25 * Math.sin(t * 2.2) + .35 * kick * (B && B.live ? 1 : 0);
    eye.scale.setScalar(ep); eyeHalo.scale.setScalar(1 + .25 * Math.sin(t * 1.1)); eyeHalo.material.opacity = .25 + .2 * kick;
    antennaLight.visible = (t % 1.6) < .18;
    for (const s of sweep) { s.m.rotation.z = Math.sin(t * s.sp + s.ph) * .45; s.m.rotation.x = Math.cos(t * s.sp * .7 + s.ph) * .25 - .1; }

    // drones
    const dp = drones.geo.attributes.position, dc = drones.geo.attributes.color;
    drones.forEach((d, i) => {
      d.x += d.v * dt; if (d.x > 260) d.x = -260; if (d.x < -260) d.x = 260;
      dp.setXYZ(i, d.x, d.y + Math.sin(t + d.ph) * .6, d.z);
      const on = (t * 1.3 + d.ph) % 1 < .5 ? 1 : .25;
      dc.setXYZ(i, d.c[0] * on, d.c[1] * on, d.c[2] * on);
    });
    dp.needsUpdate = dc.needsUpdate = true;

    // rain falls and wraps, leaning with the wind
    wind = .6 + Math.sin(t * .3) * .4;
    const rp = rain.geometry.attributes.position.array;
    for (let i = 0; i < rp.length; i += 6) {
      rp[i + 1] -= 26 * dt; rp[i + 4] -= 26 * dt; rp[i] -= wind * 3 * dt; rp[i + 3] = rp[i] - wind * .08;
      if (rp[i + 4] < -6) { const y = 34 + Math.random() * 6; rp[i + 1] = y; rp[i + 4] = y - .7; rp[i] = cam.position.x + (Math.random() - .5) * 60; rp[i + 3] = rp[i] - .05; rp[i + 2] = rp[i + 5] = cam.position.z + (Math.random() - .75) * 50; }
    }
    rain.geometry.attributes.position.needsUpdate = true;
    const mp = motes.geometry.attributes.position.array;
    for (let i = 0; i < mp.length; i += 3) { mp[i + 1] += dt * (.25 + (i % 7) * .05); mp[i] += Math.sin(t + i) * dt * .1; if (mp[i + 1] > 14) mp[i + 1] = -4; }
    motes.geometry.attributes.position.needsUpdate = true;

    if (avatar) avatar.update(dt);

    // UI: controller focus drives the selection; any pad button passes the gates
    if (root && visible()) {
      if (phase !== 'menu') pollPadForStart();
      else {
        const pf = items.findIndex(b => b.classList.contains('pad-focus'));
        if (pf >= 0 && pf !== sel) select(pf);
        const clk = root.querySelector('.t-status .clk'); if (clk) clk.textContent = 'SIM CLOCK ' + new Date().toTimeString().slice(0, 8) + ' // 2049';
        const bars = root.querySelectorAll('.t-status .bars i');
        const spec = window.Music && Music.spectrum ? Music.spectrum() : null;
        bars.forEach((b, i) => { const v = spec ? spec[2 + i * 3] / 255 : .3 + .3 * Math.sin(t * 3 + i); b.style.height = (3 + v * 9).toFixed(1) + 'px'; });
      }
    }
    return true;
  }
  let padWas = false;
  function pollPadForStart() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const any = pads.some(p => p.buttons.some(b => b.pressed));
    if (any && !padWas) advance();
    padWas = any;
  }

  function leave() {
    if (!active) return;
    active = false;
    if (pass && saved) { pass.scene = saved.scene; pass.camera = saved.camera; }
  }

  function init(opts) {
    R = opts.renderer; composer = opts.composer;
    buildDOM();
    // the boot log plays once per session; a reload (e.g. switching the Look) goes straight to PRESS ANY BUTTON
    let booted = false; try { booted = sessionStorage.getItem('e2049.booted') === '1'; sessionStorage.setItem('e2049.booted', '1'); } catch (e) { /* private mode */ }
    setPhase('boot');
    if (booted) toPress(); else runBoot();
    addEventListener('resize', () => { if (cam) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); } });
  }

  window.TitleScreen = {
    init, tick, leave, toMenu: () => toMenu(false), refresh: refreshAvatar,
    get phase() { return phase; }, get scene() { return S3; }, get camera() { return cam; },
    shot: i => { shot = i % SHOTS.length; shotT = 0; },
  };
})();
