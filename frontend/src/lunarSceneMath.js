/** One right-handed frame for the Moon, markers, picking, rays and lights.
 * Moon-fixed (X toward lon 0, Y toward lon 90E, Z north) -> scene (Y, X, -Z).
 * The south pole therefore faces the initial camera, along scene +Z.
 */
export const MOON_SCENE_RADIUS = 1.96;
export const SITE_MARKER_RADIUS = MOON_SCENE_RADIUS + 0.03;
export const MOON_RADIUS_KM = 1737.4;
export const SUN_RADIUS = 0.52;
export const EARTH_RADIUS = 0.43;
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

/** Distances/sizes are schematic. Site-to-body directions preserve API az/el. */
export function sceneGeometry(site, sky, {
  sunDistance = 6.8, earthDistance = 5.6, radius = MOON_SCENE_RADIUS,
} = {}) {
  if (!validSite(site) || !sky || ![sky.sun?.azimuth, sky.sun?.altitude,
    sky.earth?.azimuth, sky.earth?.altitude, sunDistance, earthDistance, radius].every(Number.isFinite)) return null;
  if (Math.abs(sky.sun.altitude) > 90 || Math.abs(sky.earth.altitude) > 90 || radius <= 0 ||
    sunDistance <= 2 * radius + SUN_RADIUS || earthDistance <= 2 * radius + EARTH_RADIUS) return null;
  const surface = siteSurfacePosition(site.lat, site.lon, radius);
  const marker = siteSurfacePosition(site.lat, site.lon, radius + 0.03);
  const frame = localFrame(site.lat, site.lon);
  const sunDirection = directionFromAzEl(site.lat, site.lon, sky.sun.azimuth, sky.sun.altitude);
  const earthDirection = directionFromAzEl(site.lat, site.lon, sky.earth.azimuth, sky.earth.altitude);
  return {
    surface, marker, frame, sunDirection, earthDirection, radius,
    sunPosition: add(marker, scale(sunDirection, sunDistance)),
    earthPosition: add(marker, scale(earthDirection, earthDistance)),
  };
}

/** Balance the complete scene in its canvas rather than leave the bodies offscreen. */
export function sceneCenter(geometry) {
  if (!geometry) return [0, 0, 0];
  const min = [-geometry.radius, -geometry.radius, -geometry.radius];
  const max = [geometry.radius, geometry.radius, geometry.radius];
  for (const [point, radius] of [[geometry.sunPosition, SUN_RADIUS], [geometry.earthPosition, EARTH_RADIUS]]) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], point[i] - radius);
      max[i] = Math.max(max[i], point[i] + radius);
    }
  }
  return min.map((value, i) => (value + max[i]) / 2);
}

/** Fit every body at the current orbit angle, including narrow/mobile canvases. */
export function sceneCameraDistance(geometry, viewDirection, aspect, fov = 39, margin = 1.16, target = sceneCenter(geometry)) {
  const view = finiteVector(viewDirection) && normalized(viewDirection);
  if (!geometry || !view || !(aspect > 0) || !(fov > 0 && fov < 180)) return null;
  const horizontal = normalized(cross(Math.hypot(view[0], view[2]) < 1e-9 ? [0, 0, 1] : [0, 1, 0], view));
  const vertical = normalized(cross(view, horizontal));
  const tanY = Math.tan(radians(fov / 2)), tanX = tanY * aspect;
  const bodies = [
    {center: [0, 0, 0], radius: geometry.radius},
    {center: geometry.sunPosition, radius: SUN_RADIUS},
    {center: geometry.earthPosition, radius: EARTH_RADIUS},
    ...Object.values(geometry.frame).map(axis => ({
      center: add(geometry.marker, scale(axis, 0.86)), radius: 0.12,
    })),
  ];
  return Math.max(...bodies.map(({center, radius}) => {
    const relative = center.map((value, i) => value - target[i]);
    return dot(relative, view) + radius + margin *
      Math.max((Math.abs(dot(relative, horizontal)) + radius) / tanX,
        (Math.abs(dot(relative, vertical)) + radius) / tanY);
  }));
}
