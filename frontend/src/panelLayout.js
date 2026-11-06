export const SITE_WINDOW_KEY='lunaris.site-window.v1';

export function normalizePanelSize(value) {
  const dimension=number=>Number.isFinite(number)&&number>0?number:null;
  return {width:dimension(value?.width),height:dimension(value?.height)};
}

/** Leave room for the Moon; narrow screens stack the panel above the scene. */
export function constrainPanelSize(size,container,stacked=false) {
  const width=Math.max(0,container.width),height=Math.max(0,container.height);
  const maxWidth=stacked?width:Math.max(Math.min(280,width),width-340);
  const maxHeight=stacked?Math.min(height,Math.max(180,height-260)):height;
  const clamp=(value,min,max)=>Math.min(max,Math.max(Math.min(min,max),value));
  return {width:clamp(size.width,280,maxWidth),height:clamp(size.height,180,maxHeight)};
}
