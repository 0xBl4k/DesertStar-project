"""HTTP integration tests using the real ephemeris + the high-point horizon."""
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)
BASE = {
    "mode": "preset",
    "site_id": "Site01_highest_point",
    "start_utc": "2026-11-15T00:00:00Z",
    "end_utc": "2026-11-16T00:00:00Z",
    "step_minutes": 60,
}


def test_preset_samples_and_summary():
    response = client.post("/api/visibility", json=BASE)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "terrain_visibility"
    assert len(data["horizon"]) == 360
    assert len(data["samples"]) == 25
    assert [data["samples"][0]["t"], data["samples"][-1]["t"]] == [0, 1440]
    assert data["summary"]["sun_pct"] == 100
    assert data["summary"]["earth_pct"] == pytest.approx(46.24, abs=0.02)
    assert data["summary"]["avg_sun_el_deg"] == pytest.approx(1.323, abs=0.005)
    assert data["summary"]["longest_dark_hours"] == 0


def test_earthrise_transition():
    response = client.post("/api/visibility", json=BASE)
    assert response.status_code == 200, response.text
    data = response.json()
    windows = data["earth_windows"]
    assert len(windows) == 1
    actual = datetime.fromisoformat(windows[0]["start"])
    expected = datetime.fromisoformat("2026-11-15T12:54:12.855610+00:00")
    assert abs((actual - expected).total_seconds()) < 1
    assert windows[0]["end"] == "2026-11-16T00:00:00+00:00"
    assert data["samples"][12]["earth"]["visible"] is False
    assert data["samples"][13]["earth"]["visible"] is True


def test_custom_coordinates_are_geometry_only():
    preset = client.post("/api/visibility", json=BASE).json()
    response = client.post("/api/visibility", json={
        **BASE, "mode": "custom", "site_id": None,
        "lat": preset["lat"], "lon": preset["lon"],
    })
    assert response.status_code == 200, response.text
    custom = response.json()
    assert custom["status"] == "geometry_only"
    assert custom["horizon"] is None
    assert custom["summary"] is None
    assert custom["earth_windows"] is None
    assert custom["sun_windows"] is None
    for old, new in zip(preset["samples"], custom["samples"]):
        for body in ("sun", "earth"):
            assert "visible" not in new[body]
            assert new[body]["el"] == pytest.approx(old[body]["el"])
            assert new[body]["az"] == pytest.approx(old[body]["az"])


def test_unknown_site_returns_404():
    response = client.post("/api/visibility", json={**BASE, "site_id": "not_a_site"})
    assert response.status_code == 404
    assert "site" in response.json()["detail"].lower()


def test_outside_ephemeris_returns_422():
    response = client.post("/api/visibility", json={
        **BASE, "start_utc": "2026-10-31T00:00:00Z",
        "end_utc": "2026-11-01T00:00:00Z",
    })
    assert response.status_code == 422


def test_windows_stay_within_requested_interval():
    response = client.post("/api/visibility", json={
        **BASE, "start_utc": "2026-11-15T12:00:00Z",
        "end_utc": "2026-11-15T14:00:00Z", "step_minutes": 5,
    })
    assert response.status_code == 200, response.text
    start = datetime.fromisoformat("2026-11-15T12:00:00+00:00")
    end = datetime.fromisoformat("2026-11-15T14:00:00+00:00")
    for name in ("sun_windows", "earth_windows"):
        for window in response.json()[name]:
            a = datetime.fromisoformat(window["start"])
            b = datetime.fromisoformat(window["end"])
            assert start <= a < b <= end


def test_sites_endpoint():
    response = client.get("/api/sites")
    assert response.status_code == 200, response.text
    assert isinstance(response.json(), (list, dict))
