/** One right-handed frame for the Moon, markers, picking, rays and lights.
 * Moon-fixed (X toward lon 0, Y toward lon 90E, Z north) -> scene (Y, X, -Z).
 * Surface browsing looks along +Z; the centered orbital view uses lunar north up.
 */
export const MOON_SCENE_RADIUS = 1.96;
export const SITE_MARKER_RADIUS = MOON_SCENE_RADIUS + 0.03;
export const MOON_RADIUS_KM = 1737.4;
export const SUN_RADIUS = 0.52;
export const EARTH_RADIUS = 0.43;
export const MOON_CENTER = Object.freeze([0, 0, 0]);
export const MOON_NORTH = Object.freeze([0, 0, -1]);
export const ORBIT_VIEW_DIRECTION = Object.freeze([8, 5, 1.5]);
export const MOON_FIXED_FRAME = 'MOON_ME_DE440_ME421';
const radians = degrees => degrees * Math.PI / 180;
const scale = (v, k) => v.map(x => x * k);
const add = (a, b) => a.map((v, i) => v + b[i]);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const finiteVector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const normalized = v => {
  const length = Math.hypot(...v);
  return length > 0 ? scale(v, 1 / length) : null;
};
const validSite = site => site && Number.isFinite(site.lat) && Math.abs(site.lat) <= 90 && Number.isFinite(site.lon);

export const moonFixedToScene = ([x, y, z]) => [y, x, -z];

/** Registered against NASA's longitude/latitude LROC map; see docs/phase1-3d.md.
 * Applies specifically to the included moon_small.glb, blob 19bf19b7860e… .
 */
export const nasaModelToScene = ([x, y, z]) => [-x, -z, -y];

/** Three SphereGeometry UVs with a north-up map centered on longitude 0. */
export const mapSphereToScene = ([x, y, z]) => [-z, x, -y];

export function localFrame(latDeg, lonDeg) {
  const lat = radians(latDeg), lon = radians(lonDeg);
  const cLat = Math.cos(lat), sLat = Math.sin(lat);
  const cLon = Math.cos(lon), sLon = Math.sin(lon);
  return {
    east: [cLon, -sLon, 0],
    north: [-sLat * sLon, -sLat * cLon, -cLat],
    up: [cLat * sLon, cLat * cLon, -sLat],
  };
}

export function siteSurfacePosition(latDeg, lonDeg, radius = MOON_SCENE_RADIUS) {
  return scale(localFrame(latDeg, lonDeg).up, radius);
}

/** Inverse of siteSurfacePosition, also used by Moon surface selection. */
export function surfaceCoordinates(point) {
  if (!finiteVector(point) || Math.hypot(...point) === 0) return null;
  const [x, y, z] = normalized(point);
  return {
    lat: -Math.asin(Math.max(-1, Math.min(1, z))) * 180 / Math.PI,
    lon: Math.atan2(x, y) * 180 / Math.PI,
  };
}

export function markerPosition(site) {
  if (validSite(site)) return siteSurfacePosition(site.lat, site.lon, SITE_MARKER_RADIUS);
  return finiteVector(site?.worldPoint) && Math.hypot(...site.worldPoint) > 0
    ? scale(normalized(site.worldPoint), SITE_MARKER_RADIUS) : null;
}

/** Azimuth clockwise from north through east; elevation above the local horizon. */
export function directionFromAzEl(latDeg, lonDeg, azDeg, elDeg) {
  const {east, north, up} = localFrame(latDeg, lonDeg);
  const az = radians(azDeg), el = radians(elDeg);
  return normalized(add(add(scale(east, Math.cos(el) * Math.sin(az)),
    scale(north, Math.cos(el) * Math.cos(az))), scale(up, Math.sin(el))));
}

/** Same topocentric spherical calculation as core/windows.py, for scene preview. */
export function skyFromMoonFixedVectors(site, sun, earth) {
  if (!validSite(site) || !finiteVector(sun) || !finiteVector(earth)) return null;
  const frame = localFrame(site.lat, site.lon);
  const origin = scale(frame.up, MOON_RADIUS_KM);
  const body = vector => {
    const direction = normalized(moonFixedToScene(vector).map((v, i) => v - origin[i]));
    if (!direction) return null;
    return {
      altitude: Math.asin(Math.max(-1, Math.min(1, dot(direction, frame.up)))) * 180 / Math.PI,
      azimuth: (Math.atan2(dot(direction, frame.east), dot(direction, frame.north)) * 180 / Math.PI + 360) % 360,
    };
  };
  const sky = {sun: body(sun), earth: body(earth)};
  return sky.sun && sky.earth ? sky : null;
}

/** Geocentric-style lunar scene: vectors originate at the Moon center.
 * Surface location never affects celestial placement, lighting or the orbit pivot.
 * Distances and body radii are schematic; full 3D direction is preserved.
 */
export function sceneGeometry(vectors, {
  sunDistance = 6.8, earthDistance = 5.6, radius = MOON_SCENE_RADIUS,
} = {}) {
  if (!vectors || !finiteVector(vectors.sun_km) || !finiteVector(vectors.earth_km) ||
      ![sunDistance,earthDistance,radius].every(Number.isFinite) || radius<=0 ||
      sunDistance<=radius+SUN_RADIUS || earthDistance<=radius+EARTH_RADIUS) return null;
  const sunDirection=normalized(moonFixedToScene(vectors.sun_km));
  const earthDirection=normalized(moonFixedToScene(vectors.earth_km));
  if(!sunDirection||!earthDirection)return null;
  return {
    origin:[...MOON_CENTER], radius, sunDirection, earthDirection,
    sunPosition:scale(sunDirection,sunDistance),earthPosition:scale(earthDirection,earthDistance),
    frame:{prime:[0,1,0],east:[1,0,0],north:[0,0,-1]},
    axisLength:radius+.8,
  };
}

/** Balance the complete scene in its canvas rather than leave the bodies offscreen. */
export function visibleSceneSpheres(geometry, settings = {}) {
  if (!geometry) return [];
  const bodies = [{center: [0, 0, 0], radius: geometry.radius + .014}];
  if (settings.show3DObjects !== false) {
    bodies.push({center: geometry.sunPosition, radius: SUN_RADIUS * (settings.showSunGlow ? 1.45 : 1)});
    bodies.push({center: geometry.earthPosition, radius: EARTH_RADIUS * (settings.showEarthGlow ? 1.16 : settings.showEarthAtmosphere ? 1.055 : settings.showEarthClouds ? 1.012 : 1)});
  } else if (settings.showDirectionLines !== false) {
    bodies.push({center: geometry.sunPosition, radius: .02}, {center: geometry.earthPosition, radius: .02});
  }

  if (settings.showAxes !== false) {
    bodies.push(...Object.values(geometry.frame).map(axis => ({center: scale(axis, geometry.axisLength+.16), radius: .12})));
  }
  return bodies;
}

export function sceneCenter(geometry, settings = {}) {
  return [...MOON_CENTER];
}

/** Fit every body at the current orbit angle, including narrow/mobile canvases. */
export function sceneCameraDistance(geometry, viewDirection, aspect, fov = 39, margin = 1.16, target = sceneCenter(geometry), settings = {}, cameraUp = MOON_NORTH) {
  const view = finiteVector(viewDirection) && normalized(viewDirection);
  if (!geometry || !view || !(aspect > 0) || !(fov > 0 && fov < 180)) return null;
  const up = Math.abs(dot(view, cameraUp)) > .999 ? [0, 1, 0] : cameraUp;
  const horizontal = normalized(cross(up, view));
  const vertical = normalized(cross(view, horizontal));
  const tanY = Math.tan(radians(fov / 2)), tanX = tanY * aspect;
  const bodies = visibleSceneSpheres(geometry, settings);
  return Math.max(...bodies.map(({center, radius}) => {
    const relative = center.map((value, i) => value - target[i]);
    return dot(relative, view) + radius + margin *
      Math.max((Math.abs(dot(relative, horizontal)) + radius) / tanX,
        (Math.abs(dot(relative, vertical)) + radius) / tanY);
  }));
}
