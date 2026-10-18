import {reply,guard,upstream} from '../lib/common.mjs';
export default async function handler(req,res){
 if(!guard(req,res))return;
 if(!process.env.ELEVENLABS_API_KEY)return reply(res,503,{error:'ElevenLabs is not configured.'});
 try{
  const data=await upstream('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',{method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY}});
  if(!data.token)throw Error('Missing session token');
  return reply(res,200,{token:data.token});
 }catch{return reply(res,502,{error:'Could not start ElevenLabs Realtime. Check Speech to Text permissions and available credits.'});}
}
