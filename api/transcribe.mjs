import {reply,guard,upstream} from '../lib/common.mjs';
export default async function handler(req,res){
 if(!guard(req,res))return;
 if(!process.env.ELEVENLABS_API_KEY)return reply(res,503,{error:'ElevenLabs is not configured.'});
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!body?.audio || typeof body.audio!=='string'||body.audio.length>2500000)return reply(res,400,{error:'Audio missing or too large.'});
  const mime=['audio/webm','audio/ogg','audio/mp4'].find(x=>body.mime?.startsWith(x));
  if(!mime)return reply(res,400,{error:'Unsupported audio format.'});
  const form=new FormData();form.append('model_id','scribe_v2');
  form.append('file',new Blob([Buffer.from(body.audio,'base64')],{type:mime}),mime==='audio/mp4'?'clip.mp4':mime==='audio/ogg'?'clip.ogg':'clip.webm');
  const data=await upstream('https://api.elevenlabs.io/v1/speech-to-text',{method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY},body:form});
  return reply(res,200,{text:data.text||''});
 }catch{return reply(res,502,{error:'Transcription failed. Check ElevenLabs permissions and credits.'});}
}

