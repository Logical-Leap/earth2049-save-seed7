/* EARTH 2049: SAVE SEED 7 — ARENA sound: every sound is synthesised at runtime (no audio files).
 *
 * Guns are layered like real weapon sound design: a hard transient click, a filtered noise "crack",
 * a pitched-down sine "thump" for weight, an optional mechanical tail (bolt, pump, shell), all through a
 * soft clipper and into a short outdoor-slap reverb. Every voice gets random pitch and level so
 * full-auto never sounds like a machine gun sample loop. Positional sounds (enemy shots, explosions)
 * are panned and attenuated by distance from the camera.
 */
'use strict';

AR.Sfx = (() => {
  let ctx = null, out = null, dry = null, verb = null, comp = null, noiseBuf = null, enabled = true;
  const listener = { x: 0, y: 0, z: 0, yaw: 0 };

  function init() {
    if (out) return true;
    ctx = AudioSys?.ctx;
    if (!ctx) return false;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.12;
    out = ctx.createGain(); out.gain.value = 0.9;
    dry = ctx.createGain();
    verb = ctx.createConvolver(); verb.buffer = impulse(1.1, 2.6);
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    dry.connect(comp); verb.connect(wet); wet.connect(comp);
    comp.connect(out); out.connect(AudioSys.master || ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;          // NOSONAR - audio noise
    return true;
  }
  function impulse(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // early slap off the buildings, then a diffuse tail
        const slap = (i > ctx.sampleRate * 0.045 && i < ctx.sampleRate * 0.06) ? 0.6 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + slap * (Math.random() * 2 - 1)) * 0.5;   // NOSONAR
      }
    }
    return b;
  }
  const ok = () => enabled && (out || init()) && AudioSys?.sfxOn !== false && ctx.state === 'running';
  const now = () => ctx.currentTime;
  const R = (a, b) => a + Math.random() * (b - a);                           // NOSONAR

  /* ------------------------------------------------------------------ voice building blocks */
  function voiceBus(gain = 1, pan = 0, send = 0.5) {
    const g = ctx.createGain(); g.gain.value = gain;
    let node = g;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); node = p; }
    node.connect(dry);
    if (send > 0) { const s = ctx.createGain(); s.gain.value = send; node.connect(s); s.connect(verb); }
    return g;
  }
  function noise(dest, t, dur, type, f0, f1, q, peak, attack = 0.001, curve = 'exp') {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = R(0.9, 1.1);
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + dur); else g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.2); src.stop(t + dur + 0.05);                 // NOSONAR
  }
  function tone(dest, t, dur, type, f0, f1, peak, attack = 0.002) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function clipper(dest, amount = 3) {
    const ws = ctx.createWaveShaper(); const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
    ws.curve = c; ws.connect(dest); return ws;
  }

  /* ------------------------------------------------------------------ guns */
  // each recipe: crack (noise band), thump (sine drop), click, tail, level
  const GUNS = {
    pistol:  { crack: [2600, 900, 0.09, 0.75], thump: [190, 55, 0.09, 0.9], click: 0.5, tail: 'slide', clip: 2.5, lv: 0.8 },
    smg:     { crack: [3400, 1400, 0.06, 0.55], thump: [230, 80, 0.06, 0.6], click: 0.35, tail: null, clip: 2.2, lv: 0.6 },
    shotgun: { crack: [1500, 300, 0.32, 1.0], thump: [120, 32, 0.26, 1.4], click: 0.6, tail: 'pump', clip: 4, lv: 1.0, boom: true },
    ar:      { crack: [2200, 700, 0.11, 0.8], thump: [160, 48, 0.12, 1.0], click: 0.45, tail: null, clip: 3, lv: 0.75 },
    dmr:     { crack: [1800, 260, 0.45, 1.1], thump: [100, 28, 0.38, 1.5], click: 0.8, tail: 'bolt', clip: 4.5, lv: 1.05, boom: true },
    energy:  { crack: [5200, 1800, 0.12, 0.35], thump: [420, 90, 0.16, 0.55], click: 0.2, tail: 'zap', clip: 1.6, lv: 0.75 },
    rocket:  { crack: [900, 200, 0.22, 0.6], thump: [90, 40, 0.2, 1.1], click: 0.3, tail: 'tube', clip: 2.5, lv: 0.85 },
    lmg:     { crack: [1900, 600, 0.12, 0.85], thump: [130, 40, 0.13, 1.1], click: 0.5, tail: null, clip: 3.4, lv: 0.78 },
  };
  function gun(kind, opts = {}) {
    if (!ok()) return;
    const r = GUNS[kind] || GUNS.pistol, t = now(), p = R(0.94, 1.06) * (opts.pitch || 1);
    const bus = voiceBus(r.lv * R(0.9, 1.05) * (opts.gain || 1), 0, r.boom ? 0.8 : 0.55);
    const cl = clipper(bus, r.clip);
    noise(cl, t, 0.012, 'highpass', 6000, 3000, 0.7, r.click);                       // transient
    noise(cl, t, r.crack[2], 'bandpass', r.crack[0] * p, r.crack[1] * p, 0.9, r.crack[3]);
    tone(cl, t, r.thump[2], 'sine', r.thump[0] * p, r.thump[1], r.thump[3]);
    if (r.boom) noise(cl, t, r.crack[2] * 1.6, 'lowpass', 900, 120, 0.5, 0.6, 0.004);
    if (kind === 'energy') { tone(cl, t, 0.16, 'sawtooth', 1400 * p, 220, 0.18); tone(cl, t + 0.01, 0.12, 'square', 2200 * p, 600, 0.06); }
    if (kind === 'rocket') noise(cl, t + 0.02, 0.5, 'bandpass', 600, 2400, 2, 0.25, 0.05, 'lin');
    if (r.tail === 'pump') { mech(t + 0.32, 0.5); mech(t + 0.46, 0.4); }
    if (r.tail === 'bolt') { mech(t + 0.45, 0.45); mech(t + 0.62, 0.5); }
    if (r.tail === 'slide') noise(cl, t + 0.03, 0.03, 'highpass', 4500, 3000, 1, 0.15);
    if (opts.lastShot) tone(bus, t + 0.05, 0.08, 'square', 1800, 1500, 0.06);
  }
  function mech(t, lv = 0.4) {
    const b = voiceBus(lv, 0, 0.1);
    noise(b, t, 0.035, 'bandpass', 3200, 1800, 3, 0.7);
    noise(b, t + 0.012, 0.05, 'bandpass', 1300, 900, 4, 0.5);
  }
  function dry_() { if (!ok()) return; const b = voiceBus(0.5, 0, 0); tone(b, now(), 0.04, 'square', 1500, 1300, 0.12); noise(b, now(), 0.03, 'bandpass', 4000, 3000, 4, 0.4); }
  function reload(kind, phase) {
    if (!ok()) return;
    const t = now();
    if (phase === 'out') mech(t, 0.45);
    else if (phase === 'in') { mech(t, 0.55); mech(t + 0.06, 0.35); }
    else if (phase === 'shell') { mech(t, 0.4); noise(voiceBus(0.3, 0, 0.1), t + 0.02, 0.06, 'bandpass', 900, 700, 5, 0.6); }
    else if (phase === 'rack') { mech(t, 0.6); mech(t + 0.09, 0.6); }
  }

  /* ------------------------------------------------------------------ positional helper */
  function spatial(x, y, z, maxD = 60) {
    const dx = x - listener.x, dz = z - listener.z, d = Math.hypot(dx, y - listener.y, dz);
    const vol = Math.max(0, 1 - d / maxD) ** 1.6;
    const ang = Math.atan2(dx, -dz) - (-listener.yaw);
    return { vol, pan: Math.sin(ang) * Math.min(1, d / 6) * 0.8, d };
  }

  /* ------------------------------------------------------------------ feedback */
  function hit(crit, pitch = 1) {
    if (!ok()) return;
    const b = voiceBus(crit ? 0.55 : 0.32, 0, 0.05), t = now();
    if (crit) { tone(b, t, 0.12, 'sine', 2600 * pitch, 2500, 0.5); tone(b, t, 0.18, 'sine', 3790 * pitch, 3700, 0.25); tone(b, t, 0.05, 'triangle', 5200, 4800, 0.2); }
    else { tone(b, t, 0.05, 'square', 1700 * pitch, 1200, 0.2); noise(b, t, 0.03, 'highpass', 5000, 4000, 1, 0.3); }
  }
  function kill(streak = 0, big = false) {
    if (!ok()) return;
    const b = voiceBus(0.55, 0, 0.25), t = now();
    const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
    const n = 523.25 * Math.pow(2, scale[Math.min(scale.length - 1, streak)] / 12);
    tone(b, t, 0.09, 'square', n, n * 0.99, 0.16);
    tone(b, t + 0.045, 0.16, 'square', n * 1.5, n * 1.49, 0.12);
    noise(b, t, 0.12, 'bandpass', 900, 200, 1.2, 0.9);                        // body thud
    tone(b, t, 0.14, 'sine', 140, 45, 0.9);
    if (big) { noise(b, t, 0.5, 'lowpass', 1600, 80, 0.7, 0.9, 0.004); tone(b, t, 0.4, 'sine', 70, 28, 1.0); }
  }
  function headshot() {
    if (!ok()) return;
    const b = voiceBus(0.5, 0, 0.3), t = now();
    tone(b, t, 0.28, 'sine', 3136, 3100, 0.35); tone(b, t, 0.36, 'sine', 4699, 4650, 0.18);
    noise(b, t, 0.05, 'bandpass', 2400, 1200, 2, 0.6);
  }
  function hurt(amount) {
    if (!ok()) return;
    const b = voiceBus(0.7, 0, 0.05), t = now();
    tone(b, t, 0.18, 'sine', 120, 50, Math.min(1, 0.4 + amount / 30));
    noise(b, t, 0.16, 'lowpass', 1400, 200, 1, 0.6);
    tone(b, t, 0.06, 'square', 300, 200, 0.12);
  }
  function shieldBreak() { if (!ok()) return; const b = voiceBus(0.6, 0, 0.4), t = now(); for (let i = 0; i < 5; i++) tone(b, t + i * 0.025, 0.2, 'triangle', 2400 - i * 300, 600, 0.2); noise(b, t, 0.3, 'highpass', 6000, 2000, 1, 0.5); }
  function step(run) { if (!ok()) return; const b = voiceBus(0.12 + (run ? 0.05 : 0), 0, 0.02); noise(b, now(), 0.05, 'bandpass', R(500, 800), 200, 1.5, 0.8); }
  function jump(double) { if (!ok()) return; const b = voiceBus(0.3, 0, 0.1), t = now(); noise(b, t, 0.12, 'bandpass', 600, 1400, 1, 0.5); if (double) tone(b, t, 0.18, 'sine', 300, 900, 0.3); }
  function land(hard) { if (!ok()) return; const b = voiceBus(0.3 + hard * 0.4, 0, 0.1), t = now(); tone(b, t, 0.14, 'sine', 110, 40, 0.8); noise(b, t, 0.1, 'lowpass', 1000, 150, 1, 0.8); }
  function dash() { if (!ok()) return; const b = voiceBus(0.5, 0, 0.3), t = now(); noise(b, t, 0.28, 'bandpass', 600, 3800, 2, 0.8, 0.02); tone(b, t, 0.2, 'sawtooth', 180, 600, 0.06); }
  function slide(on) { if (!ok()) return; const b = voiceBus(0.35, 0, 0.1), t = now(); noise(b, t, on ? 0.5 : 0.12, 'bandpass', 1200, 700, 1, 0.5, 0.01, 'lin'); }
  function pad() { if (!ok()) return; const b = voiceBus(0.6, 0, 0.5), t = now(); tone(b, t, 0.45, 'square', 180, 1400, 0.2); tone(b, t, 0.5, 'sine', 90, 600, 0.6); noise(b, t, 0.3, 'bandpass', 800, 4000, 1.5, 0.4, 0.02); }
  function kick() { if (!ok()) return; const b = voiceBus(0.7, 0, 0.3), t = now(); tone(b, t, 0.16, 'sine', 160, 40, 1.2); noise(b, t, 0.08, 'lowpass', 2400, 300, 1, 0.9); noise(b, t - 0.08 > 0 ? t : t, 0.12, 'bandpass', 500, 1600, 1.5, 0.3, 0.06); }
  function pickup(kind) {
    if (!ok()) return;
    const b = voiceBus(0.35, 0, 0.2), t = now();
    const base = kind === 'health' ? 660 : kind === 'ammo' ? 440 : kind === 'chip' ? 990 : 550;
    tone(b, t, 0.08, 'square', base, base, 0.12); tone(b, t + 0.05, 0.1, 'square', base * 1.5, base * 1.5, 0.1);
    if (kind === 'chip') tone(b, t + 0.1, 0.12, 'square', base * 2, base * 2, 0.08);
  }
  function explosion(x, y, z, big = 1) {
    if (!ok()) return;
    const s = spatial(x, y, z, 90);
    const b = voiceBus(Math.min(1.2, (0.4 + s.vol) * big), s.pan, 0.9), t = now();
    const cl = clipper(b, 4);
    noise(cl, t, 0.9 * big, 'lowpass', 2600, 60, 0.8, 1.0, 0.003);
    tone(cl, t, 0.6, 'sine', 90, 24, 1.2);
    noise(cl, t + 0.04, 0.6, 'bandpass', 400, 120, 0.8, 0.6);
    noise(cl, t, 0.02, 'highpass', 5000, 2000, 1, 0.8);
  }
  function enemyShot(x, y, z, kind = 'bolt') {
    if (!ok()) return;
    const s = spatial(x, y, z, 70); if (s.vol < 0.02) return;
    const b = voiceBus(0.45 * s.vol, s.pan, 0.6), t = now();
    if (kind === 'heart') { tone(b, t, 0.18, 'triangle', 1600, 700, 0.3); tone(b, t, 0.14, 'sine', 2400, 1200, 0.15); }
    else if (kind === 'lob') { tone(b, t, 0.3, 'sine', 260, 90, 0.6); noise(b, t, 0.2, 'lowpass', 1200, 300, 1, 0.5); }
    else { tone(b, t, 0.16, 'sawtooth', 900, 260, 0.25); noise(b, t, 0.08, 'bandpass', 2400, 1200, 2, 0.4); }
  }
  function telegraph(x, y, z, pitch = 1) {
    if (!ok()) return;
    const s = spatial(x, y, z, 60);
    const b = voiceBus(0.5 * Math.max(0.25, s.vol), s.pan, 0.5), t = now();
    tone(b, t, 0.5, 'square', 220 * pitch, 880 * pitch, 0.12, 0.3);
    tone(b, t, 0.5, 'sine', 440 * pitch, 1760 * pitch, 0.1, 0.3);
  }
  function enemyHurt(x, y, z, kind) {
    if (!ok()) return;
    const s = spatial(x, y, z, 40); if (s.vol < 0.05) return;
    const b = voiceBus(0.35 * s.vol, s.pan, 0.2), t = now();
    if (kind === 'robot') { tone(b, t, 0.08, 'square', 600, 300, 0.2); noise(b, t, 0.06, 'highpass', 3000, 2000, 2, 0.4); }
    else { tone(b, t, 0.1, 'sawtooth', R(180, 260), R(120, 160), 0.18); noise(b, t, 0.06, 'bandpass', 800, 500, 2, 0.4); }
  }
  function groan(x, y, z) {
    if (!ok()) return;
    const s = spatial(x, y, z, 30); if (s.vol < 0.05) return;
    const b = voiceBus(0.3 * s.vol, s.pan, 0.4), t = now();
    const f = R(80, 130);
    tone(b, t, R(0.6, 1.1), 'sawtooth', f, f * 0.7, 0.25, 0.15);
    noise(b, t, 0.8, 'bandpass', 500, 300, 4, 0.2, 0.2);
  }
  function relayHum(x, y, z) { if (!ok()) return; const s = spatial(x, y, z, 30); if (s.vol < 0.05) return; const b = voiceBus(0.2 * s.vol, s.pan, 0.3); tone(b, now(), 0.5, 'sawtooth', 60, 62, 0.2, 0.1); }
  function ui(kind) {
    if (!ok()) return;
    const b = voiceBus(0.4, 0, 0.1), t = now();
    if (kind === 'card') { tone(b, t, 0.12, 'square', 880, 880, 0.12); tone(b, t + 0.06, 0.18, 'square', 1320, 1320, 0.1); }
    else if (kind === 'pick') { for (let i = 0; i < 4; i++) tone(b, t + i * 0.05, 0.12, 'square', 523 * Math.pow(2, i * 4 / 12), 523 * Math.pow(2, i * 4 / 12), 0.12); }
    else if (kind === 'rank') { tone(b, t, 0.3, 'square', 392, 392, 0.12); tone(b, t + 0.1, 0.3, 'square', 523, 523, 0.12); tone(b, t + 0.2, 0.5, 'square', 784, 784, 0.12); }
    else if (kind === 'alarm') { for (let i = 0; i < 3; i++) tone(b, t + i * 0.22, 0.18, 'square', 880, 660, 0.12); }
    else if (kind === 'hover') { tone(b, t, 0.035, 'square', 1900, 1800, 0.06); }
    else if (kind === 'objective') { tone(b, t, 0.2, 'triangle', 660, 660, 0.25); tone(b, t + 0.15, 0.35, 'triangle', 990, 990, 0.25); }
    else tone(b, t, 0.05, 'square', 1200, 1100, 0.1);
  }
  /* ------------------------------------------------------------------ the dopamine department */
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);                         // midi note -> Hz
  // a detuned saw stack through a sweeping lowpass: the "choir" under a fanfare chord
  function padChord(dest, t, notes, dur, peak, sweep = [700, 5200]) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(sweep[0], t); f.frequency.exponentialRampToValueAtTime(sweep[1], t + dur * 0.35); f.frequency.exponentialRampToValueAtTime(sweep[0] * 1.4, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.04); g.gain.setValueAtTime(peak * 0.8, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(dest);
    for (const n of notes) for (const det of [-9, 0, 8]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 6; lfo.connect(lg); lg.connect(o.detune);
      o.connect(f); o.start(t); o.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
  }
  function levelUp(level = 2) {
    if (!ok()) return;
    const b = voiceBus(0.85, 0, 0.55), t = now(), up = Math.min(5, Math.floor(level / 3));            // keys climb every few levels
    const root = 60 + up;
    tone(b, t, 0.7, 'sine', 140, 38, 0.9, 0.003);                           // the floor drops out
    noise(b, t, 0.5, 'lowpass', 1800, 80, 0.7, 0.5, 0.002);
    noise(b, t, 0.35, 'highpass', 900, 9000, 0.6, 0.25, 0.25, 'lin');       // whoosh up
    const arp = [0, 4, 7, 12, 16, 19, 24];
    arp.forEach((n, i) => {                                                   // the ding ding ding ding
      tone(b, t + 0.05 + i * 0.055, 0.22, 'square', hz(root + 12 + n), hz(root + 12 + n), 0.13);
      tone(b, t + 0.05 + i * 0.055, 0.3, 'triangle', hz(root + 24 + n), hz(root + 24 + n), 0.07);
    });
    padChord(b, t + 0.42, [root, root + 4, root + 7, root + 12, root + 16], 1.5, 0.11);           // the big major chord
    tone(b, t + 0.42, 1.4, 'sine', hz(root - 12), hz(root - 12), 0.35, 0.01);                       // sub under it
    for (let i = 0; i < 9; i++) {                                                                  // sparkles falling over the top
      const n = root + 31 + [0, 4, 7, 12][i % 4] - (i > 4 ? 12 : 0);
      tone(b, t + 0.5 + i * 0.09 + R(0, 0.03), 0.25, 'triangle', hz(n), hz(n), 0.06);
    }
    noise(b, t + 0.42, 1.2, 'highpass', 7000, 9000, 0.3, 0.05, 0.02);        // shimmer
  }
  let gemN = 0, gemT = 0;
  function gem() {
    // every chip in a quick run of pickups chimes a little higher, like coins in a combo
    if (!ok()) return;
    const t = now();
    gemN = t - gemT < 0.55 ? Math.min(gemN + 1, 24) : 0; gemT = t;
    const b = voiceBus(0.28, 0, 0.25), f = hz(84 + [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36][Math.min(15, Math.floor(gemN * 0.66))]);
    tone(b, t, 0.07, 'square', f, f, 0.1); tone(b, t + 0.03, 0.12, 'triangle', f * 2, f * 2, 0.07);
  }
  function cardDeal(i, r = 0) {
    if (!ok()) return;
    const b = voiceBus(0.5, (i - 1) * 0.5, 0.35), t = now();
    noise(b, t, 0.2, 'bandpass', 2400, 400, 1.2, 0.35, 0.01);                // whoosh in
    tone(b, t + 0.08, 0.06, 'square', 1600, 1500, 0.1);                       // the card lands
    if (r === 1) { tone(b, t + 0.12, 0.25, 'triangle', hz(84), hz(84), 0.15); tone(b, t + 0.2, 0.35, 'triangle', hz(91), hz(91), 0.13); }
    if (r === 2) {                                                            // legendary: a choir and a bell
      padChord(b, t + 0.1, [76, 80, 83, 88], 1.1, 0.06, [1200, 7000]);
      [88, 92, 95, 100].forEach((n, k) => tone(b, t + 0.14 + k * 0.07, 0.5, 'triangle', hz(n), hz(n), 0.09));
    }
  }
  function cardHover() {
    if (!ok()) return;
    const b = voiceBus(0.22, 0, 0.1), t = now();
    tone(b, t, 0.04, 'square', 2200, 2000, 0.07);
  }
  function cardPick(r = 0) {
    if (!ok()) return;
    const b = voiceBus(0.8, 0, 0.5), t = now(), root = 64 + r * 2;
    tone(b, t, 0.35, 'sine', 110, 45, 0.7, 0.002);                            // stamp
    noise(b, t, 0.18, 'lowpass', 3000, 200, 0.8, 0.5, 0.002);
    [0, 7, 12, 16, 19, 24].forEach((n, k) => tone(b, t + 0.06 + k * 0.04, 0.2, 'square', hz(root + 12 + n), hz(root + 12 + n), 0.1));
    padChord(b, t + 0.28, [root, root + 4, root + 7, root + 12], 0.9 + r * 0.4, 0.08 + r * 0.02);
  }

  function heartbeat(level) {
    if (!ok()) return;
    const b = voiceBus(0.5 * level, 0, 0), t = now();
    tone(b, t, 0.12, 'sine', 70, 40, 0.9); tone(b, t + 0.16, 0.1, 'sine', 60, 35, 0.6);
  }

  /* ------------------------------------------------------------------ ambience: rain on concrete + distant crowd */
  let amb = null;
  function ambience(on) {
    if (!on) { if (amb) { const t = ctx.currentTime; amb.g.gain.setTargetAtTime(0, t, 0.4); const a = amb; setTimeout(() => { try { a.srcs.forEach(s => s.stop()); a.g.disconnect(); } catch (err) { /* already stopped */ } }, 2000); amb = null; } return; }
    if (amb || !(out || init())) return;
    const g = ctx.createGain(); g.gain.value = 0; g.connect(comp);
    const srcs = [];
    const loop = (type, f, q, lv, rate = 1) => {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = rate;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const v = ctx.createGain(); v.gain.value = lv;
      s.connect(fl); fl.connect(v); v.connect(g); s.start(); srcs.push(s);
    };
    loop('highpass', 2400, 0.3, 0.12, 0.97);                   // rain hiss
    loop('bandpass', 900, 0.6, 0.08, 1.03);                    // rain body
    loop('lowpass', 260, 0.8, 0.12, 0.5);                      // city rumble / crowd
    g.gain.setTargetAtTime(0.5, ctx.currentTime, 1.5);
    amb = { g, srcs };
  }

  return {
    ambience,
    init, gun, dry: dry_, reload, hit, kill, headshot, hurt, shieldBreak, step, jump, land, dash, slide, pad, kick, pickup,
    explosion, enemyShot, telegraph, enemyHurt, groan, relayHum, ui, heartbeat, listener, levelUp, gem, cardDeal, cardHover, cardPick,
    set enabled(v) { enabled = v; },
  };
})();
