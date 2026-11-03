/** Download the REAL original NASA GSFC LRO GLB published at
 * https://svs.gsfc.nasa.gov/14959/ — not a synthetic substitute.
 * Network denial does not prevent developing the UI; status is honest in-app.
 */
import {createWriteStream,existsSync,statSync,openSync,readSync,closeSync,renameSync,unlinkSync,mkdirSync} from 'node:fs';
import {get} from 'node:https';
import {resolve} from 'node:path';
const dest=resolve('public/models/nasa-moon-color.glb');
const URL_NASA='https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/moon_small.glb';
mkdirSync(resolve('public/models'),{recursive:true});
function valid(path){try{if(statSync(path).size<10000000)return false;const fd=openSync(path,'r'),b=Buffer.alloc(4);readSync(fd,b,0,4,0);closeSync(fd);return b.toString()==='glTF';}catch{return false;}}
function download(url,hops=0){return new Promise((done,reject)=>{
 if(hops>5){reject(new Error('Too many redirects'));return;}
 const req=get(url,{timeout:22000,headers:{'User-Agent':'Mozilla/5.0 LUNARIS/1.0'}},res=>{
  if([301,302,307,308].includes(res.statusCode)){res.resume();download(new URL(res.headers.location,url).href,hops+1).then(done,reject);return;}
  if(res.statusCode!==200){res.resume();reject(new Error('NASA HTTP '+res.statusCode));return;}
  const tmp=dest+'.part',file=createWriteStream(tmp);
  res.pipe(file);res.on('error',reject);file.on('error',reject);
  file.on('finish',()=>file.close(()=>{if(valid(tmp)){renameSync(tmp,dest);done();}else{try{unlinkSync(tmp)}catch{};reject(new Error('Invalid NASA GLB response'));}}));
 });req.on('timeout',()=>req.destroy(new Error('NASA download timed out')));req.on('error',reject);
 });}
if(valid(dest)){console.log('[LUNARIS] Official NASA LRO GLB is included.');}
else{try{console.log('[LUNARIS] Downloading NASA GSFC official Moon GLB (13.2 MB)...');await download(URL_NASA);console.log('[LUNARIS] Real NASA Moon downloaded and validated.');}
catch(e){console.warn('[LUNARIS] NASA binary unavailable:',e.message);console.warn('[LUNARIS] The UI will show a DEMO fallback until you put moon_small.glb in public/models/nasa-moon-color.glb.');console.warn('[LUNARIS] NASA source: https://svs.gsfc.nasa.gov/14959/');}}
