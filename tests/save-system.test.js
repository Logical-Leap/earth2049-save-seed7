'use strict';
const assert = require('node:assert/strict');
const SaveSystem = require('../js/save-system.js');

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); this.writes = []; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); this.writes.push([key, String(value)]); }
  removeItem(key) { this.values.delete(key); }
}

const catalogs = {
  factionIds: ['shillz', 'muskers', 'bots', 'cryptids', 'gigacorp'],
  weaponIds: ['pistol', 'ar'],
  abilities: {
    empGrenade: { unlocked: true, level: 1 },
    signalJammer: { unlocked: false, level: 0 },
  },
};

{
  const save = SaveSystem.createDefault(catalogs, () => 'profile-1');
  assert.equal(save.schemaVersion, SaveSystem.CURRENT_VERSION, 'fresh save is current');
  assert.equal(save.gt, 0);
  assert.deepEqual(save.equippedAbilities, ['empGrenade']);
  assert.equal(save.profile.id, 'op-profile-1');
  assert.deepEqual(save.intel.shillz, { points: 0, leaders: 0 });
}

{
  const legacy = {
    gt: 321,
    up: { vitality: 2 },
    profile: { id: 'elliot', name: 'Elliot', color: '#123456' },
    customFutureField: { retained: true },
  };
  const result = SaveSystem.migrate(legacy, catalogs, () => 'unused');
  assert.equal(result.save.schemaVersion, SaveSystem.CURRENT_VERSION);
  assert.equal(result.save.gt, 321);
  assert.equal(result.save.up.vitality, 2);
  assert.equal(result.save.profile.name, 'Elliot');
  assert.deepEqual(result.save.customFutureField, { retained: true });
  assert.ok(result.migrations.length > 0);

  const twice = SaveSystem.migrate(result.save, catalogs, () => 'unused');
  assert.deepEqual(twice.save, result.save, 'migration is idempotent');
  assert.deepEqual(twice.migrations, []);
}

{
  const storage = new MemoryStorage({ [SaveSystem.SAVE_KEY]: '{broken json' });
  const loaded = SaveSystem.load(storage, catalogs, () => 'recovered');
  assert.equal(loaded.status, 'recovered-invalid-json');
  assert.equal(storage.getItem(SaveSystem.BACKUP_KEY), '{broken json');
  assert.equal(loaded.save.schemaVersion, SaveSystem.CURRENT_VERSION);
  assert.equal(loaded.save.profile.id, 'op-recovered');
}

{
  const dirty = {
    schemaVersion: 1,
    gt: -20,
    corruption: Number.POSITIVE_INFINITY,
    runs: 9e30,
    opts: { sens: Number.NaN, music: 'yes', sfx: 0, auto: true },
    equippedAbilities: ['missing', 'empGrenade', 'empGrenade'],
    profile: { id: 'x'.repeat(500), name: '<script>'.repeat(20), color: 'not-a-color' },
  };
  const { save } = SaveSystem.migrate(dirty, catalogs, () => 'unused');
  assert.equal(save.gt, 0);
  assert.equal(save.corruption, 0);
  assert.equal(save.runs, SaveSystem.MAX_COUNTER);
  assert.equal(save.opts.sens, 1);
  assert.equal(save.opts.music, true);
  assert.equal(save.opts.sfx, false);
  assert.deepEqual(save.equippedAbilities, ['empGrenade']);
  assert.ok(save.profile.id.length <= 80);
  assert.ok(save.profile.name.length <= 24);
  assert.equal(save.profile.color, '#9b59ff');
}

{
  const storage = new MemoryStorage();
  const futureRaw = JSON.stringify({ schemaVersion: SaveSystem.CURRENT_VERSION + 1, gt: 999 });
  storage.setItem(SaveSystem.SAVE_KEY, futureRaw);
  const writesBefore = storage.writes.length;
  const loaded = SaveSystem.load(storage, catalogs, () => 'unused');
  assert.equal(loaded.status, 'unsupported-future-version');
  assert.equal(loaded.save, null);
  assert.equal(storage.getItem(SaveSystem.SAVE_KEY), futureRaw, 'future save is not overwritten');
  assert.equal(storage.writes.length, writesBefore);
}

{
  const storage = new MemoryStorage();
  const source = SaveSystem.createDefault(catalogs, () => 'roundtrip');
  source.gt = 444;
  source.up.vitality = 3;
  assert.equal(SaveSystem.persist(storage, source), true);
  const exported = SaveSystem.exportSave(source, '2026-07-13T00:00:00.000Z');
  const reset = SaveSystem.reset(storage, catalogs, () => 'reset');
  assert.equal(reset.save.gt, 0);
  assert.ok(storage.getItem(SaveSystem.RESET_BACKUP_KEY).includes('"gt":444'));
  const imported = SaveSystem.importSave(exported, storage, catalogs, () => 'unused');
  assert.equal(imported.ok, true);
  assert.equal(imported.save.gt, 444);
  assert.equal(imported.save.up.vitality, 3);
  assert.deepEqual(SaveSystem.load(storage, catalogs, () => 'unused').save, imported.save);
}

{
  const storage = new MemoryStorage();
  const future = JSON.stringify({ format: SaveSystem.EXPORT_FORMAT, save: { schemaVersion: SaveSystem.CURRENT_VERSION + 1 } });
  const result = SaveSystem.importSave(future, storage, catalogs, () => 'unused');
  assert.equal(result.ok, false);
  assert.equal(storage.getItem(SaveSystem.SAVE_KEY), null);
}

{
  const writeBlockedStorage = {
    getItem() { return JSON.stringify({ gt: 17 }); },
    setItem() { throw new Error('quota'); },
  };
  const loaded = SaveSystem.load(writeBlockedStorage, catalogs, () => 'volatile-migration');
  assert.equal(loaded.status, 'storage-unavailable');
  assert.equal(loaded.recoveryStatus, 'migrated');
  assert.equal(loaded.save.gt, 17);
}

{
  const brokenStorage = {
    getItem() { throw new Error('privacy mode'); },
    setItem() { throw new Error('quota'); },
  };
  const loaded = SaveSystem.load(brokenStorage, catalogs, () => 'volatile');
  assert.equal(loaded.status, 'storage-unavailable');
  assert.equal(loaded.save.profile.id, 'op-volatile');
  assert.equal(SaveSystem.persist(brokenStorage, loaded.save), false);
}

console.log('save-system migration and recovery tests passed');
