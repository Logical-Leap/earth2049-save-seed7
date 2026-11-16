# The City Grid: the idle game inside Save Seed 7

The idle game (Logical-Leap/earth2049-idle-real) runs inside the FPS as **the city grid**. You open it from the
**Purple Team Ops** room in Rebel Haven: talk to the Commander, or to any holo leader at the holotable, and pick
**Open the city grid** or **Mission board**.

The two halves trade **options, never raw power**, and only through **milestones**. Offline idle hours never become
FPS power, and FPS hours never become idle production.

## Pieces

| Piece | Where |
|---|---|
| Idle game, embedded mode | `idle/index.html`, synced from the idle repo by `node scripts/sync-idle.js ../earth2049-idle-real` (commit in `idle/SOURCE.json`). Opened with `?host=ss7`. |
| Bridge, board, overlays | `js/field-ops.js` (`FieldOps`) |
| Arena hooks | `js/arena/arena-mission.js` (`M.op`: tier floor, free rerolls, ally drone, intel markers, no-boss district ops, report on finish) |
| Save | `SAVE.idle = { sum, at, outbox, seq }`, normalized in `js/save-system.js` |
| Tests | `tests/field-ops.test.js`; idle side: `store/scripts/qa/linktest.mjs` and `fieldbot.mjs` in the idle repo |

The embedded idle game keeps its **own save slot** (`e2049_ss7_idle_v1`) and tab-owner key, so it never touches a
standalone idle save in the same browser. The standalone idle game is unchanged; none of this exists without `?host=ss7`.

## Protocol (postMessage, same origin)

| Direction | Message | Meaning |
|---|---|---|
| grid → FPS | `ready {data}` | Booted. Carries the first summary. |
| FPS → grid | `hello {gt, outbox}` | GigaTech balance and every field report waiting. |
| grid → FPS | `consumed {ids}` | Reports applied (each once, by id). The FPS drops them. |
| grid → FPS | `state {data}` | Summary every 2 s: loop, shards, Truth, Suspicion, 15 districts (owner, held, front, adjacency), live raid, standings, sovereign allies, factions willing to talk, this loop's field results. |
| grid → FPS | `spend {id, amt, what}` / FPS → grid `spent {id, ok, gt}` | GigaTech lives in the FPS save. The grid only asks. |
| FPS → grid | `close` / grid → FPS `closed` | Save, then the frame is removed. BACK TO HAVEN in the grid sends `leave`. |

The FPS keeps the last summary, so the board and mission support work with the grid closed.

## Idle → FPS (read at deploy)

| Support | Rule | Cap |
|---|---|---|
| Requisition | Starting gun at least UNCOMMON from 10 Memory Shards, RARE from 60 | RARE. Epic and above only drop in the field. |
| Sponsor rerolls | Free rerolls = loops completed | 2 per mission |
| Ally call-in | A sovereign ally that holds the target district or borders it sends a gunship drone for 45 s, the first time HP drops under 40% or when the hype storm starts | 1 per mission |
| Intel | Truth 25: elites marked. Truth 60: relay sites marked before they go up | Information only |
| Mission list | Front-line districts you can take (never an ally's, never the HQ), the live raid, every leader | |
| Heat | Suspicion 40: +1 heat. 75: +2. Harder fights, better drops | +2 |

## FPS → idle (applied the next time the grid opens)

| Report | Effect | Limit |
|---|---|---|
| Takeover fought and won | Captured outright at **25% off**, or softened 25% for the rest of the loop if it can't be paid yet | Once per district per loop |
| Takeover lost, or **auto-resolved** from the board | One roll at **85%** for **20% off** (captured at once if affordable) | One roll per district per loop |
| Raid defended | The raid ends: district kept, no garrison bill, no Morale lost | That raid only. Lost or ignored: garrison and Standing Orders (1.25×) as always. A raid that was live when you left keeps its remaining time (at least 20 s). |
| Leader fought | That faction goes to **maximum hostility, win or lose** | Every fight |
| Leader beaten, first time ever | Its **FIELD** tech node and Codex field report open on every timeline | Once per leader |
| Leader beaten, per loop | Its districts **10% cheaper** and no fortification surcharge; its raids pause **4 minutes**, then it is hostile again | Once per leader per loop |
| Style | Each won first-time op adds its style (peak rank 60%, grade 40%). **Field ops** = the best four, divided by four. | Overthrow weight **0.06**, inside `groundGate()` and the 0.78 soft knee |
| Replays | A takeover already won this loop pays GigaTech at **half rate** and reports nothing | |

District discounts stack multiplicatively with a floor of 60% of the price.

**Fight vs auto-resolve:** a fight is guaranteed 25% off; auto-resolve is worth 0.85 × 20% = 17% off on average,
so a fight is worth **1.47×** an auto-resolve, plus the GigaTech and style the fight earns. Losing a fight still gets
the auto-resolve roll. Auto-resolve is instant and never required.

**Leaders and the handover ending:** the handover needs three sovereign factions willing to talk. Every leader fight
makes one of them hostile, so fighting leaders closes that route. The board warns before deploying against an ally,
a friendly or a neutral faction, and the warning names the alliance, its buffs and its call-in.

Only **Riya Vex** has a fight in the field today (the plaza). The other four leaders are listed as *not in the field
yet*; their tech nodes, Codex reports and per-loop effects are already wired on the idle side.

District takeovers and raid defences run Operation: Unsubscribe through Act III and end at the log-off, without the
boss. Leader fights run the full mission.

## GigaTech

One currency, kept in the FPS save. Earned in the field as before. Spent in the FPS as before, and in the grid on:

| Sink | Cost | Effect |
|---|---|---|
| Jam the raid | 40 GT | Ends the current raid; the district stays yours |
| Scrub the records | 25 GT | Suspicion −12, then a 2-minute cooldown |

GigaTech never converts into Memory Shards or production.

## FIELD trophies (idle tech tree, embedded only)

| Node | Opens after beating | Effect |
|---|---|---|
| Shattered Ring Light | Riya Vex | Suspicion gain −15% |
| MAG-0 Spare Optics | Magnus Tarkon | Missions run 10% faster |
| Cold Wallet Keys | Blitz Radium | Districts cost 6% less |
| Swarm Firmware | SPYD3R.exe | Raids come 20% less often |
| The Directorate Minutes | Chairman Zhu | +10 Truth Layer when researched |

Each is researched again every loop like any node. They sit outside the tech-rank ordering, so the rest of the
tree prices exactly as before.

## Balance

**Idle side, measured with the play bot** (`store/scripts/qa/fieldbot.mjs` in the idle repo, ×100 speed; game-minutes
until the overthrow odds reach 55%). Bot A plays the idle game alone. Bot B also plays every field op an FPS player
could, instantly: it fights and wins every takeover the idle policy would have made, defends every raid, beats Riya
every loop and posts near-top style. Both use the same judgement on heat and standings.

| Loop | Idle only (A) | Idle + full field play (B) | Faster by |
|---|---|---|---|
| 2 (8 shards) | 93.4, 97.5, 115.2, 114.3, 108.2 · mean 105.7 | 77.3, 100.6, 98.6, 88.1 · mean 91.2 | ~14% |
| 6 (60 shards, raids on) | 101.2, 91.7 · mean 96.5 | 88.9, 67.7 · mean 78.3 | ~19% |

Both are inside the 25% cap. The first pass (30% / 24% / 15% discounts) measured 26% at loop 6, so the takeover,
auto-resolve and leader discounts were cut to 25% / 20% / 10%. A bot that takes every front-line district regardless
of heat runs its Suspicion to 100 and stalls, so the field never removes the need to manage heat.

**FPS side** (`tests/field-ops.test.js`, read against the arena's own constants): heat 0 → 1 multiplies the damage a
player takes over a run by about 1.79 (enemy HP ×1.25, count ×1.15, damage ×1.15, fire rate ×1.08). The most the grid
can lend (RARE gun, the ally drone, two rerolls) raises player damage output by about 1.30×, so maximum support is
worth less than one heat level. A fresh FPS player with no idle progress gets no support and no extra heat, so the
base game is unchanged.

If either target breaks, tune `FieldOps.CFG` (FPS) or `FPS_CFG` (idle), not the core economies.
