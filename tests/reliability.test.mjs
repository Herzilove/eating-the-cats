import test from 'node:test';
import assert from 'node:assert/strict';
import {ResearchQueue} from '../public/queue.js';
import check,{validateAssessment} from '../api/check.mjs';
import {guard,upstream} from '../lib/common.mjs';
function response(){return {code:200,body:null,lines:'',setHeader(){},status(n){this.code=n;return this;},json(value){this.body=value;},write(line){this.lines+=line;},end(){this.writableEnded=true;}};}

test('Long transcripts split without losing words; failed batches stay pending',()=>{
 const q=new ResearchQueue();const text=Array.from({length:5000},(_,i)=>`word${i}`).join(' ');
 q.enqueue(text);assert.equal(q.items.map(x=>x.text).join(' '),text);assert.ok(q.items.every(x=>x.text.length<=6000));
 const first=q.current;q.paused=true;assert.equal(q.current,first);q.paused=false;q.acknowledge();assert.notEqual(q.current,first);
});
test('Queue deduplicates pending and successful batches and reset allows a fresh session',()=>{
 const q=new ResearchQueue();q.enqueue('Same claim');q.enqueue('Same   claim');assert.equal(q.items.length,1);
 q.acknowledge();q.enqueue('Same claim');assert.equal(q.items.length,0);q.reset();q.enqueue('Same claim');assert.equal(q.items.length,1);
});
test('Fabricated source IDs reject the assessment instead of silently dropping citations',()=>{
 const c={claim:'A claim',explanation:'An explanation',verdict:'Supported',source_ids:[2]};
 assert.throws(()=>validateAssessment({claims:[c]},[{url:'https://example.org'}]));
 assert.equal(validateAssessment({claims:[{...c,source_ids:[]}]},[])[0].verdict,'Unverified');
 assert.throws(()=>validateAssessment({claims:[{...c,claim:{}}]},[]));
});
test('Public requests work on Vercel even when an old demo token remains configured',()=>{
 const token=process.env.DEMO_ACCESS_TOKEN,vercel=process.env.VERCEL;
 try{process.env.DEMO_ACCESS_TOKEN='obsolete-code';process.env.VERCEL='1';assert.equal(guard({method:'POST',headers:{},socket:{remoteAddress:'public-test'}},response()),true);}
 finally{if(token===undefined)delete process.env.DEMO_ACCESS_TOKEN;else process.env.DEMO_ACCESS_TOKEN=token;if(vercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=vercel;}
});
test('Origin mismatch and excessive requests are rejected',()=>{
 let res=response();assert.equal(guard({method:'POST',headers:{origin:'https://other.example',host:'localhost'}},res),false);assert.equal(res.code,403);
 for(let i=0;i<20;i++)assert.equal(guard({method:'POST',headers:{},socket:{remoteAddress:'rate-test'}},response()),true);
 res=response();assert.equal(guard({method:'POST',headers:{},socket:{remoteAddress:'rate-test'}},res),false);assert.equal(res.code,429);
});
test('Caller cancellation reaches the provider request',async()=>{
 const original=globalThis.fetch;const controller=new AbortController();controller.abort();
 globalThis.fetch=async(_url,options)=>{options.signal.throwIfAborted();};
 try{await assert.rejects(upstream('https://example.org',{signal:controller.signal}),{name:'AbortError'});}finally{globalThis.fetch=original;}
});
test('Tool loop streams actual search activity, validates citations and reuses cached results',async()=>{
 const original=globalThis.fetch;const saved={...process.env};let calls=0;
 Object.assign(process.env,{NEBIUS_API_KEY:'test-nebius',NEBIUS_MODEL:'test-model',TAVILY_API_KEY:'test-tavily'});
 globalThis.fetch=async(url,options)=>{
  calls++;const body=JSON.parse(options.body);
  if(url.includes('tavily')){assert.equal(body.query,'Earth shape evidence');return {ok:true,json:async()=>({results:[{title:'Evidence',url:'https://example.org/earth',content:'Earth is approximately spherical.'}]})};}
  if(calls===1)return {ok:true,json:async()=>({choices:[{message:{role:'assistant',content:'{"claims":["Earth is approximately spherical."]}'}}]})};
  if(calls===2)return {ok:true,json:async()=>({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'search-1',type:'function',function:{name:'search_web',arguments:'{"query":"Earth shape evidence"}'}}]}}]})};
  assert.ok(body.messages.some(m=>m.role==='tool'&&m.content.includes('Earth is approximately spherical')));
  return {ok:true,json:async()=>({choices:[{message:{role:'assistant',content:JSON.stringify({claims:[{claim:'Earth is approximately spherical.',verdict:'Supported',explanation:'The retrieved excerpt supports this.',source_ids:[1]}]})}}]})};
 };
 try{
  const req={method:'POST',headers:{accept:'application/x-ndjson'},body:{text:'Earth is approximately spherical. unique-test'}};let res=response();await check(req,res);
  const events=res.lines.trim().split('\n').map(JSON.parse);assert.ok(events.some(e=>e.type==='activity'&&e.message==='Earth shape evidence'));
  assert.ok(events.find(e=>e.type==='claims'));
  const result=events.find(e=>e.type==='result');assert.equal(result.data.claims[0].verdict,'Supported');assert.equal(calls,4);
  res=response();await check({...req,headers:{}},res);assert.equal(res.body.cached,true);assert.equal(calls,4);
 }finally{globalThis.fetch=original;for(const key of ['NEBIUS_API_KEY','NEBIUS_MODEL','TAVILY_API_KEY']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});

test('The same claim by different speakers is retained for comparison',()=>{const q=new ResearchQueue();q.enqueue('The same claim','A');q.enqueue('The same claim','B');assert.equal(q.items.length,2);});
for(const failOne of [false,true])test(`Concurrent claims stream independently and preserve citation scopes (failure=${failOne})`,{timeout:3000},async()=>{
 const original=globalThis.fetch;const saved={...process.env};let releaseSlow;let searches=0;let active=0;let peak=0;let first;
 Object.assign(process.env,{NEBIUS_API_KEY:'test',NEBIUS_MODEL:'parallel-test',TAVILY_API_KEY:'test'});
 const slow=new Promise(resolve=>{releaseSlow=resolve;});
 globalThis.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);
  if(url.includes('tavily')){
   searches++;active++;peak=Math.max(peak,active);
   if(body.query==='Alpha')await slow;
   active--;
   return {ok:true,json:async()=>({results:[{title:body.query,url:'https://example.org/'+body.query,content:'Evidence for '+body.query}]})};
  }
  if(!body.tools)return {ok:true,json:async()=>({choices:[{message:{content:'{"claims":["Alpha","Beta"]}'}}]})};
  const name=body.messages.find(m=>m.content?.startsWith('Assess only'))?.content.includes('Alpha')?'Alpha':'Beta';
  if(!body.messages.some(m=>m.role==='tool'))return {ok:true,json:async()=>({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'tool-'+name,type:'function',function:{name:'search_web',arguments:JSON.stringify({query:name})}}]}}]})};
  return {ok:true,json:async()=>({choices:[{message:{role:'assistant',content:JSON.stringify({claims:[{claim:name,verdict:'Supported',explanation:'Evidence found',source_ids:[failOne&&name==='Alpha'?99:1]}]})}}]})};
 };
 const res=response();const write=res.write;
 res.write=function(line){write.call(this,line);const event=JSON.parse(line);if(event.type==='claim_result'){first??=event.data.claims[0].claim;if(event.data.claims[0].claim==='Beta')releaseSlow();}};
 try{
  await check({method:'POST',headers:{accept:'application/x-ndjson'},body:{text:'Parallel test '+failOne}},res);
  const events=res.lines.trim().split('\n').map(JSON.parse);
  assert.equal(peak,2);assert.equal(searches,2);assert.equal(first,'Beta');assert.ok(events.some(e=>e.type==='claim_result'));
  if(failOne){assert.ok(events.some(e=>e.type==='error'));assert.equal(events.filter(e=>e.type==='claim_result').length,1);assert.ok(!events.some(e=>e.type==='result'));}
  else{const result=events.find(e=>e.type==='result').data;assert.equal(result.claims.length,2);assert.equal(result.sources[result.claims[1].source_ids[0]-1].title,'Beta');assert.deepEqual(result.claims.map(c=>c.claim),['Alpha','Beta']);}
 }finally{releaseSlow();globalThis.fetch=original;for(const key of ['NEBIUS_API_KEY','NEBIUS_MODEL','TAVILY_API_KEY']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
test('Parallel workers cannot exceed the shared three-search allocation',async()=>{
 const oldFetch=globalThis.fetch,saved={...process.env};let calls=0;Object.assign(process.env,{NEBIUS_API_KEY:'test',NEBIUS_MODEL:'budget-model',TAVILY_API_KEY:'test'});
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);if(url.includes('tavily')){calls++;return {ok:true,json:async()=>({results:[{title:'Evidence',url:'https://example.org',content:'Evidence'}]})};}
 if(!body.tools)return {ok:true,json:async()=>({choices:[{message:{content:'{"claims":["First","Second","Third"]}'}}]})};
 const tool=body.messages.some(m=>m.role==='tool');return {ok:true,json:async()=>({choices:[{message:tool?{role:'assistant',content:'{"claims":[{"claim":"Claim","verdict":"Supported","explanation":"Evidence","source_ids":[1]}]}'}:{role:'assistant',tool_calls:[1,2,3].map(id=>({id:String(id),type:'function',function:{name:'search_web',arguments:'{"query":"Evidence search"}'}}))}}]})};};
 try{const res=response();await check({method:'POST',headers:{accept:'application/x-ndjson'},body:{text:'Budget allocation test'}},res);assert.equal(calls,3);assert.ok(res.lines.includes('"type":"result"'));}finally{globalThis.fetch=oldFetch;for(const key of ['NEBIUS_API_KEY','NEBIUS_MODEL','TAVILY_API_KEY']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
test('Section ledger retains repeated input and every deferred claim',()=>{
 const q=new ResearchQueue();q.enqueue('A statement','A');q.enqueue('A statement','A');assert.equal(q.sections.length,2);assert.equal(q.items.length,1);assert.equal(q.sections[1].duplicate,1);
 const claims=Array.from({length:8},(_,i)=>'Claim '+i);q.enqueueClaims('Original text','A',claims,1);assert.deepEqual(q.items.slice(1).flatMap(x=>x.selectedClaims),claims);assert.ok(q.items.slice(1).every(x=>x.selectedClaims.length<=3));
});
test('More than three extracted claims are returned for queued processing, never sliced away',async()=>{
 const old=globalThis.fetch,saved={...process.env};Object.assign(process.env,{NEBIUS_API_KEY:'test',NEBIUS_MODEL:'coverage',TAVILY_API_KEY:'test'});
 const claims=['One','Two','Three','Four','Five'];let calls=0;
 globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({claims})},finish_reason:'stop'}]})};};
 try{const res=response();await check({method:'POST',headers:{accept:'application/x-ndjson'},body:{text:'Five distinct claims'}},res);const result=res.lines.trim().split('\n').map(JSON.parse).find(e=>e.type==='result');assert.deepEqual(result.data.deferred,claims);assert.equal(calls,1);}
 finally{globalThis.fetch=old;for(const key of ['NEBIUS_API_KEY','NEBIUS_MODEL','TAVILY_API_KEY']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
