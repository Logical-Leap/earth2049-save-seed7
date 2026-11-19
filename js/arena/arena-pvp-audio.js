/* EARTH 2049: SAVE SEED 7 — GigaLeague sound placed in the world (WebAudio, synthesized, no samples).
 *
 * In PvP the ears are a radar. Everything another player does is heard from where they are:
 *   - every round they fire, in that gun's own voice (js/gunaudio.js), so the player can tell what is shooting and from where;
 *     past 45 m the crack drops away and the boom rolls (GunAudio.distant); through a wall it is muffled;
 *   - rounds that pass close by crack and whip past the player's head (the shooter is aiming at you);
 *   - footsteps, loud and placed, enemy steps louder than a teammate's (sprinting loudest, crouching near silent, a landing
 *     thuds); the NOISE-CANCELLING perk silences them;
 *   - pain and death: a grunt when someone is hurt, a cry and a body hitting the floor when they die, so a teammate going
 *     down nearby is heard, not just read in the feed.
 * Each player has one emitter (an HRTF panner with a distance / occlusion low-pass); sounds play into it.
 * The flat (unplaced) cues for scoring, captures, medals and kill confirms live here too, so the PvP feedback is one family.
 *
 *   AR.PvpAudio.frame(camera)                       once a frame: moves the listener
 *   AR.PvpAudio.place(key, x, y, z)                 moves an emitter (one per player) and works out distance and walls
 *   AR.PvpAudio.shot(key, snd, tier, {quiet, when})
 *   AR.PvpAudio.step(key, kind, enemy)              kind: walk run crouch land
 *   AR.PvpAudio.whiz(x, y, z, heavy)
 *   AR.PvpAudio.vocal(key, 'hurt' | 'death', voice, ally)
 *   AR.PvpAudio.swing(key)
 *   AR.PvpAudio.ui(kind, n)                         tick capTick captured lost contested medal confirm head streak allyDown
 *   AR.PvpAudio.drop(key) / AR.PvpAudio.reset()
 */
'use strict';

AR.PvpAudio = (() => {
  let ctx = null, out = null, uiOut = null, noiseBuf = null, ready = false, forced = false, voices = 0;
  const em = new Map();
  const stats = { shots: 0, far: 0, dropped: 0, steps: 0, hurt: 0, death: 0, whiz: 0, ui: 0, swings: 0 };
  const L = { x: 0, y: 0, z: 0 };
  const R = (a, b) => a + Math.random() * (b - a);                         // NOSONAR

  function init(c, dest) {
    if (ready && !c) return true;
    const sys = typeof AudioSys !== 'undefined' ? AudioSys : null;
    if (!c && !sys?.ctx) return false;
    ctx = c || sys.ctx; forced = !!c;
    out = ctx.createGain(); out.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.18;
    out.connect(comp); comp.connect(dest || sys.sfxBus);
    uiOut = ctx.createGain(); uiOut.gain.value = 0.85; uiOut.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;      // NOSONAR
    if (!forced) window.GunAudio?.init?.();
    ready = true;
    return true;
  }
  const ok = () => (ready || init()) && (forced || (AudioSys.sfxOn !== false && ctx.state === 'running'));
  const now = () => ctx.currentTime;
  function later(ms, ...nodes) { if (forced) return; setTimeout(() => { for (const n of nodes) try { n.disconnect(); } catch (_) { /* gone */ } }, ms); }

  /* ------------------------------------------------------------------ building blocks */
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function tone(dest, type, f0, f1, t, a, d, peak) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + a + d);
    env(g, t, a, peak, d); o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }
  function nz(dest, t, d, peak, type, f0, f1, q, a = 0.002) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = R(0.9, 1.1);
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
    const g = ctx.createGain(); env(g, t, a, peak, d);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5, d + 0.1);      // NOSONAR
  }

  /* ------------------------------------------------------------------ listener and emitters */
  const _f = new THREE.Vector3(), _u = new THREE.Vector3();
  function frame(cam) {
    if (!ok() || !cam) return;
    const Ls = ctx.listener, p = cam.position, t = now();
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion); _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    L.x = p.x; L.y = p.y; L.z = p.z;
    if (Ls.positionX) {
      Ls.positionX.setValueAtTime(p.x, t); Ls.positionY.setValueAtTime(p.y, t); Ls.positionZ.setValueAtTime(p.z, t);
      Ls.forwardX.setValueAtTime(_f.x, t); Ls.forwardY.setValueAtTime(_f.y, t); Ls.forwardZ.setValueAtTime(_f.z, t);
      Ls.upX.setValueAtTime(_u.x, t); Ls.upY.setValueAtTime(_u.y, t); Ls.upZ.setValueAtTime(_u.z, t);
    } else { Ls.setPosition(p.x, p.y, p.z); Ls.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }
  }
  function emitter(key) {
    let e = em.get(key); if (e) return e;
    const input = ctx.createGain(), lp = ctx.createBiquadFilter(), pan = ctx.createPanner();
    lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.5;
    // direction only: each kind of sound sets its own distance curve (a gunshot carries much further than a footstep)
    pan.panningModel = 'HRTF'; pan.distanceModel = 'linear'; pan.rolloffFactor = 0; pan.refDistance = 1; pan.maxDistance = 10000;
    input.connect(lp); lp.connect(pan); pan.connect(out);
    e = { input, lp, pan, x: 0, y: 0, z: 0, d: 0, occ: 0, occAt: 0 };
    em.set(key, e);
    return e;
  }
  function place(key, x, y, z) {
    if (!ok()) return null;
    const e = emitter(key), t = now();
    e.x = x; e.y = y; e.z = z; e.d = Math.hypot(x - L.x, y - L.y, z - L.z);
    if (e.pan.positionX) { e.pan.positionX.setTargetAtTime(x, t, 0.02); e.pan.positionY.setTargetAtTime(y, t, 0.02); e.pan.positionZ.setTargetAtTime(z, t, 0.02); }
    else e.pan.setPosition(x, y, z);
    // walls muffle: check the line from the ears a few times a second
    const ms = performance.now();
    if (ms - e.occAt > 140 && AR.World?.los) { e.occAt = ms; e.occ = e.d > 1.5 && !AR.World.los(L.x, L.y, L.z, x, y, z) ? 1 : 0; }
    const air = Math.min(20000, 22000 / (1 + e.d / 45));                    // the air takes the top off at range
    e.lp.frequency.setTargetAtTime(e.occ ? Math.min(air, 1500) : air, t, 0.05);
    return e;
  }
  function drop(key) { const e = em.get(key); if (!e) return; try { e.input.disconnect(); e.lp.disconnect(); e.pan.disconnect(); } catch (_) { /* gone */ } em.delete(key); }
  function reset() { for (const k of [...em.keys()]) drop(k); voices = 0; }
  const occK = e => (e.occ ? 0.6 : 1);

  /* ------------------------------------------------------------------ gunfire */
  const shotK = d => Math.pow(Math.min(1, 7 / Math.max(7, d)), 0.8);       // -5 dB a doubling past 7 m: guns carry
  function shot(key, snd, tier, o = {}) {
    const e = em.get(key); if (!e || !ok() || !window.GunAudio) return;
    const quiet = !!o.quiet, d = e.d, maxD = quiet ? 32 : 170;
    if (d > maxD) return;
    let k = shotK(d) * occK(e) * (quiet ? 0.32 : 1);
    if (voices > 64) { stats.dropped++; return; }
    const far = d > (quiet ? 12 : 45) || voices > 36;
    const verbK = Math.min(1.6, 0.6 + d / 60);                             // more room, less gun, the further off it is
    const life = far ? GunAudio.distant(snd, { dest: e.input, gain: k * 1.1, verbK, when: o.when }) : GunAudio.shot(snd, tier || 0, { dest: e.input, gain: k, verbK, lean: d > 20, when: o.when });
    if (!life) return;
    stats.shots++; if (far) stats.far++;
    voices++; if (!forced) setTimeout(() => { voices--; }, life * 1000 + 300); else voices--;
  }
  /** a round passing close: the supersonic crack and the whip of air. heavy: a sniper or marksman round */
  function whiz(x, y, z, heavy) {
    if (!ok()) return;
    const pan = ctx.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'linear'; pan.rolloffFactor = 0;
    if (pan.positionX) { pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z; } else pan.setPosition(x, y, z);
    const g = ctx.createGain(); g.gain.value = heavy ? 6 : 4.2; g.connect(pan); pan.connect(out);
    const t = now() + 0.003;
    nz(g, t, 0.008, heavy ? 1.0 : 0.7, 'highpass', 6500, 0, 0.7, 0.0005);                 // the crack
    nz(g, t + 0.004, heavy ? 0.16 : 0.11, 0.7, 'bandpass', R(3400, 4200), R(700, 1000), 1.2, 0.01);   // the whip
    tone(g, 'sine', R(1500, 1900), 500, t + 0.002, 0.004, 0.09, 0.12);
    stats.whiz++;
    later(600, g, pan);
  }
  function swing(key) {
    const e = em.get(key); if (!e || !ok() || e.d > 18) return;
    const g = ctx.createGain(); g.gain.value = Math.pow(1 - e.d / 18, 1.2) * 0.9 * occK(e); g.connect(e.input);
    nz(g, now() + 0.003, 0.2, 0.8, 'bandpass', 600, 2400, 1.6, 0.06);
    stats.swings++;
    later(500, g);
  }

  /* ------------------------------------------------------------------ footsteps */
  const STEP = { walk: { max: 30, k: 0.85 }, run: { max: 42, k: 1.35 }, crouch: { max: 12, k: 0.3 }, land: { max: 40, k: 1.5 } };
  function step(key, kind, enemy) {
    const e = em.get(key); if (!e || !ok()) return;
    const S = STEP[kind] || STEP.walk;
    if (e.d > S.max) return;
    const k = Math.pow(1 - e.d / S.max, 1.25) * S.k * (enemy ? 1 : 0.45) * occK(e);
    if (k < 0.01) return;
    const g = ctx.createGain(); g.gain.value = k * 1.7; g.connect(e.input);
    const t = now() + 0.004, p = R(0.9, 1.12);
    if (kind === 'land') {
      tone(g, 'sine', 78 * p, 34, t, 0.002, 0.17, 1.0);
      nz(g, t, 0.13, 0.9, 'lowpass', 900, 200, 0.7);
      nz(g, t + 0.01, 0.06, 0.5, 'bandpass', 2600 * p, 1800, 2.5);           // kit rattling
      nz(g, t + 0.07, 0.04, 0.3, 'bandpass', 3400 * p, 2600, 3);
    } else {
      // heel, then toe: a boot on concrete, with the kit on the body jingling on a sprint
      tone(g, 'sine', 96 * p, 52, t, 0.002, 0.07, 0.9);
      nz(g, t, 0.06, 1.0, 'bandpass', 340 * p, 180, 1.1);
      nz(g, t + 0.055, 0.04, 0.7, 'bandpass', 1300 * p, 800, 1.3);
      nz(g, t + 0.004, 0.025, 0.35, 'highpass', 3800, 0, 0.7);                // grit under the sole
      if (kind === 'run') { nz(g, t + 0.02, 0.05, 0.28, 'bandpass', 4200 * p, 3000, 4); nz(g, t + 0.09, 0.035, 0.2, 'bandpass', 5200 * p, 4200, 4); }
    }
    stats.steps++;
    later(700, g);
  }

  /* ------------------------------------------------------------------ pain and death */
  function vocal(key, kind, voice = 'm', ally = false) {
    const e = em.get(key); if (!e || !ok()) return;
    const death = kind === 'death', max = death ? 48 : 32;
    if (e.d > max) return;
    const k = Math.pow(1 - e.d / max, 1.1) * (death ? 1.15 : 0.8) * occK(e) * (ally ? 1.1 : 1);
    const g = ctx.createGain(); g.gain.value = k; g.connect(e.input);
    const t = now() + 0.004, f0 = (voice === 'f' ? 205 : 118) * R(0.92, 1.1), len = death ? R(0.5, 0.65) : R(0.13, 0.2);
    // a voice: a buzzing source through two vowel formants ("uh" / "ahh")
    const src = ctx.createOscillator(); src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0 * (death ? 1.25 : 1.15), t); src.frequency.exponentialRampToValueAtTime(f0 * (death ? 0.55 : 0.8), t + len);
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), vg = ctx.createGain();
    f1.type = 'bandpass'; f1.frequency.value = death ? 760 : 620; f1.Q.value = 5;
    f2.type = 'bandpass'; f2.frequency.value = death ? 1180 : 1080; f2.Q.value = 6;
    src.connect(f1); src.connect(f2); f1.connect(vg); f2.connect(vg); vg.connect(g);
    vg.gain.setValueAtTime(0.0001, t); vg.gain.linearRampToValueAtTime(death ? 2.2 : 2.6, t + 0.025); vg.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.start(t); src.stop(t + len + 0.05);
    nz(g, t, len * 0.8, 0.22, 'bandpass', 1500, 900, 1.2, 0.02);                 // breath
    if (death) {
      // the body hitting the floor, and their kit
      tone(g, 'sine', 64, 30, t + 0.55, 0.003, 0.2, 1.0);
      nz(g, t + 0.55, 0.16, 0.9, 'lowpass', 700, 150, 0.7);
      nz(g, t + 0.6, 0.05, 0.35, 'bandpass', 2800, 2000, 3); nz(g, t + 0.72, 0.04, 0.25, 'bandpass', 3600, 2600, 3);
      stats.death++;
    } else stats.hurt++;
    later((len + 1.2) * 1000, g, f1, f2, vg);
  }

  /* ------------------------------------------------------------------ flat cues: scoring, captures, medals, kill confirms */
  function ui(kind, n = 0) {
    if (!ok()) return;
    const g = ctx.createGain(); g.gain.value = 1; g.connect(uiOut);
    const t = now() + 0.004;
    switch (kind) {
      case 'tick':        // a point on the hill / holding the ball: a bright, short, satisfying blip
        tone(g, 'square', 1318, 1318, t, 0.001, 0.06, 0.5); tone(g, 'sine', 2637, 2637, t, 0.001, 0.08, 0.32); tone(g, 'sine', 659, 659, t, 0.001, 0.05, 0.25); break;
      case 'capTick': {   // capturing: rising with progress (n 0..1)
        const f = 660 * Math.pow(2, n * 1.2); tone(g, 'triangle', f, f, t, 0.001, 0.08, 0.9); tone(g, 'square', f * 2, f * 2, t, 0.001, 0.05, 0.25); break;
      }
      case 'captured':    // ours: an up chord
        [784, 988, 1175, 1568].forEach((f, i) => tone(g, 'square', f, f, t + i * 0.06, 0.003, 0.2, 0.22)); tone(g, 'sine', 110, 55, t, 0.002, 0.3, 0.5); break;
      case 'lost':        // theirs: down and dark
        [659, 523, 392].forEach((f, i) => tone(g, 'sawtooth', f, f * 0.98, t + i * 0.08, 0.004, 0.22, 0.22)); break;
      case 'contested':   // two low buzzes
        tone(g, 'sawtooth', 220, 210, t, 0.003, 0.09, 0.36); tone(g, 'sawtooth', 220, 210, t + 0.13, 0.003, 0.09, 0.36); break;
      case 'confirm':     // a kill: a heavy thunk with a clean ding on top
        tone(g, 'sine', 160, 50, t, 0.002, 0.14, 0.7); nz(g, t, 0.06, 0.5, 'bandpass', 1100, 500, 1.2);
        tone(g, 'sine', 1760, 1760, t + 0.03, 0.002, 0.22, 0.2); tone(g, 'sine', 2637, 2637, t + 0.03, 0.002, 0.16, 0.1); break;
      case 'head':        // headshot: glass
        tone(g, 'sine', 3520, 3480, t, 0.001, 0.3, 0.2); tone(g, 'triangle', 5274, 5200, t, 0.001, 0.12, 0.1); break;
      case 'medal': {     // a medal: a rising run, longer and higher the bigger it is (n 1..6)
        const steps = Math.min(6, 2 + n), base = 523 * Math.pow(2, Math.min(n, 6) / 12);
        for (let i = 0; i < steps; i++) { const f = base * Math.pow(2, [0, 4, 7, 12, 16, 19][i] / 12); tone(g, 'square', f, f, t + i * 0.055, 0.002, 0.16, 0.09); }
        if (n >= 3) { nz(g, t, 0.5, 0.25, 'highpass', 6000, 9000, 0.7, 0.02); tone(g, 'sine', 65, 40, t, 0.004, 0.5, 0.5); }
        break;
      }
      case 'streak':      // a scorestreak is ready
        [880, 1318, 1760].forEach((f, i) => tone(g, 'triangle', f, f, t + i * 0.09, 0.003, 0.3, 0.4)); break;
      case 'dead':        // you died: the world drops out from under you
        tone(g, 'sine', 90, 28, t, 0.004, 0.9, 0.9); nz(g, t, 0.7, 0.5, 'lowpass', 1200, 60, 0.7, 0.01); tone(g, 'sawtooth', 220, 55, t, 0.01, 0.6, 0.08); break;
      case 'allyDown':    // a teammate died near you: a short low radio chirp (the feed and the minimap say who and where)
        tone(g, 'square', 392, 294, t, 0.003, 0.12, 0.2); nz(g, t, 0.12, 0.25, 'bandpass', 2000, 1500, 3); break;
    }
    stats.ui++;
    later(1500, g);
  }

  return { init, frame, place, drop, reset, shot, whiz, swing, step, vocal, ui, stats, _use(c, dest) { ready = false; em.clear(); init(c, dest); }, get voices() { return voices; }, get ctx() { return ctx; } };
})();
