import {classifyWasteObject,NON_WASTE_CLASSES} from './waste-rules.js';
import {loadVisionModel} from './vision-client.js';
import {ObjectTracker,coverBox,iou} from './object-tracker.js';
import {grayFrame,trackRegion} from './visual-motion.js';
import {normalizeLiveTags} from './live-tags.js';
export class LiveARDetector{
 constructor({video,canvas,onDetect=()=>{},onStatus=()=>{},loadModel=loadVisionModel}){
  Object.assign(this,{video,canvas,onDetect,onStatus,loadModel});this.ctx=canvas.getContext('2d');this.tracker=new ObjectTracker();this.running=false;this.detecting=false;this.epoch=0;this.raf=0;
  this.input=document.createElement('canvas');this.inputCtx=this.input.getContext('2d');this.motion=document.createElement('canvas');this.motionCtx=this.motion.getContext('2d',{willReadFrequently:true});this.history=[];this.lastMotion=0;
  this.lastInference=-Infinity;this.lastDraw=0;this.windowStart=0;this.frames=0;this.fps=0;this.inferenceMs=0;this.signature='';this.nextDrawAt=0;this.checks=0;this.modelStatus='Loading waste detector…';
 }
 start(){if(this.running)return;this.running=true;const epoch=++this.epoch;this.history=[];this.lastMotion=0;this.lastInference=-Infinity;this.lastDraw=0;this.nextDrawAt=0;this.windowStart=0;this.frames=0;this.checks=0;
  this.modelStatus='Loading waste models · first download may take a moment';this.onStatus(this.modelStatus);
  this.loadModel().then(model=>{if(!this.running||epoch!==this.epoch)return;this.model=model;this.modelStatus='Ready';this.onStatus('Waste detector ready · tracking visible items');}).catch(e=>{if(this.running&&epoch===this.epoch){this.modelStatus='Tracking unavailable: '+e.message;this.onStatus(this.modelStatus);}});
  this.raf=requestAnimationFrame(t=>this.loop(t));
 }
 stop(){this.running=false;this.epoch++;cancelAnimationFrame(this.raf);this.tracker.clear();this.history=[];this.signature='';this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.onDetect([]);}
 loop(time){if(!this.running)return;
  if(time<this.nextDrawAt){this.raf=requestAnimationFrame(t=>this.loop(t));return;}if(time-this.nextDrawAt>100)this.nextDrawAt=time;this.nextDrawAt+=1000/60;
  if(!this.windowStart)this.windowStart=time;const dt=this.lastDraw?time-this.lastDraw:16.7;this.lastDraw=time;
  if(time-this.lastMotion>=50&&this.video.readyState>=2&&!this.video.paused){this.lastMotion=time;this.trackAppearance(time);}
  this.tracker.smooth(dt);this.render(time);this.frames++;
  if(time-this.windowStart>1000){this.fps=Math.round(this.frames*1000/(time-this.windowStart));this.frames=0;this.windowStart=time;this.onStatus('LIVE · '+this.fps+' display FPS · '+(this.inferenceMs?this.checks+' checks/s · '+(this.model?.coverage||'tracking'):this.modelStatus));this.checks=0;}
  if(this.model&&!this.detecting&&time-this.lastInference>Math.max(120,this.inferenceMs*.2)&&this.video.readyState>=2&&!this.video.paused){this.lastInference=time;this.detectFrame();}
  this.raf=requestAnimationFrame(t=>this.loop(t));
 }
 trackAppearance(now){
  const vw=this.video.videoWidth,vh=this.video.videoHeight;if(!vw||!vh)return;const scale=192/Math.max(vw,vh),w=Math.round(vw*scale),h=Math.round(vh*scale);
  if(this.motion.width!==w||this.motion.height!==h){this.motion.width=w;this.motion.height=h;this.history=[];}
  this.motionCtx.drawImage(this.video,0,0,w,h);const current=grayFrame(this.motionCtx.getImageData(0,0,w,h).data,w,h,now),previous=this.history.at(-1);
  if(previous)for(const t of this.tracker.visible(now).slice(0,30)){const b=t.target.map((n,i)=>n*(i%2===0?w/vw:h/vh)),result=trackRegion(previous,current,b);
   if(result?.box)this.tracker.move(t,result.box.map((n,i)=>n*(i%2===0?vw/w:vh/h)),now);else if(result?.lost)this.tracker.lose(t,now);
  }
  this.history.push(current);if(this.history.length>280)this.history.shift();
 }
 reference(){return {frame:this.history.at(-1),epoch:this.epoch,width:this.video.videoWidth,height:this.video.videoHeight};}
 // Replay bounded camera history so a delayed response never paints an old box
 // over an unrelated object after the camera has moved.
 project(bbox,reference,strict=false){
  if(!reference?.frame)return strict?null:bbox;const latest=this.history.at(-1);if(!latest||latest.time-reference.frame.time>14000||latest.width!==reference.frame.width||latest.height!==reference.frame.height)return strict?null:bbox;
  let box=bbox.map((n,i)=>n*(i%2===0?reference.frame.width/reference.width:reference.frame.height/reference.height)),previous=reference.frame;
  for(const frame of this.history){if(frame.time<=previous.time)continue;const result=trackRegion(previous,frame,box);if(result?.lost)return null;if(result?.box)box=result.box;previous=frame;}
  return box.map((n,i)=>n*(i%2===0?this.video.videoWidth/latest.width:this.video.videoHeight/latest.height));
 }
 addAssistedTags(objects,reference){if(!this.running||!reference||reference.epoch!==this.epoch)return;
  const tags=normalizeLiveTags(objects,reference.width,reference.height).map(d=>({...d,bbox:this.project(d.bbox,reference,true)})).filter(d=>d.bbox);
  if(tags.length)this.tracker.update(tags,performance.now(),{source:'gemini'});
 }
 async detectFrame(){if(this.detecting||!this.running)return;this.detecting=true;const epoch=this.epoch,start=performance.now(),reference=this.reference();
  try{const w=this.video.videoWidth,h=this.video.videoHeight;if(!w||!h)return;const scale=Math.min(1,640/Math.max(w,h));this.input.width=Math.round(w*scale);this.input.height=Math.round(h*scale);this.inputCtx.drawImage(this.video,0,0,this.input.width,this.input.height);
   const output=await this.model.detect(this.input);if(!this.running||epoch!==this.epoch)return;const detections=[];
   for(const p of output){const key=String(p.class||'').toLowerCase().trim(),info=classifyWasteObject(key);if(NON_WASTE_CLASSES.has(key)||!info.recognized||p.score<.18||!Array.isArray(p.bbox)||!p.bbox.every(Number.isFinite))continue;
    const raw=p.bbox.map((n,i)=>n*(i%2===0?w/this.input.width:h/this.input.height)),box=this.project(raw,reference);
    if(!box||box[2]<4||box[3]<4||box[2]*box[3]>w*h*1.05)continue;
    detections.push({key,info,bbox:box,score:p.score});
   }
   // A generic COCO bottle/cup must not duplicate a more specific litter box.
   const merged=detections.filter(d=>!['bottle','cup'].includes(d.key)||!detections.some(other=>other!==d&&!['bottle','cup'].includes(other.key)&&iou(d.bbox,other.bbox)>.25));
   this.inferenceMs=performance.now()-start;this.tracker.maxAge=Math.max(2600,Math.min(4500,this.inferenceMs*4));this.tracker.update(merged,performance.now());this.checks++;
  }catch(e){if(this.running&&epoch===this.epoch){this.modelStatus='Detection failed: '+e.message;this.onStatus(this.modelStatus);}}finally{this.detecting=false;}
 }
 render(now){const rect=this.canvas.parentElement.getBoundingClientRect(),w=rect.width,h=rect.height,dpr=Math.min(devicePixelRatio||1,2);if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}const ctx=this.ctx;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const visible=[];
  for(const track of this.tracker.visible(now)){const box=coverBox(track.box,this.video.videoWidth||1,this.video.videoHeight||1,w,h);if(box[0]+box[2]<0||box[1]+box[3]<0||box[0]>w||box[1]>h)continue;this.draw(track,box,w,h);visible.push({...track.info,id:track.id,score:track.score,uncertain:track.score<.55||track.semanticUncertain===true||track.info.uncertain===true,bbox:box});}
  const signature=visible.map(t=>t.id+':'+t.label+':'+t.uncertain).join('|');if(signature!==this.signature){this.signature=signature;this.onDetect(visible);}
 }
 draw(track,[x,y,w,h],viewWidth,viewHeight){const ctx=this.ctx,info=track.info,uncertain=track.score<.55||track.semanticUncertain||info.uncertain;ctx.strokeStyle=info.color;ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);const isWet=info.category==='WET'||info.category==='Wet / Biodegradable Waste'||info.dustbin==='Biodegradable';const displayBin=isWet?'Wet Waste · Green Bin':info.dustbin;const title=(uncertain?'Possible ':'')+info.label,subtitle=uncertain?'Verify · '+displayBin:displayBin;ctx.font='600 12px system-ui';const width=Math.min(viewWidth-12,Math.max(ctx.measureText(title).width,ctx.measureText(subtitle).width)+20),height=42;const px=Math.max(6,Math.min(viewWidth-width-6,x+w/2-width/2)),py=Math.max(48,Math.min(viewHeight-height-6,y-height-5));ctx.fillStyle='#12221fee';ctx.beginPath();ctx.roundRect(px,py,width,height,7);ctx.fill();ctx.fillStyle=info.color;ctx.fillRect(px,py,3,height);ctx.fillStyle='#fff';ctx.fillText(title,px+9,py+16,width-15);ctx.fillStyle=info.color;ctx.font='600 11px system-ui';ctx.fillText(subtitle,px+9,py+32,width-15);}
}
