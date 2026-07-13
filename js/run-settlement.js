/* EARTH 2049 exact-once reward and atomic run settlement rules (UMD/no-build) */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RunSettlement = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function enemyRewardPolicy({ boss = false, elite = false, gt = 0 } = {}) {
    const baseGT = Math.max(0, Math.round(Number(gt) || 0));
    return {
      killIntel: boss ? 0 : (elite ? 3 : 1),
      shardGT: boss ? 0 : baseGT * (elite ? 3 : 1),
      bossGT: boss ? baseGT : 0,
      bossIntel: boss ? 25 : 0,
    };
  }

  function cloneSave(save) {
    if (typeof structuredClone === 'function') return structuredClone(save);
    return JSON.parse(JSON.stringify(save));
  }

  function commit({ save, run, mutateDraft, persist } = {}) {
    if (!save || !run || run.banked || typeof mutateDraft !== 'function' || typeof persist !== 'function') {
      return { ok: false, save, reason: run?.banked ? 'already-banked' : 'invalid-settlement' };
    }
    const draft = cloneSave(save);
    mutateDraft(draft);
    let persisted = false;
    try { persisted = persist(draft) === true; } catch (_) { persisted = false; }
    if (!persisted) return { ok: false, save, reason: 'persist-failed' };
    run.banked = true;
    return { ok: true, save: draft };
  }

  return Object.freeze({ enemyRewardPolicy, commit });
});
