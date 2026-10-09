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
      faces.push({points,depth:depths.reduce((a,b)=>a+b,0)/3,color});
    }
    return faces.sort((a,b)=>b.depth-a.depth);
  }
  root.parseOBJ = parseOBJ;
  root.projectTriangles = projectTriangles;
  if (typeof module !== 'undefined') module.exports = {parseOBJ,projectTriangles};
})(typeof window !== 'undefined' ? window : globalThis);
