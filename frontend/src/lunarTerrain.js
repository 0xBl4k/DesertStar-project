import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Smooth shading across the model's split UV vertices without moving terrain.
 * Cloning also keeps the cached NASA asset intact across scene mounts.
 */
export function smoothLunarTerrain(geometry) {
  const source=geometry.index?geometry:geometry.clone();
  return toCreasedNormals(source,Math.PI/2);
}

export function lunarShadowSize(maxTextureSize) {
  return maxTextureSize>=4096?4096:2048;
}
