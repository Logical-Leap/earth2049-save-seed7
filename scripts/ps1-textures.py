"""PS1-scale runtime textures.

Rewrites the textures the game actually streams to players at PS1-like sizes:

  * faction district tiles   assets/textures/<faction>_textureN.png   1254px -> 256px, 256-colour palette
  * skybox cubemaps          .../skybox(es)/*_{px,nx,py,ny,pz,nz}.png  1024px -> 512px, 256-colour palette
  * skybox equirect previews .../*_equirectangular_2x1.png             2048px -> 1024px, 256-colour palette
  * Hub GLB embedded images  rebel-hub-haven-commons-final.glb         1024px -> 256px
                             (colour maps palettised; normal/roughness/AO kept RGB)

Originals stay in git history (commit 7a834ed and earlier). Recover any file with
    git show 7a834ed:<path> > <path>
The hub's authoring texture pack (assets/textures/rebel-hub-haven-commons-v3-texture-pack/)
is left at full size as the build source and is not shipped to Pages.

    python3 scripts/ps1-textures.py            # convert in place
    python3 scripts/ps1-textures.py --check    # report sizes only
"""
import glob
import io
import json
import os
import struct
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECK = '--check' in sys.argv
TILE = 256
SKY_FACE = 512
SKY_EQ = (1024, 512)
GLB_MAX = 256
HUB_GLB = 'assets/models/rebel-hub-haven-commons-final/rebel-hub-haven-commons-final.glb'


def palettise(im, colours=256):
    """Median-cut to a 256-colour palette (an 8-bit CLUT), no dithering:
    the PS1 render pass dithers the final frame."""
    rgb = im.convert('RGB')
    return rgb.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def png_bytes(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def convert_file(path, size, palette=True):
    with Image.open(path) as im:
        if im.size[0] <= size[0] and im.size[1] <= size[1]:
            return 0, 0
        out = im.convert('RGB').resize(size, Image.LANCZOS)
    before = os.path.getsize(path)
    if palette:
        out = palettise(out)
    data = png_bytes(out)
    if not CHECK:
        with open(path, 'wb') as f:
            f.write(data)
    return before, len(data)


def rewrite_glb(path):
    with open(path, 'rb') as f:
        raw = f.read()
    magic, version, _length = struct.unpack('<III', raw[:12])
    if magic != 0x46546C67 or version != 2:
        raise ValueError(f'{path} is not a glTF 2 binary')
    jlen = struct.unpack('<I', raw[12:16])[0]
    gltf = json.loads(raw[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack('<I', raw[off:off + 4])[0]
    binary = raw[off + 8:off + 8 + blen]

    views = gltf['bufferViews']
    image_views = {im['bufferView']: i for i, im in enumerate(gltf.get('images', [])) if 'bufferView' in im}
    # Which images are colour maps (palettise) vs data maps (keep RGB)?
    colour = set()
    for m in gltf.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        for key in (pbr.get('baseColorTexture'), m.get('emissiveTexture')):
            if key:
                colour.add(gltf['textures'][key['index']]['source'])

    new_bin = bytearray()
    for vi, view in enumerate(views):
        chunk = binary[view.get('byteOffset', 0): view.get('byteOffset', 0) + view['byteLength']]
        if vi in image_views:
            ii = image_views[vi]
            with Image.open(io.BytesIO(chunk)) as src:
                src.load()
                im = src.copy()
            w, h = im.size
            scale = min(1.0, GLB_MAX / max(w, h))
            if scale < 1.0:
                has_alpha = im.mode in ('RGBA', 'LA') or 'transparency' in im.info
                im = im.convert('RGBA' if has_alpha else ('L' if im.mode == 'L' else 'RGB'))
                im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
                if ii in colour and not has_alpha and im.mode == 'RGB':
                    im = palettise(im)
                chunk = png_bytes(im)
                gltf['images'][ii]['mimeType'] = 'image/png'
        while len(new_bin) % 4:
            new_bin.append(0)
        view['byteOffset'] = len(new_bin)
        view['byteLength'] = len(chunk)
        new_bin += chunk
    while len(new_bin) % 4:
        new_bin.append(0)
    gltf['buffers'][0]['byteLength'] = len(new_bin)

    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(new_bin)
    out = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js \
        + struct.pack('<II', len(new_bin), 0x004E4942) + bytes(new_bin)
    if not CHECK:
        with open(path, 'wb') as f:
            f.write(out)
    return len(raw), len(out)


def main():
    os.chdir(ROOT)
    rows = []
    for p in sorted(glob.glob('assets/textures/*_texture*.png')):
        rows.append((p, *convert_file(p, (TILE, TILE))))
    for p in sorted(glob.glob('assets/textures/**/*skybox*/**/*.png', recursive=True)):
        if 'equirectangular' in p:
            rows.append((p, *convert_file(p, SKY_EQ)))
        else:
            rows.append((p, *convert_file(p, (SKY_FACE, SKY_FACE))))
    if os.path.exists(HUB_GLB):
        rows.append((HUB_GLB, *rewrite_glb(HUB_GLB)))
    done = [r for r in rows if r[1]]
    before = sum(r[1] for r in done)
    after = sum(r[2] for r in done)
    for p, b, a in done:
        print(f'{b // 1024:>7} KB -> {a // 1024:>5} KB  {p}')
    print(f'{"checked" if CHECK else "converted"} {len(done)} files: {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
