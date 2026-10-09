/* Pure, testable demo rules. No sensors or hardware control. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EcoSortCore=api;})(typeof globalThis==='object'?globalThis:this,()=>{
 'use strict';
 const names={plastic:'Plastik',paper:'Kağız / karton',glass:'Şüşə',metal:'Metal',organic:'Üzvi axın',unknown:'Əl ilə yoxlama'};
 const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
 const targets={grip:'ReflexGrip',magnet:'Maqnit',bypass:'Düz axın',review:'Əl ilə yoxlama'};
 function decide(record,metalKind='unknown',scenario=false){
  const label=record?.label;let action='review',reason='Nəticə qeyri-müəyyəndir; operator yoxlaması lazımdır.';
  const validLabel=Object.hasOwn(names,label)&&label!=='unknown';
  const top=Array.isArray(record?.top_results)?record.top_results.filter(x=>x&&Object.hasOwn(names,x.label)&&finite(x.confidence,0,100)).slice().sort((a,b)=>b.confidence-a.confidence):[];
  const margin=top.length>=2?top[0].confidence-top[1].confidence:null;
  const operator=record?.corrected===true&&typeof record.correctedAt==='string'&&Number.isFinite(Date.parse(record.correctedAt));
  const reliable=finite(record?.confidence,75,100)&&top.length>=2&&top[0].label===label&&Math.abs(top[0].confidence-record.confidence)<.1&&margin>=15;
  if(validLabel&&(reliable||operator||scenario)){
   if(label==='metal'&&metalKind==='unknown'){reason='Ferromaqnitliyi təsdiqləyin. Şəkil bunu ölçmür.';}
   else {action=label==='organic'?'bypass':label==='metal'&&metalKind==='ferrous'?'magnet':'grip';reason=scenario?'Demo ssenarisi; AI proqnozu deyil.':operator?'Operatorun təsdiqlədiyi kateqoriya.':'Demo qərar hədləri keçilib; düzgünlük zəmanəti deyil.';}
  }
  return {action,target:targets[action],destination:action==='review'?names.unknown:names[label],reason,margin,source:scenario?'scenario':operator?'operator':'model'};
 }
 function correct(record,label,time){if(!Object.hasOwn(names,label)||!finite(Date.parse(time),0,Infinity))throw Error('Düzəliş məlumatı düzgün deyil.');return {...record,originalLabel:record.originalLabel||record.label,label,corrected:true,correctedAt:time};}
 function physics(p){
  const bounds={mass:[.001,20],friction:[.01,2],safety:[1,5],lever:[.01,2],maxForce:[.01,1000],speed:[.01,2],distance:[.01,10]};
  for(const [key,[min,max]] of Object.entries(bounds))if(!finite(p[key],min,max))throw Error('Fiziki parametr düzgün deyil: '+key);
  const requiredForce=p.mass*9.81*p.safety/(2*p.friction),torque=p.mass*9.81*p.lever*p.safety;
  return {requiredForce,torque,arrivalSeconds:p.distance/p.speed,canGrip:p.maxForce>=requiredForce,recoveryForce:requiredForce/.6,canRecover:p.maxForce>=requiredForce/.6};
 }
 function impact(p){
  if(!finite(p.mass,0,1e6)||!finite(p.accepted,0,100)||!finite(p.factor,-1000,1000)||!finite(p.extra,0,1e6))throw Error('Çəki, faiz və emissiya parametrlərini yoxlayın.');
  const factor=p.unit==='mt_per_short_ton'?p.factor*1000/907.18474:p.factor;
  const recovered=p.mass*p.accepted/100;return {recovered,factor,gross:recovered*factor,saving:recovered*factor-p.extra};
 }
 function rectangle(a,b){
  if(![a.x,a.y,b.x,b.y].every(v=>finite(v,0,1)))return null;
  const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Number(Math.abs(a.x-b.x).toFixed(6)),h=Number(Math.abs(a.y-b.y).toFixed(6));
  return w<.025||h<.025?null:{x,y,w,h};
 }
 function csvCell(v){let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
 return {names,decide,correct,physics,impact,rectangle,csvCell};
});
