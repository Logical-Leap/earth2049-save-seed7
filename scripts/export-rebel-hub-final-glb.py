import bpy, json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
scene_path=ROOT/'assets/scenes/districts/rebel-hub-haven-commons-final.scene.json'
out=ROOT/'assets/models/rebel-hub-haven-commons-final/rebel-hub-haven-commons-final.glb'
d=json.loads(scene_path.read_text())
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
materials={}
for m in d['materials']:
    mat=bpy.data.materials.new(m.get('name',m['uuid'])); mat.diffuse_color=((*[((m.get('color',0x777777)>>s)&255)/255 for s in (16,8,0)],m.get('opacity',1)))
    mat.metallic=float(m.get('metalness',0)); mat.roughness=float(m.get('roughness',.7));
    if m.get('transparent'): mat.surface_render_method='DITHERED'
    materials[m['uuid']]=mat
for idx,o in enumerate(d['object']['children']):
    if o.get('type')!='Mesh' or o.get('userData',{}).get('visibleInGame') is False: continue
    pos=o.get('position',[0,0,0]); sc=o.get('scale',[1,1,1]); rot=o.get('rotation',[0,0,0]); geo=o.get('geometry')
    if geo=='geo-final-cylinder': bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=.5, depth=1, location=pos, rotation=rot)
    elif geo=='geo-final-plane': bpy.ops.mesh.primitive_plane_add(size=1, location=pos, rotation=rot)
    else: bpy.ops.mesh.primitive_cube_add(size=1, location=pos, rotation=rot)
    ob=bpy.context.object; ob.name=o.get('name',f'HubMesh{idx}'); ob.scale=sc; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mat=materials.get(o.get('material'))
    if mat: ob.data.materials.append(mat)
    ob['gameplayType']=o.get('userData',{}).get('gameplayType','')
# Exclude marker/debug materials from consolidated visual GLB.
for ob in list(bpy.context.scene.objects):
    if ob.type=='MESH' and (ob.get('gameplayType') in {'playerStart','npcAnchor','vendorZone','vendor','upgradeStation','characterCustomization','stash','missionBoard','missionLaunch','trainingZone','routeHint'}): bpy.data.objects.remove(ob,do_unlink=True)
out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True,export_yup=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
print('EXPORTED',out,'objects',len(bpy.context.scene.objects))
