/* Cached glass engravings, a projected four-dimensional lattice, and voxel clouds. */
function installVanillaBackgrounds(FX){
 const TAU=Math.PI*2,rand=(a,b)=>a+Math.random()*(b-a);
 const canvas=(w,h,draw)=>{const image=document.createElement('canvas');image.width=w;image.height=h;draw(image.getContext('2d'));return image;};
 const sky=(c,w,h,a,b)=>{const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,a);g.addColorStop(1,b);c.fillStyle=g;c.fillRect(0,0,w,h);};
 function glow(c,x,y,r,color){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(x-r,y-r,2*r,2*r);}
 delete FX.dna;
 FX.frozen={label:'Frozen glass',init(w,h){
  const cracks=[];
  function fracture(x,y,length,angle,depth){const points=[[x,y]];for(let i=1;i<=8;i++){const f=i/8;points.push([x+Math.cos(angle)*length*f+rand(-7,7),y+Math.sin(angle)*length*f+rand(-7,7)]);}cracks.push({points,depth});if(depth>0){const [ex,ey]=points[6];fracture(ex,ey,length*.48,angle+rand(-.8,.8),depth-1);fracture(points[4][0],points[4][1],length*.4,angle+rand(-1.1,1.1),depth-1);}}
  for(let i=0;i<10;i++){const left=i%2===0;fracture(left?0:w,h*(i/10),rand(w*.16,w*.4),left?rand(-.4,.5):Math.PI+rand(-.5,.4),3);}
  const ice=canvas(w,h,c=>{
   sky(c,w,h,'#0b1924','#233b4a');glow(c,w*.1,h*.2,h,'#bfdef528');glow(c,w*.8,h*.8,h*.8,'#517b8b28');
   for(const crack of cracks){for(let pass=0;pass<3;pass++){c.strokeStyle=pass===0?'#01060a99':pass===1?'#8fbed558':'#eaf7ff70';c.lineWidth=pass===0?3:pass===1?1.3:.55;c.beginPath();crack.points.forEach(([x,y],i)=>i?c.lineTo(x+pass*.6,y):c.moveTo(x+pass*.6,y));c.stroke();}}
   // Fine dendritic frost accumulates at edges, leaving a clear glass centre.
   for(let i=0;i<560;i++){const side=i%4,x=side===0?rand(0,w*.12):side===1?rand(w*.88,w):rand(0,w),y=side===2?rand(0,h*.12):side===3?rand(h*.88,h):rand(0,h),len=rand(4,23),angle=rand(0,TAU);c.save();c.translate(x,y);c.rotate(angle);c.strokeStyle=`rgba(207,238,248,${rand(.06,.32)})`;c.lineWidth=.6;c.beginPath();c.moveTo(0,0);c.lineTo(len,0);for(let j=3;j<len;j+=3){c.moveTo(j,0);c.lineTo(j-3,-3);c.moveTo(j,0);c.lineTo(j-3,3);}c.stroke();c.restore();}
   for(let i=0;i<1500;i++){c.fillStyle=`rgba(224,249,255,${rand(.01,.07)})`;c.fillRect(rand(0,w),rand(0,h),rand(.4,1.5),1);}
  });
  return {t:0,ice,cracks,dust:Array.from({length:45},()=>({x:rand(0,w),y:rand(0,h),r:rand(.5,1.7),v:rand(2,8),a:rand(.07,.35)}))};
 },draw(c,w,h,dt,A,s){s.t+=dt;c.drawImage(s.ice,0,0);c.save();c.globalCompositeOperation='screen';const x=(s.t*28)%(w*2)-w*.4,g=c.createLinearGradient(x,0,x+w*.4,h);g.addColorStop(0,'transparent');g.addColorStop(.45,'#d6f5ff08');g.addColorStop(.5,'#e1f8ff20');g.addColorStop(.55,'#c6eaff08');g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(0,0,w,h);c.restore();for(const p of s.dust){p.y=(p.y+p.v*dt)%h;c.fillStyle=`rgba(233,250,255,${p.a*(.65+.35*Math.sin(s.t+p.x))})`;c.fillRect(p.x+Math.sin(s.t*.2+p.y)*3,p.y,p.r,p.r);}}};
 FX.rift={label:'Rift lattice',init:()=>({t:0}),draw(c,w,h,dt,A,s){
  s.t+=dt;sky(c,w,h,'#060b15','#101426');const cx=w*.5,cy=h*.46,unit=Math.min(w,h)*.25;
  glow(c,cx,cy,unit*2.2,A(.14));
  // Nested tesseracts rotate through XY, XW and ZW planes before perspective projection.
  function project(bits,size){let p=[0,1,2,3].map(i=>(bits>>i&1?1:-1)*size);for(const [a,b,angle] of [[0,1,s.t*.12],[0,3,s.t*.23],[2,3,s.t*.16],[1,2,.5+s.t*.08]]){const x=p[a],y=p[b];p[a]=x*Math.cos(angle)-y*Math.sin(angle);p[b]=x*Math.sin(angle)+y*Math.cos(angle);}const fourth=2.8/(3.5-p[3]),depth=3.8/(5-p[2]*fourth);return [cx+p[0]*fourth*depth*unit,cy+p[1]*fourth*depth*unit,p[2]];}
  for(let layer=4;layer>=0;layer--){const size=.42+layer*.21,points=Array.from({length:16},(_,i)=>project(i,size));c.lineWidth=layer===2?1.25:.65;c.strokeStyle=A(.15+layer*.065);for(let i=0;i<16;i++)for(let bit=0;bit<4;bit++){const other=i^(1<<bit);if(other<i)continue;c.beginPath();c.moveTo(points[i][0],points[i][1]);c.lineTo(points[other][0],points[other][1]);c.stroke();}for(const p of points){c.fillStyle=layer===2?'#ecffffb0':A(.5);c.fillRect(p[0]-1,p[1]-1,2,2);}}
  // The surrounding sheet folds into an impossible, breathing aperture.
  for(let ring=0;ring<16;ring++){const r=unit*(1.05+ring*.055);c.strokeStyle=A(.035+ring*.009);c.lineWidth=.8;c.beginPath();for(let i=0;i<=100;i++){const a=i/100*TAU,fold=Math.cos(a*3+s.t*.35)*Math.sin(a*2-s.t*.22)*unit*.16,x=cx+Math.cos(a)*(r+fold),y=cy+Math.sin(a)*(r*.63+fold)*(.9+.1*Math.sin(s.t*.3));i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}
  for(let i=0;i<65;i++){const phase=i*2.399,depth=((i*.173+s.t*.018)%1),r=unit*(1.35+depth*2.2),x=cx+Math.cos(phase+s.t*.025)*r,y=cy+Math.sin(phase+s.t*.025)*r*.7;c.fillStyle=A((1-depth)*.4);c.fillRect(x,y,1.5,1.5);}
 }};
 FX.clouds={label:'Cloudscape',init(w,h){return {t:0,clouds:Array.from({length:18},(_,i)=>({x:rand(-w*.3,w),y:h*(.08+i/30),size:rand(14,28)*(i<6?.65:1.2),speed:5+i*.7,blocks:Array.from({length:10},()=>({x:Math.floor(rand(0,6)),z:Math.floor(rand(0,3))}))})),land:canvas(w,h,c=>{
  for(let layer=0;layer<4;layer++){c.fillStyle=['#415871','#344956','#283a40','#1d2e31'][layer];const step=layer<2?12:18;c.beginPath();c.moveTo(0,h);for(let x=0;x<=w+step;x+=step){const y=Math.round((h*(.7+layer*.09)-Math.sin(x*.009+layer*2)*h*.06-Math.sin(x*.023+layer)*h*.025)/step)*step;c.lineTo(x,y);c.lineTo(x+step,y);}c.lineTo(w,h);c.fill();}
  for(let i=0;i<15;i++){let x=i*w/14+Math.sin(i*7)*20,y=h*.87+Math.sin(i*2)*h*.03;c.fillStyle='#152b2a';c.fillRect(x-3,y,6,32);c.fillRect(x-17,y-10,34,17);c.fillRect(x-12,y-21,24,14);c.fillRect(x-7,y-29,14,12);}
 })};},draw(c,w,h,dt,A,s){
  s.t+=dt;sky(c,w,h,'#244a76','#c6b7a4');glow(c,w*.78,h*.2,h*.6,'#ffe6b44d');c.fillStyle='#fff0bb';c.fillRect(w*.78-20,h*.2-20,40,40);c.fillStyle='#fff8df3b';c.fillRect(w*.78-27,h*.2-27,54,54);
  for(const cloud of s.clouds){cloud.x+=cloud.speed*dt;if(cloud.x>w+100)cloud.x=-cloud.size*8;const z=cloud.size;c.globalAlpha=.3+Math.min(.45,cloud.size/65);for(const b of cloud.blocks){const x=Math.floor(cloud.x+b.x*z-b.z*z*.3),y=Math.floor(cloud.y+b.z*z*.25);c.fillStyle='#8fabc1';c.fillRect(x,y+z*.28,z,z*.38);c.fillStyle='#f0f1e9';c.fillRect(x,y,z,z*.32);c.fillStyle='#d2deea';c.fillRect(x+z*.8,y+z*.1,z*.2,z*.52);}}c.globalAlpha=1;c.drawImage(s.land,0,0);
 }};
 // Apply the current accent at draw time, so cached scenery and previews also
 // respond immediately to custom colours without rebuilding animation state.
 for(const fx of Object.values(FX))if(!fx.still&&fx.draw){const draw=fx.draw;fx.draw=function(c,w,h,dt,A,state){c.save();draw.call(this,c,w,h,dt,A,state);c.globalAlpha=1;c.globalCompositeOperation='color';c.fillStyle=A(1);c.fillRect(0,0,w,h);c.restore();};}
}
if(typeof window!=='undefined')window.installVanillaBackgrounds=installVanillaBackgrounds;
if(typeof module!=='undefined')module.exports={installVanillaBackgrounds};
