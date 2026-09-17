const crypto=require('node:crypto');
function createGameLibrary({store,nativeImage,pick,lookupSkin,uploadSkin,changed}){
 let writes=Promise.resolve();const avatars=new Map();
 const serial=fn=>{const p=writes.catch(()=>{}).then(fn);writes=p;return p;};
 const kind=b=>{if(!['skin','cape'].includes(b.kind))throw Error('Choose Skins or Capes');return b.kind;};
 const key=k=>k==='skin'?'skins':'capes',active=k=>k==='skin'?'activeSkin':'activeCape';
 const name=s=>String(s||'Untitled').trim().slice(0,48)||'Untitled';
 function png(data,k){
  if(typeof data!=='string'||data.length>5600000||!/^data:image\/png;base64,/.test(data))throw Error('Choose a PNG image.');
  const bytes=Buffer.from(data.split(',')[1],'base64');if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid PNG');
  const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
  if(k==='skin'&&(w!==64||![32,64].includes(h)))throw Error('Skins must be 64 x 64 or 64 x 32 pixels.');
  if(k==='cape'&&(w>2048||w<2||![w,w/2].includes(h)))throw Error('Capes must use a 2:1 texture (up to 2048 pixels wide).');
  let image=nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw Error('Could not decode PNG');
  if(k==='cape'&&w===h)image=image.crop({x:0,y:0,width:w,height:h/2});
  return 'data:image/png;base64,'+image.toPNG().toString('base64');
 }
 async function commit(patch){const saved=await store.saveData(patch,true);changed(saved);return saved;}
 function find(state,k,id){const row=(state?.[key(k)]||[]).find(x=>x.id===id);if(!row)throw Error('This item was removed. Refresh your library.');return row;}
 async function save(b){return serial(async()=>{const k=kind(b),state=await store.loadData(),rows=[...(state?.[key(k)]||[])],input=b.item||{},id=input.id||crypto.randomUUID();const i=rows.findIndex(x=>x.id===id);if(input.id&&i<0)throw Error('This item was removed.');const item={id,name:name(input.name),data:png(input.data,k),slim:!!input.slim};if(i<0)rows.push(item);else rows[i]=item;await commit({[key(k)]:rows});return {item};});}
 return {
  async list(b){const k=kind(b),s=await store.loadData(),rows=s?.[key(k)]||[],offset=Math.max(0,Math.floor(Number(b.offset)||0)),limit=Math.max(1,Math.min(12,Math.floor(Number(b.limit)||12)));return {items:rows.slice(offset,offset+limit).map(r=>({id:r.id,name:r.name,slim:!!r.slim,selected:s?.[active(k)]===r.id})),total:rows.length,hasMore:offset+limit<rows.length};},
  async item(b){const k=kind(b),s=await store.loadData();let r=find(s,k,b.id);if(!r.data&&r.ign){const fetched=await lookupSkin(r.ign);if(!fetched.data)throw Error('Skin is unavailable.');r={...r,data:fetched.data,slim:fetched.slim};}return {item:{id:r.id,name:r.name,slim:!!r.slim,data:png(r.data,k)}};},
  save,
  async import(b){const k=kind(b),file=await pick(false);if(!file)return {cancelled:true};return save({kind:k,item:{name:file.name.replace(/\.png$/i,''),data:file.data}});},
  async lookup(b){if(!/^[a-zA-Z0-9_]{1,16}$/.test(b.name||''))throw Error('Enter a Minecraft username.');const r=await lookupSkin(b.name);if(!r.data)throw Error('Could not find that skin.');return save({kind:'skin',item:{name:r.name,data:r.data,slim:r.slim}});},
  async equip(b,session){return serial(async()=>{const k=kind(b),s=await store.loadData(),item=find(s,k,b.id);const data=png(item.data,k);let selected=b.id;if(k==='skin'){const result=await uploadSkin(session.uuid,{data,variant:item.slim?'slim':'classic'});if(!result.ok)throw Error(result.message);}else if(s[active(k)]===b.id)selected=null;await commit({[active(k)]:selected});return {item:{...item,data},equipped:!!selected};});},
  async remove(b){return serial(async()=>{const k=kind(b),s=await store.loadData();find(s,k,b.id);await commit({[key(k)]:s[key(k)].filter(r=>r.id!==b.id),...(s[active(k)]===b.id?{[active(k)]:null}:{})});return {deleted:true,wasActive:s[active(k)]===b.id,kind:k};});},
  async pickIcon(){const picked=await pick(true);if(!picked)return {cancelled:true};const image=nativeImage.createFromDataURL(picked.data);if(image.isEmpty())throw Error('Choose an image.');return {data:'data:image/png;base64,'+image.resize({width:96,height:96}).toPNG().toString('base64')};},
  async avatar(uuid){if(!/^[0-9a-f]{32}$/i.test(uuid||''))throw Error('Invalid player');if(avatars.has(uuid))return {data:avatars.get(uuid)};const response=await fetch('https://mc-heads.net/avatar/'+uuid+'/32',{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('Avatar unavailable');const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>100000)throw Error('Invalid avatar');const image=nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw Error('Invalid avatar');const data='data:image/png;base64,'+image.resize({width:32,height:32}).toPNG().toString('base64');avatars.set(uuid,data);while(avatars.size>64)avatars.delete(avatars.keys().next().value);return {data};}
 };
}
module.exports={createGameLibrary};
