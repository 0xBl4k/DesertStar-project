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
  float mu = max(0.0, dot(normalize(vNormal), normalize(vView)));
  vec3 color = texture2D(surface, vUv).rgb * (0.42 + 0.58 * sqrt(mu)) * radiance;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

