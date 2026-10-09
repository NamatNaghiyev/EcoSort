'use strict';
/* Model-independent detection policy. COCO-SSD classes are not waste-material classes.
   This only screens known non-waste objects; it cannot validate unknowns. */
(function(root, factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.EcoSortCameraGuardCore=api;
})(typeof globalThis!=='undefined'?globalThis:this, function(){
  const forbidden=new Set([
    'cell phone','laptop','tv','keyboard','mouse','remote','person',
    'tablet','monitor','book','clock','chair','couch','bed','dining table',
    'backpack','handbag','suitcase','teddy bear','refrigerator','microwave',
    'oven','toaster','sink','toilet'
  ]);
  const wasteCandidates=new Set([
    'bottle','cup','wine glass','banana','apple','orange','carrot',
    'broccoli','sandwich','pizza','donut','cake'
  ]);
  const localName={
    'cell phone':'telefon','laptop':'noutbuk','tv':'ekran/televizor',
    'keyboard':'klaviatura','mouse':'kompüter siçanı','remote':'pult',
    'person':'insan','book':'kitab','chair':'stul','backpack':'çanta',
    'handbag':'çanta','bottle':'qab','cup':'stəkan','wine glass':'şüşə stəkan'
  };
  function intersection(box,region){
    const x=Math.max(0,Math.min(box.x+box.w,region.x+region.w)-Math.max(box.x,region.x));
    const y=Math.max(0,Math.min(box.y+box.h,region.y+region.h)-Math.max(box.y,region.y));
    return x*y;
  }
  function parseRegion(roi,width,height){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
      throw Error('Invalid frame size.');
    const r=roi||{x:0,y:0,w:1,h:1};
    for(const k of ['x','y','w','h'])if(!Number.isFinite(r[k]))throw Error('Invalid crop.');
    if(r.w<=0||r.h<=0||r.x<0||r.y<0||r.x+r.w>1.001||r.y+r.h>1.001)
      throw Error('Invalid crop bounds.');
    return {x:r.x*width,y:r.y*height,w:r.w*width,h:r.h*height};
  }
  function screen(detections,width,height,roi=null){
    const region=parseRegion(roi,width,height);
    if(!Array.isArray(detections))throw Error('Invalid detections.');
    const blocked=[],candidates=[];
    for(const detection of detections){
      if(!detection||!Array.isArray(detection.bbox)||detection.bbox.length!==4)
        continue;
      const box={x:Number(detection.bbox[0]),y:Number(detection.bbox[1]),
        w:Number(detection.bbox[2]),h:Number(detection.bbox[3])};
      const score=Number(detection.score);
      const category=String(detection.class||'').toLowerCase();
      if(![...Object.values(box),score].every(Number.isFinite)||box.w<=0||box.h<=0)continue;
      if(score<0.45)continue;
      const overlap=intersection(box,region);
      const boxRatio=overlap/(box.w*box.h);
      const regionRatio=overlap/(region.w*region.h);
      if(boxRatio<0.15&&regionRatio<0.025)continue;
      if(forbidden.has(category)&&score>=0.50){
        blocked.push({category,score,area:overlap});
      }else if(wasteCandidates.has(category)&&score>=0.55&&regionRatio>=0.02){
        candidates.push({category,score,area:overlap,
          box:{x:box.x/width,y:box.y/height,w:box.w/width,h:box.h/height}});
      }
    }
    blocked.sort((a,b)=>b.score-a.score);
    candidates.sort((a,b)=>b.area-a.area);
    return {
      blocked:blocked.length>0,
      blocking_objects:blocked.map(x=>({label:x.category,score:Math.round(x.score*100)})),
      message:blocked.length?('Kamerada tullantı olmayan obyekt aşkarlandı: '+
        (localName[blocked[0].category]||blocked[0].category)+
        '. Avtomatik çeşidləmə dayandırılıb.') : null,
      suggested_box:candidates.length===1?candidates[0].box:null,
      detected_waste_candidates:candidates.map(x=>x.category),
      checked:true,
      ood_certified:false
    };
  }
  return {screen,parseRegion};
});
