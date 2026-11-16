# Accounts and cloud saves

One Earth 2049 account holds every save of both titles and follows the player to any device. Playing without an
account keeps working exactly as before: the game always saves on the device first.

| Slot | Game | Saved by |
|---|---|---|
| `fps` | Earth 2049: Save Seed 7 | this repo, `js/game.js` → `initCloudSave()` |
| `grid` | the idle game inside Save Seed 7 (the city grid) | `idle/index.html` when opened with `?host=ss7` |
| `idle` | Earth 2049 Idle, standalone | the idle repo's `index.html` |

The FPS and its city grid share one origin, so signing in once covers both. The standalone idle game signs in on its
own origin to the same account.

## Pieces

| Piece | Where |
|---|---|
| API | `workers/account-api.js`, mounted at `/api` on the `earth2049-coop` Worker (`https://earth2049-coop.chandler-fac.workers.dev/api`). Deploys with the Worker when main changes. |
| Database | Cloudflare D1 `earth2049-accounts` (`06b5b9b3-2ea1-489a-b007-b593cad5351f`), schema in `migrations/`. New migrations: `npx wrangler d1 migrations apply DB --remote`. |
| Client | `js/cloud-save.js` (`CloudSave`). The idle repo carries an exact copy between its CLOUD SAVE markers: after changing it here, run `node store/scripts/sync-cloud-save.mjs ../earth2049-save-seed7` in the idle repo, then `node scripts/sync-idle.js ../earth2049-idle-real` here. `tests/accounts-client.test.js` fails if the copies drift. |
| Where players find it | FPS: title menu **Cloud Save**, and the Armory's Save tab. Idle and city grid: the Save tab's **Cloud Save** card. |

## How sync works

- The game saves locally as always. Signed in, it checks the cloud on start, uploads when the save changed (every
  3 minutes, on demand, and when the page is hidden), and loads a newer cloud save only at a menu, never mid-run.
- Every upload names the cloud revision it was based on. If another device saved in between, the server refuses
  (409) and the player sees both saves side by side: **Keep this device**, **Use the cloud save** or **Decide later**.
- A new device with no progress takes the cloud save without asking.
- The last 10 versions of each slot are kept; **Previous versions** restores any of them.
- **Download my data** exports the account and every save; **Delete account** removes the account, its sign-ins,
  sessions and every cloud save at once (saves on devices stay).

## Security

- Sign-in is by a 6-digit code sent to the player's email: no passwords. Codes are stored hashed, expire after
  10 minutes and burn after 5 wrong tries. Code emails are limited to 5 an hour per address and 30 an hour per IP.
- Sessions are random 256-bit bearer tokens; the database stores only their SHA-256. They last 90 days, extended by use.
- Saves must be JSON, at most 64 KB; uploads are limited to 30 a minute per account. Save metadata keeps only short
  numbers and strings.
- CORS allows only the game's origins (GitHub Pages, Cloudflare Pages, the idle game's Vercel deployments, localhost).
- Saves are player-owned and could be edited by a determined player. That is fine for single-player; anything shared
  between players later (leaderboards) must be checked on the server separately.

## Switching sign-in on

**Email (waiting on a game domain).** Until it is set up, the API reports `mail: false` and the Cloud Save screen says
cloud saves are coming soon. To switch it on:

1. Onboard the domain to Cloudflare Email Sending (`npx wrangler email sending enable <domain>`), which adds its DNS records.
2. In `wrangler.jsonc` add `"send_email": [{ "name": "EMAIL" }]` and `"vars": { "MAIL_FROM": "signin@<domain>" }`.
3. Merge. `GET /api/health` then reports `mail: true`.

**Steam (Phase 3).** Set the Worker secrets `STEAM_WEB_API_KEY` (a Steamworks publisher Web API key) and
`STEAM_APP_ID`. `POST /api/auth/steam {ticket}` takes a ticket from `ISteamUser::GetAuthTicketForWebApi("earth2049-api")`.
The desktop build's Steam bridge does not send tickets yet; that is the Phase 3 client work, and `file://` desktop
pages will need the API to accept the desktop app's origin.

## API

| Call | Purpose |
|---|---|
| `GET /api/health` | `{ ok, mail, steam }` |
| `POST /api/auth/email/start {email}` | send a code |
| `POST /api/auth/email/verify {email, code}` | sign in (or, with a session, add this email to the account) → `{ token, account }` |
| `POST /api/auth/steam {ticket}` | sign in or link with Steam |
| `GET /api/me` · `POST /api/auth/logout` | the account · end this session |
| `GET /api/saves` | every slot's revision, time, device and metadata |
| `GET /api/saves/{slot}` · `PUT /api/saves/{slot} {baseRev, data, meta, force?}` | read · write (409 on a stale `baseRev`) |
| `GET /api/saves/{slot}/history[/{rev}]` | previous versions |
| `GET /api/account/export` · `DELETE /api/account` | everything · delete everything |

## Tests

- `npm test` includes `tests/accounts-client.test.js` (sync decisions, the idle copy).
- `npm run test:accounts` runs the API against a local D1 with `wrangler dev` (`wrangler.test.jsonc`, which echoes
  codes back so no mail is sent).
- `node scripts/qa/cloud-save-e2e.mjs` plays it in Chromium: two devices on one account, a conflict, the city grid's
  slot, the standalone idle game, and deleting the account.

## Cost

D1's free tier covers about 100,000 row writes a day; one upload is about 4 row writes, and a player uploads at most
once every 3 minutes while something changes. Measured saves are 3–4 KB, so storage is not a concern.
