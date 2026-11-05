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
varying vec3 vWorldPosition;
void main() {
  vec3 surfaceNormal = normalize(vWorldPosition);
  float night = 1.0 - smoothstep(-0.012, 0.012, dot(surfaceNormal, normalize(sunDirection)));
  if (night < 0.001) discard;
  float stripe = 1.0 - smoothstep(0.10, 0.25, abs(sin(dot(surfaceNormal, vec3(29.0, 43.0, 17.0)))));
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
// Shared seamless 3D noise: neither poles nor the longitude seam stretch the surface.
const noise3D = `
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i+vec3(1,0,0)),f.x),
    mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),
    mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
  float sum = 0.0, amplitude = 0.5333;
  for (int i=0;i<4;i++) {
    sum += amplitude * noise3(p);
    p = p * 2.03 + vec3(7.3,13.1,19.7);
    amplitude *= 0.5;
  }
  return sum;
}
`;

export const sunVertexShader = `
varying vec3 vSurface;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vSurface = normalize(position);
  vNormal = normalize(normalMatrix * normal);
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vView = -viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
}`;

export const sunFragmentShader = `
uniform float radiance;
varying vec3 vSurface;
varying vec3 vNormal;
varying vec3 vView;
${noise3D}
float granules(vec3 p) {
  vec3 cell = floor(p), local = fract(p);
  float first = 9.0, second = 9.0;
  for (int z=-1;z<=1;z++) for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++) {
    vec3 offset = vec3(float(x),float(y),float(z));
    vec3 seed = cell + offset;
    vec3 jitter = vec3(hash31(seed),hash31(seed+17.1),hash31(seed+41.7));
    float d = length(offset + 0.2 + jitter * 0.6 - local);
    second = min(second,max(first,d));
    first = min(first,d);
  }
  return smoothstep(0.015,0.18,second-first);
}
void main() {
  vec3 p = normalize(vSurface);
  float convection = fbm(p * 8.0);
  float grain = granules(p * 72.0);
  float bright = clamp(0.25 + convection * 0.5 + grain * 0.3,0.0,1.0);
  float spots = smoothstep(0.67,0.79,fbm(p * 5.0 + vec3(11,3,7))) *
    (1.0-smoothstep(0.4,0.7,abs(p.y)));
  vec3 color = mix(vec3(1.0,0.24,0.012),vec3(1.0,0.77,0.24),bright);
  color *= (0.65 + 0.35 * grain) * (1.0 - spots * 0.82);
  float mu = max(0.0,dot(normalize(vNormal),normalize(vView)));
  color *= (0.38 + 0.62 * sqrt(mu)) * radiance;
  gl_FragColor = vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const earthShellVertex = `
varying vec3 vSurface;
varying vec3 vWorldNormal;
varying vec3 vWorldView;
void main() {
  vSurface = normalize(position);
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
uniform vec3 sunDirection;
varying vec3 vSurface;
varying vec3 vWorldNormal;
${noise3D}
void main() {
  vec3 p = normalize(vSurface);
  // Stylized cloud belts and small wisps, not date-specific weather data.
  vec3 warped = p * vec3(4.4,8.5,4.4) + vec3(fbm(p*3.0)*1.9);
  float density = fbm(warped);
  float wisps = noise3(warped*5.0);
  float alpha = smoothstep(0.46,0.66,density + wisps*0.1) * 0.78;
  if(alpha < 0.015) discard;
  float daylight = max(0.0,dot(normalize(vWorldNormal),normalize(sunDirection)));
  vec3 color = mix(vec3(0.045,0.075,0.13),vec3(0.94,0.97,1.0),sqrt(daylight));
  gl_FragColor = vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
