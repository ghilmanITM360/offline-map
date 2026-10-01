import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const gates=JSON.parse(readFileSync(new URL('./gates.json',import.meta.url),'utf8'));
const PATH='/v1/outside-walking-routes:compute';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const coordinate=p=>p&&finite(p.latitude)&&Math.abs(p.latitude)<=90&&finite(p.longitude)&&Math.abs(p.longitude)<=180;
const duration=s=>typeof s==='string'&&/^\d+(\.\d+)?s$/.test(s)&&Number.isFinite(Number(s.slice(0,-1)))?Number(s.slice(0,-1)):null;
const invalid=()=>{throw new Error('invalid-provider');};
function validate(body) {
 if(!body||body.schemaVersion!==1||body.mode!=='WALK'||typeof body.requestId!=='string'||!body.requestId.trim().length||body.requestId.length>128||!Number.isSafeInteger(body.requestVersion)||body.requestVersion<1||!coordinate(body.origin)||!Array.isArray(body.gates)||!body.gates.length||body.gates.length>16) return false;
 const ids=new Set();
 return body.gates.every(g=>{
  if(typeof g?.gateId!=='string')return false;const target=gates[g.gateId];if(!target||ids.has(g.gateId)||!coordinate(g.routeTargetCoordinate))return false;
  ids.add(g.gateId);return Math.abs(target.latitude-g.routeTargetCoordinate.latitude)<0.000001&&Math.abs(target.longitude-g.routeTargetCoordinate.longitude)<0.000001;
 });
}
function normalize(route,index,gateId) {
 const points=route?.polyline?.geoJsonLinestring?.coordinates;
 const seconds=duration(route?.duration);
 if(!finite(route?.distanceMeters)||route.distanceMeters<0||seconds===null||!Array.isArray(points)||points.length<2||points.length>50000)invalid();
 const coordinates=points.map(p=>{
  const c=Array.isArray(p)?{latitude:p[1],longitude:p[0]}:null;if(!coordinate(c))invalid();return c;
 });
 const steps=(route.legs??[]).flatMap(leg=>(leg.steps??[]).map((step,i)=>{
  const c=step.startLocation?.latLng,seconds=duration(step.staticDuration);
  if(!coordinate(c)||!finite(step.distanceMeters)||step.distanceMeters<0||(step.staticDuration!==undefined&&seconds===null)||typeof step.navigationInstruction?.instructions!=='string')invalid();
  const names={DEPART:'depart',STRAIGHT:'continue',TURN_SLIGHT_LEFT:'slight-left',TURN_SLIGHT_RIGHT:'slight-right',TURN_LEFT:'turn-left',TURN_RIGHT:'turn-right',UTURN_LEFT:'u-turn',UTURN_RIGHT:'u-turn'};
  return {id:`${gateId}:${index}:${i}`,maneuver:names[step.navigationInstruction.maneuver]??'unknown',distanceM:step.distanceMeters,durationSeconds:seconds,coordinate:c,instruction:step.navigationInstruction.instructions};
 }));
 const warnings=route.warnings??[];if(!Array.isArray(warnings)||warnings.some(w=>typeof w!=='string'))invalid();
 return {routeId:`${gateId}:${index}`,distanceM:route.distanceMeters,durationSeconds:seconds,coordinates,steps,warnings:[...warnings,'Walking directions may be missing sidewalks or pedestrian paths. Use caution.']};
}
/** Internal staging only: Cloud Run IAM enforces ingress identity, never a mobile embedded credential. */
export function createProxyServer({apiKey=process.env.GOOGLE_ROUTES_API_KEY,fetchImpl=fetch,timeoutMs=3000,maxCallsPerMinute=60}={}) {
 let windowStart=Date.now(),calls=0;
 return createServer(async(req,res)=>{
  const reply=(status,body)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));}};
  if(req.method==='GET'&&req.url==='/healthz')return reply(apiKey?200:503,{status:apiKey?'ready':'unconfigured'});
  if(req.method!=='POST'||req.url!==PATH)return reply(404,{error:'not-found'});
  if(!apiKey)return reply(503,{error:'provider-unconfigured'});
  if(!req.headers['content-type']?.toLowerCase().startsWith('application/json'))return reply(415,{error:'json-required'});
  const chunks=[];let bytes=0;
  try {
   for await(const chunk of req){bytes+=chunk.length;if(bytes>16384){reply(413,{error:'payload-too-large'});req.resume();return;}chunks.push(chunk);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{return reply(400,{error:'invalid-json'});}
   if(!validate(body))return reply(400,{error:'invalid-request'});
   if(Date.now()-windowStart>=60000){windowStart=Date.now();calls=0;}
   if(calls+body.gates.length>maxCallsPerMinute)return reply(429,{error:'rate-limited'});
   calls+=body.gates.length;
   const signal=AbortSignal.timeout(timeoutMs);
   const outcomes=await Promise.all(body.gates.map(async gate=>{
    const response=await fetchImpl('https://routes.googleapis.com/directions/v2:computeRoutes',{
     method:'POST',signal,redirect:'error',headers:{'Content-Type':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'routes.warnings,routes.distanceMeters,routes.duration,routes.polyline.geoJsonLinestring,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.startLocation,routes.legs.steps.navigationInstruction'},
     body:JSON.stringify({origin:{location:{latLng:body.origin}},destination:{location:{latLng:gate.routeTargetCoordinate}},travelMode:'WALK',polylineEncoding:'GEO_JSON_LINESTRING',languageCode:'en',units:'METRIC'})
    });
    if(!response.ok)throw new Error('provider-failed');
    const parts=[];let size=0;
    for await(const part of response.body){size+=part.length;if(size>2000000)invalid();parts.push(part);}
    const raw=JSON.parse(Buffer.concat(parts).toString());
    if(!raw||typeof raw!=='object'||(raw.routes!==undefined&&!Array.isArray(raw.routes)))invalid();
    if(!raw.routes?.length)return {status:'unreachable',gateId:gate.gateId,reason:'no-route'};
    if(raw.routes.length>3)invalid();
    return {status:'routed',gateId:gate.gateId,routes:raw.routes.map((r,i)=>normalize(r,i,gate.gateId))};
   }));
   reply(200,{schemaVersion:1,requestId:body.requestId,requestVersion:body.requestVersion,outcomes});
  }catch{reply(502,{error:'provider-unavailable'});}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const server=createProxyServer();server.requestTimeout=5000;server.headersTimeout=5000;server.maxConnections=20;
 server.listen(Number(process.env.PORT??8080),process.env.K_SERVICE?'0.0.0.0':'127.0.0.1');
}
