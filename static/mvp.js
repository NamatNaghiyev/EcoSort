'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const names = {plastic:'Plastik',paper:'Kağız / karton',glass:'Şüşə',metal:'Metal',organic:'Üzvi tullantı'};
  const routes = {
    MANUAL_REVIEW:'Operator yoxlaması', CONVEYOR_PASS:'Konveyerdən keçid',
    FERROUS_SENSOR_CHECK:'Ferromaqnit sensor yoxlaması',
    GRIPPER_COORDINATE_REQUIRED:'ReflexGrip: koordinat gözlənilir',
    MANUAL_HANDLING:'Təhlükəsiz əl ilə ayırma'
  };
  const node = (tag, cls, content) => {const el=document.createElement(tag);if(cls)el.className=cls;if(content!==undefined)el.textContent=content;return el;};
  let mediaStream=null, running=false, cameraPending=false, cameraEpoch=0;
  const video=$('robot-video'), result=$('robot-decision');
  function log(text) {
    const list=$('robot-events');
    if(list.children.length===1 && list.firstChild.textContent==='Görüntü analizi başladılmayıb.') list.replaceChildren();
    list.prepend(node('li','',new Date().toLocaleTimeString('az-AZ')+' — '+text));
    while(list.children.length>12) list.lastChild.remove();
  }
  function cameraButtons(){ $('start-camera').disabled=Boolean(mediaStream)||running||cameraPending; $('capture-frame').disabled=!mediaStream||running; $('stop-camera').disabled=!mediaStream&&!cameraPending; }
  function cameraError(message) { $('camera-error').textContent=message;$('camera-error').hidden=false;$('camera-status').textContent='Xəta';log(message); }
  async function startCamera(){
    if(mediaStream||cameraPending)return;
    const epoch=++cameraEpoch;cameraPending=true;
    $('camera-error').hidden=true;
    if(!navigator.mediaDevices?.getUserMedia) {cameraPending=false;cameraError('Brauzer kamera API-sini dəstəkləmir. HTTPS/localhost istifadə edin.');return;}
    $('start-camera').disabled=true;$('camera-status').textContent='Qoşulur…';
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
      if(epoch!==cameraEpoch){stream.getTracks().forEach(track=>track.stop());return;}
      mediaStream=stream;video.srcObject=stream;await video.play();
      if(epoch!==cameraEpoch)return;
      video.classList.add('camera-on');$('camera-placeholder').hidden=true;
      $('camera-status').textContent='Canlı kamera';log('Kamera qoşuldu. Video lokal görüntülənir.');
      stream.getVideoTracks().forEach(track=>track.addEventListener('ended',stopCamera,{once:true}));
    }catch(error){if(epoch!==cameraEpoch)return;if(mediaStream)stopCamera();cameraError(error?.name==='NotAllowedError'?'Kamera icazəsi verilmədi. Brauzer ayarlarından icazə verin.':'Kamera açıla bilmədi. Başqa proqram kameranı istifadə edə bilər.');}
    if(epoch===cameraEpoch){cameraPending=false;cameraButtons();}
  }
  function stopCamera(){
    cameraEpoch++;cameraPending=false;
    if(mediaStream){mediaStream.getTracks().forEach(track=>track.stop());mediaStream=null;}
    video.pause();video.srcObject=null;video.classList.remove('camera-on');
    $('camera-placeholder').hidden=false;$('camera-status').textContent='Kamera bağlıdır';
    log('Kamera dayandırıldı.');cameraButtons();
  }
  const metric=(label,value)=>{const row=node('div','decision-metric');row.append(node('span','',label),node('strong','',value));return row;};
  function showDecision(data){
    result.replaceChildren();
    const review = data.low_confidence === true || data.accepted === false ||
      data.robot_plan?.code === 'MANUAL_REVIEW';
    const kind = names[data.label] || 'Naməlum kateqoriya';
    result.append(node('strong','',review?'Operator yoxlaması tələb olunur':kind),
      node('p','',review?(data.review_reason||'Avtomatik çeşidləmə üçün etibar kifayət etmir.'):('Model sinfi: '+data.label)));
    if (Array.isArray(data.frame_labels)) {
      result.append(metric('Üç kadrın nəticəsi',
        data.frame_labels.map(label=>names[label]||'Naməlum').join(' / ')));
      result.append(node('p','','Yalnız üç kadrın eyni nəticəyə gəlməsi kifayət deyil; etibar hədləri də yoxlanılır.'));
    }
    const conf=Number(data.confidence);
    result.append(metric('Orta model etibarı (kalibrasiya olunmayıb)',
      Number.isFinite(conf)?conf.toFixed(1)+'%':'—'));
    const plan=data.robot_plan;
    if(plan&&typeof plan.code==='string'){
      const label=node('span','decision-pill'+(plan.route==='review'?' review':''),routes[plan.code]||plan.code);
      const routeRow=node('div','decision-metric');
      routeRow.append(node('span','','Marşrut qərarı'),label);result.append(routeRow);
      result.append(node('p','',plan.reason||''),node('div','sim-warning',
        'SIMULYASİYA — Robot qoluna heç bir əmr göndərilməyib. Kamera kadrları bir-birindən asılı ola bilər. Koordinat və avadanlıq kalibrasiyası tamamlanmayıb.'));
      log('AI: '+(review?'Yoxlama tələb olunur':kind)+' ('+(Number.isFinite(conf)?conf.toFixed(1)+'%':'?')+
        '); plan: '+(routes[plan.code]||plan.code)+'; fiziki icra: YOX');
    }else{
      result.append(node('p','','Backend robot marşrut planı qaytarmadı. Fiziki icra mümkün deyil.'));
      log('AI təsnifatı alındı, lakin robot planı yoxdur.');
    }
  }
  async function capture(){
    if(!mediaStream||running||!video.videoWidth){cameraError('Kamera görüntüsü hazır deyil.');return;}
    running=true;cameraButtons();$('camera-error').hidden=true;
    $('decision-status').textContent='3 kadr yoxlanılır…';
    const epoch=cameraEpoch;
    let timeout;
    try{
      const form=new FormData();
      const canvas=document.createElement('canvas'),scale=Math.min(1,960/Math.max(video.videoWidth,video.videoHeight));
      canvas.width=Math.max(32,Math.round(video.videoWidth*scale));
      canvas.height=Math.max(32,Math.round(video.videoHeight*scale));
      const ctx=canvas.getContext('2d');
      if(!ctx)throw Error('Kamera kadrı hazırlana bilmədi.');
      for(let i=0;i<3;i++){
        if(epoch!==cameraEpoch||!mediaStream||!video.videoWidth)
          throw Error('Kamera dayandırıldı; analiz ləğv edildi.');
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        const blob=await new Promise((resolve,reject)=>
          canvas.toBlob(b=>b?resolve(b):reject(Error('Kadr hazırlana bilmədi.')),'image/jpeg',0.84));
        form.append('frames',blob,'camera-frame-'+(i+1)+'.jpg');
        if(i===1){
          $('robot-snapshot').src=canvas.toDataURL('image/jpeg',0.65);
          $('robot-snapshot').hidden=false;$('snapshot-placeholder').hidden=true;
        }
        if(i<2)await new Promise(resolve=>setTimeout(resolve,220));
      }
      if(epoch!==cameraEpoch)throw Error('Kamera dayandırıldı; analiz ləğv edildi.');
      const controller=new AbortController();timeout=setTimeout(()=>controller.abort(),150000);
      log('Üç kamera kadrı eyni sorğu ilə modelə göndərildi.');
      const response=await fetch('/api/predict-burst',{method:'POST',body:form,signal:controller.signal});
      const data=await response.json().catch(()=>({error:'Server JSON cavabı vermədi.'}));
      if(epoch!==cameraEpoch)throw Error('Kamera dayandırıldı; analiz ləğv edildi.');
      if(!response.ok||data.error)throw Error(data.error||'Analiz serveri cavab vermədi ('+response.status+').');
      if(typeof data.label!=='string'||data.frames_analyzed!==3)throw Error('Kamera analizinin cavabı düzgün deyil.');
      showDecision(data);
      $('decision-status').textContent=data.accepted?'Üç kadr uyğun gəldi':'Əl ilə yoxlama';
    }catch(error){
      $('decision-status').textContent='Analiz uğursuz';
      cameraError(error?.name==='AbortError'?'Analiz vaxtı bitdi; backend modelini yoxlayın.':error.message||'Analiz alınmadı.');
    }finally{clearTimeout(timeout);running=false;cameraButtons();}
  }
  $('start-camera').addEventListener('click',startCamera);
  $('stop-camera').addEventListener('click',stopCamera);
  $('capture-frame').addEventListener('click',capture);
  document.querySelectorAll('[data-view]').forEach(button=>{
    button.addEventListener('click',()=>{if(button.dataset.view==='map')requestAnimationFrame(ensureMap);});
  });
  document.addEventListener('ecosort:view',event=>{if(event.detail!=='robot'&&(mediaStream||cameraPending))stopCamera();});
  window.addEventListener('pagehide',stopCamera);

  // Map data is sourced only from OSM records and explicitly unverified local observations.
  const storageKey='ecosort-pilot-pins-v1';
  let map=null, pointsLayer=null, osmPoints=[], reportMode=false, selectedPoint=null, mapRequest=null, reloadTimer=0;
  let localPoints=[];
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');
    if(Array.isArray(saved))localPoints=saved.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.lat>=37.8&&p.lat<=42.2&&p.lon>=44.3&&p.lon<=51.2&&typeof p.name==='string').slice(0,100);
  }catch{/* local reports are optional; map still works */}
  function saveLocal(){
    try{localStorage.setItem(storageKey,JSON.stringify(localPoints));return true;}
    catch{return false;}
  }
  function mapMessage(message){$('map-status').textContent=message;}
  function ensureMap(){
    if($('map-view').hidden)return;
    if(typeof L==='undefined'){mapMessage('Xəritə kitabxanası yüklənmədi. İnternet bağlantısını yoxlayın.');return;}
    if(map){map.invalidateSize();return;}
    map=L.map('azerbaijan-map',{zoomControl:true,minZoom:6,maxZoom:18,maxBounds:[[37.7,44.1],[42.3,51.4]],maxBoundsViscosity:0.75}).setView([40.4,47.8],7);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
    pointsLayer=L.layerGroup().addTo(map);
    map.on('moveend',()=>{clearTimeout(reloadTimer);reloadTimer=setTimeout(loadOSM,350);});
    map.on('click',e=>{
      if(!reportMode)return;
      const {lat,lng}=e.latlng;selectedPoint={lat,lon:lng};
      $('bin-coordinates').textContent=lat.toFixed(6)+', '+lng.toFixed(6);
      $('bin-form').hidden=false;$('bin-description').focus();
      mapMessage('Pilot nöqtəsi seçildi. Məkanın təsvirini daxil edin.');
    });
    renderMarkers();mapMessage('İstənilən şəhəri küçə səviyyəsinə (12+) yaxınlaşdıraraq OSM nöqtələrini sorğulayın.');
  }
  function popupContent(point,local){
    const root=node('div');root.append(node('strong','',point.name||(point.kind==='waste_basket'?'Küçə zibil qabı':point.kind==='recycling'?'Təkrar emal məntəqəsi':'Tullantı konteyneri')));
    root.append(node('div','',local?'Mənbə: istifadəçi pilot qeydi — yoxlanmayıb':'Mənbə: OpenStreetMap — yerində yoxlanmayıb'));
    if(!local&&typeof point.osm_url==='string'&&point.osm_url.startsWith('https://www.openstreetmap.org/')){
      const link=node('a','', 'OSM qeydini aç ↗');link.href=point.osm_url;link.target='_blank';link.rel='noopener noreferrer';root.append(link);
    }
    return root;
  }
  function renderMarkers(){
    if(!pointsLayer)return;
    pointsLayer.clearLayers();
    const filter=$('map-filter').value;
    const seen=new Set();
    for(const p of osmPoints){
      if(filter!=='all'&&p.kind!==filter)continue;
      if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||seen.has(p.id))continue;seen.add(p.id);
      L.circleMarker([p.lat,p.lon],{radius:7,color:'#fff',weight:2,fillColor:'#2f7452',fillOpacity:0.95}).bindPopup(popupContent(p,false)).addTo(pointsLayer);
    }
    localPoints.forEach(p=>L.circleMarker([p.lat,p.lon],{radius:7,color:'#fff',weight:2,fillColor:'#d99e32',fillOpacity:0.96}).bindPopup(popupContent(p,true)).addTo(pointsLayer));
    $('map-counter').textContent=osmPoints.length+' OSM qeydi · '+localPoints.length+' lokal pilot qeydi';
  }
  async function loadOSM(){
    if(!map)return;
    if(map.getZoom()<12){if(mapRequest)mapRequest.abort();osmPoints=[];renderMarkers();mapMessage('Nöqtələr yalnız küçə səviyyəsində (zoom 12+) yüklənir; bütün ölkə üzrə tam siyahı mövcud deyil.');return;}
    const b=map.getBounds(),vals=[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()];
    if(vals[0]<37.8||vals[1]<44.3||vals[2]>42.2||vals[3]>51.2||vals[2]-vals[0]>.35||vals[3]-vals[1]>.35){
      osmPoints=[];renderMarkers();mapMessage('Azərbaycan daxilində daha kiçik əraziyə yaxınlaşdırın.');return;
    }
    if(mapRequest)mapRequest.abort();const controller=new AbortController();mapRequest=controller;
    mapMessage('OpenStreetMap konteyner qeydləri sorğulanır…');
    try{
      const response=await fetch('/api/containers?bbox='+vals.map(v=>v.toFixed(5)).join(','),{signal:controller.signal});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'Mənbədən məlumat alınmadı.');
      if(controller.signal.aborted)return;
      osmPoints=Array.isArray(data.points)?data.points:[];
      renderMarkers();
      mapMessage(osmPoints.length?osmPoints.length+' OSM xəritə qeydi tapıldı. Bu qeydlərin faktiki mövcudluğu yoxlanılmayıb.':'Bu ərazidə OSM konteyner qeydi tapılmadı. Bu, ərazidə konteyner yoxdur demək deyil. Pilot müşahidə əlavə edə bilərsiniz.');
    }catch(error){
      if(error.name==='AbortError')return;
      osmPoints=[];renderMarkers();mapMessage((error.message||'OSM məlumatı əlçatan deyil.')+' Xəritə fonu və lokal qeydlər işləməyə davam edir.');
    }
  }
  $('map-filter').addEventListener('change',renderMarkers);
  $('report-bin').addEventListener('click',()=>{
    ensureMap();if(!map)return;
    reportMode=!reportMode;selectedPoint=null;$('bin-form').hidden=true;
    $('report-bin').textContent=reportMode?'Nöqtə seçimini dayandır':'+ Pilot nöqtəsi qeyd et';
    map.getContainer().style.cursor=reportMode?'crosshair':'';
    mapMessage(reportMode?'Pilot nöqtəsi üçün xəritədə real gördüyünüz konteynerin yerinə klikləyin.':'Pilot nöqtəsi seçimi dayandırıldı.');
  });
  function cancelReport(){
    reportMode=false;selectedPoint=null;$('bin-form').hidden=true;$('report-bin').textContent='+ Pilot nöqtəsi qeyd et';
    if(map)map.getContainer().style.cursor='';
  }
  $('cancel-bin').addEventListener('click',cancelReport);
  $('bin-form').addEventListener('submit',event=>{
    event.preventDefault();const name=$('bin-description').value.trim();
    if(!selectedPoint||!name)return;
    localPoints.unshift({lat:selectedPoint.lat,lon:selectedPoint.lon,name:name.slice(0,100),kind:'local',created_at:new Date().toISOString()});
    localPoints=localPoints.slice(0,100);
    const saved=saveLocal();renderMarkers();cancelReport();$('bin-description').value='';
    mapMessage(saved?'Pilot qeyd saxlanıldı: yalnız bu brauzerdə və təsdiqsiz.':'Lokal yaddaşa yazılmadı. Qeyd yalnız bu səhifə açıq olduğu müddətdə görünür.');
  });
})();
