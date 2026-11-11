/* EARTH 2049: SAVE SEED 7 — the Wardrobe: unlocks, DRIP economy and feats for the player avatar kit.
 *
 * Every non-default avatar item unlocks one of three ways:
 *   SHOP     buy it at the Fitting Room for DRIP
 *   LICENSE  a feat opens it for sale (it shows the price, but BUY stays locked until the feat is done)
 *   FEAT     earned only, never sold: completing the feat gives the item for free plus a DRIP bounty
 *
 * DRIP is the cosmetic currency. It never buys power (GigaTech still buys guns and upgrades at Box's Arms).
 * It comes from: every arena run (result, grade, peak style, relays, heat), DRIP tags dropped by elites,
 * the merch crate hidden somewhere high in each run, the first win of each day (x2), feat bounties and
 * collection milestones. Prices are fixed; the Daily Drop discounts three items each day. No loot boxes.
 *
 * Feats track lifetime stats in SAVE.wardrobe.stats. Stats are bumped live, so unlocks pop mid-run.
 * Save shape (kept by SaveSystem's normalize, which preserves unknown keys):
 *   SAVE.wardrobe = { v, drip, earned, spent, owned:[ids], seen:[ids], look:'<loadout code>', stats:{}, milestones:n,
 *                     firstWinDay:'YYYY-MM-DD', days:['YYYY-MM-DD'...], talked:[npc ids], cone:false }
 *
 * Works in the browser (window.Wardrobe) and under node (module.exports) for tests: pass the save object
 * and the catalog in with Wardrobe.attach(save, catalog).
 */
'use strict';

(function (root) {
  const RARITY_PRICE = [75, 150, 350, 700, 1400, 2600, 0];
  const DAILY_OFF = 0.35;
  const MILESTONE_EVERY = 10;

  /* ------------------------------------------------------------------ feats: stat, target, the line the player reads */
  const FEATS = {
    runs10:     { stat: 'runs', n: 10, t: 'Finish 10 runs' },
    runs25:     { stat: 'runs', n: 25, t: 'Finish 25 runs' },
    win1:       { stat: 'wins', n: 1, t: 'Extract from the Plaza once' },
    win5:       { stat: 'wins', n: 5, t: 'Extract 5 times' },
    win10:      { stat: 'wins', n: 10, t: 'Extract 10 times' },
    win50:      { stat: 'wins', n: 50, t: 'Extract 50 times' },
    heat2:      { stat: 'heatWon', n: 2, t: 'Win a run at Heat 2' },
    heat3:      { stat: 'heatWon', n: 3, t: 'Win a run at Heat 3' },
    heat4:      { stat: 'heatWon', n: 4, t: 'Win a run at Heat 4' },
    heat5:      { stat: 'heatWon', n: 5, t: 'Win a run at Heat 5' },
    heat6:      { stat: 'heatWon', n: 6, t: 'Win a run at Heat 6' },
    heat7:      { stat: 'heatWon', n: 7, t: 'Win a run at Heat 7' },
    heat10:     { stat: 'heatWon', n: 10, t: 'Win a run at Heat 10' },
    relays5:    { stat: 'relays', n: 5, t: 'Burn 5 signal relays' },
    relays10:   { stat: 'relays', n: 10, t: 'Burn 10 signal relays' },
    kills500:   { stat: 'kills', n: 500, t: 'Delete 500 enemies' },
    kills1000:  { stat: 'kills', n: 1000, t: 'Delete 1,000 enemies' },
    kills5000:  { stat: 'kills', n: 5000, t: 'Delete 5,000 enemies' },
    heads250:   { stat: 'heads', n: 250, t: 'Land 250 headshot kills' },
    drones100:  { stat: 'k_drone', n: 100, t: 'Shoot down 100 ad drones' },
    srv2500:    { stat: 'k_serverless', n: 2500, t: 'Put 2,500 Serverless to rest' },
    boots50:    { stat: 'boots', n: 50, t: 'Get 50 boot kills' },
    boots100:   { stat: 'boots', n: 100, t: 'Get 100 boot kills' },
    bootRun10:  { stat: 'bootsRun', n: 10, t: 'Get 10 boot kills in one run' },
    shotgun200: { stat: 'w_shotgun', n: 200, t: 'Get 200 kills with the Riptide-12' },
    energy200:  { stat: 'w_energy', n: 200, t: 'Get 200 kills with the Plasma Lancer' },
    oneGun1000: { stat: 'oneGun', n: 1000, t: 'Get 1,000 kills with one gun' },
    air500:     { stat: 'air', n: 500, t: 'Get 500 airborne kills' },
    deaths10:   { stat: 'deaths', n: 10, t: 'End the stream 10 times (you will)' },
    deaths25:   { stat: 'deaths', n: 25, t: 'End the stream 25 times' },
    hits300:    { stat: 'hits', n: 300, t: 'Take 300 hits of content' },
    dmg10k:     { stat: 'dmg', n: 10000, t: 'Soak up 10,000 damage' },
    flawless20: { stat: 'flawless', n: 20, t: 'Clear 20 waves without a scratch' },
    lowWin:     { stat: 'lowWin', n: 1, t: 'Extract with 10 HP or less' },
    cleanWin:   { stat: 'cleanWin', n: 1, t: 'Win a run taking under 150 damage' },
    rankSS:     { stat: 'rank', n: 5, t: 'Hit SS // MAIN CHARACTER style' },
    gradeMC:    { stat: 'grade', n: 5, t: 'Earn a MAIN CHARACTER grade' },
    score150k:  { stat: 'best', n: 150000, t: 'Score 150,000 in one run' },
    score300k:  { stat: 'best', n: 300000, t: 'Score 300,000 in one run' },
    storm1:     { stat: 'storms', n: 1, t: "Survive Riya's signal storm" },
    boss10:     { stat: 'boss', n: 10, t: 'Deplatform Riya Vex 10 times' },
    perks50:    { stat: 'perks', n: 50, t: 'Take 50 sponsor deals' },
    dash500:    { stat: 'dashes', n: 500, t: 'Dash 500 times' },
    jump2000:   { stat: 'jumps', n: 2000, t: 'Jump 2,000 times' },
    km10:       { stat: 'arenaM', n: 10000, t: 'Cover 10 km in the Plaza', unit: 'm' },
    havenKm:    { stat: 'havenM', n: 1000, t: 'Walk 1 km around the Haven', unit: 'm' },
    haven10:    { stat: 'havenS', n: 600, t: 'Hang out in the Haven for 10 minutes', unit: 's' },
    dance60:    { stat: 'danceS', n: 60, t: 'Dance on the Haven floor for a minute', unit: 's' },
    talk6:      { stat: 'talked', n: 6, t: 'Talk to 6 people in the Haven' },
    days3:      { stat: 'days', n: 3, t: 'Come back on 3 different days' },
    gtHold:     { stat: 'gtPeak', n: 1500, t: 'Hold 1,500 GigaTech at once' },
    gtSpend:    { stat: 'gtSpent', n: 2000, t: "Spend 2,000 GigaTech at Box's Arms" },
    drip10k:    { stat: 'earned', n: 10000, t: 'Earn 10,000 DRIP all-time' },
    own60:      { stat: 'owned', n: 60, t: 'Own 60 wardrobe items' },
    cone:       { stat: 'cone', n: 1, t: 'Find the cone. It is in the Plaza. Somewhere high.' },
    box:        { stat: 'boxed', n: 1, t: 'Hide in the cardboard box in the Haven' },
  };

  /* ------------------------------------------------------------------ how every non-default item unlocks
   * [kind, feat]: kind S = shop, L = license (feat opens it for sale), F = feat only. Price comes from rarity. */
  const RULES = {
    face_beard: ['S'], face_glam: ['S'], face_scar: ['F', 'runs25'], face_warpaint: ['L', 'heat3'], face_cyber: ['F', 'gradeMC'],
    hair_slick: ['S'], hair_undercut: ['S'], hair_bob: ['S'], hair_afro: ['S'], hair_bun: ['S'], hair_mohawk: ['L', 'relays10'],
    head_cap: ['S'], head_bandana: ['S'], head_foil: ['F', 'hits300'], head_catears: ['S'], head_tac: ['L', 'heat2'],
    head_cone: ['F', 'cone'], head_cowboy: ['L', 'score150k'], head_tophat: ['L', 'gtSpend'], head_recon: ['L', 'heat5'],
    head_crown: ['F', 'heat7'], head_halo: ['F', 'heat10'],
    eyes_goggles: ['S'], eyes_vr: ['F', 'talk6'], eyes_bandana: ['L', 'win5'], eyes_visor: ['L', 'heads250'], eyes_monocle: ['L', 'gtHold'],
    eyes_gasmask: ['L', 'heat4'], eyes_groucho: ['L', 'drones100'], eyes_clown: ['F', 'deaths10'], eyes_smiley: ['F', 'boss10'],
    eyes_patch: ['F', 'box'],
    top_hawaii: ['F', 'days3'], top_bomber: ['S'], top_vest: ['F', 'win1'], top_puffer: ['L', 'storm1'], top_trench: ['L', 'runs10'],
    top_suit: ['S'], top_bubble: ['F', 'dmg10k'], top_riot: ['L', 'kills500'], top_nano: ['F', 'cleanWin'], top_gilded: ['L', 'heat6'],
    top_exo: ['F', 'kills5000'],
    hands_tactical: ['S'], hands_mitts: ['L', 'energy200'], hands_boxing: ['F', 'boots100'], hands_cyber: ['L', 'perks50'],
    hands_gauntlets: ['F', 'oneGun1000'],
    legs_shorts: ['S'], legs_track: ['F', 'km10'], legs_kilt: ['L', 'bootRun10'], legs_hearts: ['F', 'lowWin'], legs_greaves: ['L', 'kills1000'],
    legs_nano: ['F', 'flawless20'], legs_gilded: ['L', 'heat6'], legs_exo: ['F', 'win50'],
    feet_boots: ['S'], feet_sandals: ['F', 'havenKm'], feet_hightops: ['L', 'dash500'], feet_slippers: ['F', 'haven10'], feet_clown: ['F', 'deaths25'],
    feet_mag: ['L', 'rankSS'], feet_gold: ['L', 'drip10k'], feet_hover: ['F', 'air500'],
    back_antenna: ['L', 'relays5'], back_guitar: ['F', 'dance60'], back_katana: ['L', 'boots50'], back_cape: ['L', 'win10'], back_cushion: ['S'],
    back_jetpack: ['L', 'jump2000'], back_server: ['L', 'srv2500'], back_wings: ['F', 'own60'],
    neck_headphones: ['S'], neck_scarf: ['S'], neck_bandolier: ['L', 'shotgun200'], neck_chain: ['S'], neck_crypto: ['L', 'score300k'],
  };

  let SAVE = null, CAT = null, ITEMS = null;
  const listeners = [];

  const today = (d = new Date()) => d.toISOString().slice(0, 10);
  const dayNum = (d = new Date()) => Math.floor(d.getTime() / 86400000);
  function W() {
    if (!SAVE) return null;
    const w = SAVE.wardrobe || (SAVE.wardrobe = {});
    w.v = 1;
    if (!Number.isFinite(w.drip)) w.drip = 0;
    if (!Number.isFinite(w.earned)) w.earned = 0;
    if (!Number.isFinite(w.spent)) w.spent = 0;
    if (!Number.isFinite(w.milestones)) w.milestones = 0;
    for (const k of ['owned', 'seen', 'days', 'talked']) if (!Array.isArray(w[k])) w[k] = [];
    if (!w.stats || typeof w.stats !== 'object') w.stats = {};
    return w;
  }
  const isDefault = it => !!it && (it.default || it.unlock === 'Default');
  const item = id => ITEMS && ITEMS[id];

  function emit(type, data) { for (const f of listeners) { try { f(type, data); } catch (e) { console.warn('[Wardrobe]', e); } } }

  /* ------------------------------------------------------------------ setup */
  function attach(save, catalog) {
    SAVE = save; W();
    if (catalog) {
      CAT = catalog; ITEMS = {};
      for (const s of ['m', 'f']) for (const it of catalog.items[s]) if (!ITEMS[it.id]) ITEMS[it.id] = it;
    }
    seedFromSave();
    return api;
  }
  // bring over what older saves already know, so veterans start with the feats they earned
  function seedFromSave() {
    const w = W(), st = w.stats, a = SAVE.arena || {};
    if (!w.seeded) {
      w.seeded = true;
      st.runs = Math.max(st.runs || 0, a.runs || 0);
      st.wins = Math.max(st.wins || 0, a.wins || 0);
      st.best = Math.max(st.best || 0, a.best || 0);
      if (a.maxHeat) st.heatWon = Math.max(st.heatWon ?? -1, a.maxHeat - 1);
      st.kills = Math.max(st.kills || 0, SAVE.kills || 0);
      st.gtPeak = Math.max(st.gtPeak || 0, SAVE.gt || 0);
      try {                                                    // the avatar kit's pre-save localStorage keys
        const ls = root.localStorage;
        const old = JSON.parse(ls?.getItem('e2049.avatar.owned.v1') || '[]');
        for (const id of old) if (!w.owned.includes(id)) w.owned.push(id);
        if (!w.look && ls?.getItem('e2049.avatar.v1')) w.look = ls.getItem('e2049.avatar.v1');
      } catch (e) { /* no storage */ }
    }
    st.gtPeak = Math.max(st.gtPeak || 0, SAVE.gt || 0);
    w.lastGT = Number.isFinite(w.lastGT) ? w.lastGT : (SAVE.gt || 0);
    const d = today();
    if (!w.days.includes(d)) { w.days.push(d); if (w.days.length > 60) w.days.splice(0, w.days.length - 60); }
    st.days = Math.max(st.days || 0, w.days.length);
    st.talked = w.talked.length;
    st.owned = ownedCount();
    st.earned = w.earned;
    st.cone = w.cone ? 1 : 0;
    check(true);
  }

  /* ------------------------------------------------------------------ ownership */
  function owns(id) { const it = item(id); return isDefault(it) || W().owned.includes(id); }
  function unlockables() { return ITEMS ? Object.values(ITEMS).filter(it => !isDefault(it)) : []; }
  function ownedCount() { const w = W(); return unlockables().filter(it => w.owned.includes(it.id)).length; }
  function grant(id, why) {
    const w = W(); if (!item(id) || owns(id)) return false;
    w.owned.push(id);
    w.stats.owned = ownedCount();
    emit('unlock', { id, item: item(id), why });
    milestones();
    return true;
  }
  function milestones() {
    const w = W(), n = Math.floor(ownedCount() / MILESTONE_EVERY);
    while (w.milestones < n) {
      w.milestones++;
      const bonus = 100 * w.milestones;
      addDrip(bonus, 'milestone');
      emit('milestone', { count: w.milestones * MILESTONE_EVERY, bonus });
    }
  }
  function markSeen(ids) { const w = W(); for (const id of ids) if (!w.seen.includes(id)) w.seen.push(id); }
  function isNew(id) { const w = W(); return w.owned.includes(id) && !w.seen.includes(id); }

  /* ------------------------------------------------------------------ feats */
  function progress(featId) {
    const f = FEATS[featId]; if (!f) return null;
    const v = Math.max(0, W().stats[f.stat] ?? 0);
    return { id: featId, text: f.t, have: Math.min(v, f.n), need: f.n, done: v >= f.n, frac: Math.min(1, v / f.n), unit: f.unit || '' };
  }
  function featDone(featId) { return !!progress(featId)?.done; }
  // look for items whose feat just completed; quiet = do it without announcements (save load)
  function check(quiet) {
    const w = W();
    if (!ITEMS) return;
    w.licenses = w.licenses || [];
    for (const [id, [kind, feat]] of Object.entries(RULES)) {
      if (!item(id) || !feat || !featDone(feat)) continue;
      if (kind === 'F' && !owns(id)) {
        const bounty = 50 * (item(id).rarity + 1);
        w.owned.push(id); w.stats.owned = ownedCount();
        addDrip(bounty, 'feat');
        if (!quiet) emit('unlock', { id, item: item(id), why: 'feat', feat: FEATS[feat].t, bounty });
        milestones();
      } else if (kind === 'L' && !w.licenses.includes(id)) {
        w.licenses.push(id);
        if (!quiet && !owns(id)) emit('license', { id, item: item(id), feat: FEATS[feat].t });
      }
    }
  }
  function bump(stat, n = 1) {
    const st = W().stats; st[stat] = (st[stat] || 0) + n;
    if (stat.startsWith('w_')) st.oneGun = Math.max(st.oneGun || 0, st[stat]);
    check();
  }
  function max(stat, v) {
    const st = W().stats; if (!((st[stat] ?? -Infinity) < v)) return;
    st[stat] = v; check();
  }

  /* ------------------------------------------------------------------ DRIP */
  function addDrip(n, why) {
    const w = W(); n = Math.max(0, Math.round(n)); if (!n) return 0;
    w.drip += n; w.earned += n; w.stats.earned = w.earned;
    emit('drip', { n, why, total: w.drip });
    check();
    return n;
  }
  function rule(id) {
    const it = item(id); if (!it) return null;
    if (isDefault(it)) return { kind: 'D', price: 0 };
    const [kind, feat] = RULES[id] || ['S'];
    return { kind, feat, price: kind === 'F' ? 0 : RARITY_PRICE[it.rarity] || 0 };
  }
  function featured(d = new Date()) {
    // three items that can be bought today (licensed or not), seeded by the date: same for everyone, new each day
    const pool = unlockables().filter(it => rule(it.id).kind !== 'F').map(it => it.id).sort();
    let s = (dayNum(d) * 2654435761) >>> 0; const out = [];
    const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  }
  function price(id) {
    const r = rule(id); if (!r || !r.price) return 0;
    return featured().includes(id) ? Math.round(r.price * (1 - DAILY_OFF) / 5) * 5 : r.price;
  }
  // what stands between the player and this item
  function status(id) {
    const r = rule(id); if (!r) return null;
    const owned = owns(id), p = r.feat ? progress(r.feat) : null;
    const cost = price(id), drip = W().drip;
    const gateOpen = r.kind !== 'L' || p.done;
    return {
      kind: r.kind, owned, feat: p, price: cost, full: r.price, sale: cost < r.price,
      buyable: !owned && (r.kind === 'S' || r.kind === 'L'), canBuy: !owned && (r.kind === 'S' || r.kind === 'L') && gateOpen && drip >= cost,
      gateOpen, short: Math.max(0, cost - drip), isNew: isNew(id),
    };
  }
  function buy(id) {
    const s = status(id); if (!s || !s.canBuy) return false;
    const w = W(); w.drip -= s.price; w.spent += s.price;
    grant(id, 'buy');
    return true;
  }

  /* ------------------------------------------------------------------ arena: one run's summary -> DRIP payout */
  function runEnd(r) {
    // r: { won, heat, grade (0..5), rank (peak 0..5), relays, kills, heads, air, boots, hurt, hp, tags, crate, score, perks, flawlessWaves, storm, boss }
    const w = W(), st = w.stats;
    st.runs = (st.runs || 0) + 1;
    if (r.won) { st.wins = (st.wins || 0) + 1; st.heatWon = Math.max(st.heatWon ?? -1, r.heat || 0); }
    else st.deaths = (st.deaths || 0) + 1;
    st.best = Math.max(st.best || 0, r.score || 0);
    st.grade = Math.max(st.grade || 0, r.grade || 0);
    st.bootsRun = Math.max(st.bootsRun || 0, r.boots || 0);
    if (r.won && r.hp <= 10) st.lowWin = 1;
    if (r.won && r.hurt < 150) st.cleanWin = 1;
    const heatMul = 1 + (r.heat || 0) * 0.15;
    const rows = [];
    const add = (label, n) => { n = Math.round(n); if (n > 0) rows.push([label, n]); return n; };
    let run = 0;
    run += add(r.won ? 'EXTRACTED' : 'SHOWED UP', r.won ? 60 : 20);
    run += add('GRADE', (r.grade || 0) * 12);
    run += add('PEAK STYLE', (r.rank || 0) * 8);
    run += add('RELAYS', (r.relays || 0) * 5);
    if (heatMul > 1) { const extra = run * (heatMul - 1); run += add(`HEAT x${heatMul.toFixed(2)}`, extra); }
    const d = today();
    if (r.won && w.firstWinDay !== d) { w.firstWinDay = d; run += add('FIRST WIN TODAY x2', run); }
    run += add('DRIP TAGS', r.tags || 0);
    run += add('MERCH CRATE', r.crate || 0);
    addDrip(run, 'run');
    check();
    return { total: run, rows, wallet: w.drip };
  }
  function dripTag(heat) { return Math.round(10 * (1 + (heat || 0) * 0.15)); }
  function crateValue(heat) { return Math.round(40 * (1 + (heat || 0) * 0.15)); }
  function findCone() {
    const w = W(); if (w.cone) return false;
    w.cone = true; w.stats.cone = 1; addDrip(100, 'cone'); check(); return true;
  }

  /* ------------------------------------------------------------------ haven + GigaTech bookkeeping */
  function talk(npcId) { const w = W(); if (!w.talked.includes(npcId)) { w.talked.push(npcId); max('talked', w.talked.length); } }
  function syncGT() {
    const w = W(), gt = SAVE.gt || 0;
    if (gt < w.lastGT) bump('gtSpent', w.lastGT - gt);
    w.lastGT = gt;
    max('gtPeak', gt);
  }

  /* ------------------------------------------------------------------ the shop surface AvatarCreator renders */
  const fmt = n => Math.round(n).toLocaleString('en-US');
  function shop() {
    const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
    return {
      wallet: () => `◆ ${fmt(W().drip)} DRIP`,
      collection: () => `${ownedCount()}/${unlockables().length} COLLECTED`,
      featured: () => featured(),
      badge(id) {
        const s = status(id); if (!s || s.kind === 'D') return '';
        if (s.isNew) return '<span class="avc-b new">NEW</span>';
        if (s.owned) return '';
        const k = n => (n >= 10000 ? Math.floor(n / 1000) + 'k' : fmt(n));
        if (s.kind === 'F') return `<span class="avc-b feat">★ ${k(s.feat.have)}/${k(s.feat.need)}</span>`;
        const cls = s.sale ? 'sale' : s.canBuy ? 'buy' : 'cost';
        return `<span class="avc-b ${cls}">${s.kind === 'L' && !s.gateOpen ? '🔑 ' : ''}◆${fmt(s.price)}</span>`;
      },
      detail(id) {
        const s = status(id); if (!s) return '';
        if (s.kind === 'D') return '<span class="avc-ok">Standard issue. Always yours.</span>';
        const bar = p => `<span class="avc-bar2"><i style="width:${Math.round(p.frac * 100)}%"></i></span> ${fmt(p.have)}/${fmt(p.need)}${p.unit ? ' ' + p.unit : ''}`;
        const lines = [];
        if (s.owned) lines.push('<span class="avc-ok">✔ OWNED</span>');
        else if (s.kind === 'F') lines.push(`<span class="avc-feat">★ FEAT REWARD // NOT FOR SALE</span><br>${esc(s.feat.text)} ${bar(s.feat)}`);
        else {
          if (s.kind === 'L') lines.push(`${s.gateOpen ? '<span class="avc-ok">🔑 LICENSE EARNED</span>' : '<span class="avc-feat">🔑 LICENSE NEEDED</span>'} ${esc(s.feat.text)} ${s.gateOpen ? '' : bar(s.feat)}`);
          lines.push(`PRICE ◆${fmt(s.price)}${s.sale ? ` <s>◆${fmt(s.full)}</s> <span class="avc-sale">DAILY DROP -${Math.round(DAILY_OFF * 100)}%</span>` : ''}` +
            (s.gateOpen && s.short ? ` <span class="avc-short">// ◆${fmt(s.short)} short</span>` : ''));
        }
        return lines.join('<br>');
      },
      action(id) {
        const s = status(id); if (!s || !s.buyable) return null;
        return { label: s.canBuy ? `BUY ◆${fmt(s.price)}` : !s.gateOpen ? 'LICENSE NEEDED' : `◆${fmt(s.short)} SHORT`, enabled: s.canBuy };
      },
      buy: id => buy(id),
      seen: ids => markSeen(ids),
      closest(n = 4) {
        // the next things to chase: unfinished feats/licenses, most-complete first
        return unlockables().filter(it => !owns(it.id) && rule(it.id).feat && !(rule(it.id).kind === 'L' && featDone(rule(it.id).feat)))
          .map(it => ({ id: it.id, p: progress(rule(it.id).feat) })).sort((a, b) => b.p.frac - a.p.frac).slice(0, n).map(o => o.id);
      },
    };
  }

  const api = {
    FEATS, RULES, RARITY_PRICE, DAILY_OFF,
    attach, on: f => listeners.push(f), off: f => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); },
    get ready() { return !!(SAVE && ITEMS); }, get drip() { return W()?.drip || 0; }, get save() { return W(); },
    owns, grant, rule, status, price, buy, featured, progress, featDone, bump, max, addDrip, runEnd, dripTag, crateValue, findCone,
    talk, syncGT, shop, ownedCount, unlockables, isNew, markSeen, check, today,
    stat: k => W()?.stats[k] || 0,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.Wardrobe = api;
})(typeof window !== 'undefined' ? window : globalThis);
