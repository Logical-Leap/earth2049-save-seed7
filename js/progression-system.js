/* EARTH 2049 persistent campaign progression helpers (UMD/no-build) */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CampaignProgression = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function ensureFactionIntel(save, faction) {
    if (!save.intel || typeof save.intel !== 'object') save.intel = {};
    if (!save.intel[faction] || typeof save.intel[faction] !== 'object') save.intel[faction] = { points:0, leaders:0 };
    const record = save.intel[faction];
    if (!Number.isFinite(Number(record.points))) record.points = 0;
    if (!Number.isFinite(Number(record.leaders))) record.leaders = 0;
    return record;
  }

  function recordLeaderDefeat(save, faction) {
    if (!save || !faction) return false;
    const record = ensureFactionIntel(save, faction);
    const changed = Number(record.leaders) < 1;
    record.leaders = 1;
    return changed;
  }

  function recordLeaderDefeats(save, factions) {
    const recorded = [];
    for (const faction of new Set(Array.isArray(factions) ? factions : [])) {
      if (!faction) continue;
      recordLeaderDefeat(save, faction);
      recorded.push(faction);
    }
    return recorded;
  }

  return { ensureFactionIntel, recordLeaderDefeat, recordLeaderDefeats };
});
