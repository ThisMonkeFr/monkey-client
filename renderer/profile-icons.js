/* Shared depth renderer: player heads include the skin's hat layer. */
window.createProfileIcons=function(state,escape,model){
 const pending=new Map();
 function choices(){return [...Object.keys(window.MC_BLOCKS),...state.skins.filter(s=>s.data).map(s=>'skin:'+s.id)];}
 function title(id){if(id.startsWith('skin:'))return state.skins.find(s=>s.id===id.slice(5))?.name||'Player head';return (window.MC_BLOCKS[id]||id).replaceAll('_',' ');}
 function html(id,size=26){
  if(id?.startsWith('skin:')){const s=state.skins.find(s=>s.id===id.slice(5));if(s?.data)return `<canvas class="profile-head" width="80" height="80" data-profile-head="${escape(s.id)}" style="width:${size}px;height:${size}px" aria-label="${escape(s.name||'Player head')}"></canvas>`;id='grass';}
  if(window.MC_BLOCKS[id])return `<span class="block-icon" role="img" aria-label="${escape(title(id))}" style="width:${size}px;height:${size}px;background-image:url('assets/blocks/${id}.png')"></span>`;
  return `<span style="font-size:${size}px">${escape(id||'')}</span>`;
 }
 function draw(){document.querySelectorAll('canvas[data-profile-head]').forEach(canvas=>{
  const skin=state.skins.find(s=>s.id===canvas.dataset.profileHead);if(!skin?.data||canvas.dataset.painted===skin.data)return;
  canvas.dataset.painted=skin.data;const key=skin.data;
  if(!pending.has(key)){if(pending.size>64)pending.delete(pending.keys().next().value);pending.set(key,model.texture(key,'skin',!!skin.slim).then(tex=>{
   const parts=[model.skinParts(false,'base')[0],model.skinParts(false,'overlay')[0]];
   return model.build(tex,{parts,yaw:-.6,pitch:.28,zoom:5.7,centreY:28},80,80);
  }).catch(()=>null));}
  pending.get(key).then(quads=>{if(quads&&canvas.isConnected)model.paint(canvas,quads);});
 });}
 let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;draw();});}).observe(document.body,{childList:true,subtree:true});
 return {choices,title,html,draw};
};
