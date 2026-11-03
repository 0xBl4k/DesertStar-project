/**
 * LUNARIS geometric topocentric lunar sky model.
 * Uses open-source Astronomy Engine's planetary vectors + IAU lunar axis rotation.
 * Unlike the old prototype, Sun/Earth values are derived from celestial ephemerides.
 * Assumes a spherical reference Moon and zero atmospheric refraction.
 * Not suitable for flight planning; local terrain, obstruction, arrays, RF link budgets
 * and high-accuracy SPICE/Horizons verification are needed for operational use.
 */
import * as Astronomy from 'astronomy-engine';

const PI = Math.PI;
const rad = n => n*PI/180;
const deg = n => n*180/PI;
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize = a => {const s=Math.hypot(...a)||1;return a.map(v=>v/s)};
const minus=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,k)=>a.map(v=>v*k);
const plus=(a,b)=>a.map((v,i)=>v+b[i]);
const AU_KM = 149597870.7;
const RADIUS_KM = 1737.4;
const hours=milliseconds=>milliseconds/3600000;

function frame(site,time){
 const axis=Astronomy.RotationAxis(Astronomy.Body.Moon,time);
 const pole=normalize([axis.north.x,axis.north.y,axis.north.z]);
 const a=rad(axis.ra*15), w=rad(axis.spin), lat=rad(site.lat), lon=rad(site.lon);
 const q=[-Math.sin(a),Math.cos(a),0];
 const r=cross(pole,q);
 const x=plus(mul(q,Math.cos(w)),mul(r,Math.sin(w)));
 const y=cross(pole,x);
 const normal=plus(plus(mul(x,Math.cos(lat)*Math.cos(lon)),mul(y,Math.cos(lat)*Math.sin(lon))),mul(pole,Math.sin(lat)));
 const east=plus(mul(x,-Math.sin(lon)),mul(y,Math.cos(lon)));
 const north=plus(plus(mul(x,-Math.sin(lat)*Math.cos(lon)),mul(y,-Math.sin(lat)*Math.sin(lon))),mul(pole,Math.cos(lat)));
 return {normal,east,north};
}
function direction(vector, basis){
 const dir=normalize(vector);
 const altitude=deg(Math.asin(Math.max(-1,Math.min(1,dot(dir,basis.normal)))));
 const azimuth=(deg(Math.atan2(dot(dir,basis.east),dot(dir,basis.north)))+360)%360;
 return {altitude, azimuth};
}
export function skyAt(site, date){
 const basis=frame(site,date);
 const moon=Astronomy.GeoVector(Astronomy.Body.Moon,date,true);
 const sun=Astronomy.GeoVector(Astronomy.Body.Sun,date,true);
 const moonV=[moon.x,moon.y,moon.z];
 const obs=mul(basis.normal,(RADIUS_KM+(site.heightKm || 0))/AU_KM);
 const sunV=minus(minus([sun.x,sun.y,sun.z],moonV),obs);
 const earthV=minus(mul(moonV,-1),obs);
 return {sun:direction(sunV,basis),earth:direction(earthV,basis)};
}
export function horizonAt(azimuth, points){
 if(!points?.length)return 0;
 const a=((azimuth%360)+360)%360;
 const ordered=[...points].sort((x,y)=>x.az-y.az);
 const high=ordered.findIndex(p=>p.az>=a);
 if(high===-1){
  const last=ordered[ordered.length-1],first=ordered[0];
  const f=(a-last.az)/(first.az+360-last.az);
  return last.elev+(first.elev-last.elev)*f;
 }
 if(high===0){
  const last=ordered[ordered.length-1],first=ordered[0];
  const f=(a+360-last.az)/(first.az+360-last.az);
  return last.elev+(first.elev-last.elev)*f;
 }
 const lo=ordered[high-1],hi=ordered[high];
 return lo.elev+(hi.elev-lo.elev)*(a-lo.az)/(hi.az-lo.az);
}
export function evaluate(site,date,horizonPoints){
 const sky=skyAt(site,date);
 const sunThreshold=horizonAt(sky.sun.azimuth,horizonPoints);
 const earthThreshold=horizonAt(sky.earth.azimuth,horizonPoints);
 const sunClearance=sky.sun.altitude-sunThreshold;
 const earthClearance=sky.earth.altitude-earthThreshold;
 return {
  ...sky,
  sunThreshold,earthThreshold,sunClearance,earthClearance,
  sunVisible:sunClearance>0,
  earthVisible:earthClearance>0,
  // Level horizontal receiver under direct illumination, not actual array electrical power.
  incidence:sunClearance>0 ? Math.max(0,Math.sin(rad(sky.sun.altitude)))*100 : 0,
 };
}
export function instantUTC(date,time){
 const parsed=new Date(`${date}T${time}:00Z`);
 if(!Number.isFinite(+parsed)) throw new Error('Invalid UTC date or time');
 return parsed;
}
export function offsetUTC(date,time,offsetHours){
 const parsed=instantUTC(date,time);
 const next=new Date(+parsed+offsetHours*3600000);
 return {date:next.toISOString().slice(0,10),time:next.toISOString().slice(11,16)};
}
export function parseHorizonCSV(csv){
 const lines=csv.trim().split(/\r?\n/).filter(line=>line.trim() && !line.trim().startsWith('#'));
 const rows=[];
 for(const line of lines){
  const cells=line.split(/[,;\t]/).map(x=>x.trim());
  if(cells.length<2)continue;
  const az=Number(cells[0]),elev=Number(cells[1]);
  if(!Number.isFinite(az)||!Number.isFinite(elev))continue;
  if(az<0||az>360||elev< -90||elev>90)throw new Error('Azimuth must be 0–360° and obstruction elevation −90–90°.');
  rows.push({az:az===360?0:az,elev});
 }
 if(rows.length<4)throw new Error('Horizon CSV needs at least four rows: azimuth,elevation.');
 const map=new Map(rows.map(v=>[v.az,v]));
 return [...map.values()].sort((a,b)=>a.az-b.az);
}
function crossEvent(site,after,type,horizonPoints){
 // Searches up to 40 days forward, then bisects the first threshold crossing.
 const step=3*3600000,limit=40*24/3;
 const field=type==='sun'?'sunClearance':'earthClearance';
 let priorTime=+after;
 let prior=evaluate(site,new Date(priorTime),horizonPoints)[field];
 for(let i=1;i<=limit;i++){
  const t=+after+i*step;
  const next=evaluate(site,new Date(t),horizonPoints)[field];
  if((prior>0)!==(next>0)){
    let lo=priorTime,hi=t,low=prior;
    for(let j=0;j<16;j++){
      const mid=(lo+hi)/2;
      const val=evaluate(site,new Date(mid),horizonPoints)[field];
      if((val>0)===(low>0)){lo=mid;low=val;} else {hi=mid;}
    }
    return {timestamp:hi,hours:hours(hi-(+after)),kind:next>0?'rise':'set'};
  }
  prior=next;priorTime=t;
 }
 return null;
}
export function analyze(site,date,time,horizonPoints){
 const start=instantUTC(date,time);
 const current=evaluate(site,start,horizonPoints);
 const series=[];
 for(let i=0;i<=36;i++){
  const t=new Date(+start+i*2*3600000);
  const data=evaluate(site,t,horizonPoints);
  series.push({hour:i*2,time:t.toISOString(),sun:data.sun.altitude,earth:data.earth.altitude,
   sunClearance:data.sunClearance,earthClearance:data.earthClearance,
   sunHorizon:data.sunThreshold,earthHorizon:data.earthThreshold,
   sunVisible:data.sunVisible,earthVisible:data.earthVisible});
 }
 // Trapezoid-ish sampling: each 2h window attributed to midpoint sample.
 let sunHours=0,earthHours=0,bothHours=0;
 for(let i=0;i<36;i++){
  const mid=evaluate(site,new Date(+start+(i*2+1)*3600000),horizonPoints);
  if(mid.sunVisible)sunHours+=2;
  if(mid.earthVisible)earthHours+=2;
  if(mid.sunVisible&&mid.earthVisible)bothHours+=2;
 }
 const nextSun=crossEvent(site,start,'sun',horizonPoints);
 const nextEarth=crossEvent(site,start,'earth',horizonPoints);
 return {current,series,sunHours,earthHours,bothHours,nextSun,nextEarth,mode:horizonPoints?.length?'imported terrain horizon':'spherical reference horizon'};
}
