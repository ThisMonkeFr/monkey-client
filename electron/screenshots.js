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
   const dir=path.resolve(profile.settings?.gameDir||io.instance(profile.id),'screenshots');
   if(seen.has(dir))continue;seen.add(dir);
   const entries=await fs.readdir(dir,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
   for(const entry of entries){
    if(!entry.isFile()||!entry.name.toLowerCase().endsWith('.png'))continue;
    const file=path.join(dir,entry.name),stat=await fs.stat(file).catch(()=>null);if(!stat)continue;
    const id=idFor(file);files.set(id,file);rows.push({id,name:entry.name,profileId:profile.id,profile:profile.name,created:stat.mtimeMs,bytes:stat.size});
   }
  }
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
 return {list,open};
}
module.exports={createScreenshotService};
