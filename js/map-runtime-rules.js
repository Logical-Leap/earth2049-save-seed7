/* EARTH 2049 authored-map collision and marker rules (UMD/no-build) */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MapRuntimeRules = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const INTERACTION_ALIASES = Object.freeze({ characterCustomization: 'customization' });

  function rectCircleHit(collider, x, z, radius) {
    const halfX = collider.sx / 2;
    const halfZ = collider.sz / 2;
    const closestX = Math.max(collider.x - halfX, Math.min(x, collider.x + halfX));
    const closestZ = Math.max(collider.z - halfZ, Math.min(z, collider.z + halfZ));
    return (closestX - x) ** 2 + (closestZ - z) ** 2 < radius ** 2;
  }

  function usesProceduralGrid({ usingExternalScene = false } = {}) {
    return !usingExternalScene;
  }

  function playerColliderBlocks(collider, y, radius, playerHeight, stepHeight) {
    if (!rectCircleHit(collider, collider.testX ?? collider.x, collider.testZ ?? collider.z, radius)) return false;
    if (collider.y0 > y + playerHeight) return false;
    if (collider.climb && y + 0.18 >= collider.h) return false;
    if (collider.walkable && y + stepHeight >= collider.h) return false;
    return true;
  }

  function colliderBlocksAt(collider, x, z, radius, y, playerHeight, stepHeight) {
    if (!rectCircleHit(collider, x, z, radius)) return false;
    return playerColliderBlocks({ ...collider, testX: x, testZ: z }, y, radius, playerHeight, stepHeight);
  }

  function groundHeight(colliders, x, z, radius, y, stepHeight) {
    let height = 0;
    for (const collider of colliders) {
      if (!rectCircleHit(collider, x, z, radius)) continue;
      const walkableStep = collider.walkable && y + stepHeight >= collider.h;
      const landedClimbable = collider.climb && y >= collider.h - 0.2;
      if (walkableStep || landedClimbable) height = Math.max(height, collider.h);
    }
    return height;
  }

  function markerYaw(userData = {}, rotationY = 0) {
    const degrees = Number(userData.yawDegrees);
    if (Number.isFinite(degrees)) return degrees * Math.PI / 180;
    const radians = Number(userData.yawRadians);
    if (Number.isFinite(radians)) return radians;
    return Number.isFinite(Number(rotationY)) ? Number(rotationY) : 0;
  }

  function normalizeInteractionType(gameplayType) {
    return INTERACTION_ALIASES[gameplayType] || gameplayType;
  }

  function hubCornerBlockers() {
    return [
      { name: 'E2049_BLOCKER_HUB_SE_CORNER', x: 59, z: 55, sx: 14, sz: 8, y0: 0, h: 16, climb: false, walkable: false, gameplayType: 'arenaWall' },
      { name: 'E2049_BLOCKER_HUB_SW_CORNER', x: -59, z: 55, sx: 14, sz: 8, y0: 0, h: 16, climb: false, walkable: false, gameplayType: 'arenaWall' },
    ];
  }

  return Object.freeze({
    rectCircleHit,
    usesProceduralGrid,
    playerColliderBlocks,
    colliderBlocksAt,
    groundHeight,
    markerYaw,
    normalizeInteractionType,
    hubCornerBlockers,
  });
});
