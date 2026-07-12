# Hub Final Performance Report

```json
{
  "meshCount": 430,
  "sceneObjectCount": 446,
  "estimatedTriangles": 5664,
  "estimatedDrawCallsWorstCase": 430,
  "sharedGeometryCount": 4,
  "materialCount": 19,
  "textureCount": 61,
  "textureMemoryUncompressedMiB": 111.07,
  "dynamicLightCount": 16,
  "shadowCastingLightCount": 0,
  "glbBytes": 25651776,
  "knownRisks": [
    "Worst-case draw-call count assumes no runtime batching; production meshes share geometries/materials and are eligible for static merge or instancing.",
    "Transparent ivy/water kept away from dense primary circulation to control overdraw."
  ]
}
```
