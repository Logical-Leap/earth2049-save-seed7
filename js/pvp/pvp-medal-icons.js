/* EARTH 2049: SAVE SEED 7 — GigaLeague medal emblems. Every medal has its own: a badge whose shape says what kind
 * of medal it is and whose colour says how big it is, with a symbol for what you did.
 *   hexagon  multikills and the kill feed      shield  kill streaks
 *   circle   skill (headshot, longshot, revenge, melee…)   diamond  objective plays
 *   tier 1 cyan · 2 green · 3 gold · 4 magenta-gold · 5 and 6 holographic
 * PvpMedalIcons.svg(id, size) returns an <svg> string. Symbols are white with a dark outline so they read on any badge.
 */
(function (root) {
  'use strict';
  const INK = '#0b0918';
  const F = d => `<path d="${d}" fill="#fff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
  const L = (d, w = 3.2) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 2.6}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const C = (x, y, r, col = '#fff') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" stroke="${INK}" stroke-width="1.8"/>`;
  const RING = (x, y, r, w = 3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${INK}" stroke-width="${w + 2.6}"/><circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#fff" stroke-width="${w}"/>`;
  const T = (x, y, s, txt) => `<text x="${x}" y="${y}" font-family="Consolas,'Lucida Console',monospace" font-weight="bold" font-size="${s}" text-anchor="middle" fill="#fff" stroke="${INK}" stroke-width="1.6" paint-order="stroke">${txt}</text>`;
  // a round: casing and bullet
  const bullet = (x, y, s = 1) => F(`M${x - 3.6 * s} ${y + 11 * s}V${y - 2 * s}Q${x - 3.6 * s} ${y - 9 * s} ${x} ${y - 12 * s}Q${x + 3.6 * s} ${y - 9 * s} ${x + 3.6 * s} ${y - 2 * s}V${y + 11 * s}Z`) +
    `<path d="M${x - 3.6 * s} ${y - 1 * s}H${x + 3.6 * s}" stroke="${INK}" stroke-width="1.4"/>`;
  const flag = (x, y, s = 1) => L(`M${x} ${y - 16 * s}V${y + 16 * s}`, 2.6) + F(`M${x} ${y - 15 * s}H${x + 20 * s}L${x + 15 * s} ${y - 8 * s}L${x + 20 * s} ${y - 1 * s}H${x}Z`);
  const bars = (n, y0, gap, h) => Array.from({ length: n }, (_, i) => `<rect x="16" y="${y0 + i * gap}" width="32" height="${h}" rx="1.5" fill="#fff" stroke="${INK}" stroke-width="1.6"/>` +
    `<rect x="18.5" y="${y0 + i * gap + h / 2 - 1.3}" width="5" height="2.6" fill="${INK}"/>`).join('');

  const G = {
    multi2: bullet(26, 33) + bullet(38, 33),
    multi3: bullet(21, 34, .9) + bullet(32, 31, .95) + bullet(43, 34, .9),
    multi4: bullet(19, 35, .78) + bullet(28, 31, .8) + bullet(37, 31, .8) + bullet(46, 35, .78),
    multi5: F('M16 30L30 16H47V33L33 47Z') + C(41, 22, 2.6, '#0b0918') + T(32, 40, 15, '5'),
    multi6: L('M15 46L25 36L31 40L46 18', 3.4) + F('M41 16L50 14L48 23Z') + L('M47 32l4 4M44 37l2 6M51 26l6 1', 2),
    quadFeed: bars(4, 17, 8, 6) + T(48, 51, 12, '4'),
    fullFeed: F('M20 22L24 12L32 18L40 12L44 22Z') + bars(5, 25, 5.6, 4),
    streak5: L('M15 44L25 33L31 38L45 22', 3.6) + F('M39 19L50 17L48 28Z'),
    streak10: Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4, x = 32 + Math.cos(a) * 15, y = 32 + Math.sin(a) * 15; return L(`M${32 + Math.cos(a) * 9} ${32 + Math.sin(a) * 9}L${x} ${y}`, 2.4) + C(x, y, 2.6); }).join('') + C(32, 32, 9) + C(29, 30, 1.8, INK) + C(35, 35, 1.4, INK),
    streak15: F('M26 10H38L44 26H20Z').replace('fill="#fff"', 'fill="rgba(255,255,255,.35)"') + F('M32 20l4.2 8.6 9.4 1.2-6.9 6.5 1.8 9.4L32 41.1l-8.5 4.6 1.8-9.4-6.9-6.5 9.4-1.2z'),
    streak20: F('M20 20l8-8 12 12-8 8z') + L('M31 31L45 45', 3.6) + F('M14 46H34V51H14Z'),
    firstBlood: F('M32 13C32 13 19 29 19 37A13 13 0 0 0 45 37C45 29 32 13 32 13Z').replace('fill="#fff"', 'fill="#ff3b5c"') + F('M27 34a5 6 0 0 1 4-6').replace('fill="#fff"', 'fill="none" stroke="#fff"'),
    head: C(32, 28, 7) + F('M20 46C20 38 26 35 32 35S44 38 44 46Z') + RING(32, 32, 16, 2) + L('M32 10V17M32 47V54M10 32H17M47 32H54', 2.2),
    longshot: RING(32, 32, 14, 2.6) + L('M32 14V24M32 40V50M14 32H24M40 32H50', 2.2) + C(32, 32, 2.4, '#ff3b5c') + L('M10 54l4-4M17 47l3-3', 2),
    revenge: L('M44 24A14 14 0 1 0 46 36', 3.4) + F('M39 17L49 19L45 28Z') + T(32, 38, 15, '¤'),
    endStreak: F('M32 12C36 20 44 24 44 35A12 12 0 0 1 20 35C20 28 25 25 27 19C29 25 31 26 32 27C34 22 34 17 32 12Z').replace('fill="#fff"', 'fill="#ff9a1a"') + L('M17 17L47 47M47 17L17 47', 3.6),
    melee: F('M19 30Q19 24 24 24H40Q46 24 46 31V38Q46 46 38 46H27Q19 46 19 38Z') + L('M24 24V32M30 24V32M36 24V32M41 25V32', 1.6) + F('M17 36Q15 30 21 30H28V36Z'),
    capture: flag(23, 32),
    defend: F('M32 12L48 18V31C48 41 41 48 32 52C23 48 16 41 16 31V18Z') + flag(28, 32, .55),
    plant: F('M16 24H48V44H16Z') + `<rect x="21" y="29" width="22" height="9" fill="${INK}"/>` + T(32, 36.5, 9, '0:45').replace('font-size="9"', 'font-size="8" fill="#ff3b5c" stroke="none"') + L('M24 24C24 16 40 16 40 24', 2.2),
    defuse: F('M22 40V30A10 10 0 0 1 42 30V40L45 44H19Z') + C(32, 47, 3) + L('M15 15L49 49', 3.4),
    flagCap: flag(20, 34, .9) + L('M44 46V22M37 29L44 21L51 29', 3),
    flagReturn: flag(20, 34, .9) + L('M44 22V36A6 6 0 0 1 32 36', 3) + F('M27 33L32 42L37 33Z'),
    harvest: F('M18 20H46V44H18Z') + `<rect x="23" y="25" width="18" height="5" fill="${INK}"/>` + C(41, 38, 2.4, '#39ff8a') + L('M23 38H33', 2),
    shootDown: F('M24 28H40V36H24Z') + L('M18 26H28M36 26H46M23 26V30M41 26V30', 2.2) + RING(32, 32, 17, 2.6) + L('M20 20L44 44', 3),
    influencerKill: `<g transform="rotate(-24 32 32)">${F('M18 36L20 20L27 27L32 16L37 27L44 20L46 36Z')}${F('M18 38H46V43H18Z')}</g>` + L('M46 46l5 5M40 49l2 6M50 41l6 2', 2),
  };
  const KIND = {
    multi2: 'hex', multi3: 'hex', multi4: 'hex', multi5: 'hex', multi6: 'hex', quadFeed: 'hex', fullFeed: 'hex',
    streak5: 'shield', streak10: 'shield', streak15: 'shield', streak20: 'shield',
    firstBlood: 'circle', head: 'circle', longshot: 'circle', revenge: 'circle', endStreak: 'circle', melee: 'circle', shootDown: 'circle', influencerKill: 'circle',
    capture: 'diamond', defend: 'diamond', plant: 'diamond', defuse: 'diamond', flagCap: 'diamond', flagReturn: 'diamond', harvest: 'diamond',
  };
  const SHAPE = {
    hex: 'M32 3L57 17.5V46.5L32 61L7 46.5V17.5Z',
    shield: 'M32 3L57 11V30C57 46 46 56 32 61C18 56 7 46 7 30V11Z',
    circle: 'M32 4A28 28 0 1 1 31.99 4Z',
    diamond: 'M32 2L62 32L32 62L2 32Z',
  };
  const TIER = { 1: ['#00e5ff', '#3b5bff'], 2: ['#39ff8a', '#00a5c8'], 3: ['#ffd400', '#ff6a1a'], 4: ['#ff2bd6', '#ffb000'], 5: ['#ffffff', '#ff2bd6', '#00e5ff'], 6: ['#fff6a8', '#ff2bd6', '#7a5bff'] };
  let n = 0;
  function svg(id, size = 56, tier) {
    const M = root.PVP?.MEDALS?.[id], t = Math.max(1, Math.min(6, tier || M?.tier || 1)), cols = TIER[t], shape = SHAPE[KIND[id] || 'circle'];
    const gid = 'pmg' + (++n);
    const stops = cols.map((c, i) => `<stop offset="${i / (cols.length - 1)}" stop-color="${c}"/>`).join('');
    return `<svg class="pmedal" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>
      <path d="${shape}" fill="url(#${gid})" stroke="${INK}" stroke-width="3"/>
      <path d="${shape}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.4" transform="translate(32 32) scale(.84) translate(-32 -32)"/>
      <path d="${shape}" fill="rgba(11,9,24,.28)" stroke="none" transform="translate(32 32) scale(.84) translate(-32 -32)"/>
      ${G[id] || C(32, 32, 9)}</svg>`;
  }
  root.PvpMedalIcons = { svg, ids: Object.keys(G) };
})(typeof globalThis !== 'undefined' ? globalThis : this);
