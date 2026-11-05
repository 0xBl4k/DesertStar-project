import React,{useMemo,useRef,useEffect,Suspense,Component} from 'react';
import {Canvas,useFrame,useLoader,useThree} from '@react-three/fiber';
import {OrbitControls,Line,Html} from '@react-three/drei';
import {EffectComposer,Bloom,ToneMapping} from '@react-three/postprocessing';
import {ToneMappingMode} from 'postprocessing';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {TextureLoader,Box3,Vector3,Quaternion,Matrix4,Group,Object3D,MathUtils,SRGBColorSpace,BackSide,AdditiveBlending,RepeatWrapping} from 'three';
import {COLORS} from './data.js';
import {createLunarMaterial,updateLunarMaterial} from './lunarSurfaceMaterial.js';
import LunarIllumination,{BodyGlow} from './LunarIllumination.jsx';
import {SCIENTIFIC_VIEW,effectiveScenePreferences} from './scenePreferences.js';
import {sunVertexShader,sunFragmentShader,earthShellVertex,atmosphereFragment,cloudsFragment} from './sceneShaders.js';
import {Body} from 'astronomy-engine';
import {celestialOrientation} from './celestialOrientation.js';
import {markerPosition,nasaModelToScene,mapSphereToScene,sceneCenter,sceneCameraDistance,MOON_SCENE_RADIUS,SUN_RADIUS,EARTH_RADIUS,MOON_NORTH,ORBIT_VIEW_DIRECTION} from './lunarSceneMath.js';

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
 const map=useLoader(TextureLoader,'/assets/lunar-reference.jpg');
 useMemo(()=>{map.colorSpace=SRGBColorSpace;map.anisotropy=8;map.wrapS=RepeatWrapping;map.needsUpdate=true},[map]);
 const material=useMemo(()=>createLunarMaterial(map),[map]);
 updateLunarMaterial(material,geometry,settings);
 useEffect(()=>()=>material.dispose(),[material]);
 return material;
}
function NASA({url,onLoaded,geometry,settings}){
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
 useEffect(()=>{obj.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=settings.showTerrainShadows;mesh.receiveShadow=settings.showTerrainShadows}})},[obj,settings.showTerrainShadows]);
 useEffect(()=>{onLoaded?.()},[url,onLoaded]);
 return <primitive object={obj}/>;
}

function ReferenceMoon({geometry,settings}){
 const material=useMoonMaterial(geometry,settings);
 const height=useLoader(TextureLoader,'/assets/moon-lola-height.png');
 useMemo(()=>{height.wrapS=RepeatWrapping;height.needsUpdate=true},[height]);
 useMemo(()=>{
  material.displacementMap=height;
  material.displacementScale=(10.504000663757324+8.878499984741211)/1737.4*MOON_SCENE_RADIUS;
  material.displacementBias=-8.878499984741211/1737.4*MOON_SCENE_RADIUS;
  material.bumpMap=height;material.bumpScale=.012;material.needsUpdate=true;
 },[height,material]);
 return <group quaternion={MAP_ROTATION}><mesh material={material} castShadow={settings.showTerrainShadows} receiveShadow={settings.showTerrainShadows}>
  <sphereGeometry args={[MOON_SCENE_RADIUS,256,128]}/>
 </mesh></group>;
}
function LoadingMoon(){
 return <mesh><sphereGeometry args={[MOON_SCENE_RADIUS,48,32]}/><meshStandardMaterial color="#7f8791" roughness={1}/></mesh>;
}
function SceneMarker({site,selected,onSelect,color}){
 const p=useMemo(()=>markerPosition(site),[site]);
 if(!p)return null;
 const select=e=>{e.stopPropagation();onSelect?.(site.id)};
 return <group position={p}>
  <mesh onClick={select} onPointerOver={e=>{e.stopPropagation();document.body.style.cursor='pointer'}} onPointerOut={()=>{document.body.style.cursor='auto'}}>
   <sphereGeometry args={[selected?.085:.045,16,16]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/>
  </mesh>
  <mesh><sphereGeometry args={[selected?.043:.018,18,16]}/><meshBasicMaterial color={color||'#ffd166'}/></mesh>
  {selected&&<mesh><sphereGeometry args={[.068,20,16]}/><meshBasicMaterial color={color||'#eab744'} transparent opacity={.2} depthWrite={false}/></mesh>}
 </group>;
}

/** Labels follow the same geographic positions used by rays and surface picking. */
function MarkerTracker({sites,activeId,onPositions,onAnchor}){
 const {camera,size}=useThree();
 const tick=useRef(0),previous=useRef('');
 const positions=useMemo(()=>sites.map(site=>({id:site.id,point:markerPosition(site)}))
  .filter(p=>p.point).map(p=>({...p,point:new Vector3(...p.point)})),[sites]);
 useFrame((_,delta)=>{
  tick.current+=delta;if(tick.current<.1)return;tick.current=0;
  const coords=positions.map(({id,point})=>{
   const front=point.clone().normalize().dot(camera.position.clone().sub(point))>0;
   const projected=point.clone().project(camera);
   const x=(projected.x+1)*size.width/2,y=(1-projected.y)*size.height/2;
   return {id,x:Math.round(x),y:Math.round(y),visible:front&&projected.z>=-1&&projected.z<=1&&x>=5&&x<=size.width-5&&y>=5&&y<=size.height-5};
  });
  const signature=[activeId,size.width,size.height,...coords.map(p=>[p.id,p.x,p.y,+p.visible].join(':'))].join('|');
  if(signature===previous.current)return;previous.current=signature;
  onPositions?.({points:coords,width:size.width,height:size.height});
  const active=coords.find(p=>p.id===activeId);
  if(active&&onAnchor)onAnchor({x:MathUtils.clamp(active.x/size.width*100,2,98),y:MathUtils.clamp(active.y/size.height*100,2,98)});
 });
 return null;
}
function CameraFocus({site,enabled}){
 const {camera,controls}=useThree();
 const destination=useRef(null),previous=useRef('');
 const identity=useMemo(()=>new Quaternion(),[]);
 useEffect(()=>{
  const key=site?[site.id,site.lat,site.lon].join(':'):'';
  if(!enabled||!key){destination.current=null;return}
  if(previous.current===key)return;
  previous.current=key;
  const position=markerPosition(site);
  destination.current=position?new Vector3(...position).normalize():null;
 },[site,enabled]);
 useEffect(()=>{
  const cancel=()=>{destination.current=null};
  controls?.addEventListener('start',cancel);
  return()=>controls?.removeEventListener('start',cancel);
 },[controls]);
 useFrame((_,delta)=>{
  if(!destination.current||!enabled)return;
  const origin=controls?.target||new Vector3();
  const offset=camera.position.clone().sub(origin);
  const current=offset.clone().normalize();
  const turn=new Quaternion().setFromUnitVectors(current,destination.current);
  const step=identity.clone().slerp(turn,1-Math.exp(-4.5*delta));
  camera.position.copy(offset.applyQuaternion(step).add(origin));camera.lookAt(origin);controls?.update();
  if(current.angleTo(destination.current)<.002)destination.current=null;
 });
 return null;
}
function MoonSurfacePick({onSelect}){
 return <mesh onPointerOver={e=>e.stopPropagation()} onClick={e=>{
  e.stopPropagation();
  if(e.delta<=5)onSelect?.(e.point.clone().normalize().multiplyScalar(MOON_SCENE_RADIUS).toArray());
 }}>
  <sphereGeometry args={[MOON_SCENE_RADIUS+.002,96,64]}/>
  <meshBasicMaterial transparent opacity={0} depthWrite={false}/>
 </mesh>;
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
 return <>
  <primitive object={target} position={geometry.origin}/>
  <directionalLight color="#fff0db" intensity={3.1} position={geometry.sunPosition} target={target} castShadow={settings.showTerrainShadows}
   shadow-mapSize={[2048,2048]} shadow-camera-left={-2.15} shadow-camera-right={2.15}
   shadow-camera-top={2.15} shadow-camera-bottom={-2.15} shadow-camera-near={.1} shadow-camera-far={12}
   shadow-bias={-.000025} shadow-normalBias={.0008} shadow-radius={1.5}/>

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
function ZoomRig({enlarged,geometry,viewMode,settings}){
 const {camera,size,controls}=useThree();
 const center=useMemo(()=>new Vector3(...sceneCenter(geometry,settings)),[geometry,settings]);
 useFrame((_,delta)=>{
  const oldTarget=controls?.target||new Vector3();
  const offset=camera.position.clone().sub(oldTarget);
  const base=viewMode==='home'?7.85:6.75;
  const fit=geometry?sceneCameraDistance(geometry,offset.toArray(),size.width/size.height,camera.fov,enlarged?1.04:1.18,center.toArray(),settings):null;
  const target=fit??(enlarged?base*.8:base);
  const dist=offset.length();
  offset.setLength(target>dist?target:MathUtils.damp(dist,target,3.8,delta));
  if(controls)controls.target.copy(center);
  camera.position.copy(center).add(offset);
  camera.far=Math.max(100,target+30);camera.updateProjectionMatrix();
  camera.lookAt(center);controls?.update();
 });
 return null;
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
export default function MoonScene({modelUrl,onModelLoaded,onModelError,sites,activeId,compareIds=[],onSelect,onSurfaceSelect,focusOnSite=false,zoomable=true,selectedColor,onAnchor,onPositions,clockScene=false,viewMode='default',geometry=null,timestamp=null,visualSettings=SCIENTIFIC_VIEW}){
 const selected=sites.find(s=>s.id===activeId)||sites[0];
 const [zoom,setZoom]=React.useState(false);
 const geo=clockScene?geometry:null;
 const settings=useMemo(()=>effectiveScenePreferences(visualSettings),[visualSettings]);
 const surfaceProps={geometry:geo,settings};
 useEffect(()=>()=>{document.body.style.cursor='auto'},[]);
 return <div className="moon-3d-wrap" onDoubleClick={()=>zoomable&&setZoom(v=>!v)} title={zoomable?'Drag to rotate · Double-click to fit view':'Drag to rotate'}>
  <AssetBoundary fallback={<div className="scene-unavailable" role="status"><strong>3D view unavailable</strong><p>This browser could not start WebGL. Try enabling hardware acceleration or opening LUNARIS in a browser with WebGL support.</p></div>}>
  <Canvas shadows={settings.showTerrainShadows} camera={{position:clockScene?ORBIT_VIEW_DIRECTION:[0,0,7.85],up:clockScene?MOON_NORTH:[0,1,0],fov:39,near:.1,far:100}} dpr={[1,1.8]} gl={{alpha:true,antialias:true,powerPreference:'high-performance'}}>
   <ambientLight intensity={geo?(settings.highContrastShadow?.055:.18):.55}/>
   <hemisphereLight intensity={geo?(settings.highContrastShadow?.02:.07):.21} color="#c7ddff" groundColor="#182c4a"/>
   {geo?<SunLight geometry={geo} settings={settings}/>:<>
    <directionalLight intensity={2.3} color="#ffe9c6" position={[-3.5,2.5,5.5]}/>
    <directionalLight intensity={.28} color="#3484d3" position={[5,-2,-3]}/>
   </>}
   <Suspense fallback={<LoadingMoon/>}>
    <AssetBoundary key={modelUrl||'reference'} onError={onModelError} fallback={<ReferenceMoon {...surfaceProps}/>}>
     {modelUrl?<NASA url={modelUrl} onLoaded={onModelLoaded} {...surfaceProps}/>:<ReferenceMoon {...surfaceProps}/>}
    </AssetBoundary>
   </Suspense>
   <MoonSurfacePick onSelect={onSurfaceSelect}/>
   {(!clockScene||settings.showSiteMarker)&&sites.map(s=><SceneMarker key={s.id} site={s} selected={s.id===selected?.id||compareIds.includes(s.id)}
    color={s.isMapPick?'#ff526c':compareIds.includes(s.id)?COLORS[compareIds.indexOf(s.id)%COLORS.length]:selectedColor} onSelect={onSelect}/>)}
   {geo&&<><LunarIllumination geometry={geo} settings={settings}/><SceneDirections geometry={geo} settings={settings} timestamp={timestamp}/></>}
   <OrbitControls makeDefault enableZoom={false} enablePan={false} enableDamping dampingFactor={.075} rotateSpeed={.52} minPolarAngle={.08} maxPolarAngle={Math.PI-.08}/>
   <CameraFocus enabled={!clockScene&&focusOnSite} site={selected}/>
   <ZoomRig enlarged={zoom} geometry={geo} viewMode={viewMode} settings={settings}/>
   <MarkerTracker sites={sites} activeId={activeId} onPositions={onPositions} onAnchor={onAnchor}/>
   {geo&&settings.showBloom&&<CinematicEffects/>}
  </Canvas>
  </AssetBoundary>
 </div>;
}
