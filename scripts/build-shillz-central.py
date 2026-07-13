#!/usr/bin/env python3
"""Build the canonical ShillZ Central MVP Object JSON without changing gameplay code."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/scenes/districts/shillz-central.scene.json"

GEOMETRIES = [
    {"uuid":"geo-unit","type":"BoxGeometry","width":1,"height":1,"depth":1},
    {"uuid":"geo-cylinder","type":"CylinderGeometry","radiusTop":1,"radiusBottom":1,"height":1,"radialSegments":8},
]
MATERIALS = [
    {"uuid":"mat-asphalt","type":"MeshStandardMaterial","color":0x17191D,"roughness":0.88,"metalness":0.08},
    {"uuid":"mat-commercial","type":"MeshStandardMaterial","color":0xD07A08,"roughness":0.62,"metalness":0.18},
    {"uuid":"mat-loyalty","type":"MeshStandardMaterial","color":0xF3C800,"roughness":0.48,"metalness":0.1,"emissive":0x4A2E00,"emissiveIntensity":0.18},
    {"uuid":"mat-black","type":"MeshStandardMaterial","color":0x111111,"roughness":0.72,"metalness":0.3},
    {"uuid":"mat-screen","type":"MeshBasicMaterial","color":0xFFB000},
    {"uuid":"mat-marker","type":"MeshBasicMaterial","color":0xFFFF00,"transparent":True,"opacity":0.12},
    {"uuid":"mat-route","type":"MeshBasicMaterial","color":0x9A5A00,"transparent":True,"opacity":0.22},
]

children: list[dict] = []
_counter = 0

def mesh(name, position, scale=(1,1,1), material="mat-commercial", gameplay_type=None, **user_data):
    global _counter
    _counter += 1
    data = user_data.copy()
    if gameplay_type: data["gameplayType"] = gameplay_type
    obj = {
        "uuid":f"shillz-{_counter:03d}", "type":"Mesh", "name":name,
        "geometry":"geo-unit", "material":material,
        "position":list(position), "scale":list(scale),
    }
    if data: obj["userData"] = data
    children.append(obj)
    return obj

# Ground, containment, controlled gates.
mesh("E2049_FLOOR_ENGAGEMENT_SQUARE", (0,0.1,0), (70,0.2,90), "mat-asphalt", "floor")
mesh("E2049_BLOCKER_NORTH", (0,2.5,-45), (70,5,1), "mat-black", "arenaWall", blocksPlayer=True)
mesh("E2049_BLOCKER_SOUTH", (0,2.5,45), (70,5,1), "mat-black", "arenaWall", blocksPlayer=True)
mesh("E2049_BLOCKER_WEST", (-35,2.5,0), (1,5,90), "mat-black", "arenaWall", blocksPlayer=True)
mesh("E2049_BLOCKER_EAST", (35,2.5,0), (1,5,90), "mat-black", "arenaWall", blocksPlayer=True)
mesh("E2049_ENTRY_GATE_SHILLZ", (0,2,41), (10,4,1), "mat-loyalty", "entryGate")
mesh("E2049_EXTRACTION_GATE_VISUAL_SHILLZ", (0,2,-41), (10,4,1), "mat-loyalty", "extractionGateVisual")

# Required gameplay markers.
mesh("E2049_PLAYER_START", (0,0.5,37), (1.2,0.2,1.2), "mat-marker", "playerStart", yawDegrees=180)
mesh("E2049_OBJECTIVE_LOYALTY_BROADCAST", (0,0.5,3), (2,0.2,2), "mat-marker", "objective", objectiveId="shillz-disable-loyalty-broadcast", objectiveType="activateTerminal")
mesh("E2049_OBJECTIVEPROP_LOYALTY_KIOSK", (0,2.2,3), (4,4.4,2), "mat-screen", "objectiveProp", objectiveId="shillz-disable-loyalty-broadcast")
mesh("E2049_BOSS_ARENA_RIYA", (0,0.5,-32), (4,0.2,4), "mat-marker", "bossArena", bossId="riya")
mesh("E2049_EXTRACTION_GATE_SHILLZ", (0,0.5,-39), (4,0.2,2), "mat-marker", "extractionGate", targetArea="rebel-haven")
mesh("E2049_COMBAT_ZONE_MAIN", (0,0.2,-8), (62,0.2,60), "mat-marker", "combatZone")

# Main, west flank and elevated east route.
mesh("E2049_ROUTE_MAIN", (0,0.22,5), (8,0.04,62), "mat-route", "routeHint", routeId="main")
mesh("E2049_ROUTE_FLANK_WEST", (-24,0.22,2), (5,0.04,58), "mat-route", "routeHint", routeId="west-flank")
mesh("E2049_ROUTE_ELEVATED_EAST", (23,4.0,-4), (6,0.4,42), "mat-black", "traversal", routeId="east-elevated", climb=True)
for i, z in enumerate((16,10,4,-2,-8,-14)):
    y = 0.35 + i * 0.6
    mesh(f"E2049_TRAVERSAL_UPPER_RAMP_{i:02d}", (18+i*0.8,y,z), (7,0.5,7), "mat-commercial", "traversal", climb=True)
for side in (-1,1):
    mesh(f"E2049_RAIL_UPPER_{'W' if side<0 else 'E'}", (23+side*3.2,5,-4), (0.3,2,42), "mat-black", "railing", blocksPlayer=True)

# Readable cover islands and cheap commercial barriers.
cover_positions = [(-12,10),(12,10),(-8,1),(8,1),(-14,-9),(14,-9),(-8,-19),(8,-19),(-24,20),(24,20),(-26,5),(26,5),(-24,-13),(24,-13),(-15,29),(15,29),(-5,24),(5,24),(-17,-27),(17,-27)]
for i,(x,z) in enumerate(cover_positions):
    sx,sz = ((5,1.6) if i%2==0 else (2,4))
    mesh(f"E2049_COVER_COMMERCIAL_{i:02d}", (x,0.8,z), (sx,1.6,sz), "mat-commercial" if i%3 else "mat-black", "cover", climb=True)

# Enemy and pickup groups above ground.
spawn_positions = [(-27,29),(27,29),(-21,15),(21,15),(-28,0),(28,0),(-20,-14),(20,-14),(-12,-25),(12,-25),(-26,-30),(26,-30)]
for i,(x,z) in enumerate(spawn_positions):
    mesh(f"E2049_ENEMY_SPAWN_SHILLZ_{i:02d}", (x,0.5,z), (1,0.2,1), "mat-marker", "enemySpawn", spawnGroup=i//4, faction="shillz")
for i,(x,z) in enumerate([(-18,32),(18,32),(-28,12),(28,12),(-18,-5),(18,-5),(-12,-22),(12,-22)]):
    mesh(f"E2049_PICKUP_SPAWN_{i:02d}", (x,0.5,z), (0.8,0.2,0.8), "mat-marker", "pickupSpawn")

# Commercial plaza, merch alley, public-service propaganda and loyalty infrastructure.
for i,z in enumerate((30,20,10,0,-10,-20)):
    mesh(f"E2049_PROP_MERCH_STALL_WEST_{i:02d}", (-30,2,z), (7,4,6), "mat-commercial", "setpiece", setpieceType="merchStall")
    mesh(f"E2049_PROP_SERVICE_KIOSK_EAST_{i:02d}", (30,2,z), (7,4,6), "mat-loyalty", "setpiece", setpieceType="loyaltyKiosk")

slogans = [
    "GIGACORP PROVIDES", "ORDER IS FREEDOM", "OBEDIENCE BUILDS PEACE", "REPORT DISSENT",
    "THE BOARD KNOWS BEST", "CONSUME WITH PRIDE", "LOYALTY EARNS REWARDS", "TRUST THE PROCESS",
    "WORLD PEACE REQUIRES COMPLIANCE", "AUTHORIZED CONTENT ONLY", "GOOD CITIZENS ENGAGE",
    "SECURITY IS EVERYONE'S RESPONSIBILITY", "SUPPORT OUR EXECUTIVES", "PROTECT THE SYSTEM",
    "REBELLION COSTS JOBS", "GIGACORP CARES",
]
for i,text in enumerate(slogans):
    x = -32 if i%2==0 else 32
    z = 35 - (i//2)*9
    mesh(f"E2049_SIGN_LOYALTY_{i:02d}", (x,5,z), (0.3,5,7), "mat-screen", "billboard", text=text, faction="shillz")

# Rally stage, executive shrine, social-credit boards and sponsor pylons.
mesh("E2049_PROP_RIYA_BROADCAST_STAGE", (0,2,-31), (20,4,8), "mat-black", "setpiece", setpieceType="influencerStage")
mesh("E2049_PROP_EXECUTIVE_SHRINE", (0,5,-43), (16,10,2), "mat-loyalty", "setpiece", setpieceType="executiveShrine")
for i,x in enumerate((-18,-9,9,18)):
    mesh(f"E2049_PROP_SOCIAL_CREDIT_BOARD_{i:02d}", (x,4,20), (6,8,1), "mat-screen", "setpiece", setpieceType="socialCreditBoard")
for i,(x,z) in enumerate([(-10,34),(10,34),(-10,-25),(10,-25)]):
    mesh(f"E2049_PROP_SPONSOR_PYLON_{i:02d}", (x,4,z), (2,8,2), "mat-loyalty", "setpiece", setpieceType="sponsorPylon")

children.extend([
    {"uuid":"light-hemi","type":"HemisphereLight","name":"E2049_LIGHT_AMBIENT_SHILLZ","color":0xFFD36A,"groundColor":0x17120A,"intensity":0.7},
    {"uuid":"light-sun","type":"DirectionalLight","name":"E2049_LIGHT_KEY_SHILLZ","color":0xFFE0A0,"intensity":1.3,"position":[-20,35,25]},
])

scene = {
    "metadata":{"version":4.5,"type":"Object","generator":"Earth 2049 ShillZ Central MVP builder"},
    "geometries":GEOMETRIES,
    "materials":MATERIALS,
    "object":{
        "uuid":"scene-shillz-central-mvp-v2", "type":"Scene", "name":"SHILLZ CENTRAL — ENGAGEMENT SQUARE",
        "userData":{
            "district":"shillz-central", "area":"engagement-square", "faction":"shillz", "version":"mvp-v2",
            "skyboxFaction":"shillz", "combatDisabled":False,
            "canon":"pro-GigaCorp consumer-loyalist civilian district; no Rebel or anti-GigaCorp imagery",
        },
        "children":children,
    },
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(scene, indent=2) + "\n")
print(f"Wrote {OUT.relative_to(ROOT)} with {len(children)} objects")
