/* EARTH 2049: SAVE SEED 7 — FIELD OPS: the bridge between this FPS and the idle game (THE CITY GRID).
 *
 * The idle game is embedded as-is (synced into idle/ by scripts/sync-idle.js) and opened full screen from the
 * Purple Team Ops room in Rebel Haven: the Commander or any of the holo leaders at the holotable. The two halves
 * trade OPTIONS, never raw power (docs/IDLE-LINK.md has every number):
 *
 *   idle → FPS  read from the last summary the grid sent (SAVE.idle.sum), so it works with the grid closed
 *     requisition   starting gun at least UNCOMMON from 10 Memory Shards, RARE from 60. Rare is the cap.
 *     sponsors      free perk rerolls = loops completed, at most 2 per mission
 *     ally          one call-in drone per mission from a sovereign ally that holds or borders the target
 *     intel         Truth 25: elites marked. Truth 60: relay sites marked before they go up. Information only.
 *     board         which districts, raids and leaders you can deploy to
 *     heat          Suspicion 40: +1 heat, 75: +2. Harder fights, better drops.
 *
 *   FPS → idle  queued in SAVE.idle.outbox and applied by the grid the next time it opens
 *     takeover, raid defence, leader fight, style rank — see the idle game's LINK block.
 *
 * GigaTech is one currency and lives here (SAVE.gt). The grid only asks to spend it.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FieldOps = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const CFG = {
    tierAt: [10, 60],            // shards → UNCOMMON, RARE starting gun (Epic and up only ever drop in the field)
    tierCap: 2,
    rerollMax: 2,
    suspHeat: [40, 75],
    intelAt: [25, 60],
    allySecs: 45,
    replayGT: 0.5,
    outboxMax: 40,
  };
  const FAC = { gigacorp: 'GigaCorp', muskers: 'Muskers', cryptids: 'Cryptids', shillz: 'ShillZ', bots: 'Mech Rebels' };
  const FAC_COL = { gigacorp: '#ff4d6d', muskers: '#00f0ff', cryptids: '#ffc857', shillz: '#ffe14d', bots: '#8affc9' };
  /* only Riya has a fight built; the rest show on the board so the player knows they are coming */
  const LEADERS = {
    shillz: { name: 'RIYA VEX', title: 'THE SIGNAL WITCH', fight: true },
    muskers: { name: 'MAGNUS TARKON', title: 'MAG-0', fight: false },
    cryptids: { name: 'BLITZ RADIUM', title: 'CRYPTID KING', fight: false },
    bots: { name: 'SPYD3R.EXE', title: 'SWARM ADMIN', fight: false },
    gigacorp: { name: 'CHAIRMAN ZHU', title: 'GIGACORP', fight: false },
  };
  const FRIENDLY = ['ALLY', 'FRIENDLY', 'NEUTRAL'];

  /* ------------------------------------------------------------------ save block */
  function freshIdle() { return { sum: null, at: 0, outbox: [], seq: 0 }; }
  function normalize(raw) {
    const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = freshIdle();
    const s = o.sum;
    if (s && typeof s === 'object' && Number.isFinite(+s.loop) && Array.isArray(s.dists)) out.sum = s;
    out.at = Number.isFinite(+o.at) ? +o.at : 0;
    out.seq = Number.isFinite(+o.seq) ? Math.max(0, Math.floor(+o.seq)) : 0;
    out.outbox = (Array.isArray(o.outbox) ? o.outbox : [])
      .filter(e => e && typeof e === 'object' && typeof e.id === 'string' && ['takeover', 'raid', 'leader'].includes(e.kind))
      .slice(-CFG.outboxMax);
    return out;
  }
  function idle(save) { if (!save.idle || !Array.isArray(save.idle.outbox)) save.idle = normalize(save.idle); return save.idle; }

  /* ------------------------------------------------------------------ the board */
  function pendingFor(save, pred) { return idle(save).outbox.filter(pred); }
  function board(save) {
    const I = idle(save), s = I.sum;
    if (!s) return { ready: false };
    const f = s.field || {};
    const has = (arr, v) => Array.isArray(arr) && arr.includes(v);
    const q = pendingFor(save, e => e.loop === s.loop);
    const qWon = id => q.some(e => e.kind === 'takeover' && e.dist === id && e.won && e.mode === 'fight');
    const qTried = id => q.some(e => e.kind === 'takeover' && e.dist === id && (e.mode === 'auto' || !e.won));
    const dist = id => s.dists.find(d => d.id === id);
    const takeovers = s.relinq ? [] : s.dists
      .filter(d => d.front && !d.held && !d.hq && (s.tier || {})[d.owner] !== 'ALLY')
      .map(d => ({
        kind: 'takeover', dist: d.id, name: d.name, owner: d.owner,
        won: has(f.won, d.id) || qWon(d.id), tried: has(f.tried, d.id) || qTried(d.id),
      }));
    let raid = null;
    if (s.contest) {
      const d = dist(s.contest.id);
      const done = q.some(e => e.kind === 'raid' && e.dist === s.contest.id && e.at === s.contest.at && e.won);
      raid = { kind: 'raid', dist: s.contest.id, name: d ? d.name : s.contest.id, by: s.contest.by, at: s.contest.at, left: s.contest.left, done };
    }
    const leaders = Object.keys(LEADERS).map(fac => ({
      kind: 'leader', fac, name: LEADERS[fac].name, title: LEADERS[fac].title, fight: LEADERS[fac].fight,
      tier: (s.tier || {})[fac] || 'NEUTRAL', warn: FRIENDLY.includes((s.tier || {})[fac] || 'NEUTRAL'),
      ally: has(s.allies, fac), talks: has(s.talk, fac),
      down: has(f.kills, fac) || q.some(e => e.kind === 'leader' && e.fac === fac && e.won),
      ever: has(f.ever, fac),
    }));
    return { ready: true, loop: s.loop, masked: !!s.masked, takeovers, raid, leaders, talk: (s.talk || []).length, queued: I.outbox.length };
  }

  /* ------------------------------------------------------------------ what the grid lends a mission */
  function support(save, op) {
    const s = idle(save).sum;
    const out = { tierFloor: 0, freeRerolls: 0, ally: null, intel: 0, heatAdd: 0 };
    if (!s) return out;
    const sh = +s.shards || 0;
    out.tierFloor = Math.min(CFG.tierCap, sh >= CFG.tierAt[1] ? 2 : sh >= CFG.tierAt[0] ? 1 : 0);
    out.freeRerolls = Math.min(CFG.rerollMax, Math.max(0, +s.loopsDone || 0));
    const t = +s.truth || 0;
    out.intel = t >= CFG.intelAt[1] ? 2 : t >= CFG.intelAt[0] ? 1 : 0;
    const su = +s.susp || 0;
    out.heatAdd = su >= CFG.suspHeat[1] ? 2 : su >= CFG.suspHeat[0] ? 1 : 0;
    // ally call-in: only on that ally's own districts or ground bordering it
    if (op && op.dist && Array.isArray(s.allies) && s.allies.length) {
      const d = s.dists.find(x => x.id === op.dist);
      if (d) {
        const near = new Set([d.owner]);
        for (const n of d.adj || []) { const nd = s.dists.find(x => x.id === n); if (nd && !nd.held) near.add(nd.owner); }
        const a = s.allies.find(x => near.has(x));
        if (a) out.ally = { fac: a, name: FAC[a] || a, color: FAC_COL[a] || '#39ff8a', secs: CFG.allySecs };
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ reports */
  function nextId(save) { const I = idle(save); I.seq++; return 'f' + I.seq + '_' + Date.now().toString(36); }
  function queue(save, ev) {
    const I = idle(save);
    ev.id = nextId(save);
    I.outbox.push(ev);
    if (I.outbox.length > CFG.outboxMax) I.outbox.splice(0, I.outbox.length - CFG.outboxMax);
    return ev;
  }
  /** an op the player chose to fight; returns what the arena needs */
  function prepare(save, item) {
    const s = idle(save).sum;
    const sup = support(save, item);
    const replay = item.kind === 'takeover' ? !!item.won : item.kind === 'raid' ? !!item.done : false;
    const title = item.kind === 'leader' ? `TAKE DOWN ${item.name}` : item.kind === 'raid' ? `HOLD ${String(item.name).toUpperCase()}` : `TAKE ${String(item.name).toUpperCase()}`;
    return { kind: item.kind, dist: item.dist || null, fac: item.fac || null, at: item.at || 0, name: item.name, loop: s ? s.loop : 0,
      replay, noBoss: item.kind !== 'leader', title, ...sup };
  }
  /** the player chose AUTO-RESOLVE for a takeover: the grid rolls it */
  function autoResolve(save, item) {
    const s = idle(save).sum; if (!s || item.kind !== 'takeover' || item.won || item.tried) return null;
    return queue(save, { kind: 'takeover', mode: 'auto', won: false, style: 0, dist: item.dist, loop: s.loop });
  }
  /** the arena finished an op: queue the report, say what it paid */
  function complete(save, op, res) {
    if (!op) return { gtMul: 1, label: '' };
    const won = !!res.won, style = Math.max(0, Math.min(1, +res.style || 0));
    if (op.replay) return { gtMul: CFG.replayGT, label: 'REPLAY // GIGATECH AT HALF RATE' };
    if (op.kind === 'leader') {
      queue(save, { kind: 'leader', mode: 'fight', won, style, fac: op.fac, loop: op.loop });
      return { gtMul: 1, label: won ? `${op.name} DOWN // ${FAC[op.fac] || op.fac} NOW HOSTILE` : `${FAC[op.fac] || op.fac} NOW HOSTILE // THE FIGHT IS ON RECORD` };
    }
    if (op.kind === 'raid') {
      if (won) queue(save, { kind: 'raid', mode: 'fight', won, style, dist: op.dist, at: op.at, loop: op.loop });
      return { gtMul: 1, label: won ? `${String(op.name).toUpperCase()} HELD // NO GARRISON BILL` : 'RAID NOT STOPPED // GARRISON IT ON THE GRID' };
    }
    queue(save, { kind: 'takeover', mode: 'fight', won, style, dist: op.dist, loop: op.loop });
    return { gtMul: 1, label: won ? `${String(op.name).toUpperCase()} TAKEN // 25% OFF ON THE GRID` : 'FIGHT LOST // THE CELLS ROLL IT INSTEAD' };
  }
  /** a style figure 0..1 from the arena's peak rank and grade */
  function styleOf(maxRank, ranks, grade, grades) {
    const r = ranks > 1 ? maxRank / (ranks - 1) : 0, g = grades > 1 ? grade / (grades - 1) : 0;
    return Math.max(0, Math.min(1, r * 0.6 + g * 0.4));
  }
  function consumed(save, ids) { const I = idle(save); I.outbox = I.outbox.filter(e => !ids.includes(e.id)); }

  /* ================================================================== browser: the grid and the board */
  const hooks = { save: () => null, persist: () => {}, sfx: () => {}, onClose: () => {}, onDeploy: () => {}, banner: () => {} };
  let gridEl = null, frame = null, closing = null, boardEl = null, lastPersist = 0;
  const PEER = 'e2049-idle', ME = 'e2049-ss7';
  const doc = () => (typeof document !== 'undefined' ? document : null);
  function init(h) { Object.assign(hooks, h); if (typeof addEventListener === 'function') addEventListener('message', onMsg); }
  function post(m) {
    if (!frame?.contentWindow) return;
    m.src = ME;
    try { frame.contentWindow.postMessage(m, location.origin); } catch (e) { /* frame is gone */ }   // same origin only, never '*'
  }
  function onMsg(e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data; if (!m || typeof m !== 'object' || m.src !== PEER) return;
    const save = hooks.save(); if (!save) return;
    const I = idle(save);
    if (m.data && typeof m.data === 'object' && Array.isArray(m.data.dists)) { I.sum = m.data; I.at = Date.now(); }
    if (m.type === 'ready') post({ type: 'hello', gt: Math.floor(save.gt || 0), outbox: I.outbox.slice() });
    else if (m.type === 'consumed' && Array.isArray(m.ids)) { consumed(save, m.ids); hooks.persist(); }
    else if (m.type === 'spend') {
      const amt = Math.max(0, Math.floor(+m.amt || 0));
      const ok = amt > 0 && (save.gt || 0) >= amt;
      if (ok) { save.gt -= amt; hooks.persist(); }
      post({ type: 'spent', id: m.id, ok, gt: Math.floor(save.gt || 0) });
    } else if (m.type === 'leave') closeGrid();
    else if (m.type === 'closed') finishClose();
    if (m.type === 'state' && Date.now() - lastPersist > 10000) { lastPersist = Date.now(); hooks.persist(); }
  }

  function overlay(id, html) {
    const d = doc(); let o = d.getElementById(id);
    if (!o) { o = d.createElement('div'); o.id = id; o.className = 'ov'; d.body.appendChild(o); }
    o.innerHTML = html; return o;
  }
  function openGrid(src) {
    const d = doc(); if (!d) return;
    closeBoard(true);
    gridEl = overlay('ovGrid', `<h2 class="ovtitle">The City Grid</h2>
      <div class="ovsub">Purple Team Ops // live link to the sprawl</div>
      <div class="grid-frame"><iframe title="Earth 2049: the city grid" allow="autoplay"></iframe></div>
      <p class="vrnote">The city grid is a flat-screen view. Lift the headset to play it, then come back.</p>
      <div class="btnrow"><div class="btn" id="gridClose">&#9664; Back to Haven</div><div class="btn" id="gridBoard">Mission board</div></div>`);
    gridEl.querySelector('.vrnote').style.display = window.VR?.active ? '' : 'none';
    frame = gridEl.querySelector('iframe');
    frame.src = src;
    gridEl.querySelector('#gridClose').onclick = () => { hooks.sfx(); closeGrid(); };
    gridEl.querySelector('#gridBoard').onclick = () => { hooks.sfx(); closeGrid(() => openBoard()); };
    gridEl.classList.add('show');
    setTimeout(() => { try { frame?.focus(); } catch (e) { /* ignore */ } }, 300);
  }
  function closeGrid(then) {
    if (!gridEl || closing) return;
    closing = { then, t: setTimeout(finishClose, 700) };
    post({ type: 'close' });
  }
  function finishClose() {
    if (!closing) return;
    clearTimeout(closing.t);
    const then = closing.then; closing = null;
    if (frame) { frame.src = 'about:blank'; frame.remove(); }
    frame = null;
    if (gridEl) gridEl.classList.remove('show');
    hooks.persist();
    if (then) then(); else hooks.onClose();
  }
  const esc = t => String(t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  const TIER_N = ['COMMON', 'UNCOMMON', 'RARE'];
  function openBoard() {
    const d = doc(); if (!d) return;
    const save = hooks.save(); if (!save) return;
    const B = board(save), sup = support(save, null);
    let body = '';
    if (!B.ready) {
      body = `<p class="fo-empty">The board fills from the city grid. Open it once and the holotable syncs to the sprawl.</p>`;
    } else {
      const supTxt = [
        sup.tierFloor ? `Starting gun at least <b>${TIER_N[sup.tierFloor]}</b>` : 'Starting gun: field issue',
        sup.freeRerolls ? `<b>${sup.freeRerolls}</b> free sponsor reroll${sup.freeRerolls > 1 ? 's' : ''}` : 'No free rerolls yet',
        sup.intel === 2 ? 'Intel: <b>elites and relay sites</b>' : sup.intel ? 'Intel: <b>elites marked</b>' : 'No intel yet',
        sup.heatAdd ? `Suspicion: <b>+${sup.heatAdd} heat</b>, better drops` : 'Suspicion: no extra heat',
      ].map(t => `<span>${t}</span>`).join('');
      const raid = B.raid ? `<div class="fo-row fo-raid"><div><b>RAID: ${esc(B.raid.name)}</b><em>${esc(FAC[B.raid.by] || B.raid.by)} is retaking it · ${B.raid.left}s on the grid clock</em></div>
        ${B.raid.done ? '<span class="fo-tag">REPORTED</span>' : `<div class="btn primary" data-op="raid">Defend it</div>`}</div>`
        : '<p class="fo-none">No raids on your ground.</p>';
      const tk = B.takeovers.length ? B.takeovers.map((t, i) => `<div class="fo-row"><div><b>${esc(t.name)}</b><em>held by ${esc(FAC[t.owner] || t.owner)}${t.won ? ' · taken in the field this loop' : t.tried ? ' · the cells already rolled it' : ''}</em></div>
        <div class="fo-btns"><div class="btn${t.won ? '' : ' primary'}" data-op="tk${i}">${t.won ? 'Replay (½ GT)' : 'Fight it'}</div>${t.won || t.tried ? '' : `<div class="btn" data-auto="${i}">Auto-resolve</div>`}</div></div>`).join('')
        : '<p class="fo-none">Nothing borders your ground that you can take from here.</p>';
      const ld = B.leaders.map((l, i) => `<div class="fo-row${l.fight ? '' : ' fo-off'}"><div><b style="color:${FAC_COL[l.fac]}">${esc(l.name)}</b><em>${esc(FAC[l.fac])} · ${esc(l.tier)}${l.ally ? ' · sovereign ally' : ''}${l.down ? ' · down this loop' : ''}</em></div>
        ${l.fight ? `<div class="btn${l.warn ? '' : ' primary'}" data-op="ld${i}">${l.down ? 'Fight again' : 'Fight'}</div>` : '<span class="fo-tag">NOT IN THE FIELD YET</span>'}</div>`).join('');
      body = `<div class="fo-sup">${supTxt}</div>
        <h3>Raids</h3>${raid}
        <h3>Takeovers</h3>${tk}
        <h3>Faction leaders</h3><p class="fo-note">A leader fight sets that faction to maximum hostility, win or lose. The handover ending needs three factions willing to talk${B.ready ? ` (${B.talk} will right now)` : ''}.</p>${ld}
        <p class="fo-note">Fighting pays more than auto-resolving and earns GigaTech, but nothing here is required. Reports apply the next time the city grid opens${B.queued ? ` · <b>${B.queued} waiting</b>` : ''}.</p>`;
    }
    boardEl = overlay('ovBoard', `<h2 class="ovtitle">Mission Board</h2>
      <div class="ovsub">Purple Team Ops // ${B.ready ? 'loop ' + B.loop + ' of the sprawl' : 'not synced'}</div>
      <div class="fo-body">${body}</div>
      <div class="btnrow"><div class="btn" id="boardBack">Back</div><div class="btn" id="boardGrid">Open the city grid</div></div>`);
    boardEl.querySelector('#boardBack').onclick = () => { hooks.sfx(); closeBoard(); };
    boardEl.querySelector('#boardGrid').onclick = () => { hooks.sfx(); closeBoard(true); hooks.openGrid?.(); };
    if (B.ready) {
      boardEl.querySelectorAll('[data-op]').forEach(b => {
        b.onclick = () => {
          hooks.sfx();
          const k = b.dataset.op;
          const item = k === 'raid' ? B.raid : k.startsWith('tk') ? B.takeovers[+k.slice(2)] : B.leaders[+k.slice(2)];
          if (!item) return;
          if (item.kind === 'leader' && item.warn && !b.dataset.armed) {
            b.dataset.armed = '1';
            b.textContent = item.ally ? 'Confirm: ends the alliance' : 'Confirm: they turn hostile';
            b.classList.add('primary');
            const note = d.createElement('p'); note.className = 'fo-warn';
            note.textContent = `${FAC[item.fac]} is ${item.tier.toLowerCase()} right now. Win or lose, this makes them hostile: ${item.ally ? 'the alliance, its buffs and its call-in end, ' : ''}their raids get worse and they stop talking to you.`;
            b.closest('.fo-row').after(note);
            return;
          }
          closeBoard(true);
          hooks.onDeploy(prepare(save, item));
        };
      });
      boardEl.querySelectorAll('[data-auto]').forEach(b => {
        b.onclick = () => {
          hooks.sfx();
          const ev = autoResolve(save, B.takeovers[+b.dataset.auto]);
          if (ev) { hooks.persist(); hooks.banner('AUTO-RESOLVE', 'THE CELLS MOVE. OPEN THE CITY GRID TO SEE HOW IT WENT.'); }
          openBoard();
        };
      });
    }
    boardEl.classList.add('show');
  }
  function closeBoard(quiet) {
    if (!boardEl) return;
    boardEl.classList.remove('show');
    if (!quiet) hooks.onClose();
  }
  const isOpen = () => !!(gridEl?.classList.contains('show') || boardEl?.classList.contains('show'));

  return { CFG, LEADERS, FAC, freshIdle, normalize, board, support, prepare, autoResolve, complete, styleOf, consumed,
    init, openGrid, closeGrid, openBoard, closeBoard, isOpen, get gridOpen() { return !!gridEl?.classList.contains('show'); } };
});
