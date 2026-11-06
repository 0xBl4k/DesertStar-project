import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './DateTimePicker.css';
import {FIRST_START_DATE,LAST_START_DATE} from './timeline.js';

// Shared UTC selectors for Mission Details, Compare and scenario visualizations.
// The popup is portaled so scrollable comparison tables cannot clip it.
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS=['Su','Mo','Tu','We','Th','Fr','Sa'];
const pad=n=>String(n).padStart(2,'0');
const parseDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?new Date(value+'T00:00:00Z'):new Date('2026-11-24T00:00:00Z');
const validDate=d=>d instanceof Date&&!Number.isNaN(d.getTime());
function timeParts(value){
 const [h,m]=(value||'12:00').split(':').map(Number);
 const hour=Number.isFinite(h)?Math.max(0,Math.min(23,h)):12;
 return {h:hour%12||12,m:Number.isFinite(m)?Math.max(0,Math.min(59,m)):0,period:hour>=12?'PM':'AM'};
}
export default function DateTimePicker({kind='date',value,onChange,ariaLabel,min=FIRST_START_DATE,max=LAST_START_DATE,maxTime='23:59'}){
 const trigger=useRef(null),popup=useRef(null);
 const [open,setOpen]=useState(false);
 const [location,setLocation]=useState({top:0,left:0});
 const selected=validDate(parseDate(value))?parseDate(value):parseDate('2026-11-24');
 const [month,setMonth]=useState(()=>new Date(Date.UTC(selected.getUTCFullYear(),selected.getUTCMonth(),1)));
 const parts=timeParts(value);
 const [hour,setHour]=useState(parts.h),[minute,setMinute]=useState(parts.m),[period,setPeriod]=useState(parts.period);
 const isDate=kind==='date';
 const width=isDate?310:280;
 useEffect(()=>{if(open){const day=parseDate(value);if(isDate)setMonth(new Date(Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),1)));else{const t=timeParts(value);setHour(t.h);setMinute(t.m);setPeriod(t.period);}}},[open,isDate,value]);
 useEffect(()=>{
  if(!open)return;
  const update=()=>{const box=trigger.current?.getBoundingClientRect();if(!box)return;
    const left=Math.max(8,Math.min(box.left,window.innerWidth-width-8));
    const approximateHeight=isDate?352:275;
    const top=box.bottom+approximateHeight+10>window.innerHeight?Math.max(8,box.top-approximateHeight-8):box.bottom+8;
    setLocation({top,left});
  };
  const outside=e=>{if(!trigger.current?.contains(e.target)&&!popup.current?.contains(e.target))setOpen(false)};
  const key=e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus()}};
  update();document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);
  window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true)};
 },[open,isDate,width]);
 const display=isDate?(validDate(selected)?selected.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):value):
   (pad(parts.h)+':'+pad(parts.m)+' '+parts.period);
 const chooseDate=day=>{const chosen=month.getUTCFullYear()+'-'+pad(month.getUTCMonth()+1)+'-'+pad(day);if(chosen>=min&&chosen<=max){onChange(chosen);setOpen(false);trigger.current?.focus()}};
 const moveMonth=offset=>setMonth(d=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+offset,1)));
 const monthIndex=month.getUTCFullYear()*12+month.getUTCMonth();
 const minDate=parseDate(min),maxDate=parseDate(max);
 const canPrev=monthIndex>minDate.getUTCFullYear()*12+minDate.getUTCMonth();
 const canNext=monthIndex<maxDate.getUTCFullYear()*12+maxDate.getUTCMonth();
 const dayCount=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();
 const dow=month.getUTCDay();
 const cells=Array.from({length:Math.ceil((dow+dayCount)/7)*7},(_,index)=>index-dow+1);
 const proposedTime=pad((Number(hour)%12)+(period==='PM'?12:0))+':'+pad(Number(minute));
 const timeAllowed=proposedTime<=maxTime;
 const saveTime=()=>{
   if(!timeAllowed)return;
   onChange(proposedTime);setOpen(false);trigger.current?.focus();
 };
 return <span className="lunaris-picker">
   <button ref={trigger} type="button" className="lunaris-picker-trigger" aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel||'Choose UTC '+kind} onClick={()=>setOpen(v=>!v)}>
    <span>{display}</span><span className="lunaris-picker-chevron" aria-hidden="true">⌄</span>
   </button>
   {open&&createPortal(<div ref={popup} className="lunaris-picker-popup" role="dialog" aria-label={isDate?'Select UTC date':'Select UTC time'} style={{top:location.top,left:location.left,width}}>
    {isDate?<><div className="lunaris-cal-heading">
       <button type="button" onClick={()=>moveMonth(-1)} disabled={!canPrev} aria-label="Previous month">‹</button>
       <strong>{MONTHS[month.getUTCMonth()]} {month.getUTCFullYear()}</strong>
       <button type="button" onClick={()=>moveMonth(1)} disabled={!canNext} aria-label="Next month">›</button>
      </div><div className="lunaris-calendar-grid">{DAYS.map(d=><span key={d} className="lunaris-calendar-dayname">{d}</span>)}
      {cells.map((d,i)=>{const dateString=month.getUTCFullYear()+'-'+pad(month.getUTCMonth()+1)+'-'+pad(d);return d>0&&d<=dayCount?
       <button type="button" key={i} className={dateString===value?'selected':''} disabled={dateString<min||dateString>max} onClick={()=>chooseDate(d)} aria-label={dateString} aria-pressed={dateString===value}>{d}</button>:
       <span key={i} aria-hidden="true"/>})}
     </div><p className="lunaris-picker-caption">UTC · Available dates {min} – {max}</p></>:
     <><h3 className="lunaris-time-title">Select mission time <small>UTC</small></h3><div className="lunaris-time-fields">
      <label>Hour<select aria-label="Hour" value={hour} onChange={e=>setHour(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{pad(i+1)}</option>)}</select></label>
      <span className="lunaris-time-colon">:</span>
      <label>Minute<select aria-label="Minute" value={minute} onChange={e=>setMinute(Number(e.target.value))}>{Array.from({length:60},(_,i)=><option key={i} value={i}>{pad(i)}</option>)}</select></label>
      <label>Period<select aria-label="AM or PM" value={period} onChange={e=>setPeriod(e.target.value)}><option>AM</option><option>PM</option></select></label>
     </div>{!timeAllowed&&<p className="lunaris-picker-caption" role="status">Choose {maxTime} UTC or earlier so the full cycle fits the available data.</p>}<button type="button" className="lunaris-time-apply" disabled={!timeAllowed} onClick={saveTime}>Set UTC time</button></>}
   </div>,document.body)}
 </span>;
}
