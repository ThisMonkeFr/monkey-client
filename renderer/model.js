const MonkeyModel = (() => {
  const box=(cx,cy,cz,w,h,d,f)=>({c:[cx,cy,cz], s:[w,h,d], f});
  const FACES = {
    front : {n:[0,0,1],  o:[-.5, .5, .5], du:[1,0,0],  dv:[0,-1,0]},
    back  : {n:[0,0,-1], o:[ .5, .5,-.5], du:[-1,0,0], dv:[0,-1,0]},
    right : {n:[-1,0,0], o:[-.5, .5,-.5], du:[0,0,1],  dv:[0,-1,0]},
    left  : {n:[1,0,0],  o:[ .5, .5, .5], du:[0,0,-1], dv:[0,-1,0]},
    top   : {n:[0,1,0],  o:[-.5, .5,-.5], du:[1,0,0],  dv:[0,0,1]},
    bottom: {n:[0,-1,0], o:[-.5,-.5, .5], du:[1,0,0],  dv:[0,0,-1]}
  };
  function skinParts(slim, layer){
    const aw = slim?3:4, o = layer==='overlay', P=[];
    P.push(box(0,28,0,8,8,8, o
      ? {top:[40,0,8,8],bottom:[48,0,8,8],right:[32,8,8,8],front:[40,8,8,8],left:[48,8,8,8],back:[56,8,8,8]}
      : {top:[8,0,8,8],bottom:[16,0,8,8],right:[0,8,8,8],front:[8,8,8,8],left:[16,8,8,8],back:[24,8,8,8]}));
    P.push(box(0,18,0,8,12,4, o
      ? {top:[20,32,8,4],bottom:[28,32,8,4],right:[16,36,4,12],front:[20,36,8,12],left:[28,36,4,12],back:[32,36,8,12]}
      : {top:[20,16,8,4],bottom:[28,16,8,4],right:[16,20,4,12],front:[20,20,8,12],left:[28,20,4,12],back:[32,20,8,12]}));
    const armPivot=24, legPivot=12;
    P.push(box(-(4+aw/2),18,0,aw,12,4, o
      ? {top:[44,32,aw,4],bottom:[44+aw,32,aw,4],right:[40,36,4,12],front:[44,36,aw,12],left:[44+aw,36,4,12],back:[48+aw,36,aw,12]}
      : {top:[44,16,aw,4],bottom:[44+aw,16,aw,4],right:[40,20,4,12],front:[44,20,aw,12],left:[44+aw,20,4,12],back:[48+aw,20,aw,12]}));
    P.push(box(4+aw/2,18,0,aw,12,4, o
      ? {top:[52,48,aw,4],bottom:[52+aw,48,aw,4],right:[48,52,4,12],front:[52,52,aw,12],left:[52+aw,52,4,12],back:[56+aw,52,aw,12]}
      : {top:[36,48,aw,4],bottom:[36+aw,48,aw,4],right:[32,52,4,12],front:[36,52,aw,12],left:[36+aw,52,4,12],back:[40+aw,52,aw,12]}));
    P.push(box(-2,6,0,4,12,4, o
      ? {top:[4,32,4,4],bottom:[8,32,4,4],right:[0,36,4,12],front:[4,36,4,12],left:[8,36,4,12],back:[12,36,4,12]}
      : {top:[4,16,4,4],bottom:[8,16,4,4],right:[0,20,4,12],front:[4,20,4,12],left:[8,20,4,12],back:[12,20,4,12]}));
    P.push(box(2,6,0,4,12,4, o
      ? {top:[4,48,4,4],bottom:[8,48,4,4],right:[0,52,4,12],front:[4,52,4,12],left:[8,52,4,12],back:[12,52,4,12]}
      : {top:[20,48,4,4],bottom:[24,48,4,4],right:[16,52,4,12],front:[20,52,4,12],left:[24,52,4,12],back:[28,52,4,12]}));
    P[2].pivot=[0,armPivot,0]; P[2].limb='armR';
    P[3].pivot=[0,armPivot,0]; P[3].limb='armL';
    P[4].pivot=[0,legPivot,0]; P[4].limb='legR';
    P[5].pivot=[0,legPivot,0]; P[5].limb='legL';
    if(o) P.forEach((b,i)=>b.s=b.s.map(v=>v+(i===0?1:0.5)));
    return P;
  }
  /* Worn cape: a panel behind the torso, tilted out slightly like in game. */
  const wornCape = (time=0,walking=0) => {const cape=box(0,16,-3.1,10,16,1,
    {top:[1,0,10,1],bottom:[11,0,10,1],right:[0,1,1,16],front:[12,1,10,16],
     left:[11,1,1,16],back:[1,1,10,16]});
     cape.pivot=[0,24,-3.1];cape.angle=.12+Math.sin(time*1.5)*.025+Math.min(.6,Math.abs(walking)*.8);return [cape];};
  const capeParts = () => [box(0,16,0,10,16,1,
    {top:[1,0,10,1],bottom:[11,0,10,1],right:[0,1,1,16],front:[12,1,10,16],left:[11,1,1,16],back:[1,1,10,16]})];

  function rot(p,yaw,pitch){
    const [x,y,z]=p, cy=Math.cos(yaw), sy=Math.sin(yaw), cp=Math.cos(pitch), sp=Math.sin(pitch);
    const x1=x*cy+z*sy, z1=-x*sy+z*cy;
    return [x1, y*cp-z1*sp, y*sp+z1*cp];
  }
  /* Centre the model first, THEN rotate. Rotating about the feet is what made
     the figure fan out into a cone. Camera distance is fixed in model units so
     perspective stays gentle at any zoom. */
  function project(p,o,W,H){
    const cy=(o.centreY??17);
    const [x,y,z]=rot([p[0], p[1]-cy, p[2]], o.yaw, o.pitch);
    const D=110, k=D/(D-z), s=o.zoom;
    return [W/2 + x*k*s, H/2 - (y+(o.bob||0))*k*s, z];
  }
  /* Limb swing: rotate a part about its pivot before projection. */
  function swing(p, pivot, a){
    if(!a) return p;
    const dy=p[1]-pivot[1], dz=p[2]-pivot[2], c=Math.cos(a), sn=Math.sin(a);
    return [p[0], pivot[1]+dy*c-dz*sn, pivot[2]+dy*sn+dz*c];
  }

  /* One quad per texture pixel, sorted back to front. Returned so callers can
     hit-test a click straight back to a texel. */
  function build(tex, o, W, H){
    const parts = o.parts ? o.parts
      : o.kind==='cape' ? capeParts() : skinParts(o.slim, o.layer||'base');
    const under = (!o.parts && o.kind!=='cape' && o.layer==='overlay') ? skinParts(o.slim,'base') : [];
    const showOuter = (!o.parts && o.kind!=='cape' && !o.layer) ? skinParts(o.slim,'overlay') : [];
    const quads=[];
    const emit=(b,paintable)=>{
      for(const [name,F] of Object.entries(FACES)){
        const rect=b.f[name]; if(!rect) continue;
        const [u0,v0,fw,fh]=rect, [sx,sy,sz]=b.s;
        const ang=b.angle || (b.limb && o.limb ? (o.limb[b.limb]||0) : 0);
        const n=rot(ang?swing(F.n,[0,0,0],ang):F.n,o.yaw,o.pitch);
        if(n[2]<=0.01) continue;
        const org=[b.c[0]+F.o[0]*sx, b.c[1]+F.o[1]*sy, b.c[2]+F.o[2]*sz];
        const spanU=sx*Math.abs(F.du[0])+sy*Math.abs(F.du[1])+sz*Math.abs(F.du[2]);
        const spanV=sx*Math.abs(F.dv[0])+sy*Math.abs(F.dv[1])+sz*Math.abs(F.dv[2]);
        const stepU=F.du.map(v=>v*spanU/fw), stepV=F.dv.map(v=>v*spanV/fh);
        const light=0.6+0.4*Math.max(0,n[2]);
        /* Runs of identical pixels along a row collapse into one quad. Skins
           have large flat areas, so this removes most of the draw calls
           without changing the picture. The editor needs one quad per pixel
           to hit-test against, so it opts out with pickable. */
        const merge = !o.pickable;
        for(let j=0;j<fh;j++){
          let i=0;
          while(i<fw){
            const k=((v0+j)*64+(u0+i))*4, a=tex[k+3];
            if(!a && !paintable){ i++; continue; }
            let run=1;
            if(merge){
              const r0=tex[k], g0=tex[k+1], b0=tex[k+2];
              while(i+run<fw){
                const k2=((v0+j)*64+(u0+i+run))*4;
                if(tex[k2]!==r0||tex[k2+1]!==g0||tex[k2+2]!==b0||tex[k2+3]!==a) break;
                run++;
              }
            }
            const corner=(di,dj)=>[org[0]+stepU[0]*(i+di)+stepV[0]*(j+dj),
                                   org[1]+stepU[1]*(i+di)+stepV[1]*(j+dj),
                                   org[2]+stepU[2]*(i+di)+stepV[2]*(j+dj)];
            const pts=[corner(0,0),corner(run,0),corner(run,1),corner(0,1)]
              .map(q=>project(ang ? swing(q,b.pivot,ang) : q, o, W, H));
            // Coarse order is only for picking; painting resolves depth per pixel.
            const near = Math.max(pts[0][2], pts[1][2], pts[2][2], pts[3][2]);
            quads.push({pts, depth:near, tx:u0+i, ty:v0+j, paintable,
              color:[Math.round(tex[k]*light),Math.round(tex[k+1]*light),Math.round(tex[k+2]*light),a],
              rgba: a ? `rgba(${Math.round(tex[k]*light)},${Math.round(tex[k+1]*light)},${Math.round(tex[k+2]*light)},${a/255})` : null});
            i+=run;
          }
        }
      }
    };
    under.forEach(b=>emit(b,false));
    parts.forEach(b=>emit(b,true));
    showOuter.forEach(b=>emit(b,false));
    quads.sort((a,b)=>a.depth-b.depth);
    return quads;
  }


  const buffers=new WeakMap();
  function rasterize(quads,W,H,state={}) {
    if(!state.z || state.z.length!==W*H) {state.z=new Float32Array(W*H);state.data=new Uint8ClampedArray(W*H*4);}
    const z=state.z,data=state.data;z.fill(-Infinity);data.fill(0);
    const transparent=new Map();
    const edge=(a,b,x,y)=>(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0]);
    function triangle(a,b,c,color,blend) {
      const area=edge(a,b,c[0],c[1]); if(Math.abs(area)<.00001)return;
      const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),maxX=Math.min(W-1,Math.ceil(Math.max(a[0],b[0],c[0])));
      const minY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),maxY=Math.min(H-1,Math.ceil(Math.max(a[1],b[1],c[1])));
      const za=1/(110-a[2]),zb=1/(110-b[2]),zc=1/(110-c[2]);
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const wa=edge(b,c,x+.5,y+.5)/area,wb=edge(c,a,x+.5,y+.5)/area,wc=1-wa-wb;
        if(wa<-.000001||wb<-.000001||wc<-.000001)continue;
        const depth=wa*za+wb*zb+wc*zc,p=y*W+x,k=p*4;
        if(depth<z[p]-1e-9)continue;
        if(blend){
          let fragments=transparent.get(p);if(!fragments)transparent.set(p,fragments=[]);
          if(!fragments.some(f=>Math.abs(f[0]-depth)<1e-9))fragments.push([depth,color]);
        }else{
          z[p]=depth;data[k]=color[0];data[k+1]=color[1];data[k+2]=color[2];data[k+3]=255;
        }
      }
    }
    for(const blend of [false,true])for(const q of quads){
      const color=q.color;if(!color||color[3]<1||(color[3]<255)!==blend)continue;
      triangle(q.pts[0],q.pts[1],q.pts[2],color,blend);triangle(q.pts[0],q.pts[2],q.pts[3],color,blend);
    }
    for(const [p,fragments] of transparent){
      fragments.sort((a,b)=>a[0]-b[0]);const k=p*4;
      for(const [depth,c] of fragments){
        if(depth<z[p]-1e-9)continue;
        const a=c[3]/255,da=data[k+3]/255,out=a+da*(1-a);
        for(let j=0;j<3;j++)data[k+j]=(c[j]*a+data[k+j]*da*(1-a))/out;
        data[k+3]=out*255;
      }
    }
    return state;
  }
  function paint(canvas,quads,outline=null){
    let state=buffers.get(canvas)||{};state=rasterize(quads,canvas.width,canvas.height,state);buffers.set(canvas,state);
    const c=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
    if(!state.image || state.image.width!==W || state.image.height!==H)state.image=c.createImageData(W,H);
    state.image.data.set(state.data);
    if(outline){
      const rgb=(outline.match(/[a-f0-9]{2}/ig)||['ff','ff','ff']).slice(0,3).map(s=>parseInt(s,16));
      const r=Math.max(1,Math.round(W/220)),offsets=[[-r,0],[r,0],[0,-r],[0,r],[-r,-r],[r,-r],[-r,r],[r,r]];
      for(let y=r;y<H-r;y++)for(let x=r;x<W-r;x++){
        const p=(y*W+x)*4;if(state.data[p+3])continue;
        if(offsets.some(([dx,dy])=>state.data[((y+dy)*W+x+dx)*4+3]>128)){
          state.image.data[p]=rgb[0];state.image.data[p+1]=rgb[1];state.image.data[p+2]=rgb[2];state.image.data[p+3]=230;
        }
      }
    }
    c.putImageData(state.image,0,0);
  }
  function hit(quads,px,py){
    const inside=q=>{
      let h=false;
      for(let i=0,j=3;i<4;j=i++){
        const [xi,yi]=q.pts[i], [xj,yj]=q.pts[j];
        if((yi>py)!==(yj>py) && px<(xj-xi)*(py-yi)/(yj-yi)+xi) h=!h;
      }
      return h;
    };
    for(let i=quads.length-1;i>=0;i--) if(quads[i].paintable && inside(quads[i])) return quads[i];
    return null;
  }
  /* A slim skin leaves the right-hand column of the arm region transparent.
     Reading it beats trusting a flag that may never have been set. */
  function looksSlim(tex){
    const at=(x,y)=>tex[(y*64+x)*4+3];
    let solid=0;
    for(let y=20;y<32;y++) if(at(54,y)>16 || at(55,y)>16) solid++;
    return solid < 3;
  }

  /* PNG -> raw pixels, so both renderers work off the same buffer. */
  function texture(src,kind='skin',slimHint){
    return new Promise((res,rej)=>{
      const img=new Image(); img.crossOrigin='anonymous';
      img.onload=()=>{
        const cv=document.createElement('canvas');
        cv.width=64; cv.height=64;
        const cx=cv.getContext('2d',{willReadFrequently:true});
        cx.imageSmoothingEnabled=false;
        if(kind==='cape') {
          if(img.width!==img.height*2&&img.width!==img.height){rej(new Error('Cape textures must have a 2:1 aspect ratio'));return;}
          cx.drawImage(img,0,0,img.width,img.width/2,0,0,64,32);
        } else {
          if(img.width!==img.height&&img.width!==img.height*2){rej(new Error('Invalid skin dimensions'));return;}
          const legacy=img.width===img.height*2;
          cx.drawImage(img,0,0,64,legacy?32:64);
          if(legacy){
            const copy=document.createElement('canvas');copy.width=64;copy.height=64;copy.getContext('2d').drawImage(cv,0,0);
            const patches=[[4,16,4,4,20,48],[8,16,4,4,24,48],[8,20,4,12,16,52],[4,20,4,12,20,52],[0,20,4,12,24,52],[12,20,4,12,28,52],[44,16,4,4,36,48],[48,16,4,4,40,48],[48,20,4,12,32,52],[44,20,4,12,36,52],[40,20,4,12,40,52],[52,20,4,12,44,52]];
            for(const [sx,sy,w,h,dx,dy] of patches){cx.save();cx.translate(dx+w,dy);cx.scale(-1,1);cx.drawImage(copy,sx,sy,w,h,0,0,w,h);cx.restore();}
          }
          const pixels=cx.getImageData(0,0,64,64),data=pixels.data;
          if(legacy){
            let opaque=true;for(let y=0;y<16;y++)for(let x=32;x<64;x++)if(data[(y*64+x)*4+3]<255)opaque=false;
            if(opaque)for(let y=0;y<16;y++)for(let x=32;x<64;x++)data[(y*64+x)*4+3]=0;
          }
          // The game's base skin layer is opaque; only the jacket/hat layer cuts out.
          const slim=!legacy&&(typeof slimHint==='boolean'?slimHint:looksSlim(data));
          for(const part of skinParts(slim,'base'))for(const [u,v,w,h] of Object.values(part.f))
            for(let y=v;y<v+h;y++)for(let x=u;x<u+w;x++)data[(y*64+x)*4+3]=255;
          cx.putImageData(pixels,0,0);
        }
        res(cx.getImageData(0,0,64,64).data);
      };
      img.onerror=rej; img.src=src;
    });
  }
  return { build, paint, rasterize, hit, texture, looksSlim, skinParts, capeParts, wornCape, project };
})();
if(typeof module!=='undefined')module.exports=MonkeyModel;
if(typeof window!=='undefined')window.MonkeyModel=MonkeyModel;
