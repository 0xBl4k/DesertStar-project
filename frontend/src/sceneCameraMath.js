import {localFrame,MOON_SCENE_RADIUS,sceneCameraDistance,visibleSceneSpheres} from './lunarSceneMath.js';

export const MIN_CAMERA_DISTANCE=MOON_SCENE_RADIUS+.06;
export const MAX_CAMERA_DISTANCE=160;

/** Geometry/playback updates are deliberately absent from the fit triggers. */
export function cameraAction(previous,current,command) {
  if(!previous)return current.lock?'site':'fit';
  const issued=previous.command!==command.serial,scope=previous.lock!==current.lock;
  const site=previous.siteKey!==current.siteKey;
  if(issued&&command.kind==='zoom')return 'zoom';
  if(current.lock&&(scope||site||(issued&&command.kind==='site')))return 'site';
  if(issued||scope||previous.ready!==current.ready||previous.width!==current.width||previous.height!==current.height)return 'fit';
  return null;
}

export function cameraFocusTarget(geometry,settings,lockOnMoon) {
  if(lockOnMoon||!geometry)return [0,0,0];
  const shapes=visibleSceneSpheres(geometry,settings),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const {center,radius} of shapes)for(let i=0;i<3;i++){
    min[i]=Math.min(min[i],center[i]-radius);max[i]=Math.max(max[i],center[i]+radius);
  }
  return min.map((v,i)=>(v+max[i])/2);
}

export function cameraFitDistance(geometry,direction,aspect,fov,settings,lockOnMoon,cameraUp) {
  if(!geometry)return 7.85;
  const target=cameraFocusTarget(geometry,settings,lockOnMoon);
  const visible=lockOnMoon?{...settings,show3DObjects:false,showDirectionLines:false,showAxes:false}:settings;
  return sceneCameraDistance(geometry,direction,aspect,fov,1.15,target,visible,cameraUp);
}

export function zoomDistance(distance,factor) {
  return Math.max(MIN_CAMERA_DISTANCE,Math.min(MAX_CAMERA_DISTANCE,distance*factor));
}

/** Following a moving system pivot must preserve the user's zoom and orbit. */
export function followFocus(camera,oldTarget,newTarget) {
  return camera.map((v,i)=>v+newTarget[i]-oldTarget[i]);
}

export function siteViewDirection(site) {
  if(!site||![site.lat,site.lon].every(Number.isFinite))return null;
  const {up,east,north}=localFrame(site.lat,site.lon);
  // A small oblique offset keeps the poles away from the orbit-control singularity.
  const vector=up.map((v,i)=>v+.2*east[i]+.1*north[i]),length=Math.hypot(...vector);
  return vector.map(v=>v/length);
}
