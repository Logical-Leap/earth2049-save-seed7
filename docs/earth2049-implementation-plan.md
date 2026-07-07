# Earth 2049: Save Seed 7 — Implementation Plan

Repo inspected: `Logical-Leap/earth2049-save-seed7` at `097f9df` on `feature/faction-intel`.
GDD pack source copied locally to `/Users/macminim4pro/Documents/earth2049-gdd-pack`:

- `Earth2049_SaveSeed7_FPS_Roguelike_GDD.md`
- `Earth2049_Master_Art_Bible_Phase1.md`
- `Earth2049_Phase1_ArtBible.zip`

## Current shipped prototype

Static browser game, no build step:

- `index.html` — HUD/menus/overlay layout.
- `js/config.js` — tuning data, factions, rarity tiers, weapons, enemy archetypes, bosses, districts, augments, meta upgrades.
- `js/game.js` — run state, FPS controls, enemy/wave/boss loops, AI director, loot, OG augments, save data, armory, HUD.
- `js/world.js` — procedural arena/district scenery, raycasts/collision, flow-field movement.
- `js/assets.js` — procedural art, textures, rigs, gun/enemy/pickup meshes.
- `js/audio.js` — synthesized SFX/music.
- `lib/` — local Three.js/postprocessing dependencies.

Implemented from GDD:

- First-person movement/shooting with desktop + mobile controls.
- Five linear districts with faction visual themes.
- Waves, bosses, pickups, weapon rarity, OG augment choices.
- GigaTech/meta upgrades in Armory.
- Turing director taunts, pressure adjustment, assassin spawns, resource manipulation.
- Persistent save data in `localStorage`.
- PR #1 adds persistent faction intel tracking and Briefing display.
- PR #1 follow-up adds route choices on the OG Device and per-district mission objectives/rewards.

Major GDD systems still missing or shallow:

- District route choice / procedural room graph beyond one arena per district.
- Mission system, contracts, objectives, side goals.
- Faction reputation/diplomacy effects beyond intel display.
- District control and faction influence map.
- Shops, debt, black-market/tradeoffs, faction services.
- Lore fragments/dialogue/NPC hub in Rebel Underground.
- Turing memory across runs beyond current save/stat data.
- More enemy archetypes and faction-specific behaviors from Art Bible.
- Long-term production architecture if the project grows beyond a single-file prototype.

## Recommended sprint order

### Sprint 1 — Make runs strategic, not just linear

1. **Route choice after each district**
   - Add route options to the OG Device screen.
   - Data: extend `DISTRICTS` in `js/config.js` with route metadata and risk/reward modifiers.
   - Code: modify `openOG()` / `startDistrict()` in `js/game.js` so augments and next district choices are both meaningful.
   - Verification: start run, clear/force district transition, choose route, confirm next district/modifier applies.

2. **Faction intel → gameplay modifiers**
   - Use `SAVE.intel` from PR #1 to unlock counterplay: enemy scan labels, boss weakness hints, small shop/loot bonuses.
   - Files: `js/game.js`, `index.html`, maybe `js/config.js` for thresholds.
   - Verification: seed `localStorage`, open Briefing/run, confirm thresholds change visible gameplay without console errors.

3. **Mission objective layer**
   - Add per-district optional objectives: destroy propaganda node, survive ambush, recover data cache, disable scanner.
   - Files: `js/config.js` mission table, `js/game.js` objective state/HUD, `js/world.js` prop spawn points.
   - Verification: objective appears, completes, pays reward, persists in stats.

### Sprint 2 — Deepen factions

4. **Faction reputation/diplomacy model**
   - Add `SAVE.rep` alongside `SAVE.intel`.
   - Killing faction units decreases rep; missions/choices can improve rep.
   - Rep affects enemy counts, shop pricing, and final reinforcements.

5. **Faction-specific enemy behavior pass**
   - ShillZ: swarm/screamer propaganda buffs.
   - Muskers: dash/overclock/implant burst windows.
   - Bots: decoys/HUD glitch/repeated tactic adaptation.
   - Cryptids: debt/greed/risky high-value loot pressure.
   - GigaCorp: shields, suppressive fire, scanner drones.

6. **Boss modifier system**
   - Turing applies modifiers to leaders based on player build/performance.
   - Example: anti-shotgun armor, projectile spam if player kites, assassin escort if overperforming.

### Sprint 3 — Add hub/economy/lore

7. **Rebel Underground hub overlay**
   - Menu/hub after death/extraction: Armory, Briefing, Intel, Lore, Settings.
   - Keeps prototype static/no-build but gives the GDD's safe-zone structure.

8. **Lore fragment unlocks**
   - Persistent `SAVE.lore` from bosses, objectives, intel thresholds.
   - Briefing/Lore screen renders unlocked text.

9. **Shop/black-market events**
   - Between districts: spend GigaTech or take debt for temporary run power.
   - Cryptid faction has special risky offers.

## Verification baseline

Because this is a no-build static app, use:

```bash
node --check js/game.js
node --check js/config.js
node --check js/world.js
node --check js/assets.js
node --check js/audio.js
git diff --check
python3 -m http.server 8049
```

Then smoke in browser:

- Title renders with no console errors.
- Briefing/Armory open and back buttons work.
- Start Simulation enters run.
- Movement, shooting, dash, pause, death/extraction path work.
- If a feature touches save state, test with old/no `localStorage` and seeded `localStorage`.

## First next PR suggestion

Build **Route Choice + Mission Objective MVP** together:

- Add an OG Device post-district screen with one augment choice and two route cards.
- Add one mission type per faction using existing assets/arena cells.
- Wire mission rewards into GigaTech + faction intel.

This gives immediate roguelike decision depth while staying within the current static Three.js architecture.
