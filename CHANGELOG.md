# Changelog

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
