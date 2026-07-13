/* EARTH 2049 versioned save migration, recovery and portability (UMD/no-build) */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SaveSystem = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SAVE_KEY = 'earth2049_seed7_v1';
  const BACKUP_KEY = SAVE_KEY + '.backup';
  const RESET_BACKUP_KEY = SAVE_KEY + '.reset-backup';
  const EXPORT_FORMAT = 'earth2049-save';
  const CURRENT_VERSION = 2;
  const MAX_COUNTER = 1_000_000_000_000;

  function clampNumber(value, fallback = 0, min = 0, max = MAX_COUNTER) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function safeObject(value) { // NOSONAR - intentionally private to the UMD factory
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function defaultRandomId() { // NOSONAR - intentionally private to the UMD factory
    const cryptoApi = typeof crypto !== 'undefined' ? crypto : null;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    if (cryptoApi?.getRandomValues) {
      const bytes = new Uint8Array(12);
      cryptoApi.getRandomValues(bytes);
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return String(Date.now()) + '-local';
  }

  function catalogData(catalogs) {
    const source = safeObject(catalogs);
    return {
      factionIds: Array.isArray(source.factionIds) ? source.factionIds.map(String) : [],
      weaponIds: Array.isArray(source.weaponIds) ? source.weaponIds.map(String) : [],
      upgrades: safeObject(source.upgrades),
      corruptionUpgrades: safeObject(source.corruptionUpgrades),
      relicIds: Array.isArray(source.relicIds) ? source.relicIds.map(String) : [],
      modifierIds: Array.isArray(source.modifierIds) ? source.modifierIds.map(String) : [],
      abilities: safeObject(source.abilities),
    };
  }

  function createDefault(catalogs = {}, randomId = defaultRandomId) {
    const data = catalogData(catalogs);
    const intel = {};
    for (const id of data.factionIds) intel[id] = { points: 0, leaders: 0 };
    const abilities = {};
    for (const [id, defaults] of Object.entries(data.abilities)) {
      abilities[id] = { unlocked: !!defaults?.unlocked, level: clampNumber(defaults?.level, 0, 0, 99) };
    }
    const mastery = {};
    for (const id of data.weaponIds) mastery[id] = masteryRecord();
    return {
      schemaVersion: CURRENT_VERSION,
      gt: 0, up: {}, runs: 0, bestD: 0, kills: 0, wins: 0,
      opts: { sens: 1, music: true, sfx: true, auto: true },
      intel, corruption: 0, abilities,
      equippedAbilities: abilities.empGrenade?.unlocked ? ['empGrenade'] : [],
      mastery, relics: {}, simTier: 1, modifiersSeen: {}, codex: {}, corruptionUp: {},
      profile: { id: 'op-' + String(randomId()).slice(0, 77), name: 'Purple Operative', color: '#9b59ff' },
    };
  }

  function masteryRecord(raw = {}) {
    const source = safeObject(raw);
    return {
      xp: clampNumber(source.xp), level: clampNumber(source.level, 0, 0, 10),
      kills: clampNumber(source.kills), eliteKills: clampNumber(source.eliteKills),
      bossDamage: clampNumber(source.bossDamage), headshots: clampNumber(source.headshots),
      clears: clampNumber(source.clears),
    };
  }

  function normalizeProfile(raw, fallback) {
    const source = safeObject(raw);
    const id = String(source.id || fallback.id).slice(0, 80) || fallback.id;
    const name = String(source.name || fallback.name).trim().slice(0, 24) || fallback.name;
    const color = /^#[0-9a-f]{6}$/i.test(String(source.color || '')) ? String(source.color) : fallback.color;
    return { ...source, id, name, color };
  }

  function normalizeLevelMap(raw, definitions) {
    const source = safeObject(raw);
    const result = {};
    for (const [id, definition] of Object.entries(definitions)) {
      result[id] = clampNumber(source[id], 0, 0, clampNumber(definition?.max, 0, 0, 999));
    }
    return result;
  }

  function normalizeFlags(raw, knownIds) {
    const source = safeObject(raw);
    const result = {};
    for (const id of knownIds) if (source[id]) result[id] = true;
    return result;
  }

  function normalize(raw, catalogs = {}, randomId = defaultRandomId) {
    const source = safeObject(raw);
    const data = catalogData(catalogs);
    const defaults = createDefault(data, randomId);
    const save = { ...source, schemaVersion: CURRENT_VERSION };
    for (const key of ['gt', 'runs', 'bestD', 'kills', 'wins', 'corruption']) save[key] = clampNumber(source[key], defaults[key]);
    save.simTier = clampNumber(source.simTier, 1, 1, 9999);
    save.up = normalizeLevelMap(source.up, data.upgrades);
    save.corruptionUp = normalizeLevelMap(source.corruptionUp, data.corruptionUpgrades);
    save.relics = normalizeFlags(source.relics, data.relicIds);
    save.modifiersSeen = normalizeFlags(source.modifiersSeen, data.modifierIds);
    save.codex = Object.fromEntries(Object.entries(safeObject(source.codex)).filter(([, value]) => !!value).map(([id]) => [String(id).slice(0, 120), true]).slice(0, 1000));

    const opts = safeObject(source.opts);
    save.opts = { ...opts, sens: clampNumber(opts.sens, 1, 0.1, 3), music: opts.music === undefined ? true : !!opts.music, sfx: opts.sfx === undefined ? true : !!opts.sfx, auto: opts.auto === undefined ? true : !!opts.auto };

    const sourceIntel = safeObject(source.intel);
    save.intel = {};
    for (const id of data.factionIds) {
      const record = safeObject(sourceIntel[id]);
      save.intel[id] = { ...record, points: clampNumber(record.points), leaders: clampNumber(record.leaders, 0, 0, 1) };
    }

    const sourceAbilities = safeObject(source.abilities);
    save.abilities = {};
    for (const [id, abilityDefaults] of Object.entries(data.abilities)) {
      const record = safeObject(sourceAbilities[id]);
      save.abilities[id] = { ...record, unlocked: record.unlocked === undefined ? !!abilityDefaults?.unlocked : !!record.unlocked, level: clampNumber(record.level, abilityDefaults?.level || 0, 0, 99) };
    }
    const knownAbilities = new Set(Object.keys(data.abilities));
    const equipped = Array.isArray(source.equippedAbilities) ? source.equippedAbilities : defaults.equippedAbilities;
    save.equippedAbilities = [...new Set(equipped.map(String).filter(id => knownAbilities.has(id)))].slice(-2);
    if (!save.equippedAbilities.length && save.abilities.empGrenade?.unlocked) save.equippedAbilities.push('empGrenade');

    const sourceMastery = safeObject(source.mastery);
    save.mastery = {};
    for (const id of data.weaponIds) save.mastery[id] = masteryRecord(sourceMastery[id]);
    save.profile = normalizeProfile(source.profile, defaults.profile);
    return save;
  }

  function migrate(raw, catalogs = {}, randomId = defaultRandomId) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Save payload must be an object');
    const version = raw.schemaVersion === undefined ? 0 : Number(raw.schemaVersion);
    if (!Number.isInteger(version) || version < 0) throw new TypeError('Invalid save schema version');
    if (version > CURRENT_VERSION) {
      const error = new Error('Save was created by a newer Earth 2049 version');
      error.code = 'UNSUPPORTED_FUTURE_VERSION';
      throw error;
    }
    const migrations = [];
    for (let next = version + 1; next <= CURRENT_VERSION; next++) migrations.push(`${next - 1}->${next}`);
    const save = normalize(raw, catalogs, randomId);
    return { save, migrations, normalized: JSON.stringify(save) !== JSON.stringify(raw) };
  }

  function persist(storage, save) {
    try { storage.setItem(SAVE_KEY, JSON.stringify(save)); return true; }
    catch (error) { console.warn('[E2049 Save] Primary write failed:', error?.message || error); return false; }
  }

  function backup(storage, key, raw) {
    if (raw == null) return true;
    try { storage.setItem(key, raw); return storage.getItem(key) === raw; }
    catch (error) { console.warn('[E2049 Save] Backup write failed:', error?.message || error); return false; }
  }

  function recover(storage, raw, catalogs, randomId, recoveryStatus, details = {}) {
    const save = createDefault(catalogs, randomId);
    if (!backup(storage, BACKUP_KEY, raw)) return { save, status: 'backup-failed', recoveryStatus, migrations: [], rawBackup: raw, ...details };
    const stored = persist(storage, save);
    return { save, status: stored ? recoveryStatus : 'storage-unavailable', recoveryStatus, migrations: [], rawBackup: raw, ...details };
  }

  function loadParsed(storage, raw, parsed, catalogs, randomId) {
    try {
      const result = migrate(parsed, catalogs, randomId);
      if (!result.migrations.length && !result.normalized) return { ...result, status: 'loaded', recoveryStatus: 'loaded' };
      const recoveryStatus = result.migrations.length ? 'migrated' : 'normalized';
      if (!backup(storage, BACKUP_KEY, raw)) return { ...result, status: 'backup-failed', recoveryStatus, rawBackup: raw };
      const stored = persist(storage, result.save);
      return { ...result, status: stored ? recoveryStatus : 'storage-unavailable', recoveryStatus, rawBackup: raw };
    } catch (error) {
      if (error.code === 'UNSUPPORTED_FUTURE_VERSION') return { save: null, status: 'unsupported-future-version', migrations: [], error, futureRaw: raw };
      return recover(storage, raw, catalogs, randomId, 'recovered-invalid-save', { error });
    }
  }

  function load(storage, catalogs = {}, randomId = defaultRandomId) {
    let raw;
    try { raw = storage.getItem(SAVE_KEY); }
    catch (error) { console.warn('[E2049 Save] Primary read failed:', error?.message || error); return { save: createDefault(catalogs, randomId), status: 'storage-unavailable', migrations: [] }; }
    if (raw == null || raw === '') {
      const save = createDefault(catalogs, randomId);
      return { save, status: persist(storage, save) ? 'created' : 'storage-unavailable', migrations: [] };
    }
    try { return loadParsed(storage, raw, JSON.parse(raw), catalogs, randomId); }
    catch (error) { return recover(storage, raw, catalogs, randomId, 'recovered-invalid-json', { error }); }
  }

  function exportSave(save, exportedAt = new Date().toISOString()) {
    return JSON.stringify({ format: EXPORT_FORMAT, schemaVersion: CURRENT_VERSION, exportedAt, save }, null, 2);
  }

  function importSave(text, storage, catalogs = {}, randomId = defaultRandomId) {
    let envelope;
    try { envelope = JSON.parse(String(text)); }
    catch (error) { return { ok: false, error: 'invalid-json', detail: error }; }
    const payload = envelope?.format === EXPORT_FORMAT ? envelope.save : envelope;
    let result;
    try { result = migrate(payload, catalogs, randomId); }
    catch (error) { return { ok: false, error: error.code === 'UNSUPPORTED_FUTURE_VERSION' ? 'unsupported-future-version' : 'invalid-save', detail: error }; }
    let current;
    try { current = storage.getItem(SAVE_KEY); }
    catch (error) { return { ok: false, error: 'storage-unavailable', detail: error }; }
    if (!backup(storage, BACKUP_KEY, current)) return { ok: false, error: 'backup-failed' };
    if (!persist(storage, result.save)) return { ok: false, error: 'storage-unavailable' };
    return { ok: true, ...result };
  }

  function reset(storage, catalogs = {}, randomId = defaultRandomId) {
    let current;
    try { current = storage.getItem(SAVE_KEY); }
    catch (error) { return { ok: false, save: null, status: 'storage-unavailable', error }; }
    if (!backup(storage, RESET_BACKUP_KEY, current)) return { ok: false, save: null, status: 'backup-failed' };
    const save = createDefault(catalogs, randomId);
    const ok = persist(storage, save);
    return { ok, save: ok ? save : null, status: ok ? 'reset' : 'storage-unavailable' };
  }

  return { SAVE_KEY, BACKUP_KEY, RESET_BACKUP_KEY, EXPORT_FORMAT, CURRENT_VERSION, MAX_COUNTER, createDefault, normalize, migrate, load, persist, exportSave, importSave, reset };
});
