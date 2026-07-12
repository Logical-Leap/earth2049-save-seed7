# Earth 2049 — Rebel Hub Haven Commons V3 Texture Pack

Complete texture coverage for every material UUID used by `rebel-hub-haven-commons-v3.scene.json`.

## Resolution
- Primary PBR maps: 1024×1024 PNG
- Debug marker textures: 256×256 PNG
- Repeating environment textures are designed to tile seamlessly.

## Color space
- Base color and emissive: sRGB
- Normal, roughness, metalness, AO, alpha: Linear / NoColorSpace

## Usage
Use `hub-v3-texture-bindings.json` for material-to-file mappings and recommended repeat values. Apply `RepeatWrapping` to environment textures. Ivy should use transparency plus `alphaTest ≈ 0.35`; water should use transparency and opacity near 0.55.
