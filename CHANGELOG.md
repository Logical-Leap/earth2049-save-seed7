# Changelog

## 2026-07-12 — Real Rebel Haven Hub runtime and Blender art pass

- Added a dedicated **Enter Rebel Haven Hub** title-screen path, separate from ShillZ Central and all combat districts.
- Added a Blender-authored 599-mesh production visual scene with beveled architecture, structural ribs, windows, signs, ducts, antennas, cables, landmark framing, and embedded Hub PBR textures.
- Kept the authoritative Hub V3 Object JSON active for all gameplay metadata, interaction markers, collision, stairs, bridge, balcony, catwalk, and Command Overlook routes.
- Prevented generic faction textures, combat waves, Turing director messages, and weapon firing inside the `hubLobby` safe zone.
- Corrected Blender/Three.js axis conversion and expanded Hub movement beyond the combat grid while retaining authored prop collision.
- Fixed Hub texture flickering/z-fighting by parsing metadata first and then keeping all 430 duplicate Object JSON blockout meshes hidden whenever the production GLB is active.
- Removed the second remaining z-fighting path: the generic 300×300 district ground plane was exactly coplanar with the Hub floor. Hub builds now omit that plane, and Blender export excludes 30 invisible arena-wall/soft-lock collision volumes from the rendered GLB.

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
