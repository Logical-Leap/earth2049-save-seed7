# Objective system contract

Status: **generic route missions exist; standalone ObjectiveSystem and authored marker lifecycle do not**. Audited at `7653b97` on 2026-07-13.

## Current implementation

Routes in `js/config.js` select one of five mission types implemented by `startMission()`, `progressMission()`, `completeMission()`, and `finishCleanMission()` in `js/game.js`.

| Type | Current source | Completion |
|---|---|---|
| `kills` | enemy deaths | district-scaled kill target |
| `gt` | collected GigaTech | district-scaled value target |
| `intel` | enemy kill intel | district-scaled point target |
| `clean` | player damage taken | evaluated at boss death; completes under threshold, otherwise fails |
| `elite` | elite deaths | one elite |

Mission state is `{type,name,desc,progress,target,reward,intel,completed,failed,startTaken}`. Completion immediately grants run-local GigaTech and intel and increments a stat. Guards prevent `completeMission()` from running twice in one live object, but there is no transaction ID, snapshot/restore, or automated proof.

Objective markers can be hidden while parsing an authored scene, but `World` does not expose objective or extraction locations. Current objectives therefore do not activate spatial authored props or gates. Completing a mission is also not required to advance waves or spawn the boss, so a missed objective does not block district completion.

## Required MVP target contract

```text
inactive → active → completed
                  ↘ failed
```

A pure ObjectiveSystem should accept a typed definition and explicit events; expose immutable state; serialize/restore; and emit one completion/failure result with a transaction ID. Rendering, HUD, audio, map props, rewards, and save writes must subscribe rather than mutate objective state.

Suggested definition:

```js
{
  id, type, target,
  markerIds: [],
  timeout: null,
  failure: null,
  reward: { gt: 0, intel: {} },
  requiredForDistrict: true
}
```

Required invariants:

- finite monotonic progress clamped to target;
- activation/completion/failure occur once;
- events for another type/objective are ignored;
- reward transaction is claimable once after completion only;
- required marker set is validated or a deterministic fallback is supplied;
- snapshot/restore preserves terminal state and claimed result;
- co-op authority owns state while clients render snapshots;
- required objectives cannot softlock boss/extraction progression.

For the vertical slice, ShillZ needs a concrete authored objective consistent with canon: disrupt the machinery of willing pro-GigaCorp consumer loyalists and Riya’s authority propaganda, not expose a fake rebel movement. The exact gameplay definition is not yet implemented and must be approved before wiring.

## Verification

```bash
node --check js/config.js js/game.js js/world.js
npm test
npm run scenes:manifest
npm run pages:prepare
git diff --check
```

Future tests: every type; invalid/negative events; duplicate completion; timeout/failure; reward claim twice; snapshot terminal state; missing markers/fallback; objective-to-boss/extraction integration; co-op authority/reconnect.

## Blockers

- No `js/objective-system.js` or objective unit tests.
- Objective/extraction marker queries and prop/gate activation are missing.
- Generic route mission and district progression are loosely coupled.
- No approved ShillZ authored objective or full Hub → objective → Riya → reward → Hub acceptance test.
