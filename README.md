# DesertStar — Lunar South Pole Mission Planner

**Exploring sunlight, terrain visibility, and direct-to-Earth communication at candidate lunar landing sites.**

DesertStar is a team project developed for the **NASA Space Apps Challenge 2026**. It aims to make lunar south pole mission planning easier to explore by combining precomputed Sun/Earth ephemeris data with terrain-dependent horizon profiles. Users can choose a supported site and time interval, or enter lunar coordinates, to examine how the Sun and Earth move relative to the local horizon.

> **Project status:** The FastAPI backend supports preset-site visibility analysis and custom-coordinate geometry. The frontend and deployment are developed separately. Results are exploratory, not certified for operational mission decisions. This is an independent hackathon project, not an official NASA tool.

## Why this matters

Near the Moon's south pole, small differences in terrain, location, and landing time can change how much sunlight a site receives and when Earth is visible. These conditions affect solar-power planning, thermal constraints, and direct-to-Earth communication. DesertStar brings the underlying data into a consistent API that can support visual comparisons across sites and dates.

## Implemented capabilities

- **Preset lunar sites:** Sun and Earth elevation/azimuth, 360-direction terrain horizons, center-of-body visibility, visibility windows, and summary metrics.
- **Custom coordinates:** Sun and Earth elevation/azimuth at a supplied lunar latitude and longitude. Terrain-based visibility for arbitrary locations is **not yet available**.
- **Flexible dates:** Requests can span up to **365 days**, within the available ephemeris coverage, subject to a **10,000-sample** limit.
- **Visibility windows:** Approximate Sun-rise/set and Earth-rise/set intervals calculated from the precomputed data and local terrain horizons.
- **Summary metrics:** Sun visibility percentage, Earth visibility percentage, average Sun elevation, and longest continuous darkness in the requested period.
- **Backend reliability:** Request validation, controlled HTTP errors, health/readiness endpoints, automated tests, and cached ephemeris arrays.

**Not yet implemented in the API:** Dedicated multi-site comparison endpoint, arbitrary-coordinate terrain horizons, solar-array power modeling, fractional solar-disc/earth-disc visibility, and an operationally validated uncertainty model. Visualization and interaction belong to the separate frontend workstream.

## Technology

| Area | Technology |
| --- | --- |
| API | Python, FastAPI, Pydantic, Uvicorn |
| Numerical processing | NumPy |
| Ephemeris generation (offline) | SPICE / `spiceypy`, JPL/NAIF kernels |
| Terrain preprocessing (offline) | Rasterio, DEM data |
| Testing | pytest, FastAPI TestClient |
| Deployment configuration | Render (`render.yaml`) |

The **running API uses precomputed JSON data**; SPICE kernels and raw DEM files are primarily needed to regenerate the scientific datasets, not for the normal visibility endpoint.

## Repository structure

```text
DesertStar-project/
├── api/
│   ├── main.py                  # API routes, CORS, health and readiness
│   ├── schemas.py               # Request validation
│   ├── requirements.txt         # Existing project dependency list
│   └── services/
│       ├── data_store.py        # Load and validate scientific JSON
│       └── visibility.py        # Time selection, core integration, JSON response
├── core/
│   ├── windows.py               # Direction, horizon margin and crossing functions
│   ├── sunlib.py                # SPICE-based geometry utilities
│   ├── moon_site.py             # Scientific exploration/validation script
│   ├── terrain.py               # Terrain profile generation script
│   └── export_ephemeris.py      # Offline ephemeris export
├── data/
│   ├── ephemeris.json           # Precomputed Sun/Earth vectors
│   ├── horizons/                # Preset 360-degree horizon profiles
│   ├── dem/                     # DEM data or download instructions
│   └── kernels/                 # SPICE kernels or download instructions
├── frontend/
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── data/sites.json          # Frontend site catalog
├── precompute/
│   └── build_presets.py         # Legacy script; see note below
├── tests/
│   ├── test_schemas.py
│   ├── test_api.py
│   └── test_reliability.py
├── render.yaml                  # Deployment configuration (when included)
└── LICENSE
```

> **Precompute note:** The current `precompute/build_presets.py` references `core.horizon` and `core.sun_earth`, interfaces that do not exist in the present `core/` layout. It is **not required** to run the API and must be updated before use.

## Quick start (backend)

Run these commands from the **repository root**:

```bash
# Create and activate a virtual environment if one does not already exist
python -m venv venv
source venv/bin/activate              # Linux/macOS

# Install the project's existing dependencies
python -m pip install -r api/requirements.txt

# Start the API
python -m uvicorn api.main:app --reload
```

Open:

- **Interactive API documentation:** <http://127.0.0.1:8000/docs>
- **API health:** <http://127.0.0.1:8000/health>
- **API readiness:** <http://127.0.0.1:8000/ready>

> The API expects `data/ephemeris.json`, the required `data/horizons/*.json`, and `frontend/data/sites.json` at the paths shown above. Launch Uvicorn from the repository root so imports and relative paths resolve correctly.

## API reference

### `GET /api/sites`

Returns the site catalog from `frontend/data/sites.json`.

```bash
curl http://127.0.0.1:8000/api/sites
```

### `POST /api/visibility`

Computes geometry for the requested location and time interval. Preset sites with valid terrain data additionally return terrain visibility, windows, and summaries.

**Preset example:**

```bash
curl -X POST 'http://127.0.0.1:8000/api/visibility' \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "preset",
    "site_id": "Site01_highest_point",
    "start_utc": "2026-11-15T00:00:00Z",
    "end_utc": "2026-11-16T00:00:00Z",
    "step_minutes": 60
  }'
```

**Custom coordinates example:**

```json
{
  "mode": "custom",
  "lat": -89.43890921454617,
  "lon": -137.14356999445042,
  "start_utc": "2026-11-15T00:00:00Z",
  "end_utc": "2026-11-16T00:00:00Z",
  "step_minutes": 60
}
```

**Response fields:**

| Field | Meaning |
| --- | --- |
| `status` | `terrain_visibility` for supported presets; `geometry_only` for custom coordinates |
| `site_id`, `lat`, `lon` | Selected site ID and lunar coordinates |
| `horizon` | 360-element terrain horizon in degrees for presets; `null` for custom |
| `start_utc`, `step_minutes` | Start of the returned series and sampling interval |
| `samples` | Time offset `t` (minutes), Sun/Earth elevation (`el`), azimuth (`az`), and preset `visible` flags |
| `sun_windows`, `earth_windows` | Visibility intervals with UTC `start`/`end`; `null` for custom |
| `summary` | `sun_pct`, `earth_pct`, `avg_sun_el_deg`, `longest_dark_hours`; `null` for custom |

An abbreviated response from the **Nov 15–16, 2026** preset example is:

```json
{
  "status": "terrain_visibility",
  "site_id": "Site01_highest_point",
  "sun_windows": [
    {"start": "2026-11-15T00:00:00+00:00", "end": "2026-11-16T00:00:00+00:00"}
  ],
  "earth_windows": [
    {"start": "2026-11-15T12:54:12.855610+00:00", "end": "2026-11-16T00:00:00+00:00"}
  ],
  "summary": {
    "sun_pct": 100,
    "earth_pct": 46.24,
    "avg_sun_el_deg": 1.323,
    "longest_dark_hours": 0
  }
}
```

*This is a partial excerpt; the actual response also includes coordinates, horizon, sampling metadata, and samples. The numeric results shown are from a local test run, not independent external validation.*

### `GET /health` and `GET /ready`

- `/health`: Confirms that the API process is responding (`{"status": "ok"}`).
- `/ready`: Confirms that the required scientific data and site catalog can be loaded (`{"status": "ready"}` on success).

### Supported preset IDs

`center`, `highest_point`, `lowest_point`, `shoemaker`, `Site01_center`, `Site01_highest_point`, `Site01_lowest_point`.

An ID being listed does **not** guarantee its horizon dataset passes validation. In particular, some existing profiles contain missing-data markers and can return an error until the data is corrected.

### Request limits

- `mode`: `preset` or `custom`.
- Preset requests require `site_id` and must not provide `lat`/`lon`.
- Custom requests require `lat` and `lon`, without `site_id`.
- Latitude: `-90` to `90` degrees; longitude: `-180` to `360` degrees.
- Timestamps must explicitly use UTC and satisfy `end_utc > start_utc`.
- `step_minutes`: integer from `5` to `360`.
- Maximum duration: **365 days**, maximum returned samples: **10,000**.
- Ephemeris coverage: **2026-11-01 00:00 UTC** through **2027-11-01 00:00 UTC**, inclusive. Requests outside coverage are rejected.
- A full 365-day request at 60-minute steps returns **8,761 samples**; finer steps may hit the sample cap.

### HTTP errors

| Status | Example |
| --- | --- |
| `404` | Unknown preset site ID |
| `422` | Invalid request schema, timestamps, limits, or dates outside ephemeris coverage |
| `503` | Required scientific dataset is missing, invalid, or incomplete |

## How the calculation pipeline works

1. `data_store.py` validates and caches ephemeris and preset horizon JSON.
2. `visibility.py` selects samples for the requested UTC interval and interpolates between hourly Sun/Earth vectors.
3. Existing science functions in `core/windows.py` calculate elevation and azimuth (`directions`) and elevation relative to the terrain horizon (`margin`).
4. Existing `crossings` logic detects approximate rise/set transitions; the backend converts these into bounded UTC visibility windows.
5. The backend aggregates summary metrics and serializes the result as JSON.

To reduce repeated work, the API caches parsed NumPy ephemeris arrays and restricts window calculations to the hourly observations around the requested date interval. The scientific geometry formulas remain in `core/`.

## Automated testing and performance

From the project root:

```bash
python -m pip install pytest httpx
python -m pytest tests/ -v
```

The latest reported local run passed **36 tests** on Python **3.14.8**, covering schema validation, API output, a known Earthrise transition, errors, health/readiness, and data reliability.

**Reported local warm-cache service benchmarks** (excluding HTTP/network overhead):

| Request duration | Samples | Median processing time |
| --- | ---: | ---: |
| 1 day | 25 | 0.488 ms |
| 7 days | 169 | 0.475 ms |
| 30 days | 721 | 1.422 ms |
| 90 days | 2,161 | 3.923 ms |
| 180 days | 4,321 | 7.737 ms |
| 365 days | 8,761 | 16.010 ms |

These timings are environment-specific and do not represent full HTTP response time or browser rendering performance.

## Deployment

The repository includes a Render configuration (`render.yaml`) designed to start the API with Uvicorn and use `/ready` as its health-check path.

Before deploying:

1. Push the backend code, `data/ephemeris.json`, `data/horizons/`, `frontend/data/sites.json`, and tests to the repository.
2. Ensure the **root-level** `requirements-api.txt` required by `render.yaml` exists, or update `buildCommand` to point to the correct requirements file.
3. Confirm `/ready` references the valid preset ID `Site01_highest_point` (not `Site01_higest_point`).
4. Set `CORS_ORIGINS` to the allowed frontend origin(s) for production; the current `*` default is intended for an unauthenticated public API.
5. Deploy the Render service and verify `/health`, `/ready`, `/api/sites`, and `POST /api/visibility` using the public HTTPS URL.

**Deployment status:** Configuration prepared; public deployment and its URL have not yet been confirmed.

## Scientific limitations and data provenance

- **Center-of-body visibility:** The API's `visible` flags and windows compare Sun/Earth center elevation against terrain. They do **not** model partial obstruction of the Sun's or Earth's apparent disc.
- **Window precision:** Events are approximated from hourly ephemeris samples using linear interpolation. Short events between observations may be missed.
- **Custom locations:** Custom latitude/longitude requests return geometry only until a coordinate-based terrain horizon interface is integrated.
- **Incomplete horizons:** The terrain preprocessing script uses `-90°` as an initialization/missing-data value. The data loader rejects profiles containing that marker instead of presenting them as reliable terrain visibility.
- **Site catalog verification:** Scientific site names, coordinates, DEM coverage, and data provenance should be checked with the science team before using results in comparisons.
- **Power estimate:** Sun elevation and visibility are useful indicators, **not** a physical electrical-power prediction; array geometry and system losses are not modeled.
- **Ephemeris source:** Offline position data was generated with SPICE/NAIF tools in a Moon-fixed frame; inspect `core/export_ephemeris.py` and the scientific data preparation notes for generation details and required kernels.

This software is intended for hackathon demonstrations, education, and exploratory analysis. It is **not mission-certified navigation, power, or communication-planning software**.

## Team responsibilities and future work

| Workstream | Ownership |
| --- | --- |
| Ephemeris, terrain data, model validation | Scientific team |
| API orchestration, request validation, testing, performance, deployment | Backend team |
| Maps, visualizations, timeline, scenario comparison UI | Frontend team |
| End-to-end validation and presentation | Whole team |

Potential future improvements include terrain analysis for custom sites, verified replacement of incomplete horizons, optional solar-disc visibility fractions, a dedicated comparison endpoint, better science provenance metadata, and additional frontend visualizations.

## License

See the repository's [LICENSE](LICENSE) file for licensing terms.
