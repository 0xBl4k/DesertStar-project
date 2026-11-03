import React,{useMemo,useRef,useEffect,Suspense,Component} from 'react';
import {Canvas,useFrame,useLoader,useThree} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {TextureLoader,Box3,Vector3,MathUtils} from 'three';
import {COLORS} from './data.js';

class ModelError extends Component{
 constructor(p){super(p);this.state={failed:false}}
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(e){this.props.onError?.(e)}
 render(){return this.state.failed?this.props.fallback:this.props.children}
}
function NASA({url,onLoaded}){
 const gltf=useLoader(GLTFLoader,url);
 const obj=useMemo(()=>{
  const o=gltf.scene.clone(true),box=new Box3().setFromObject(o),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());
  const r=Math.max(size.x,size.y,size.z)/2||1,f=1.96/r;
  o.position.set(-center.x*f,-center.y*f,-center.z*f);o.scale.setScalar(f);
  o.traverse(x=>{if(x.isMesh){x.castShadow=false;x.receiveShadow=false}});
  return o;
 },[gltf]);
 useEffect(()=>{onLoaded?.()},[url,onLoaded]);
 return <primitive object={obj}/>;
}
function Demo(){
 const map=useLoader(TextureLoader,'/assets/lunar-demo.jpg');
 const bump=useLoader(TextureLoader,'/assets/lunar-bump.png');
 return <mesh><sphereGeometry args={[1.96,96,64]}/><meshStandardMaterial map={map} roughness={1} metalness={0}/></mesh>;
}
function markerPosition(site){
 const x=site.pin?.[0]??0,y=site.pin?.[1]??0;
 return new Vector3(x*1.9,y*1.9,Math.sqrt(Math.max(.01,1-x*x-y*y))*1.985);
}
function SceneMarker({site,selected,onSelect,color}){
 const p=useMemo(()=>markerPosition(site).toArray(),[site]);
 return <group position={p}>
  <mesh onClick={e=>{e.stopPropagation();onSelect(site.id)}} onPointerOver={()=>document.body.style.cursor='pointer'} onPointerOut={()=>document.body.style.cursor='auto'}>
   <sphereGeometry args={[selected?.115:.083,16,16]}/><meshBasicMaterial color={color||'#ffcc5b'} transparent opacity={0} depthTest={false}/>
  </mesh>
  <mesh><sphereGeometry args={[selected?.054:.035,18,16]}/><meshBasicMaterial color={color||'#ffd166'}/></mesh>
  <mesh><sphereGeometry args={[selected?.104:.076,20,16]}/><meshBasicMaterial color={color||'#eab744'} transparent opacity={selected?.30:.17} depthWrite={false}/></mesh>
 </group>;
}

// Send the position of EVERY front-facing location to the accessible HTML label layer.
// Invisible/backside places aren't labeled, so tags never float over empty space.
function MarkerTracker({sites,activeId,onPositions,onAnchor}){
 const {camera,size}=useThree();
 const tick=useRef(0),previous=useRef('');
 const positions=useMemo(()=>sites.map(site=>({id:site.id,point:markerPosition(site)})),[sites]);
 useFrame((state,delta)=>{
  tick.current+=delta;
  if(tick.current<.10)return;
  tick.current=0;
  const facing=camera.position.clone().normalize();
  const coords=positions.map(({id,point})=>{
    const front=point.clone().normalize().dot(facing)>0.16;
    const projected=point.clone().project(camera);
    const x=(projected.x+1)*size.width/2,y=(1-projected.y)*size.height/2;
    return {id,x:Math.round(x),y:Math.round(y),visible:front&&x>=5&&x<=size.width-5&&y>=5&&y<=size.height-5};
  });
  const signature=`${size.width}:${size.height}|`+coords.map(p=>`${p.id}:${p.x}:${p.y}:${+p.visible}`).join('|');
  if(signature===previous.current)return;
  previous.current=signature;
  onPositions?.({points:coords,width:size.width,height:size.height});
  const active=coords.find(p=>p.id===activeId);
  if(active&&onAnchor)onAnchor({x:MathUtils.clamp(active.x/size.width*100,2,98),y:MathUtils.clamp(active.y/size.height*100,2,98)});
 });
 return null;
}
function ZoomRig({enlarged,clockScene,viewMode}){
 const {camera}=useThree();
 useFrame((_,delta)=>{
  // Per-page camera distances keep the NASA globe framed in its allotted space.
  // Homepage is smaller than V2.1, but the mission-details Moon is larger.
  const base=viewMode==='home'?7.85:viewMode==='details'?9.55:(clockScene?10.9:6.75);
  const target=enlarged?(viewMode==='home'?6.65:viewMode==='details'?8.65:(clockScene?9.8:5.05)):base;
  const dist=camera.position.length();
  if(Math.abs(target-dist)>.004){camera.position.setLength(MathUtils.damp(dist,target,3.8,delta));camera.updateProjectionMatrix()}
 });
 return null;
}
export default function MoonScene({modelUrl,onModelLoaded,onModelError,sites,activeId,compareIds=[],onSelect,zoomable=true,selectedColor,onAnchor,onPositions,clockScene=false,viewMode="default"}){
 const sel=sites.find(s=>s.id===activeId)||sites[0];
 const [zoom,setZoom]=React.useState(false);
 const [failed,setFailed]=React.useState(false);
 const modelKey=modelUrl||'demo';
 useEffect(()=>{setFailed(false)},[modelUrl]);
 useEffect(()=>()=>{document.body.style.cursor='auto'},[]);
 return <div className="moon-3d-wrap" onDoubleClick={()=>zoomable&&setZoom(v=>!v)} title={zoomable?'Drag to rotate · Double-click to change size':'Drag to rotate'}>
   <Canvas camera={{position:[0,0,7.3],fov:39,near:.1,far:60}} dpr={[1,1.8]} gl={{alpha:true,antialias:true,powerPreference:'high-performance'}}>
    <ambientLight intensity={.55}/><hemisphereLight intensity={.21} color={'#c7ddff'} groundColor={'#182c4a'}/>
    <directionalLight intensity={2.3} color={'#ffe9c6'} position={[-3.5,2.5,5.5]}/>
    <directionalLight intensity={.28} color={'#3484d3'} position={[5,-2,-3]}/>
    <Suspense fallback={<mesh><sphereGeometry args={[1.96,32,20]}/><meshStandardMaterial color="#2f3848" roughness={1}/></mesh>}>
      <ModelError key={modelKey} onError={e=>{setFailed(true);onModelError?.(e)}} fallback={<Demo/>}>
        {modelUrl&&!failed?<NASA url={modelUrl} onLoaded={onModelLoaded}/>:<Demo/>}
      </ModelError>
      {sites.map(s=><SceneMarker key={s.id} site={s} selected={s.id===sel?.id || compareIds.includes(s.id)} color={compareIds.includes(s.id)?COLORS[compareIds.indexOf(s.id)%COLORS.length]:selectedColor} onSelect={onSelect}/>)}
    </Suspense>
    <OrbitControls enableZoom={false} enablePan={false} enableDamping dampingFactor={.075} rotateSpeed={.52} minPolarAngle={.08} maxPolarAngle={Math.PI-.08}/>
    <ZoomRig enlarged={zoom} clockScene={clockScene} viewMode={viewMode}/>
    <MarkerTracker sites={sites} activeId={activeId} onPositions={onPositions} onAnchor={onAnchor}/>
   </Canvas>

  </div>;
}
