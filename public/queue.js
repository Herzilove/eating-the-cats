export class ResearchQueue {
  items=[];
  completed=new Set();
  paused=false;
  enqueue(text, speaker='') {
    const pieces=[];
    let rest=text.trim();
    while(rest.length){
      let end=Math.min(rest.length,6000);
      if(end<rest.length){const boundary=rest.lastIndexOf(' ',end);if(boundary>3000)end=boundary;}
      pieces.push(rest.slice(0,end));rest=rest.slice(end).trimStart();
    }
    for(const part of pieces){
      const key=JSON.stringify([speaker,part.replace(/\s+/g,' ').trim()]);
      if(!this.completed.has(key)&&!this.items.some(x=>x.key===key))this.items.push({text:part,speaker,key});
    }
  }
  get current(){return this.items[0];}
  acknowledge(){const item=this.items.shift();if(item)this.completed.add(item.key);}
  reset(){this.items=[];this.completed.clear();this.paused=false;}
}
