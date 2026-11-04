import React,{useMemo,useRef,useEffect,Suspense,Component} from 'react';
import {Canvas,useFrame,useLoader,useThree} from '@react-three/fiber';
import {OrbitControls,Line,Html} from '@react-three/drei';
import {EffectComposer,Bloom,ToneMapping} from '@react-three/postprocessing';
import {ToneMappingMode} from 'postprocessing';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {TextureLoader,Box3,Vector3,Quaternion,Matrix4,Group,Object3D,MathUtils,DataTexture,RGBAFormat,SRGBColorSpace,RepeatWrapping} from 'three';
import {COLORS} from './data.js';
import LunarIllumination,{BodyGlow} from './LunarIllumination.jsx';
import {SCIENTIFIC_VIEW,effectiveScenePreferences} from './scenePreferences.js';
import {sunVertexShader,sunFragmentShader} from './sceneShaders.js';
import {markerPosition,nasaModelToScene,mapSphereToScene,sceneCenter,sceneCameraDistance,MOON_SCENE_RADIUS,SUN_RADIUS,EARTH_RADIUS} from './lunarSceneMath.js';

const rotationFor = transform => new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(
 new Vector3(...transform([1,0,0])),new Vector3(...transform([0,1,0])),new Vector3(...transform([0,0,1]))));
const NASA_ROTATION=rotationFor(nasaModelToScene),MAP_ROTATION=rotationFor(mapSphereToScene);

class AssetBoundary extends Component{
 constructor(p){super(p);this.state={failed:false}}
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error){this.props.onError?.(error)}
 render(){return this.state.failed?this.props.fallback:this.props.children}
}

function NASA({url,onLoaded}){
 const gltf=useLoader(GLTFLoader,url);
 const obj=useMemo(()=>{
  const o=gltf.scene.clone(true);
  o.updateMatrixWorld(true);
  const center=new Box3().setFromObject(o).getCenter(new Vector3());
  const point=new Vector3();
  let radius=0;
  o.traverse(mesh=>{
   if(!mesh.isMesh)return;
   mesh.castShadow=false;mesh.receiveShadow=false;
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
 },[gltf]);
 useEffect(()=>{onLoaded?.()},[url,onLoaded]);
 return <primitive object={obj}/>;
}

function ReferenceMoon(){
 const texture=useLoader(TextureLoader,'/assets/lunar-reference.jpg');
 useMemo(()=>{texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;texture.needsUpdate=true},[texture]);
 return <group quaternion={MAP_ROTATION}><mesh>
  <sphereGeometry args={[MOON_SCENE_RADIUS,96,64]}/>
  <meshStandardMaterial map={texture} roughness={1} metalness={0}/>
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

function createSolarTexture(){
 const width=256,height=128,data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=x/width,v=y/height,at=(y*width+x)*4;
  const waves=Math.sin(u*Math.PI*24+Math.sin(v*15)*2)*.35+
   Math.sin(v*55+u*Math.PI*12)*.28+Math.sin(u*Math.PI*40+v*105)*.18;
  data[at]=255;data[at+1]=Math.round(180+38*waves);data[at+2]=Math.round(54+31*waves);data[at+3]=255;
 }
 const texture=new DataTexture(data,width,height,RGBAFormat);
 texture.needsUpdate=true;texture.colorSpace=SRGBColorSpace;texture.wrapS=RepeatWrapping;
 return texture;
}
function SunBody({position,glow}){
 const texture=useMemo(createSolarTexture,[]);
 const uniforms=useMemo(()=>({surface:{value:texture},radiance:{value:glow?3.5:1.3}}),[texture,glow]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 return <group position={position}>
  <mesh><sphereGeometry args={[SUN_RADIUS,64,40]}/>
   <shaderMaterial vertexShader={sunVertexShader} fragmentShader={sunFragmentShader} uniforms={uniforms} toneMapped={!glow}/></mesh>
  {glow&&<BodyGlow radius={SUN_RADIUS*1.45} color="#ffb64b" radiance={3.5}/>}
  <Html position={[0,SUN_RADIUS+.2,0]} center occlude zIndexRange={[3,0]} className="scene-body-label sun-label">SUN</Html>
 </group>;
}
function EarthBody({position,glow}){
 const texture=useLoader(TextureLoader,'/assets/earth-day.jpg');
 useMemo(()=>{texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;texture.needsUpdate=true},[texture]);
 return <group position={position}>
  <mesh rotation={[.15,.65,0]}><sphereGeometry args={[EARTH_RADIUS,64,40]}/>
   <meshStandardMaterial map={texture} roughness={.9} metalness={0} emissive="#11243d" emissiveIntensity={.12}/></mesh>
  {glow&&<BodyGlow radius={EARTH_RADIUS*1.16} color="#58bfff" radiance={4}/>}
  <Html position={[0,EARTH_RADIUS+.2,0]} center occlude zIndexRange={[3,0]} className="scene-body-label earth-label">EARTH</Html>
 </group>;
}
function PlainEarth({position}){
 return <mesh position={position}><sphereGeometry args={[EARTH_RADIUS,40,28]}/><meshStandardMaterial color="#267cc6"/></mesh>;
}
function SunLight({geometry}){
 const target=useMemo(()=>new Object3D(),[]);
 return <>
  <primitive object={target} position={geometry.marker}/>
  <directionalLight color="#fff0db" intensity={3.1} position={geometry.sunPosition} target={target}/>
 </>;
}
function SceneDirections({geometry,settings}){
 const {marker,frame,sunPosition,earthPosition}=geometry;
 return <>
  {settings.showDirectionLines&&<><Line points={[marker,sunPosition]} color="#ffd05a" lineWidth={1.6} transparent opacity={.8}/>
  <Line points={[marker,earthPosition]} color="#43bfff" lineWidth={1.6} transparent opacity={.8}/></>}
  {settings.show3DObjects&&<><SunBody position={sunPosition} glow={settings.showSunGlow}/>
   <AssetBoundary fallback={<PlainEarth position={earthPosition}/>}>
    <Suspense fallback={<PlainEarth position={earthPosition}/>}><EarthBody position={earthPosition} glow={settings.showEarthGlow}/></Suspense>
   </AssetBoundary></>}
  {settings.showAxes&&[['east','X / E','#ff6868'],['north','Y / N','#5ed7ff'],['up','Z / Up','#76ee9a']].map(([key,label,color])=>
   <group key={key}>
    <arrowHelper args={[new Vector3(...frame[key]),new Vector3(...marker),.72,color,.11,.055]}/>
    <Html position={marker.map((v,i)=>v+frame[key][i]*.86)} center occlude zIndexRange={[3,0]} className="scene-axis-label"><span style={{color}}>{label}</span></Html>
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
export default function MoonScene({modelUrl,onModelLoaded,onModelError,sites,activeId,compareIds=[],onSelect,onSurfaceSelect,focusOnSite=false,zoomable=true,selectedColor,onAnchor,onPositions,clockScene=false,viewMode='default',geometry=null,visualSettings=SCIENTIFIC_VIEW}){
 const selected=sites.find(s=>s.id===activeId)||sites[0];
 const [zoom,setZoom]=React.useState(false);
 const geo=clockScene?geometry:null;
 const settings=useMemo(()=>effectiveScenePreferences(visualSettings),[visualSettings]);
 useEffect(()=>()=>{document.body.style.cursor='auto'},[]);
 return <div className="moon-3d-wrap" onDoubleClick={()=>zoomable&&setZoom(v=>!v)} title={zoomable?'Drag to rotate · Double-click to fit view':'Drag to rotate'}>
  <AssetBoundary fallback={<div className="scene-unavailable" role="status"><strong>3D view unavailable</strong><p>This browser could not start WebGL. Try enabling hardware acceleration or opening LUNARIS in a browser with WebGL support.</p></div>}>
  <Canvas camera={{position:[0,0,7.85],fov:39,near:.1,far:100}} dpr={[1,1.8]} gl={{alpha:true,antialias:true,powerPreference:'high-performance'}}>
   <ambientLight intensity={geo?(settings.highContrastShadow?.055:.18):.55}/>
   <hemisphereLight intensity={geo?(settings.highContrastShadow?.02:.07):.21} color="#c7ddff" groundColor="#182c4a"/>
   {geo?<SunLight geometry={geo}/>:<>
    <directionalLight intensity={2.3} color="#ffe9c6" position={[-3.5,2.5,5.5]}/>
    <directionalLight intensity={.28} color="#3484d3" position={[5,-2,-3]}/>
   </>}
   <Suspense fallback={<LoadingMoon/>}>
    <AssetBoundary key={modelUrl||'reference'} onError={onModelError} fallback={<ReferenceMoon/>}>
     {modelUrl?<NASA url={modelUrl} onLoaded={onModelLoaded}/>:<ReferenceMoon/>}
    </AssetBoundary>
   </Suspense>
   <MoonSurfacePick onSelect={onSurfaceSelect}/>
   {(!clockScene||settings.showSiteMarker)&&sites.map(s=><SceneMarker key={s.id} site={s} selected={s.id===selected?.id||compareIds.includes(s.id)}
    color={s.isMapPick?'#ff526c':compareIds.includes(s.id)?COLORS[compareIds.indexOf(s.id)%COLORS.length]:selectedColor} onSelect={onSelect}/>)}
   {geo&&<><LunarIllumination geometry={geo} settings={settings}/><SceneDirections geometry={geo} settings={settings}/></>}
   <OrbitControls makeDefault enableZoom={false} enablePan={false} enableDamping dampingFactor={.075} rotateSpeed={.52} minPolarAngle={.08} maxPolarAngle={Math.PI-.08}/>
   <CameraFocus enabled={focusOnSite} site={selected}/>
   <ZoomRig enlarged={zoom} geometry={geo} viewMode={viewMode} settings={settings}/>
   <MarkerTracker sites={sites} activeId={activeId} onPositions={onPositions} onAnchor={onAnchor}/>
   {geo&&settings.showBloom&&<CinematicEffects/>}
  </Canvas>
  </AssetBoundary>
 </div>;
}
