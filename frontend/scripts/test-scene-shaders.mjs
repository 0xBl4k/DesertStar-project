/** Optional native shader/pixel check; Linux with Python 3 and Mesa EGL. */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {OrthographicCamera,Vector2,Vector3,Sphere,SphereGeometry,Raycaster,Matrix3,ShaderChunk,ShaderLib,Texture} from 'three';
import {lunarMaskVertex,lunarMaskFragment,glowVertex,glowFragment,sunVertexShader,sunFragmentShader,earthShellVertex,atmosphereFragment,cloudsFragment} from '../src/sceneShaders.js';
import {createLunarMaterial} from '../src/lunarSurfaceMaterial.js';
import {resolveLunarScene} from '../src/lunarEphemeris.js';

const prefix='#version 300 es\nprecision highp float;\nprecision highp int;\n#define texture2D texture\n#define textureCube texture\n';
const vertexPrefix=prefix+'#define attribute in\n#define varying out\nuniform mat4 viewMatrix; uniform bool isOrthographic; uniform vec3 cameraPosition; uniform mat4 modelMatrix; uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix; uniform mat3 normalMatrix; attribute vec3 position; attribute vec3 normal; attribute vec2 uv;\n';
// Render into a linear offscreen target, as the bloom composer does.
const fragmentPrefix=prefix+'#define varying in\nout vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\nuniform mat4 viewMatrix; uniform vec3 cameraPosition; uniform bool isOrthographic; vec4 linearToOutputTexel(vec4 value){return value;}\n';
const includes=source=>source.replace(/#include <(\w+)>/g,(_,name)=>includes(ShaderChunk[name]));
const pair=(vertex,fragment)=>({vertex:vertexPrefix+includes(vertex),fragment:fragmentPrefix+includes(fragment)});
const material=createLunarMaterial(new Texture());
const surface={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};
material.onBeforeCompile(surface);
const standardPair=(shadow=false)=>{
 const definitions='#define USE_MAP\n#define MAP_UV uv\n'+(shadow?'#define USE_SHADOWMAP\n#define SHADOWMAP_TYPE_PCF_SOFT\n':'');
 const process=source=>includes(source).replace(/\bNUM_\w+\b/g,name=>name==='NUM_DIR_LIGHTS'||(shadow&&name==='NUM_DIR_LIGHT_SHADOWS')?'1':'0').replace(/UNION_CLIPPING_PLANES/g,'0')
  .replace(/#pragma unroll_loop_start\s+for \( int i = (\d+); i < (\d+); i \+\+ \) \{([\s\S]+?)\}\s+#pragma unroll_loop_end/g,(_,start,end,body)=>Array.from({length:Number(end)-Number(start)},(_,n)=>body.replace(/\[ i \]/g,'[ '+(Number(start)+n)+' ]').replace(/UNROLLED_LOOP_INDEX/g,String(Number(start)+n))).join(''));
 return {vertex:vertexPrefix+definitions+process(surface.vertexShader),fragment:fragmentPrefix+definitions+process(surface.fragmentShader)};
};
const sphere=new SphereGeometry(1,64,40),raycaster=new Raycaster(),hit=new Vector3();
const cases=[];
const site={lat:-89.43890921454617,lon:-137.14356999445042};
for(const date of ['2026-11-01','2026-11-15','2026-11-24','2026-12-24']){
 const sun=resolveLunarScene(site,null,date,'12:00').geometry.sunDirection;
 for(const view of [[0,0,4],[3,1,2]]){
  const camera=new OrthographicCamera(-1.12,1.12,1.12,-1.12,.1,20);
  camera.position.set(...view);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const expected=[];
  for(let y=24;y<=104;y+=8)for(let x=24;x<=104;x+=8){
   raycaster.setFromCamera(new Vector2((x+.5)/64-1,(y+.5)/64-1),camera);
   if(!raycaster.ray.intersectSphere(new Sphere(new Vector3(),1),hit))continue;
   const cosine=hit.dot(new Vector3(...sun));
   if(Math.abs(cosine)<.08)continue;
   expected.push({x,y,night:cosine<0});
  }
  cases.push({name:date+' / '+view.join(','),sun,camera:view,view:camera.matrixWorldInverse.toArray(),projection:camera.projectionMatrix.toArray(),normal:new Matrix3().getNormalMatrix(camera.matrixWorldInverse).toArray(),expected});
 }
}
const data={assets:{sun:fileURLToPath(new URL('../public/assets/sun-nasa-euv.jpg',import.meta.url)),clouds:fileURLToPath(new URL('../public/assets/earth-clouds.jpg',import.meta.url)),moon:fileURLToPath(new URL('../public/assets/lunar-reference.jpg',import.meta.url))},programs:{moon:standardPair(),moonShadow:standardPair(true),mask:pair(lunarMaskVertex,lunarMaskFragment),glow:pair(glowVertex,glowFragment),sun:pair(sunVertexShader,sunFragmentShader),atmosphere:pair(earthShellVertex,atmosphereFragment),clouds:pair(earthShellVertex,cloudsFragment)},positions:Array.from(sphere.attributes.position.array),normals:Array.from(sphere.attributes.normal.array),uv:Array.from(sphere.attributes.uv.array),indices:Array.from(sphere.index.array),cases};
const args=[fileURLToPath(new URL('./verify-scene-shaders.py',import.meta.url))];
if(process.env.SHADER_PREVIEW_DIR)args.push(process.env.SHADER_PREVIEW_DIR);
const run=spawnSync(process.env.PYTHON||'python3',args,{input:JSON.stringify(data),encoding:'utf8',maxBuffer:4*1024*1024});
sphere.dispose();
if(run.stdout)process.stdout.write(run.stdout);
if(run.stderr)process.stderr.write(run.stderr);
if(run.error)throw run.error;
process.exitCode=run.status??1;
