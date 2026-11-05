import {MeshStandardMaterial,Vector3} from 'three';
import {lunarNightGLSL} from './sceneShaders.js';

/** Project NASA's cylindrical map by lunar coordinates, including on the NASA
 * GLB's cube-atlas UVs. The surface and its cast shadows keep the original relief.
 * Night highlighting is applied to this actual surface, never a floating sphere.
 */
export function createLunarMaterial(map) {
  const material=new MeshStandardMaterial({map,roughness:1,metalness:0});
  const uniforms={lunarSun:{value:new Vector3(0,1,0)},nightStrength:{value:0},nightHatching:{value:0}};
  material.userData.lunarUniforms=uniforms;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec3 vLunarPoint;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <displacementmap_vertex>',
      '#include <displacementmap_vertex>\n vLunarPoint=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=`varying vec3 vLunarPoint;
      uniform vec3 lunarSun; uniform float nightStrength; uniform float nightHatching;
      ${lunarNightGLSL}\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec3 lunarNormal=normalize(vLunarPoint);
      vec2 lunarUv=vec2(atan(lunarNormal.x,lunarNormal.y)/6.28318530718+0.5,
        asin(clamp(-lunarNormal.z,-1.0,1.0))/3.14159265359+0.5);
      diffuseColor*=texture2D(map,lunarUv);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      #include <opaque_fragment>
      gl_FragColor.rgb=lunarNightColor(gl_FragColor.rgb,diffuseColor.rgb,
        vLunarPoint,lunarSun,nightStrength,nightHatching);
    `);
  };
  material.customProgramCacheKey=()=> 'nasa-lunar-surface-v2';
  return material;
}

export function updateLunarMaterial(material,geometry,settings) {
  const uniforms=material.userData.lunarUniforms;
  if(geometry)uniforms.lunarSun.value.set(...geometry.sunDirection);
  uniforms.nightStrength.value=geometry&&settings.showDarkOverlay?(settings.highContrastShadow?.9:.62):0;
  uniforms.nightHatching.value=geometry&&settings.showHatching?1:0;
}
