import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import handler from '../api/scribe-token.mjs';
test('Worklet emits bounded PCM16 audio chunks',async()=>{
 let Processor;const chunks=[];
 const context={AudioWorkletProcessor:class{constructor(){this.port={postMessage:data=>chunks.push(data)};}},registerProcessor:(name,value)=>{Processor=value;},Int16Array};
 vm.runInNewContext(await readFile(new URL('../public/pcm-worklet.js',import.meta.url),'utf8'),context);
 const processor=new Processor();const samples=new Float32Array(2048);samples.set([-2,-1,0,1,2]);
 processor.process([[samples]]);assert.equal(chunks.length,1);assert.deepEqual(Array.from(new Int16Array(chunks[0]).slice(0,5)),[-32768,-32768,0,32767,32767]);
});
test('Realtime token errors do not expose provider details or secrets',async()=>{
 const oldKey=process.env.ELEVENLABS_API_KEY;const oldFetch=globalThis.fetch;
 process.env.ELEVENLABS_API_KEY='test-secret';globalThis.fetch=async()=>({ok:false,status:401});
 let result,status;const res={setHeader(){},status(n){status=n;return this;},json(value){result=value;}};
 try{await handler({method:'POST',headers:{}},res);assert.equal(status,502);assert.equal(JSON.stringify(result).includes('test-secret'),false);}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.ELEVENLABS_API_KEY;else process.env.ELEVENLABS_API_KEY=oldKey;}
});
