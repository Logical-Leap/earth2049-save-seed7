/* EARTH 2049: SAVE SEED 7 — PS1 render mode
 *
 * Loaded right after three.min.js, before any texture or material exists.
 *
 *   OFF  — the original renderer (full resolution, smooth textures, gamma pass).
 *   360  — default. Scene renders at 360 lines, PS1 tricks on.
 *   240  — authentic. Scene renders at 240 lines like the original hardware.
 *
 * What the PS1 mode does:
 *   1. Low internal resolution, upscaled with hard (nearest) pixels.
 *   2. Every texture samples with nearest filtering (crunchy texels).
 *   3. Vertices snap to the low-res pixel grid (the PS1 "wobble").
 *   4. Final image is cut to 15-bit colour (32 levels per channel) with the
 *      PS1 GPU's 4x4 ordered-dither matrix.
 * Affine texture warping is intentionally left out: it swims badly on big
 * FPS floors and the art direction is "PS1 spirit", not strict mimicry.
 *
 * The mode is chosen once per page load (shader chunks are compiled once),
 * so changing it reloads the page. A fresh browser can be tested with ?retro=off|240|360.
 */
'use strict';

const PS1Mode = (() => {
  const KEY = 'e2049.retroLook';
  const MODES = ['360', '240', 'off'];
  const LABEL = { '360': 'PS1 (360p)', '240': 'PS1 Authentic (240p)', off: 'Modern' };

  function stored() {
    try { return localStorage.getItem(KEY); } catch (err) { return null; }   // storage blocked: use default
  }
  function fromUrl() {
    const m = /[?&]retro=(off|240|360)\b/.exec(location.search);
    return m ? m[1] : null;
  }
  // A choice made with the title-screen button wins; ?retro= is for testing a fresh browser.
  function readMode() {
    const m = stored() || fromUrl();
    return MODES.includes(m) ? m : '360';
  }

  const mode = readMode();
  const enabled = mode !== 'off';
  const lines = enabled ? Number(mode) : 0;

  /* ---- 2. nearest filtering on every texture -------------------------- */
  // r147 assigns this.magFilter / this.minFilter in the Texture constructor.
  // An accessor on the prototype intercepts those writes for every texture,
  // including render targets, GLB images and canvas textures.
  if (enabled && typeof THREE !== 'undefined' && THREE.Texture) {
    const T = THREE;
    const MIP = new Set([T.LinearMipmapLinearFilter, T.LinearMipmapNearestFilter, T.NearestMipmapLinearFilter, T.NearestMipmapNearestFilter]);
    Object.defineProperty(T.Texture.prototype, 'magFilter', {
      configurable: true,
      get() { return T.NearestFilter; },
      set(v) { this._psxMag = v; },
    });
    Object.defineProperty(T.Texture.prototype, 'minFilter', {
      configurable: true,
      get() { return MIP.has(this._psxMin) ? T.NearestMipmapLinearFilter : T.NearestFilter; },
      set(v) { this._psxMin = v; },
    });

    /* ---- 3. vertex snapping ------------------------------------------- */
    // Snap clip-space xy to the internal pixel grid. Grid is computed in the
    // shader from the aspect-independent line count; x uses the same pitch.
    const g = (lines * 0.5).toFixed(1);
    T.ShaderChunk.project_vertex += `
if ( gl_Position.w > 0.0 ) {
  vec2 psxGrid = vec2( ${g} * psxAspect, ${g} );
  gl_Position.xy = floor( gl_Position.xy / gl_Position.w * psxGrid + 0.5 ) / psxGrid * gl_Position.w;
}`;
    // projectionMatrix[1][1] / [0][0] == aspect for a perspective camera.
    T.ShaderChunk.common += `
#ifndef PSX_ASPECT
#define PSX_ASPECT
#define psxAspect ( projectionMatrix[1][1] / max( projectionMatrix[0][0], 1e-4 ) )
#endif`;
  }

  /* ---- 4. 15-bit colour + 4x4 dither, replaces the gamma pass --------- */
  const Shader = {
    uniforms: {
      tDiffuse: { value: null },
      uRes: { value: new THREE.Vector2(480, 360) },
      uLevels: { value: 31.0 },
    },
    vertexShader: `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: `
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uLevels;
varying vec2 vUv;
float bayer4( vec2 p ) {
  // PS1 GPU dither matrix (values -4..+3), normalised to -0.5..0.5 of one step
  int x = int( mod( p.x, 4.0 ) ), y = int( mod( p.y, 4.0 ) );
  int i = x + y * 4;
  float m = 0.0;
  if (i==0) m=-4.; else if (i==1) m=0.; else if (i==2) m=-3.; else if (i==3) m=1.;
  else if (i==4) m=2.; else if (i==5) m=-2.; else if (i==6) m=3.; else if (i==7) m=-1.;
  else if (i==8) m=-3.; else if (i==9) m=1.; else if (i==10) m=-4.; else if (i==11) m=0.;
  else if (i==12) m=3.; else if (i==13) m=-1.; else if (i==14) m=2.; else m=-2.;
  return m / 8.0;
}
void main() {
  vec2 px = floor( vUv * uRes );
  vec4 c = LinearTosRGB( texture2D( tDiffuse, ( px + 0.5 ) / uRes ) );
  float d = bayer4( px ) / uLevels;
  c.rgb = floor( clamp( c.rgb + d, 0.0, 1.0 ) * uLevels + 0.5 ) / uLevels;
  gl_FragColor = vec4( c.rgb, 1.0 );
}`,
  };

  let psxPass = null;

  function lowSize(w, h) {
    const lh = Math.min(lines, h);
    return { w: Math.max(2, Math.round(lh * (w / Math.max(1, h)))), h: lh };
  }

  /** Swap the composer to low-res + dither. Safe to call when disabled. */
  function install({ renderer, composer, gammaPass, bloomPass }) {
    if (!enabled) return;
    psxPass = new THREE.ShaderPass(Shader);
    const i = composer.passes.indexOf(gammaPass);
    if (i >= 0) composer.passes[i] = psxPass; else composer.addPass(psxPass);
    if (bloomPass) {
      bloomPass.strength *= 0.8;
      bloomPass.radius = 0.35;
    }
    composer.setPixelRatio(1);
    const setSize = composer.setSize.bind(composer);
    composer.setSize = (w, h) => {
      const s = lowSize(w, h);
      psxPass.uniforms.uRes.value.set(s.w, s.h);
      setSize(s.w, s.h);
    };
    // Low internal res makes the old pixel-ratio scaler pointless for the scene;
    // keep the canvas sharp at device resolution so the upscale stays crisp.
    renderer.domElement.style.imageRendering = 'pixelated';
    composer.setSize(innerWidth, innerHeight);
  }

  function cycle() {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    try { localStorage.setItem(KEY, next); } catch (err) { console.warn('[E2049] cannot save look setting', err); }
    location.reload();
  }

  return Object.freeze({ mode, enabled, lines, label: LABEL[mode], install, cycle, lowSize });
})();

if (typeof window !== 'undefined') window.PS1Mode = PS1Mode;
