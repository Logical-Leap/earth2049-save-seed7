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

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function defaultRandomId() {
    const cryptoApi = typeof crypto !== 'undefined' ? crypto : null;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    if (cryptoApi?.getRandomValues) {
      const bytes = new Uint8Array(12);
      cryptoApi.getRandomValues(bytes);
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  }

  function catalogData(catalogs) {
    const source = safeObject(catalogs);
    return {
      factionIds: Array.isArray(source.factionIds) ? source.factionIds.map(String) : [],
      weaponIds: Array.isArray(source.weaponIds) ? source.weaponIds.map(String) : [],
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
    const initialAbility = abilities.empGrenade?.unlocked ? ['empGrenade'] : [];
    return {
      schemaVersion: CURRENT_VERSION,
      gt: 0,
      up: {},
      runs: 0,
      bestD: 0,
      kills: 0,
      wins: 0,
      opts: { sens: 1, music: true, sfx: true, auto: true },
      intel,
      corruption: 0,
      abilities,
      equippedAbilities: initialAbility,
      mastery,
      relics: {},
      simTier: 1,
      modifiersSeen: {},
      codex: {},
      corruptionUp: {},
      profile: { id: 'op-' + String(randomId()).slice(0, 77), name: 'Purple Operative', color: '#9b59ff' },
    };
  }

  function masteryRecord(raw = {}) {
    const source = safeObject(raw);
    return {
      xp: clampNumber(source.xp),
      level: clampNumber(source.level, 0, 0, 10),
      kills: clampNumber(source.kills),
      eliteKills: clampNumber(source.eliteKills),
      bossDamage: clampNumber(source.bossDamage),
      headshots: clampNumber(source.headshots),
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

  function normalize(raw, catalogs = {}, randomId = defaultRandomId) {
    const source = safeObject(raw);
    const data = catalogData(catalogs);
    const defaults = createDefault(data, randomId);
    const save = { ...source, schemaVersion: CURRENT_VERSION };

    for (const key of ['gt', 'runs', 'bestD', 'kills', 'wins', 'corruption']) {
      save[key] = clampNumber(source[key], defaults[key]);
    }
    save.simTier = clampNumber(source.simTier, 1, 1, 9999);
    save.up = safeObject(source.up);
    save.relics = safeObject(source.relics);
    save.modifiersSeen = safeObject(source.modifiersSeen);
    save.codex = safeObject(source.codex);
    save.corruptionUp = safeObject(source.corruptionUp);

    const opts = safeObject(source.opts);
    save.opts = {
      ...opts,
      sens: clampNumber(opts.sens, 1, 0.1, 3),
      music: opts.music === undefined ? true : !!opts.music,
      sfx: opts.sfx === undefined ? true : !!opts.sfx,
      auto: opts.auto === undefined ? true : !!opts.auto,
    };

    const sourceIntel = safeObject(source.intel);
    save.intel = { ...sourceIntel };
    for (const id of data.factionIds) {
      const record = safeObject(sourceIntel[id]);
      save.intel[id] = { ...record, points: clampNumber(record.points), leaders: clampNumber(record.leaders) };
    }

    const sourceAbilities = safeObject(source.abilities);
    save.abilities = { ...sourceAbilities };
    for (const [id, abilityDefaults] of Object.entries(data.abilities)) {
      const record = safeObject(sourceAbilities[id]);
      save.abilities[id] = {
        ...record,
        unlocked: record.unlocked === undefined ? !!abilityDefaults?.unlocked : !!record.unlocked,
        level: clampNumber(record.level, abilityDefaults?.level || 0, 0, 99),
      };
    }
    const knownAbilities = new Set(Object.keys(data.abilities));
    const equipped = Array.isArray(source.equippedAbilities) ? source.equippedAbilities : defaults.equippedAbilities;
    save.equippedAbilities = [...new Set(equipped.map(String).filter(id => knownAbilities.has(id)))].slice(-2);
    if (!save.equippedAbilities.length && save.abilities.empGrenade?.unlocked) save.equippedAbilities.push('empGrenade');

    const sourceMastery = safeObject(source.mastery);
    save.mastery = { ...sourceMastery };
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
    return { save: normalize(raw, catalogs, randomId), migrations };
  }

  function persist(storage, save) {
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(save));
      return true;
    } catch (_) {
      return false;
    }
  }

  function load(storage, catalogs = {}, randomId = defaultRandomId) {
    let raw;
    try {
      raw = storage.getItem(SAVE_KEY);
    } catch (_) {
      return { save: createDefault(catalogs, randomId), status: 'storage-unavailable', migrations: [] };
    }
    if (raw == null || raw === '') {
      const save = createDefault(catalogs, randomId);
      const stored = persist(storage, save);
      return { save, status: stored ? 'created' : 'storage-unavailable', migrations: [] };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      try { storage.setItem(BACKUP_KEY, raw); } catch (_) {}
      const save = createDefault(catalogs, randomId);
      const stored = persist(storage, save);
      return { save, status: stored ? 'recovered-invalid-json' : 'storage-unavailable', recoveryStatus: 'recovered-invalid-json', migrations: [], rawBackup: raw };
    }

    try {
      const result = migrate(parsed, catalogs, randomId);
      let stored = true;
      if (result.migrations.length) {
        try { storage.setItem(BACKUP_KEY, raw); } catch (_) {}
        stored = persist(storage, result.save);
      }
      const recoveryStatus = result.migrations.length ? 'migrated' : 'loaded';
      return { ...result, status: stored ? recoveryStatus : 'storage-unavailable', recoveryStatus };
    } catch (error) {
      if (error.code === 'UNSUPPORTED_FUTURE_VERSION') {
        return { save: null, status: 'unsupported-future-version', migrations: [], error };
      }
      try { storage.setItem(BACKUP_KEY, raw); } catch (_) {}
      const save = createDefault(catalogs, randomId);
      const stored = persist(storage, save);
      return { save, status: stored ? 'recovered-invalid-save' : 'storage-unavailable', recoveryStatus: 'recovered-invalid-save', migrations: [], error, rawBackup: raw };
    }
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
    try {
      const current = storage.getItem(SAVE_KEY);
      if (current != null) storage.setItem(BACKUP_KEY, current);
    } catch (_) {}
    if (!persist(storage, result.save)) return { ok: false, error: 'storage-unavailable' };
    return { ok: true, ...result };
  }

  function reset(storage, catalogs = {}, randomId = defaultRandomId) {
    try {
      const current = storage.getItem(SAVE_KEY);
      if (current != null) storage.setItem(RESET_BACKUP_KEY, current);
    } catch (_) {}
    const save = createDefault(catalogs, randomId);
    const ok = persist(storage, save);
    return { ok, save, status: ok ? 'reset' : 'storage-unavailable' };
  }

  return {
    SAVE_KEY,
    BACKUP_KEY,
    RESET_BACKUP_KEY,
    EXPORT_FORMAT,
    CURRENT_VERSION,
    MAX_COUNTER,
    createDefault,
    normalize,
    migrate,
    load,
    persist,
    exportSave,
    importSave,
    reset,
  };
});
