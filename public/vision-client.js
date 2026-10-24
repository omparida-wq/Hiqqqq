import {loadWasteModel} from './waste-model.js';
let pending;
export function loadVisionModel(){
 if(pending)return pending;
 pending=(async()=>{
  if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined')return loadWasteModel();
  const worker=new Worker('/vision-worker.js');let id=0,coverage='Loading household supplement…',fallback=null;const requests=new Map();
  const ready=new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Waste model download timed out.')),90000);
   worker.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timeout);coverage=data.coverage;resolve();return;}
    if(data.type==='result'){coverage=data.coverage;const request=requests.get(data.id);if(request){clearTimeout(request.timer);requests.delete(data.id);request.resolve(data.results);}return;}
    if(data.type==='error'){const request=requests.get(data.id);if(request){clearTimeout(request.timer);requests.delete(data.id);request.reject(Error(data.error));}else{clearTimeout(timeout);reject(Error(data.error));}}
   };
   worker.onerror=()=>{clearTimeout(timeout);reject(Error('Background detector unavailable.'));for(const r of requests.values()){clearTimeout(r.timer);r.reject(Error('Background detector stopped.'));}requests.clear();};
  });
  try{await ready;}catch{worker.terminate();return loadWasteModel();}
  return {get coverage(){return fallback?'Compatibility detector':coverage;},async detect(canvas){
   if(fallback)return (await fallback).detect(canvas);
   try{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,requestId=++id;
    const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(requestId);reject(Error('Background detection timed out.'));},30000);requests.set(requestId,{resolve,reject,timer});});
    worker.postMessage({type:'detect',id:requestId,width:canvas.width,height:canvas.height,pixels:pixels.buffer},[pixels.buffer]);return await result;
   }catch{worker.terminate();fallback=loadWasteModel();return (await fallback).detect(canvas);}
  }};
 })().catch(e=>{pending=null;throw e;});return pending;
}
