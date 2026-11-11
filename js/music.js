/* EARTH 2049: SAVE SEED 7 — music director
 *
 * Plays the cues cut from the main theme (assets/audio/music, built by game-art-pipeline's
 * projects/earth2049/audio/cut_theme.py). The theme is exactly 120 BPM, so the director
 * knows where every beat and bar is and exposes that clock to the rest of the game
 * (neon pulses, dancers, the speaker tower) — everything in the Haven moves to the song.
 *
 *  - Cues load lazily and are cached as decoded AudioBuffers.
 *  - Loops use the sample-accurate loopStart / loopEnd from cues.json (seams are baked
 *    crossfades, so the native loop is click-free).
 *  - Cue changes crossfade and land on the next bar line.
 *  - "Diegetic" mode: in the Haven the song plays from the speaker tower. A lowpass and
 *    gain follow the listener's distance, so it sounds like it is coming from the room.
 *  - An AnalyserNode feeds the jumbotron's equaliser.
 */
'use strict';

const Music = (() => {
  const BASE = 'assets/audio/music/';
  let meta = null, metaPromise = null, enabled = true;
  const buffers = {}, loading = {};
  let cur = null;            // { name, src, gain, startedAt, loopStart, loopEnd, startsAt }
  let bus = null, filter = null, analyser = null, eqData = null;
  let diegetic = null;       // { x, y, z, radius }

  const ctx = () => AudioSys?.ctx || null;

  function ensureGraph() {
    const c = ctx();
    if (!c || bus) return !!bus;
    bus = c.createGain(); bus.gain.value = 0.55;
    filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 22000; filter.Q.value = 0.4;
    analyser = c.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.72;
    eqData = new Uint8Array(analyser.frequencyBinCount);
    bus.connect(filter); filter.connect(analyser); analyser.connect(AudioSys.master || c.destination);
    return true;
  }

  async function loadMeta() {
    if (meta) return meta;
    if (!metaPromise) metaPromise = fetch(BASE + 'cues.json').then(r => r.ok ? r.json() : null).catch(() => null);
    meta = await metaPromise;
    return meta;
  }

  async function load(name) {
    if (buffers[name]) return buffers[name];
    if (loading[name]) return loading[name];
    const c = ctx();
    const m = await loadMeta();
    if (!c || !m?.cues?.[name]) return null;
    loading[name] = fetch(BASE + m.cues[name].file)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(ab => new Promise((res, rej) => c.decodeAudioData(ab, res, rej)))
      .then(buf => (buffers[name] = buf))
      .catch(err => { console.warn('[E2049] music cue failed', name, err); return null; });
    return loading[name];
  }

  /** Seconds into the song grid (0 = a downbeat) for the playing cue, or null. */
  function songTime() {
    const c = ctx();
    if (!c || !cur) return null;
    const t = c.currentTime - cur.startedAt;              // seconds since the file started
    let pos = cur.offset + t;                              // position in the file
    if (cur.loop && pos >= cur.loopEnd) pos = cur.loopStart + ((pos - cur.loopStart) % (cur.loopEnd - cur.loopStart));
    return pos - cur.startsAt;                             // startsAt sits on a downbeat
  }
  function beat() {                                        // { beat, phase, bar, barPhase, energy }
    const st = songTime();
    const spb = 60 / (meta?.bpm || 120);
    if (st === null) {
      const t = performance.now() / 1000;
      return { beat: Math.floor(t / spb), phase: (t / spb) % 1, bar: Math.floor(t / spb / 4), barPhase: (t / spb / 4) % 1, energy: 0, live: false };
    }
    const b = Math.max(0, st) / spb;
    return { beat: Math.floor(b), phase: b % 1, bar: Math.floor(b / 4), barPhase: (b / 4) % 1, energy: level(), live: true };
  }
  function level() {
    if (!analyser) return 0;
    analyser.getByteFrequencyData(eqData);
    let s = 0;
    for (let i = 1; i < 12; i++) s += eqData[i];
    return s / (11 * 255);
  }
  function spectrum() {
    if (!analyser) return null;
    analyser.getByteFrequencyData(eqData);
    return eqData;
  }

  /** Time (AudioContext) of the next bar line of the playing cue, or now. */
  function nextBarTime(minAhead = 0.05) {
    const c = ctx();
    const st = songTime();
    if (st === null) return c.currentTime + minAhead;
    const bar = 240 / (meta?.bpm || 120);
    const toNext = bar - (((st % bar) + bar) % bar);
    return c.currentTime + (toNext < minAhead ? toNext + bar : toNext);
  }

  async function play(name, opts = {}) {
    if (!enabled) return false;
    AudioSys?.init?.();
    if (!ensureGraph()) return false;
    if (cur?.name === name && !opts.restart) return true;
    const buf = await load(name);
    const m = meta?.cues?.[name];
    if (!buf || !m) return false;
    if (cur?.name === name && !opts.restart) return true;
    const c = ctx();
    AudioSys.musicStop?.();
    const fade = opts.fade ?? 1.2;
    const at = opts.onBar && cur ? nextBarTime() : c.currentTime + 0.02;
    const src = c.createBufferSource();
    src.buffer = buf;
    if (m.loop) { src.loop = true; src.loopStart = m.loopStart; src.loopEnd = m.loopEnd; }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(opts.volume ?? 1, at + Math.max(0.05, fade));
    src.connect(g); g.connect(bus);
    const offset = opts.offset ?? m.startsAt ?? 0;
    src.start(at, offset);
    stopCurrent(fade, at);
    cur = { name, src, gain: g, startedAt: at, offset, loop: !!m.loop, loopStart: m.loopStart, loopEnd: m.loopEnd, startsAt: m.startsAt || 0 };
    if (!m.loop) src.onended = () => { if (cur?.src === src) cur = null; opts.onEnd?.(); };
    return true;
  }
  function stopCurrent(fade = 0.8, at) {
    if (!cur) return;
    const c = ctx();
    const t = at ?? c.currentTime;
    const { src, gain } = cur;
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, fade));
      src.stop(t + Math.max(0.05, fade) + 0.05);
    } catch (_) { /* already stopped */ }
    cur = null;
  }
  /** One-shot stinger over the current cue (deploy). */
  async function stinger(name, volume = 0.9) {
    if (!enabled) return;
    AudioSys?.init?.();
    if (!ensureGraph()) return;
    const buf = await load(name);
    const m = meta?.cues?.[name];
    if (!buf || !m) return;
    const c = ctx();
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = volume;
    src.connect(g); g.connect(bus);
    src.start(c.currentTime + 0.01, m.startsAt || 0);
    if (cur) {                                             // duck the bed under the stinger
      const t = c.currentTime;
      cur.gain.gain.setTargetAtTime(0.25, t, 0.05);
      cur.gain.gain.setTargetAtTime(1, t + buf.duration - 0.8, 0.4);
    }
  }

  /** Make the music come from a point in the world (null = plain stereo bed). */
  function setDiegetic(src) { diegetic = src; if (!src && filter) { filter.frequency.setTargetAtTime(22000, ctx().currentTime, 0.2); bus.gain.setTargetAtTime(0.55, ctx().currentTime, 0.3); } }
  function listen(x, y, z, occluded = 0) {
    if (!diegetic || !filter) return;
    const d = Math.hypot(x - diegetic.x, (y - diegetic.y) * 0.6, z - diegetic.z);
    const k = Math.max(0, 1 - d / diegetic.radius);                // 1 at the tower, 0 at the edge
    const cutoff = 650 + Math.pow(k, 1.6) * 16000 - occluded * 400;
    const vol = 0.16 + k * 0.5;
    const t = ctx().currentTime;
    filter.frequency.setTargetAtTime(Math.max(380, cutoff), t, 0.25);
    bus.gain.setTargetAtTime(vol, t, 0.3);
  }

  function owns() { return !!cur; }
  function setEnabled(v) { enabled = v; if (!v) stopCurrent(0.3); }
  function preload(...names) { return Promise.all(names.map(load)); }

  return { play, stop: stopCurrent, stinger, preload, beat, spectrum, level, setDiegetic, listen, owns, setEnabled,
    get current() { return cur?.name || null; } };
})();

if (typeof window !== 'undefined') window.Music = Music;
