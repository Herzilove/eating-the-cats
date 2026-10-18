import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {ResearchQueue} from '../public/queue.js';
function element(){return {value:'',textContent:'',checked:false,disabled:false,hidden:false,children:[],dataset:{},attrs:{},append(...items){this.children.push(...items);},prepend(...items){this.children.unshift(...items);},replaceChildren(...items){this.children=items;},setAttribute(k,v){this.attrs[k]=v;},classList:{toggle(){return true;}}};}
async function browser(){
 const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};get('duration').value='30';get('budget').value='20';
 const speakers=['Speaker A','Speaker B',''].map(name=>({...element(),dataset:{speaker:name}}));const views=['live','evidence','panel'].map(name=>({...element(),dataset:{view:name}}));
 const storage=new Map();let fetches=0;
 const context=vm.createContext({ResearchQueue,document:{getElementById:get,createElement:element,createTextNode:text=>text,querySelectorAll:selector=>selector.includes('data-speaker')?speakers:views,body:{dataset:{},classList:{toggle(){return true;}}}},window:{addEventListener(){}},localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)},setInterval(){},setTimeout(){return 1;},clearTimeout(){},URL,Blob,AbortController,AbortSignal,TextDecoder,fetch:async()=>{fetches++;return {json:async()=>({})};}});
 const source=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import .*?;\s*/,'');vm.runInContext(source,context);
 await new Promise(resolve=>setImmediate(resolve));return {context,get,speakers,views,storage,fetches:()=>fetches};
}
test('Mobile navigation and speaker controls are wired',async()=>{const b=await browser();b.views[2].onclick();assert.equal(vm.runInContext('document.body.dataset.view',b.context),'panel');b.speakers[1].onclick();assert.equal(b.get('speaker').value,'Speaker B');});
test('Device restore retains duration, speaker and pending text without spending requests',async()=>{
 const b=await browser();b.get('duration').value='90';b.speakers[1].onclick();vm.runInContext("queue.enqueue('A pending claim','Speaker B');committedText='Transcript';",b.context);b.get('save-local').checked=true;b.get('save-local').onchange();
 b.get('save-local').checked=false;b.get('reset').onclick();const before=b.fetches();b.get('restore').onclick();
 assert.equal(b.get('duration').value,'90');assert.equal(b.get('speaker').value,'Speaker B');assert.equal(vm.runInContext('queue.current.text',b.context),'A pending claim');assert.equal(vm.runInContext('queue.paused',b.context),true);assert.equal(b.fetches(),before);
});
test('Research allowance stops queued work before a provider call',async()=>{const b=await browser();vm.runInContext("requests=20;queue.enqueue('A claim','A');",b.context);const before=b.fetches();await vm.runInContext('drainResearch()',b.context);assert.equal(b.fetches(),before);assert.equal(vm.runInContext('queue.items.length',b.context),1);assert.equal(vm.runInContext('queue.paused',b.context),true);});
test('Microphone permission is requested before constructing audio and errors release the controls',async()=>{
 const b=await browser();let contexts=0;
 b.context.window.AudioContext=class{constructor(){contexts++;}};
 b.context.navigator={mediaDevices:{getUserMedia:async()=>{const error=new Error('denied');error.name='NotAllowedError';throw error;}}};b.context.WebSocket={OPEN:1};
 const before=b.fetches();await vm.runInContext('startLive()',b.context);
 assert.equal(contexts,0);assert.equal(b.fetches(),before);assert.match(b.get('message').textContent,/Microphone access was blocked/);assert.equal(vm.runInContext('recording',b.context),false);
});
test('Late microphone permission after cancellation immediately closes the tracks',async()=>{
 const b=await browser();let grant,stopped=0;
 b.context.window.AudioContext=class{};b.context.WebSocket={OPEN:1};
 b.context.navigator={mediaDevices:{getUserMedia:()=>new Promise(resolve=>{grant=resolve;})}};
 const start=vm.runInContext('startLive()',b.context);vm.runInContext('stop()',b.context);grant({getTracks:()=>[{stop(){stopped++;}}]});await start;
 assert.ok(stopped>=1);assert.equal(vm.runInContext('recording',b.context),false);
});
test('Deferred claims stay queued when the request allowance is exhausted',async()=>{
 const b=await browser();b.get('budget').value='1';let delivered=false;
 const payload=new TextEncoder().encode(JSON.stringify({type:'result',data:{claims:[],sources:[],searches:[],deferred:['One','Two','Three','Four'],checkedAt:new Date().toISOString()}})+'\n');
 b.context.fetch=async()=>({ok:true,body:{getReader:()=>({read:async()=>{if(delivered)return {done:true};delivered=true;return {done:false,value:payload};},releaseLock(){}})}});
 vm.runInContext("queue.enqueue('Original section','A')",b.context);await vm.runInContext('drainResearch()',b.context);
 assert.equal(vm.runInContext('queue.items.length',b.context),2);assert.equal(vm.runInContext('queue.sections[0].status',b.context),'Claims queued');assert.equal(vm.runInContext('queue.items.flatMap(x=>x.selectedClaims).length',b.context),4);assert.equal(vm.runInContext('queue.paused',b.context),true);
});
test('New results do not displace the card being read until explicitly revealed',async()=>{
 const b=await browser();
 const result=name=>({claims:[{claim:name,verdict:'Supported',explanation:'Test evidence',source_ids:[]}],sources:[],searches:[],checkedAt:new Date().toISOString()});
 b.context.firstResult=result('First');b.context.secondResult=result('Second');
 vm.runInContext("render(firstResult,'A');render(secondResult,'A')",b.context);
 assert.equal(b.get('feed').children.length,1);assert.equal(vm.runInContext('pendingCards.length',b.context),1);
 b.get('new-results').onclick();assert.equal(b.get('feed').children.length,2);assert.equal(vm.runInContext('pendingCards.length',b.context),0);
 b.get('verdict-filter').value='Contradicted';b.get('verdict-filter').onchange();assert.ok(b.get('feed').children.every(c=>c.hidden));
 b.views[0].onclick();assert.ok(b.get('feed').children.every(c=>!c.hidden));
});

test('Continuous speech submits complete sentences and holds the unfinished tail',async()=>{
 const b=await browser();
 vm.runInContext("recording=true;pendingSince=Date.now();pendingText='Paris is in France. Berlin is';flushTranscript();",b.context);
 assert.equal(vm.runInContext('queue.current.text.trim()',b.context),'Paris is in France.');
 assert.equal(vm.runInContext('pendingText',b.context),'Berlin is');
 vm.runInContext("pendingText+=' in Germany.';flushTranscript();",b.context);
 assert.equal(vm.runInContext('queue.items[1].text',b.context),'Berlin is in Germany.');
 assert.equal(vm.runInContext('pendingText',b.context),'');
});
test('Unpunctuated speech has a bounded wait and stopping flushes the final fragment',async()=>{
 const b=await browser();
 vm.runInContext("recording=true;pendingSince=Date.now()-9000;pendingText='A continuous spoken statement';flushTranscript();pendingSince=Date.now();pendingText='last words';flushTranscript(true);",b.context);
 assert.equal(vm.runInContext('queue.items.length',b.context),2);
 assert.equal(vm.runInContext('queue.items[1].text',b.context),'last words');
});
test('Continuous transcription requests finalization after twenty seconds, never for silence',async()=>{
 const b=await browser();
 vm.runInContext("lastCommitAt=Date.now()-21000;partialSpeech='Still speaking';",b.context);
 assert.equal(vm.runInContext('shouldCommitSpeech()',b.context),true);
 vm.runInContext('lastCommitAt=Date.now()',b.context);
 assert.equal(vm.runInContext('shouldCommitSpeech()',b.context),false);
 vm.runInContext("lastCommitAt=0;partialSpeech='';",b.context);
 assert.equal(vm.runInContext('shouldCommitSpeech()',b.context),false);
});
test('Context spans recent sections but never mixes different speakers',()=>{
 const q=new ResearchQueue();q.enqueue('The city we are discussing is Paris.','A');q.enqueue('It has','A');q.enqueue('Unrelated statement','B');q.enqueue('more than two million residents.','A');
 assert.match(q.items.at(-1).context,/Paris/);assert.match(q.items.at(-1).context,/It has/);assert.doesNotMatch(q.items.at(-1).context,/Unrelated/);
});

test('Interim words update immediately without rewriting the collapsed transcript history',async()=>{
 const b=await browser();b.get('transcript-preview').scrollHeight=900;
 vm.runInContext("committedText='Earlier sentence. '.repeat(1000);showTranscript('New words right now');",b.context);
 assert.equal(b.get('transcript-interim').textContent,'New words right now');
 assert.ok(b.get('transcript-final').textContent.length<=281);
 assert.equal(b.get('transcript-preview').scrollTop,900);
 assert.equal(b.get('transcript').textContent,'');
 vm.runInContext("partialSpeech='Revised words';",b.context);b.get('transcript-expander').open=true;b.get('transcript-expander').ontoggle();
 assert.ok(b.get('transcript').textContent.endsWith('Revised words'));
 assert.ok(b.get('transcript').textContent.length>10000);
});

test('Claim support excludes unresolved and pending claims and has no empty-session score',async()=>{
 const b=await browser();assert.equal(b.get('support-score').textContent,'—');
 vm.runInContext("counts.Supported=3;counts.Contradicted=1;counts['Needs Context']=2;counts.Unverified=4;queue.enqueue('Pending statement');refresh();",b.context);
 assert.equal(b.get('support-score').textContent,'75%');
 assert.match(b.get('support-pending').textContent,/10 assessed · 6 unresolved · 1 research groups pending/);
 b.get('reset').onclick();assert.equal(b.get('support-score').textContent,'—');
 vm.runInContext("counts.Unverified=5;refresh();",b.context);assert.equal(b.get('support-score').textContent,'—');
});

test('A failed section does not block later sections; retries are delayed and bounded',async()=>{
 const b=await browser();const calls=[];
 b.context.fetch=async(path,options)=>{
  const text=JSON.parse(options.body).text;calls.push(text);
  if(text==='Fails')throw Error('Temporary failure');
  let sent=false;const bytes=new TextEncoder().encode(JSON.stringify({type:'result',data:{claims:[],sources:[],searches:[],checkedAt:new Date().toISOString()}})+'\n');
  return {ok:true,body:{getReader:()=>({read:async()=>sent?{done:true}:(sent=true,{done:false,value:bytes}),releaseLock(){}})}};
 };
 vm.runInContext("queue.enqueue('Fails');queue.enqueue('Succeeds');",b.context);await vm.runInContext('drainResearch()',b.context);
 assert.deepEqual(calls,['Fails','Succeeds']);assert.equal(vm.runInContext('queue.paused',b.context),false);
 assert.equal(vm.runInContext('queue.items[0].status',b.context),'Retry scheduled');assert.match(b.get('support-coverage').textContent,/1 \/ 2 sections processed · incomplete/);
 for(let attempt=0;attempt<2;attempt++){vm.runInContext('queue.items[0].retryAt=0',b.context);await vm.runInContext('drainResearch()',b.context);}
 assert.equal(calls.filter(x=>x==='Fails').length,3);assert.equal(vm.runInContext('queue.items[0].retryBlocked',b.context),true);
 await vm.runInContext('drainResearch()',b.context);assert.equal(calls.length,4);
 assert.equal(b.get('retry').hidden,false);
});
test('Coverage includes deferred groups and repeated sections only after completion',()=>{
 const q=new ResearchQueue();q.enqueue('Original');q.enqueue('Original');const parent=q.current;parent.status='Claims queued';q.acknowledge(parent);q.enqueueClaims(parent.text,'',['A','B','C','D'],parent.id);
 assert.deepEqual(q.coverage(),{total:2,done:0});q.items[0].status='Assessed';assert.equal(q.coverage().done,0);q.items[1].status='Assessed';assert.deepEqual(q.coverage(),{total:2,done:2});
});
test('Permanent failures require manual retry and acknowledgement removes the active item',()=>{
 const q=new ResearchQueue();q.enqueue('First');q.enqueue('Second');const first=q.current;q.fail(first,false);const second=q.current;
 assert.equal(second.text,'Second');assert.equal(q.retryDelay,null);q.retryFailed();q.acknowledge(second);assert.equal(q.items[0],first);assert.equal(first.failures,0);
});

test('Microphone constraints use explicit selection and optional automatic gain',async()=>{
 const b=await browser();b.get('auto-gain').checked=true;b.get('mic-device').value='external-mic';
 assert.equal(vm.runInContext('audioConstraints().deviceId.exact',b.context),'external-mic');assert.equal(vm.runInContext('audioConstraints().autoGainControl',b.context),true);
 b.get('auto-gain').checked=false;b.get('mic-device').value='';assert.equal(vm.runInContext('audioConstraints().deviceId',b.context),undefined);assert.equal(vm.runInContext('audioConstraints().autoGainControl',b.context),false);
});
test('Input meter distinguishes silence, usable level and clipping, then resets on cleanup',async()=>{
 const b=await browser();
 vm.runInContext('updateInputLevel(new Int16Array(2048).buffer)',b.context);assert.match(b.get('mic-level-label').textContent,/Quiet/);assert.equal(b.get('mic-level').value,0);
 vm.runInContext('updateInputLevel(new Int16Array(2048).fill(4000).buffer)',b.context);assert.equal(b.get('mic-level-label').textContent,'Input level OK');
 vm.runInContext('updateInputLevel(new Int16Array(2048).fill(32767).buffer)',b.context);assert.match(b.get('mic-level-label').textContent,/Too loud/);
 vm.runInContext('cleanupAudio()',b.context);assert.equal(b.get('mic-level').value,0);
});
test('Device refresh preserves a selected microphone and falls back when removed',async()=>{
 const b=await browser();b.context.navigator={mediaDevices:{enumerateDevices:async()=>[{kind:'audioinput',deviceId:'usb',label:'USB microphone'}]}};
 b.get('mic-device').value='usb';await vm.runInContext('refreshMicrophones()',b.context);assert.equal(b.get('mic-device').value,'usb');
 b.context.navigator.mediaDevices.enumerateDevices=async()=>[];await vm.runInContext('refreshMicrophones()',b.context);assert.equal(b.get('mic-device').value,'');
});

test('Speech options default to auto language without paid hints or filtering',async()=>{
 const b=await browser();b.context.params=new URLSearchParams();vm.runInContext('applySpeechOptions(params)',b.context);
 assert.equal(b.context.params.has('language_code'),false);assert.deepEqual(b.context.params.getAll('keyterms'),[]);assert.equal(b.context.params.get('filter_background_audio'),'false');
});
test('English and German language hints and background filtering are encoded safely',async()=>{
 const b=await browser();b.get('speech-hints').value='NVIDIA, München; NVIDIA\nenergy & climate';b.get('background-filter').checked=true;
 for(const language of ['en','de']){b.get('speech-language').value=language;b.context.params=new URLSearchParams();vm.runInContext('applySpeechOptions(params)',b.context);assert.equal(b.context.params.get('language_code'),language);assert.deepEqual(b.context.params.getAll('keyterms'),['NVIDIA','München','energy & climate']);assert.equal(b.context.params.get('filter_background_audio'),'true');}
});
test('Invalid hints are rejected before microphone capture; settings lock during recording',async()=>{
 const b=await browser();b.get('speech-hints').value='x'.repeat(50);const before=b.fetches();await vm.runInContext('startLive()',b.context);assert.equal(b.fetches(),before);assert.match(b.get('message').textContent,/short hints/);
 vm.runInContext('recording=true;refresh()',b.context);for(const id of ['speech-language','speech-hints','background-filter'])assert.equal(b.get(id).disabled,true);
});
