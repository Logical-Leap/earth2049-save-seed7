# Turing Director contract

Status: **adaptive prototype, not deterministic or acceptance-tested**. Audited at `7653b97` on 2026-07-13.

The Director is encounter pressure logic, distinct from the Turing boss.

## Current behavior

`G.director` is created per run with threat `0.5`, a five-second evaluation timer, a message timer, and recent kill/damage timestamp arrays. `directorTick()` in `js/game.js`:

1. does nothing in Hub;
2. every five seconds keeps a 20-second kill/hurt window;
3. derives kill rate, hurt rate, and player health fraction;
4. smooths and clamps threat to `0.15..1.25`;
5. at threat above `0.85`, during a wave, has a 30% chance to spawn two elite runners;
6. at threat below `0.3` and health below 35%, has a 50% chance to spawn a 25-HP pickup;
7. displays a random taunt every random 18–30 seconds.

Route/corruption setup can temporarily clamp threat as high as `1.6`, while the next five-second Director evaluation clamps it back to `1.25`. Threat also scales wave size, enemy health, elite chance, and ranged fire cadence.

Co-op host snapshots include Director threat; non-hosts receive it. The room seed exists, but Director and route/taunt/spawn decisions use `Math.random()` and do not consume that seed. Authority gating is indirect through host simulation and is not unit-tested.

## Required MVP target contract

A pure `DirectorSystem` consumes a seed plus bounded event summaries and returns rate-limited decisions. It must not touch Three.js, DOM, audio, save data, or spawn entities directly.

```text
input: seed, authority, campaignState, phase, dt,
       hp/maxHp, recentKills, recentDamage, entityBudget, modifiers
output: threat, decision[], nextEvaluationAt, nextMessageAt, diagnostics
```

Required invariants:

- same seed plus same ordered inputs produces identical decisions;
- all numeric input/output is finite and clamped;
- no decisions in Hub, menus, ending, or non-authority clients;
- assassin request count respects remaining enemy budget and cooldown;
- mercy drops, taunts, and pressure events are rate-limited;
- restore/reconnect preserves RNG position and cooldowns;
- immutable diagnostics expose seed, inputs, threat, last decision, and rejection reason;
- Director decisions cannot prevent wave drain or boss progression.

This module and debug overlay do not exist on the baseline.

## Verification

```bash
node --check js/game.js js/net/*.js workers/*.js
npm test
npm run pages:prepare
git diff --check
```

Future tests: identical seed replay; different-seed divergence; NaN/infinite input; threat bounds; entity-budget rejection; cooldown; Hub/non-authority silence; snapshot/restore; 30-minute decision-rate soak.

## Blockers

- Unseeded `Math.random()` is used throughout the Director and adjacent wave/route systems.
- No explicit Director module, decision log, overlay, or tests.
- Current threat bounds are inconsistent between setup/modifier paths and periodic evaluation.
- Co-op room seed is stored but not wired into host gameplay RNG.
