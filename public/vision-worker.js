// Only still pixel buffers cross this worker boundary. Nothing is uploaded.
let model,canvas,context,busy=false;
(async()=>{try{
 if(typeof OffscreenCanvas==='undefined')throw Error('Offscreen camera processing is unavailable.');
 const {loadWasteModel}=await import('/waste-model.js');model=await loadWasteModel();
 self.postMessage({type:'ready',coverage:model.coverage});
}catch(e){self.postMessage({type:'error',error:e.message});}})();
self.onmessage=async({data})=>{
 if(data.type!=='detect'||!model||busy)return;busy=true;
 try{if(!canvas||canvas.width!==data.width||canvas.height!==data.height){canvas=new OffscreenCanvas(data.width,data.height);context=canvas.getContext('2d',{willReadFrequently:true});}
  context.putImageData(new ImageData(new Uint8ClampedArray(data.pixels),data.width,data.height),0,0);
  const results=await model.detect(canvas);self.postMessage({type:'result',id:data.id,results,coverage:model.coverage});
 }catch(e){self.postMessage({type:'error',id:data.id,error:e.message});}finally{busy=false;}
};
