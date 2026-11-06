export const SCENE_PREFERENCES_KEY = 'lunaris.scene-preferences.v1';

const shared = {
  show3DObjects: true, showSiteMarker: true, lockOnMoon: false,
  showEarthAtmosphere: true, showEarthClouds: true, showTerrainShadows: true,
  showSunGlow: true, showEarthGlow: true, showBloom: true, showHatching: false,
};
export const SCIENTIFIC_VIEW = Object.freeze({
  ...shared, mode: 'scientific', showEffects: false,
  showTerminator: true, showDarkOverlay: true, highContrastShadow: true,
  showDirectionLines: true, showAxes: true,
});
export const CINEMATIC_VIEW = Object.freeze({
  ...shared, mode: 'cinematic', showEffects: true,
  showTerminator: false, showDarkOverlay: false, highContrastShadow: false,
  showDirectionLines: false, showAxes: false,
});
export const BOOLEAN_PREFERENCES = Object.freeze(Object.keys(SCIENTIFIC_VIEW).filter(key => key !== 'mode'));

export function viewPreset(mode,current) {
  const result={...(mode === 'cinematic' ? CINEMATIC_VIEW : SCIENTIFIC_VIEW)};
  if(typeof current?.lockOnMoon==='boolean')result.lockOnMoon=current.lockOnMoon;
  return result;
}

export function normalizeScenePreferences(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = viewPreset(input.mode);
  for (const key of BOOLEAN_PREFERENCES) {
    if (typeof input[key] === 'boolean') result[key] = input[key];
  }
  result.mode = ['scientific', 'cinematic', 'custom'].includes(input.mode) ? input.mode : 'scientific';
  return result;
}

export function effectiveScenePreferences(value) {
  const result = normalizeScenePreferences(value);
  result.showEarthAtmosphere = result.show3DObjects && result.showEarthAtmosphere;
  result.showEarthClouds = result.show3DObjects && result.showEarthClouds;
  result.showSunGlow = result.showEffects && result.show3DObjects && result.showSunGlow;
  result.showEarthGlow = result.showEffects && result.show3DObjects && result.showEarthGlow;
  result.showBloom = result.showEffects && result.showBloom && (result.showSunGlow || result.showEarthGlow);
  result.showHatching = result.showDarkOverlay && result.showHatching;
  return result;
}

export function updateScenePreference(current, key, checked) {
  if (!BOOLEAN_PREFERENCES.includes(key) || typeof checked !== 'boolean') return normalizeScenePreferences(current);
  return {...normalizeScenePreferences(current), mode: 'custom', [key]: checked};
}

export function loadScenePreferences(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    return normalizeScenePreferences(JSON.parse(target?.getItem(SCENE_PREFERENCES_KEY) || 'null'));
  } catch {
    return viewPreset('scientific');
  }
}

export function saveScenePreferences(value, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    target?.setItem(SCENE_PREFERENCES_KEY, JSON.stringify(normalizeScenePreferences(value)));
  } catch {
    // Browsers that block local storage still get working session controls.
  }
}
