import {ResearchQueue} from './queue.js';
const $=id=>document.getElementById(id);
let busy=false,recording=false,stopping=false,stream,stopTimer,socket,audioContext,sourceNode,pcmNode,muteNode;
let committedText='',pendingText='',researchTimer,sessionId=0,audioRate=16000,requestController;
const queue=new ResearchQueue(),seenClaims=new Set();
let history=[],speakerStats={},recordedMs=0,recordingStarted=0,requests=0,gaps=[],reconnects=0,reconnectTimer;
function reconnect(){if(!$('reconnect').checked||reconnects>=3)return;reconnects++;message('Connection interrupted. Reconnecting; some speech may be missing.');reconnectTimer=setTimeout(()=>{if($('reconnect').checked&&!recording)startLive();},2000);}
const storageKey='eating-the-cats-session-v1';
function persist(){if(!$('save-local').checked)return;try{localStorage.setItem(storageKey,JSON.stringify({version:1,history,committedText,pendingText,items:queue.items,completed:[...queue.completed],recordedMs:recordedMs+(recordingStarted?Date.now()-recordingStarted:0),requests,gaps,speaker:$('speaker').value,duration:$('duration').value,budget:$('budget').value}));}catch{message('Device storage is full or unavailable. Export your session before closing.');}}
function updateSession(){
 $('duration').disabled=recording||stopping;
 $('speaker').disabled=recording||stopping;
 document.querySelectorAll('[data-speaker]').forEach(b=>b.disabled=recording||stopping);
 $('restore').disabled=busy||recording||stopping;
 $('budget-status').textContent=requests+' / '+$('budget').value+' research requests used · '+gaps.length+' connection gaps';
 $('speaker-stats').replaceChildren();
 for(const [name,stats] of Object.entries(speakerStats)){const row=document.createElement('article');row.className='speaker-stat';const title=document.createElement('h3');title.textContent=name;row.append(title);for(const verdict of ['Supported','Contradicted','Needs Context','Unverified']){const p=document.createElement('p');p.textContent=verdict+': '+(stats[verdict]||0);row.append(p);}$('speaker-stats').append(row);}
 persist();
}
function showPending(text,phase){const card=document.createElement('article');card.className='claim pending-claim';const label=document.createElement('span');label.id='pending-phase';label.className='badge';label.textContent=phase;const p=document.createElement('p');p.textContent=text;card.append(label,p);$('inflight').replaceChildren(card);}

const counts={'Supported':0,'Contradicted':0,'Needs Context':0,'Unverified':0};
const message=s=>$('message').textContent=s;
const headers=()=>({'Content-Type':'application/json',...($('access-code').value?{Authorization:`Bearer ${$('access-code').value}`}:{})});
async function post(path,body){const r=await fetch(path,{method:'POST',headers:headers(),body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;}
function refresh(){
 updateSession();
 $('count').textContent=`${seenClaims.size} CLAIMS`;
 for(const [name,count] of Object.entries(counts))$(name.replaceAll(' ','-')).textContent=count;
 $('pending').textContent=`${queue.items.length} research batch${queue.items.length===1?'':'es'} pending`;
 $('retry').hidden=!queue.paused;
 $('cancel').disabled=!busy;
 $('reset').disabled=busy||recording||stopping;
 $('recovery').hidden=!queue.paused;
 $('saved-text').value=queue.items.map(x=>x.text).join('\n\n');
}
function activity(phase,text){
 $('phase').textContent=phase;
 const li=document.createElement('li');li.textContent=text;$('activity').prepend(li);
 while($('activity').children.length>8)$('activity').lastChild.remove();
}
function render(data,speaker,remember=true){
 if(remember)history.push({data,speaker});
 for(const c of data.claims){
  const key=JSON.stringify([speaker,c.claim.toLowerCase().replace(/\s+/g,' ').trim()]);if(seenClaims.has(key))continue;
  if(!seenClaims.size)$('feed').replaceChildren();seenClaims.add(key);counts[c.verdict]++;
  const card=document.createElement('article');card.className='claim';
  const badge=document.createElement('span');badge.className='badge';badge.dataset.verdict=c.verdict;badge.textContent=c.verdict;
  const title=document.createElement('h3');title.textContent=c.claim;
  const p=document.createElement('p');p.textContent=c.explanation;card.append(badge,title,p);
  for(const id of c.source_ids){
   const s=data.sources[id-1];if(!s)continue;
   let url;try{url=new URL(s.url);if(!['https:','http:'].includes(url.protocol))continue;}catch{continue;}
   const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`[${id}] ${s.title}`;card.append(a);
   if(s.excerpt){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Search excerpt';const excerpt=document.createElement('p');excerpt.textContent=s.excerpt;details.append(summary,excerpt);card.append(details);}
  }
  const meta=document.createElement('div');meta.className='meta';meta.textContent=`${speaker||'Unlabelled speaker'} · ${new Date(data.checkedAt).toLocaleTimeString()} · ${data.searches.length} searches${data.cached?' · cached result':''}`;card.append(meta);$('feed').prepend(card);
 const owner=speaker||'Unknown';speakerStats[owner]??={};speakerStats[owner][c.verdict]=(speakerStats[owner][c.verdict]||0)+1;
 }
 refresh();
}
async function research(text,signal){
 const response=await fetch('/api/check',{method:'POST',headers:{...headers(),Accept:'application/x-ndjson'},body:JSON.stringify({text}),signal});
 if(!response.ok){const data=await response.json();throw Error(data.error||'Request failed');}
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
 const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='error')throw Error(event.error);if(event.type==='activity'){activity(event.phase,event.message);$('pending-phase')?.replaceChildren(document.createTextNode(event.phase));}if(event.type==='claims')showPending(event.claims.join(' • '),'Searching');if(event.type==='sources'){for(const source of event.sources){const u=new URL(source.url);if(!['http:','https:'].includes(u.protocol))continue;const a=document.createElement('a');a.href=u.href;a.rel='noopener noreferrer';a.target='_blank';a.textContent=source.title;$('inflight').firstChild?.append(a);}}if(event.type==='result')result=event.data;};
 try{while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let end;while((end=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,end));buffer=buffer.slice(end+1);}if(done)break;}consume(buffer);}finally{reader.releaseLock();}
 if(!result)throw Error('Research connection ended before a result arrived.');return result;
}
async function drainResearch(){
 clearTimeout(researchTimer);researchTimer=null;
 if(pendingText.trim()){queue.enqueue(pendingText,$('speaker').value);pendingText='';}
 if(busy||queue.paused){refresh();return;}
 while(queue.current&&!queue.paused){
  if(requests>=Number($('budget').value)){queue.paused=true;message('Research allowance reached. Increase the limit, then retry.');refresh();break;}
  requests++;busy=true;requestController=new AbortController();const deadline=setTimeout(()=>requestController.abort(),57000);const item=queue.current;refresh();showPending(item.text,'Detecting');message('Researching the next transcript batch…');
  try{const data=await research(item.text,requestController.signal);render(data,item.speaker);queue.acknowledge();$('inflight').replaceChildren();activity('Complete',data.claims.length?'Assessment complete. Review the linked evidence.':'No checkable claims found.');message('Assessment complete.');}
  catch(e){showPending(queue.current?.text||'','Paused — text retained');queue.paused=true;activity('Paused','Your transcript is retained for retry.');message(e.name==='AbortError'?'Research cancelled or timed out. Pending text is kept.':e.message);}
  finally{clearTimeout(deadline);busy=false;requestController=null;refresh();}
 }
}
function scheduleResearch(){if(!researchTimer)researchTimer=setTimeout(()=>{researchTimer=null;drainResearch();},1200);}
$('check').onclick=()=>{const text=$('text').value.trim();if(!text){message('Enter a factual statement first.');return;}queue.enqueue(text,$('speaker').value);drainResearch();};
$('retry').onclick=()=>{queue.paused=false;drainResearch();};
$('cancel').onclick=()=>{queue.paused=true;requestController?.abort();};
$('reset').onclick=()=>{if(busy||recording||stopping)return;history=[];speakerStats={};recordedMs=0;requests=0;gaps=[];reconnects=0;clearTimeout(reconnectTimer);clearTimeout(researchTimer);researchTimer=null;queue.reset();seenClaims.clear();for(const key in counts)counts[key]=0;pendingText='';committedText='';$('transcript').textContent='';$('feed').replaceChildren();$('activity').replaceChildren();$('phase').textContent='Ready';refresh();message('Session cleared.');};
$('display').onclick=()=>{const enabled=document.body.classList.toggle('display-mode');$('display').textContent=enabled?'Exit display mode':'Display mode';$('display').setAttribute('aria-pressed',String(enabled));};
refresh();
function showTranscript(partial=''){$('transcript').textContent=[committedText,partial].filter(Boolean).join(' ').slice(-6000);$('transcript').scrollTop=$('transcript').scrollHeight;}
function cleanupAudio(){stream?.getTracks().forEach(t=>t.stop());stream=null;sourceNode?.disconnect();pcmNode?.disconnect();muteNode?.disconnect();if(audioContext&&audioContext.state!=='closed')audioContext.close().catch(()=>{});audioContext=null;}
function stop(){
 if(recordingStarted){recordedMs+=Date.now()-recordingStarted;recordingStarted=0;}recording=false;stopping=true;clearTimeout(reconnectTimer);clearTimeout(stopTimer);cleanupAudio();const old=socket;socket=null;
 if(old?.readyState===WebSocket.OPEN){
  old.send(JSON.stringify({message_type:'input_audio_chunk',audio_base_64:btoa(String.fromCharCode(...new Uint8Array(3200))),commit:true,sample_rate:audioRate}));
  setTimeout(()=>old.close(),1500);
 }else old?.close();
 $('mic').disabled=true;$('mic').textContent='● Start listening';$('live').textContent='STOPPED';refresh();
 $('reset').disabled=true;
 setTimeout(()=>{stopping=false;if(!recording){$('mic').disabled=false;refresh();}},1600);
}
async function startLive(){
 clearTimeout(reconnectTimer);
 if(recording||stopping)return;
 if(queue.paused){message('Retry or clear the pending research before recording again.');return;}
 if(recordedMs>=Number($('duration').value)*60000){message('Recording allowance reached. Increase it or reset the session.');return;}
 const id=++sessionId;recording=true;refresh();$('mic').textContent='■ Stop listening';$('live').textContent='CONNECTING';message('Connecting to ElevenLabs live transcription…');
 try{
  const Context=window.AudioContext||window.webkitAudioContext;if(!Context||!navigator.mediaDevices?.getUserMedia)throw Error('Live recording requires HTTPS and a supported browser.');
  audioContext=new Context({sampleRate:16000});await audioContext.resume();
  const localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});
  if(!recording||id!==sessionId){localStream.getTracks().forEach(t=>t.stop());return;}stream=localStream;
  const {token}=await post('/api/scribe-token',{});if(!recording||id!==sessionId)return;
  await audioContext.audioWorklet.addModule('/pcm-worklet.js');if(!recording||id!==sessionId)return;
  const rate=audioContext.sampleRate;audioRate=rate;const url=new URL('wss://api.elevenlabs.io/v1/speech-to-text/realtime');url.search=new URLSearchParams({model_id:'scribe_v2_realtime',token,audio_format:`pcm_${rate}`,commit_strategy:'vad',vad_silence_threshold_secs:'0.7'});
  const ws=new WebSocket(url);socket=ws;showTranscript();
  const connectionTimer=setTimeout(()=>{if(ws.readyState===WebSocket.CONNECTING){message('Live connection timed out. Please retry.');stop();}},15000);
  ws.onopen=()=>{clearTimeout(connectionTimer);if(!recording||id!==sessionId){ws.close();return;}sourceNode=audioContext.createMediaStreamSource(stream);pcmNode=new AudioWorkletNode(audioContext,'pcm-stream');muteNode=audioContext.createGain();muteNode.gain.value=0;sourceNode.connect(pcmNode);pcmNode.connect(muteNode);muteNode.connect(audioContext.destination);pcmNode.port.onmessage=event=>{if(ws.readyState!==WebSocket.OPEN||!recording)return;if(ws.bufferedAmount>256000){message('Audio connection is too slow. Please retry.');stop();return;}const bytes=new Uint8Array(event.data);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);ws.send(JSON.stringify({message_type:'input_audio_chunk',audio_base_64:btoa(binary),sample_rate:rate}));};recordingStarted=Date.now();$('live').textContent='LIVE';message('Live transcript is running. Pause briefly after a statement to start its fact-check.');stopTimer=setTimeout(stop,Math.max(1,Number($('duration').value)*60000-recordedMs));};
  ws.onmessage=event=>{if(id!==sessionId)return;let data;try{data=JSON.parse(event.data);}catch{return;}if(data.message_type==='partial_transcript'){showTranscript(data.text||'');}else if(data.message_type==='committed_transcript'){const text=(data.text||'').trim();if(text){committedText=[committedText,text].filter(Boolean).join(' ');pendingText=[pendingText,text].filter(Boolean).join(' ');persist();showTranscript();scheduleResearch();}}else if(/error|exceeded|rate_limited|throttled|unaccepted|overflow|exhausted/.test(data.message_type||'')){message(`ElevenLabs: ${data.error||data.message_type}. Check Speech to Text access and credits.`);stop();}};
  ws.onerror=()=>{if(id===sessionId){message('ElevenLabs live connection failed. Check Speech to Text permissions and credits.');stop();}};
  ws.onclose=()=>{clearTimeout(connectionTimer);if(id===sessionId&&recording){gaps.push(new Date().toISOString());message('Connection lost. A gap was recorded. Press Start listening to resume.');stop();reconnect();}};
 }catch(error){if(id===sessionId){message(error.message||'Could not start microphone.');stop();}}
}
$('mic').onclick=()=>{if(recording)stop();else startLive();};
fetch('/api/status').then(r=>r.json()).then(s=>{$('access').hidden=!s.accessRequired;for(const [key,label] of [['nebius','Token Factory'],['tavily','Tavily'],['elevenlabs','ElevenLabs']]){const span=document.createElement('span');span.textContent=`${s[key]?'●':'○'} ${label}: ${s[key]?'configured':'missing'}`;$('services').append(span);}message('Configuration indicators do not verify API access. First live use will consume provider credits.');}).catch(()=>message('Could not read service configuration.'));
window.addEventListener('pagehide',()=>{stop();requestController?.abort();});
document.querySelectorAll('button[data-view]').forEach(button=>{
 button.onclick=()=>{document.body.dataset.view=button.dataset.view;document.querySelectorAll('button[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));};
});
document.querySelectorAll('[data-speaker]').forEach(button=>{
 button.onclick=()=>{
  if(recording||stopping)return;
  if(pendingText.trim()){queue.enqueue(pendingText,$('speaker').value);pendingText='';}
  $('speaker').value=button.dataset.speaker;
  document.querySelectorAll('[data-speaker]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));refresh();
 };
});
$('speaker').onfocus=()=>{if(pendingText.trim()){queue.enqueue(pendingText,$('speaker').value);pendingText='';}};
$('speaker').onchange=()=>{document.querySelectorAll('[data-speaker]').forEach(b=>b.setAttribute('aria-pressed','false'));persist();};
$('save-local').onchange=()=>{try{if($('save-local').checked)persist();else localStorage.removeItem(storageKey);}catch{message('Device storage is unavailable.');}};
$('forget').onclick=()=>{try{localStorage.removeItem(storageKey);$('save-local').checked=false;message('Saved session deleted from this device.');}catch{message('Device storage is unavailable.');}};
$('export').onclick=()=>{
 const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),history,transcript:committedText,pending:queue.items,pendingText,gaps},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='discussion-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('restore').onclick=()=>{
 if(busy||recording||stopping)return;
 try{
  const saved=JSON.parse(localStorage.getItem(storageKey));
  if(saved?.version!==1||!Array.isArray(saved.history)||!Array.isArray(saved.items))throw Error();
  for(const item of saved.items)if(typeof item.text!=='string'||typeof item.speaker!=='string')throw Error();
  for(const entry of saved.history)if(!Array.isArray(entry.data?.claims)||!Array.isArray(entry.data?.sources))throw Error();
  $('save-local').checked=false;queue.reset();seenClaims.clear();for(const k in counts)counts[k]=0;
  history=[];speakerStats={};$('feed').replaceChildren();$('inflight').replaceChildren();
  committedText=String(saved.committedText||'');pendingText=String(saved.pendingText||'');
  recordedMs=Number(saved.recordedMs)||0;requests=Number(saved.requests)||0;gaps=Array.isArray(saved.gaps)?saved.gaps:[];
  $('speaker').value=saved.speaker||'';$('duration').value=saved.duration||'30';$('budget').value=saved.budget||'20';
  queue.completed=new Set(Array.isArray(saved.completed)?saved.completed:[]);
  for(const item of saved.items)queue.enqueue(item.text,item.speaker);
  for(const entry of saved.history)render(entry.data,entry.speaker);
  queue.paused=queue.items.length>0||!!pendingText;$('save-local').checked=true;
  document.querySelectorAll('[data-speaker]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.speaker===$('speaker').value)));
  showTranscript();refresh();message('Session restored. Recording and research stay paused until you resume.');
 }catch{message('No readable saved session is available on this device.');}
};
$('duration').onchange=persist;$('budget').onchange=refresh;
setInterval(()=>{
 const seconds=Math.floor((recordedMs+(recordingStarted?Date.now()-recordingStarted:0))/1000);
 $('elapsed').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 if(recordingStarted&&seconds%5===0)persist();
},1000);
