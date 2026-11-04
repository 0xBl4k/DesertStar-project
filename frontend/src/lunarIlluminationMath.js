const unit = vector => {
  if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(Number.isFinite)) return null;
  const length = Math.hypot(...vector);
  return length > 0 ? vector.map(value => value / length) : null;
};
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

/** Positive = day; negative = night. This is a global spherical reference. */
export function illuminationCosine(surfacePoint, sunDirection) {
  const normal = unit(surfacePoint), sun = unit(sunDirection);
  return normal && sun ? Math.max(-1, Math.min(1, dot(normal, sun))) : null;
}

/** Great circle perpendicular to the sunlight vector, closed without a seam. */
export function terminatorPoints(sunDirection, radius, segments = 256) {
  const normal = unit(sunDirection);
  if (!normal || !Number.isFinite(radius) || radius <= 0 || !Number.isInteger(segments) || segments < 16) return [];
  const reference = Math.abs(normal[0]) < .8 ? [1, 0, 0] : [0, 1, 0];
  const east = unit(cross(normal, reference)), north = cross(normal, east);
  const points = Array.from({length: segments}, (_, index) => {
    const angle = index * 2 * Math.PI / segments;
    return east.map((value, i) => radius * (value * Math.cos(angle) + north[i] * Math.sin(angle)));
  });
  points.push([...points[0]]);
  return points;
}
