# Cloudflare Deployment

Earth 2049 uses a split Cloudflare setup so static game delivery does **not** burn Worker requests:

- **Cloudflare Pages** serves the static Three.js game, assets, scenes, textures, and GLBs from `dist-pages/`.
- **Cloudflare Worker + Durable Object** runs only the co-op room/WebSocket backend.
- Solo play and static asset delivery do not require the Worker.

Live production instance:

- Static game: `https://earth2049-save-seed7.pages.dev/`
- Co-op backend: `https://earth2049-coop.chandler-fac.workers.dev/`

## Files

- `wrangler.pages.jsonc` — Pages project config (`earth2049-save-seed7`, output `dist-pages`).
- `wrangler.jsonc` — Worker/Durable Object config (`earth2049-coop`).
- `_headers` — Pages/CDN cache and security headers.
- `scripts/prepare-pages-dist.js` — copies only runtime static files into `dist-pages/`.
- `workers/coop-worker.js` — HTTP routes and WebSocket entrypoint.
- `workers/room-durable-object.js` — per-room lobby/session authority.
- `js/net/net-config.js` — frontend Worker URL configuration.

## Why this split

Do **not** deploy the whole game as a Worker. The app is a static no-build Three.js game, and Pages/CDN is the correct serving layer for:

- `index.html`
- `js/`
- `lib/`
- `assets/`
- editor-exported scenes
- GLB/textures/concept art assets

The Worker is only justified for co-op because private rooms need WebSockets and Durable Object instance state.

## Install Wrangler

```bash
npm install
npx wrangler --version
```

Or globally:

```bash
npm install -g wrangler
```

## Deploy static game to Cloudflare Pages

Prepare the minimal static runtime directory, then deploy it to Pages:

```bash
npm run pages:prepare
npx wrangler pages deploy dist-pages --project-name earth2049-save-seed7 --branch main --commit-dirty=true
```

The deploy intentionally uploads only `index.html`, `_headers`, `js/`, `lib/`, `assets/data/`, `assets/models/`, `assets/scenes/`, and `assets/levels/`. It does not upload Worker source, package files, `.git`, docs, concept-art source files, or unreferenced texture studies.

## Local development

Run the Worker locally:

```bash
npx wrangler dev --config wrangler.jsonc --local --port 8787
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

Deploy the co-op backend Worker/Durable Object:

```bash
npx wrangler deploy --config wrangler.jsonc
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
