# Cloudflare Co-op Backend Deployment

Earth 2049 co-op uses a Cloudflare Worker with Durable Objects. The static game can still be hosted on GitHub Pages or opened locally for solo play.

## Files

- `wrangler.jsonc` — Worker/Durable Object config.
- `workers/coop-worker.js` — HTTP routes and WebSocket entrypoint.
- `workers/room-durable-object.js` — per-room lobby/session authority.
- `js/net/net-config.js` — frontend Worker URL configuration.

## Install Wrangler

```bash
npm install
npx wrangler --version
```

Or globally:

```bash
npm install -g wrangler
```

## Local development

Run the Worker locally:

```bash
npx wrangler dev --local --port 8787
```

Run the static game in another terminal:

```bash
npx --yes serve -l 8049 .
```

Open two tabs:

```text
http://127.0.0.1:8049/?coopWorker=http://127.0.0.1:8787
```

Flow:

1. Tab A: Host Co-op.
2. Copy room code.
3. Tab B: Join Co-op with the same Worker URL and room code.
4. Toggle ready state.
5. Host starts run.
6. Both tabs load the same mission and see remote avatar movement.

## Deploy

Login:

```bash
npx wrangler login
```

Deploy:

```bash
npx wrangler deploy
```

Wrangler prints a Worker URL like:

```text
https://earth2049-coop.<account>.workers.dev
```

Use that value in the game co-op screen's Worker URL field, or pass it as a query parameter:

```text
https://logical-leap.github.io/earth2049-save-seed7/?coopWorker=https://earth2049-coop.<account>.workers.dev
```

The game stores the Worker URL in localStorage after you enter it once.

## Durable Object notes

Each private room code maps to one Durable Object instance via `idFromName(roomCode)`. That object stores:

- room code
- player list
- host player id
- ready state
- current room/run state
- seed/district/wave/phase

The Worker keeps WebSocket sessions in memory for active connected clients and persists room metadata to Durable Object storage.

## Plan/cost caveats

Durable Object WebSockets require a Cloudflare plan/features that support Durable Objects. Watch:

- active WebSocket count
- Durable Object request count
- CPU duration
- storage operations
- reconnect churn

This MVP is designed for private 1-4 player rooms, not public matchmaking or large MMO hubs.

## Production URL policy

Do not hardcode production URLs in source. Configure through:

- Co-op menu Worker URL field
- `?coopWorker=<url>` query parameter
- localStorage key `e2049.coop.workerUrl`

## Smoke checks

```bash
curl https://<worker-url>/health
```

Expected:

```json
{"ok":true,"service":"earth2049-coop","durableObjects":true}
```

Room creation:

```bash
curl -s -X POST https://<worker-url>/rooms   -H 'content-type: application/json'   -d '{"player":{"id":"test","name":"Tester","color":"#9b59ff","effectiveLevel":1}}'
```

Expected:

```json
{"roomCode":"ABCDE"}
```
