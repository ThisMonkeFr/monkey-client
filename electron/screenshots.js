const path=require('node:path');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');

function createScreenshotService({store,io,nativeImage,shell}){
 const files=new Map(),thumbnails=new Map(),origins=new Map();
 const archive=path.join(io.root?io.root():path.dirname(io.instance('__gallery__')),'screenshots');
 let queue=Promise.resolve();
 const serial=fn=>{const next=queue.catch(()=>{}).then(fn);queue=next;return next;};
 const idFor=file=>crypto.createHash('sha256').update(file).digest('hex');
 async function collect({profileId=null,offset=0,limit=48}={}){
  await fs.mkdir(archive,{recursive:true});if((await fs.lstat(archive)).isSymbolicLink())throw Error("Screenshot archive cannot be a link");origins.clear();
  const data=await store.loadData(),rows=[],seen=new Set();
  for(const profile of data?.profiles||[]){

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
    const id=idFor(profile.id+'|'+path.relative(io.instance(profile.id),source.dir)+'|'+entry.name+'|'+stat.size+'|'+stat.mtimeMs);
    origins.set(id,file);const target=path.join(archive,id+'.png'),meta=path.join(archive,id+'.json');
    const previous=await fs.readFile(meta,'utf8').then(JSON.parse).catch(()=>null);if(previous?.deleted)continue;
    const row={id,name:entry.name,profileId:profile.id,profile:source.name,created:stat.mtimeMs,bytes:stat.size};
    if(!previous){
     await fs.copyFile(file,target+'.tmp');
     const copied=await fs.open(target+'.tmp','r');let complete=false;
     try{const header=Buffer.alloc(8),tail=Buffer.alloc(12);await copied.read(header,0,8,0);await copied.read(tail,0,12,Math.max(0,stat.size-12));const after=await fs.stat(file);complete=header.equals(Buffer.from('89504e470d0a1a0a','hex'))&&tail.equals(Buffer.from('0000000049454e44ae426082','hex'))&&after.size===stat.size&&after.mtimeMs===stat.mtimeMs;}finally{await copied.close();}
     if(!complete){await fs.unlink(target+'.tmp');continue;}
     await fs.rename(target+'.tmp',target);await fs.writeFile(meta,JSON.stringify(row));
    }

   }
  }}
  for(const entry of await fs.readdir(archive)){if(!/^[a-f0-9]{64}\.json$/.test(entry))continue;
   try{const row=JSON.parse(await fs.readFile(path.join(archive,entry),'utf8'));if(row.deleted||(profileId&&row.profileId!==profileId))continue;const file=path.join(archive,entry.slice(0,-5)+'.png');const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink())continue;row.id=entry.slice(0,-5);files.set(row.id,file);rows.push(row);}catch{}
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
 async function attachment(id){
  const file=files.get(id);if(!file)throw Error('Refresh Screenshots before attaching this image.');
  const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>48*1024*1024)throw Error('Screenshot is unavailable or too large.');
  let image=nativeImage.createFromPath(file);if(image.isEmpty())throw Error('Could not read screenshot');
  let size=image.getSize();if(size.width>3840||size.height>2160){image=image.resize({width:Math.min(3840,Math.round(size.width*Math.min(3840/size.width,2160/size.height)))});size=image.getSize();}
  let bytes=image.toJPEG(88);if(bytes.length>2*1024*1024){image=image.resize({width:Math.min(1920,size.width)});bytes=image.toJPEG(78);size=image.getSize();}
  if(bytes.length>2*1024*1024)throw Error('Screenshot is too large to share.');
  const meta=await fs.readFile(path.join(archive,id+'.json'),'utf8').then(JSON.parse).catch(()=>null);
  return {name:meta?.name||path.basename(file),width:size.width,height:size.height,data:'data:image/jpeg;base64,'+bytes.toString('base64'),thumbnail:'data:image/jpeg;base64,'+image.resize({width:320}).toJPEG(72).toString('base64')};
 }
 async function remove(id){return serial(async()=>{
  const file=files.get(id);if(!file)throw Error('Refresh Screenshots before deleting this image.');
  const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink()||path.dirname(file)!==archive)throw Error('Invalid screenshot.');
  const original=origins.get(id);if(original){const stat=await fs.lstat(original).catch(()=>null);if(stat?.isFile()&&!stat.isSymbolicLink())await fs.unlink(original);}
  await fs.writeFile(path.join(archive,id+'.json'),JSON.stringify({id,deleted:true}));await fs.unlink(file);files.delete(id);origins.delete(id);return true;
 });}
 async function image(id){
  const file=files.get(id);if(!file)throw Error('Refresh Screenshots before opening this image.');
  const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>48*1024*1024)throw Error('Screenshot unavailable.');
  let image=nativeImage.createFromPath(file);if(image.isEmpty())throw Error('Could not read screenshot');
  if(image.getSize().width>1920)image=image.resize({width:1920});
  return {data:'data:image/png;base64,'+image.toPNG().toString('base64')};
 }
 async function removeSource(gameDir,name){
  if(!gameDir||typeof name!=='string'||name!==path.basename(name)||!name.toLowerCase().endsWith('.png'))throw Error('Invalid screenshot');
  const root=path.resolve(gameDir,'screenshots'),file=path.resolve(root,name);
  if(path.dirname(file)!==root)throw Error('Invalid screenshot');
  await serial(()=>collect({limit:1}));
  const id=[...origins].find(([,source])=>path.resolve(source)===file)?.[0];
  if(!id||!files.has(id))throw Error('This screenshot has already been deleted or is still being saved.');
  return remove(id);
 }
 return {list:options=>serial(()=>collect(options)),preserve:()=>serial(()=>collect({limit:1})),open,attachment,remove,image,removeSource};
}
module.exports={createScreenshotService};
