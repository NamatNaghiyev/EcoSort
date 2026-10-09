'use strict';
/* Client-side pretrained COCO-SSD object screening.
   No Vercel/Python changes or silent pass-through when unavailable. */
(function(root){
  const tfjs='https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
  const coco='https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';
  let pending=null;
  function loadScript(url){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=url;script.async=true;script.crossOrigin='anonymous';
      let done=false;
      const timer=setTimeout(()=>finish(Error('Detektorun yüklənmə vaxtı bitdi.')),25000);
      function finish(error){
        if(done)return;done=true;clearTimeout(timer);
        if(error){script.remove();reject(error);}else resolve();
      }
      script.onload=()=>finish();
      script.onerror=()=>finish(Error('Detektorun kitabxanası yüklənmədi.'));
      document.head.appendChild(script);
    });
  }
  async function load(){
    if(!pending)pending=(async()=>{
      if(!root.tf)await loadScript(tfjs);
      if(!root.cocoSsd)await loadScript(coco);
      if(!root.cocoSsd||!root.EcoSortCameraGuardCore)
        throw Error('Kamera obyekt detektoru hazır deyil.');
      return root.cocoSsd.load({base:'lite_mobilenet_v2'});
    })().catch(error=>{pending=null;throw error;});
    return pending;
  }
  async function inspect(canvas,region){
    if(!canvas||!canvas.width||!canvas.height)throw Error('Kadr təqdim edilməyib.');
    const model=await load();
    const detections=await model.detect(canvas,20,0.45);
    return root.EcoSortCameraGuardCore.screen(detections,canvas.width,canvas.height,region);
  }
  root.EcoSortCameraGuard={inspect,load};
})(typeof globalThis!=='undefined'?globalThis:this);
