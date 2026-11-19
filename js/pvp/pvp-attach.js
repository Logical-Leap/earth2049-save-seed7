/* EARTH 2049: SAVE SEED 7 — create-a-class attachments on the gun models.
 *
 * Every class gun's GLB (game-art-pipeline props/loadout.py) carries one option node per attachment and a 'pvp' table in
 * its manifest: pvp[<attachment id>] = { show: [nodes], hide: [option slots], sight: '<anchor suffix>' (optics only) }.
 * apply() turns a rarity's show list plus a class's attachments into the nodes to show and the sight to aim through.
 * Used by the first-person rig (js/gunfeel.js), the arena's Arsenal and the create-a-class preview. No DOM, no THREE.
 */
(function (root) {
  'use strict';
  // optic attachment anchor -> the kind of sight it is (eye distance, zoom, reticle and scope overlay follow the kind)
  const SIGHT_KIND = { pvp_reddot: 'reddot', pvp_holo: 'holo', pvp_zoom2: 'zoom2' };

  /**
   * man: the GLB manifest (scene userData), R: the rarity entry ({ show, sight }), att: attachment ids.
   * Returns { show: [node names], sight: anchor suffix, kind: sight kind, missing: [attachment ids with no model] }.
   */
  function apply(man, R, att) {
    const show = new Set((R && R.show) || []), kit = (man && man.pvp) || {}, missing = [];
    let sight = (R && R.sight) || 'iron';
    for (const a of att || []) {
      const k = kit[a];
      if (!k) { missing.push(a); continue; }
      for (const slot of k.hide || []) for (const n of (man.options && man.options[slot]) || []) show.delete(n);
      for (const n of k.show || []) show.add(n);
      if (k.sight) sight = k.sight;
    }
    return { show: [...show], sight, kind: SIGHT_KIND[sight] || sight, missing };
  }
  /** a stable cache key for a set of attachments */
  const key = att => (att && att.length ? [...att].sort().join('+') : '');

  const api = { apply, key, SIGHT_KIND };
  root.PvpAttach = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
