import React,{useMemo,useRef,useEffect,Suspense,Component} from 'react';
import {Canvas,useFrame,useLoader,useThree} from '@react-three/fiber';
import {OrbitControls,Line,Html,Billboard} from '@react-three/drei';
import {ZoomIn,ZoomOut,Scan,LocateFixed} from 'lucide-react';
import SceneCamera from './SceneCamera.jsx';
import {MIN_CAMERA_DISTANCE,MAX_CAMERA_DISTANCE} from './sceneCameraMath.js';
import {siteMarkerAnchor,markerWorldScale} from './lunarMarkers.js';
import {updateScenePreference} from './scenePreferences.js';
import {EffectComposer,Bloom,ToneMapping} from '@react-three/postprocessing';
import {ToneMappingMode} from 'postprocessing';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {TextureLoader,Box3,Vector3,Quaternion,Matrix4,Group,Object3D,SRGBColorSpace,BackSide,AdditiveBlending,RepeatWrapping,PCFSoftShadowMap} from 'three';
import {smoothLunarTerrain,lunarShadowSize} from './lunarTerrain.js';
import {createLunarMaterial,updateLunarMaterial} from './lunarSurfaceMaterial.js';
import LunarIllumination,{BodyGlow} from './LunarIllumination.jsx';
import {SCIENTIFIC_VIEW,effectiveScenePreferences} from './scenePreferences.js';
import {sunVertexShader,sunFragmentShader,earthShellVertex,atmosphereFragment,cloudsFragment} from './sceneShaders.js';
import {Body} from 'astronomy-engine';
import {celestialOrientation} from './celestialOrientation.js';
import {nasaModelToScene,mapSphereToScene,MOON_SCENE_RADIUS,SUN_RADIUS,EARTH_RADIUS,MOON_NORTH,ORBIT_VIEW_DIRECTION} from './lunarSceneMath.js';

const rotationFor = transform => new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(
 new Vector3(...transform([1,0,0])),new Vector3(...transform([0,1,0])),new Vector3(...transform([0,0,1]))));
const NASA_ROTATION=rotationFor(nasaModelToScene),MAP_ROTATION=rotationFor(mapSphereToScene);

class AssetBoundary extends Component{
 constructor(p){super(p);this.state={failed:false}}
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error){this.props.onError?.(error)}
 render(){return this.state.failed?this.props.fallback:this.props.children}
}

function useMoonMaterial(geometry,settings) {
 const map=useLoader(TextureLoader,'/assets/lunar-color-4k.jpg');
 useMemo(()=>{map.colorSpace=SRGBColorSpace;map.anisotropy=8;map.wrapS=RepeatWrapping;map.needsUpdate=true},[map]);
 const material=useMemo(()=>createLunarMaterial(map),[map]);
 updateLunarMaterial(material,geometry,settings);
 useEffect(()=>()=>material.dispose(),[material]);
 return material;
}
function pickMoon(event,onSelect){
 event.stopPropagation();
 if(event.delta<=5)onSelect?.(event.point.clone().normalize().multiplyScalar(MOON_SCENE_RADIUS).toArray());
}
function NASA({url,onLoaded,onSurfaceReady,onSelect,geometry,settings}){
 const gltf=useLoader(GLTFLoader,url);
 const material=useMoonMaterial(geometry,settings);
 const obj=useMemo(()=>{
  const o=gltf.scene.clone(true);
  o.updateMatrixWorld(true);
  const center=new Box3().setFromObject(o).getCenter(new Vector3());
  const point=new Vector3();
  let radius=0;
  o.traverse(mesh=>{
   if(!mesh.isMesh)return;
   mesh.geometry=smoothLunarTerrain(mesh.geometry);
   mesh.material=material;
   const positions=mesh.geometry.attributes.position;
   for(let i=0;i<positions.count;i++){
    point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
    radius=Math.max(radius,point.distanceTo(center));
   }
  });
  o.position.sub(center);
  const normalized=new Group();
  normalized.add(o);
  normalized.scale.setScalar(MOON_SCENE_RADIUS/(radius||1));
  normalized.quaternion.copy(NASA_ROTATION);
  return normalized;
 },[gltf,material]);
 useEffect(()=>()=>{obj.traverse(mesh=>{if(mesh.isMesh)mesh.geometry.dispose()})},[obj]);
 useEffect(()=>{obj.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=settings.showTerrainShadows;mesh.receiveShadow=settings.showTerrainShadows}})},[obj,settings.showTerrainShadows]);
 useEffect(()=>{obj.updateMatrixWorld(true);onSurfaceReady?.(obj);onLoaded?.()},[url,onLoaded,onSurfaceReady,obj]);
 return <primitive object={obj} onClick={event=>pickMoon(event,onSelect)}/>;
}

function ReferenceMoon({geometry,settings,onSelect}){
 const material=useMoonMaterial(geometry,settings);
 const height=useLoader(TextureLoader,'/assets/moon-lola-height.png');
 useMemo(()=>{height.wrapS=RepeatWrapping;height.needsUpdate=true},[height]);
 useMemo(()=>{
  material.displacementMap=height;
  material.displacementScale=(10.504000663757324+8.878499984741211)/1737.4*MOON_SCENE_RADIUS;
  material.displacementBias=-8.878499984741211/1737.4*MOON_SCENE_RADIUS;
  material.bumpMap=height;material.bumpScale=.012;material.needsUpdate=true;
 },[height,material]);
 return <group quaternion={MAP_ROTATION}><mesh material={material} onClick={event=>pickMoon(event,onSelect)} castShadow={settings.showTerrainShadows} receiveShadow={settings.showTerrainShadows}>
  <sphereGeometry args={[MOON_SCENE_RADIUS,256,128]}/>
 </mesh></group>;
}
function LoadingMoon(){
 return <mesh><sphereGeometry args={[MOON_SCENE_RADIUS,48,32]}/><meshStandardMaterial color="#7f8791" roughness={1}/></mesh>;
}
function SceneMarker({site,position,onSelect}){
 const billboard=useRef(null),{camera,size}=useThree();
 const p=useMemo(()=>position?new Vector3(...position):null,[position]);
 const viewPoint=useMemo(()=>new Vector3(),[]);
 useFrame(()=>{
  if(billboard.current&&p){
   const depth=-viewPoint.copy(p).applyMatrix4(camera.matrixWorldInverse).z;
   billboard.current.scale.setScalar(markerWorldScale(Math.max(.01,depth),camera.fov,size.height,4.5));
  }
 });
 if(!p)return null;
 const select=e=>{e.stopPropagation();onSelect?.(site.id)};
 return <group position={position}>
  <Billboard><group ref={billboard}>
   <mesh onClick={select} onPointerOver={e=>{e.stopPropagation();document.body.style.cursor='pointer'}} onPointerOut={()=>{document.body.style.cursor='auto'}}>
    <circleGeometry args={[1.45,24]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/>
   </mesh>
   <mesh><circleGeometry args={[1,32]}/><meshBasicMaterial color="#ffd166" toneMapped={false}/></mesh>
  </group></Billboard>
 </group>;
}

function SunBody({position,glow,timestamp}){
 const texture=useLoader(TextureLoader,'/assets/sun-nasa-euv.jpg');
 useMemo(()=>{texture.colorSpace=SRGBColorSpace;texture.wrapS=RepeatWrapping;texture.needsUpdate=true},[texture]);
 const orientation=useMemo(()=>celestialOrientation(Body.Sun,timestamp),[timestamp]);
 const uniforms=useMemo(()=>({surface:{value:texture},radiance:{value:glow?2.6:1.3}}),[texture,glow]);
 return <group position={position}>
  <mesh quaternion={orientation}><sphereGeometry args={[SUN_RADIUS,64,40]}/>
   <shaderMaterial vertexShader={sunVertexShader} fragmentShader={sunFragmentShader} uniforms={uniforms} toneMapped={!glow}/></mesh>
  {glow&&<BodyGlow radius={SUN_RADIUS*1.45} color="#ffb64b" radiance={3.5}/>}
  <Html position={[0,SUN_RADIUS+.2,0]} center occlude zIndexRange={[3,0]} className="scene-body-label sun-label">SUN</Html>
 </group>;
}
function EarthBody({position,settings,timestamp,sunDirection}){
 const [texture,cloudMap]=useLoader(TextureLoader,['/assets/earth-day.jpg','/assets/earth-clouds.jpg']);
 useMemo(()=>{texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;texture.needsUpdate=true},[texture]);
 const orientation=useMemo(()=>celestialOrientation(Body.Earth,timestamp),[timestamp]);
 const uniforms=useMemo(()=>({sunDirection:{value:new Vector3(...sunDirection)},cloudMap:{value:cloudMap}}),[sunDirection,cloudMap]);
 const cloudDrift=Number.isFinite(timestamp)?((timestamp-Date.UTC(2026,10,1))/86400000*.035)%(Math.PI*2):0;
 return <group position={position}>
  <group quaternion={orientation}>
   <mesh><sphereGeometry args={[EARTH_RADIUS,64,40]}/>
    <meshStandardMaterial map={texture} roughness={.85} metalness={0} emissive="#11243d" emissiveIntensity={.08}/></mesh>
   {settings.showEarthClouds&&<mesh rotation={[0,cloudDrift,0]} renderOrder={1}>
    <sphereGeometry args={[EARTH_RADIUS*1.012,64,40]}/>
    <shaderMaterial vertexShader={earthShellVertex} fragmentShader={cloudsFragment} uniforms={uniforms} transparent depthWrite={false}/>
   </mesh>}
  </group>
  {settings.showEarthAtmosphere&&<mesh renderOrder={2}>
   <sphereGeometry args={[EARTH_RADIUS*1.055,64,40]}/>
   <shaderMaterial vertexShader={earthShellVertex} fragmentShader={atmosphereFragment} uniforms={uniforms} transparent depthWrite={false} side={BackSide} blending={AdditiveBlending} toneMapped={false}/>
  </mesh>}
  {settings.showEarthGlow&&<BodyGlow radius={EARTH_RADIUS*1.16} color="#58bfff" radiance={4}/>}
  <Html position={[0,EARTH_RADIUS+.2,0]} center occlude zIndexRange={[3,0]} className="scene-body-label earth-label">EARTH</Html>
 </group>;
}
function PlainEarth({position}){
 return <mesh position={position}><sphereGeometry args={[EARTH_RADIUS,40,28]}/><meshStandardMaterial color="#267cc6"/></mesh>;
}
function SunLight({geometry,settings}){
 const target=useMemo(()=>new Object3D(),[]);
 const {gl}=useThree(),mapSize=lunarShadowSize(gl.capabilities.maxTextureSize);
 return <>
  <primitive object={target} position={geometry.origin}/>
  <directionalLight color="#fff0db" intensity={3.1} position={geometry.sunPosition} target={target} castShadow={settings.showTerrainShadows}
   shadow-mapSize={[mapSize,mapSize]} shadow-camera-left={-2.04} shadow-camera-right={2.04}
   shadow-camera-top={2.04} shadow-camera-bottom={-2.04} shadow-camera-near={4.6} shadow-camera-far={9}
   shadow-bias={-.00008} shadow-normalBias={.0012}/>

 </>;
}
function SceneDirections({geometry,settings,timestamp}){
 const {origin,frame,sunPosition,earthPosition,axisLength}=geometry;
 return <>
  {settings.showDirectionLines&&<><Line points={[origin,sunPosition]} color="#ffd05a" lineWidth={1.6} transparent opacity={.8}/>
  <Line points={[origin,earthPosition]} color="#43bfff" lineWidth={1.6} transparent opacity={.8}/></>}
  {settings.show3DObjects&&<><AssetBoundary fallback={null}><Suspense fallback={null}><SunBody position={sunPosition} glow={settings.showSunGlow} timestamp={timestamp}/></Suspense></AssetBoundary>
   <AssetBoundary fallback={<PlainEarth position={earthPosition}/>}>
    <Suspense fallback={<PlainEarth position={earthPosition}/>}><EarthBody position={earthPosition} settings={settings} timestamp={timestamp} sunDirection={geometry.sunDirection}/></Suspense>
   </AssetBoundary></>}
  {settings.showAxes&&[['prime','X / 0°','#ff6868'],['east','Y / 90°E','#5ed7ff'],['north','Z / N','#76ee9a']].map(([key,label,color])=>
   <group key={key}>
    <arrowHelper args={[new Vector3(...frame[key]),new Vector3(...origin),axisLength,color,.13,.065]}/>
    <Html position={frame[key].map(v=>v*(axisLength+.16))} center occlude zIndexRange={[3,0]} className="scene-axis-label"><span style={{color}}>{label}</span></Html>
   </group>)}
 </>;
}
function CinematicEffects(){
 const composer=useRef(null);
 const {gl}=useThree();
 const supportsHDR=gl.extensions.has('EXT_color_buffer_float');
 useEffect(()=>{const owned=composer.current;return()=>owned?.dispose()},[]);
 if(!supportsHDR)return null;
 return <EffectComposer ref={composer} multisampling={0} enableNormalPass={false}>
  <Bloom mipmapBlur intensity={.8} luminanceThreshold={1} luminanceSmoothing={.2} radius={.55}/>
  <ToneMapping mode={ToneMappingMode.ACES_FILMIC}/>
 </EffectComposer>;
}
export default function MoonScene({modelUrl,onModelLoaded,onModelError,sites,activeId,onSelect,onSurfaceSelect,zoomable=true,clockScene=false,geometry=null,timestamp=null,visualSettings=SCIENTIFIC_VIEW,onVisualSettingsChange}){
 const selected=sites.find(s=>s.id===activeId);
 const [command,setCommand]=React.useState({serial:0,kind:'fit'});
 const [surface,setSurface]=React.useState(null);
 const anchor=useMemo(()=>selected?siteMarkerAnchor(selected,surface):null,[selected,surface]);
 const issue=(kind,factor)=>setCommand(value=>({serial:value.serial+1,kind,factor}));
 const lockMoon=value=>onVisualSettingsChange?.(updateScenePreference(visualSettings,'lockOnMoon',value));
 const geo=clockScene?geometry:null;
 const settings=useMemo(()=>effectiveScenePreferences(visualSettings),[visualSettings]);
 const surfaceProps={geometry:geo,settings,onSelect:onSurfaceSelect};
 useEffect(()=>()=>{document.body.style.cursor='auto'},[]);
 return <div className="moon-3d-wrap" onDoubleClick={event=>{if(zoomable&&!event.target.closest('button,input,label'))issue('fit')}} title="Drag to rotate · Scroll or pinch to zoom · Double-click to fit">
  <div className="scene-camera-toolbar" role="group" aria-label="Camera controls">
   <label className="scene-camera-lock"><input type="checkbox" checked={settings.lockOnMoon} onChange={event=>lockMoon(event.target.checked)}/> Lock on Moon</label>
   <span className="scene-camera-scope">{settings.lockOnMoon?'Moon focus':'Whole system focus'}</span>
   <button type="button" aria-label="Zoom in" title="Zoom in" onClick={()=>issue('zoom',.8)}><ZoomIn size={17}/></button>
   <button type="button" aria-label="Zoom out" title="Zoom out" onClick={()=>issue('zoom',1.25)}><ZoomOut size={17}/></button>
   <button type="button" aria-label="Fit current focus" title="Fit current focus" onClick={()=>issue('fit')}><Scan size={17}/></button>
   {selected&&<button type="button" aria-label="Show selected location on the Moon" title="Show selected location on the Moon" onClick={()=>{lockMoon(true);issue('site')}}><LocateFixed size={17}/><span>Show site</span></button>}
  </div>
  <AssetBoundary fallback={<div className="scene-unavailable" role="status"><strong>3D view unavailable</strong><p>This browser could not start WebGL. Try enabling hardware acceleration or opening LUNARIS in a browser with WebGL support.</p></div>}>
  <Canvas shadows={settings.showTerrainShadows?PCFSoftShadowMap:false} camera={{position:clockScene?ORBIT_VIEW_DIRECTION:[0,0,7.85],up:clockScene?MOON_NORTH:[0,1,0],fov:39,near:.01,far:300}} dpr={[1,2]} gl={{alpha:true,antialias:true,powerPreference:'high-performance'}}>
   <ambientLight intensity={geo?(settings.highContrastShadow?.055:.18):.55}/>
   <hemisphereLight intensity={geo?(settings.highContrastShadow?.02:.07):.21} color="#c7ddff" groundColor="#182c4a"/>
   {geo?<SunLight geometry={geo} settings={settings}/>:<>
    <directionalLight intensity={2.3} color="#ffe9c6" position={[-3.5,2.5,5.5]}/>
    <directionalLight intensity={.28} color="#3484d3" position={[5,-2,-3]}/>
   </>}
   <Suspense fallback={<LoadingMoon/>}>
    <AssetBoundary key={modelUrl||'reference'} onError={onModelError} fallback={<ReferenceMoon {...surfaceProps}/>}>
     {modelUrl?<NASA url={modelUrl} onLoaded={onModelLoaded} onSurfaceReady={setSurface} {...surfaceProps}/>:<ReferenceMoon {...surfaceProps}/>}
    </AssetBoundary>
   </Suspense>
   {selected&&(!clockScene||settings.showSiteMarker)&&<SceneMarker key={selected.id} site={selected} position={anchor} onSelect={onSelect}/>}
   {geo&&<><LunarIllumination geometry={geo} settings={settings}/><SceneDirections geometry={geo} settings={settings} timestamp={timestamp}/></>}
   <OrbitControls makeDefault enableZoom={zoomable} minDistance={MIN_CAMERA_DISTANCE} maxDistance={MAX_CAMERA_DISTANCE} zoomSpeed={.8} enablePan={false} enableDamping dampingFactor={.075} rotateSpeed={.52} minPolarAngle={.08} maxPolarAngle={Math.PI-.08}/>
   <SceneCamera geometry={geo} settings={settings} selected={selected} command={command}/>
   {geo&&settings.showBloom&&<CinematicEffects/>}
  </Canvas>
  </AssetBoundary>
 </div>;
}
