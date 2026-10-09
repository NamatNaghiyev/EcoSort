(function(root) {
  'use strict';
  function parseOBJ(text) {
    const vertices = [], faces = [], output = [];
    const colors = {dark:[.16,.19,.19], steel:[.58,.65,.66], green:[.16,.40,.28], orange:[.82,.45,.18], blue:[.25,.45,.61], white:[.85,.86,.82], red:[.7,.24,.2], yellow:[.8,.65,.25],brown:[.49,.32,.19],pcb:[.12,.33,.22]};
    let color = colors.steel;
    for (const line of text.split('\n')) {
      const p = line.trim().split(/\s+/);
      if (p[0] === 'v') vertices.push(p.slice(1,4).map(Number));
      if (p[0] === 'usemtl') color = colors[p[1]] || colors.green;
      if (p[0] === 'f') {
        const indices = p.slice(1).map(s => { const i = Number(s.split('/')[0]); return i < 0 ? vertices.length + i : i - 1; });
        for (let i = 1; i < indices.length - 1; i++) faces.push({indices:[indices[0],indices[i],indices[i+1]],color});
      }
    }
    if (!vertices.length || !faces.length) throw new Error('Modeldə həndəsə yoxdur');
    const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
    vertices.forEach(v => v.forEach((n,i)=>{min[i]=Math.min(min[i],n);max[i]=Math.max(max[i],n);}));
    const center=min.map((n,i)=>(n+max[i])/2), scale=2/Math.max(...max.map((n,i)=>n-min[i]));
    for (const face of faces) {
      const [a,b,c]=face.indices.map(i=>vertices[i]);
      if (!a || !b || !c) throw new Error('Yanlış səth indeksi');
      const u=b.map((n,i)=>n-a[i]),v=c.map((n,i)=>n-a[i]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const length=Math.hypot(...normal)||1;
      for (const vertex of [a,b,c]) output.push(...vertex.map((n,i)=>(n-center[i])*scale),...normal.map(n=>n/length),...face.color);
    }
    if (!output.every(Number.isFinite)) throw new Error('Modeldə etibarsız koordinat var');
    return output;
  }
  function projectTriangles(data, yaw, pitch, distance, width, height) {
    const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
    const z=[Math.cos(pitch)*Math.cos(yaw),Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch)];
    const x=[-Math.sin(yaw),Math.cos(yaw),0];
    const y=[-Math.sin(pitch)*Math.cos(yaw),-Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch)];
    const f=height/(2*Math.tan(Math.PI/8)), faces=[];
    for(let i=0;i<data.length;i+=27) {
      const points=[],depths=[];
      for(let k=0;k<3;k++){
        const vertex=Array.from(data.slice(i+k*9,i+k*9+3)),depth=distance-dot(vertex,z);
        depths.push(depth);points.push([width/2+f*dot(vertex,x)/depth,height/2-f*dot(vertex,y)/depth]);
      }
      if(depths.some(d=>d<.05)) continue;
      const normal=Array.from(data.slice(i+3,i+6)),light=.45+.55*Math.abs(dot(normal,[-.3114,-.5449,.7785]));
      const color=Array.from(data.slice(i+6,i+9)).map(n=>Math.round(n*light*255));
      faces.push({points,depths,depth:depths.reduce((a,b)=>a+b,0)/3,color});
    }
    return faces.sort((a,b)=>b.depth-a.depth);
  }
  function rasterize(faces,width,height) {
    const pixels=new Uint8ClampedArray(width*height*4),buffer=new Float32Array(width*height);
    for(let i=0;i<pixels.length;i+=4){pixels[i]=12;pixels[i+1]=21;pixels[i+2]=17;pixels[i+3]=255;}
    for(const face of faces) {
      const [[ax,ay],[bx,by],[cx,cy]]=face.points;
      const den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
      if(Math.abs(den)<1e-8)continue;
      const x0=Math.max(0,Math.floor(Math.min(ax,bx,cx))),x1=Math.min(width-1,Math.ceil(Math.max(ax,bx,cx)));
      const y0=Math.max(0,Math.floor(Math.min(ay,by,cy))),y1=Math.min(height-1,Math.ceil(Math.max(ay,by,cy)));
      const inv=face.depths.map(d=>1/d);
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
        const u=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/den;
        const v=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/den,w=1-u-v;
        if(u<0 || v<0 || w<0)continue;
        const depth=u*inv[0]+v*inv[1]+w*inv[2],index=y*width+x;
        if(depth<=buffer[index])continue;
        buffer[index]=depth;
        const p=index*4;pixels[p]=face.color[0];pixels[p+1]=face.color[1];pixels[p+2]=face.color[2];
      }
    }
    return pixels;
  }
  root.rasterize = rasterize;
  root.parseOBJ = parseOBJ;
  root.projectTriangles = projectTriangles;
  if (typeof module !== 'undefined') module.exports = {parseOBJ,projectTriangles,rasterize};
})(typeof window !== 'undefined' ? window : globalThis);
