(async function() {
  'use strict';
  const canvas=document.getElementById('scene'), status=document.getElementById('status');
  try {
    const gl=canvas.getContext('webgl',{antialias:true,alpha:false});
    const ctx=gl ? null : canvas.getContext('2d');
    if (!gl && !ctx) throw new Error('Brauzer model görünüşünü dəstəkləmir');
    let program,pLoc,vLoc;
    function shader(type, source) {
      const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error('3D görünüş hazırlana bilmədi');
      return s;
    }
    if(gl) {
    program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,`
      attribute vec3 position;attribute vec3 normal;attribute vec3 color;
      uniform mat4 projection;uniform mat4 view;varying vec3 vColor;varying vec3 vNormal;
      void main(){gl_Position=projection*view*vec4(position,1.0);vColor=color;vNormal=normal;}
    `));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
      precision mediump float;varying vec3 vColor;varying vec3 vNormal;
      void main(){float light=0.45+0.55*abs(dot(normalize(vNormal),normalize(vec3(-0.4,-0.7,1.0))));gl_FragColor=vec4(vColor*light,1.0);}
    `));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('3D görünüş hazırlana bilmədi');
    gl.useProgram(program);
    }
    const response=await fetch('EcoSort_Assembly.obj');
    if(!response.ok) throw new Error('Model faylı yüklənmədi');
    const data=new Float32Array(parseOBJ(await response.text()));
    if(gl) {
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    ['position','normal','color'].forEach((name,i)=>{const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,36,i*12);});
    gl.enable(gl.DEPTH_TEST);gl.clearColor(.96,.97,.95,1);
    pLoc=gl.getUniformLocation(program,'projection');vLoc=gl.getUniformLocation(program,'view');
    }
    let yaw=-.85,pitch=.65,distance=3.4;
    const sub=(a,b)=>a.map((n,i)=>n-b[i]),dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
    const norm=a=>{const l=Math.hypot(...a);return a.map(n=>n/l);};
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    function draw() {
      const rect=canvas.getBoundingClientRect();if(!rect.width || !rect.height) return;
      const dpr=ctx ? Math.min(1,900/rect.width) : Math.min(devicePixelRatio||1,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
      if(ctx) {
        const faces=projectTriangles(data,yaw,pitch,distance,canvas.width,canvas.height);
        const frame=ctx.createImageData(canvas.width,canvas.height);
        frame.data.set(rasterize(faces,canvas.width,canvas.height));ctx.putImageData(frame,0,0);
        return;
      }
      gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const f=1/Math.tan(Math.PI/8),a=canvas.width/canvas.height,n=.05,far=30;
      gl.uniformMatrix4fv(pLoc,false,new Float32Array([f/a,0,0,0,0,f,0,0,0,0,(far+n)/(n-far),-1,0,0,2*far*n/(n-far),0]));
      const eye=[distance*Math.cos(pitch)*Math.cos(yaw),distance*Math.cos(pitch)*Math.sin(yaw),distance*Math.sin(pitch)];
      const z=norm(eye),x=norm(cross([0,0,1],z)),y=cross(z,x);
      gl.uniformMatrix4fv(vLoc,false,new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]));
      gl.drawArrays(gl.TRIANGLES,0,data.length/9);
    }
    function zoom(factor){distance=Math.max(1.5,Math.min(9,distance*factor));draw();}
    function rotate(dx,dy){yaw-=dx*.008;pitch=Math.max(-1.3,Math.min(1.3,pitch+dy*.008));draw();}
    const pointers=new Map();
    canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);});
    canvas.addEventListener('pointermove',e=>{
      if(!pointers.has(e.pointerId))return;
      const old=pointers.get(e.pointerId),next=[e.clientX,e.clientY];
      if(pointers.size===2){const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)[1];const before=Math.hypot(...sub(old,other)),after=Math.hypot(...sub(next,other));if(after>0)zoom(before/after);}
      else rotate(next[0]-old[0],next[1]-old[1]);
      pointers.set(e.pointerId,next);
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,e=>pointers.delete(e.pointerId)));
    canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(Math.max(-100,Math.min(100,e.deltaY))*.003));},{passive:false});
    canvas.addEventListener('keydown',e=>{
      const actions={ArrowLeft:()=>rotate(-10,0),ArrowRight:()=>rotate(10,0),ArrowUp:()=>rotate(0,-10),ArrowDown:()=>rotate(0,10),'+':()=>zoom(.9),'=':()=>zoom(.9),'-':()=>zoom(1.1)};
      if(actions[e.key]){e.preventDefault();actions[e.key]();}
    });
    document.getElementById('zoom-in').onclick=()=>zoom(.85);
    document.getElementById('zoom-out').onclick=()=>zoom(1/.85);
    document.getElementById('reset').onclick=()=>{yaw=-.85;pitch=.65;distance=3.4;draw();};
    const fullscreenButton=document.getElementById('fullscreen');
    fullscreenButton.onclick=async()=>{
      try{
        if(document.fullscreenElement) await document.exitFullscreen();
        else await document.body.requestFullscreen();
      }catch(_error){
        status.textContent='Tam ekran rejimi brauzer tərəfindən məhdudlaşdırılıb.';
      }
    };
    document.addEventListener('fullscreenchange',()=>{
      fullscreenButton.textContent=document.fullscreenElement?'Tam ekrandan çıx ⛶':'Tam ekran ⛶';
      requestAnimationFrame(draw);
    });
    new ResizeObserver(draw).observe(canvas);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)draw();});
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();status.textContent='3D bağlantısı kəsildi. Səhifəni yeniləyin.';});
    status.textContent='EcoSort × ReflexGrip · 3D quruluş';draw();
  } catch(error) {
    status.textContent=error.message+' — modeli ayrıca yükləyə bilərsiniz.';
    const link=document.createElement('a');link.href='EcoSort_Assembly.obj';link.textContent='OBJ faylını yüklə';link.download='EcoSort_Assembly.obj';document.querySelector('.bar').append(link);
  }
})();
