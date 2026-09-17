/* Reused GPU buffers for the Play preview. Editors retain their pixel picking renderer. */
const PlayerGPU=(()=>{
 let surface,gl,program,buffer,array=new Float32Array(4096),capacity=0,failed=false;
 function init(){
  surface=document.createElement('canvas');gl=surface.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:'low-power'});if(!gl)throw Error('WebGL unavailable');
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  program=gl.createProgram();const vertex=shader(gl.VERTEX_SHADER,'#version 300 es\nin vec3 point;in vec4 color;out vec4 tint;void main(){gl_Position=vec4(point,1.0);tint=color;}'),fragment=shader(gl.FRAGMENT_SHADER,'#version 300 es\nprecision mediump float;in vec4 tint;out vec4 pixel;void main(){pixel=tint;}');gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Shader link failed');
  gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const p=gl.getAttribLocation(program,'point'),c=gl.getAttribLocation(program,'color');gl.enableVertexAttribArray(p);gl.enableVertexAttribArray(c);gl.vertexAttribPointer(p,3,gl.FLOAT,false,28,0);gl.vertexAttribPointer(c,4,gl.FLOAT,false,28,12);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  surface.addEventListener('webglcontextlost',e=>{e.preventDefault();failed=true;});
 }
 function paint(canvas,quads){
  if(failed)return false;
  try{if(!gl)init();const w=canvas.width,h=canvas.height;if(surface.width!==w||surface.height!==h){surface.width=w;surface.height=h;}gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   const required=quads.length*42;if(array.length<required)array=new Float32Array(2**Math.ceil(Math.log2(required)));let n=0;
   // Back-to-front submission preserves translucent skin/cape layers.
   for(const q of quads)for(const index of [0,1,2,0,2,3]){const p=q.pts[index];array[n++]=p[0]/w*2-1;array[n++]=1-p[1]/h*2;array[n++]=-p[2]/200;for(let c=0;c<4;c++)array[n++]=q.color[c]/255;}
   gl.bindBuffer(gl.ARRAY_BUFFER,buffer);if(capacity<array.byteLength){capacity=array.byteLength;gl.bufferData(gl.ARRAY_BUFFER,capacity,gl.DYNAMIC_DRAW);}gl.bufferSubData(gl.ARRAY_BUFFER,0,array.subarray(0,n));gl.drawArrays(gl.TRIANGLES,0,n/7);
   const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);ctx.drawImage(surface,0,0);return true;
  }catch{failed=true;return false;}
 }
 return {paint,get available(){return !failed;}};
})();
