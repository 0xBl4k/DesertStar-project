export const SITE_WINDOW_KEY='lunaris.site-window.v1';

export function normalizePanelSize(value) {
  const dimension=number=>Number.isFinite(number)&&number>0?number:null;
  return {width:dimension(value?.width),height:dimension(value?.height)};
}

/** Leave room for the Moon and the real column gap at every desktop width. */
export function panelSizeLimits(container,stacked=false) {
  const width=Math.max(0,container.width),height=Math.max(0,container.height);
  const gap=Math.max(0,container.gap||0);
  const scene=Number.isFinite(container.sceneMinWidth)?Math.max(0,container.sceneMinWidth):340;
  const maxWidth=stacked?width:Math.max(Math.min(280,width),width-scene-gap);
  const maxHeight=stacked?Math.min(height,Math.max(180,height-260)):height;
  return {minWidth:Math.min(280,maxWidth),maxWidth,minHeight:Math.min(180,maxHeight),maxHeight};
}

export function constrainPanelSize(size,container,stacked=false) {
  const bounds=panelSizeLimits(container,stacked);
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number.isFinite(value)?value:min));
  return {width:clamp(size.width,bounds.minWidth,bounds.maxWidth),height:clamp(size.height,bounds.minHeight,bounds.maxHeight)};
}

/** Clamp the display, preserving the preferred size for a larger screen later. */
export function resolvePanelSize(preference,container,stacked=false) {
  const saved=normalizePanelSize(preference),fitted=constrainPanelSize(saved,container,stacked);
  return {width:saved.width===null?null:fitted.width,height:saved.height===null?null:fitted.height};
}
