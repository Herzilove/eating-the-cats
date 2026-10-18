class PCMProcessor extends AudioWorkletProcessor {
 constructor(){super();this.buffer=new Int16Array(2048);this.offset=0;}
 process(inputs){const audio=inputs[0]?.[0];if(audio)for(const sample of audio){const value=Math.max(-1,Math.min(1,sample));this.buffer[this.offset++]=value<0?value*32768:value*32767;if(this.offset===this.buffer.length){this.port.postMessage(this.buffer.buffer,[this.buffer.buffer]);this.buffer=new Int16Array(2048);this.offset=0;}}return true;}
}
registerProcessor('pcm-stream',PCMProcessor);
