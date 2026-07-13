#!/usr/bin/env python3
"""Validate faction cubemap assets and emit the district-to-skybox mapping report."""
import json, math, struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKY = ROOT / 'assets/textures/earth2049_all_faction_district_skyboxes/earth2049_faction_skyboxes'
SCENES = ROOT / 'assets/scenes/districts'
FACTIONS = ('shillz','muskers','gigacorp','bots','cryptids')
FACES = ('px','nx','py','ny','pz','nz')

def png_size(path):
    with path.open('rb') as f:
        if f.read(8) != b'\x89PNG\r\n\x1a\n': raise ValueError(f'not PNG: {path}')
        f.read(8)
        return struct.unpack('>II', f.read(8))

def scene_root(data):
    if isinstance(data.get('object'), dict): return data['object']
    wrapped = data.get('scene')
    if isinstance(wrapped, dict): return wrapped.get('object', wrapped)
    return {}

def walk(node):
    yield node
    for child in node.get('children',[]) if isinstance(node,dict) else []: yield from walk(child)

def infer(text):
    s = str(text or '').lower()
    for needle, faction in [('shillz','shillz'),('musker','muskers'),('gigacorp','gigacorp'),('giga','gigacorp'),('bot','bots'),('cryptid','cryptids'),('rebel','deadzone'),('haven','deadzone'),('dead-zone','deadzone')]:
        if needle in s: return faction
    return 'deadzone'

def position(root, types):
    hits=[]
    for obj in walk(root):
        u=obj.get('userData',{}); typ=str(u.get('gameplayType','')).lower(); name=str(obj.get('name','')).lower()
        if any(t == typ or t in name for t in types):
            p=obj.get('position',[0,0,0]); x,z=float(p[0]),float(p[2]); primary=bool(u.get('primary') or u.get('isPrimary') or any(k in name for k in ('primary','central','spire','uplink'))); hits.append((not primary,x*x+z*z,(x,z)))
    return sorted(hits)[0][2] if hits else None

def mapping(path):
    data=json.loads(path.read_text()); root=scene_root(data); u=root.get('userData',{})
    faction=infer(u.get('skyboxFaction') or u.get('faction') or u.get('district') or u.get('area') or path.name)
    if 'skyboxYawDegrees' in u: yaw=float(u['skyboxYawDegrees']); source='explicit skyboxYawDegrees'
    else:
        start=position(root,('playerstart',)); objective=position(root,('primaryobjective','missionobjective','objective','bossarena')); extraction=position(root,('extractiongate','extraction','travelgate','missionlaunch')); target=objective or extraction
        if start and target and start != target:
            yaw=math.degrees(math.atan2(target[0]-start[0],target[1]-start[1])); source='playerStart → primaryObjective' if objective else 'playerStart → extraction'
        else: yaw=0.0; source='zero-degree fallback'
    return {'scene':path.name,'faction':faction,'skybox':f'earth2049_{faction}','orientationSource':source,'yawDegrees':round(yaw,3),'status':'validated'}

def main():
    errors=[]
    for faction in FACTIONS:
        base=SKY/faction; manifest=json.loads((base/'skybox_manifest.json').read_text())
        order=manifest.get('threeJsCubeTextureLoaderOrder') or manifest.get('loaderOrder') or []
        for face in FACES:
            p=base/f'earth2049_{faction}_{face}.png'
            if not p.exists(): errors.append(f'missing {p}')
            elif png_size(p)!=(1024,1024): errors.append(f'bad dimensions {p}: {png_size(p)}')
        if order and [Path(x).stem.rsplit('_',1)[-1] for x in order] != list(FACES): errors.append(f'bad loader order {base}')
    report=[mapping(p) for p in sorted(SCENES.glob('*.scene.json')) if 'collision' not in p.name]
    out={'valid':not errors,'errors':errors,'cubemapOrder':list(FACES),'factions':list(FACTIONS)+['deadzone'],'maps':report}
    print(json.dumps(out,indent=2))
    if errors: raise SystemExit(1)
if __name__=='__main__': main()
