export class ResearchQueue {
  items=[];
  completed=new Set();
  paused=false;
  sections=[];
  enqueue(text, speaker='') {
    const pieces=[];
    let rest=text.trim();
    while(rest.length){
      let end=Math.min(rest.length,1200);
      if(end<rest.length){const sentence=[...rest.slice(0,end).matchAll(/[.!?][\s]+/g)].at(-1);const boundary=sentence?sentence.index+sentence[0].length:rest.lastIndexOf(' ',end);if(boundary>0)end=boundary;}
      pieces.push(rest.slice(0,end));rest=rest.slice(end).trimStart();
    }
    for(const part of pieces){
      const key=JSON.stringify([speaker,part.replace(/\s+/g,' ').trim()]);
      const original=this.sections.find(x=>x.key===key&&!x.duplicate);
      const context=this.sections.filter(s=>!s.duplicate&&!s.parent).at(-1)?.text.slice(-600)||'';
      const section={id:this.sections.length+1,text:part,speaker,key,context,status:'Waiting',createdAt:new Date().toISOString()};
      if(original){section.duplicate=original.id;section.status='Repeated section';this.sections.push(section);}
      else{this.sections.push(section);this.items.push(section);}
    }
  }
  enqueueClaims(text,speaker,claims,parent){
    for(let i=0;i<claims.length;i+=3){const selectedClaims=claims.slice(i,i+3);const section={id:this.sections.length+1,text,speaker,selectedClaims,parent,context:this.sections.find(s=>s.id===parent)?.context||'',key:JSON.stringify([speaker,text,selectedClaims]),status:'Waiting',createdAt:new Date().toISOString()};this.sections.push(section);this.items.push(section);}
  }
  get current(){return this.items[0];}
  acknowledge(){const item=this.items.shift();if(item)this.completed.add(item.key);}
  reset(){this.items=[];this.sections=[];this.completed.clear();this.paused=false;}
}
