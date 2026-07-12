#!/usr/bin/env python3
from pathlib import Path
import json, math, struct, zipfile
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'assets/scenes/districts/rebel-hub-haven-commons-v3.scene.json'
SCENE=ROOT/'assets/scenes/districts/rebel-hub-haven-commons-final.scene.json'
COLL=ROOT/'assets/scenes/districts/hub-final-collision.scene.json'
GLB=ROOT/'assets/models/rebel-hub-haven-commons-final/rebel-hub-haven-commons-final.glb'
DOC=ROOT/'docs/rebel-hub-haven-commons-final'; PACK=ROOT/'assets/textures/rebel-hub-haven-commons-v3-texture-pack'
source=json.loads(SRC.read_text()); final=json.loads(SCENE.read_text()); collision=json.loads(COLL.read_text())
src={o['name']:o for o in source['object']['children']}; kids=final['object']['children']; by={o['name']:o for o in kids}
required=['playerStart','socialZone','vendorZone','vendor','npcAnchor','upgradeStation','characterCustomization','stash','progressBoard','missionBoard','missionLaunch','trainingZone','trainingTarget','travelGate','routeHint','traversal','railing','softLock','arenaWall','entryGate']
refs={'geometries':{g['uuid'] for g in final['geometries']},'materials':{m['uuid'] for m in final['materials']},'textures':{t['uuid'] for t in final.get('textures',[])},'images':{i['uuid'] for i in final.get('images',[])}}
errors=[]
for n,o in src.items():
 if n not in by: errors.append('missing original '+n); continue
 f=by[n]
 for key in ('position','rotation','scale','geometry','material','userData'):
  if o.get(key)!=f.get(key): errors.append(f'authoritative mismatch {n}.{key}')
if len(by)!=len(kids): errors.append('duplicate object names')
for o in kids:
 if o.get('geometry') and o['geometry'] not in refs['geometries']: errors.append('geometry ref '+o['name'])
 if o.get('material') and o['material'] not in refs['materials']: errors.append('material ref '+o['name'])
for m in final['materials']:
 for slot in ('map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap'):
  if m.get(slot) and m[slot] not in refs['textures']: errors.append(f'texture ref {m["uuid"]}.{slot}')
for t in final.get('textures',[]):
 if t['image'] not in refs['images']: errors.append('image ref '+t['uuid'])
for im in final.get('images',[]):
 p=(ROOT/im['url']).resolve() if im['url'].startswith('assets/') else (SCENE.parent/im['url']).resolve()
 if not p.exists(): errors.append('missing image '+im['url'])
counts={x:sum(o.get('userData',{}).get('gameplayType')==x for o in kids) for x in required}
for x in required:
 if not counts[x]: errors.append('missing gameplayType '+x)
meta=final['object']['userData']
if meta.get('gameMode')!='hubLobby' or meta.get('combatDisabled') is not True: errors.append('hub lobby metadata')
# Authoritative route assertions from V3 corrections.
route_names=['E2049_TRAVERSAL_MARKET_BALCONY','E2049_TRAVERSAL_WORKSHOP_CATWALK','E2049_TRAVERSAL_COMMAND_OVERLOOK','E2049_TRAVERSAL_CENTRAL_BRIDGE_FULL_SPAN']
for n in route_names:
 if n not in by: errors.append('missing route '+n)
for prefix,total in [('E2049_TRAVERSAL_MARKET_BALCONY_STAIRS_STEP_',8),('E2049_TRAVERSAL_WORKSHOP_CATWALK_STAIRS_STEP_',8),('E2049_TRAVERSAL_COMMAND_STAIRS_LOWER_STEP_',8),('E2049_TRAVERSAL_COMMAND_STAIRS_UPPER_STEP_',8)]:
 steps=sorted((o for o in kids if o['name'].startswith(prefix)),key=lambda o:o['name'])
 if len(steps)!=total: errors.append('stair count '+prefix)
 elif any(abs((steps[i+1]['position'][1]-steps[i]['position'][1])-.5)>.01 for i in range(len(steps)-1)): errors.append('stair rise '+prefix)
collider_names={o['name'] for o in collision['object']['children']}
for o in kids:
 if o.get('userData',{}).get('collider') and o['name'] not in collider_names: errors.append('collision missing '+o['name'])
glb_ok=GLB.exists() and GLB.read_bytes()[:4]==b'glTF'
if not glb_ok: errors.append('invalid GLB')
textures=[]; texture_bytes=0
for p in PACK.rglob('*.png'):
 with Image.open(p) as im:
  w,h=im.size; channels=len(im.getbands()); texture_bytes+=w*h*channels; textures.append((str(p.relative_to(ROOT)),w,h,channels))
mesh_count=sum(o.get('type')=='Mesh' for o in kids); point_lights=sum(o.get('type')=='PointLight' for o in kids); shadow_lights=sum(bool(o.get('type','').endswith('Light') and o.get('castShadow')) for o in kids)
geo_tri={'geo-unit':12,'geo-marker':12,'geo-final-cylinder':40,'geo-final-plane':2}; triangles=sum(geo_tri.get(o.get('geometry'),12) for o in kids if o.get('type')=='Mesh')
production=sum(bool(o.get('userData',{}).get('productionAsset')) for o in kids)
valid=not errors
report={'valid':valid,'errors':errors,'sourceObjectsPreserved':len(src),'finalObjects':len(kids),'productionObjects':production,'gameplayTypeCounts':counts,'references':{k:len(v) for k,v in refs.items()},'routeChecks':{'continuousBridge':route_names[-1] in by,'marketBalconyReachable':not any('MARKET_BALCONY_STAIRS' in e for e in errors),'workshopCatwalkReachable':not any('WORKSHOP_CATWALK_STAIRS' in e for e in errors),'commandOverlookReachable':not any('COMMAND_STAIRS' in e for e in errors)},'glbValid':glb_ok}
(DOC/'hub-final-validation-report.md').write_text('# Hub Final Validation Report\n\n**Result: '+('PASS' if valid else 'FAIL')+'**\n\n```json\n'+json.dumps(report,indent=2)+'\n```\n')
perf={'meshCount':mesh_count,'sceneObjectCount':len(kids),'estimatedTriangles':triangles,'estimatedDrawCallsWorstCase':mesh_count,'sharedGeometryCount':len(final['geometries']),'materialCount':len(final['materials']),'textureCount':len(textures),'textureMemoryUncompressedMiB':round(texture_bytes/1048576,2),'dynamicLightCount':point_lights,'shadowCastingLightCount':shadow_lights,'glbBytes':GLB.stat().st_size if GLB.exists() else 0,'knownRisks':['Worst-case draw-call count assumes no runtime batching; production meshes share geometries/materials and are eligible for static merge or instancing.','Transparent ivy/water kept away from dense primary circulation to control overdraw.']}
(DOC/'hub-final-performance-report.md').write_text('# Hub Final Performance Report\n\n```json\n'+json.dumps(perf,indent=2)+'\n```\n')
readme='''# REBEL HUB — HAVEN COMMONS (Final)\n\nProduction multiplayer lobby environment for **EARTH 2049: SAVE SEED7**. The clean Three.js Object JSON retains every authoritative Hub V3 gameplay object and adds a modular visual pass for the arrival yard, Commons, Market/Salvage Lane, Workshop, customization/stash, pavilion, training garden, memorial/support area, Command Overlook, bridge, balcony, catwalk, and deployment gate.\n\n## Scene structure\n- `rebel-hub-haven-commons-final.scene.json`: directly loadable `THREE.ObjectLoader` scene; no Editor project wrapper.\n- `rebel-hub-haven-commons-final.glb`: consolidated visual asset for GLTF-capable paths.\n- `hub-final-collision.scene.json`: low-complexity collision-only companion.\n- Original V3 names, transforms, and `userData` are retained verbatim. Added art objects use `E2049_PROP_FINAL_*`.\n\n## Interactive zones\nMarkers remain in the scene for spawn, social zones, vendors/NPCs, upgrade and crafting services, customization, stash, progress/mission boards, training targets, travel/deployment, traversal, railings, arena walls, soft locks, and entry gate. Runtime marker meshes may be hidden without removing metadata. Scene metadata remains `gameMode: hubLobby` and `combatDisabled: true`.\n\n## Material system\nThe supplied Hub V3 library is embedded by URL in the scene's `images`/`textures` arrays and documented by `hub-final-texture-bindings.json`. Base-color and emissive maps are sRGB; normal, roughness, metalness, AO, and alpha maps are linear. Repeating PBR families use shared materials to limit state changes. Ivy uses alpha test; water is transparent with depth writing disabled.\n\n## Collision and traversal\nAuthoritative colliders are exported separately and retained in the main scene. The continuous west-to-east bridge, Market Balcony staircase, Workshop Catwalk staircase, and two-stage Command Overlook staircase are validation-gated. Decorative clutter intentionally has no collision in primary routes.\n\n## Export procedure\n```sh\npython3 scripts/build-rebel-hub-final.py\n/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/export-rebel-hub-final-glb.py\npython3 scripts/validate-rebel-hub-final.py\nnpm run scenes:manifest\n```\n\n## Runtime integration\nLoad `assets/scenes/districts/rebel-hub-haven-commons-final.scene.json` through `AssetLoader.loadScene`. Registering it in `assets/data/scene-manifest.json` makes it discoverable. The stock ObjectLoader resolves embedded texture/image declarations relative to the scene URL. Use the GLB only when the runtime path explicitly uses GLTFLoader; gameplay metadata remains authoritative in Object JSON. Honor `combatDisabled` before starting directors or enemy simulation.\n'''
(DOC/'README.md').write_text(readme)
# Complete reproducible package including visual GLB, clean JSON, colliders, textures, reports, and scripts.
zip_path=ROOT/'assets/packages/rebel-hub-haven-commons-final.zip'; zip_path.parent.mkdir(parents=True,exist_ok=True)
include=[SCENE,COLL,GLB,ROOT/'assets/textures/rebel-hub-haven-commons-final/hub-final-texture-bindings.json',DOC/'README.md',DOC/'hub-final-validation-report.md',DOC/'hub-final-performance-report.md',DOC/'hub-final-asset-manifest.json',ROOT/'scripts/build-rebel-hub-final.py',ROOT/'scripts/export-rebel-hub-final-glb.py',ROOT/'scripts/validate-rebel-hub-final.py']+list(PACK.rglob('*'))
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
 for p in include:
  if p.is_file(): z.write(p,p.relative_to(ROOT))
print(json.dumps({'validation':report,'performance':perf,'zip':str(zip_path.relative_to(ROOT)),'zipBytes':zip_path.stat().st_size},indent=2))
raise SystemExit(0 if valid else 1)
