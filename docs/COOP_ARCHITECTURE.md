# Earth 2049 Co-op Architecture

Earth 2049 remains a no-build static Three.js game. Co-op is additive: solo play never requires a backend, login, or internet.

## Scope in this pass

Implemented foundation:

- Local profile identity in `SAVE.profile` (`id`, `name`, `color`).
- Title menu co-op flow: **Host Co-op**, **Join Co-op**, room code lobby, ready state, host start.
- Browser WebSocket client modules under `js/net/`.
- Cloudflare Worker + Durable Object room backend under `workers/`.
- Remote rebel avatars with color accent, nameplate, HP text, interpolation.
- Shared run-start event with room seed/district.
- Host-authoritative MVP hooks for enemy spawn/state, hit forwarding, pickup collection, and personal reward grants.
- Party-size mission scaling constants in `NET_CONFIG.partyScaling`.
- Personal co-op rewards via `grantReward(playerId, { gt, xp, factionIntel, mastery })` shape.
- Co-op downed state: lethal damage sets the local operative to `downed` with a bleed timer instead of immediate solo death; full team wipe/server-side revive resolution is the next authority upgrade.

Not included yet: public matchmaking, accounts, PvP, trading, MMO hub, voice chat, anti-cheat-hardening, or database persistence.

## Authority model

The current pass uses a **hybrid host-authoritative model behind a room-authority protocol**:

- Durable Object owns room membership, host identity, ready state, room code, run seed, current state, message ordering, and validation.
- Host browser remains simulation owner for heavy world logic in the MVP: wave spawning, enemy AI, final enemy HP/death, boss phase, and pickup origin.
- Non-host clients send intents/events (`PLAYER_STATE`, `HIT`, `PICKUP_COLLECT`) and receive host snapshots/events.
- The message protocol is already shaped so enemy simulation can migrate server-side later without changing UI/lobby flow.

Why: the existing game loop is a local static FPS. Moving all AI/physics server-side in one pass would require a full engine split. This foundation isolates networking in `js/net/*` and keeps solo mode untouched.

## Protocol

`js/net/net-protocol.js` defines protocol version `1` and explicit JSON message types:

- Lobby: `ROOM_STATE`, `PLAYER_READY`, `START_RUN`, `LEAVE_ROOM`, `ERROR`
- Players: `PLAYER_STATE`, `PLAYER_INPUT`, `SHOOT`, `DOWNED`, `REVIVE`
- Enemies: `ENEMY_SPAWN`, `ENEMY_STATE`, `HIT`, `DAMAGE`, `ENEMY_DEATH`
- Pickups/rewards: `PICKUP_SPAWN`, `PICKUP_COLLECT`, `REWARD_GRANT`
- Run state: `BOSS_STATE`, `DISTRICT_COMPLETE`, `RUN_COMPLETE`, `RUN_FAILED`
- Health: `PING`, `PONG`

Messages carry `protocolVersion: 1` and are validated on client and room server.

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
6. Host clicks **Start Co-op Run**.
7. Durable Object broadcasts `START_RUN` with seed/district/tier.
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

## Downed/revive direction

The protocol reserves `DOWNED` and `REVIVE`. The current client implements the first gameplay seam: in co-op, lethal damage enters `downed` with a bleed-out timer instead of instant solo death. Full teammate hold-to-revive and room-wide wipe adjudication are follow-up authority work. Target behavior:

- Solo can retain the current death flow.
- Co-op should use Alive → Downed → Dead.
- Full wipe ends the run only when all players are down/dead.

## Security baseline

MVP checks:

- Room membership required for WebSocket events.
- Non-host cannot start the run.
- Room max is 4.
- Message protocol version/type validation.
- Clients cannot directly award arbitrary local rewards through the Worker.

Future server-authoritative work should move enemy simulation, damage validation, reward finalization, and reconnect snapshots into the Durable Object.
