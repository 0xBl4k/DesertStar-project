import React,{useState,useEffect,useMemo,useCallback,useRef} from 'react';
import {Search,ArrowRight,ArrowLeft,BarChart3,Sun,Earth,CalendarDays,Clock3,Play,Pause,RotateCcw,MapPin,Plus,X,Radio,Mountain,Compass,ChevronRight,LocateFixed,Info,FileText,ShieldCheck,Menu,ExternalLink,ChevronLeft,Mouse} from 'lucide-react';
import MoonScene from './MoonScene.jsx';
import DateTimePicker from './DateTimePicker.jsx';
import SceneControls from './SceneControls.jsx';
import {SITES,COLORS,fmtAngle,changeHours} from './data.js';
import {useScenario, useComparisons} from './useBackend.js';
import {emptyMetric, metricAt, loadSiteCatalog} from './api.js';
import {surfaceCoordinates} from './lunarSceneMath.js';
import {resolveLunarScene} from './lunarEphemeris.js';
import {SCIENTIFIC_VIEW,loadScenePreferences,saveScenePreferences} from './scenePreferences.js';
import {HOURS_PER_SCENARIO,TIMELINE_TICKS,advancePlayback,scenarioTimestamp,latestStartTime,clampStartTime} from './timeline.js';

const NASA_URL='https://svs.gsfc.nasa.gov/14959/';
const NASA_ASSET='https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/moon_small.glb';
const TABS=[['overview','Overview',FileText],['lighting','Lighting & Power',Sun],['earth','Earth Visibility',Radio],['timeline','Mission Timeline',Clock3]];
const INITIAL_DATE='2026-11-24',INITIAL_TIME='12:00';
const asFixed=n=>Number.isFinite(n)?n.toFixed(1):'—';
const range=(v,min,max)=>Math.max(min,Math.min(max,v));
const makeId=()=>`custom-${Date.now()}`;
const norm=(n)=>Number.isFinite(n)?n:0;
const showHours=h=>h==null?'N/A':`${h.toFixed(1)} h`;
const showVisibility=v=>v==null?'Not calculated':v?'Visible':'Obstructed';
const icon=(Icon,size=16)=> <Icon size={size} strokeWidth={1.8} aria-hidden="true"/>;
function SiteBadge({children,kind='blue'}){return <span className={'chip chip-'+kind}>{children}</span>}

// A site name is revealed only AFTER its yellow marker is clicked.
// The label itself is the second, explicit action that opens mission details.
function PlaceLabels({sites,positions,revealedId,onSelect}){
 const label=useMemo(()=>{
  if(!revealedId||!positions?.width||!positions?.height)return null;
  const site=sites.find(s=>s.id===revealedId);
  const pt=positions.points.find(p=>p.id===revealedId&&p.visible);
  if(!site||!pt)return null;
  const {width,height}=positions;
  const name=site.short||site.name;
  const w=Math.min(width-16,Math.max(112,Math.min(220,name.length*7.7+38)));
  const h=34;
  const x=range(pt.x-w/2,8,Math.max(8,width-w-8));
  const y=site.isMapPick?pt.y+19:(pt.y>h+22?pt.y-h-16:pt.y+19);
  return {site,name,x,y:range(y,8,Math.max(8,height-h-8)),w:site.isMapPick?Math.min(width-16,166):w,px:pt.x,py:pt.y};
 },[revealedId,sites,positions]);
 if(!label)return null;
 return <div className="site-label-layer" aria-live="polite">
  <svg className="site-label-leaders" aria-hidden="true" width="100%" height="100%">
   <path d={`M${label.px} ${label.py} L${label.x+label.w/2} ${label.y+17}`} stroke={label.site.isMapPick?'#ff607a':'#fed166'}/>
  </svg>
  <button type="button" className={`map-site-label is-active ${label.site.isMapPick?'map-pick-label':''}`} style={{left:label.x,top:label.y,width:label.w,'--tag-color':label.site.isMapPick?'#ff526c':'#f8cf6a'}} onClick={()=>onSelect(label.site.id)} aria-label={`Open details for ${label.site.name}`} title="Open mission details">
   <span className="map-tag-dot"/><span className="map-tag-text">{label.site.isMapPick?'Show More Details':label.name}</span>{icon(ChevronRight,14)}
  </button>
 </div>;
}
function GlobeStage({sites,activeId,compareIds=[],onSelect,modelUrl,modelStatus,onLoaded,onError,compact=false,clock=false,data,elapsed=0,date,time,moonView="default",customPickSite=null,onSurfaceSelect,onPickedDetails,focusOnSite=false,visualSettings=SCIENTIFIC_VIEW}){
 const [positions,setPositions]=useState(null);
 const [revealedId,setRevealedId]=useState(null);
 const sceneSites=useMemo(()=>customPickSite?[...sites.filter(s=>s.id!==customPickSite.id),customPickSite]:sites,[sites,customPickSite]);
 const sceneSite=sceneSites.find(s=>s.id===activeId)||sceneSites[0];
 const scene=useMemo(()=>clock?resolveLunarScene(sceneSite,data,date,time,elapsed):null,[clock,sceneSite,data,date,time,elapsed]);
 const moment=clock&&date&&time?changeHours(date,time,elapsed):null;
 useEffect(()=>{setRevealedId(null)},[activeId]);
 useEffect(()=>{if(customPickSite)setRevealedId(customPickSite.id)},[customPickSite]);
 return <section className={`globe-stage ${compact?'compact':''} ${clock?'has-clock':''}`} aria-label="Interactive NASA Moon view">
  <div className="stage-upper"><span className="eyebrow">NASA / LRO · 3D MOON</span><span className="stage-gesture">{icon(Mouse,16)} <b>Drag</b> to rotate <span>·</span> <b>Double-click</b> to fit <span>·</span> Select a gold dot</span></div>
  <div className="scene-area">
    {clock&&<div className="sky3d-legend" aria-label="Three-dimensional celestial direction guide">
     <b>{scene?.source==='backend'?'3D SUN / EARTH · API':scene?.source==='ephemeris'?'3D SUN / EARTH · LOCAL DATA':'3D DATA UNAVAILABLE'}</b>
     {moment&&<time dateTime={`${moment.date}T${moment.time}:00Z`}>{moment.date} · {moment.time} UTC</time>}
     {scene?.geometry?<>
      <span><i className="legend-sun"/> Sun {fmtAngle(scene.sky.sun.altitude)} · az {asFixed(scene.sky.sun.azimuth)}°</span>
      <span><i className="legend-earth"/> Earth {fmtAngle(scene.sky.earth.altitude)} · az {asFixed(scene.sky.earth.azimuth)}°</span>
      {visualSettings.showTerminator&&<span><i className="legend-boundary"/> Day/night boundary</span>}
      {visualSettings.showDarkOverlay&&<span><i className="legend-night"/> Night area {visualSettings.showHatching?'· hatched':''}</span>}
      {visualSettings.showAxes&&<small>Local axes: X/East · Y/North · Z/Up</small>}
      <small>Global lighting · sizes/distances schematic</small>
     </>:<small>Choose a time within Nov 2026 – Oct 2027</small>}
    </div>}
    <MoonScene modelUrl={modelUrl} onModelLoaded={onLoaded} onModelError={onError} sites={sceneSites} activeId={activeId} compareIds={compareIds} onSelect={setRevealedId} onSurfaceSelect={onSurfaceSelect} zoomable={true} clockScene={clock} geometry={scene?.geometry} timestamp={scenarioTimestamp(date,time,elapsed)} viewMode={moonView} focusOnSite={focusOnSite} visualSettings={visualSettings} onPositions={setPositions}/>
    {(!clock||visualSettings.showSiteMarker)&&<PlaceLabels sites={sceneSites} positions={positions} revealedId={revealedId} onSelect={id=>id===customPickSite?.id?onPickedDetails?.():onSelect(id)}/>}
  </div>
 </section>
}
function ActionButtons({navigate}){return <div className="top-actions"><button type="button" className="btn btn-blue" onClick={()=>navigate('search')}>{icon(Search,17)} Search for Places {icon(ArrowRight,17)}</button><button type="button" className="btn btn-gold" onClick={()=>navigate('compare')}>{icon(BarChart3,18)} Compare Sites {icon(ArrowRight,17)}</button></div>}
function Home({navigate,sites,activeId,onSelect,...globeProps}){
 return <main className="view home-view view-enter">
   <div className="home-copy"><span className="eyebrow">EXPLORE · ANALYZE · PLAN</span><h1>LUNAR<br/><em>SOUTH</em> POLE</h1><p>Explore potential landing regions and understand the sunlight and Earth visibility that shape missions to the Moon.</p>
     <div className="home-divider"/>
     <div className="home-features"><div>{icon(Sun,27)}<span><strong>Solar power</strong><small>Lighting & shadow conditions</small></span></div><div>{icon(Radio,27)}<span><strong>Earth visibility</strong><small>Direct communication windows</small></span></div><div>{icon(BarChart3,27)}<span><strong>Compare sites</strong><small>Find mission trade-offs</small></span></div></div>
     <div className="home-bottom-info"><span className="gold-dot"/> SELECT ANY YELLOW DOT TO EXPLORE</div>
   </div>
   <ActionButtons navigate={navigate}/>
   <div className="home-globe"><GlobeStage {...globeProps} sites={sites} activeId={activeId} moonView="home" onSelect={id=>{onSelect(id);navigate('details');}}/></div>
   <div className="home-footnote">AUTHENTIC NASA LRO 3D MODEL WHEN AVAILABLE · SITE MARKERS APPROXIMATE</div>
 </main>
}
function SearchPage({sites,activeId,setActiveId,addCustom,navigate,addCompare,comparePickMode,cancelComparePick,...globeProps}){
 const [term,setTerm]=useState(''),[tab,setTab]=useState('missions'),[locationName,setLocationName]=useState('My landing site'),[lat,setLat]=useState('-89.70'),[lon,setLon]=useState('0.60'),[error,setError]=useState('');
 const [pickedSite,setPickedSite]=useState(null);
 const pickMoon=point=>{
  const coordinates=surfaceCoordinates(point);
  if(!coordinates)return;
  const {lat:lt,lon:ln}=coordinates;
  const [x,y]=point,r=Math.hypot(...point);
  const id=makeId();
  setPickedSite({id,name:'Selected Moon location',short:'Selected location',kind:'Custom coordinates',lat:lt,lon:ln,pin:[x/r,y/r],worldPoint:point,isMapPick:true,type:'Moon surface selection',summary:'Explore Sun and Earth geometry for this Moon location.',why:'Terrain-aware results depend on your backend.',resources:'User-selected location · verify 3D coordinate frame'});
 };
 const openPicked=()=>{if(!pickedSite)return;const {isMapPick,...site}=pickedSite;addCustom(site);setPickedSite(null);if(comparePickMode)addCompare(site.id);else navigate('details')};
 const filtered=sites.filter(s=>s.name.toLowerCase().includes(term.toLowerCase())||s.type.toLowerCase().includes(term.toLowerCase())||s.kind.toLowerCase().includes(term.toLowerCase()));
 const choose=id=>{setActiveId(id);if(comparePickMode)addCompare(id);else navigate('details')};
 const submit=e=>{e.preventDefault();const lt=Number(lat),ln=Number(lon),name=locationName.trim();if(!name){setError('Please enter a name for this location.');return;}if(!Number.isFinite(lt)||!Number.isFinite(ln)||lat.trim()===''||lon.trim()===''||lt<-90||lt>90||ln<-180||ln>180){setError('Latitude must be −90 to 90; longitude −180 to 180.');return;}
   setError('');const id=makeId();addCustom({id,name,short:name,kind:'Custom coordinates',lat:lt,lon:ln,pin:[Math.min(.83,(90+lt)/12)*Math.sin(ln*Math.PI/180),Math.min(.83,(90+lt)/12)*Math.cos(ln*Math.PI/180)],type:'Custom location',summary:'Your selected lunar coordinates are ready for geometric Sun and Earth exploration.',why:'Custom coordinates let you examine arbitrary locations, but local terrain must be checked separately.',resources:'Custom coordinates · unverified terrain'});if(comparePickMode)addCompare(id);else navigate('details');};
 return <main className="view split-view search-view view-enter">
  <section className="search-left left-column">
    <header className="page-intro"><span className="eyebrow">LANDING REGION EXPLORER</span><h2>Search for Places</h2><p>Choose a region to open its mission details instantly, or enter your own coordinates.</p></header>
    {comparePickMode&&<div className="compare-pick-banner"><span>Adding a place to Compare</span><button onClick={cancelComparePick}>{icon(ArrowLeft,15)} Back to table</button></div>}
    <div className="tab-pills"><button className={tab==='missions'?'active':''} onClick={()=>setTab('missions')}>⌾ &nbsp; Terrain Presets &amp; NASA Regions</button><button className={tab==='coordinates'?'active':''} onClick={()=>setTab('coordinates')}>{icon(MapPin,15)} &nbsp; Custom Coordinates</button></div>
    {tab==='missions'?<div className="search-list-content"><label className="search-input">{icon(Search,17)}<input placeholder="Search a region name..." value={term} onChange={e=>setTerm(e.target.value)}/></label><div className="places-list" role="region" aria-label="Scrollable lunar landing site list" tabIndex="0">{filtered.length?filtered.map(s=><button key={s.id} className={`place-row ${activeId===s.id?'selected':''}`} onClick={()=>choose(s.id)} aria-label={`${comparePickMode?'Add to comparison':'Open details for'} ${s.name}`} title={comparePickMode?`Add ${s.name} to comparison`:`View details: ${s.name}`}><div className="place-thumbnail">{icon(Mountain,23)}</div><div className="place-text"><strong>{s.name}</strong><small>{s.kind} · {s.type}</small></div>{icon(ChevronRight,18)}</button>):<div className="empty-msg">No matching regions.</div>}</div></div>:<form className="coordinates-form" onSubmit={submit}><p>Enter a name and lunar geographic coordinates to examine a custom site.</p><label>Location name <input type="text" required maxLength={48} value={locationName} onChange={e=>setLocationName(e.target.value)} placeholder="e.g. My south-pole site"/></label><label>Latitude <span>(degrees)</span><input type="number" step="0.01" value={lat} onChange={e=>setLat(e.target.value)}/></label><label>Longitude <span>(degrees)</span><input type="number" step="0.01" value={lon} onChange={e=>setLon(e.target.value)}/></label>{error&&<div className="form-error" role="alert">{error}</div>}<button className="btn btn-blue full" type="submit">{icon(LocateFixed,17)} {comparePickMode?'Add to Comparison':'Analyze this location'} {icon(ArrowRight,17)}</button></form>}

  </section>
  <div className="search-right right-column"><GlobeStage {...globeProps} sites={sites} activeId={activeId} onSelect={choose} onSurfaceSelect={pickMoon} customPickSite={pickedSite} onPickedDetails={openPicked} compact/><div className="right-caption"><span className="gold-dot"/> CLICK ANY YELLOW MARKER TO SELECT A REGION <span className="caption-right">NASA GSFC / LRO</span></div></div>
 </main>
}
function InfoCard({Icon,label,value,subtitle}){return <div className="info-card">{icon(Icon,20)}<span><small>{label}</small><strong>{value}</strong>{subtitle&&<em>{subtitle}</em>}</span></div>}
function DetailsTabs({site,tab,setTab,m}){
 return <div className="mission-tabs-panel"><div className="detail-tabs">{TABS.map(([id,label,Icon])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{icon(Icon,17)}<span>{label}</span></button>)}</div>
 <div className="tab-body" key={tab}>
  {tab==='overview'&&<><h3>Mission overview</h3><p>{site.backendSiteId?'This is a precomputed scientific terrain site with a local 360-degree horizon profile.':site.kind==='Custom coordinates'?'This is a user-defined lunar location, not a NASA-selected landing site. The backend supplies geometry only.':<>NASA's Artemis program is studying {site.name} as a <b>candidate region</b> near the lunar south pole; no touchdown point is represented as final.</>}</p><div className="overview-split"><div><h4>Key information</h4><dl><dt>Agency</dt><dd>{site.backendSiteId?'Precomputed scientific site':site.kind==='Custom coordinates'?'User-defined site':'NASA / Artemis'}</dd><dt>Region</dt><dd>{site.name}</dd><dt>Type</dt><dd>{site.type}</dd><dt>Selection status</dt><dd>{site.backendSiteId?'Terrain profile':site.kind==='Custom coordinates'?'Custom location':'Candidate region'}</dd><dt>Reference latitude</dt><dd>{site.lat.toFixed(2)}°</dd></dl></div><div className="moon-thumb"><img src="/assets/lunar-demo.jpg" alt="Lunar surface texture preview"/><span>South pole terrain</span></div></div></>}
  {tab==='lighting'&&<><h3>Lighting & power</h3><p>Sun elevation from the DesertStar backend. The full-cycle estimate depends on the site's horizon model.</p><div className="tab-stats"><InfoCard Icon={Sun} label="Sun elevation" value={fmtAngle(m.sun.altitude)}/><InfoCard Icon={Clock3} label={m.mode==='geometry'?'Sun above 0° · full cycle':'Sunlit over full cycle'} value={showHours(m.sunHours)}/></div><div className="notice-line">{icon(Info,15)} {m.mode==='terrain'?'Terrain horizon included. These are center-of-Sun hours, not electrical power output.':m.mode==='geometry'?'GEOMETRIC ESTIMATE: center of Sun above an ideal 0° horizon. Crater rims, shadows, local terrain and solar-panel power are NOT modeled.':'Backend data unavailable; sunlight duration cannot be calculated.'}</div></>}
  {tab==='earth'&&<><h3>Earth visibility</h3><p>Backend-calculated Earth elevation and estimated time above the horizon reference.</p><div className="tab-stats"><InfoCard Icon={Earth} label="Earth elevation" value={fmtAngle(m.earth.altitude)}/><InfoCard Icon={Radio} label={m.mode==='geometry'?'Earth above 0° · full cycle':'Visible over full cycle'} value={showHours(m.earthHours)}/></div><div className="notice-line">{icon(Info,15)} {m.mode==='terrain'?'Terrain horizon included, but a full radio link budget is NOT calculated.':m.mode==='geometry'?'GEOMETRIC ESTIMATE ONLY: Earth center above an ideal 0° horizon. Actual direct communication is NOT confirmed without terrain obstruction and RF checks.':'Backend data unavailable; no Earth window is claimed.'}</div></>}
  {tab==='timeline'&&<><h3>Mission timeline</h3><p>Use the Play button beside the Moon to explore changes through a full lunar phase cycle (about 29.5 days).</p><div className="timeline-mini"><div className="legend-row"><span className="gold-dot"/> {m.mode==='geometry'?'Sun above 0° (estimated)':'Sunlit hours'} <b>{m.sunHours==null?'N/A':`${m.sunHours.toFixed(1)}/${HOURS_PER_SCENARIO} h`}</b></div><div className="progress"><span style={{width:`${100*(m.sunHours??0)/HOURS_PER_SCENARIO}%`}}/></div><div className="legend-row"><span className="blue-dot"/> {m.mode==='geometry'?'Earth above 0° (estimated)':'Earth visible hours'} <b>{m.earthHours==null?'N/A':`${m.earthHours.toFixed(1)}/${HOURS_PER_SCENARIO} h`}</b></div><div className="progress blue"><span style={{width:`${100*(m.earthHours??0)/HOURS_PER_SCENARIO}%`}}/></div></div><div className="notice-line">{icon(Info,15)} {m.mode==='terrain'?'Backend terrain windows with interpolated crossings; center-of-body visibility.':m.mode==='geometry'?'Derived from hourly backend elevation samples, with interpolated crossings at 0°. Terrain is NOT included.':'Waiting for valid backend data.'}</div></>}
 </div></div>
}
function MissionTime({date,time,setDate,setTime,elapsed,setElapsed,playing,setPlaying,speed,setSpeed,compact=false}){
 const reset=()=>{setElapsed(0);setPlaying(false)};
 return <div className={`mission-control ${compact?'small':''}`}>
  <div className="control-heading"><span>{icon(Clock3,16)} LUNAR CYCLE <small>UTC · {playing?'PLAYING':'PAUSED'}</small></span><span className="elapsed-pill">Day {(elapsed/24).toFixed(1)} / {(HOURS_PER_SCENARIO/24).toFixed(1)}</span></div>
  <div className="control-main">
   <label className="field-date">{icon(CalendarDays,16)}<DateTimePicker kind="date" ariaLabel="Mission date UTC" value={date} onChange={v=>{setDate(v);setTime(clampStartTime(v,time));reset()}}/></label>
   <label className="field-time">{icon(Clock3,16)}<DateTimePicker kind="time" ariaLabel="Mission time UTC" value={time} maxTime={latestStartTime(date)} onChange={v=>{setTime(v);reset()}}/></label>
   <button className="play-button" aria-label={playing?'Pause playback':'Play mission animation'} onClick={()=>{if(!playing&&elapsed>=HOURS_PER_SCENARIO)setElapsed(0);setPlaying(!playing)}}>{playing?icon(Pause,25):icon(Play,25)}</button>
   <select className="speed-select" value={speed} aria-label="Playback speed" onChange={e=>setSpeed(Number(e.target.value))}><option value={1}>1× speed</option><option value={2}>2× speed</option><option value={4}>4× speed</option></select>
   <button className="reset-button" title="Reset time to start" aria-label="Reset time to start" onClick={reset}>{icon(RotateCcw,17)}</button>
  </div>
  <div className="slider-group cycle-slider"><input type="range" min="0" max={HOURS_PER_SCENARIO} step="0.5" value={elapsed} aria-label="Mission elapsed time in hours" aria-valuetext={`Day ${(elapsed/24).toFixed(1)} of ${(HOURS_PER_SCENARIO/24).toFixed(1)}`} onChange={e=>{setElapsed(Number(e.target.value));setPlaying(false)}}/><div className="slider-labels">{TIMELINE_TICKS.map((h,i)=><span key={h} style={{left:`${h/HOURS_PER_SCENARIO*100}%`}} className={i===0?'first':i===TIMELINE_TICKS.length-1?'last':''}>Day {i===TIMELINE_TICKS.length-1?(h/24).toFixed(1):h/24}</span>)}</div></div>
  <p className="cycle-caption">One phase cycle · {HOURS_PER_SCENARIO} h · ~29.5 days</p>
 </div>
}
function StatusMetrics({metric}){
 const status=v=>v==null?'Backend data unavailable':metric.mode==='geometry'?(v?'● Above ideal 0°':'● Below ideal 0°'):v?'● Visible over terrain':'● Blocked by terrain';
 return <div className="status-metrics">
  <div className="status-box"><div>{icon(Sun,22)}<small>SUN ELEVATION</small></div><strong>{fmtAngle(metric.sun.altitude)}</strong><span className={metric.mode==='terrain'&&metric.sunVisible===true?'good':'warn'}>{status(metric.sunVisible)}</span></div>
  <div className="status-box"><div>{icon(Earth,22)}<small>EARTH ELEVATION</small></div><strong>{fmtAngle(metric.earth.altitude)}</strong><span className={metric.mode==='terrain'&&metric.earthVisible===true?'good':'warn'}>{status(metric.earthVisible)}</span></div>
  <div className="status-box"><div>{icon(Radio,22)}<small>{metric.mode==='geometry'?'EARTH / FLAT HORIZON':'DIRECT-TO-EARTH'}</small></div><strong className={metric.mode==='terrain'&&metric.earthVisible===true?'good':'warn'}>{metric.mode==='geometry'?(metric.earthVisible==null?'Not calculated':metric.earthVisible?'Above 0°':'Below 0°'):showVisibility(metric.earthVisible)}</strong><span>{metric.mode==='terrain'?'Terrain-based center-of-Earth visibility':'Geometric estimate; communications unverified'}</span></div>
 </div>;
}
function DetailPage({sites,activeId,setActiveId,addCompare,navigate,metric,elapsed,...rightProps}){
 const site=sites.find(s=>s.id===activeId)||sites[0];
 const [tab,setTab]=useState('overview');
 const rightMetric=metric;
 return <main className="view split-view detail-view view-enter">
   <section className="detail-left left-column"><button className="back-button" onClick={()=>navigate('search')}>{icon(ArrowLeft,18)} Back to Search</button><div className="details-title"><div className="breadcrumb">{site.backendSiteId?'SCIENTIFIC / TERRAIN PRESET':site.kind==='Custom coordinates'?'CUSTOM / USER-DEFINED LOCATION':'NASA / ARTEMIS / CANDIDATE REGION'} &nbsp; <SiteBadge>{site.backendSiteId?'TERRAIN':'EXPLORATORY'}</SiteBadge></div><h2>{site.name}</h2><h4>{site.backendSiteId?'Lunar South Pole · Terrain Sample':site.kind==='Custom coordinates'?'Custom lunar coordinates':'Lunar South Pole · Artemis Candidate'}</h4><p>{site.summary}</p></div>
     <div className="detail-facts"><InfoCard Icon={MapPin} label="Latitude" value={`${Math.abs(site.lat).toFixed(2)}° S`}/><InfoCard Icon={Compass} label="Longitude" value={`${Math.abs(site.lon).toFixed(2)}° ${site.lon<0?'W':'E'}`}/><InfoCard Icon={Mountain} label="Region type" value={site.type}/><InfoCard Icon={ShieldCheck} label={site.kind==='Custom coordinates'?'Location type':'NASA selection'} value={site.backendSiteId?'Terrain profile':site.kind==='Custom coordinates'?'User-defined':'Candidate'}/></div>
     <DetailsTabs site={site} tab={tab} setTab={setTab} m={rightMetric}/>
     <button className="btn btn-gold compare-cta" onClick={()=>addCompare(site.id)}>{icon(BarChart3,19)} Add to Compare {icon(ArrowRight,19)}</button>
   </section>
   <div className="detail-right right-column"><GlobeStage {...rightProps} sites={sites} activeId={activeId} onSelect={setActiveId} moonView="details" compact clock data={rightMetric} elapsed={elapsed}/><div className="right-tools"><MissionTime {...rightProps} elapsed={elapsed}/><SceneControls settings={rightProps.visualSettings} onChange={rightProps.setVisualSettings}/><StatusMetrics metric={rightMetric}/></div></div>
 </main>
}
function ComparePage({sites,activeId,setActiveId,compareIds,setCompareIds,compareDates,setCompareDates,compareTimes,setCompareTimes,date,time,setDate,setTime,setElapsed,setPlaying,navigate,onAddPlace,elapsed,playing,...globeProps}){
 const compared=compareIds.map(id=>sites.find(s=>s.id===id)).filter(Boolean);
 const [visualId,setVisualId]=useState(null);
 const visualRef=useRef(null),tableRef=useRef(null);
 const visualSite=compared.find(s=>s.id===visualId)||compared[0]||null;
 const visualDate=visualSite?(compareDates[visualSite.id]||date):date;
 const visualTime=visualSite?(compareTimes[visualSite.id]||time):time;
 const visualMoment=changeHours(visualDate,visualTime,elapsed);
 const scenarios=compared.map(site=>({site,date:compareDates[site.id]||date,time:compareTimes[site.id]||time}));
 const {metrics,data:compareData,errors:compareErrors,loading:compareLoading}=useComparisons(scenarios);
 const visualIndex=compared.findIndex(s=>s.id===visualSite?.id);
 const visualMetric=visualIndex>=0&&compareData[visualIndex]?metricAt(compareData[visualIndex],elapsed):emptyMetric();
 const showVisualization=(id)=>{setVisualId(id);setActiveId(id);setElapsed(0);setPlaying(false);requestAnimationFrame(()=>requestAnimationFrame(()=>{visualRef.current?.scrollIntoView({behavior:'smooth',block:'start'});}));};
 const remove=id=>{setCompareIds(prev=>prev.filter(x=>x!==id));if(visualId===id){setVisualId(null);setPlaying(false)}};
 const values=[
  ['Sun elevation',m=>fmtAngle(m.sun.altitude),'sun'],
  ['Sun above horizon',m=>m.sunVisible==null?'N/A':m.sunVisible?'Yes':'No','sun'],
  ['Sun above horizon · full cycle',m=>showHours(m.sunHours),'sun'],
  ['Earth elevation',m=>fmtAngle(m.earth.altitude),'earth'],
  ['Earth above horizon',m=>m.earthVisible==null?'N/A':m.earthVisible?'Yes':'No','earth'],
  ['Earth above horizon · full cycle',m=>showHours(m.earthHours),'earth'],
  ['Both above horizon · full cycle',m=>showHours(m.bothHours),'both']
 ];
 return <main className="view compare-page-v2 view-enter" id="compare-top">
  <section className="comparison-panel" ref={tableRef}>
   <header className="compare-page-head"><div><span className="eyebrow">SCENARIO COMPARISON</span><h2>Compare Landing Sites</h2><p>One to four locations or dates. Compare the conditions, then explore any scenario on the NASA Moon.</p></div><div className="compare-page-actions"><button className="btn btn-blue" onClick={onAddPlace} disabled={compared.length>=4}>{icon(Plus,16)} Add Place ({compared.length}/4)</button><button className="btn btn-subtle" onClick={()=>{setCompareIds([]);setVisualId(null);setPlaying(false)}} disabled={!compared.length}>{icon(X,16)} Clear</button></div></header>
   {compared.length===0 ? <div className="compare-empty"><span>Begin by adding a landing region or your own coordinates.</span><button className="btn btn-gold" onClick={onAddPlace}>{icon(Plus,18)} Add your first place</button></div> :
   <div className="comparison-table-scroll" role="region" aria-label="Side-by-side comparison table" tabIndex="0"><table className="comparison-table" style={{minWidth:compared.length>=4?1100:compared.length===3?870:640}}><thead><tr><th scope="col">PARAMETER</th>{compared.map((s,i)=><th scope="col" key={s.id}><div className="scenario-head"><span className="scenario-number">{String(i+1).padStart(2,'0')}</span><strong title={s.name}>{s.name}</strong><button title={`Remove ${s.name}`} aria-label={`Remove ${s.name}`} onClick={()=>remove(s.id)}>{icon(X,16)}</button></div><small>{s.backendSiteId?'Terrain-based preset':s.kind==='Custom coordinates'?'Custom location':'Artemis candidate · geometry only'}</small><div className="scenario-coords">{Math.abs(s.lat).toFixed(2)}° {s.lat<0?'S':'N'} · {Math.abs(s.lon).toFixed(2)}° {s.lon<0?'W':'E'}</div><div className="scenario-date-fields"><label>UTC date<DateTimePicker kind="date" ariaLabel={`UTC comparison date for ${s.name}`} value={compareDates[s.id]||date} onChange={v=>{setCompareDates(old=>({...old,[s.id]:v}));setCompareTimes(old=>({...old,[s.id]:clampStartTime(v,old[s.id]||time)}));setElapsed(0);setPlaying(false)}}/></label><label>Time<DateTimePicker kind="time" ariaLabel={`UTC comparison time for ${s.name}`} value={compareTimes[s.id]||time} maxTime={latestStartTime(compareDates[s.id]||date)} onChange={v=>{setCompareTimes(old=>({...old,[s.id]:v}));setElapsed(0);setPlaying(false)}}/></label></div></th>)}</tr></thead><tbody>{values.map(([label,extract,kind],i)=><tr key={label} className={i===3?'compare-section-break':''}><th scope="row"><span className={'metric-icon '+kind}>{kind==='sun'?icon(Sun,15):kind==='earth'?icon(Earth,15):icon(Radio,15)}</span>{label}</th>{metrics.map((m,j)=><td key={`${compared[j].id}:${label}`}>{extract(m)}</td>)}</tr>)}</tbody><tfoot><tr><th scope="row">VISUALIZATION</th>{compared.map(s=><td key={s.id}><button className="show-visual-btn" onClick={()=>showVisualization(s.id)} aria-label={`Show visualization for ${s.name}`}>{icon(ArrowRight,15)} Show Visualization</button></td>)}</tr></tfoot></table></div>}
   <div className="compare-table-note" role="status">{icon(Info,15)} {compareLoading?'Loading backend scenarios…':compareErrors.filter(Boolean).length?`Backend errors: ${compareErrors.filter(Boolean).join('; ')}`:'Preset results use terrain profiles. Artemis candidate and custom sites are geometry-only; their visibility metrics show N/A.'} Research preview, not flight data.</div>
  </section>
  {compared.length>0&&<section className="compare-visualization-section" ref={visualRef}>
    <div className="compare-visualization-header"><div><span className="eyebrow">SCHEMATIC VIEW · SELECTED SCENARIO</span><h2>Visualizing: {visualSite?.name}</h2><p>{visualDate} · {visualTime} UTC — choose another mission below or from its table column above.</p></div><button className="btn btn-subtle" onClick={()=>tableRef.current?.scrollIntoView({behavior:'smooth',block:'start'})}>{icon(ArrowLeft,16)} Back to Table</button></div>
    <div className="compare-visual-tabs" role="group" aria-label="Choose scenario to visualize">{compared.map(s=><button className={visualSite?.id===s.id?'active':''} key={s.id} onClick={()=>{setVisualId(s.id);setActiveId(s.id);setElapsed(0);setPlaying(false)}}>{s.name}</button>)}</div>
    <div className="compare-visual-layout">
      <div className="compare-visual-moon"><GlobeStage {...globeProps} sites={sites} activeId={visualSite.id} onSelect={id=>{setActiveId(id);navigate('details')}} focusOnSite clock compact data={visualMetric} elapsed={elapsed} date={visualDate} time={visualTime}/></div>
      <div className="compare-visual-control"><MissionTime date={visualDate} time={visualTime} setDate={v=>{setCompareDates(old=>({...old,[visualSite.id]:v}));setElapsed(0);setPlaying(false)}} setTime={v=>{setCompareTimes(old=>({...old,[visualSite.id]:v}));setElapsed(0);setPlaying(false)}} elapsed={elapsed} setElapsed={setElapsed} playing={playing} setPlaying={setPlaying} speed={globeProps.speed} setSpeed={globeProps.setSpeed}/><SceneControls settings={globeProps.visualSettings} onChange={globeProps.setVisualSettings}/><StatusMetrics metric={visualMetric}/></div>
    </div>
  </section>}
 </main>
}
function AboutPage({navigate}){return <main className="view about-view view-enter"><div className="about-box"><span className="eyebrow">ABOUT THE PROJECT</span><h1>Mission planning,<br/><em>made visual.</em></h1><p>LUNARIS connects to the DesertStar FastAPI backend for lunar Sun/Earth positions. Precomputed terrain sites include horizon and visibility windows. Other coordinates use backend ephemeris elevations to estimate center-above-0° hours without local terrain. NASA LRO provides the Moon model.</p><div className="about-grid"><div>{icon(Mountain,23)}<strong>NASA Moon</strong><span>Published by NASA Goddard, based on Lunar Reconnaissance Orbiter data.</span></div><div>{icon(Sun,23)}<strong>Solar geometry</strong><span>FastAPI ephemeris results; local terrain masking is supported for scientific presets.</span></div><div>{icon(Radio,23)}<strong>Communication</strong><span>Terrain-aware Earth line of sight at supported presets; not a validated RF link budget.</span></div></div><p className="science-warning">Research demonstration — backend-provided positions, terrain-aware only at supported presets; other results assume an ideal 0° horizon and are NOT verified communications or power predictions. Illustrative marker locations; not flight-ready.</p><div className="about-actions"><button className="btn btn-gold" onClick={()=>navigate('search')}>Explore locations {icon(ArrowRight,17)}</button><a href={NASA_URL} target="_blank" rel="noreferrer" className="btn btn-blue">NASA's Moon source {icon(ExternalLink,16)}</a></div></div></main>}
export default function App(){
 const [page,setPage]=useState(()=>{const name=location.hash.replace('#/','');return ['home','search','details','compare','about'].includes(name)?name:'home'});
 const [sites,setSites]=useState(SITES),[activeId,setActiveId]=useState(SITES[0].id),[compareIds,setCompareIds]=useState(['Site01_highest_point']),[compareDates,setCompareDates]=useState({}),[compareTimes,setCompareTimes]=useState({}),[comparePickMode,setComparePickMode]=useState(false);
 const [date,setDate]=useState(INITIAL_DATE),[time,setTime]=useState(INITIAL_TIME),[elapsed,setElapsed]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1);
 const [modelUrl,setModelUrl]=useState(null),[modelStatus,setModelStatus]=useState('loading'),[modelMsg,setModelMsg]=useState('');
 const [menuOpen,setMenuOpen]=useState(false);
 const [visualSettings,setVisualSettings]=useState(loadScenePreferences);
 useEffect(()=>{saveScenePreferences(visualSettings)},[visualSettings]);
 const activeSite=sites.find(s=>s.id===activeId)||sites[0];
 const now=useMemo(()=>changeHours(date,time,elapsed),[date,time,elapsed]);
 const {metric,loading:backendLoading,error:backendError}=useScenario(activeSite,date,time,elapsed);
 useEffect(()=>{loadSiteCatalog().catch(err=>console.warn('[LUNARIS] Backend site catalog unavailable:',err.message));},[]);
 useEffect(()=>{let mounted=true;fetch('/models/nasa-moon-color.glb',{method:'HEAD',cache:'no-cache'}).then(r=>{if(!mounted)return;const len=Number(r.headers.get('content-length')||0);if(r.ok&&(len>10000000||r.headers.get('content-type')?.includes('gltf-binary')||(len>10000&&r.headers.get('content-type')?.includes('octet-stream')))){setModelUrl('/models/nasa-moon-color.glb');setModelStatus('loading')}else{setModelStatus('demo');setModelMsg('Official model missing; use the NASA download instructions in README.')}}).catch(()=>{if(mounted)setModelStatus('demo')});return()=>{mounted=false}},[]);
 useEffect(()=>{if(!playing)return;let raf=0,last=0;const frame=(now)=>{if(last){const dt=(now-last)/1000;if(dt>=1/32){last=now;setElapsed(h=>{const v=advancePlayback(h,dt,speed);if(v>=HOURS_PER_SCENARIO){setPlaying(false);return HOURS_PER_SCENARIO}return v})}}else{last=now}raf=requestAnimationFrame(frame)};raf=requestAnimationFrame(frame);return()=>cancelAnimationFrame(raf)},[playing,speed]);
 useEffect(()=>{const handle=()=>{const name=location.hash.replace('#/','');if(['home','search','details','compare','about'].includes(name))setPage(name)};window.addEventListener('hashchange',handle);return()=>window.removeEventListener('hashchange',handle)},[]);
 const navigate=useCallback(p=>{setPage(p);setMenuOpen(false);window.location.hash='/'+p;setPlaying(false)},[]);
 const addCompare=id=>{setCompareIds(prev=>prev.includes(id)?prev:prev.length<4?[...prev,id]:prev);setActiveId(id);setComparePickMode(false);navigate('compare')};
 const startAddPlace=()=>{if(compareIds.length>=4)return;setComparePickMode(true);navigate('search')};
 const cancelAddPlace=()=>{setComparePickMode(false);navigate('compare')};
 const addCustom=s=>{setSites(prev=>[...prev,s]);setActiveId(s.id)};
 const onModelLoaded=useCallback(()=>setModelStatus('nasa'),[]);
 const onModelError=useCallback(e=>{setModelStatus('demo');setModelMsg(String(e?.message||e))},[]);
 const shared={modelUrl,modelStatus,data:metric,onLoaded:onModelLoaded,onError:onModelError,date,time,setDate,setTime,elapsed,setElapsed,playing,setPlaying,speed,setSpeed,visualSettings,setVisualSettings};
 return <div className="app-shell">
  <header className="site-nav"><button className="brand" onClick={()=>navigate('home')} aria-label="LUNARIS Home"><span className="crescent">◕</span><span><b>LUNARIS</b><small>LUNAR MISSION PLANNER</small></span></button>
   <nav className={menuOpen?'open':''} aria-label="Main navigation"><button className={page==='home'?'current':''} onClick={()=>navigate('home')}>Home</button><button className={['search','details'].includes(page)?'current':''} onClick={()=>navigate('search')}>Missions</button><button className={page==='compare'?'current':''} onClick={()=>navigate('compare')}>Compare</button><button className={page==='about'?'current':''} onClick={()=>navigate('about')}>About</button></nav>
   <div className="nav-right"><button className="nav-menu" onClick={()=>setMenuOpen(v=>!v)} aria-label="Toggle navigation">{icon(Menu,22)}</button></div>
  </header>
  {page==='home'&&<Home navigate={navigate} sites={sites} activeId={activeId} onSelect={setActiveId} {...shared}/>}
  {page==='search'&&<SearchPage navigate={navigate} sites={sites} activeId={activeId} setActiveId={setActiveId} addCustom={addCustom} addCompare={addCompare} comparePickMode={comparePickMode} cancelComparePick={cancelAddPlace} {...shared}/>}
  {page==='details'&&(backendLoading||backendError)&&<div className="backend-notice" role="status">{backendError?`Backend: ${backendError}`:'Loading scientific data from FastAPI…'}</div>}
  {page==='details'&&<DetailPage navigate={navigate} sites={sites} activeId={activeId} setActiveId={setActiveId} addCompare={addCompare} metric={metric} {...shared}/>}
  {page==='compare'&&<ComparePage sites={sites} activeId={activeId} setActiveId={setActiveId} compareIds={compareIds} setCompareIds={setCompareIds} compareDates={compareDates} setCompareDates={setCompareDates} compareTimes={compareTimes} setCompareTimes={setCompareTimes} onAddPlace={startAddPlace} navigate={navigate} metric={metric} {...shared}/>}
  {page==='about'&&<AboutPage navigate={navigate}/>}
 </div>
}
