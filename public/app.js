import {ResearchQueue} from './queue.js';
const $=id=>document.getElementById(id);
let busy=false,recording=false,stopping=false,stream,stopTimer,socket,audioContext,sourceNode,pcmNode,muteNode;
let committedText='',pendingText='',researchTimer,sessionId=0,audioRate=16000,requestController;
const queue=new ResearchQueue(),seenClaims=new Set();
let pendingCards=[];
let lastCommitAt=0,partialSpeech='',pendingSince=0;
const uiLabels={};
const label=value=>uiLabels[value]||value;
function applyFilter(){const selected=$('verdict-filter').value||'all';for(const card of $('feed').children)card.hidden=selected!=='all'&&card.dataset.verdict!==selected;}
function flushCards(){for(const card of pendingCards){$('feed').prepend(card);}if(pendingCards.length)pendingCards.at(-1).open=true;pendingCards=[];$('new-results').hidden=true;applyFilter();}

let history=[],speakerStats={},recordedMs=0,recordingStarted=0,requests=0,gaps=[],reconnects=0,reconnectTimer;
function reconnect(){if(!$('reconnect').checked||reconnects>=3)return;reconnects++;message('Connection interrupted. Reconnecting; some speech may be missing.');reconnectTimer=setTimeout(()=>{if($('reconnect').checked&&!recording)startLive();},2000);}
const storageKey='eating-the-cats-session-v1';
function persist(){if(!$('save-local').checked)return;try{localStorage.setItem(storageKey,JSON.stringify({version:1,history,committedText,pendingText,items:queue.items,sections:queue.sections,completed:[...queue.completed],recordedMs:recordedMs+(recordingStarted?Date.now()-recordingStarted:0),requests,gaps,speaker:$('speaker').value,duration:$('duration').value,budget:$('budget').value}));}catch{message('Device storage is full or unavailable. Export your session before closing.');}}
function updateSession(){
 for(const parent of queue.sections.filter(s=>s.status==='Claims queued')){const children=queue.sections.filter(s=>s.parent===parent.id);if(children.length&&children.every(s=>s.status==='Assessed'||s.status==='No checkable claim detected'))parent.status='Assessed in groups';}
 $('coverage').replaceChildren();
 const totals={};for(const section of queue.sections){totals[section.status]=(totals[section.status]||0)+1;const row=document.createElement('details');const summary=document.createElement('summary');summary.textContent='#'+section.id+' · '+label(section.status)+(section.duplicate?' (see #'+section.duplicate+')':'')+' · '+(section.speaker||'Unknown')+' · '+new Date(section.createdAt).toLocaleTimeString();const p=document.createElement('p');p.textContent=section.selectedClaims?section.selectedClaims.join(' • '):section.text;row.append(summary,p);$('coverage').append(row);}
 $('coverage-count').textContent=Object.entries(totals).map(([status,n])=>n+' '+label(status)).join(' · ')||'No sections yet';
 $('duration').disabled=recording||stopping;
 $('speaker').disabled=recording||stopping;
 document.querySelectorAll('[data-speaker]').forEach(b=>b.disabled=recording||stopping);
 $('restore').disabled=busy||recording||stopping;
 $('budget-status').textContent=requests+' / '+$('budget').value+' research requests · '+gaps.length+' connection gaps';
 $('speaker-stats').replaceChildren();
 for(const [name,stats] of Object.entries(speakerStats)){const row=document.createElement('article');row.className='speaker-stat';const title=document.createElement('h3');title.textContent=name;row.append(title);for(const verdict of ['Supported','Contradicted','Needs Context','Unverified']){const p=document.createElement('p');p.textContent=verdict+': '+(stats[verdict]||0);row.append(p);}$('speaker-stats').append(row);}
 persist();
}
function showPending(text,phase){const card=document.createElement('article');card.className='claim pending-claim';const label=document.createElement('span');label.id='pending-phase';label.className='badge';label.textContent=uiLabels[phase]||phase;const p=document.createElement('p');p.textContent=text;card.append(label,p);$('inflight').replaceChildren(card);}

const counts={'Supported':0,'Contradicted':0,'Needs Context':0,'Unverified':0};
const message=s=>$('message').textContent=s;
const headers=()=>({'Content-Type':'application/json'});
async function post(path,body){const r=await fetch(path,{method:'POST',headers:headers(),body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;}
function refresh(){
 updateSession();
 $('count').textContent=`${seenClaims.size} CLAIMS`;
 $('progress-line').textContent=`${seenClaims.size} assessed · ${busy?1:0} section in progress · ${Math.max(0,queue.items.length-(busy?1:0))} waiting`;
 $('new-results').hidden=!pendingCards.length;
 $('new-results').textContent=`${pendingCards.length} new results — show`;
 for(const [name,count] of Object.entries(counts))$(name.replaceAll(' ','-')).textContent=count;
 $('pending').textContent=`${queue.items.length} research groups pending`;
 $('capture-status').textContent=pendingText.trim()?'Finishing the current sentence…':recording?'Listening · checking continues in the background': 'Ready for one speaker';
 if(queue.items.length>2)$('progress-line').textContent+=' · catching up; transcript retained';
 $('retry').hidden=!queue.paused;
 $('cancel').disabled=!busy;
 $('reset').disabled=busy||recording||stopping;
 $('recovery').hidden=!queue.paused;
 $('saved-text').value=queue.items.map(x=>x.text).join('\n\n');
}
function activity(phase,text){
 $('phase').textContent=label(phase);
 const li=document.createElement('li');li.textContent=text;$('activity').prepend(li);
 while($('activity').children.length>8)$('activity').lastChild.remove();
}
function render(data,speaker,remember=true){
 if(remember&&data.claims.some(c=>!seenClaims.has(JSON.stringify([speaker,c.claim.toLowerCase().replace(/\s+/g,' ').trim()]))))history.push({data,speaker});
 for(const c of data.claims){
  const key=JSON.stringify([speaker,c.claim.toLowerCase().replace(/\s+/g,' ').trim()]);if(seenClaims.has(key))continue;
  if(!seenClaims.size)$('feed').replaceChildren();seenClaims.add(key);counts[c.verdict]++;
  const card=document.createElement('details');card.className='claim';card.dataset.verdict=c.verdict;card.open=!seenClaims.size||seenClaims.size===1;
  const badge=document.createElement('span');badge.className='badge';badge.dataset.verdict=c.verdict;badge.textContent=label(c.verdict);
  const title=document.createElement('summary');title.textContent=c.claim;
  const p=document.createElement('p');p.textContent=c.explanation;title.prepend(badge);card.append(title,p);
  for(const id of c.source_ids){
   const s=data.sources[id-1];if(!s)continue;
   let url;try{url=new URL(s.url);if(!['https:','http:'].includes(url.protocol))continue;}catch{continue;}
   const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`[${id}] ${s.title}`;card.append(a);
   if(s.excerpt){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='View source excerpt';const excerpt=document.createElement('p');excerpt.textContent=s.excerpt;details.append(summary,excerpt);card.append(details);}
  }
  const meta=document.createElement('div');meta.className='meta';meta.textContent=`${speaker||'Speaker'} · ${new Date(data.checkedAt).toLocaleTimeString()} · ${data.searches.length} searches${data.cached?' · cached result':''}`;card.append(meta);if(seenClaims.size===1){$('feed').prepend(card);}else{pendingCards.push(card);}applyFilter();
 const owner=speaker||'Unknown';speakerStats[owner]??={};speakerStats[owner][c.verdict]=(speakerStats[owner][c.verdict]||0)+1;
 }
 refresh();
}
async function research(text,signal,onClaim=()=>{},selectedClaims,context){
 const response=await fetch('/api/check',{method:'POST',headers:{...headers(),Accept:'application/x-ndjson'},body:JSON.stringify({text,selectedClaims,context}),signal});
 if(!response.ok){const data=await response.json();throw Error(data.error||'Request failed');}
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
 const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='error')throw Error(event.error);if(event.type==='activity'){activity(event.phase,event.message);$('pending-phase')?.replaceChildren(document.createTextNode(label(event.phase)));}if(event.type==='claims')showPending(event.claims.join(' • '),'Searching');if(event.type==='sources'){for(const source of event.sources){const u=new URL(source.url);if(!['http:','https:'].includes(u.protocol))continue;const a=document.createElement('a');a.href=u.href;a.rel='noopener noreferrer';a.target='_blank';a.textContent=source.title;$('inflight').firstChild?.append(a);}}if(event.type==='claim_result'){onClaim(event.data);activity('Assessing','A claim is ready; remaining research continues.');}if(event.type==='claim_error')activity('Retry needed',event.error);if(event.type==='result')result=event.data;};
 try{while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let end;while((end=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,end));buffer=buffer.slice(end+1);}if(done)break;}consume(buffer);}finally{reader.releaseLock();}
 if(!result)throw Error('Research connection ended before a result arrived.');return result;
}
async function drainResearch(){
 clearTimeout(researchTimer);researchTimer=null;
 flushTranscript();
 if(busy||queue.paused){refresh();return;}
 while(queue.current&&!queue.paused){
  if(requests>=Number($('budget').value)){queue.current.status='Waiting — request limit';queue.paused=true;message('Research allowance reached. Increase the limit, then retry.');refresh();break;}
  requests++;busy=true;requestController=new AbortController();const deadline=setTimeout(()=>requestController.abort(),57000);const item=queue.current;item.status='Researching';refresh();showPending(item.text,'Detecting');message('Researching the next transcript batch…');
  try{const data=await research(item.text,requestController.signal,partial=>{item.status='Partial results';render(partial,item.speaker);},item.selectedClaims,item.context);render(data,item.speaker);item.status=data.deferred?.length?'Claims queued':data.claims.length?'Assessed':'No checkable claim detected';queue.acknowledge();if(data.deferred?.length)queue.enqueueClaims(item.text,item.speaker,data.deferred,item.id);$('inflight').replaceChildren();activity('Complete',data.claims.length?'Assessment complete. Review the linked evidence.':'No checkable claims found.');message('Assessment complete.');}
  catch(e){item.status=e.name==='AbortError'?'Cancelled — retry needed':'Failed — retry needed';showPending(queue.current?.text||'','Paused — text retained');queue.paused=true;activity('Paused','Your transcript is retained for retry.');message(e.name==='AbortError'?'Research cancelled or timed out. Pending text is kept.':e.message);}
  finally{clearTimeout(deadline);busy=false;requestController=null;refresh();}
 }
}
function flushTranscript(force=false){
 const text=pendingText.trim();if(!text)return;
 const boundary=[...text.matchAll(/[.!?](?:\s+|$)/g)].at(-1);
 const end=force||!recording||Date.now()-pendingSince>=8000?text.length:boundary?boundary.index+boundary[0].length:0;
 if(end){queue.enqueue(text.slice(0,end),$('speaker').value);pendingText=text.slice(end).trim();pendingSince=pendingText?Date.now():0;}
 if(pendingText)scheduleResearch();
}
function scheduleResearch(){if(!researchTimer)researchTimer=setTimeout(()=>{researchTimer=null;drainResearch();},1200);}
$('check').onclick=()=>{const text=$('text').value.trim();if(!text){message('Enter a factual statement first.');return;}queue.enqueue(text,$('speaker').value);drainResearch();};
$('retry').onclick=()=>{queue.paused=false;drainResearch();};
$('cancel').onclick=()=>{queue.paused=true;requestController?.abort();};
$('reset').onclick=()=>{if(busy||recording||stopping)return;pendingCards=[];history=[];speakerStats={};recordedMs=0;requests=0;gaps=[];reconnects=0;clearTimeout(reconnectTimer);clearTimeout(researchTimer);researchTimer=null;queue.reset();seenClaims.clear();for(const key in counts)counts[key]=0;pendingText='';pendingSince=0;partialSpeech='';committedText='';showTranscript();$('feed').replaceChildren();$('activity').replaceChildren();$('phase').textContent='Ready';refresh();message('Session cleared.');};
$('display').onclick=()=>{const enabled=document.body.classList.toggle('display-mode');$('display').textContent=enabled?'Exit display mode':'Display mode';$('display').setAttribute('aria-pressed',String(enabled));};
refresh();
function shouldCommitSpeech(){return !!partialSpeech.trim()&&Date.now()-lastCommitAt>=20000;}
function showTranscript(partial=''){
 const preview=$('transcript-preview');
 $('transcript-final').textContent=committedText.slice(-280)+(partial&&committedText?' ':'');
 $('transcript-interim').textContent=partial;
 preview.scrollTop=preview.scrollHeight;
 if($('transcript-expander').open){
  const full=$('transcript');full.textContent=[committedText,partial].filter(Boolean).join(' ');full.scrollTop=full.scrollHeight;
 }
}
$('transcript-expander').ontoggle=()=>{if($('transcript-expander').open)showTranscript(partialSpeech);};
async function startupStep(promise,milliseconds,error){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(error)),milliseconds);})]);}finally{clearTimeout(timer);}}
function cleanupAudio(){stream?.getTracks().forEach(t=>t.stop());stream=null;sourceNode?.disconnect();pcmNode?.disconnect();muteNode?.disconnect();if(audioContext&&audioContext.state!=='closed')audioContext.close().catch(()=>{});audioContext=null;}
function stop(){
 if(recordingStarted){recordedMs+=Date.now()-recordingStarted;recordingStarted=0;}recording=false;stopping=true;clearTimeout(reconnectTimer);clearTimeout(stopTimer);cleanupAudio();const old=socket;socket=null;
 if(old?.readyState===WebSocket.OPEN){
  old.send(JSON.stringify({message_type:'input_audio_chunk',audio_base_64:btoa(String.fromCharCode(...new Uint8Array(3200))),commit:true,sample_rate:audioRate}));
  setTimeout(()=>old.close(),1500);
 }else old?.close();
 $('mic').disabled=true;$('mic').textContent='● Start listening';$('live').textContent='PAUSED';refresh();
 $('reset').disabled=true;
 setTimeout(()=>{flushTranscript(true);drainResearch();stopping=false;if(!recording){$('mic').disabled=false;refresh();}},1600);
}
async function startLive(){
 clearTimeout(reconnectTimer);
 if(recording||stopping)return;
 if(queue.paused){message('Retry or clear the pending research before recording again.');return;}
 if(recordedMs>=Number($('duration').value)*60000){message('Recording allowance reached. Increase it or reset the session.');return;}
 const id=++sessionId;recording=true;refresh();$('mic').textContent='■ Pause listening';$('live').textContent='CONNECTING';message('Connecting to ElevenLabs live transcription…');
 try{
  const Context=window.AudioContext||window.webkitAudioContext;if(!Context||!navigator.mediaDevices?.getUserMedia)throw Error('Live recording requires HTTPS and a supported browser.');
  message('Allow microphone access in your browser. Waiting for permission…');
  const microphone=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});
  microphone.then(media=>{if(!recording||id!==sessionId)media.getTracks().forEach(track=>track.stop());},()=>{});
  const localStream=await startupStep(microphone,25000,'Microphone permission did not arrive. Allow microphone access in the browser site settings. If you are in an embedded browser, open this page in Chrome or Edge.');
  if(!recording||id!==sessionId){localStream.getTracks().forEach(t=>t.stop());return;}stream=localStream;
  message('Starting microphone audio…');
  const context=new Context({sampleRate:16000});audioContext=context;
  await startupStep(context.resume(),8000,'This browser did not enable audio capture. Open the app in Chrome or Edge and allow the microphone.');
  if(!recording||id!==sessionId){await context.close().catch(()=>{});return;}
  message('Requesting a secure transcription connection…');
  const {token}=await post('/api/scribe-token',{});if(!recording||id!==sessionId)return;
  await startupStep(audioContext.audioWorklet.addModule('/pcm-worklet.js'),10000,'Audio processing could not load. Reload the page and try again.');if(!recording||id!==sessionId)return;
  const rate=audioContext.sampleRate;audioRate=rate;const url=new URL('wss://api.elevenlabs.io/v1/speech-to-text/realtime');url.search=new URLSearchParams({model_id:'scribe_v2_realtime',token,audio_format:`pcm_${rate}`,commit_strategy:'vad',vad_silence_threshold_secs:'0.7'});
  const ws=new WebSocket(url);socket=ws;lastCommitAt=Date.now();partialSpeech='';showTranscript();
  const connectionTimer=setTimeout(()=>{if(ws.readyState===WebSocket.CONNECTING){message('Live connection timed out. Please retry.');stop();}},15000);
  ws.onopen=()=>{clearTimeout(connectionTimer);if(!recording||id!==sessionId){ws.close();return;}sourceNode=audioContext.createMediaStreamSource(stream);pcmNode=new AudioWorkletNode(audioContext,'pcm-stream');muteNode=audioContext.createGain();muteNode.gain.value=0;sourceNode.connect(pcmNode);pcmNode.connect(muteNode);muteNode.connect(audioContext.destination);pcmNode.port.onmessage=event=>{if(ws.readyState!==WebSocket.OPEN||!recording)return;if(ws.bufferedAmount>256000){message('Audio connection is too slow. Please retry.');stop();return;}const bytes=new Uint8Array(event.data);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);const commit=shouldCommitSpeech();if(commit)lastCommitAt=Date.now();ws.send(JSON.stringify({message_type:'input_audio_chunk',audio_base_64:btoa(binary),sample_rate:rate,...(commit?{commit:true}:{})}));};recordingStarted=Date.now();$('live').textContent='LIVE';message('Listening continuously. Statements are queued for checking while you speak.');stopTimer=setTimeout(stop,Math.max(1,Number($('duration').value)*60000-recordedMs));};
  ws.onmessage=event=>{if(id!==sessionId)return;let data;try{data=JSON.parse(event.data);}catch{return;}if(data.message_type==='partial_transcript'){partialSpeech=data.text||'';showTranscript(partialSpeech);}else if(data.message_type==='committed_transcript'){lastCommitAt=Date.now();partialSpeech='';const text=(data.text||'').trim();if(text){if(!pendingText.trim())pendingSince=Date.now();committedText=[committedText,text].filter(Boolean).join(' ');pendingText=[pendingText,text].filter(Boolean).join(' ');persist();showTranscript();scheduleResearch();}}else if(/error|exceeded|rate_limited|throttled|unaccepted|overflow|exhausted/.test(data.message_type||'')){message(`ElevenLabs: ${data.error||data.message_type}. Check Speech to Text access and credits.`);stop();}};
  ws.onerror=()=>{if(id===sessionId){message('ElevenLabs live connection failed. Check Speech to Text permissions and credits.');stop();}};
  ws.onclose=()=>{clearTimeout(connectionTimer);if(id===sessionId&&recording){gaps.push(new Date().toISOString());message('Connection lost. A gap was recorded. Press Start listening to resume.');stop();reconnect();}};
 }catch(error){if(id===sessionId){const errors={NotAllowedError:'Microphone access was blocked. Allow the microphone in your browser site settings, then try again.',NotFoundError:'No microphone was found. Connect or enable a microphone and try again.',NotReadableError:'The microphone is unavailable or being used by another app. Close the other recording app and retry.'};message(errors[error.name]||error.message||'Could not start microphone.');stop();}}
}
$('mic').onclick=()=>{if(recording)stop();else startLive();};
fetch('/api/status').then(r=>r.json()).then(s=>{for(const [key,label] of [['nebius','Token Factory'],['tavily','Tavily'],['elevenlabs','ElevenLabs']]){const span=document.createElement('span');span.textContent=`${s[key]?'●':'○'} ${label}: ${s[key]?'configured':'missing'}`;$('services').append(span);}if($('message').textContent==='Checking service configuration…')message('');}).catch(()=>message('Could not read service configuration.'));
window.addEventListener('pagehide',()=>{stop();requestController?.abort();});
document.querySelectorAll('button[data-view]').forEach(button=>{
 button.onclick=()=>{document.body.dataset.view=button.dataset.view;if(button.dataset.view==='live'){$('verdict-filter').value='all';applyFilter();}document.querySelectorAll('button[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));};
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
 const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),history,transcript:committedText,pending:queue.items,sections:queue.sections,pendingText,gaps},null,2)],{type:'application/json'});
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
  pendingCards=[];history=[];speakerStats={};$('feed').replaceChildren();$('inflight').replaceChildren();
  committedText=String(saved.committedText||'');pendingText=String(saved.pendingText||'');
  recordedMs=Number(saved.recordedMs)||0;requests=Number(saved.requests)||0;gaps=Array.isArray(saved.gaps)?saved.gaps:[];
  $('speaker').value=saved.speaker||'';$('duration').value=saved.duration||'30';$('budget').value=saved.budget||'20';
  queue.completed=new Set(Array.isArray(saved.completed)?saved.completed:[]);
  if(Array.isArray(saved.sections)){queue.sections=saved.sections;queue.items=saved.items.map(item=>{const section=queue.sections.find(s=>s.id===item.id)||item;section.status='Waiting — restored';return section;});}else{for(const item of saved.items)queue.enqueue(item.text,item.speaker);}
  for(const entry of saved.history)render(entry.data,entry.speaker);
  queue.paused=queue.items.length>0||!!pendingText;$('save-local').checked=true;
  document.querySelectorAll('[data-speaker]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.speaker===$('speaker').value)));
  flushCards();showTranscript();refresh();message('Session restored. Recording and research stay paused until you resume.');
 }catch{message('No readable saved session is available on this device.');}
};
$('duration').onchange=persist;$('budget').onchange=refresh;
setInterval(()=>{
 const seconds=Math.floor((recordedMs+(recordingStarted?Date.now()-recordingStarted:0))/1000);
 $('elapsed').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 if(recordingStarted&&seconds%5===0)persist();
},1000);

$('new-results').onclick=flushCards;
$('verdict-filter').onchange=()=>{flushCards();applyFilter();};
