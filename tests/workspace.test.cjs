const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {execFileSync}=require('node:child_process');const {JSDOM}=require('jsdom');
const html=execFileSync('.venv/bin/python',['-c','from app import app; print(app.test_client().get("/").get_data(as_text=True))'],{encoding:'utf8'});
const flush=()=>new Promise(r=>setImmediate(r));
function setup(){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost:5000'}),w=dom.window;
 const commands=[];w.URL.createObjectURL=blob=>{commands.push(blob);return 'blob:test';};w.URL.revokeObjectURL=()=>{};
 const context=new Proxy({}, {get:(t,k)=>t[k]??(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
 w.HTMLCanvasElement.prototype.getContext=()=>context;w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,AA==';w.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new w.Blob(['frame'],{type:'image/jpeg'}));};
 w.HTMLMediaElement.prototype.load=function(){};w.document.getElementById('video-preview').srcObject=null;w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.play=async function(){};w.HTMLAnchorElement.prototype.click=function(){};
 w.fetch=async()=>({ok:true,json:async()=>({label:'plastic',confidence:92,top_results:[{label:'plastic',confidence:92},{label:'glass',confidence:5},{label:'paper',confidence:3}],model_version:'test'})});
 for(const name of ['suite-core.js','workspace.js','suite.js','mvp.js'])w.eval(fs.readFileSync('static/'+name,'utf8'));
 return {dom,w,$:id=>w.document.getElementById(id),commands};
}
test('pending camera stream is stopped when user navigates before permission resolves',async()=>{
 const {dom,w,$}=setup();let resolve;let stopped=0;Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:()=>new Promise(r=>resolve=r)}});
 w.EcoSortWorkspace.navigate('video');const start=$('camera-start').onclick();w.EcoSortWorkspace.navigate('impact');resolve({getTracks:()=>[{stop:()=>stopped++}]});await start;
 assert.equal(stopped,1);assert.equal($('video-preview').srcObject,null);dom.window.close();
});
test('crop mode has visible cancellation and export controls',()=>{
 const {dom,w,$}=setup();w.EcoSortWorkspace.navigate('video');$('tab-crops').onclick();for(const id of ['media-cancel','video-export']){assert.equal($(id).closest('[hidden]'),null,id);}dom.window.close();
});
test('human correction reaches media card, robot and export evidence',async()=>{
 const {dom,w,$,commands}=setup();w.EcoSortWorkspace.navigate('video');const v=$('video-preview');for(const [key,value]of Object.entries({videoWidth:224,videoHeight:224,duration:2,readyState:2}))Object.defineProperty(v,key,{value,configurable:true});v.currentTime=0;$('video-count').value='1';
 await $('video-analyze').onclick();const original=w.EcoSortWorkspace.records()[0];assert.ok(original);w.EcoSortWorkspace.correct(original.id,'glass');
 $('media-results').querySelector('button').click();assert.match($('decision-panel').textContent,/Şüşə/);assert.match($('media-results').textContent,/Şüşə/);
 $('video-export').onclick();const blob=commands.at(-1),reader=new w.FileReader();const text=await new Promise(resolve=>{reader.onload=()=>resolve(reader.result);reader.readAsText(blob);});const record=JSON.parse(text).records[0];assert.equal(record.label,'glass');assert.equal(record.originalLabel,'plastic');assert.equal(record.top_results[0].label,'plastic');dom.window.close();
});
test('history CSV includes original top result evidence',async()=>{
 const {dom,w,$,commands}=setup();w.EcoSortWorkspace.saveRecord({id:'test',label:'glass',confidence:70,top_results:[{label:'glass',confidence:70},{label:'plastic',confidence:20}],createdAt:new Date().toISOString(),thumbnail:'data:image/jpeg;base64,AA=='});w.EcoSortWorkspace.correct('test','paper');$('history-csv').onclick();const reader=new w.FileReader();const text=await new Promise(resolve=>{reader.onload=()=>resolve(reader.result);reader.readAsText(commands.at(-1));});assert.match(text,/top_results/);assert.match(text,/plastic/);assert.match(text,/70/);dom.window.close();
});

test('robot camera permission cannot activate camera after navigation',async()=>{
 const {dom,w,$}=setup();let resolve,stopped=0;Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:()=>new Promise(r=>resolve=r)}});$('start-camera').click();w.EcoSortWorkspace.navigate('impact');resolve({getTracks:()=>[{stop:()=>stopped++}],getVideoTracks:()=>[]});await flush();assert.equal(stopped,1);assert.equal($('robot-video').srcObject,null);dom.window.close();
});
