# Earth 2049 Co-op Architecture

Earth 2049 remains a no-build static Three.js game. Co-op is additive: solo play never requires a backend, login, or internet.

## Scope in this pass

Implemented synchronization refinement:

- Local profile identity in `SAVE.profile` (`id`, `name`, `color`).
- Title menu co-op flow: **Host Co-op**, **Join Co-op**, room code lobby, ready state, host start.
- Browser WebSocket client modules under `js/net/`.
- Cloudflare Worker + Durable Object room backend under `workers/`.
- Remote rebel avatars with color accent, nameplate, HP text, interpolation.
- Shared run-start event with room seed/district.
- Host-authoritative enemy simulation with Durable Object validation/canonical registries for enemies, pickups, players, and mission revision.
- Non-host browsers no longer run wave/director/enemy AI RNG; they render authoritative spawn/state/death messages.
- Atomic pickup claims in the Durable Object, reconnecting WebSockets, and full world snapshots on join/reconnect.
- Party-size mission scaling constants in `NET_CONFIG.partyScaling`.
- Personal co-op rewards via `grantReward(playerId, { gt, xp, factionIntel, mastery })` shape.
- Co-op downed state plus hold-E teammate revive (1.8 seconds, server-validated alive/downed states and 3.25m proximity).
- Explicit browser-to-room message allowlisting, host-only mission transitions, all-ready start enforcement, and bounded message traffic.

Not included yet: public matchmaking, accounts, PvP, trading, MMO hub, voice chat, anti-cheat-hardening, or database persistence.

## Authority model

The current pass uses a **host-simulation / Durable-Object-authority model**:

- Durable Object owns room membership, host identity, ready state, room code, run seed, current state, canonical enemy/pickup/player registries, atomic pickup claims, revive validation, message ordering, and reconnect snapshots.
- Host browser remains simulation owner for heavy world logic in the MVP: wave spawning, enemy AI, final enemy HP/death, boss phase, and pickup origin.
- Non-host clients send intents (`PLAYER_STATE`, `HIT`, `PICKUP_COLLECT`, `REVIVE`) and receive host snapshots/events. Boss/objective/district state, enemy/pickup creation, and run start/completion/failure are host-only and are rejected server-side when sent by any other player.
- The message protocol is already shaped so enemy simulation can migrate server-side later without changing UI/lobby flow.

Why: the existing game loop is a local static FPS. Moving all AI/physics server-side in one pass would require a full engine split. This foundation isolates networking in `js/net/*` and keeps solo mode untouched.

## Protocol

`js/net/net-protocol.js` defines protocol version `2` and explicit JSON message types. Client and Worker must be deployed together for this breaking protocol upgrade:

- Lobby: `ROOM_STATE`, `PLAYER_READY`, `START_RUN`, `LEAVE_ROOM`, `ERROR`
- Players: `PLAYER_STATE`, `PLAYER_INPUT`, `SHOOT`, `DOWNED`, `REVIVE`
- Enemies: `ENEMY_SPAWN`, `ENEMY_STATE`, `HIT`, `DAMAGE`, `ENEMY_DEATH`
- Pickups/rewards: `PICKUP_SPAWN`, `PICKUP_COLLECT`, `REWARD_GRANT`
- Run state: `WORLD_SNAPSHOT`, `BOSS_STATE`, `DISTRICT_COMPLETE`, `RUN_COMPLETE`, `RUN_FAILED`
- Health: `PING`, `PONG`

Messages carry `protocolVersion: 2` and are validated on client and room server.

Protocol direction is explicit. The room accepts only `PING`, `PLAYER_READY`, `START_RUN`, `PLAYER_STATE`, `HIT`, `ENEMY_SPAWN`, `ENEMY_STATE`, `ENEMY_DEATH`, `PICKUP_SPAWN`, `PICKUP_COLLECT`, `BOSS_STATE`, `OBJECTIVE_STATE`, `DISTRICT_COMPLETE`, `RUN_COMPLETE`, `RUN_FAILED`, and `REVIVE` from browsers. Server event names such as `ROOM_STATE`, `WORLD_SNAPSHOT`, `PONG`, `ERROR`, and especially `REWARD_GRANT` are never accepted from a client. There is no catch-all rebroadcast path. `NetClient.send` enforces the same direction allowlist as defense in depth.

## Client modules

| File | Purpose |
|---|---|
| `js/net/net-config.js` | Worker URL, snapshot rates, party scaling, mentor sync config. |
| `js/net/net-protocol.js` | Message constants, versioning, validation helpers. |
| `js/net/net-client.js` | Fetch/WebSocket wrapper for room creation/joining. |
| `js/net/net-interpolation.js` | Snapshot buffer and interpolation helpers. |
| `js/net/net-room.js` | Runtime bridge between the local game loop and network messages. |

## Lobby flow

1. Host clicks **Host Co-op**.
2. Client POSTs `/rooms` to the Worker.
3. Worker creates a Durable Object room and returns a private code.
4. Other players click **Join Co-op**, enter Worker URL and room code.
5. Durable Object broadcasts `ROOM_STATE` with players and ready state.
6. Every connected player, including the host, marks themselves ready; the host clicks **Start Co-op Run**.
7. Durable Object verifies host authority, lobby state, and that every connected player is ready, then broadcasts `START_RUN` with bounded seed/district/tier values. Clients begin loading only after this accepted server event; the host no longer starts optimistically.
8. Every client loads the same district and begins sending `PLAYER_STATE` snapshots.

## Movement sync

- Local player snapshots are sent at `NET_CONFIG.snapshotHz` (default 15 Hz).
- Remote avatars are simple low-poly rebels created client-side.
- Nameplate/HP display follows projected world position.
- Snapshot interpolation delays remote movement slightly to avoid jitter.

## Enemy/damage/pickup MVP

- Host assigns `netId` to spawned enemies and pickups.
- Host sends `ENEMY_SPAWN` and periodic `ENEMY_STATE` snapshots.
- Non-host hit events send `HIT` to the room. Host applies final damage and rebroadcasts state/death.
- Pickup collections use `PICKUP_COLLECT`; GigaTech/progression rewards are personal, not stolen from the squad.

## Personal progression rule

Co-op never reduces rewards. Each player keeps their own local save and receives personal reward credit for participation. Mission resources should follow this rule:

```js
grantReward(playerId, {
  gt: 100,
  xp: 50,
  factionIntel: { shillz: 10 },
  mastery: { ar: 20 }
});
```

Health/ammo pickups can remain shared tactical resources. GigaTech, intel, mastery, boss credit, and completion rewards should be personal.

## Scaling and mentor sync

Current party-size placeholders:

| Party | Enemy HP | Enemy count |
|---:|---:|---:|
| 1 | 100% | 100% |
| 2 | 145% | 125% |
| 3 | 185% | 145% |
| 4 | 225% | 165% |

Do **not** use per-player enemy HP. The mission has one authoritative enemy HP pool.

Mentor-sync direction: if a high-level player joins lower-level content, clamp effective combat stats near mission level while preserving build options, mastery choices, and tactical flexibility.

## Downed/revive

In co-op, lethal damage enters `downed`. An alive teammate within 3.25m holds E (or the mobile interact button) for 1.8 seconds. The Durable Object validates the latest authoritative player states, distance, and hold duration, then broadcasts the revive. If every connected operative is down or dead, the room broadcasts a full-team wipe and ends the run.

- Solo can retain the current death flow.
- Co-op should use Alive → Downed → Dead.
- Full wipe ends the run only when all players are down/dead.

## Security baseline

MVP checks:

- Room membership required for WebSocket events.
- Non-host cannot start or complete/fail a run, mutate boss/objective/district state, create pickups, or mutate authoritative enemy state.
- A run starts only from the lobby and only when every connected player (host included) is ready. Start replay and transition attempts outside an active run are rejected.
- Room max is 4.
- Message protocol version/type validation plus an explicit client-message allowlist; unknown, unhandled, and server-origin message types are rejected and never relayed.
- `REWARD_GRANT` is server-origin-only. Both `NetClient.send` and the Durable Object reject attempts to send it from a browser, preventing forged grants from reaching another client's local reward handler.
- WebSocket JSON messages are limited to 64 KiB and 120 messages per player per rolling one-second window. Existing canonical registry bounds remain 160 enemies and 240 pickups; relayed transition/boss/pickup fields are sanitized and length/value bounded.

## Cost / traffic notes

- Player state: 15 Hz per client. Enemy snapshots: 5 Hz from one host only. At four players and a typical 20-enemy wave this is roughly 60 player messages/sec into the room plus 5 larger enemy messages/sec; fan-out is three WebSocket sends per host snapshot.
- WebSocket messages are handled inside one Durable Object request lifetime; they do not create new public Worker fetches per frame, but DO duration and WebSocket message billing still apply according to the account plan.
- Canonical world storage is coalesced to at most one SQLite write per ~2 seconds during active updates, while lobby/start/disconnect/revive are persisted immediately. This avoids a storage write per 5 Hz snapshot.
- Snapshots are full-state only on connect/reconnect. Regular updates remain bounded (`160` enemies, `240` pickups, four players).
- Biggest remaining bandwidth lever: binary/delta enemy snapshots or adaptive 2–5 Hz snapshots based on motion. Biggest correctness follow-up: server-side hit geometry and damage validation.
