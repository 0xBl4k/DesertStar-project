import React,{useMemo} from 'react';
import {Line} from '@react-three/drei';
import {Color,Vector3,BackSide,AdditiveBlending} from 'three';
import {terminatorPoints} from './lunarIlluminationMath.js';
import {lunarMaskVertex,lunarMaskFragment,glowVertex,glowFragment} from './sceneShaders.js';

export function BodyGlow({radius,color,radiance=3}){
 const uniforms=useMemo(()=>({glowColor:{value:new Color(color)},radiance:{value:radiance}}),[color,radiance]);
 return <mesh><sphereGeometry args={[radius,64,40]}/><shaderMaterial uniforms={uniforms} vertexShader={glowVertex} fragmentShader={glowFragment} transparent depthWrite={false} side={BackSide} blending={AdditiveBlending} toneMapped={false}/></mesh>;
}

export default function LunarIllumination({geometry,settings}){
 const points=useMemo(()=>terminatorPoints(geometry.sunDirection,geometry.radius+.012),[geometry.sunDirection,geometry.radius]);
 const uniforms=useMemo(()=>({
  sunDirection:{value:new Vector3(...geometry.sunDirection)},
  nightColor:{value:new Color(settings.highContrastShadow?'#091524':'#263e59')},
  strength:{value:settings.highContrastShadow?.78:.55},
  hatching:{value:settings.showHatching?1:0},
 }),[geometry.sunDirection,settings.highContrastShadow,settings.showHatching]);
 return <>
  {settings.showDarkOverlay&&<mesh renderOrder={-1}>
   <sphereGeometry args={[geometry.radius+.006,128,80]}/>
   <shaderMaterial uniforms={uniforms} vertexShader={lunarMaskVertex} fragmentShader={lunarMaskFragment} transparent depthWrite={false} toneMapped={false}/>
  </mesh>}
  {settings.showTerminator&&<Line points={points} color="#ffe9ac" lineWidth={settings.highContrastShadow?3.2:1.8} transparent opacity={.97}/>}
 </>;
}
