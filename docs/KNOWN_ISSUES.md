# Earth 2049 MVP Known Issues and Risks

Last audited: 2026-07-13 against `1977324`.

Severity: **P0** blocks MVP/release, **P1** high risk or acceptance gap, **P2** polish/deferred hardening.

## P0 — MVP blockers

### MVP-001 — Hub is not the campaign lifecycle shell

Evidence: `newRun({hub:true})` loads the final Hub in a non-combat run state, while title buttons independently launch Hub or simulation. Death/victory route to overlays/title/retry/Armory, not a stable Hub return.

Impact: required Hub → mission → rewards → Hub → upgrade → second-run loop does not exist.

Fix/verification: implement CampaignRuntime/Hub service interactions and the M2 vertical-slice acceptance test.

### MVP-002 — Save format is unversioned and not user-manageable

Evidence: `loadSave()` performs inline lazy defaults under key `earth2049_seed7_v1`; no internal schema version, migration registry, validation backup, import/export or reset UI exists.

Impact: changes can silently mutate or lose Early Access progression; users cannot recover or transfer saves.

Fix/verification: SaveSystem fixture matrix and export→reset→import browser acceptance.

### MVP-003 — Complete campaign acceptance is unproven

Evidence: five districts and bosses are configured and the final Turing kill opens a victory overlay, but there is no automated campaign test, production ending sequence, or return Hub. Later districts are procedural despite authored Bots/Cryptids scenes in the dev manifest.

Impact: configured content may contain softlocks, unreachable spawns, duplicate rewards or broken transitions.

Fix/verification: per-district contract tests and one full production campaign run.

### MVP-004 — Automated coverage is insufficient

Evidence: only `tests/input-safety.test.js` exists; baseline reports one passing test.

Impact: save, progression, objectives, bosses, map transitions, fallback behavior, co-op authority and deployment can regress undetected.

Fix/verification: add unit/validator/browser/co-op layers from `MVP_PLAN.md` before release claims.

## P1 — High risk

### MVP-005 — Authored scene presence is confused with runtime readiness

`scene-manifest.json` lists four Bots and five Cryptids scenes, but `DISTRICTS` does not select them. Muskers and GigaCorp have no selected authored production scenes. The manifest is a development inventory, not a campaign sequence.

Risk: accidental wiring without marker/reachability/collision validation creates visual-only or softlocked maps.

### MVP-006 — External-scene enemy navigation is a coarse open grid

When an editor scene loads, `World.build()` uses `genOpenLayout()`. Player collision considers authored props, but enemy flow remains grid-only and does not model those colliders.

Risk: enemies can push through, route around incorrectly, or stall against authored geometry.

### MVP-007 — No map contract validator

Marker parsing and spawn filtering exist, but no CI validator proves player start, objective, enemy spawn, boss arena, extraction, containment or reachability for each primary/fallback map.

Risk: void escapes, behind-wall spawns and softlocks can ship.

### MVP-008 — Hub collision relies on authored colliders without lifecycle tests

Hub disables grid collision and uses `playerPropHits`; this is intentional, but no automated probe checks spawn safety, boundary containment, service reachability or absence of coplanar scene layers.

### MVP-009 — Co-op is visible before release acceptance

Title UI exposes host/join and the production hostname resolves an official Worker. There is no explicit Early Access feature flag or automated protocol/DO/two-client suite.

Risk: users can enter a beta path that has not proven district transitions, boss completion, host migration or exactly-once rewards.

### MVP-010 — Room seed is not proven to seed gameplay RNG

Co-op creates/broadcasts a seed, but combat/map/director logic still uses `Math.random()` widely.

Risk: host reconnect/migration cannot reproduce deterministic state; clients rely entirely on snapshots.

### MVP-011 — Co-op host migration is incomplete at simulation level

The DO reassigns host identity when a host disconnects, but no acceptance test proves the new browser assumes enemy/wave/director authority using the canonical snapshot.

### MVP-012 — Co-op campaign messages are not integrated end-to-end

Protocol/DO support district/run complete/failed messages, while the browser bridge mainly covers run start, entities, pickup, revive, snapshots and failed run. District objective/boss/reward transitions are not acceptance-tested as one flow.

### MVP-013 — Personal reward exactly-once semantics are not durable

Local reward grants persist immediately but have no transaction ID ledger. Reconnect/replayed completion events could duplicate credit.

### MVP-014 — Production/live checks are manual

Pages preparation and Wrangler commands exist, but there is no repository script that validates output allowlist/size, deploys, and executes cache-busted Pages + Worker API/WebSocket + browser smoke.

### MVP-015 — No measured transition/soak budget

The code has entity caps, pooling, disposal and adaptive quality, but there is no recorded renderer/heap/entity baseline across repeated district/Hub transitions or a long campaign.

### MVP-016 — Save/storage failures are swallowed silently

`persist()` catches localStorage errors and does nothing. A quota/privacy failure is invisible to the player.

Risk: users believe progression saved when it did not.

### MVP-017 — Existing implementation plan is stale

`docs/earth2049-implementation-plan.md` describes earlier missing systems that are now partially present and references an old commit/branch. Treat `MVP_PLAN.md` and `MVP_STATUS.md` as current authority; archive or refresh the old plan in a later docs cleanup.

## P2 — Polish and deferred hardening

### MVP-018 — Runtime source footprint is large

Tracked `assets/` is approximately 350 MiB and includes large authoring archives. Pages preparation excludes archives, but runtime texture/model weight and first-load timing have not been measured and budgeted.

### MVP-019 — Security headers are a baseline, not a full policy

`_headers` sets nosniff, referrer and permissions policies but no Content-Security-Policy. A strict CSP must account for current inline styles/scripts before enabling it.

### MVP-020 — Renderer resource ownership is implicit

World disposal traverses geometries/materials/textures and some FX dispose explicitly, but shared/cached texture ownership relies on `__keep` conventions and has no regression metrics.

### MVP-021 — Dev manifest timestamp changes on regeneration

`npm run scenes:manifest` writes `generatedAt`; avoid committing timestamp-only drift unless scene inventory changed or deterministic generation is introduced.

### MVP-022 — Mobile parity is explicitly deferred

Mobile controls exist, but full mobile performance/control parity is outside this MVP. Release still requires a basic touch smoke so desktop changes do not make mobile unplayable.

## Deferred by scope

Do not pull these into MVP unless required to fix a blocker:

- MMO/open world or public matchmaking;
- PvP, trading, accounts, voice chat;
- server-authoritative full physics/AI rewrite;
- framework/bundler migration;
- complete mobile parity;
- faction diplomacy/public social Hub.

## Risk-handling rules

- Missing optional asset: warn once, use fallback, continue campaign.
- Invalid save: preserve raw backup, show recovery state, boot safe defaults.
- Worker unavailable: disable co-op action with explanation; keep solo/Hub available.
- Invalid primary map: fail validation in CI and keep prior/fallback runtime mapping.
- Performance budget miss: reduce authored/runtime cost or quality tier; do not hide the result.
- Unverified feature: mark partial/disabled in `MVP_STATUS.md`; never claim complete.
