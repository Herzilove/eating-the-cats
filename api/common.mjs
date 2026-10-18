export function reply(res, status, body) { res.setHeader('Cache-Control','no-store'); return res.status(status).json(body); }
export function guard(req,res) {
  if(req.method!=='POST'){reply(res,405,{error:'POST required'});return false;}
  const origin=req.headers.origin;
  if(origin){try{if(new URL(origin).host!==req.headers.host){reply(res,403,{error:'Origin rejected'});return false;}}catch{reply(res,403,{error:'Invalid origin'});return false;}}
  return true;
}
export async function upstream(url,options){
 const r=await fetch(url,{...options,signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw new Error(`Provider returned ${r.status}`);
 return r.json();
}
