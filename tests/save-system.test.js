'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const SaveSystem = require('../js/save-system.js');

class MemoryStorage {
  constructor(entries = {}, failKeys = []) { this.values = new Map(Object.entries(entries)); this.writes = []; this.failKeys = new Set(failKeys); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { if (this.failKeys.has(key)) throw new Error(`blocked:${key}`); this.values.set(key, String(value)); this.writes.push([key, String(value)]); }
  removeItem(key) { this.values.delete(key); }
}

const catalogs = {
  factionIds: ['shillz', 'muskers', 'bots', 'cryptids', 'gigacorp'],
  weaponIds: ['pistol', 'ar'],
  upgrades: { vitality: { max: 5 }, arsenal: { max: 2 } },
  corruptionUpgrades: { greed: { max: 5 }, reroll: { max: 3 } },
  relicIds: ['riyaRelic', 'magnusRelic'],
  modifierIds: ['sponsoredHostiles'],
  abilities: { empGrenade: { unlocked: true, level: 1 }, signalJammer: { unlocked: false, level: 0 } },
};

test('fresh save uses current schema and catalog defaults', () => {
  const save = SaveSystem.createDefault(catalogs, () => 'profile-1');
  assert.equal(save.schemaVersion, SaveSystem.CURRENT_VERSION);
  assert.equal(save.gt, 0);
  assert.deepEqual(save.equippedAbilities, ['empGrenade']);
  assert.equal(save.profile.id, 'op-profile-1');
  assert.deepEqual(save.intel.shillz, { points: 0, leaders: 0 });
});

test('legacy migration is idempotent and retains unrelated top-level fields', () => {
  const legacy = { gt: 321, up: { vitality: 2 }, profile: { id: 'elliot', name: 'Elliot', color: '#123456' }, customFutureField: { retained: true } };
  const result = SaveSystem.migrate(legacy, catalogs, () => 'unused');
  assert.equal(result.save.gt, 321);
  assert.equal(result.save.up.vitality, 2);
  assert.deepEqual(result.save.customFutureField, { retained: true });
  assert.ok(result.migrations.length > 0);
  const twice = SaveSystem.migrate(result.save, catalogs, () => 'unused');
  assert.deepEqual(twice.save, result.save);
  assert.deepEqual(twice.migrations, []);
  assert.equal(twice.normalized, false);
});

test('invalid JSON is backed up before recovery', () => {
  const storage = new MemoryStorage({ [SaveSystem.SAVE_KEY]: '{broken json' });
  const loaded = SaveSystem.load(storage, catalogs, () => 'recovered');
  assert.equal(loaded.status, 'recovered-invalid-json');
  assert.equal(storage.getItem(SaveSystem.BACKUP_KEY), '{broken json');
  assert.equal(loaded.save.profile.id, 'op-recovered');
});

test('normalization bounds scalar and catalog-controlled structures', () => {
  const dirty = {
    schemaVersion: 1, gt: -20, corruption: Infinity, runs: 9e30,
    opts: { sens: NaN, music: 'yes', sfx: 0, auto: true },
    up: { vitality: {}, arsenal: 99, injected: 4 }, corruptionUp: { greed: -1, reroll: 99 },
    relics: { riyaRelic: 1, injected: true }, modifiersSeen: { sponsoredHostiles: 'yes', injected: true },
    equippedAbilities: ['missing', 'empGrenade', 'empGrenade'],
    profile: { id: 'x'.repeat(500), name: '<script>'.repeat(20), color: 'not-a-color' },
  };
  const { save } = SaveSystem.migrate(dirty, catalogs, () => 'unused');
  assert.equal(save.gt, 0);
  assert.equal(save.corruption, 0);
  assert.equal(save.runs, SaveSystem.MAX_COUNTER);
  assert.deepEqual(save.up, { vitality: 0, arsenal: 2 });
  assert.deepEqual(save.corruptionUp, { greed: 0, reroll: 3 });
  assert.deepEqual(save.relics, { riyaRelic: true });
  assert.deepEqual(save.modifiersSeen, { sponsoredHostiles: true });
  assert.deepEqual(save.equippedAbilities, ['empGrenade']);
  assert.equal(save.profile.color, '#9b59ff');
});

test('current-version normalization creates a backup before replacing primary', () => {
  const original = JSON.stringify({ schemaVersion: SaveSystem.CURRENT_VERSION, gt: -5, up: { vitality: 99 } });
  const storage = new MemoryStorage({ [SaveSystem.SAVE_KEY]: original });
  const loaded = SaveSystem.load(storage, catalogs, () => 'normalized');
  assert.equal(loaded.status, 'normalized');
  assert.equal(storage.getItem(SaveSystem.BACKUP_KEY), original);
  assert.equal(loaded.save.gt, 0);
  assert.equal(loaded.save.up.vitality, 5);
});

test('future save remains exact, read-only and exportable by caller', () => {
  const futureRaw = JSON.stringify({ schemaVersion: SaveSystem.CURRENT_VERSION + 1, gt: 999, futureData: [1, 2] });
  const storage = new MemoryStorage({ [SaveSystem.SAVE_KEY]: futureRaw });
  const writesBefore = storage.writes.length;
  const loaded = SaveSystem.load(storage, catalogs, () => 'unused');
  assert.equal(loaded.status, 'unsupported-future-version');
  assert.equal(loaded.save, null);
  assert.equal(loaded.futureRaw, futureRaw);
  assert.equal(storage.getItem(SaveSystem.SAVE_KEY), futureRaw);
  assert.equal(storage.writes.length, writesBefore);
});

test('export, reset and import round trip', () => {
  const storage = new MemoryStorage();
  const source = SaveSystem.createDefault(catalogs, () => 'roundtrip');
  source.gt = 444; source.up.vitality = 3;
  assert.equal(SaveSystem.persist(storage, source), true);
  const exported = SaveSystem.exportSave(source, '2026-07-13T00:00:00.000Z');
  const reset = SaveSystem.reset(storage, catalogs, () => 'reset');
  assert.equal(reset.ok, true);
  assert.equal(reset.save.gt, 0);
  assert.ok(storage.getItem(SaveSystem.RESET_BACKUP_KEY).includes('"gt":444'));
  const imported = SaveSystem.importSave(exported, storage, catalogs, () => 'unused');
  assert.equal(imported.ok, true);
  assert.equal(imported.save.gt, 444);
  assert.equal(imported.save.up.vitality, 3);
});

test('backup failure never overwrites invalid primary', () => {
  const original = '{broken json';
  const storage = new MemoryStorage({ [SaveSystem.SAVE_KEY]: original }, [SaveSystem.BACKUP_KEY]);
  const loaded = SaveSystem.load(storage, catalogs, () => 'volatile');
  assert.equal(loaded.status, 'backup-failed');
  assert.equal(storage.getItem(SaveSystem.SAVE_KEY), original);
});

test('backup failure blocks import and reset without replacing primary', () => {
  const original = JSON.stringify(SaveSystem.createDefault(catalogs, () => 'original'));
  const importStorage = new MemoryStorage({ [SaveSystem.SAVE_KEY]: original }, [SaveSystem.BACKUP_KEY]);
  const imported = SaveSystem.importSave(SaveSystem.exportSave(SaveSystem.createDefault(catalogs, () => 'new')), importStorage, catalogs);
  assert.equal(imported.ok, false);
  assert.equal(imported.error, 'backup-failed');
  assert.equal(importStorage.getItem(SaveSystem.SAVE_KEY), original);

  const resetStorage = new MemoryStorage({ [SaveSystem.SAVE_KEY]: original }, [SaveSystem.RESET_BACKUP_KEY]);
  const reset = SaveSystem.reset(resetStorage, catalogs, () => 'reset');
  assert.equal(reset.ok, false);
  assert.equal(reset.status, 'backup-failed');
  assert.equal(resetStorage.getItem(SaveSystem.SAVE_KEY), original);
});

test('storage failures remain non-destructive and report volatile state', () => {
  const storage = { getItem() { return JSON.stringify({ gt: 17 }); }, setItem() { throw new Error('quota'); } };
  const loaded = SaveSystem.load(storage, catalogs, () => 'volatile-migration');
  assert.equal(loaded.status, 'backup-failed');
  assert.equal(loaded.save.gt, 17);
});
