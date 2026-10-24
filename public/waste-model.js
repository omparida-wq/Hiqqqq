// Published Trash AI YOLOv5/TACO graph, pinned to an upstream revision (MIT).
export const MODEL_REVISION='a11de7cb60bfb21399f64c57e48384a61a5044f7';
const BASE='/vision/model/';
let pending;
const scripts=new Map();
function loadScript(src){if(scripts.has(src))return scripts.get(src);const p=new Promise((resolve,reject)=>{if(typeof document==='undefined'&&typeof importScripts==='function'){try{importScripts(src);resolve();}catch(e){reject(e);}return;}const s=document.createElement('script');s.src=src;s.crossOrigin='anonymous';s.onload=resolve;s.onerror=()=>{s.remove();scripts.delete(src);reject(Error('Could not download the local detector. Check your connection and retry.'));};document.head.appendChild(s);});scripts.set(src,p);return p;}
export async function loadWasteModel({household:includeHousehold=true}={}){if(pending)return pending;pending=(async()=>{
 const scope=typeof window==='undefined'?globalThis:window;
 if(!scope.tf)await loadScript('/vision/tf.min.js');const tf=scope.tf;try{await tf.setBackend('webgl');}catch{await tf.setBackend('cpu');}await tf.ready();
 const labelsResponse=await fetch(BASE+'name_map.json');if(!labelsResponse.ok)throw Error('Waste labels could not be downloaded.');const labels=await labelsResponse.json();
 const model=await tf.loadGraphModel(BASE+'model.json');
 let household=null,householdError='',cycle=0;
 // The supplemental COCO model adds produce and generic containers. It cannot
 // infer whether intact food is being discarded, or a generic bottle's material.
 if(includeHousehold&&(typeof document!=='undefined'||typeof importScripts==='function'))loadScript('/vision/coco-ssd.min.js').then(()=>scope.cocoSsd.load({base:'lite_mobilenet_v2',modelUrl:'/vision/household/model.json'})).then(m=>household=m).catch(()=>{householdError='Household supplement unavailable';});
 const foods=new Set(['banana','apple','orange','broccoli','carrot','sandwich','pizza','hot dog','donut','cake']),householdItems=new Set(['bottle','cup','laptop','cell phone','mouse','keyboard']);
 return {name:'Litter + household detectors',get coverage(){return household?'Litter + household models ready':householdError||'Loading household supplement…';},async detect(canvas){
 const householdPromise=(household?household.detect(canvas,30,.40).then(list=>{const res=[];for(const p of list)if(foods.has(p.class)||householdItems.has(p.class))res.push({...p,uncertain:!['laptop','cell phone'].includes(p.class)});return res;}).catch(()=>{householdError='Household supplement unavailable';household=null;return [];}):Promise.resolve([]));
 const input=tf.tidy(()=>tf.image.resizeBilinear(tf.browser.fromPixels(canvas),[640,640]).div(255).expandDims(0));let outputs;
 try{outputs=await model.executeAsync(input,['Identity','Identity_1','Identity_2','Identity_3']);const [boxes,scores,classes,count]=await Promise.all(outputs.map(t=>t.data()));const results=[];for(let i=0;i<Math.min(count[0],scores.length);i++){if(scores[i]<.18)continue;const [x1,y1,x2,y2]=boxes.slice(i*4,i*4+4);results.push({class:labels[Math.round(classes[i])]||'',score:scores[i],bbox:[x1*canvas.width,y1*canvas.height,(x2-x1)*canvas.width,(y2-y1)*canvas.height]});}
 for(const h of await householdPromise)results.push(h);
 return results;}finally{input.dispose();if(outputs)tf.dispose(outputs);}
 }};
 })().catch(e=>{pending=null;throw e;});return pending;}
