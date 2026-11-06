import React,{useMemo} from 'react';
import {Line} from '@react-three/drei';
import {Color,BackSide,AdditiveBlending} from 'three';
import {terminatorPoints} from './lunarIlluminationMath.js';
import {glowVertex,glowFragment} from './sceneShaders.js';

export function BodyGlow({radius,color,radiance=3}){
 const uniforms=useMemo(()=>({glowColor:{value:new Color(color)},radiance:{value:radiance}}),[color,radiance]);
 return <mesh><sphereGeometry args={[radius,64,40]}/><shaderMaterial uniforms={uniforms} vertexShader={glowVertex} fragmentShader={glowFragment} transparent depthWrite={false} side={BackSide} blending={AdditiveBlending} toneMapped={false}/></mesh>;
}

export default function LunarIllumination({geometry,settings}){
 const points=useMemo(()=>terminatorPoints(geometry.sunDirection,geometry.radius+.012),[geometry.sunDirection,geometry.radius]);
 return <>
  {settings.showTerminator&&<Line points={points} color="#ffe9ac" lineWidth={settings.highContrastShadow?2.6:1.5} transparent opacity={.97}/>}
 </>;
}
