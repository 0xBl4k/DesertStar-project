import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {SlidersHorizontal,X} from 'lucide-react';
import {viewPreset,updateScenePreference} from './scenePreferences.js';

const groups=[
 {title:'Day & night',items:[['showTerminator','Day/night boundary'],['showTerrainShadows','Terrain relief shadows'],['showDarkOverlay','Night highlighting'],['highContrastShadow','Strong contrast'],['showHatching','Night hatching','night']]},
 {title:'Scene guides',items:[['show3DObjects','Sun & Earth bodies'],['showDirectionLines','Direction lines'],['showAxes','Moon-centered X / Y / Z axes'],['showSiteMarker','Selected location dot']]},
 {title:'Earth sky',items:[['showEarthAtmosphere','Blue atmosphere','bodies'],['showEarthClouds','Cloud layer','bodies']]},
 {title:'Cinematic effects',items:[['showEffects','Enable glow effects'],['showSunGlow','Sun glow','effects'],['showEarthGlow','Earth glow','effects'],['showBloom','Soft bloom','effects']]},
];
const modeLabel=mode=>mode==='cinematic'?'Cinematic':mode==='scientific'?'Scientific':'Custom';

export default function SceneControls({settings,onChange}){
 const [open,setOpen]=useState(false),[position,setPosition]=useState({top:0,left:0,width:340});
 const trigger=useRef(null),panel=useRef(null),id=useId();
 const close=()=>{setOpen(false);trigger.current?.focus()};
 useEffect(()=>{
  if(!open)return;
  const place=()=>{
   const bounds=trigger.current?.getBoundingClientRect();if(!bounds)return;
   const width=Math.min(360,window.innerWidth-16),height=Math.min(panel.current?.getBoundingClientRect().height||540,window.innerHeight-24);
   const left=Math.max(8,Math.min(bounds.right-width,window.innerWidth-width-8));
   const top=bounds.top>height+12?bounds.top-height-8:Math.max(8,Math.min(bounds.bottom+8,window.innerHeight-height-8));
   setPosition({top,left,width});
  };
  const outside=event=>{if(!trigger.current?.contains(event.target)&&!panel.current?.contains(event.target))setOpen(false)};
  const key=event=>{if(event.key==='Escape'){event.preventDefault();close()}};
  place();panel.current?.querySelector('select')?.focus();
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);
  window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)};
 },[open]);
 return <div className="scene-controls">
  <button ref={trigger} type="button" className="scene-controls-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(value=>!value)}><SlidersHorizontal size={16}/><strong>Visual options</strong><span>{modeLabel(settings.mode)}</span></button>
  {open&&createPortal(<div id={id} ref={panel} role="dialog" aria-label="3D visual options" className="scene-controls-panel" style={position}>
   <div className="scene-controls-heading"><strong>3D visual options</strong><button type="button" aria-label="Close visual options" onClick={close}><X size={18}/></button></div>
   <label className="scene-mode-select">View style<select aria-label="View style" value={settings.mode} onChange={event=>onChange(viewPreset(event.target.value,settings))}><option value="scientific">Scientific</option><option value="cinematic">Cinematic</option><option value="custom" disabled>Custom</option></select></label>
   {groups.map(group=><fieldset key={group.title}><legend>{group.title}</legend><div className="scene-option-grid">{group.items.map(([key,label,gate])=><label key={key} className="scene-option"><input type="checkbox" checked={settings[key]} disabled={gate==='effects'?!settings.showEffects||!settings.show3DObjects:gate==='night'?!settings.showDarkOverlay:gate==='bodies'?!settings.show3DObjects:false} onChange={event=>onChange(updateScenePreference(settings,key,event.target.checked))}/><span>{label}</span></label>)}</div></fieldset>)}
   <p className="scene-options-note">Lighting uses the Moon center. Relief shadows render NASA terrain; site visibility comes from the backend. NASA surface and cloud maps are historical imagery. Use “Lock on Moon” and scroll to inspect the surface.</p>
   <button className="scene-reset" type="button" onClick={()=>onChange(viewPreset('scientific',settings))}>Reset to scientific view</button>
  </div>,document.body)}
 </div>;
}
