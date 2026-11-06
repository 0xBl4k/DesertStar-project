"""Compare NASA GLB texture samples to an independent lunar longitude/latitude map.

Optional development check: python -m pip install numpy pillow
Use --reference /path/to/lroc_color_poles_2k.tif to avoid a network download.
"""
import argparse
import hashlib
import io
import itertools
import json
import struct
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def verify(reference_path=None):
    model = Path(__file__).resolve().parents[1] / "public/models/nasa-moon-color.glb"
    payload = model.read_bytes()
    digest = hashlib.sha1(b"blob " + str(len(payload)).encode() + b"\0" + payload).hexdigest()
    if digest != "19bf19b7860edb5e3394bb51d96d5cf127656c9f":
        raise ValueError("This check is registered to the included NASA moon_small.glb")
    json_length = struct.unpack_from("<I", payload, 12)[0]
    document = json.loads(payload[20:20 + json_length])
    binary_start = 28 + json_length

    def array(index, components):
        accessor = document["accessors"][index]
        view = document["bufferViews"][accessor["bufferView"]]
        offset = binary_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        values = np.frombuffer(payload, dtype="<f4", count=accessor["count"] * components, offset=offset)
        return values.reshape(-1, components)[::3]

    xyz, uv = array(0, 3), array(2, 2)
    xyz = xyz / np.linalg.norm(xyz, axis=1)[:, None]
    image_view = document["bufferViews"][document["images"][0]["bufferView"]]
    image_start = binary_start + image_view.get("byteOffset", 0)
    image_bytes = payload[image_start:image_start + image_view["byteLength"]]
    if reference_path:
        reference_bytes = Path(reference_path).read_bytes()
    else:
        url = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_2k.tif"
        with urllib.request.urlopen(url, timeout=30) as response:
            reference_bytes = response.read()
    with Image.open(io.BytesIO(image_bytes)) as image:
        atlas = np.asarray(image.convert("L").filter(ImageFilter.GaussianBlur(3)), dtype=float)
    with Image.open(io.BytesIO(reference_bytes)) as image:
        reference = np.asarray(image.convert("L").filter(ImageFilter.GaussianBlur(1)), dtype=float)

    # glTF image UV v=0 samples the top image row (GLTFLoader sets flipY=false).
    colors = atlas[np.clip((uv[:, 1] * (atlas.shape[0] - 1)).astype(int), 0, atlas.shape[0] - 1),
                   np.clip((uv[:, 0] * (atlas.shape[1] - 1)).astype(int), 0, atlas.shape[1] - 1)]
    scores = []
    for permutation in itertools.permutations(range(3)):
        for signs in itertools.product([-1, 1], repeat=3):
            rotation = np.zeros((3, 3))
            for row, column in enumerate(permutation):
                rotation[row, column] = signs[row]
            transformed = xyz @ rotation.T
            longitude = np.arctan2(transformed[:, 1], transformed[:, 0])
            latitude = np.arcsin(transformed[:, 2])
            x = np.clip(((longitude + np.pi) / (2 * np.pi) * (reference.shape[1] - 1)).astype(int), 0, reference.shape[1] - 1)
            y = np.clip(((.5 - latitude / np.pi) * (reference.shape[0] - 1)).astype(int), 0, reference.shape[0] - 1)
            keep = np.abs(latitude) < np.radians(65)
            score = float(np.corrcoef(colors[keep], reference[y, x][keep])[0, 1])
            scores.append((score, permutation, signs, float(np.linalg.det(rotation))))
    scores.sort(reverse=True)
    best = scores[0]
    assert best[1:3] == ((2, 0, 1), (-1, -1, 1)), best
    assert best[0] > .9 and best[3] > .99, best
    print(json.dumps({"model_blob_sha": digest, "best_native_to_moon_fixed": best,
                      "runner_up": scores[1], "samples": len(xyz)}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path)
    args = parser.parse_args()
    verify(args.reference)
