# Changelog

## 2026-07-13 — Co-op protocol authorization hardening

- Replaced the Durable Object's catch-all client rebroadcast with an explicit browser-message allowlist and rejection of unknown, unhandled, and server-origin event types.
- Made `REWARD_GRANT` server-origin-only at both the browser send boundary and room server, closing forged local reward delivery through the room.
- Enforced host authority for boss/objective/district and run transition/completion/failure messages, with active-run/lobby state guards and sanitized transition payloads.
- Enforced all-connected-player ready state before server-approved run start and removed the host's optimistic local start path.
- Added 64 KiB message and 120 messages/second/player limits plus executable Node security regressions for authorization, reward forgery, ready gates, transition replay, payload sanitization, and traffic bounds.

## 2026-07-13 — Required MVP system documentation

- Published current-versus-target contracts for map authoring, assets, enemies, bosses, objectives, the Turing Director, schema-v2 saves, performance budgets, and release QA.
- Added reproducible verification commands and explicit blockers without presenting unimplemented modules, browser acceptance, deterministic simulation, performance targets, or campaign lifecycle as complete.
- Established authoritative ShillZ documentation canon: willing pro-GigaCorp consumer loyalists rather than rebels/counterfeit resistance, with Riya as a pro-authority GigaCorp propagandist; conflicting legacy strings remain tracked content debt.
- Updated the MVP status document to reference the complete documentation set and the merged save baseline; no runtime or user assets changed.

## 2026-07-13 — Hub-to-ShillZ vertical campaign loop

- Turned Rebel Haven's authored mission, workshop, vendor, stash, medical, training, commander, and scout markers into usable proximity interactions for deployment, Armory, Briefing, healing, and training feedback.
- Replaced the 10-object ShillZ sample with a deterministic 104-object Engagement Square containing sealed boundaries, three routes, elevated traversal, 20 cover islands, 12 enemy spawns, 8 pickups, a world objective, Riya arena, extraction, commercial infrastructure, and canon-correct pro-GigaCorp loyalty propaganda.
- Wired authored objective and extraction markers into runtime interaction: disable the loyalty broadcast, clear waves and Riya, extract to Rebel Haven, bank rewards, purchase a permanent upgrade, and deploy into a stronger second run.
- Added persistent, idempotent leader-defeat credit for every faction through the shared `CampaignProgression` seam and regression coverage for the Hub/ShillZ contracts.

## 2026-07-13 — Versioned save recovery and portability

- Added schema-v2 save defaults, ordered/idempotent migration, validation and bounded normalization while preserving the existing `earth2049_seed7_v1` storage key and recognized/unknown legacy fields.
- Added mandatory verified backups before recovery/import/reset can replace primary data, invalid-save recovery, exact raw export for future-version saves, current-schema normalization backup, graceful storage-failure behavior, and validated JSON export/import/reset APIs.
- Bounded catalog-controlled upgrades, corruption upgrades, relics, modifiers, mastery, abilities, intel, options, and scalar counters so malformed saves cannot inject non-finite gameplay state.
- Added an Armory **Save** tab for status, export, import, and confirmed reset, plus Node and browser-integration regression coverage.

## 2026-07-13 — Early Access MVP baseline

- Added a truthful Early Access baseline covering current player flow, completion estimate, feature matrix, map/asset/save/co-op/deployment/performance inventories, verification evidence, blockers, and next priorities.
- Added the focused milestone/task graph and exact acceptance tests for the Hub-to-ShillZ vertical slice, shared runtime seams, five-district campaign, deterministic Turing Director, private co-op beta, and production release.
- Documented the current and target no-build architecture plus prioritized MVP blockers/risks; no gameplay or user assets changed in this documentation milestone.

## 2026-07-13 — Camera look reset fix

- Bounded pointer-lock and touch look deltas so OS/browser input spikes during fast turns cannot snap the camera or abruptly redirect held movement.
- Normalized accumulated yaw and cleared queued look input across pointer-lock and pause transitions.
- Added regression coverage for extreme and non-finite look input.

## 2026-07-13 — Faction skyboxes across every district

- Added a centralized, cached faction skybox registry for ShillZ, Muskers, GigaCorp, Bots, Cryptids, and the Rebel/Dead Zone Hub.
- Added metadata/file/config faction detection, automatic start-to-objective yaw, explicit `skyboxFaction` and `skyboxYawDegrees` overrides, safe loading colors, faction fog, and r147-compatible cached cubemap rotation.
- Kept skyboxes visual-only (`scene.environment = null`) and preserved gameplay geometry, collision, spawns, objectives, and extraction metadata.
- Added automated cubemap/scene validation and a complete mapping report in `docs/faction-skybox-integration.md`.

## 2026-07-12 — Rebel Haven Hub runtime integration and production visual correction

- Added a dedicated **Enter Rebel Haven Hub** title-screen path, separate from ShillZ Central and all combat districts.
- Added a Blender-authored 599-mesh production visual scene with beveled architecture, structural ribs, windows, signs, ducts, antennas, cables, landmark framing, and embedded Hub PBR textures.
- Kept the authoritative Hub V3 Object JSON active for all gameplay metadata, interaction markers, collision, stairs, bridge, balcony, catwalk, and Command Overlook routes.
- Prevented generic faction textures, combat waves, Turing director messages, and weapon firing inside the `hubLobby` safe zone.
- Corrected Blender/Three.js axis conversion and expanded Hub movement beyond the combat grid while retaining authored prop collision.
- Fixed Hub texture flickering/z-fighting by parsing metadata first and then keeping all 430 duplicate Object JSON blockout meshes hidden whenever the production GLB is active.
- Removed the second remaining z-fighting path: the generic 300×300 district ground plane was exactly coplanar with the Hub floor. Hub builds now omit that plane, and Blender export excludes 30 invisible arena-wall/soft-lock collision volumes from the rendered GLB.
- Added Chandler's attached six-face **Earth 2049 Dead Zone Overlook** cubemap as the Rebel Haven-only skybox, with sRGB loading, procedural fallback, disposal on world rebuild, and cache-busted assets. Combat districts retain their existing procedural skies.

## 2026-07-12 — Rebel Hub: Haven Commons production package

- Added the production Haven Commons Object JSON while preserving every authoritative Hub V3 gameplay object, transform, name, and `userData` value.
- Added 221 modular settlement-art meshes spanning the arrival yard, Commons, market, workshop, customization/stash, training garden, memorial, Command Overlook, bridge, balcony, and catwalk.
- Embedded the supplied PBR material library with correct sRGB/linear map treatment and reusable texture bindings.
- Added a consolidated Blender-exported GLB, collision-only scene, asset manifest, performance/validation reports, build/export/validation scripts, and complete distributable ZIP.
- Registered the final scene in the generated scene manifest and validated stock Three.js `ObjectLoader` parsing, texture HTTP resolution, metadata, gameplay markers, collision references, and elevated routes.

## 2026-07-10 — Co-op synchronization and revives

- Made the host the sole authority for enemy AI, waves, projectiles, spawn RNG, enemy health/death, and pickup creation.
- Added ordered shared-world snapshots with enemies, pickups, wave phase, pending spawns, and director threat for reconnects and host migration.
- Added buffered interpolation for remote players and enemies to reduce snapping and visual disagreement.
- Added automatic WebSocket reconnect with authoritative room/world resynchronization.
- Added teammate revives: hold **E** or the mobile interact button near a downed teammate for 1.8 seconds.
- Added server validation for revive state, range, and hold duration.
- Added host migration when the current authority is downed or disconnected.
- Prevented non-host clients from independently generating enemy deaths, drops, waves, and director events.
- Changed co-op pause to a local menu: the shared AI, world clock, and network synchronization continue while the paused operative's controls are neutralized.
- Added an always-visible nearby teammate revive prompt with hold progress, countdown, target name, and mobile **REVIVE** button state.
- Made revive requests retry safely while the player keeps holding the interaction key and clear only after the server confirms or rejects the request.
