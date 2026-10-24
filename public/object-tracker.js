export function iou(a,b){const w=Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0])),h=Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));return w*h/(a[2]*a[3]+b[2]*b[3]-w*h||1);}
export function coverBox(box,sourceWidth,sourceHeight,width,height){const scale=Math.max(width/sourceWidth,height/sourceHeight);return [box[0]*scale+(width-sourceWidth*scale)/2,box[1]*scale+(height-sourceHeight*scale)/2,box[2]*scale,box[3]*scale];}
export class ObjectTracker{
 constructor(){this.tracks=[];this.nextId=1;this.maxAge=2600;}
 update(detections,now,{source='local'}={}){
  detections=[...detections].sort((a,b)=>b.score-a.score).slice(0,30);
  this.tracks=this.tracks.filter(t=>now-t.lastSeen<(t.source==='gemini'?30000:12000));
  const matched=new Set(),used=new Set(),pairs=[];
  for(let d=0;d<detections.length;d++)for(const t of this.tracks){
   if(t.lost)continue;
   const p=detections[d],b=p.bbox,overlap=iou(t.target,b),same=t.key===p.key||t.info.family&&t.info.family===p.info.family;
   const distance=Math.hypot(t.target[0]+t.target[2]/2-b[0]-b[2]/2,t.target[1]+t.target[3]/2-b[1]-b[3]/2);
   if((same&&(overlap>.08||distance<Math.min(t.target[2],t.target[3],b[2],b[3])*.85))||overlap>.58)pairs.push({d,t,cost:1-overlap+distance/Math.max(b[2],b[3],1)*.15+(same?0:.25)});
  }
  for(const p of pairs.sort((a,b)=>a.cost-b.cost)){
   if(used.has(p.d)||matched.has(p.t.id))continue;
   const d=detections[p.d],t=p.t;
   const preserveRefinement=source==='local'&&t.source==='gemini'&&['banana','apple','orange','broccoli','carrot','bottle','cup','cardboard','other plastic','food waste','unlabeled litter','other carton'].includes(d.key);
   if(preserveRefinement){t.candidate=null;}
   else if(d.key!==t.key&&d.info.label!==t.info.label){
    t.candidate=t.candidate?.key===d.key?{...t.candidate,hits:t.candidate.hits+1}:{key:d.key,hits:1};
    if((t.candidate.hits>=3&&d.score>=.5)||source==='gemini'){t.key=d.key;t.info=d.info;t.candidate=null;}
   }else{t.info=d.info;t.candidate=null;}
   Object.assign(t,{target:[...d.bbox],score:t.score*.65+d.score*.35,lastSeen:now,visible:true,lost:false,misses:0,hits:t.hits+1,source:source==='gemini'?'gemini':t.source});
   if(source==='gemini'){t.lastSemantic=now;t.semanticUncertain=d.score<.55;}
   used.add(p.d);matched.add(t.id);
  }
  detections.forEach((d,index)=>{if(used.has(index)||d.score<.30||this.visible(now).length>=30)return;
   if(this.tracks.some(t=>!t.lost&&iou(t.target,d.bbox)>.72))return;
   const t={id:this.nextId++,key:d.key,info:d.info,score:d.score,box:[...d.bbox],target:[...d.bbox],lastSeen:now,lastSemantic:source==='gemini'?now:0,semanticUncertain:source==='gemini'&&d.score<.55,lastVisual:-Infinity,hits:1,misses:0,visible:true,lost:false,source};this.tracks.push(t);matched.add(t.id);
  });
  for(const t of this.tracks)if(!matched.has(t.id)&&t.source===source)t.misses++;
  return this.visible(now);
 }
 visible(now){return this.tracks.filter(t=>!t.lost&&t.visible&&(now-t.lastSeen<this.maxAge||now-t.lastVisual<350&&now-t.lastSeen<(t.source==='gemini'?30000:12000))&&(t.misses<3||now-t.lastSeen<1000||now-t.lastVisual<350));}
 move(t,bbox,now){t.target=bbox;t.lastVisual=now;t.visualMisses=0;}
 lose(t,now){t.visualMisses=(t.visualMisses||0)+1;if(t.visualMisses>=3&&now-(Number.isFinite(t.lastVisual)?t.lastVisual:t.lastSeen)>250)t.lost=true;}
 smooth(dt=16.7){const alpha=1-Math.exp(-Math.min(dt,100)/65);for(const t of this.tracks)for(let i=0;i<4;i++)t.box[i]+=(t.target[i]-t.box[i])*alpha;}
 clear(){this.tracks=[];}
}
