import {Raycaster,Vector3} from 'three';
import {markerPosition,MOON_SCENE_RADIUS} from './lunarSceneMath.js';

export const SITE_DOT_RADIUS_PX=9;

/** Pin the coordinate to the real NASA mesh when it is available. */
export function siteMarkerAnchor(site,surface) {
 const point=markerPosition(site);if(!point)return null;
 if(!surface)return point;
 const normal=new Vector3(...point).normalize();
 const ray=new Raycaster(normal.clone().multiplyScalar(MOON_SCENE_RADIUS*3),normal.clone().negate());
 const hit=ray.intersectObject(surface,true)[0];
 return hit?hit.point.clone().addScaledVector(normal,.003).toArray():point;
}

/** CSS-pixel radius, independent of zoom, viewport height and device-pixel ratio. */
export function markerWorldScale(distance,fov,height,pixels=SITE_DOT_RADIUS_PX) {
 return 2*distance*Math.tan(fov*Math.PI/360)*pixels/Math.max(1,height);
}
