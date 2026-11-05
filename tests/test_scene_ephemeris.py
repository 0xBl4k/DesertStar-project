"""The global scene and site analysis must use the same NASA/SPICE samples."""
import json
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.main import app
from core.windows import directions

client = TestClient(app)
WINDOW = {"start_utc": "2026-11-15T00:00:00Z",
          "end_utc": "2026-11-16T00:00:00Z", "step_minutes": 60}


def test_scene_requires_no_site_and_returns_centered_vectors():
    response = client.post('/api/ephemeris', json=WINDOW)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['origin'] == 'MOON'
    assert result['frame'] == 'MOON_ME_DE440_ME421'
    assert result['units'] == 'km'
    assert len(result['samples']) == 25
    stored = json.loads((Path(__file__).parents[1] / 'data/ephemeris.json').read_text())
    for sample, index in [(result['samples'][0], 14*24), (result['samples'][-1], 15*24)]:
        for body in ('sun_km', 'earth_km'):
            assert sample[body] == pytest.approx(stored[body][index])


def test_scene_and_site_results_agree_without_moving_global_bodies():
    scene = client.post('/api/ephemeris', json=WINDOW).json()
    for lat, lon in [(-89.4389, -137.1436), (0, 0), (89.4389, 42.8564)]:
        site = client.post('/api/visibility', json={**WINDOW, 'mode': 'custom', 'lat': lat, 'lon': lon}).json()
        for body in ('sun', 'earth'):
            vectors = np.array([sample[body+'_km'] for sample in scene['samples']])
            el, az = directions(vectors, lat, lon)
            assert [s[body]['el'] for s in site['samples']] == pytest.approx(el)
            assert [s[body]['az'] for s in site['samples']] == pytest.approx(az)
    assert client.post('/api/ephemeris', json=WINDOW).json() == scene


def test_fractional_utc_vectors_use_the_same_interpolation_as_visibility():
    window = {**WINDOW, 'start_utc': '2026-11-15T00:30:00Z', 'end_utc': '2026-11-15T01:30:00Z'}
    result = client.post('/api/ephemeris', json=window).json()
    stored = json.loads((Path(__file__).parents[1] / 'data/ephemeris.json').read_text())
    for body in ('sun_km', 'earth_km'):
        expected = (np.array(stored[body][336])+np.array(stored[body][337]))/2
        assert result['samples'][0][body] == pytest.approx(expected)


def test_last_full_cycle_reaches_exact_coverage_endpoint():
    start = datetime.fromisoformat('2027-10-02T11:00:00+00:00')
    result = client.post('/api/ephemeris', json={**WINDOW, 'start_utc': start.isoformat(),
        'end_utc': (start+timedelta(hours=709)).isoformat()}).json()
    assert len(result['samples']) == 710
    assert result['samples'][-1]['t'] == 709*60
    assert result['end_utc'] == '2027-11-01T00:00:00+00:00'


@pytest.mark.parametrize('changes', [
    {'start_utc': '2026-11-15T00:00:00'},
    {'step_minutes': 0}, {'end_utc': '2026-11-14T00:00:00Z'},
    {'end_utc': '2027-11-02T00:00:00Z'},
    {'end_utc': '2027-01-01T00:00:00Z', 'step_minutes': 5},
])
def test_scene_window_validation(changes):
    assert client.post('/api/ephemeris', json={**WINDOW, **changes}).status_code == 422


def test_global_endpoint_rejects_site_fields():
    assert client.post('/api/ephemeris', json={**WINDOW, 'lat': 0, 'lon': 0}).status_code == 422


def test_unknown_source_frame_is_not_mislabeled_as_moon_fixed(monkeypatch):
    from api.services.data_store import load_ephemeris
    monkeypatch.setitem(load_ephemeris(), 'frame', 'J2000')
    response = client.post('/api/ephemeris', json=WINDOW)
    assert response.status_code == 503
    assert 'frame' in response.json()['detail']
