"""Optional independent NASA/JPL recomputation: pip install numpy spiceypy.

Download the four named NAIF kernels into --kernel-dir (see report URLs).
This developer check does not add a dependency or network call to the API.
"""
import argparse
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import spiceypy as spice

ROOT = Path(__file__).resolve().parents[1]
KERNELS = {
    'naif0012.tls': 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls',
    'de440s.bsp': 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp',
    'moon_pa_de440_200625.bpc': 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc',
    'moon_de440_250416.tf': 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf',
}


def audit(kernel_dir):
    source = ROOT / 'data/ephemeris.json'
    data = json.loads(source.read_text())
    start = datetime.fromisoformat(data['start_utc']).replace(tzinfo=timezone.utc)
    step = data['step_s']
    vectors = {body: np.asarray(data[body.lower()+'_km'], dtype=float) for body in ('SUN', 'EARTH')}
    report = {
        'method': 'Fresh NASA/JPL DE440s SPICE LT+S vectors at actual UTC timestamps, compared with the bundled rounded/hourly interpolated data',
        'frame': data['frame'], 'origin': 'MOON',
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'kernels': {name: {'url': url, 'sha256': hashlib.sha256((kernel_dir/name).read_bytes()).hexdigest()}
                    for name, url in KERNELS.items()},
        'results': {},
    }
    try:
        for name in KERNELS:
            spice.furnsh(str(kernel_dir/name))
        for body, stored in vectors.items():
            maxima = {kind: {'samples': 0, 'max_direction_error_deg': 0., 'max_position_error_km': 0.}
                      for kind in ('hourly', 'half_hour')}
            for tick in range((len(stored)-1)*2+1):
                index, part = tick//2, (tick % 2)/2
                moment = start+timedelta(seconds=tick*step/2)
                exact = np.asarray(spice.spkpos(body, spice.str2et(moment.strftime('%Y-%m-%d %H:%M:%S UTC')), data['frame'], 'LT+S', 'MOON')[0])
                value = stored[index] if part == 0 else (stored[index]+stored[index+1])/2
                angle = float(np.degrees(np.arctan2(np.linalg.norm(np.cross(exact, value)), exact @ value)))
                distance = float(np.linalg.norm(exact-value))
                entry = maxima['hourly' if part == 0 else 'half_hour']
                entry['samples'] += 1
                if angle > entry['max_direction_error_deg']:
                    entry['max_direction_error_deg'] = angle
                    entry['worst_direction_utc'] = moment.isoformat()
                entry['max_position_error_km'] = max(entry['max_position_error_km'], distance)
            report['results'][body] = maxima
            assert max(v['max_direction_error_deg'] for v in maxima.values()) < .001, report
    finally:
        spice.kclear()
    report['limits'] = [
        'This compares the whole annual grid and all half-hour midpoints, not every possible instant.',
        'Hourly linear interpolation is approximate; solar position error is mostly radial chord error.',
        'Body directions are astronomical; displayed body radii and distances are schematic.',
        'Local terrain horizon profiles and rendering shadows are separate approximations.',
    ]
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kernel-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    report = audit(args.kernel_dir)
    text = json.dumps(report, indent=2)+'\n'
    if args.output:
        args.output.write_text(text)
    print(text)
