import {Body, RotationAxis, Rotation_EQD_EQJ, RotateVector, SiderealTime, Vector} from 'astronomy-engine';
import {Matrix4, Quaternion, Vector3} from 'three';
import {moonFixedToScene} from './lunarSceneMath.js';

const unit = value => new Vector3(value.x, value.y, value.z).normalize();
const radians = Math.PI / 180;

/** IAU body axes expressed in the J2000 equatorial inertial frame. */
export function inertialBodyFrame(body, date) {
  if (body === Body.Earth) {
    // Greenwich's meridian is measured from the TRUE equinox of date, not
    // from the pole's right ascension (which is nearly undefined for Earth).
    const angle = SiderealTime(date) * 15 * radians;
    const rotation = Rotation_EQD_EQJ(date);
    const convert = (x, y, z) => unit(RotateVector(rotation, new Vector(x, y, z, date)));
    return {prime: convert(Math.cos(angle), Math.sin(angle), 0),
      east: convert(-Math.sin(angle), Math.cos(angle), 0), north: convert(0, 0, 1)};
  }
  const axis = RotationAxis(body, date);
  const north = unit(axis.north), ra = axis.ra * 15 * radians, spin = (axis.spin % 360) * radians;
  const reference = new Vector3(-Math.sin(ra), Math.cos(ra), 0);
  const perpendicular = new Vector3().crossVectors(north, reference);
  const prime = reference.multiplyScalar(Math.cos(spin)).addScaledVector(perpendicular, Math.sin(spin)).normalize();
  return {prime, north, east: new Vector3().crossVectors(north, prime).normalize()};
}

/** Appearance only: IAU rotation in the lunar frame. Positions stay SPICE-driven.
 * Three's cylindrical sphere map has +X at Greenwich, +Y north, -Z at 90°E.
 * Evaluate from absolute UTC, so reverse scrubbing and pause never accumulate drift.
 */
export function celestialOrientation(body, timestamp) {
  if (!Number.isFinite(timestamp)) return new Quaternion();
  const date = new Date(timestamp), moon = inertialBodyFrame(Body.Moon, date), object = inertialBodyFrame(body, date);
  const toScene = axis => new Vector3(...moonFixedToScene([axis.dot(moon.prime), axis.dot(moon.east), axis.dot(moon.north)]));
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(
    toScene(object.prime), toScene(object.north), toScene(object.east).negate()));
}
