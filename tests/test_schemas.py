"""Pydantic request validation tests. No server or scientific files needed."""
import pytest
from pydantic import ValidationError

from api.schemas import VisibilityRequest

BASE = {
    "mode": "preset",
    "site_id": "Site01_highest_point",
    "start_utc": "2026-11-15T00:00:00Z",
    "end_utc": "2026-11-16T00:00:00Z",
    "step_minutes": 60,
}


def test_valid_preset():
    request = VisibilityRequest(**BASE)
    assert request.mode == "preset"
    assert request.site_id == "Site01_highest_point"


def test_valid_custom():
    request = VisibilityRequest(**{
        **BASE, "mode": "custom", "site_id": None,
        "lat": -89.4, "lon": -137.1,
    })
    assert request.lat == -89.4
    assert request.lon == -137.1


@pytest.mark.parametrize("changes", [
    {"mode": "unknown"},
    {"site_id": None},
    {"lat": -89.4},  # Preset must not provide custom coordinates
    {"mode": "custom", "site_id": None, "lat": -89.4},  # Missing lon
    {"mode": "custom", "lat": -89.4, "lon": 10},  # Custom must not have site_id
    {"mode": "custom", "site_id": None, "lat": -91, "lon": 0},
    {"mode": "custom", "site_id": None, "lat": -89, "lon": 361},
    {"step_minutes": 4},
    {"step_minutes": 361},
    {"start_utc": "2026-11-15T00:00:00"},  # No timezone
    {"start_utc": "2026-11-15T03:00:00+03:00"},  # Not UTC
    {"end_utc": "2026-11-15T00:00:00Z"},  # Zero duration
    {"end_utc": "2026-11-14T00:00:00Z"},  # Reversed dates
    {"end_utc": "2027-11-16T00:00:00Z"},  # More than 365 days
    {"end_utc": "2027-01-01T00:00:00Z", "step_minutes": 5},  # > 10,000 samples
])
def test_invalid_requests(changes):
    with pytest.raises(ValidationError):
        VisibilityRequest(**{**BASE, **changes})
        

def test_valid_full_year():
    request = VisibilityRequest(
        mode="preset",
        site_id="Site01_highest_point",
        start_utc="2026-11-01T00:00:00Z",
        end_utc="2027-11-01T00:00:00Z",
        step_minutes=60
    )

    assert (request.end_utc - request.start_utc).days == 365
    assert request.step_minutes == 60
