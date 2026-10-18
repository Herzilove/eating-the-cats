export class ResearchQueue {
  items=[];
  completed=new Set();
  paused=false;
  sections=[];
  enqueue(text, speaker='') {
    const pieces=[];
    let rest=text.trim();
    while(rest.length){
      let end=Math.min(rest.length,700);
      if(end<rest.length){const sentence=[...rest.slice(0,end).matchAll(/[.!?][\s]+/g)].at(-1);const boundary=sentence?sentence.index+sentence[0].length:rest.lastIndexOf(' ',end);if(boundary>0)end=boundary;}
      pieces.push(rest.slice(0,end));rest=rest.slice(end).trimStart();
    }
    for(const part of pieces){
      const key=JSON.stringify([speaker,part.replace(/\s+/g,' ').trim()]);
      const original=this.sections.find(x=>x.key===key&&!x.duplicate);
      const context=this.sections.filter(s=>!s.duplicate&&!s.parent&&s.speaker===speaker).slice(-3).map(s=>s.text).join(' ').slice(-1200);
      const section={id:this.sections.length+1,text:part,speaker,key,context,status:'Waiting',createdAt:new Date().toISOString()};
      if(original){section.duplicate=original.id;section.status='Repeated section';this.sections.push(section);}
      else{this.sections.push(section);this.items.push(section);}
    }
  }
  enqueueClaims(text,speaker,claims,parent){
    for(let i=0;i<claims.length;i+=3){const selectedClaims=claims.slice(i,i+3);const section={id:this.sections.length+1,text,speaker,selectedClaims,parent,context:this.sections.find(s=>s.id===parent)?.context||'',key:JSON.stringify([speaker,text,selectedClaims]),status:'Waiting',createdAt:new Date().toISOString()};this.sections.push(section);this.items.push(section);}
  }
  get current(){return this.items.find(item=>!item.retryBlocked&&(!item.retryAt||item.retryAt<=Date.now()));}
  fail(item,retryable=true){
    item.failures=(item.failures||0)+1;
    item.retryBlocked=!retryable||item.failures>2;
    item.retryAt=item.retryBlocked?0:Date.now()+(item.failures===1?3000:9000);
    item.status=item.retryBlocked?'Failed — retry needed':'Retry scheduled';
  }
  retryFailed(){for(const item of this.items){item.retryBlocked=false;item.retryAt=0;item.failures=0;}this.paused=false;}
  get retryDelay(){const times=this.items.filter(item=>!item.retryBlocked&&item.retryAt>Date.now()).map(item=>item.retryAt-Date.now());return times.length?Math.max(1,Math.min(...times)):null;}
  coverage(){
    const complete=s=>{
      if(s.duplicate)return complete(this.sections.find(x=>x.id===s.duplicate));
      if(['Assessed','Assessed in groups','No checkable claim detected'].includes(s.status))return true;
      const children=this.sections.filter(x=>x.parent===s.id);
      return children.length>0&&children.every(complete);
    };
    const originals=this.sections.filter(s=>!s.parent);
    return {total:originals.length,done:originals.filter(complete).length};
  }
  acknowledge(item=this.current){if(!item)return;this.items=this.items.filter(x=>x!==item);this.completed.add(item.key);}
  reset(){this.items=[];this.sections=[];this.completed.clear();this.paused=false;}
}
