"""Backend failure, CORS, and deployment-readiness tests."""
import json

import pytest
from fastapi.testclient import TestClient

from api import main
from api.services import data_store as store
from api.services import visibility as vis

client = TestClient(main.app)
BASE = {
    "mode": "preset", "site_id": "Site01_highest_point",
    "start_utc": "2026-11-15T00:00:00Z",
    "end_utc": "2026-11-16T00:00:00Z",
    "step_minutes": 60,
}


@pytest.fixture(autouse=True)
def clear_caches_after_test():
    yield
    # Important after monkeypatch restores original data paths.
    store.load_horizon.cache_clear()
    store.load_ephemeris.cache_clear()
    vis.cached_vectors.cache_clear()


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ready():
    response = client.get("/ready")
    assert response.status_code == 200, response.text
    assert response.json() == {"status": "ready"}


def test_cors_preflight():
    origin = "http://localhost:5500" if "*" in main.origins else main.origins[0]
    response = client.options("/api/visibility", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert response.status_code == 200, response.text
    assert response.headers["access-control-allow-origin"] in ("*", origin)
    assert "POST" in response.headers["access-control-allow-methods"]


def test_missing_site_catalog(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "SITES_FILE", tmp_path / "missing.json")
    assert client.get("/api/sites").status_code == 404
    assert client.get("/ready").status_code == 503


def test_corrupt_site_catalog(tmp_path, monkeypatch):
    path = tmp_path / "sites.json"
    path.write_text("not valid JSON", encoding="utf-8")
    monkeypatch.setattr(main, "SITES_FILE", path)
    assert client.get("/api/sites").status_code == 503


def test_missing_horizon_is_503(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "HORIZON_DIR", tmp_path)
    store.load_horizon.cache_clear()
    response = client.post("/api/visibility", json=BASE)
    assert response.status_code == 503, response.text


@pytest.mark.parametrize("bad_horizon", [
    [0.0] * 359,            # Wrong length
    [0.0] * 359 + [-90.0], # Missing-data sentinel
    [0.0] * 359 + ["bad"], # Non-numeric measurement
])
def test_invalid_horizon_is_503(tmp_path, monkeypatch, bad_horizon):
    site = dict(store.load_horizon("Site01_highest_point"))
    site["horizon_deg"] = bad_horizon
    (tmp_path / "horizon_Site01_highest_point.json").write_text(
        json.dumps(site), encoding="utf-8"
    )
    monkeypatch.setattr(store, "HORIZON_DIR", tmp_path)
    store.load_horizon.cache_clear()
    response = client.post("/api/visibility", json=BASE)
    assert response.status_code == 503, response.text


def test_invalid_ephemeris_vectors_are_503(tmp_path, monkeypatch):
    eph = dict(store.load_ephemeris())
    eph["earth_km"] = [[0, 1, 2]]  # Doesn't match Sun's vector count
    (tmp_path / "ephemeris.json").write_text(json.dumps(eph), encoding="utf-8")
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    store.load_ephemeris.cache_clear()
    vis.cached_vectors.cache_clear()
    response = client.post("/api/visibility", json=BASE)
    assert response.status_code == 503, response.text


def test_end_of_ephemeris_no_array_overflow():
    response = client.post("/api/visibility", json={
        "mode": "custom", "lat": -89.4, "lon": -137.1,
        "start_utc": "2027-10-31T23:00:00Z",
        "end_utc": "2027-11-01T00:00:00Z",
        "step_minutes": 60,
    })
    assert response.status_code == 200, response.text
    assert len(response.json()["samples"]) == 2
