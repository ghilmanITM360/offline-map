import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { GoogleRoutesProxyClient } from '../../src/services/outsideRouting/GoogleRoutesProxyClient.ts';
import { IJTEMA_GATES } from '../../src/data/ijtema/gates.ts';
import { createProxyServer } from './server.mjs';
const origin = { latitude:24.9601, longitude:67.006862 };
const gate = { gateId:'GATE_13', routeTargetCoordinate:{ latitude:24.963718, longitude:67.006862 } };
const body = { schemaVersion:1, requestId:'test', requestVersion:2, mode:'WALK', origin, gates:[gate] };
const path='/v1/outside-walking-routes:compute';
async function withServer(options, run) {
 const server=createProxyServer(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {await run(`http://127.0.0.1:${server.address().port}`);} finally {await new Promise(resolve=>server.close(resolve));}
}
const post=(url,data=body)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const fixture={routes:[{distanceMeters:420,duration:'300s',polyline:{geoJsonLinestring:{coordinates:[[origin.longitude,origin.latitude],[67.006862,24.963718]]}},legs:[{steps:[{distanceMeters:420,staticDuration:'300s',startLocation:{latLng:origin},navigationInstruction:{maneuver:'DEPART',instructions:'Head north'}}]}]}]};
test('health never exposes secrets; missing provider fails closed',async()=>withServer({},async url=>{
 assert.equal((await fetch(url+'/healthz')).status,503);assert.equal((await post(url)).status,503);
}));
test('valid WALK response preserves same request token, gate, geometry and server credential boundary',async()=>{
 const seen=[];
 await withServer({apiKey:'server-only-test',fetchImpl:async(url,init)=>{seen.push({url,init});return Response.json(fixture);}},async url=>{
  const response=await post(url);assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.requestId,body.requestId);assert.equal(result.requestVersion,2);
  assert.equal(result.outcomes[0].gateId,'GATE_13');const route=result.outcomes[0].routes[0];
  assert.equal(route.distanceM,420);assert.equal(route.durationSeconds,300);assert.deepEqual(route.coordinates[0],origin);
  assert.equal(route.steps[0].maneuver,'depart');assert(!JSON.stringify(result).includes('server-only-test'));
  assert.equal(seen[0].url,'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.equal(JSON.parse(seen[0].init.body).travelMode,'WALK');assert.equal(seen[0].init.headers['X-Goog-Api-Key'],'server-only-test');
 });
});
test('reject invalid coordinates, arbitrary/duplicate gates, wrong modes and oversized bodies before provider billing',async()=>{
 let calls=0;await withServer({apiKey:'test',fetchImpl:async()=>{calls++;return Response.json(fixture);}},async url=>{
  for(const invalid of [{...body,mode:'DRIVE'},{...body,origin:{latitude:91,longitude:0}},{...body,gates:[{...gate,gateId:'GATE_18'}]},{...body,gates:[gate,gate]},{...body,gates:[{...gate,routeTargetCoordinate:origin}]},{...body,requestVersion:-1},{...body,gates:[]}]) assert.equal((await post(url,invalid)).status,400);
  assert.equal((await post(url,{...body,requestId:'x'.repeat(20000)})).status,413);assert.equal(calls,0);
 });
});
test('provider no-route maps to unreachable; error/malformed response never leaks body or key',async()=>{
 for(const reply of [Response.json({}),Response.json({routes:[]})])await withServer({apiKey:'test',fetchImpl:async()=>reply},async url=>assert.equal((await (await post(url)).json()).outcomes[0].status,'unreachable'));
 for(const reply of [Response.json({error:'secret-location-and-key'}, {status:403}),Response.json({routes:[{distanceMeters:-1}]})])await withServer({apiKey:'test',fetchImpl:async()=>reply},async url=>{const r=await post(url);assert.equal(r.status,502);assert(!await r.text().then(t=>t.includes('secret')));});
});
test('rate bound prevents repeated provider billing and health stays independent',async()=>{
 let calls=0;await withServer({apiKey:'test',maxCallsPerMinute:1,fetchImpl:async()=>{calls++;return Response.json(fixture);}},async url=>{
 assert.equal((await post(url)).status,200);assert.equal((await post(url)).status,429);assert.equal((await fetch(url+'/healthz')).status,200);assert.equal(calls,1);
 });
});
test('provider 429 is not retried (bounded billing) and maps to a redacted gateway error',async()=>{
 let calls=0;await withServer({apiKey:'test',fetchImpl:async()=>{calls++;return Response.json({error:'quota-secret'},{status:429});}},async url=>{
  const r=await post(url);assert.equal(r.status,502);assert(!await r.text().then(t=>t.includes('secret')));assert.equal(calls,1);
 });
});
test('provider deadline aborts and returns redacted gateway error',async()=>withServer({apiKey:'test',timeoutMs:20,fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('secret')),{once:true}))},async url=>{
 const r=await post(url);assert.equal(r.status,502);assert(!await r.text().then(t=>t.includes('secret')));
}));

test('deployment gate snapshot equals verified canonical targets, excludes field-blocked entries',()=>{
 const snapshot=JSON.parse(readFileSync(new URL('./gates.json',import.meta.url),'utf8'));
 const expected=Object.fromEntries(IJTEMA_GATES.filter(g=>g.canStartRouteFromOutside).map(g=>[g.id,{latitude:g.coordinate.lat,longitude:g.coordinate.lng}]));
 assert.deepEqual(snapshot,expected);
});

test('existing mobile client accepts fixture-backed HTTP contract; no deployed-provider claim',async()=>withServer({apiKey:'server-only-test',fetchImpl:async()=>Response.json(fixture)},async url=>{
 const client=new GoogleRoutesProxyClient({baseUrl:url});
 const result=await client.computeRoutes({token:{requestId:'test',requestVersion:2},origin,gates:[{...gate,gateCoordinate:gate.routeTargetCoordinate}],signal:new AbortController().signal});
 assert.equal(result.status,'success');assert.equal(result.candidateSet.outcomes[0].routes[0].distanceM,420);
}));

test('non-string gate IDs cannot bypass distinct gate validation or trigger paid requests',async()=>{
 let calls=0;await withServer({apiKey:'test',fetchImpl:async()=>{calls++;return Response.json(fixture);}},async url=>{
  const r=await post(url,{...body,gates:Array.from({length:16},()=>({...gate,gateId:['GATE_13']}))});
  assert.equal(r.status,400);assert.equal(calls,0);
 });
});

test('provider warnings are preserved and absent optional duration stays null',async()=>{
 const raw=structuredClone(fixture);raw.routes[0].warnings=['Restricted pedestrian access'];delete raw.routes[0].legs[0].steps[0].staticDuration;
 await withServer({apiKey:'test',fetchImpl:async(_url,init)=>{assert(init.headers['X-Goog-FieldMask'].includes('routes.warnings'));return Response.json(raw);}},async url=>{
  const r=await post(url);assert.equal(r.status,200);const route=(await r.json()).outcomes[0].routes[0];
  assert(route.warnings.includes('Restricted pedestrian access'));assert.equal(route.steps[0].durationSeconds,null);
 });
});
test('HTTP boundary and oversized/malformed provider responses fail safely',async()=>{
 await withServer({apiKey:'test',fetchImpl:async()=>new Response('x'.repeat(2000001))},async url=>{
  assert.equal((await fetch(url+path)).status,404);
  assert.equal((await fetch(url+path,{method:'POST',body:'{}'})).status,415);
  assert.equal((await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
  assert.equal((await post(url)).status,502);
 });
 await withServer({apiKey:'test',fetchImpl:async()=>new Response('{')},async url=>assert.equal((await post(url)).status,502));
});
