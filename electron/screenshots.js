const path=require('node:path');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');

function createScreenshotService({store,io,nativeImage,shell}){
 const files=new Map(),thumbnails=new Map();
 const idFor=file=>crypto.createHash('sha256').update(file).digest('hex');
 async function list({profileId=null,offset=0,limit=48}={}){
  const data=await store.loadData(),rows=[],seen=new Set();
  for(const profile of data?.profiles||[]){
   if(profileId&&profile.id!==profileId)continue;
   if(!/^[a-zA-Z0-9_-]{1,100}$/.test(profile.id))continue;
   const roots=[{dir:path.resolve(profile.settings?.gameDir||io.instance(profile.id)),name:profile.name}];
   const sessions=path.join(io.instance(profile.id),'sessions');
   for(const entry of await fs.readdir(sessions,{withFileTypes:true}).catch(()=>[]))if(entry.isDirectory()&&!entry.isSymbolicLink()&&/^Session \d+$/.test(entry.name)){
    const dir=path.join(sessions,entry.name);try{const owner=JSON.parse(await fs.readFile(path.join(dir,'monkey-session.json'),'utf8'));if(owner.profileId===profile.id)roots.push({dir,name:profile.name+' · '+entry.name});}catch{}
   }
   for(const source of roots){const dir=path.join(source.dir,'screenshots');
   if(seen.has(dir))continue;seen.add(dir);
   const entries=await fs.readdir(dir,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
   for(const entry of entries){
    if(!entry.isFile()||!entry.name.toLowerCase().endsWith('.png'))continue;
    const file=path.join(dir,entry.name),stat=await fs.stat(file).catch(()=>null);if(!stat)continue;
    const id=idFor(file);files.set(id,file);rows.push({id,name:entry.name,profileId:profile.id,profile:source.name,created:stat.mtimeMs,bytes:stat.size});
   }
  }}
  rows.sort((a,b)=>b.created-a.created||a.name.localeCompare(b.name));
  const start=Math.max(0,Number(offset)||0),count=Math.max(1,Math.min(60,Number(limit)||48)),page=rows.slice(start,start+count);
  for(const row of page){
   const cacheKey=row.id+':'+row.created+':'+row.bytes;let thumb=thumbnails.get(cacheKey);
   if(!thumb){try{const image=await nativeImage.createThumbnailFromPath(files.get(row.id),{width:320,height:180});thumb='data:image/jpeg;base64,'+image.toJPEG(75).toString('base64');thumbnails.set(cacheKey,thumb);}catch{thumb=null;}}
   row.thumbnail=thumb;
  }
  while(thumbnails.size>96)thumbnails.delete(thumbnails.keys().next().value);
  if(files.size>10000){const visible=new Set(rows.map(r=>r.id));for(const id of files.keys())if(!visible.has(id))files.delete(id);}
  return {items:page,total:rows.length,hasMore:start+page.length<rows.length};
 }
 async function open(id,reveal=false){
  const file=files.get(id);if(!file)throw Error('Refresh Screenshots before opening this image.');
  const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Screenshot is no longer available.');
  if(reveal)shell.showItemInFolder(file);else{const error=await shell.openPath(file);if(error)throw Error(error);}
  return true;
 }
 async function attachment(id){
  const file=files.get(id);if(!file)throw Error('Refresh Screenshots before attaching this image.');
  const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>48*1024*1024)throw Error('Screenshot is unavailable or too large.');
  let image=nativeImage.createFromPath(file);if(image.isEmpty())throw Error('Could not read screenshot');
  let size=image.getSize();if(size.width>3840||size.height>2160){image=image.resize({width:Math.min(3840,Math.round(size.width*Math.min(3840/size.width,2160/size.height)))});size=image.getSize();}
  let bytes=image.toJPEG(88);if(bytes.length>2*1024*1024){image=image.resize({width:Math.min(1920,size.width)});bytes=image.toJPEG(78);size=image.getSize();}
  if(bytes.length>2*1024*1024)throw Error('Screenshot is too large to share.');
  return {name:path.basename(file),width:size.width,height:size.height,data:'data:image/jpeg;base64,'+bytes.toString('base64'),thumbnail:'data:image/jpeg;base64,'+image.resize({width:320}).toJPEG(72).toString('base64')};
 }
 return {list,open,attachment};
}
module.exports={createScreenshotService};
