/* EARTH 2049 co-op interpolation helpers (UMD/no-build) */
'use strict';
(function (global) {
  function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
  function lerpAngle(a, b, t) {
    let d = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
    return a + d * Math.max(0, Math.min(1, t));
  }
  class SnapshotBuffer {
    constructor(delayMs) { this.delayMs = delayMs || 100; this.items = []; }
    push(s) { const item = Object.assign({ at: performance.now() }, s); if (this.items.length && item.at <= this.items[this.items.length - 1].at) item.at = this.items[this.items.length - 1].at + 0.01; this.items.push(item); if (this.items.length > 12) this.items.shift(); }
    latest() { return this.items[this.items.length - 1] || null; }
    sample() {
      if (!this.items.length) return null;
      const target = performance.now() - this.delayMs;
      let a = this.items[0], b = this.items[this.items.length - 1];
      for (let i = 0; i < this.items.length - 1; i++) if (this.items[i].at <= target && this.items[i + 1].at >= target) { a = this.items[i]; b = this.items[i + 1]; break; }
      const span = Math.max(1, b.at - a.at), t = Math.max(0, Math.min(1, (target - a.at) / span));
      return {
        x: lerp(a.x, b.x, t), y: lerp(a.y || 0, b.y || 0, t), z: lerp(a.z, b.z, t),
        yaw: lerpAngle(a.yaw || 0, b.yaw || 0, t), hp: b.hp, maxHp: b.maxHp, armor: b.armor, state: b.state || 'alive', name: b.name, color: b.color
      };
    }
  }
  global.NetInterpolation = { lerp, lerpAngle, SnapshotBuffer };
})(window);
