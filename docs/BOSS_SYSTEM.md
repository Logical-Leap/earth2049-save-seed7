# Boss system contract

Status: **five configured prototype encounters; target BossSystem not implemented**. Audited at `7653b97` on 2026-07-13.

## Current implementation

`BOSSES` in `js/config.js` defines Riya, Magnus, SPYD3R, Blitz, and Turing. `startBoss()`, `bossTick()`, and `bossKilled()` in `js/game.js` own the encounter. Bosses reuse the enemy entity shape and Assets rig builders.

| District | Boss | Current attack cycle |
|---|---|---|
| ShillZ | Riya Vex | radial, volley, summon ShillZ loyalists |
| Muskers | Magnus | charge, volley, radial |
| Bots | SPYD3R.EXE | radial, volley, summon nodes |
| Cryptids | Blitz Radium | homing, radial, summon drones |
| GigaCorp | Turing | teleport, radial, homing, summon troopers |

All bosses gain speed and faster patterns below 50% HP. Attack order is fixed by array order, but teleport positions, projectiles, and summons use unseeded RNG. Boss spawn falls back to arena center when no authored marker exists.

Riya canon: Riya is a sincere pro-authority, pro-GigaCorp propagandist and the public voice of consumer obedience. She is not a rebel leader, secret resistance figure, or counterfeit dissident. Current runtime mechanics do not encode this narrative distinction, and older environmental/config language that suggests resistance is content debt.

### Current death effects

`bossKilled()` hides the bar, enters `bossdead`, adds boss GigaTech, adds weapon mastery, unlocks the first boss relic, increments faction intel, updates Turing tier state, attempts clean-mission completion, persists, and kills remaining enemies. The final district later calls `doVictory()`; earlier districts open the OG augment/route overlay. `G.banked` prevents duplicate end-of-run banking, but boss rewards do not use transaction IDs and there is no BossSystem exactly-once test.

## Required MVP target contract

```text
inactive → intro → phase1 → phase2 → defeated
                       ↘ failed (run ends)
```

A standalone BossSystem should own activation, finite/clamped health, deterministic phase transitions, bounded attack/summon requests, death transaction ID, snapshot/restore, and an immutable result. It must not bank save data or manipulate DOM directly.

Required invariants:

- exactly one active boss and one boss bar per encounter;
- valid reachable arena and safe spawn;
- phase changes occur once at explicit thresholds;
- attack/summon output remains inside entity/projectile budgets;
- zero/negative damage and duplicate network/death events cannot duplicate rewards;
- boss death resolves objective and district transition once;
- Turing defeat resolves campaign reward, ending, and Hub return once;
- non-host co-op clients never originate boss simulation.

The target system, ending sequence, and Hub return are not implemented.

## Verification

```bash
node --check js/config.js js/game.js js/assets.js js/world.js js/net/*.js workers/*.js
npm test
npm run pages:prepare
git diff --check
```

Future acceptance: spawn each boss on primary and fallback maps; force phase threshold; run every attack; kill via repeated same-frame/network events; assert one relic/reward/transition; restore mid-fight snapshot; bound summons/projectiles; complete Turing ending and return Hub.

## Blockers

- Boss state, rendering, audio, progression, save writes, and campaign transitions are coupled in `game.js`.
- No boss-focused unit/browser tests or deterministic RNG.
- Later authored arenas are not production-wired.
- Turing completion is a victory overlay, not the required ending/credits/Hub lifecycle.
- Narrative/canon review of existing ShillZ and Riya strings remains a separate content task.
