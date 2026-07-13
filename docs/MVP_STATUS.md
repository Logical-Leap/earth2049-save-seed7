# Earth 2049 Early Access MVP Status

Last audited: 2026-07-13 00:25 EDT  
Baseline commit: `1977324` (`main`, synchronized with `origin/main`)  
Production target: https://earth2049-save-seed7.pages.dev/  
Co-op target: https://earth2049-coop.chandler-fac.workers.dev/

## Executive status

**Estimated MVP completion: 42%.** The repository is a playable combat prototype with five configured districts, five bosses, persistent upgrades, an authored Hub scene, asset fallbacks, and a substantial private co-op foundation. It is **not yet an Early Access MVP**: the Hub is not the campaign shell, the first playable loop does not return through Hub services, saves are not versioned or user-manageable, later districts lack production map contracts, campaign completion is only a victory overlay, co-op acceptance is untested, and automated coverage is one input-safety test.

Do not interpret configured content as acceptance. A row is complete only after its listed automated and browser tests pass.

## Current player flow

Actual shipped flow:

1. Title screen.
2. Player independently chooses **Rebel Haven**, **Start Simulation**, Armory, Briefing, or co-op.
3. Solo simulation starts directly in ShillZ Central.
4. Waves → faction boss → OG augment plus route → next district repeats through Turing.
5. Death banks run GigaTech and opens Death UI; victory banks rewards and opens Victory UI.
6. Player can retry, return to title, or open the Armory from death.

Required MVP flow:

`Hub → mission launch → ShillZ objective/waves → Riya → rewards → Hub → upgrade → second run`, followed by the same stable shell for all districts and the Turing ending.

The gap is structural, not cosmetic: `newRun({hub:true})` builds a non-combat Hub, but the Hub has no live launch/Armory/Briefing interaction loop and death/victory do not return there.

## Milestone status

| Milestone | Status | Evidence / exit gate |
|---|---|---|
| M1 audit and baseline | **In progress** | This document set exists; baseline syntax/tests/manifest/Pages preparation pass. Live browser/performance evidence remains. |
| M2 first playable vertical slice | **Not started** | Must prove Hub → ShillZ → Riya → rewards → Hub → upgrade → second run. |
| Shared runtime stabilization | **Partial** | `World`, game loop, loader and asset registry exist, but Map/Objective/Enemy/Boss/Progression/Save contracts are not isolated or regression-tested. |
| Muskers / Magnus | **Prototype** | Configured procedural district and boss; no authored production map or campaign acceptance test. |
| Bots / SPYD3R | **Prototype** | Four authored scene files are discoverable in the dev manifest but are not selected by `DISTRICTS`. |
| Cryptids / Blitz | **Prototype** | Five authored v2 scene files are discoverable in the dev manifest but are not selected by `DISTRICTS`. |
| GigaCorp / Turing / ending | **Prototype** | Procedural district and Turing boss exist; no Omnidome/Turing Core sequence, narrative ending, or Hub return. |
| Hub services/progression | **Partial** | Authored scene/GLB and separate Armory/Briefing overlays exist; no in-Hub service interaction contract. |
| Turing Director | **Partial** | Runtime threat/taunts/assassin pressure exist; RNG is not seeded, bounded by a test, or exposed in a deterministic overlay. |
| Private 1–4 co-op beta | **Partial / disabled for release until proven** | Lobby, host authority, snapshots, revive and DO limits exist. No automated protocol/DO or two-client acceptance suite. |
| Release polish/acceptance | **Not started** | Requires live campaign, save, fallback, soak, accessibility/input and deployment gates. |

## Feature matrix

| Area | Implemented | Partial or missing | MVP verification |
|---|---|---|---|
| Solo combat | FPS movement, touch controls, weapons, waves, enemies, bosses, pickups | Only look-input has an automated regression test | Syntax + unit tests + browser combat smoke on every district |
| Campaign | Five districts/bosses configured; OG transition between districts | Later maps procedural; no Hub shell; no authored ending/credits/return | Complete beginning-to-ending run without dev commands |
| ShillZ | Authored scene, engagement-square layout, Riya, 3 waves | Objective is generic route mission; no complete Hub round trip | Vertical-slice acceptance test |
| Other districts | Muskers/Bots/Cryptids/GigaCorp configs and bosses | Authored Bots/Cryptids scenes not wired; Muskers/GigaCorp production scenes absent | Per-district map/collision/boss/reward tests |
| Hub | Final scene JSON + GLB + collision metadata; non-combat state | No service markers/interactions, mission launch, post-run return, or upgrade loop | Hub lifecycle browser test |
| Objectives | Five generic mission types and HUD/rewards | No shared ObjectiveSystem or authored-objective marker lifecycle | Unit state-machine tests + scene integration |
| Progression | GigaTech, upgrades, intel, abilities, mastery, relics, tiers, corruption | Logic is embedded in `game.js`; no invariants/migration tests | Deterministic unit tests and two-run browser test |
| Saves | localStorage defaults and additive lazy migration | No schema version, validation, backup, import/export/reset, corruption recovery report | Save fixture matrix and UI acceptance |
| Assets | GLTF/scene loading with procedural fallbacks; central manifests; skybox fallback | Only 3 enemy GLBs + 1 weapon GLB; optional failures lack automated probes | Missing/corrupt asset tests and browser console probes |
| Collision/navigation | Procedural connectivity, editor colliders, spawn filtering, authored ShillZ containment | External-scene nav is coarse open grid; no automated reachability/void/softlock validator | Marker/collider validator + traversal probes |
| Performance | capped enemies (13), particles (700), co-op registries, disposal paths, adaptive quality | No district-transition soak, heap/GPU baseline or draw-call budget | 30-minute/all-district soak and metric capture |
| Solo independence | Solo code path does not require Worker | Must be covered with Worker unavailable | Offline/no-Worker browser test |
| Co-op | private rooms, ready/start, avatars, host simulation, snapshots, pickup claims, reconnect, revive | No release feature flag; transition/reward/host-migration acceptance is unproven | Worker unit tests + two WebSocket clients + browser host |
| Deployment | minimal Pages prep, cache/security headers, Wrangler configs | No automated deployment/live smoke script in repository | prepare → deploy → cache-busted HTTP/browser/API checks |

## Baseline inventories

### Runtime and deployment

- Static no-build Three.js r147 UMD application: `index.html`, `js/`, `lib/`.
- `scripts/prepare-pages-dist.js` copies the runtime to `dist-pages/` and excludes archives.
- Pages config: `wrangler.pages.jsonc`; co-op Worker/DO config: `wrangler.jsonc`.
- Baseline tracked counts: 31 JavaScript files, 15 district scene JSON files, 5 GLBs, 153 PNG/JPG assets, 1 test file.
- Source `assets/` footprint at audit: approximately 350 MiB. Largest tracked authoring archives are not copied to Pages.
- `assets/models/environments/` and `scripts/__pycache__/` were untracked at audit and are excluded from this milestone.

### Map inventory

- Runtime-selected authored scenes: final Rebel Haven Hub and ShillZ Central.
- Dev-manifest-only scenes: four Bots scenes, five Cryptids v2 scenes, and an older Hub v3 scene.
- Procedural runtime districts: Muskers, Bots, Cryptids, GigaCorp.
- Hub visual model: `assets/models/rebel-hub-haven-commons-final/rebel-hub-haven-commons-final.glb`.
- Collision-only Hub scene is present but the active Hub contract uses the final scene JSON referenced by `REBEL_HAVEN_HUB`.

### Asset inventory

- External model bindings: ShillZ common, Musker runner, Cryptid broker, M-52 Revenant AR.
- All other enemies, bosses, weapons and effects retain procedural fallbacks.
- Faction cubemaps exist for ShillZ, Muskers, Bots, Cryptids and GigaCorp; Dead Zone fallback is used for Hub/unmapped contexts.

### Save inventory

Current key: `earth2049_seed7_v1`. Current data grows lazily to include:

- currencies/stats: `gt`, `corruption`, `runs`, `bestD`, `kills`, `wins`;
- progression: `up`, `corruptionUp`, `intel`, `abilities`, `equippedAbilities`, `mastery`, `relics`, `simTier`, `modifiersSeen`, `codex`;
- profile/options: `profile`, `opts`.

There is no `schemaVersion`, migration registry, checksum/validation, backup slot, import/export, or reset UI.

### Co-op inventory

- Protocol v2 UMD clients under `js/net/`.
- Worker routes and `RoomDurableObject` under `workers/`.
- DO caps: 4 players, 160 enemies, 240 pickups; world persistence coalesced around two seconds.
- Host simulates enemies/waves/director; DO validates role-sensitive messages and owns canonical snapshots/claims/revive state.
- Production Pages hostname selects the official Worker ahead of stale localStorage.

## Baseline verification (2026-07-13)

Passed locally:

```text
node --check js/*.js js/net/*.js workers/*.js scripts/*.js tests/*.js
node --test tests/*.test.js
  1 test, 1 pass, 0 fail
npm run scenes:manifest
  Wrote 12 scenes
npm run pages:prepare
  Prepared Cloudflare Pages static runtime in dist-pages
git diff --check
```

Not yet accepted:

- live Pages HTTP/browser smoke;
- live Worker health and room flow;
- full campaign completion;
- Hub round trip;
- save migration/import/export/reset;
- optional asset failure recovery;
- map reachability/void/softlock validation;
- district-transition memory/performance soak;
- two-client co-op run acceptance.

## Current blockers

No credential blocker has been established. Product/code blockers are the missing Hub campaign shell, save contract and automated acceptance harness. Co-op must remain beta/feature-gated until its multi-client matrix passes.

## Next three priorities

1. Build the tested, versioned SaveSystem seam with migration/backup/import/export/reset while preserving `earth2049_seed7_v1` data.
2. Implement and test the Hub mission/service lifecycle, then ship the complete ShillZ vertical slice and post-run Hub upgrade/second-run loop.
3. Add map/objective/runtime validators and browser acceptance automation before wiring later authored district scenes.
