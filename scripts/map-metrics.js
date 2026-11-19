// node scripts/map-metrics.js [map ...]   (DIR=<folder of layouts> to measure a fresh pipeline build)
// How a map plays, from its layout: how much of the map one spot sees (see), how many sightlines run past 35 / 50 m,
// cover within 2.5 m, how much the best 10% of spots see (topSee) and how high they are (topH), whether height buys
// sight (hCorr) and whether the map is a bowl or a cone round one point (radial). The gold standard (the Yield Works,
// the Ministry of Forms, the Upgrade Basilica) sits at see < 25%, topSee < 45%, long50 < 25%, cover > 25%.
const path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '..');
global.window = global;
const PVP = require(root + '/js/pvp/pvp-data.js');
const Sim = require(root + '/js/pvp/pvp-sim.js');
const ids = process.argv.slice(2).length ? process.argv.slice(2) : PVP.MAP_ORDER;
const rows = [];
for (const id of ids) {
  const file = process.env.DIR ? path.join(process.env.DIR, id + '.layout.json') : path.join(root, `assets/maps/${id}/${id}.layout.json`);
  const L = JSON.parse(fs.readFileSync(file, 'utf8'));
  const src = Sim.mapFromLayout(L, id);
  const W = new Sim.World(src);
  const N = src.nav.nodes;
  // sample nodes (deterministic stride)
  const S = []; const step = Math.max(1, Math.floor(N.length / 260)); for (let i = 0; i < N.length; i += step) S.push(N[i]);
  const eye = 1.55;
  let pairs = 0, vis = 0, long = 0, vlong = 0;
  const visFrac = new Array(S.length).fill(0);
  for (let i = 0; i < S.length; i++) {
    let v = 0;
    for (let j = 0; j < S.length; j++) {
      if (i === j) continue;
      const a = S[i], b = S[j], d = Math.hypot(a[0] - b[0], a[2] - b[2]);
      if (d > 90) continue;
      pairs++;
      if (W.los(a[0], a[1] + eye, a[2], b[0], b[1] + 1.2, b[2])) { vis++; v++; if (d > 35) long++; if (d > 50) vlong++; }
    }
    visFrac[i] = v / (S.length - 1);
  }
  // cover: a waist-to-chest blocker within 2.5 m in at least 2 of 8 directions
  let cover = 0;
  for (const a of S) {
    let dirs = 0;
    for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4, dx = Math.cos(ang), dz = Math.sin(ang); if (W.raycast(a[0], a[1] + 1.0, a[2], dx, 0, dz, 2.5)) dirs++; }
    if (dirs >= 2) cover++;
  }
  // dominance: how much the top 10% best-seeing spots see, and how high they are vs the map median
  const order = visFrac.map((v, i) => i).sort((p, q) => visFrac[q] - visFrac[p]);
  const top = order.slice(0, Math.max(1, Math.floor(S.length * 0.1)));
  const ys = S.map(n => n[1]).sort((a, b) => a - b), medY = ys[Math.floor(ys.length / 2)];
  const topVis = top.reduce((s, i) => s + visFrac[i], 0) / top.length;
  const topH = top.reduce((s, i) => s + S[i][1], 0) / top.length - medY;
  // height-visibility correlation
  const mv = visFrac.reduce((a, b) => a + b, 0) / S.length, my = S.reduce((a, n) => a + n[1], 0) / S.length;
  let cxy = 0, cxx = 0, cyy = 0; for (let i = 0; i < S.length; i++) { const dv = visFrac[i] - mv, dy = S[i][1] - my; cxy += dv * dy; cxx += dv * dv; cyy += dy * dy; }
  const corr = cxy / Math.sqrt(cxx * cyy || 1);
  // radial-ness: share of nodes whose distance to the map centroid explains height (|corr(dist, y)|)
  const cx = S.reduce((a, n) => a + n[0], 0) / S.length, cz = S.reduce((a, n) => a + n[2], 0) / S.length;
  const ds = S.map(n => Math.hypot(n[0] - cx, n[2] - cz)), md = ds.reduce((a, b) => a + b, 0) / S.length;
  let r1 = 0, r2 = 0; for (let i = 0; i < S.length; i++) { r1 += (ds[i] - md) * (S[i][1] - my); r2 += (ds[i] - md) ** 2; }
  const radial = r1 / Math.sqrt(r2 * cyy || 1);
  const levels = new Set(N.map(n => Math.round(n[1]))).size;
  const bx = W.bounds;
  rows.push({ id, nodes: N.length, size: `${Math.round(bx.max[0] - bx.min[0])}x${Math.round(bx.max[2] - bx.min[2])}`, levels,
    see: +(vis / pairs * 100).toFixed(1), long35: +(long / Math.max(1, vis) * 100).toFixed(1), long50: +(vlong / Math.max(1, vis) * 100).toFixed(1),
    cover: +(cover / S.length * 100).toFixed(0), topSee: +(topVis * 100).toFixed(1), topH: +topH.toFixed(1), hCorr: +corr.toFixed(2), radial: +radial.toFixed(2),
    pads: src.pads.length, teles: (L.markers || []).filter(m => m.kind === 'tele').length });
}
console.table(rows);
