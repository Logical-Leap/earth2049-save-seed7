'use strict';
const assert = require('node:assert/strict');
const InputSafety = require('../js/input-safety.js');

assert.equal(InputSafety.sanitizePointerDelta(42), 42);
assert.equal(InputSafety.sanitizePointerDelta(Number.NaN), 0);
assert.equal(InputSafety.sanitizePointerDelta(Number.POSITIVE_INFINITY), 0);
assert.equal(InputSafety.sanitizePointerDelta(100000), InputSafety.MAX_EVENT_DELTA);
assert.equal(InputSafety.sanitizePointerDelta(-100000), -InputSafety.MAX_EVENT_DELTA);

const accumulated = InputSafety.accumulateLookDelta(350, 100000);
assert.equal(accumulated, InputSafety.MAX_FRAME_DELTA);
assert.equal(InputSafety.accumulateLookDelta(Number.NaN, 12), 12);
assert.equal(InputSafety.accumulateLookDelta(12, Number.NaN), 12);

assert.ok(Math.abs(InputSafety.normalizeYaw(Math.PI * 9) - Math.PI) < 1e-10);
assert.ok(Math.abs(InputSafety.normalizeYaw(-Math.PI * 9) - Math.PI) < 1e-10);
assert.equal(InputSafety.normalizeYaw(Number.NaN), 0);

console.log('input-safety regression tests passed');
