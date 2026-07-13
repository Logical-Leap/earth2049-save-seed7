# Save schema v2

Status: **implemented and covered by Node plus static browser-integration tests** at `7653b97` (PR #36). Cloud sync is not implemented.

## Storage keys

| Key | Purpose |
|---|---|
| `earth2049_seed7_v1` | Current save. The legacy key is intentionally retained. |
| `earth2049_seed7_v1.backup` | Exact primary payload before migration, normalization, recovery, or import replacement. |
| `earth2049_seed7_v1.reset-backup` | Exact primary payload before the latest reset. |

The internal current `schemaVersion` is `2`. A save with a higher version is left untouched, exported as exact raw text by the UI, and blocks normal writes until compatible import or confirmed reset.

## Canonical fields

```text
schemaVersion: 2

gt, runs, bestD, kills, wins, corruption: finite numbers in 0..1e12
simTier: finite number in 1..9999
up: catalog upgrade ID → bounded level
corruptionUp: catalog corruption upgrade ID → bounded level
opts: { sens: 0.1..3, music: boolean, sfx: boolean, auto: boolean }
intel: faction ID → { points: 0..1e12, leaders: 0|1, ...recognized legacy fields }
abilities: ability ID → { unlocked: boolean, level: 0..99, ...recognized legacy fields }
equippedAbilities: up to two unique known ability IDs
mastery: weapon ID → { xp, level(0..10), kills, eliteKills, bossDamage, headshots, clears }
relics: known relic ID → true
modifiersSeen: known modifier ID → true
codex: up to 1000 truthy keys, each at most 120 characters
profile: { id: max 80 chars, name: trimmed max 24 chars, color: #RRGGBB, ...recognized legacy fields }
```

Fresh defaults include zero currency/stats, simulation tier 1, default options, catalog-shaped progression, EMP Grenade equipped when catalog defaults unlock it, and a generated Purple Operative profile.

Unknown top-level fields are retained by normalization for forward-compatible recovery. Catalog-controlled maps discard unknown IDs. In current normalization, relic records are reduced to boolean `true`; runtime code may assign richer records before the next persisted normalization. Consumers must not rely on relic metadata such as `firstAt` surviving reload.

## Migration and recovery behavior

- Missing `schemaVersion` is treated as version 0; ordered migration labels run through version 2.
- Migration is idempotent after normalization.
- Invalid JSON/object/version produces safe defaults only after exact backup is verified.
- Current-version but unsafe data is normalized only after backup is verified.
- Backup failure never replaces primary data.
- localStorage read/write failure returns a status and keeps solo boot in volatile/default state where possible.
- Import accepts either `{format:"earth2049-save", save:{...}}` or a raw save object, validates/migrates, backs up primary, then commits.
- Export envelope is `{format, schemaVersion, exportedAt, save}`; future saves use exact raw export instead.
- Reset requires the UI confirmation and verified reset backup before writing defaults.

## Public API

`SaveSystem` exposes constants plus `createDefault`, `normalize`, `migrate`, `load`, `persist`, `exportSave`, `importSave`, and `reset`. It is UMD/CommonJS and must load before `js/game.js`.

## Verification

```bash
node --check js/save-system.js js/game.js tests/save-system*.test.js
node --test tests/save-system.test.js tests/save-system-integration.test.js
npm test
npm run pages:prepare
git diff --check
```

Manual browser matrix: fresh profile; legacy minimal payload; malformed JSON; bounded malformed fields; future version exact export/read-only; export → reset → import; simulated quota denial; Armory Save tab status and confirmation.

## Known gaps / blockers

- Integration tests inspect script order and source wiring; they are not an automated real-browser localStorage/UI test.
- No cloud sync, multi-device merge, or server-side account save.
- Storage-failure warning is surfaced in the Armory Save tab rather than a universal boot/Hub terminal.
- Progression banking lacks transaction IDs, so schema v2 alone does not prove exactly-once rewards across every campaign/co-op transition.
