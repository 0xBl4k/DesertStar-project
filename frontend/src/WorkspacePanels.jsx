import React,{useEffect,useId,useRef,useState} from 'react';
import {Menu,RotateCcw} from 'lucide-react';
import {SITE_WINDOW_KEY,normalizePanelSize,constrainPanelSize} from './panelLayout.js';

function usePanelOpen(name,initial=true) {
  const key=`lunaris.panel.${name}`;
  const [open,setOpen]=useState(()=>{
    try {const saved=localStorage.getItem(key);return saved===null?initial:saved==='true'}
    catch {return initial}
  });
  useEffect(()=>{try {localStorage.setItem(key,String(open))}catch {}},[key,open]);
  return [open,setOpen];
}

export function CollapsiblePanel({name,title,children,className='',initialOpen=true}) {
  const [open,setOpen]=usePanelOpen(name,initialOpen),id=useId();
  return <section className={`collapsible-panel ${className} ${open?'is-open':'is-collapsed'}`}>
    <header className="panel-heading">
      <button type="button" className="panel-menu-button" aria-label={`${open?'Collapse':'Expand'} ${title}`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}><Menu size={18}/></button>
      <strong>{title}</strong>
    </header>
    <div id={id} className="collapsible-content" hidden={!open}>{children}</div>
  </section>;
}

export function ResizableSitePanel({children}) {
  const [open,setOpen]=usePanelOpen('selected-site'),id=useId(),panel=useRef(null),drag=useRef(null);
  const [size,setSize]=useState(()=>{
    try {return normalizePanelSize(JSON.parse(localStorage.getItem(SITE_WINDOW_KEY)||'null'))}
    catch {return normalizePanelSize(null)}
  });
  useEffect(()=>{try {localStorage.setItem(SITE_WINDOW_KEY,JSON.stringify(size))}catch {}},[size]);
  const available=()=>{
    const parent=panel.current.parentElement;
    return {width:parent.clientWidth-parseFloat(getComputedStyle(parent).paddingLeft)-parseFloat(getComputedStyle(parent).paddingRight),height:parent.clientHeight-parseFloat(getComputedStyle(parent).paddingTop)-parseFloat(getComputedStyle(parent).paddingBottom)};
  };
  const fit=next=>constrainPanelSize(next,available(),matchMedia('(max-width:900px)').matches);
  useEffect(()=>{
    if(!open)return;
    const observer=new ResizeObserver(()=>setSize(previous=>{
      if(previous.width===null&&previous.height===null)return previous;
      const rect=panel.current.getBoundingClientRect(),next=fit({width:previous.width??rect.width,height:previous.height??rect.height});
      return next.width===previous.width&&next.height===previous.height?previous:next;
    }));
    observer.observe(panel.current.parentElement);
    return()=>observer.disconnect();
  },[open]);
  const start=(event,axis)=>{
    if(event.button!==0)return;
    const rect=panel.current.getBoundingClientRect();
    drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,width:rect.width,height:rect.height,axis};
    event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();
  };
  const move=event=>{
    const current=drag.current;if(!current||current.id!==event.pointerId)return;
    setSize(fit({width:current.width+event.clientX-current.x,height:current.height+(current.axis==='both'?event.clientY-current.y:0)}));
  };
  const stop=event=>{if(drag.current?.id===event.pointerId)drag.current=null};
  const keyResize=(event,axis)=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key))return;
    event.preventDefault();
    if(event.key==='Home'){setSize(normalizePanelSize(null));return}
    const rect=panel.current.getBoundingClientRect(),step=event.shiftKey?48:16;
    setSize(fit({width:rect.width+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),height:rect.height+(axis==='both'?(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0):0)}));
  };
  const resizeEvents=axis=>({onPointerDown:event=>start(event,axis),onPointerMove:move,onPointerUp:stop,onPointerCancel:stop,onLostPointerCapture:stop,onKeyDown:event=>keyResize(event,axis)});
  return <section ref={panel} className={`detail-left left-column site-window ${open?'is-open':'is-collapsed'}`} style={open?{width:size.width??undefined,height:size.height??undefined}:undefined} aria-label="Selected site window">
    <header className="panel-heading">
      <button type="button" className="panel-menu-button" aria-label={`${open?'Collapse':'Expand'} selected site`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}><Menu size={18}/></button>
      {open&&<><strong>Selected site</strong><button type="button" className="panel-reset-button" aria-label="Reset selected site window size" title="Reset window size" onClick={()=>setSize(normalizePanelSize(null))}><RotateCcw size={15}/></button></>}
    </header>
    <div id={id} className="site-window-body" hidden={!open}>{children}</div>
    {open&&<>
      <div role="separator" tabIndex={0} aria-label="Resize selected site width" aria-orientation="vertical" aria-valuemin={280} aria-valuemax={Math.max(280,availableSafeWidth(panel)-340)} aria-valuenow={Math.round(size.width??panel.current?.clientWidth??440)} className="site-window-edge" {...resizeEvents('width')}/>
      <button type="button" className="site-window-corner" aria-label="Resize selected site window" title="Drag to resize · Arrow keys resize · Home resets" {...resizeEvents('both')}><span/></button>
    </>}
  </section>;
}

function availableSafeWidth(panel) {return panel.current?.parentElement?.clientWidth??1200}
