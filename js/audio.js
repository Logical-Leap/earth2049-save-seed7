/* EARTH 2049: SAVE SEED 7 — synthesized audio (WebAudio) */
'use strict';

const AudioSys = (() => {
  let ctx = null, master = null, sfxBus = null, musBus = null;
  let sfxOn = true, musOn = true;
  let musicTimer = null, musicStep = 0, musicInt = 0.4;

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
      musBus = ctx.createGain(); musBus.gain.value = 0.16; musBus.connect(master);
    } catch (e) { ctx = null; }
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0008, t + a + d);
  }
  function osc(type, f0, f1, a, d, peak, dest, t0) {
    const t = t0 !== undefined ? t0 : ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + a + d);
    env(g, t, a, peak, d);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + a + d + 0.05);
  }
  function noise(dur, peak, fType, f0, f1, dest, t0) {
    const t = t0 !== undefined ? t0 : ctx.currentTime;
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); env(g, t, 0.004, peak, dur);
    let node = src;
    if (fType) {
      const fl = ctx.createBiquadFilter(); fl.type = fType;
      fl.frequency.setValueAtTime(f0, t);
      if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
      node.connect(fl); node = fl;
    }
    node.connect(g); g.connect(dest || sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
  }

  const S = {
    // layered gunshots: click transient + noise body + sub thump
    shot_pistol(){ osc('square',2400,900,0.001,0.02,0.22); noise(0.1,0.6,'lowpass',3400,600); osc('sine',150,55,0.003,0.09,0.42); },
    shot_smg()   { osc('square',2800,1100,0.001,0.015,0.16); noise(0.06,0.5,'lowpass',3600,900); osc('sine',180,70,0.002,0.05,0.3); },
    shot_shotgun(){ osc('square',1800,500,0.001,0.03,0.3); noise(0.26,0.9,'lowpass',2800,240); osc('sine',95,34,0.004,0.22,0.75); noise(0.12,0.3,'highpass',2000,4000); },
    shot_ar()    { osc('square',2600,1000,0.001,0.02,0.2); noise(0.09,0.62,'lowpass',3200,700); osc('sine',140,52,0.003,0.08,0.42); },
    shot_dmr()   { osc('square',3200,800,0.001,0.03,0.3); noise(0.2,0.8,'lowpass',3800,400); osc('sawtooth',700,90,0.002,0.16,0.28); osc('sine',80,38,0.004,0.2,0.6); },
    shot_lmg()   { osc('square',2200,800,0.001,0.02,0.2); noise(0.08,0.68,'lowpass',2600,450); osc('sine',110,45,0.003,0.07,0.45); },
    shot_energy(){ osc('sawtooth',1300,240,0.002,0.12,0.34); osc('sine',1900,340,0.002,0.09,0.22); noise(0.05,0.2,'highpass',3000,6000); },
    shot_rocket(){ osc('square',1400,300,0.002,0.05,0.3); noise(0.45,0.7,'lowpass',1500,180); osc('sawtooth',110,50,0.01,0.38,0.36); osc('sine',70,40,0.005,0.3,0.5); },
    expl()  { noise(0.55,0.85,'lowpass',1500,90); osc('sine',85,32,0.006,0.5,0.7); },
    hit()   { osc('square',900,500,0.002,0.045,0.18); },
    crit()  { osc('square',1500,800,0.002,0.06,0.25); osc('sine',2200,1400,0.002,0.05,0.15); },
    kill()  { osc('square',700,180,0.003,0.12,0.3); },
    hurt()  { noise(0.12,0.5,'lowpass',900,200); osc('sawtooth',160,60,0.004,0.14,0.4); },
    dash()  { noise(0.18,0.35,'bandpass',700,2600); },
    jump()  { osc('sine',300,500,0.01,0.09,0.15); },
    pickup(){ osc('sine',700,700,0.005,0.07,0.25); osc('sine',1050,1050,0.005,0.09,0.25,sfxBus,ctx.currentTime+0.06); },
    shard() { osc('sine',1300+Math.random()*300,1900,0.003,0.07,0.16); },
    wpickup(){ [520,780,1170].forEach((f,i)=>osc('sine',f,f,0.005,0.14,0.24,sfxBus,ctx.currentTime+i*0.07)); },
    augment(){ [392,523,659,784].forEach((f,i)=>osc('sine',f,f,0.01,0.5,0.2,sfxBus,ctx.currentTime+i*0.09)); },
    nammo() { osc('square',220,140,0.004,0.09,0.2); },
    swap()  { noise(0.07,0.25,'highpass',1200,3000); },
    boss()  { osc('sawtooth',55,55,0.05,1.6,0.5); osc('sawtooth',55.8,55.8,0.05,1.6,0.4); noise(1.2,0.25,'lowpass',400,80); },
    tele()  { osc('sine',1800,200,0.004,0.3,0.3); noise(0.25,0.3,'highpass',800,4000); },
    turing(){ osc('square',180,180,0.002,0.04,0.15); osc('square',240,240,0.002,0.04,0.15,sfxBus,ctx.currentTime+0.05); },
    ui()    { osc('sine',880,880,0.003,0.06,0.18); },
    combo() { osc('sine',900+Math.random()*500,1600,0.003,0.1,0.2); },
    spawn() { osc('sawtooth',400,90,0.006,0.25,0.22); },
    revive(){ [523,659,784,1046].forEach((f,i)=>osc('sine',f,f,0.01,0.6,0.25,sfxBus,ctx.currentTime+i*0.11)); },
    wave()  { [660,880].forEach((f,i)=>osc('sine',f,f,0.008,0.3,0.2,sfxBus,ctx.currentTime+i*0.12)); },
  };

  function sfx(name) {
    if (!ctx || !sfxOn) return;
    resume();
    const f = S[name]; if (f) { try { f(); } catch (e) {} }
  }

  /* ---- music: dark synth loop, intensity 0..1 ---- */
  const BASS = [55, 55, 65.4, 49, 55, 55, 73.4, 65.4];      // A1 A1 C2 G1 A1 A1 D2 C2
  const ARP  = [220, 261.6, 329.6, 261.6, 220, 329.6, 392, 329.6];
  let intensity = 0.35;

  function schedStep() {
    if (!ctx || !musOn) return;
    const t = ctx.currentTime;
    const b = BASS[musicStep % 8];
    // bass
    osc('sawtooth', b, b, 0.01, musicInt * 0.9, 0.5, musBus, t);
    osc('square', b / 2, b / 2, 0.01, musicInt * 0.9, 0.25, musBus, t);
    // hats
    if (musicStep % 2 === 0) noise(0.03, 0.12, 'highpass', 6000, 8000, musBus, t);
    // pad every 8 steps
    if (musicStep % 8 === 0) {
      osc('sawtooth', 110, 110, 0.4, musicInt * 7, 0.12, musBus, t);
      osc('sawtooth', 111, 111, 0.4, musicInt * 7, 0.10, musBus, t);
      osc('sawtooth', 165, 165, 0.5, musicInt * 7, 0.07, musBus, t);
    }
    // arp when intense
    if (intensity > 0.55) {
      const a = ARP[musicStep % 8] * (intensity > 0.85 ? 2 : 1);
      osc('square', a, a, 0.005, musicInt * 0.5, 0.09, musBus, t);
    }
    musicStep++;
  }
  function musicStart() {
    if (!ctx || musicTimer) return;
    musicStep = 0;
    musicTimer = setInterval(() => { if (musOn && ctx.state === 'running') schedStep(); }, musicInt * 1000);
  }
  function musicStop() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

  return {
    init, resume, sfx,
    musicStart, musicStop,
    setIntensity(v) { intensity = v; },
    setSfx(v) { sfxOn = v; }, setMusic(v) { musOn = v; if (!v) musicStop(); else musicStart(); },
    get sfxOn() { return sfxOn; }, get musOn() { return musOn; },
  };
})();
