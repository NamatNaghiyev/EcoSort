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
  let objectSelection=null, autoScanTimer=null, autoScanBusy=false;
  let stableTarget=null, stableFrames=0, autoCaptured=false, detectorReady=false;
  const video=$('robot-video'), result=$('robot-decision');
  const selectionLayer=$('camera-roi-layer'), selectionBox=$('camera-roi-box');
  const sceneMessage=$('camera-screening');
  function setSceneMessage(message){sceneMessage.textContent=message;}
  function bound(value){return Math.max(0,Math.min(1,value));}
  function videoGeometry(){
    const bounds=video.getBoundingClientRect(),w=video.videoWidth,h=video.videoHeight;
    if(!w||!h||!bounds.width||!bounds.height)return null;
    const scale=Math.min(bounds.width/w,bounds.height/h);
    return {bounds,x:(bounds.width-w*scale)/2,y:(bounds.height-h*scale)/2,w:w*scale,h:h*scale};
  }
  function drawSelection(){
    const g=videoGeometry(),r=objectSelection;
    selectionLayer.hidden=!r||!g;selectionBox.hidden=!r||!g;
    if(!r||!g)return;
    const pw=g.bounds.width,ph=g.bounds.height;
    selectionBox.style.left=(g.x+r.x*g.w)/pw*100+'%';
    selectionBox.style.top=(g.y+r.y*g.h)/ph*100+'%';
    selectionBox.style.width=r.w*g.w/pw*100+'%';
    selectionBox.style.height=r.h*g.h/ph*100+'%';
  }
  function setSelection(roi){objectSelection=roi;drawSelection();}
  function resetSelection(){setSelection(null);stableTarget=null;stableFrames=0;}
  window.addEventListener('resize',drawSelection);
  function log(text) {
    const list=$('robot-events');
    if(list.children.length===1 && list.firstChild.textContent==='Görüntü analizi başladılmayıb.') list.replaceChildren();
    list.prepend(node('li','',new Date().toLocaleTimeString('az-AZ')+' — '+text));
    while(list.children.length>12) list.lastChild.remove();
  }
  function cameraButtons(){
    $('start-camera').disabled=Boolean(mediaStream)||running||cameraPending;
    $('capture-frame').disabled=!mediaStream||running;
    $('stop-camera').disabled=!mediaStream&&!cameraPending;
  }
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
      autoCaptured=false;detectorReady=false;resetSelection();
      setSceneMessage('Kamera aktivdir. Obyekt avtomatik axtarılır…');
      if(window.EcoSortCameraGuard){
        window.EcoSortCameraGuard.load().then(()=>{
          if(!cameraActive(epoch))return;
          detectorReady=true;
          setSceneMessage('Obyekti kameranın mərkəzinə gətirin. Seçim avtomatik aparılır.');
          autoScanTimer=setInterval(()=>scanFrame(epoch),900);
          void scanFrame(epoch);
        }).catch(()=>{
          if(cameraActive(epoch))setSceneMessage('Avtomatik detektor yüklənmədi. “Analiz et” ilə material modelini ayrıca yoxlaya bilərsiniz.');
        });
      }else setSceneMessage('Detektor yoxdur. “Analiz et” ilə modelin təklifini görə bilərsiniz.');
      stream.getVideoTracks().forEach(track=>track.addEventListener('ended',stopCamera,{once:true}));
    }catch(error){if(epoch!==cameraEpoch)return;if(mediaStream)stopCamera();cameraError(error?.name==='NotAllowedError'?'Kamera icazəsi verilmədi. Brauzer ayarlarından icazə verin.':'Kamera açıla bilmədi. Başqa proqram kameranı istifadə edə bilər.');}
    if(epoch===cameraEpoch){cameraPending=false;cameraButtons();}
  }
  function stopCamera(){
    cameraEpoch++;cameraPending=false;detectorReady=false;
    if(autoScanTimer!==null){clearInterval(autoScanTimer);autoScanTimer=null;}
    if(mediaStream){mediaStream.getTracks().forEach(track=>track.stop());mediaStream=null;}
    video.pause();video.srcObject=null;video.classList.remove('camera-on');
    resetSelection();setSceneMessage('Kamera bağlıdır.');
    $('camera-placeholder').hidden=false;$('camera-status').textContent='Kamera bağlıdır';
    log('Kamera dayandırıldı.');cameraButtons();
  }
  const metric=(label,value)=>{const row=node('div','decision-metric');row.append(node('span','',label),node('strong','',value));return row;};
  function rejectScene(reason,detail){
    $('decision-status').textContent='Operator yoxlaması';
    result.replaceChildren();
    result.append(node('strong','','Naməlum / uyğun olmayan obyekt'),
      node('p','',reason),
      metric('Marşrut qərarı','Avtomatik çeşidləmə dayandırılıb'));
    if(detail)result.append(node('p','',detail));
    result.append(node('div','sim-warning',
      'Bu nəticə operator yoxlamasıdır. Material təsnifatı təsdiqlənməyib. Fiziki robot əmri göndərilmir.'));
    log('Kamera yoxlaması: '+reason);
  }
  function showDecision(data){
    result.replaceChildren();
    const review = data.low_confidence === true || data.accepted === false ||
      data.robot_plan?.code === 'MANUAL_REVIEW';
    const kind = names[data.label] || 'Naməlum kateqoriya';
    const proposal=names[data.suggested_label]||kind;
    result.append(node('strong','',review?('Model təklifi: '+proposal):kind),
      node('p','',review?(data.review_reason||'Modelin nəticəsi yoxlanmalıdır; avtomatik robot əmri verilmir.'):('Model sinfi: '+data.label)));
    if (review && data.suggested_label && names[data.suggested_label]) {
      result.append(metric('Modelin təsdiqlənməmiş təklifi',names[data.suggested_label]));
    }
    if (Array.isArray(data.frame_labels)) {
      result.append(metric('Üç kadrın nəticəsi',
        data.frame_labels.map(label=>names[label]||'Naməlum').join(' / ')));
    }
    if(data.screening_label){
      result.append(metric('Detektorda obyekt növü',data.screening_label));
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
        'SIMULYASİYA — Robot qoluna heç bir əmr göndərilməyib. Pretrained COCO-SSD yalnız müəyyən obyekt növlərini aşkarlayır; naməlum obyektləri tam əhatə etmir.'));
      log('AI: '+(review?'Yoxlama tələb olunur':kind)+' ('+(Number.isFinite(conf)?conf.toFixed(1)+'%':'?')+
        '); plan: '+(routes[plan.code]||plan.code)+'; fiziki icra: YOX');
    }else{
      result.append(node('p','','Backend robot marşrut planı qaytarmadı. Fiziki icra mümkün deyil.'));
      log('AI təsnifatı alındı, lakin robot planı yoxdur.');
    }
  }
  const allowedMaterials={
    'bottle':['plastic','glass','metal'],
    'cup':['plastic','glass','paper','metal'],
    'wine glass':['glass'],
    'banana':['organic'],'apple':['organic'],'orange':['organic'],
    'carrot':['organic'],'broccoli':['organic'],'sandwich':['organic'],
    'pizza':['organic'],'donut':['organic'],'cake':['organic']
  };
  function paddedBox(b){
    const x=bound(b.x-b.w*.1),y=bound(b.y-b.h*.1);
    const right=bound(b.x+b.w*1.1),bottom=bound(b.y+b.h*1.1);
    return {x,y,w:right-x,h:bottom-y};
  }
  function snapshotCanvas(roi){
    const r=roi||{x:0,y:0,w:1,h:1};
    const sw=Math.max(1,video.videoWidth*r.w),sh=Math.max(1,video.videoHeight*r.h);
    const scale=Math.min(1,960/Math.max(sw,sh));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(32,Math.round(sw*scale));
    canvas.height=Math.max(32,Math.round(sh*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('Kamera kadrı hazırlana bilmədi.');
    ctx.drawImage(video,video.videoWidth*r.x,video.videoHeight*r.y,sw,sh,0,0,canvas.width,canvas.height);
    return canvas;
  }
  function cameraActive(epoch){
    return epoch===cameraEpoch&&Boolean(mediaStream)&&Boolean(video.videoWidth);
  }
  // Observe the live camera without uploading the video stream.
  // Two successive detections of the same target are required before the
  // first automatic material analysis; manual re-analysis remains available.
  async function scanFrame(epoch){
    if(!cameraActive(epoch)||autoScanBusy||running||!detectorReady)return;
    autoScanBusy=true;
    try{
      const guard=window.EcoSortCameraGuard;
      const scan=await guard.inspect(snapshotCanvas(null));
      if(!cameraActive(epoch))return;
      if(scan.blocked){
        resetSelection();setSceneMessage(scan.message);return;
      }
      const target=scan.primary_target;
      if(!target||!scan.suggested_box){
        resetSelection();
        setSceneMessage('Tanınan obyekt görünmür. Kağız və karton kimi bəzi materiallar detektorda yoxdur; kadrı model ilə analiz etmək üçün “Analiz et” seçin.');
        return;
      }
      const roi=paddedBox(scan.suggested_box);
      setSelection(roi);
      const center={x:roi.x+roi.w/2,y:roi.y+roi.h/2};
      const steady=stableTarget&&stableTarget.label===target.label&&
        Math.hypot(stableTarget.x-center.x,stableTarget.y-center.y)<.14;
      stableFrames=steady?stableFrames+1:1;
      stableTarget={label:target.label,...center};
      setSceneMessage('Avtomatik seçildi: '+target.label+'. '+(autoCaptured?
        'Nəticəni yeniləmək üçün “Yenidən analiz et” düyməsini seçin.':
        'Görüntü sabitləşdikdə analiz başlayacaq.'));
      if(stableFrames>=2&&!autoCaptured){
        autoCaptured=true;
        void capture(scan,roi);
      }
    }catch(error){
      if(cameraActive(epoch))setSceneMessage('Avtomatik seçim mümkün olmadı. “Analiz et” düyməsi ilə model proqnozunu yoxlayın.');
    }finally{autoScanBusy=false;}
  }
  async function capture(autoScan=null,autoRoi=null){
    if(!mediaStream||running||!video.videoWidth){cameraError('Kamera görüntüsü hazır deyil.');return;}
    running=true;cameraButtons();$('camera-error').hidden=true;
    $('decision-status').textContent='Kadrlar analiz edilir…';
    const epoch=cameraEpoch;
    let timeout;
    try{
      const guard=window.EcoSortCameraGuard;
      const fullFrame=snapshotCanvas(null);
      $('robot-snapshot').src=fullFrame.toDataURL('image/jpeg',0.75);
      $('robot-snapshot').hidden=false;$('snapshot-placeholder').hidden=true;
      let scan=autoScan;
      if(!scan&&guard){
        try{scan=await guard.inspect(fullFrame);}
        catch(error){
          setSceneMessage('Detektor əlçatan deyil. Material proqnozu operator yoxlaması üçün göstəriləcək.');
        }
      }
      if(!cameraActive(epoch))throw Error('Kamera dayandırıldı; analiz ləğv edildi.');
      if(scan?.blocked){
        rejectScene(scan.message,'Obyekti kadra gətirərək yenidən yoxlayın.');
        setSceneMessage(scan.message);
        return;
      }
      const candidate=scan?.primary_target?.label||
        (scan?.detected_waste_candidates?.length===1?scan.detected_waste_candidates[0]:null);
      const roi=autoRoi||objectSelection||(scan?.suggested_box?paddedBox(scan.suggested_box):null);
      const needsManual=!candidate;
      setSceneMessage(candidate?('Obyekt seçildi: '+candidate+'. Material modeli işləyir…'):
        'Detektor obyekti tanımadı. Material modelinin təklifi ayrıca göstəriləcək.');
      const form=new FormData();
      for(let i=0;i<3;i++){
        if(!cameraActive(epoch))throw Error('Kamera dayandırıldı; analiz ləğv edildi.');
        const canvas=snapshotCanvas(roi);
        const blob=await new Promise((resolve,reject)=>
          canvas.toBlob(b=>b?resolve(b):reject(Error('Kadr hazırlana bilmədi.')),'image/jpeg',0.87));
        form.append('frames',blob,'camera-frame-'+(i+1)+'.jpg');
        if(i===1){
          $('robot-snapshot').src=canvas.toDataURL('image/jpeg',0.75);
          $('robot-snapshot').hidden=false;$('snapshot-placeholder').hidden=true;
        }
        if(i<2)await new Promise(resolve=>setTimeout(resolve,180));
      }
      if(!cameraActive(epoch))throw Error('Kamera dayandırıldı; analiz ləğv edildi.');
      const controller=new AbortController();timeout=setTimeout(()=>controller.abort(),150000);
      const response=await fetch('/api/predict-burst',{method:'POST',body:form,signal:controller.signal});
      const data=await response.json().catch(()=>({error:'Server JSON cavabı vermədi.'}));
      if(!cameraActive(epoch))throw Error('Kamera dayandırıldı; analiz ləğv edildi.');
      if(!response.ok||data.error)throw Error(data.error||'Analiz serveri cavab vermədi ('+response.status+').');
      if(typeof data.label!=='string'||data.frames_analyzed!==3)throw Error('Kamera analizinin cavabı düzgün deyil.');
      const materialMatches=candidate&&allowedMaterials[candidate]?.includes(data.suggested_label||data.label);
      if(needsManual||!materialMatches){
        const predicted=data.suggested_label||data.label;
        // Keep the actual model guess visible instead of replacing it with 'unknown'.
        data.suggested_label=predicted;
        data.accepted=false;data.low_confidence=true;
        data.review_reason=needsManual?
          'Obyekt növü detektorda təsdiqlənmədi; bu, modelin ilkin material təklifidir.':
          'Obyekt və material proqnozu bir-birini təsdiqləmir; nəticə yoxlanmalıdır.';
        data.robot_plan={code:'MANUAL_REVIEW',route:'review',reason:data.review_reason,
          mode:'simulation',hardware_command_sent:false,requires_confirmation:true,
          localization_available:false,calibrated_pick_coordinates:null};
        data.decision={action:'review',destination:'Operator yoxlaması',
          reason:data.review_reason,hardware_connected:false};
      }
      data.screening_label=candidate;
      showDecision(data);
      $('decision-status').textContent=data.accepted?'İlkin təsnifat — simulyasiya':'Model təklifi — yoxlanmalıdır';
      $('capture-frame').textContent='Yenidən analiz et →';
    }catch(error){
      $('decision-status').textContent='Analiz uğursuz';
      cameraError(error?.name==='AbortError'?'Analiz vaxtı bitdi; backend modelini yoxlayın.':error.message||'Analiz alınmadı.');
      // User may retry without restarting the camera.
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
