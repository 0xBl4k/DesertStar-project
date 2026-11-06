export const lunarNightGLSL = `
float lunarNightWeight(vec3 point,vec3 sun) {
  // The Sun's finite angular radius gives a narrow, smooth global transition.
  float cosine=dot(normalize(point),normalize(sun));
  float width=max(0.00465,fwidth(cosine));
  return 1.0-smoothstep(-width,width,cosine);
}
float lunarHatch(vec3 point) {
  return 1.0-smoothstep(0.10,0.25,abs(sin(dot(normalize(point),vec3(29.0,43.0,17.0)))));
}
vec3 lunarNightColor(vec3 lit,vec3 albedo,vec3 point,vec3 sun,float strength,float hatching) {
  float night=lunarNightWeight(point,sun);
  vec3 dark=albedo*vec3(0.065,0.085,0.12);
  float hatch=lunarHatch(point)*hatching;
  dark=mix(dark,albedo*vec3(0.18,0.25,0.34),hatch*0.7);
  return mix(lit,dark,night*strength);
}
`;
export const lunarMaskVertex = `
varying vec3 vWorldPosition;
void main() {
  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const lunarMaskFragment = `
uniform vec3 sunDirection;
uniform vec3 nightColor;
uniform float strength;
uniform float hatching;
${lunarNightGLSL}
varying vec3 vWorldPosition;
void main() {
  vec3 surfaceNormal = normalize(vWorldPosition);
  float night = lunarNightWeight(surfaceNormal,sunDirection);
  if (night < 0.001) discard;
  float stripe = lunarHatch(surfaceNormal);
  vec3 color = mix(nightColor, vec3(0.13, 0.23, 0.36), stripe * hatching);
  gl_FragColor = vec4(color, night * min(0.95, strength + stripe * hatching * 0.16));
  #include <colorspace_fragment>
}`;

export const glowVertex = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vView = -viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
}`;

export const glowFragment = `
uniform vec3 glowColor;
uniform float radiance;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.4);
  gl_FragColor = vec4(glowColor * radiance, rim * 0.62);
  #include <colorspace_fragment>
}`;
export const sunVertexShader = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vView = -viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
}`;

export const sunFragmentShader = `
uniform sampler2D surface;
uniform float radiance;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec3 color=texture2D(surface,vUv).rgb;
  float mu=max(0.0,dot(normalize(vNormal),normalize(vView)));
  color*=(0.45+0.55*sqrt(mu))*radiance;
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const earthShellVertex = `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldView;
void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position,1.0);
  vWorldNormal = normalize((modelMatrix * vec4(normal,0.0)).xyz);
  vWorldView = cameraPosition - worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
}`;

export const atmosphereFragment = `
uniform vec3 sunDirection;
varying vec3 vWorldNormal;
varying vec3 vWorldView;
void main() {
  vec3 n = normalize(vWorldNormal);
  float daylight = smoothstep(-0.2,0.4,dot(n,normalize(sunDirection)));
  float rim = pow(1.0-abs(dot(n,normalize(vWorldView))),2.0);
  vec3 blue = mix(vec3(0.025,0.09,0.27),vec3(0.18,0.55,1.0),daylight);
  gl_FragColor = vec4(blue,rim * (0.16+0.64*daylight));
  #include <colorspace_fragment>
}`;

export const cloudsFragment = `
uniform sampler2D cloudMap;
uniform vec3 sunDirection;
varying vec2 vUv;
varying vec3 vWorldNormal;
void main() {
  float alpha=texture2D(cloudMap,vUv).r*0.88;
  if(alpha<0.015)discard;
  float daylight=max(0.0,dot(normalize(vWorldNormal),normalize(sunDirection)));
  vec3 color=mix(vec3(0.045,0.075,0.13),vec3(0.94,0.97,1.0),sqrt(daylight));
  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
