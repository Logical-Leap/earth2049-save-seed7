/* EARTH 2049: SAVE SEED 7 — gun audio (WebAudio, synthesized, no samples)
 *
 * Every shot is built from layers the way real gun sound design is: a mechanical transient (the click and
 * snap), the crack (band-passed noise through a drive stage), the body (a falling tone), the sub thump, the
 * gun's own signature (Volt zap, plasma sweep, launcher whoosh), mechanical follow-through (slide, bolt,
 * belt) and a room tail through a convolution reverb. Everything goes through a gun bus with a
 * compressor and soft clip, so a mag dump stays loud and dense without crackling.
 *
 * Rarity adds layers on top, so a better gun sounds heavier: more sub and drive from Rare up, an energy
 * sweep at Epic, a thunder layer at Legendary, a gold chime at Mythic and Turing glitch bursts at Relic.
 *
 *   GunAudio.shot(id, tier)            id: pistol smg shotgun ar dmr lmg energy rocket; tier 0..6
 *   GunAudio.foley(name, tier)         reload, handling and casing sounds (see FOLEY)
 */
'use strict';

const GunAudio = (() => {
  let ctx = null, bus = null, verbSend = null, noiseBuf = null, shaperSoft = null, shaperHard = null;

  function curve(k) {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
    return c;
  }
  function impulse(sec, decay) {
    const len = Math.max(1, (sec * ctx.sampleRate) | 0), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // a few early reflections, then a dense decaying tail
        const er = (i % 997 < 3 && t < .08) ? 1.6 : 0;
        d[i] = ((Math.random() * 2 - 1) + er * (Math.random() > .5 ? 1 : -1)) * Math.pow(1 - t, decay);
      }
    }
    return b;
  }

  let forced = false;
  function init(c, dest) {
    const sys = typeof AudioSys !== 'undefined' ? AudioSys : null;
    if (ctx && !c) return true;
    if (!c && !sys?.ctx) return false;
    ctx = c || sys.ctx; forced = !!c;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.14;
    const clip = ctx.createWaveShaper(); clip.curve = curve(1.6); clip.oversample = '2x';
    const out = ctx.createGain(); out.gain.value = 1.05;
    bus = ctx.createGain(); bus.gain.value = 0.9;
    bus.connect(comp); comp.connect(clip); clip.connect(out); out.connect(dest || sys.sfxBus);
    const verb = ctx.createConvolver(); verb.buffer = impulse(1.7, 3.2);
    const verbHp = ctx.createBiquadFilter(); verbHp.type = 'highpass'; verbHp.frequency.value = 180;
    const verbLp = ctx.createBiquadFilter(); verbLp.type = 'lowpass'; verbLp.frequency.value = 4200;
    verbSend = ctx.createGain(); verbSend.gain.value = 1;
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.42;
    verbSend.connect(verbHp); verbHp.connect(verbLp); verbLp.connect(verb); verb.connect(verbOut); verbOut.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    shaperSoft = curve(1.5); shaperHard = curve(3.2);
    return true;
  }
  const ok = () => (ctx || init()) && (forced || (AudioSys.sfxOn && ctx.state === 'running'));

  /* ------------------------------------------------ voices */
  // a voice is one shot: its layers mix into a gain -> drive -> pan -> bus (+ reverb send)
  function voice(t, opt) {
    const v = ctx.createGain(); v.gain.value = opt.gain || 1;
    const drive = ctx.createWaveShaper(); drive.curve = opt.hard ? shaperHard : shaperSoft;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = opt.lp || 10500; lp.Q.value = .5;
    v.connect(drive); drive.connect(lp);
    let last = lp;
    if (pan) { pan.pan.value = opt.pan || 0; lp.connect(pan); last = pan; }
    last.connect(bus);
    const send = ctx.createGain(); send.gain.value = opt.verb || 0.3; last.connect(send); send.connect(verbSend);
    if (!forced) setTimeout(() => { try { v.disconnect(); drive.disconnect(); lp.disconnect(); pan && pan.disconnect(); send.disconnect(); } catch (_) {} }, ((opt.life || 1.5) + 0.5) * 1000);
    return v;
  }
  function env(g, t, a, peak, d, shape) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (shape === 'lin') g.gain.linearRampToValueAtTime(0.0001, t + a + d);
    else g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(dest, type, f0, f1, t, a, d, peak) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(8, f1), t + a + d);
    env(g, t, a, peak, d); o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }
  function nz(dest, t, d, peak, type, f0, f1, q, a) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const g = ctx.createGain(); env(g, t, a || 0.0015, peak, d);
    let node = s;
    if (type) {
      const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q || 0.8;
      f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + d);
      s.connect(f); node = f;
    }
    node.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5, d + 0.1);
    return s;
  }
  const J = (x, j) => x * (1 + (Math.random() * 2 - 1) * (j || 0.04));      // per-shot jitter

  /* ------------------------------------------------ shots */
  const SHOTS = {
    pistol(v, t) {        // Volt-9: snappy crack with an electric zap on top
      nz(v, t, 0.012, 0.9, 'highpass', 3500); nz(v, t, 0.075, 1.0, 'bandpass', J(2600), 1100, 0.9);
      tone(v, 'triangle', J(280), 90, t, 0.001, 0.09, 0.75); tone(v, 'sine', J(115), 46, t, 0.002, 0.15, 0.95);
      tone(v, 'sawtooth', J(1900), 420, t, 0.001, 0.06, 0.22);
      nz(v, t + 0.045, 0.022, 0.32, 'bandpass', 3600, 2800, 2); tone(v, 'square', 1000, 720, t + 0.045, 0.001, 0.012, 0.10);
      return { verb: 0.26, gain: 0.95, life: 1.2, lp: 11000 };
    },
    smg(v, t) {           // VX-2: tight and fast, built to stack
      nz(v, t, 0.010, 0.7, 'highpass', 4200); nz(v, t, 0.048, 0.95, 'bandpass', J(3000), 1500, 0.9);
      tone(v, 'triangle', J(320), 130, t, 0.001, 0.06, 0.6); tone(v, 'sine', J(135), 60, t, 0.002, 0.085, 0.75);
      nz(v, t + 0.028, 0.015, 0.22, 'bandpass', 4000, 3000, 2);
      return { verb: 0.2, gain: 0.82, life: 0.9, lp: 12000 };
    },
    shotgun(v, t) {       // Riptide-12: a wall of low end with a long roar
      nz(v, t, 0.016, 1.0, 'highpass', 2600); nz(v, t, 0.13, 1.0, 'bandpass', J(1700), 480, 0.7);
      nz(v, t, 0.36, 1.0, 'lowpass', 1100, 140); tone(v, 'sine', J(84), 30, t, 0.003, 0.48, 1.0);
      tone(v, 'sawtooth', J(150), 45, t, 0.002, 0.30, 0.34); tone(v, 'triangle', J(210), 70, t, 0.001, 0.16, 0.5);
      nz(v, t + 0.075, 0.03, 0.3, 'bandpass', 2600, 1800, 1.5); tone(v, 'square', 520, 380, t + 0.075, 0.001, 0.02, 0.12);
      return { verb: 0.62, gain: 1.0, hard: true, life: 2.2, lp: 7500 };
    },
    ar(v, t) {            // M-52: punchy mid crack, the reference rifle
      nz(v, t, 0.012, 0.85, 'highpass', 5000); nz(v, t, 0.085, 1.0, 'bandpass', J(2400), 900, 0.85);
      tone(v, 'triangle', J(230), 80, t, 0.001, 0.12, 0.7); tone(v, 'sine', J(102), 42, t, 0.002, 0.22, 0.9);
      nz(v, t, 0.16, 0.45, 'lowpass', 900, 160);
      nz(v, t + 0.034, 0.018, 0.25, 'bandpass', 3300, 2500, 2);
      return { verb: 0.36, gain: 0.95, life: 1.5, lp: 10000 };
    },
    dmr(v, t) {           // LRX-7: supersonic snap, a huge crack and a slap echo off the city
      nz(v, t, 0.010, 1.0, 'highpass', 6500); nz(v, t, 0.15, 1.0, 'bandpass', J(3200), 700, 0.7);
      tone(v, 'triangle', J(190), 50, t, 0.001, 0.3, 0.8); tone(v, 'sine', J(72), 28, t, 0.003, 0.62, 1.0);
      nz(v, t, 0.4, 0.7, 'lowpass', 1200, 120);
      nz(v, t + 0.19, 0.16, 0.3, 'bandpass', 1500, 500, 0.8); nz(v, t + 0.44, 0.22, 0.14, 'bandpass', 1100, 400, 0.8);
      return { verb: 0.72, gain: 1.0, hard: true, life: 2.6, lp: 9500 };
    },
    lmg(v, t) {           // Compliance Saw: heavy, chesty, a belt rattle under every round
      nz(v, t, 0.012, 0.8, 'highpass', 3600); nz(v, t, 0.095, 1.0, 'bandpass', J(2000), 700, 0.8);
      tone(v, 'triangle', J(165), 60, t, 0.001, 0.14, 0.75); tone(v, 'sine', J(88), 36, t, 0.002, 0.26, 0.95);
      nz(v, t + 0.03, 0.025, 0.16, 'highpass', 4500); nz(v, t + 0.04, 0.02, 0.2, 'bandpass', 2800, 2000, 2);
      return { verb: 0.42, gain: 0.95, hard: true, life: 1.6, lp: 8500 };
    },
    energy(v, t) {        // Plasma Lancer: a charged zap, a falling sweep and a sub kick
      tone(v, 'sawtooth', J(1500), 170, t, 0.002, 0.17, 0.45); tone(v, 'square', J(2900), 300, t, 0.001, 0.09, 0.18);
      tone(v, 'sine', J(150), 58, t, 0.002, 0.22, 0.9); nz(v, t, 0.06, 0.55, 'highpass', 3000);
      nz(v, t, 0.14, 0.4, 'bandpass', 900, 3800, 3); tone(v, 'sine', J(4200), 2400, t + 0.02, 0.002, 0.12, 0.08);
      return { verb: 0.48, gain: 0.95, life: 1.6, lp: 14000 };
    },
    rocket(v, t) {        // MGL-6: the thoomp, then the grenade whooshing away
      tone(v, 'sine', J(125), 38, t, 0.002, 0.38, 1.0); nz(v, t, 0.42, 0.85, 'lowpass', 700, 90);
      nz(v, t, 0.08, 0.6, 'bandpass', 900, 500, 0.8); tone(v, 'square', 340, 200, t, 0.001, 0.025, 0.2);
      nz(v, t + 0.04, 0.55, 0.32, 'bandpass', 380, 2600, 2.5, 0.08);
      return { verb: 0.55, gain: 1.0, life: 2.0, lp: 6000 };
    },
  };
  const TIER_HZ = [0, 660, 520, 1240, 180, 2637, 1760];       // pitch of each rarity's signature layer

  function rarityLayers(v, t, tier, id) {
    if (tier >= 1) tone(v, 'sine', J(70), 30, t, 0.003, 0.18 + tier * 0.03, 0.12 + tier * 0.07);           // more sub per tier
    if (tier >= 2) nz(v, t, 0.03, 0.18 + tier * 0.03, 'highpass', 7000);                                      // bite
    if (tier >= 3) tone(v, 'sawtooth', J(TIER_HZ[3]), 260, t, 0.002, 0.11, 0.16);                            // prototype energy sweep
    if (tier >= 4) { nz(v, t, 0.5, 0.36, 'lowpass', 420, 70); tone(v, 'sine', 52, 30, t + 0.01, 0.01, 0.5, 0.3); }   // thunder
    if (tier >= 5) { tone(v, 'sine', 2637, 2637, t + 0.01, 0.002, 0.32, 0.06); tone(v, 'sine', 3520, 3520, t + 0.012, 0.002, 0.26, 0.045); }  // gold chime
    if (tier >= 6) {                                                                                          // Turing glitch
      for (let i = 0; i < 3; i++) tone(v, 'square', 400 + Math.random() * 2400, null, t + 0.03 + i * 0.022, 0.001, 0.014, 0.09);
      nz(v, t - 0.0, 0.07, 0.22, 'bandpass', 5000, 900, 4, 0.05);
    }
  }

  let at = null;                                         // previews schedule at an explicit time
  function shot(id, tier) {
    if (!ok()) return;
    const t = (at ?? ctx.currentTime) + 0.002, f = SHOTS[id] || SHOTS.ar;
    const probe = ctx.createGain();                      // build into a temp node to learn the voice options first
    const opt = f(probe, t);
    const v = voice(t, { ...opt, gain: (opt.gain || 1) * (1 + tier * 0.06), verb: (opt.verb || .3) * (1 + tier * 0.08),
      hard: opt.hard || tier >= 4, pan: (Math.random() - .5) * 0.08, life: (opt.life || 1.5) + tier * 0.1 });
    probe.connect(v);
    rarityLayers(v, t, tier | 0, id);
  }

  /* ------------------------------------------------ foley: reloads, handling, casings */
  function quick(build, verb, gain) {
    if (!ok()) return;
    const t = (at ?? ctx.currentTime) + 0.002, v = voice(t, { verb: verb || 0.12, gain: gain || 0.8, life: 1 });
    build(v, t);
  }
  const clack = (v, t, hz, pk) => { nz(v, t, 0.02, pk || 0.5, 'bandpass', hz || 2600, (hz || 2600) * .7, 2); tone(v, 'square', (hz || 2600) * .3, (hz || 2600) * .22, t, 0.001, 0.015, 0.12); };
  const FOLEY = {
    dry: () => quick((v, t) => { clack(v, t, 3800, .35); }, 0.05, .7),
    magOut: () => quick((v, t) => { clack(v, t, 2200, .45); nz(v, t + .01, .12, .25, 'bandpass', 1500, 800, 1); }),
    magDrop: () => quick((v, t) => { nz(v, t + .32, .05, .3, 'bandpass', 900, 500, 1.5); tone(v, 'triangle', 300, 180, t + .32, .001, .06, .2); }, .2, .6),
    magIn: () => quick((v, t) => { nz(v, t, .05, .3, 'lowpass', 1200, 400); clack(v, t + .04, 1800, .7); tone(v, 'sine', 160, 90, t + .04, .001, .06, .4); }),
    tap: () => quick((v, t) => { tone(v, 'sine', 140, 90, t, .001, .05, .35); clack(v, t, 1400, .3); }),
    rackBack: () => quick((v, t) => { nz(v, t, .07, .35, 'bandpass', 2400, 3600, 1.2); clack(v, t + .06, 3000, .55); }),
    rackFwd: () => quick((v, t) => { clack(v, t, 2600, .8); tone(v, 'sine', 180, 100, t, .001, .05, .35); }),
    slideRelease: () => quick((v, t) => { clack(v, t, 3200, .8); tone(v, 'triangle', 600, 300, t, .001, .03, .2); }),
    pumpBack: () => quick((v, t) => { nz(v, t, .08, .45, 'bandpass', 1500, 2600, 1.2); clack(v, t + .07, 1700, .6); }),
    pumpFwd: () => quick((v, t) => { nz(v, t, .06, .35, 'bandpass', 2600, 1500, 1.2); clack(v, t + .05, 1900, .8); tone(v, 'sine', 140, 80, t + .05, .001, .06, .35); }),
    shellIn: () => quick((v, t) => { nz(v, t, .04, .25, 'bandpass', 2000, 1200, 1.5); clack(v, t + .035, 1500, .45); }),
    boltUp: () => quick((v, t) => { clack(v, t, 2900, .5); }),
    boltBack: () => quick((v, t) => { nz(v, t, .08, .4, 'bandpass', 2600, 4200, 1.2); clack(v, t + .07, 3300, .4); }),
    boltFwd: () => quick((v, t) => { nz(v, t, .06, .35, 'bandpass', 4200, 2600, 1.2); clack(v, t + .055, 2600, .7); }),
    boltDown: () => quick((v, t) => { clack(v, t, 2300, .65); tone(v, 'sine', 170, 100, t, .001, .05, .3); }),
    coverOpen: () => quick((v, t) => { clack(v, t, 1700, .6); nz(v, t + .02, .1, .2, 'bandpass', 1200, 2200, 1); }),
    coverClose: () => quick((v, t) => { clack(v, t, 1500, .9); tone(v, 'sine', 120, 70, t, .001, .08, .45); }),
    beltIn: () => quick((v, t) => { for (let i = 0; i < 5; i++) nz(v, t + i * .025, .02, .18, 'bandpass', 3000 + i * 200, 2400, 2); }),
    cellOut: () => quick((v, t) => { clack(v, t, 2000, .4); nz(v, t + .02, .4, .35, 'highpass', 3000, 1200, .7, .05); tone(v, 'sine', 900, 160, t, .01, .35, .12); }, .25),
    cellIn: () => quick((v, t) => { clack(v, t, 1900, .6); tone(v, 'sawtooth', 200, 1600, t + .03, .02, .32, .14); tone(v, 'sine', 1600, 1600, t + .36, .005, .12, .1); }, .25),
    vent: () => quick((v, t) => { nz(v, t, .5, .38, 'highpass', 2600, 1400, .6, .04); }, .3, .7),
    drumOpen: () => quick((v, t) => { clack(v, t, 1300, .6); nz(v, t + .03, .12, .2, 'bandpass', 900, 1600, 1); }),
    drumClick: () => quick((v, t) => { clack(v, t, 2400, .45); }),
    drumSpin: () => quick((v, t) => { for (let i = 0; i < 7; i++) clack(v, t + i * .035, 2600 + i * 60, .3 - i * .03); }),
    drumClose: () => quick((v, t) => { clack(v, t, 1200, .9); tone(v, 'sine', 110, 60, t, .001, .1, .5); }),
    grenadeIn: () => quick((v, t) => { nz(v, t, .07, .25, 'lowpass', 900, 300); tone(v, 'triangle', 240, 140, t + .05, .001, .06, .35); }),
    draw: () => quick((v, t) => { nz(v, t, .12, .2, 'bandpass', 700, 1800, .8, .03); clack(v, t + .12, 2200, .35); }, .1, .7),
    holster: () => quick((v, t) => { nz(v, t, .1, .18, 'bandpass', 1600, 600, .8, .02); }, .1, .6),
    adsIn: () => quick((v, t) => { nz(v, t, .09, .14, 'bandpass', 900, 1700, .7, .03); clack(v, t + .07, 2000, .12); }, .05, .6),
    adsOut: () => quick((v, t) => { nz(v, t, .08, .1, 'bandpass', 1500, 800, .7, .02); }, .05, .5),
    tink: () => quick((v, t) => { const f = 3800 + Math.random() * 1600; tone(v, 'sine', f, f * .97, t, .001, .18, .07); tone(v, 'sine', f * 1.51, f * 1.48, t, .001, .1, .04); }, .15, .7),
    shellTink: () => quick((v, t) => { nz(v, t, .03, .15, 'bandpass', 1400, 900, 2); tone(v, 'triangle', 420, 380, t, .001, .05, .08); }, .1, .7),
    lowAmmo: () => quick((v, t) => { tone(v, 'square', 1400, 1400, t, .001, .03, .06); tone(v, 'square', 1400, 1400, t + .06, .001, .03, .05); }, 0, .6),
  };
  function foley(name, tier) { const f = FOLEY[name]; if (f) try { f(tier || 0); } catch (_) {} }

  // tests / audio previews: route everything into another context (e.g. an OfflineAudioContext)
  function _use(c, dest) { ctx = null; init(c, dest); }
  return { init, shot, foley, _use, set _at(t) { at = t; }, get ready() { return !!ctx; } };
})();

if (typeof window !== 'undefined') window.GunAudio = GunAudio;
