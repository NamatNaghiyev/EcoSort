'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const categories = {
    plastic: {name:'Plastik',icon:'♳',description:'Model şəkli plastik kateqoriyasına aid edir.',tip:'Qablaşdırmanı boşaldın. Yerli qəbul qaydalarını yoxlayaraq uyğun plastik toplama qutusuna yerləşdirin.'},
    paper: {name:'Kağız / karton',icon:'▤',description:'Model şəkli kağız və ya karton kateqoriyasına aid edir.',tip:'Təmiz və quru saxlayın, kartonu qatlayın. Yağlı və qida ilə çirklənmiş hissələri ayırın.'},
    metal: {name:'Metal',icon:'▱',description:'Model şəkli metal kateqoriyasına aid edir.',tip:'Qabları boşaldın və yerli metal toplama məntəqəsinə verin. Təzyiqli qabları deşməyin.'},
    glass: {name:'Şüşə',icon:'♧',description:'Model şəkli şüşə kateqoriyasına aid edir.',tip:'Qabı boşaldın. Keramika, güzgü və istiliyədavamlı şüşəni qablaşdırma şüşəsindən ayrı saxlayın.'},
    organic: {name:'Üzvi tullantı',icon:'♧',description:'Model şəkli üzvi tullantı kateqoriyasına aid edir.',tip:'Qida və bitki qalıqlarını uyğun üzvi tullantı toplama axınına yönəldin. Kompost qaydalarını yoxlayın.'},
    unknown: {name:'Digər / naməlum',icon:'?',description:'Kateqoriya müəyyən deyil.',tip:'Avtomatik çeşidləməyin. Daha aydın şəkil çəkin və materialı əl ilə yoxlayın.'}
  };
  const modelLabels = ['plastic','paper','metal','glass','organic'];
  const storageKey = 'ecosort-analyses-v1';
  let records = [], selectedFile = null, selectedImage = '', busy = false, selectionVersion = 0;
  const element = (tag, className, text) => {const el=document.createElement(tag); if(className)el.className=className; if(text!==undefined)el.textContent=text; return el;};
  const category = label => categories[label] || categories.unknown;
  const confidence = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  const percent = value => confidence(value) === null ? '—' : `${value.toLocaleString('az-AZ',{maximumFractionDigits:1})}%`;
  function badge(label){const info=category(label), node=element('span','category-label');const icon=element('span','category-icon',info.icon);icon.setAttribute('aria-hidden','true');node.append(icon,document.createTextNode(info.name));return node;}
  function storageWarning(message){$('storage-note').textContent=message;$('storage-note').hidden=false;}
  try {const saved=JSON.parse(localStorage.getItem(storageKey)||'[]'); if(Array.isArray(saved)) records=saved.filter(r=>r && typeof r.id==='string' && typeof r.label==='string' && Number.isFinite(Date.parse(r.createdAt)) && typeof r.thumbnail==='string' && r.thumbnail.startsWith('data:image/jpeg;base64,')).slice(0,50);} catch {storageWarning('Brauzer yaddaşını oxumaq mümkün olmadı. Analiz işləyir, tarixçə isə bu sessiya ilə məhdudlaşa bilər.');}
  function saveRecord(record){records.unshift(record);records=records.slice(0,50);try{localStorage.setItem(storageKey,JSON.stringify(records));}catch{storageWarning('Tarixçə yaddaşa yazılmadı. Bu sessiyanın nəticələri açıq səhifədə görünür, lakin yeniləndikdə itə bilər.');} renderHistory();renderStats();}
  function navigate(view){document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`${view}-view`);document.querySelectorAll('.nav').forEach(el=>{const active=el.dataset.view===view;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});$('breadcrumb').textContent={robot:'Robot & kamera',map:'Azərbaycan xəritəsi',analysis:'Yeni analiz',history:'Analiz tarixçəsi',stats:'Statistika'}[view];if(view==='history')renderHistory();if(view==='stats')renderStats();}
  document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.view)));
  function clearResult(){$('result-content').replaceChildren();$('result-content').hidden=true;$('result-empty').hidden=false;$('result-status').textContent='Gözlənilir';}
  function clearSelection(){selectionVersion++;selectedFile=null;selectedImage='';$('file-input').value='';$('camera-input').value='';$('preview-img').removeAttribute('src');$('preview-box').hidden=true;$('drop-zone').hidden=false;$('analyze').disabled=true;$('status').textContent='Şəkil gözlənilir';$('error').hidden=true;clearResult();}
  $('new-analysis').addEventListener('click',()=>{if(busy)return;clearSelection();navigate('analysis');$('choose-file').focus();});
  $('remove-file').addEventListener('click',clearSelection);
  $('choose-file').addEventListener('click',()=>$('file-input').click());
  $('change-file').addEventListener('click',()=>$('file-input').click());
  $('camera-button').addEventListener('click',()=>$('camera-input').click());
  function showError(message){$('error').textContent=message;$('error').hidden=false;$('status').textContent='Xəta';}
  async function selectFile(file){
    if(busy||!file)return;
    clearSelection();const version=selectionVersion;
    if(!/\.(jpe?g|png|webp)$/i.test(file.name)|| (file.type && !['image/jpeg','image/png','image/webp'].includes(file.type))){showError('Yalnız JPG, PNG və WebP faylları qəbul edilir.');return;}
    if(file.size>3.5*1024*1024||file.size===0){showError('Fayl boş olmamalı və 3.5 MB-dan böyük olmamalıdır.');return;}
    $('status').textContent='Şəkil yüklənir…';
    const url=URL.createObjectURL(file);
    try{const img=new Image();img.src=url;await img.decode();if(version!==selectionVersion)return;
      if(img.naturalWidth<32||img.naturalHeight<32)throw Error('Şəkil ən azı 32 × 32 piksel olmalıdır.');
      if(img.naturalWidth*img.naturalHeight>25000000)throw Error('Şəkil həddindən artıq böyükdür. 25 meqapikseldən kiçik şəkil seçin.');
      const canvas=document.createElement('canvas'), scale=Math.min(1,900/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      selectedImage=canvas.toDataURL('image/jpeg',.8);selectedFile=file;
      $('preview-img').src=selectedImage;$('file-name').textContent=file.name;$('file-size').textContent=`${(file.size/1024/1024).toFixed(2)} MB · ${img.naturalWidth} × ${img.naturalHeight} px`;
      $('drop-zone').hidden=true;$('preview-box').hidden=false;$('analyze').disabled=false;$('status').textContent='Analizə hazırdır';
    }catch(err){if(version===selectionVersion)showError(err.message.startsWith('Şəkil')?err.message:'Şəkil oxunmur. Başqa JPG, PNG və ya WebP seçin.');}finally{URL.revokeObjectURL(url);}
  }
  ['file-input','camera-input'].forEach(id=>$(id).addEventListener('change',event=>selectFile(event.target.files[0])));
  ['dragover','dragenter'].forEach(type=>$('drop-zone').addEventListener(type,event=>{event.preventDefault();if(!busy)$('drop-zone').classList.add('dragover');}));
  ['dragleave','drop'].forEach(type=>$('drop-zone').addEventListener(type,event=>{event.preventDefault();$('drop-zone').classList.remove('dragover');}));
  $('drop-zone').addEventListener('drop',event=>{if(event.dataTransfer.files.length!==1){showError('Hər analiz üçün bir şəkil seçin.');return;}selectFile(event.dataTransfer.files[0]);});
  function setBusy(value){busy=value;['analyze','choose-file','change-file','remove-file','camera-button','new-analysis'].forEach(id=>$(id).disabled=value);$('analyze').disabled=value||!selectedFile;$('analyze').textContent=value?'Analiz edilir…':'Analiz et →';$('result-panel').setAttribute('aria-busy',String(value));}
  function renderResult(data){
    const root=$('result-content');root.replaceChildren();root.hidden=false;$('result-empty').hidden=true;$('result-status').textContent='Tamamlandı';
    const info=category(data.label),head=element('div','result-category');head.append(element('span','category-icon',info.icon));const title=element('div');title.append(element('p','eyebrow','MÜƏYYƏN EDİLƏN KATEQORİYA'),element('h3','',info.name));head.append(title);root.append(head);
    const c=confidence(data.confidence);
    if(c!==null){const row=element('div','confidence-row');row.append(element('span','','Modelin etibar göstəricisi'),element('strong','',percent(c)));const meter=element('div','meter'),fill=element('div','meter-fill');fill.style.width=`${c}%`;meter.append(fill);root.append(row,meter,element('p','confidence-note','Bu göstərici nəticənin düzgünlük zəmanəti deyil.'));if(c<50)root.append(element('p','warning','Nəticə qeyri-müəyyəndir. Obyekti daha yaxın, aydın fonda çəkin və yenidən yoxlayın.'));}
    if(!modelLabels.includes(data.label))root.append(element('p','warning','Bu nəticə dəstəklənən kateqoriyalardan birinə uyğun gəlmir. Əl ilə yoxlayın.'));
    const recommendation=element('div','recommendation');recommendation.append(element('h4','','Çeşidləmə tövsiyəsi'),element('p','',info.description+' '+info.tip));root.append(recommendation);
    const alternatives=Array.isArray(data.top_results)?data.top_results.filter(item=>item&&typeof item.label==='string'&&confidence(item.confidence)!==null):[];
    if(alternatives.length){const list=element('div','alternatives');list.append(element('h4','','Modelin qaytardığı ehtimallar'));alternatives.forEach(item=>{const row=element('div','alternative');row.append(badge(item.label),element('span','',percent(item.confidence)));list.append(row);});root.append(list);}
    const historyButton=element('button','text-button','Tarixçəyə bax ↗');historyButton.addEventListener('click',()=>navigate('history'));root.append(historyButton);
  }
  $('analyze').addEventListener('click',async()=>{
    if(!selectedFile||busy)return;clearResult();$('error').hidden=true;setBusy(true);$('status').textContent='Şəkil göndərilir…';$('result-status').textContent='Analiz edilir';
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),180000);
    try{const form=new FormData();const suffix=selectedFile.name.split('.').pop().toLowerCase();form.append('image',selectedFile,`ecosort-${crypto.randomUUID()}.${suffix}`);$('status').textContent='Analiz edilir…';
      const response=await fetch('/api/predict',{method:'POST',body:form,signal:controller.signal});
      if(!response.ok){if(response.status===413)throw Error('Server faylı qəbul etmədi: ölçü limitini yoxlayın.');if(response.status>=500)throw Error('Analiz xidməti hazırda cavab verə bilmir. Bir az sonra yenidən sınayın.');let payload;try{payload=await response.json();}catch{}throw Error(payload?.error||'Şəkil qəbul edilmədi. Başqa şəkillə sınayın.');}
      const data=await response.json();if(!data||typeof data.label!=='string'||!data.label.trim()||data.error)throw Error('Server etibarlı analiz nəticəsi qaytarmadı.');
      renderResult(data);$('status').textContent='Tamamlandı';
      const img=$('preview-img'),canvas=document.createElement('canvas');const scale=Math.min(1,160/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      saveRecord({id:crypto.randomUUID(),label:data.label,confidence:confidence(data.confidence),top_results:Array.isArray(data.top_results)?data.top_results:[],createdAt:new Date().toISOString(),thumbnail:canvas.toDataURL('image/jpeg',.65),filename:selectedFile.name});
    }catch(err){$('result-status').textContent='Xəta';showError(err.name==='AbortError'?'Analiz üçün gözləmə vaxtı bitdi. Yenidən sınayın.':err instanceof TypeError?'Serverə qoşulmaq mümkün olmadı. İnternet bağlantısını yoxlayın.':err.message);}finally{clearTimeout(timeout);setBusy(false);}
  });
  const dateKey=value=>{const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  function renderHistory(){
    $('history-count').textContent=records.length;
    const label=$('category-filter').value,from=$('date-from').value,to=$('date-to').value;
    const filtered=records.filter(r=>(!label||(label==='unknown'?!modelLabels.includes(r.label):r.label===label))&&(!from||dateKey(r.createdAt)>=from)&&(!to||dateKey(r.createdAt)<=to));
    $('history-body').replaceChildren();$('history-empty').hidden=filtered.length>0;$('history-table-wrap').hidden=filtered.length===0;
    $('history-empty').textContent=records.length?'Seçilmiş filtrlərə uyğun analiz tapılmadı.':'Hələ analiz yoxdur. İlk şəklinizi analiz edərək başlayın.';
    filtered.forEach(record=>{const row=element('tr'),imageCell=element('td'),img=element('img','thumb');img.src=record.thumbnail;img.alt=record.filename||'Analiz şəkli';imageCell.append(img);const catCell=element('td');catCell.append(badge(record.label));const action=element('td'),button=element('button','text-button','Nəticəyə bax →');button.addEventListener('click',()=>{if(busy)return;clearSelection();navigate('analysis');$('preview-img').src=record.thumbnail;$('preview-box').hidden=false;$('drop-zone').hidden=true;$('file-name').textContent=record.filename||'Saxlanmış analiz';$('file-size').textContent='Tarixçədəki kiçik önizləmə';$('status').textContent='Saxlanmış nəticə';renderResult(record);$('result-heading').setAttribute('tabindex','-1');$('result-heading').focus();});action.append(button);row.append(imageCell,catCell,element('td','',percent(record.confidence)),element('td','',new Date(record.createdAt).toLocaleString('az-AZ',{dateStyle:'short',timeStyle:'short'})),action);$('history-body').append(row);});
  }
  function renderStats(){const counts=Object.fromEntries([...modelLabels,'unknown'].map(label=>[label,0]));records.forEach(r=>counts[modelLabels.includes(r.label)?r.label:'unknown']++);$('stats-total').textContent=`${records.length} analiz`;$('stats-empty').hidden=records.length>0;$('chart').hidden=records.length===0;$('chart').replaceChildren();const max=Math.max(1,...Object.values(counts));$('chart').setAttribute('aria-label',Object.entries(counts).map(([label,count])=>`${category(label).name}: ${count}`).join('; '));Object.entries(counts).forEach(([label,count])=>{const col=element('div','chart-column'),bar=element('div','chart-bar');bar.style.height=`${count/max*190}px`;col.append(element('span','chart-number',String(count)),bar,element('span','chart-name',category(label).name));$('chart').append(col);});}
  [...modelLabels,'unknown'].forEach(label=>{const option=element('option','',category(label).name);option.value=label;$('category-filter').append(option);});
  modelLabels.forEach(label=>$('category-list').append(badge(label)));
  ['category-filter','date-from','date-to'].forEach(id=>$(id).addEventListener('change',renderHistory));
  $('reset-filters').addEventListener('click',()=>{['category-filter','date-from','date-to'].forEach(id=>$(id).value='');renderHistory();});
  renderHistory();renderStats();
})();
