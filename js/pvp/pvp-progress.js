/* EARTH 2049: SAVE SEED 7 — GigaLeague progression, kept in SAVE.pvp (cloud saves sync it with the rest of the save).
 *
 *   level 1–55 (PVP.xpFor), prestige 0–10 (cosmetic), weapon levels 1–20 per gun (attachments), camos per gun (the
 *   seven rarities as challenges), custom classes (10 slots), lifetime stats, and the daily GigaTech cap.
 * Rewards arrive from the match (the server computes them): PvpProgress.apply(reward) banks them here.
 * Campaign rarity finishes unlock the same camo in PvP (looks only): PvpProgress.campaignCamo(gun, tier).
 */
(function (root) {
  'use strict';
  const PVP = root.PVP;
  const today = () => new Date().toISOString().slice(0, 10);
  // js/game.js keeps the save in a top-level `let SAVE`, which is shared between scripts but is not a window property
  const SV = () => (typeof SAVE !== 'undefined' && SAVE) || root.SAVE || null;

  function blank() {
    return { v: 1, xp: 0, prestige: 0, wxp: {}, wstats: {}, camos: {}, equip: {}, classes: [], cls: 0, stats: { matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0, best: 0, hours: 0 },
      gtDay: '', gtToday: 0, winDay: '', botSkill: 'regular', last: null, seenUnlocks: 1 };
  }
  function S() {
    const save = SV(); if (!save) return blank();
    if (!save.pvp || typeof save.pvp !== 'object') save.pvp = blank();
    const p = save.pvp, b = blank();
    for (const k of Object.keys(b)) if (p[k] === undefined || (typeof b[k] === 'object' && (typeof p[k] !== 'object' || p[k] === null))) p[k] = b[k];
    p.xp = Math.max(0, Number(p.xp) || 0);
    if (!Array.isArray(p.classes)) p.classes = [];
    return p;
  }
  const persist = () => { try { root.persist?.(); } catch (e) {} };

  const level = () => PVP.levelOf(Math.min(S().xp, PVP.totalXpTo(PVP.MAX_LEVEL))).level;
  const levelInfo = () => { const s = S(), L = PVP.levelOf(Math.min(s.xp, PVP.totalXpTo(PVP.MAX_LEVEL))); return Object.assign(L, { prestige: s.prestige, maxed: L.level >= PVP.MAX_LEVEL }); };
  const weaponLevel = id => PVP.weaponLevelOf(S().wxp[id] || 0).level;

  /** the class list a match uses: the 5 premade, then the custom ones (once custom classes are open) */
  function classes() {
    const s = S(), lv = level();
    const pre = PVP.PREMADE.map(c => Object.assign({ premade: true, streaks: s.streaks || PVP.DEFAULT_STREAKS }, c));
    if (lv < PVP.CUSTOM_AT) return pre;
    while (s.classes.length < PVP.CUSTOM_SLOTS) s.classes.push(Object.assign({}, PVP.PREMADE[s.classes.length % PVP.PREMADE.length], { name: 'CUSTOM ' + (s.classes.length + 1) }));
    return pre.concat(s.classes.slice(0, PVP.CUSTOM_SLOTS).map(c => Object.assign({ streaks: s.streaks || PVP.DEFAULT_STREAKS }, c)));
  }
  function saveClass(i, c) { const s = S(); s.classes[i] = c; persist(); }
  function setStreaks(list) { S().streaks = list.slice(0, PVP.STREAK_SLOTS); persist(); }
  const streaks = () => S().streaks || PVP.DEFAULT_STREAKS;

  /** camo tier a gun has earned (0 = Common). Campaign finds count. */
  function camoOf(id) { return S().camos[id] || 0; }
  function campaignCamo(id, tier) {
    const map = { pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', ar: 'ar', dmr: 'sniper', lmg: 'lmg', energy: 'plasma', rocket: 'mgl' };
    const g = map[id] || id; const s = S();
    if (PVP.GUNS[g] && (s.camos[g] || 0) < tier) { s.camos[g] = tier; persist(); }
  }
  function checkCamos() {
    const s = S(), guns = PVP.PRIMARY_IDS.concat(PVP.SECONDARY_IDS), got = [];
    for (let pass = 0; pass < 3; pass++) for (const id of guns) {
      const st = s.wstats[id] || {}, cur = s.camos[id] || 0;
      for (let t = cur + 1; t < PVP.CAMO.length; t++) {
        const R = PVP.CAMO_RULES[t]; let ok = false;
        if (R.stat) ok = (st[R.stat] || 0) >= R.n;
        else if (R.group === 'class') ok = guns.filter(g => PVP.GUNS[g].cls === PVP.GUNS[id].cls).every(g => (s.camos[g] || 0) >= R.need);
        else if (R.group === 'all') ok = guns.every(g => (s.camos[g] || 0) >= R.need);
        if (!ok) break;
        s.camos[id] = t; got.push({ gun: id, tier: t });
      }
    }
    return got;
  }

  /** bank a match's rewards. Returns a summary for the results screen. */
  function apply(r) {
    const s = S(), before = level(), d = today();
    let xp = r.xp || 0;
    const dailyWin = r.won && s.winDay !== d && !r.custom;
    if (dailyWin) { xp *= PVP.XP.dailyWinMul; s.winDay = d; }
    s.xp = Math.min(s.xp + xp, PVP.totalXpTo(PVP.MAX_LEVEL));
    // weapons
    const wlv = [];
    for (const [id, w] of Object.entries(r.wstats || {})) {
      if (r.custom) break;
      const b = weaponLevel(id);
      s.wxp[id] = (s.wxp[id] || 0) + (w.xp || 0);
      const st = s.wstats[id] || (s.wstats[id] = { kills: 0, heads: 0, longs: 0 });
      if (!r.solo) { st.kills += w.kills || 0; st.heads += w.heads || 0; st.longs += w.longs || 0; }      // bot kills never count toward camos
      const a = weaponLevel(id); if (a > b) wlv.push({ gun: id, level: a, unlock: PVP.ATTACH_LADDER[a - 2] });
    }
    const camos = r.custom ? [] : checkCamos();
    // GigaTech: capped per UTC day
    if (s.gtDay !== d) { s.gtDay = d; s.gtToday = 0; }
    const gt = Math.max(0, Math.min(r.gt || 0, PVP.GT.dailyCap - s.gtToday));
    s.gtToday += gt;
    if (gt && SV()) SV().gt = (SV().gt || 0) + gt;
    // DRIP (the Fitting Room's currency) and lifetime stats
    let drip = 0;
    if (r.drip && root.Wardrobe?.ready) drip = root.Wardrobe.addDrip(r.drip, 'pvp');
    if (!r.custom) {
      const st = s.stats; st.matches++; if (r.won) st.wins++; st.kills += r.kills || 0; st.deaths += r.deaths || 0; st.best = Math.max(st.best, r.bestStreak || 0);
      if (root.Wardrobe?.ready) { root.Wardrobe.bump('pvpMatches'); if (r.won) root.Wardrobe.bump('pvpWins'); if (r.kills) root.Wardrobe.bump('pvpKills', r.kills); }
    }
    const after = level();
    const unlocks = []; for (let l = before + 1; l <= after; l++) unlocks.push(...PVP.unlocksAt(l).map(u => Object.assign({ level: l }, u)));
    s.last = { at: Date.now(), xp, gt, drip, won: !!r.won };
    persist();
    return { xp, dailyWin, gt, gtCapped: (r.gt || 0) > gt, drip, before, after, unlocks, weapons: wlv, camos, revivals: r.revivals || 0 };
  }
  function prestige() {
    const s = S(); if (level() < PVP.MAX_LEVEL || s.prestige >= PVP.PRESTIGE_MAX) return false;
    s.prestige++; s.xp = 0; persist(); return true;
  }

  root.PvpProgress = { save: SV, S, level, levelInfo, weaponLevel, classes, saveClass, setStreaks, streaks, camoOf, campaignCamo, checkCamos, apply, prestige, today };
})(typeof window !== 'undefined' ? window : globalThis);
