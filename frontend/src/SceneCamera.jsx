import {useEffect,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Vector3} from 'three';
import {cameraAction,cameraFocusTarget,cameraFitDistance,siteViewDirection,zoomDistance,followFocus,MIN_CAMERA_DISTANCE} from './sceneCameraMath.js';

/** Fit only after an explicit command, focus change, initial load or resize.
 * Ordinary playback and OrbitControls zoom never trigger a distance refit.
 */
export default function SceneCamera({geometry,settings,selected,command}) {
 const {camera,controls,size}=useThree(),latest=useRef(null),motion=useRef(null),previous=useRef(null);
 latest.current={geometry,settings};
 const lock=!!settings.lockOnMoon,ready=!!geometry,siteKey=selected?[selected.id,selected.lat,selected.lon].join(':'):'';
 useEffect(()=>{
  if(!controls)return;
  const current={lock,siteKey,width:size.width,height:size.height,ready,command:command.serial};
  const action=cameraAction(previous.current,current,command);
  previous.current=current;
  if(!action)return;
  const {geometry,settings}=latest.current;
  const target=new Vector3(...cameraFocusTarget(geometry,settings,lock));
  const offset=camera.position.clone().sub(controls.target),distance=offset.length();
  if(action==='zoom'){
   motion.current={target,position:target.clone().add(offset.setLength(zoomDistance(distance,command.factor)))};
   return;
  }
  const direction=action==='site'?siteViewDirection(selected):null;
  if(direction)offset.set(...direction);
  offset.normalize();
  const fit=cameraFitDistance(geometry,offset.toArray(),size.width/size.height,camera.fov,settings,lock,camera.up.toArray());
  motion.current={target,position:target.clone().add(offset.multiplyScalar(fit||7.85))};
 },[camera,controls,lock,ready,siteKey,size.width,size.height,command.serial]);
 useEffect(()=>{
  const cancel=()=>{motion.current=null};
  controls?.addEventListener('start',cancel);
  return()=>controls?.removeEventListener('start',cancel);
 },[controls]);
 useFrame((_,delta)=>{
  if(!controls)return;
  const requested=motion.current;
  if(requested){
   const amount=1-Math.exp(-8*delta);
   camera.position.lerp(requested.position,amount);controls.target.lerp(requested.target,amount);
   if(camera.position.distanceTo(requested.position)<.003&&controls.target.distanceTo(requested.target)<.003){
    camera.position.copy(requested.position);controls.target.copy(requested.target);motion.current=null;
   }
  }else{
   const target=new Vector3(...cameraFocusTarget(latest.current.geometry,latest.current.settings,latest.current.settings.lockOnMoon));
   camera.position.set(...followFocus(camera.position.toArray(),controls.target.toArray(),target.toArray()));controls.target.copy(target);
  }
  // Prevent entering the lunar mesh while retaining free zoom outside it.
  if(camera.position.length()<MIN_CAMERA_DISTANCE)camera.position.setLength(MIN_CAMERA_DISTANCE);
  camera.lookAt(controls.target);controls.update();
 });
 return null;
}
