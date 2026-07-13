# Enemy system contract

Status: **playable monolith; target seam not implemented**. Audited at `7653b97` on 2026-07-13.

## Current implementation

Enemy definitions are `ETYPES` in `js/config.js`; construction, spawn queues, scaling, AI, damage, death, drops, mastery/intel progress, rendering, and co-op adapters are embedded in `js/game.js`. `Assets.buildEnemy()` supplies external or procedural rigs. `World` supplies spawn, collision, line-of-sight, and coarse flow-field queries.

Current common types: ShillZ `shill`, `hypebeast`, `streamer`; Muskers `runner`, `lancer`; Bots `node`, `sentinel`; Cryptids `cdrone`, `broker`; GigaCorp `trooper`, `enforcer`.

ShillZ canon is authoritative: ShillZ are willing pro-GigaCorp consumer loyalists and promotional enforcers, **not rebels and not a counterfeit resistance**. Any older `RESIST`/“sponsored revolution” phrasing in config or scenery is current content debt and must not be used as system truth.

### Lifecycle and caps today

```text
pending type ID → drop → active → dying → removed
```

- Waves enqueue weighted district pool IDs.
- At most `CFG.MAX_ENEMIES` (13) are spawned from the queue concurrently; the queue itself can exceed 13.
- Spawn cadence is 0.4 seconds and uses authored spawn markers when safe, otherwise free grid cells.
- HP/damage/speed scale by district, Director threat, elite state, simulation tier, party scaling, upgrades/modifiers, and random speed variance.
- Common attack families are melee, dash, and ranged; flying enemies bypass normal ground movement but still consult collision.
- Death handling and drop RNG are not isolated from DOM/audio/save/progression side effects.
- In co-op, the host simulates; non-hosts render/interpolate snapshots. The Durable Object caps canonical enemies at 160, which is a network safety cap, not a desired visible count.

## Required MVP target API

A pure/testable `EnemySystem` should own IDs, capped requests, lifecycle, snapshots, and exactly-once death events while rendering remains in `Assets` and browser orchestration remains in `game.js`.

Minimum contract:

```text
requestSpawn(spec) → accepted | queued | rejected
activate(id)
applyDamage(id, amount, sourceTransactionId)
tick(dt, worldQueries)
remove(id, reason)
snapshot() / restore(snapshot)
events: spawned, activated, damaged, killed, removed, queueChanged
```

Invariants:

- finite bounded stats and unique stable IDs;
- no spawn inside colliders, outside containment, or too near the player;
- visible/simulated count never exceeds the client cap;
- death, kill credit, drops, objective progress, and rewards happen once;
- empty queue plus zero live enemies advances a wave once;
- Hub and non-authority clients do not simulate hostile AI;
- snapshots cannot resurrect a confirmed death without an explicit new ID.

This target module does not exist yet.

## Verification

```bash
node --check js/config.js js/game.js js/assets.js js/world.js js/net/*.js workers/*.js
npm test
npm run pages:prepare
git diff --check
```

Required future tests: each attack family; cap/queue behavior; unsafe spawn rejection; elite/scaling bounds; kill exactly once; wave drain; no Hub simulation; host/non-host authority; snapshot restore; missing-rig fallback; ten-wave entity cleanup.

## Blockers

- No standalone EnemySystem or enemy unit tests.
- AI consumes `Math.random()` and browser/Three.js globals, preventing deterministic replay.
- External-scene navigation is coarse and may not route around authored obstacles.
- Client cap, pending queue, projectiles, and boss summons are not governed by one resource budget.
- Canon-debt strings in current ShillZ content need a separate reviewed content PR.
