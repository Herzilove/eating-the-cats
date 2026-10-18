import http from 'node:http';
import scribeToken from './api/scribe-token.mjs';
import {readFile} from 'node:fs/promises';
import check from './api/check.mjs';import transcribe from './api/transcribe.mjs';import status from './api/status.mjs';
const routes={'/api/scribe-token':scribeToken,'/api/check':check,'/api/transcribe':transcribe,'/api/status':status};
http.createServer(async(req,res)=>{
 res.status=n=>{res.statusCode=n;return res;};res.json=b=>res.end(JSON.stringify(b));
 const path=new URL(req.url,'http://localhost').pathname;
 if(routes[path]){res.setHeader('Content-Type','application/json');let data='';for await(const chunk of req){data+=chunk;if(data.length>3000000){res.statusCode=413;res.end();return;}}try{req.body=data?JSON.parse(data):{};await routes[path](req,res);}catch{res.status(400).json({error:'Invalid request'});}return;}
 if(path!=='/'&&path!=='/app.js'&&path!=='/style.css'&&path!=='/pcm-worklet.js'&&path!=='/queue.js'){res.statusCode=404;res.end();return;}
 const file=path==='/'?'index.html':path.slice(1);res.setHeader('Content-Type',file.endsWith('js')?'text/javascript':file.endsWith('css')?'text/css':'text/html');res.end(await readFile(new URL('./public/'+file,import.meta.url)));
}).listen(Number(process.argv[2]||process.env.PORT)||3018,'127.0.0.1',()=>console.log(`Local preview: http://127.0.0.1:${Number(process.argv[2]||process.env.PORT)||3018}`));
