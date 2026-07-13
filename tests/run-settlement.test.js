'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const RunSettlement = require('../js/run-settlement.js');

test('boss economy grants GigaTech and intel through one reward path only', () => {
  const reward = RunSettlement.enemyRewardPolicy({ boss: true, elite: false, gt: 120 });
  assert.deepEqual(reward, {
    killIntel: 0,
    shardGT: 0,
    bossGT: 120,
    bossIntel: 25,
  });
});

test('ordinary and elite enemies retain their normal pickup economy', () => {
  assert.deepEqual(RunSettlement.enemyRewardPolicy({ boss: false, elite: false, gt: 3 }), {
    killIntel: 1, shardGT: 3, bossGT: 0, bossIntel: 0,
  });
  assert.deepEqual(RunSettlement.enemyRewardPolicy({ boss: false, elite: true, gt: 3 }), {
    killIntel: 3, shardGT: 9, bossGT: 0, bossIntel: 0,
  });
});

test('failed settlement persistence leaves the live save and run retryable', () => {
  const save = { gt: 10, intel: { shillz: { points: 2, leaders: 0 } } };
  const run = { banked: false };
  const result = RunSettlement.commit({
    save,
    run,
    mutateDraft(draft) {
      draft.gt += 123;
      draft.intel.shillz.points += 25;
      draft.intel.shillz.leaders = 1;
    },
    persist: () => false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.save, save);
  assert.deepEqual(save, { gt: 10, intel: { shillz: { points: 2, leaders: 0 } } });
  assert.equal(run.banked, false);
});

test('successful settlement atomically returns the committed save and locks the run', () => {
  const save = { gt: 10, intel: { shillz: { points: 2, leaders: 0 } } };
  const run = { banked: false };
  let persisted;
  const result = RunSettlement.commit({
    save,
    run,
    mutateDraft(draft) { draft.gt += 123; },
    persist(draft) { persisted = draft; return true; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.save, persisted);
  assert.notEqual(result.save, save);
  assert.equal(result.save.gt, 133);
  assert.equal(save.gt, 10);
  assert.equal(run.banked, true);
});
