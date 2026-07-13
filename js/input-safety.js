/* Bounds raw look input so pointer-lock/touch discontinuities cannot produce camera snaps. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InputSafety = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_EVENT_DELTA = 180;
  const MAX_FRAME_DELTA = 360;
  const TAU = Math.PI * 2;

  function finiteOrZero(value) {
    value = Number(value);
    return Number.isFinite(value) ? value : 0;
  }

  function sanitizePointerDelta(value) {
    return Math.max(-MAX_EVENT_DELTA, Math.min(MAX_EVENT_DELTA, finiteOrZero(value)));
  }

  function accumulateLookDelta(current, incoming) {
    const total = finiteOrZero(current) + sanitizePointerDelta(incoming);
    return Math.max(-MAX_FRAME_DELTA, Math.min(MAX_FRAME_DELTA, total));
  }

  function normalizeYaw(yaw) {
    yaw = finiteOrZero(yaw);
    yaw = ((yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
    return yaw === -Math.PI ? Math.PI : yaw;
  }

  return { MAX_EVENT_DELTA, MAX_FRAME_DELTA, sanitizePointerDelta, accumulateLookDelta, normalizeYaw };
});
