#!/usr/bin/env python3
"""Build the production Haven Commons scene by augmenting, never replacing, authoritative Hub V3."""
from pathlib import Path
import json, hashlib, math, shutil, zipfile
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'assets/scenes/districts/rebel-hub-haven-commons-v3.scene.json'
OUT=ROOT/'assets/scenes/districts/rebel-hub-haven-commons-final.scene.json'
COLL=ROOT/'assets/scenes/districts/hub-final-collision.scene.json'
PACK=ROOT/'assets/textures/rebel-hub-haven-commons-v3-texture-pack'
DOC=ROOT/'docs/rebel-hub-haven-commons-final'
MODELS=ROOT/'assets/models/rebel-hub-haven-commons-final'
ZIP=ROOT/'assets/packages/rebel-hub-haven-commons-final.zip'

def uid(s): return 'hubfinal-'+hashlib.sha1(s.encode()).hexdigest()[:28]
def mesh(name,p,s,mat='mat-rust-metal',gt='setpiece',collider=False,geo='geo-unit',rot=None,**ud):
 d={'uuid':uid(name),'type':'Mesh','name':name,'geometry':geo,'material':mat,'position':list(p),'rotation':list(rot or (0,0,0)),'scale':list(s),'castShadow':False,'receiveShadow':True,'userData':{'gameplayType':gt,'productionAsset':True,**ud}}
 if collider:d['userData'].update(collider=True,blocksPlayer=True)
 return d
def light(name,p,color=0xffb05a,intensity=.7,distance=10): return {'uuid':uid(name),'type':'PointLight','name':name,'position':list(p),'color':color,'intensity':intensity,'distance':distance,'decay':2,'castShadow':False,'userData':{'gameplayType':'practicalLight','productionAsset':True}}
def add_box(name,p,s,mat='mat-rust-metal',gt='setpiece',collider=False,**ud): additions.append(mesh(name,p,s,mat,gt,collider,**ud))
def prop_cluster(prefix,cx,cz,count,mat='mat-wood-dark',kind='crate'):
 for i in range(count):
  x=cx+((i*37)%9-4)*.78; z=cz+((i*53)%7-3)*.72; h=.55+(i%3)*.18
  add_box(f'E2049_PROP_FINAL_{prefix}_{i+1:02d}',(x,h/2,z),(1.1,h,1.0),mat,'setpiece',False,detailClass=kind,lod='near')

d=json.loads(SRC.read_text())
original=json.loads(json.dumps(d['object']['children']))
original_names={o.get('name') for o in original}
# Add browser-safe reusable production primitives.
for g in [
 {'uuid':'geo-final-cylinder','type':'CylinderGeometry','radiusTop':.5,'radiusBottom':.5,'height':1,'radialSegments':10,'heightSegments':1},
 {'uuid':'geo-final-plane','type':'PlaneGeometry','width':1,'height':1,'widthSegments':1,'heightSegments':1},
]:
 if not any(x['uuid']==g['uuid'] for x in d['geometries']): d['geometries'].append(g)
additions=[]
# Settlement-wide utility network and skyline silhouette.
for i,x in enumerate(range(-48,49,12),1):
 add_box(f'E2049_PROP_FINAL_UTILITY_POLE_{i:02d}',(x,4.5,22),(0.32,9,.32),'mat-rust-metal','setpiece')
 add_box(f'E2049_PROP_FINAL_CABLE_SPAN_{i:02d}',(x,8.1,10),(0.11,.11,24),'mat-rust-metal','setpiece')
for i,(x,z,h,w) in enumerate([(-55,-52,22,9),(-42,-57,16,7),(30,-58,25,10),(47,-54,19,8),(58,-48,28,11)],1):
 add_box(f'E2049_PROP_FINAL_SKYLINE_{i:02d}',(x,h/2,z),(w,h,6),'mat-wall-ruin','setpiece',False,lod='distant',nonPlayable=True)
# South arrival and gatehouse.
for side in (-1,1):
 x=side*9
 add_box(f'E2049_PROP_FINAL_GATEHOUSE_{side}',(x,3.5,50),(7,7,5),'mat-wall-ruin','setpiece',True,zone='arrival')
 add_box(f'E2049_PROP_FINAL_WATCHTOWER_{side}',(side*16,5,45),(4,10,4),'mat-rust-metal','setpiece',True,zone='arrival')
for i in range(8): add_box(f'E2049_PROP_FINAL_ARRIVAL_SANDBAG_{i:02d}',(-7+i*2,0.45,43),(1.7,.9,.75),'mat-sandbag','cover',False,zone='arrival')
prop_cluster('ARRIVAL_CRATES',-18,38,10)
# Central Commons: firepit, seating, communal tables, orientation arch.
additions.append(mesh('E2049_PROP_FINAL_COMMONS_FIREPIT',(0,.55,8),(2.8,1.1,2.8),'mat-rust-metal','setpiece',False,'geo-final-cylinder',None,zone='commons'))
for i in range(10):
 a=i*math.tau/10; add_box(f'E2049_PROP_FINAL_COMMONS_BENCH_{i:02d}',(math.cos(a)*9,.45,8+math.sin(a)*7),(2.8,.9,.8),'mat-wood-dark','setpiece',False,zone='commons',rotationY=-a)
add_box('E2049_PROP_FINAL_COMMONS_ORIENTATION_ARCH',(0,3.4,-6),(14,6.8,.7),'mat-wall-ruin','setpiece',False,zone='commons')
# West Market / Salvage Lane, preserving lane center at x~-34.
for i,z in enumerate(range(-10,29,6),1):
 side=-1 if i%2 else 1; x=-34+side*5.2
 add_box(f'E2049_PROP_FINAL_MARKET_COUNTER_{i:02d}',(x,.65,z),(5,1.3,1.6),'mat-wood-dark','setpiece',False,zone='market')
 add_box(f'E2049_PROP_FINAL_MARKET_CANOPY_{i:02d}',(x,3.4,z),(5.8,.16,4.2),'mat-tarp-faded','setpiece',False,zone='market',transparentSurface=True)
 add_box(f'E2049_PROP_FINAL_MARKET_RACK_{i:02d}',(x,1.9,z+1.7),(4,2.5,.3),'mat-rust-metal','setpiece',False,zone='market')
 add_box(f'E2049_PROP_FINAL_MARKET_BULB_{i:02d}',(x,3,z),(.22,.22,.22),'mat-light-warm','setpiece',False,zone='market',emissivePractical=True)
prop_cluster('SALVAGE',-44,12,18,'mat-rust-metal','salvage')
# East workshop bays and catwalk detail.
for i,z in enumerate(range(-14,25,8),1):
 add_box(f'E2049_PROP_FINAL_WORKBENCH_{i:02d}',(37,.75,z),(6,1.5,2.2),'mat-rust-metal','setpiece',False,zone='workshop')
 add_box(f'E2049_PROP_FINAL_TOOLWALL_{i:02d}',(43,2,z),(0.35,4,6),'mat-wall-ruin','setpiece',False,zone='workshop')
 for j in range(3): additions.append(mesh(f'E2049_PROP_FINAL_GAS_CYLINDER_{i:02d}_{j}',(31+j*.8,.9,z),(0.55,1.8,.55),'mat-rust-metal','setpiece',False,'geo-final-cylinder',None,zone='workshop'))
 add_box(f'E2049_PROP_FINAL_WORKSHOP_LAMP_{i:02d}',(37,4,z),(1.2,.18,.45),'mat-light-warm','setpiece',False,zone='workshop',emissivePractical=True)
# Southeast customization / stash.
for i in range(7): add_box(f'E2049_PROP_FINAL_LOCKER_{i:02d}',(24+i*2,1.5,38),(1.6,3,.8),'mat-rebel-purple','setpiece',False,zone='customization')
add_box('E2049_PROP_FINAL_SCANNER_FRAME',(28,2.4,31),(5,4.8,.45),'mat-screen-blue','setpiece',False,zone='customization')
add_box('E2049_PROP_FINAL_LOADOUT_DAIS',(34,.3,31),(6,.6,5),'mat-rust-metal','setpiece',False,zone='customization')
# North pavilion and command overlook equipment.
add_box('E2049_PROP_FINAL_COMMAND_CANOPY',(0,12,-48),(22,.25,14),'mat-tarp-faded','setpiece',False,zone='command')
add_box('E2049_PROP_FINAL_WAR_TABLE',(0,9.15,-48),(7,1.2,4),'mat-screen-amber','setpiece',False,zone='command')
for i,x in enumerate((-8,-4,4,8),1): add_box(f'E2049_PROP_FINAL_COMMAND_SCREEN_{i:02d}',(x,11,-54),(3.3,2.4,.3),'mat-screen-green','setpiece',False,zone='command')
for i,x in enumerate((-10,10),1): additions.append(mesh(f'E2049_PROP_FINAL_RADIO_MAST_{i:02d}',(x,15,-51),(.45,12,.45),'mat-rust-metal','setpiece',False,'geo-final-cylinder',None,zone='command'))
# Training garden targets, cover, water and planters.
for i,z in enumerate((-30,-25,-20,-15),1):
 add_box(f'E2049_PROP_FINAL_TRAINING_BACKSTOP_{i:02d}',(-39,2,z),(.5,4,4),'mat-sandbag','cover',False,zone='training')
for i in range(10): add_box(f'E2049_PROP_FINAL_GARDEN_PLANTER_{i:02d}',(-23+(i%2)*5,.55,-31+(i//2)*4),(4,1.1,2.2),'mat-wood-dark','setpiece',False,zone='training')
add_box('E2049_PROP_FINAL_GARDEN_WATER_BASIN',(-20,.25,-17),(7,.5,5),'mat-water','setpiece',False,zone='training',transparentSurface=True)
# Southwest memorial/support.
add_box('E2049_PROP_FINAL_MEMORIAL_WALL',(-33,3,34),(18,6,.7),'mat-wall-ruin','setpiece',False,zone='memorial')
for i in range(12): add_box(f'E2049_PROP_FINAL_MEMORIAL_TOKEN_{i:02d}',(-40+i*1.25,1.3,33.55),(.7,1.6,.25),'mat-rebel-purple','setpiece',False,zone='memorial')
add_box('E2049_PROP_FINAL_CANTEEN_COUNTER',(-18,.8,34),(10,1.6,2.4),'mat-wood-dark','setpiece',False,zone='support')
# Overgrowth: low-cost ivy cards/grass clusters near walls, not primary paths.
for i in range(36):
 x=-47+(i*19)%94; z=-38 if i%2==0 else 38; h=1.5+(i%4)*.7
 add_box(f'E2049_PROP_FINAL_IVY_{i:02d}',(x,h/2,z),(1.8,h,.06),'mat-ivy-green','vegetation',False,zone='perimeter',alphaTest=.35)
# Practical lighting: cloudy ambient remains scene-side; limited non-shadowing points.
for i,(x,z) in enumerate([(-12,8),(12,8),(-30,30),(30,30),(0,25),(0,-22)],1): additions.append(light(f'E2049_LIGHT_FINAL_COMMON_{i:02d}',(x,4,z)))
# Embed supplied PBR references directly in clean Object JSON for stock THREE.ObjectLoader.
bindings=json.loads((PACK/'hub-v3-texture-bindings.json').read_text())
d['images']=[]; d['textures']=[]
mat_by_id={m['uuid']:m for m in d['materials']}
slot_colors={'map':3001,'emissiveMap':3001,'normalMap':3000,'roughnessMap':3000,'metalnessMap':3000,'aoMap':3000,'alphaMap':3000}
for material_id,spec in bindings['materials'].items():
 material=mat_by_id.get(material_id)
 if not material: continue
 for slot,filename in spec.get('maps',{}).items():
  target_slot=slot
  if material.get('type')=='MeshBasicMaterial':
   if slot=='emissiveMap' and 'map' not in spec.get('maps',{}): target_slot='map'
   elif slot not in ('map','alphaMap'): continue
  rel=f"assets/textures/rebel-hub-haven-commons-v3-texture-pack/{spec['folder']}/{filename}"
  image_id=uid(f'image:{material_id}:{target_slot}'); texture_id=uid(f'texture:{material_id}:{target_slot}')
  d['images'].append({'uuid':image_id,'url':rel})
  d['textures'].append({'uuid':texture_id,'name':f'{material_id}-{target_slot}','image':image_id,'mapping':300,'wrap':[1000,1000],'repeat':spec.get('repeat',[1,1]),'offset':[0,0],'center':[0,0],'rotation':0,'encoding':slot_colors.get(target_slot,3000),'minFilter':1008,'magFilter':1006,'anisotropy':2,'flipY':True})
  material[target_slot]=texture_id
 if material_id=='mat-ivy-green': material.update(transparent=True,alphaTest=.35,depthWrite=True)
 if material_id=='mat-water': material.update(transparent=True,opacity=.55,depthWrite=False)
# Final scene is authoritative V3 plus production visuals; originals are byte-semantically retained.
d['object']['name']='REBEL HUB - HAVEN COMMONS'
d['object']['userData'].update({'version':'final-production-v1','sourceScene':SRC.name,'textureBindingsUrl':'assets/textures/rebel-hub-haven-commons-final/hub-final-texture-bindings.json','collisionSceneUrl':'assets/scenes/districts/hub-final-collision.scene.json','visualAssetUrl':'assets/models/rebel-hub-haven-commons-final/rebel-hub-haven-commons-final.glb','productionNotes':'Authoritative V3 gameplay objects retained; production visual kit added as sibling meshes.'})
d['object']['children']=original+additions
OUT.write_text(json.dumps(d,separators=(',',':')))
# Low-complexity collision is based only on authoritative colliders plus large production safety colliders.
colliders=[o for o in d['object']['children'] if o.get('userData',{}).get('collider')]
cd={'metadata':d['metadata'],'geometries':[g for g in d['geometries'] if g['uuid']=='geo-unit'],'materials':[m for m in d['materials'] if m['uuid']=='mat-route-dim'],'object':{'uuid':uid('collision-scene'),'type':'Scene','name':'REBEL HUB - HAVEN COMMONS COLLISION','userData':{'collisionOnly':True,'sourceScene':OUT.name},'children':[]}}
for o in colliders:
 c=json.loads(json.dumps(o)); c['material']='mat-route-dim'; c['userData'].update(renderInGame=False,collisionOnly=True); cd['object']['children'].append(c)
COLL.write_text(json.dumps(cd,separators=(',',':')))
# Bindings reference the supplied PBR library, with color-space and repeat rules preserved.
base=json.loads((PACK/'hub-v3-texture-bindings.json').read_text()); base['scene']=OUT.name; base['source']='Supplied Hub V3 texture pack';
final_tex=ROOT/'assets/textures/rebel-hub-haven-commons-final'; final_tex.mkdir(parents=True,exist_ok=True)
(final_tex/'hub-final-texture-bindings.json').write_text(json.dumps(base,indent=2)+'\n')
# Keep one canonical shared texture library; manifest records external files rather than duplicating 50 MB.
MODELS.mkdir(parents=True,exist_ok=True); DOC.mkdir(parents=True,exist_ok=True); ZIP.parent.mkdir(parents=True,exist_ok=True)
manifest={'package':'rebel-hub-haven-commons-final','entryScene':str(OUT.relative_to(ROOT)),'collisionScene':str(COLL.relative_to(ROOT)),'visualGlb':str((MODELS/'rebel-hub-haven-commons-final.glb').relative_to(ROOT)),'textureBindings':str((final_tex/'hub-final-texture-bindings.json').relative_to(ROOT)),'textureLibrary':str(PACK.relative_to(ROOT)),'sourceScene':str(SRC.relative_to(ROOT)),'conceptReferences':[f'assets/concept_art/HubArea{i}.png' for i in range(1,7)],'generator':'scripts/build-rebel-hub-final.py'}
(DOC/'hub-final-asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'originalObjects':len(original),'addedProductionObjects':len(additions),'finalObjects':len(d['object']['children']),'colliders':len(colliders),'output':str(OUT)},indent=2))
