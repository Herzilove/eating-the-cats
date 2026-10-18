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
