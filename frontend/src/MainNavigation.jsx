import React,{useLayoutEffect,useRef,useState} from 'react';

const destinations=[['home','Home'],['search','Missions'],['compare','Compare'],['about','About']];

/** Keep the links mounted so both opening and closing can finish a transition. */
export default function MainNavigation({open,page,onNavigate}) {
  const nav=useRef(null),[width,setWidth]=useState(440);
  useLayoutEffect(()=>{
    const measure=()=>setWidth(Math.ceil(nav.current.getBoundingClientRect().width));
    const observer=new ResizeObserver(measure);
    observer.observe(nav.current);measure();
    return()=>observer.disconnect();
  },[]);
  return <div className={`nav-collapse ${open?'is-open':'is-collapsed'}`} style={{'--nav-width':`${width}px`}} aria-hidden={!open} inert={open?undefined:''}>
    <div className="nav-collapse-content">
      <nav ref={nav} id="main-navigation" aria-label="Main navigation">
        {destinations.map(([destination,label])=>{
          const current=destination==='search'?['search','details'].includes(page):page===destination;
          return <button type="button" key={destination} className={current?'current':''} aria-current={current?'page':undefined} onClick={()=>onNavigate(destination)}>{label}</button>;
        })}
      </nav>
    </div>
  </div>;
}
