import bpy, json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
scene_path=ROOT/'assets/scenes/districts/rebel-hub-haven-commons-final.scene.json'
tex_root=ROOT/'assets/textures/rebel-hub-haven-commons-v3-texture-pack'
out=ROOT/'assets/models/rebel-hub-haven-commons-final/rebel-hub-haven-commons-final.glb'
d=json.loads(scene_path.read_text())
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

SKIP_TYPES={'playerStart','npcAnchor','vendorZone','vendor','upgradeStation','characterCustomization','stash','missionBoard','missionLaunch','trainingZone','routeHint','socialZone','progressBoard','travelGate'}

def image(path, noncolor=False):
    if not path.exists(): return None
    im=bpy.data.images.load(str(path),check_existing=True)
    if noncolor: im.colorspace_settings.name='Non-Color'
    return im

def tex_node(nodes,path,noncolor=False):
    im=image(path,noncolor)
    if not im:return None
    n=nodes.new('ShaderNodeTexImage'); n.image=im; n.interpolation='Linear'; n.extension='REPEAT'; return n

def pbr_material(mid, src):
    mat=bpy.data.materials.new(mid); mat.use_nodes=True
    nodes=mat.node_tree.nodes; links=mat.node_tree.links; bs=nodes.get('Principled BSDF')
    c=src.get('color',0x777777); bs.inputs['Base Color'].default_value=(((c>>16)&255)/255,((c>>8)&255)/255,(c&255)/255,1)
    bs.inputs['Roughness'].default_value=float(src.get('roughness',.72)); bs.inputs['Metallic'].default_value=float(src.get('metalness',0))
    folder=tex_root/mid
    base=tex_node(nodes,folder/'basecolor.png'); rough=tex_node(nodes,folder/'roughness.png',True); metal=tex_node(nodes,folder/'metalness.png',True); normal=tex_node(nodes,folder/'normal.png',True); alpha=tex_node(nodes,folder/'alpha.png',True) or tex_node(nodes,folder/'opacity.png',True); emissive=tex_node(nodes,folder/'emissive.png')
    if base: links.new(base.outputs['Color'],bs.inputs['Base Color'])
    if rough: links.new(rough.outputs['Color'],bs.inputs['Roughness'])
    if metal: links.new(metal.outputs['Color'],bs.inputs['Metallic'])
    if normal:
        nm=nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value=.65; links.new(normal.outputs['Color'],nm.inputs['Color']); links.new(nm.outputs['Normal'],bs.inputs['Normal'])
    if emissive:
        links.new(emissive.outputs['Color'],bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value=2.4 if 'screen' in mid or 'light' in mid else .55
    if alpha:
        links.new(alpha.outputs['Color'],bs.inputs['Alpha']); mat.surface_render_method='DITHERED'; mat.diffuse_color=(1,1,1,float(src.get('opacity',1)))
    if mid=='mat-water': mat.surface_render_method='DITHERED'; bs.inputs['Transmission Weight'].default_value=.25; bs.inputs['Alpha'].default_value=.62
    return mat

materials={m['uuid']:pbr_material(m['uuid'],m) for m in d['materials']}

def bevel(ob,amount=.08,segments=2):
    if min(ob.dimensions) <= .08:return
    mod=ob.modifiers.new('Production bevel','BEVEL'); mod.width=min(amount,min(ob.dimensions)*.12); mod.segments=segments

def add_box(name,pos,scale,mat_id='mat-rust-metal',bevel_amt=.06,parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos); ob=bpy.context.object; ob.name=name; ob.scale=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); bevel(ob,bevel_amt,2)
    if mat_id in materials:ob.data.materials.append(materials[mat_id])
    if parent:ob.parent=parent
    return ob

def add_pipe(name,a,b,r=.09,mat_id='mat-rust-metal'):
    ax,ay,az=a; bx,by,bz=b; dx,dy,dz=bx-ax,by-ay,bz-az; length=math.sqrt(dx*dx+dy*dy+dz*dz)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=length,location=((ax+bx)/2,(ay+by)/2,(az+bz)/2))
    ob=bpy.context.object; ob.name=name; ob.rotation_mode='QUATERNION'; ob.rotation_quaternion=(0,0,1).rotation_difference(bpy.mathutils.Vector((dx,dy,dz)).normalized()) if False else ob.rotation_quaternion
    # cylinder local Z to endpoint direction
    ob.rotation_quaternion=bpy.mathutils.Vector((0,0,1)).rotation_difference(bpy.mathutils.Vector((dx,dy,dz)).normalized())
    if mat_id in materials:ob.data.materials.append(materials[mat_id]); return ob

source_objects=[]
for idx,o in enumerate(d['object']['children']):
    if o.get('type')!='Mesh' or o.get('userData',{}).get('visibleInGame') is False: continue
    gt=o.get('userData',{}).get('gameplayType','')
    if gt in SKIP_TYPES: continue
    pos=o.get('position',[0,0,0]); sc=o.get('scale',[1,1,1]); rot=o.get('rotation',[0,0,0]); geo=o.get('geometry')
    if geo=='geo-final-cylinder': bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.5,depth=1,location=pos,rotation=rot)
    else: bpy.ops.mesh.primitive_cube_add(size=1,location=pos,rotation=rot)
    ob=bpy.context.object; ob.name=o.get('name',f'HubMesh{idx}'); ob.scale=sc; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob['gameplayType']=gt; ob['authoritativeName']=o.get('name',''); ob['productionSource']='rebel-hub-haven-commons-v3'
    if o.get('material') in materials:ob.data.materials.append(materials[o['material']])
    bevel(ob,.035 if gt in {'traversal','railing'} else .1,2)
    source_objects.append(ob)

# Architectural detailing derived from authoritative building/setpiece bounds.
detail_count=0
for ob in list(source_objects):
    n=ob.name.upper(); sx,sy,sz=ob.dimensions; x,y,z=ob.location
    if any(k in n for k in ('WALL','GATEHOUSE','WATCHTOWER','PAVILION','WORKSHOP','MARKET','COMMAND')) and sx>3 and sy>2:
        # cap/roof lip and vertical structural ribs
        add_box('DETAIL_ROOF_'+ob.name,(x,y+sy/2+.12,z),(sx/2+.18,.12,sz/2+.18),'mat-rust-metal',.04); detail_count+=1
        axis_x=sx>=sz; span=sx if axis_x else sz
        for j in range(max(2,min(6,int(span/4)))):
            t=-.42+(j/max(1,max(2,min(6,int(span/4)))-1))*.84
            px=x+t*sx if axis_x else x; pz=z if axis_x else z+t*sz
            rib_scale=(.12,sy/2+.1,sz/2+.12) if axis_x else (sx/2+.12,sy/2+.1,.12)
            add_box(f'DETAIL_RIB_{detail_count}_{j}',(px,y,pz),rib_scale,'mat-rust-metal',.025); detail_count+=1
    if any(k in n for k in ('GATEHOUSE','WATCHTOWER','WORKSHOP','COMMAND')) and sx>3 and sy>3:
        # inset luminous windows on the south-facing facade
        count=max(2,min(5,int(sx/3)))
        for j in range(count):
            wx=x-sx*.36+(j/max(1,count-1))*sx*.72
            add_box(f'DETAIL_WINDOW_{detail_count}_{j}',(wx,y+sy*.12,z+sz/2+.025),(min(.7,sx/count*.3),min(.8,sy*.16),.035),'mat-screen-amber',.015); detail_count+=1

# Landmark framing, cables, and recognizable Hub silhouettes.
for side in (-1,1):
    add_box(f'DETAIL_GATE_PIER_{side}',(side*9,4.2,47.4),(1.0,4.2,1.0),'mat-wall-ruin',.16)
    add_box(f'DETAIL_GATE_BANNER_{side}',(side*9,5.2,46.25),(.68,2.2,.05),'mat-rebel-purple',.02)
add_box('DETAIL_GATE_HEADER',(0,7.7,47.4),(10,0.55,0.65),'mat-rust-metal',.14)
add_box('DETAIL_GATE_SIGN',(0,7.75,46.72),(5.5,.42,.04),'mat-rebel-purple',.02)
# Commons ring and fire basket.
for i in range(16):
    a=i*math.tau/16; add_box(f'DETAIL_COMMONS_CURB_{i}',(math.cos(a)*10,.18,8+math.sin(a)*8),(1.9,.18,.35),'mat-floor-stone',.05).rotation_euler[1]=-a
bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=1.7,depth=.7,location=(0,.35,8)); fire=bpy.context.object; fire.name='DETAIL_COMMONS_FIRE_BASKET'; fire.data.materials.append(materials['mat-rust-metal']); bevel(fire,.06,2)
# Market hanging signs and workshop ducts.
for i,z in enumerate(range(-10,29,6)):
    add_box(f'DETAIL_MARKET_SIGN_{i}',(-34+(1 if i%2 else -1)*5.2,2.45,z-1.85),(1.4,.55,.06),'mat-screen-amber',.025)
for i,z in enumerate(range(-14,25,8)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.3,depth=6,location=(43.4,3.8,z),rotation=(0,math.pi/2,0)); duct=bpy.context.object; duct.name=f'DETAIL_WORKSHOP_DUCT_{i}'; duct.data.materials.append(materials['mat-rust-metal'])
# Command antenna arrays.
for x in (-8,-4,4,8):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.12,depth=8,location=(x,16,-51)); mast=bpy.context.object; mast.name=f'DETAIL_COMMAND_MAST_{x}'; mast.data.materials.append(materials['mat-rust-metal'])
    for h in (13.5,15.5,17.5): add_box(f'DETAIL_MAST_CROSS_{x}_{h}',(x,h,-51),(1.1,.07,.07),'mat-rust-metal',.02)
# Perimeter cable runs as horizontal tension members.
for z in (-38,38):
    for x in range(-42,43,12): add_box(f'DETAIL_CABLE_{z}_{x}',(x,7.4,z),(5.8,.035,.035),'mat-rust-metal',.01)

# Convert authored Three.js Y-up coordinates into Blender Z-up before glTF's Y-up export.
from mathutils import Matrix
axis_fix=Matrix.Rotation(math.pi/2,4,'X')
for ob in bpy.context.scene.objects:
    if ob.parent is None: ob.matrix_world=axis_fix @ ob.matrix_world
    if ob.type=='MESH':
        ob.select_set(True)
        try:
            for p in ob.data.polygons:p.use_smooth=False
        except Exception:pass
out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True,export_yup=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_image_format='AUTO')
print('EXPORTED',out,'objects',len(bpy.context.scene.objects),'authoritative_visuals',len(source_objects),'details',detail_count)
