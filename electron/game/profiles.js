const path=require('path');
const crypto=require('crypto');
const {createReadStream}=require('fs');
const {pipeline}=require('stream/promises');
const {assertSupported}=require('./versions');
const API='https://api.modrinth.com/v2';
const MANAGED=/^(monkeyclient|fabric-api-managed)\.jar(?:\.disabled)?$/i;
const fileName=name=>{if(typeof name!=='string'||name!==path.basename(name)||/[\\/:]/.test(name)||!name.toLowerCase().endsWith('.jar'))throw Error('Invalid mod filename');return name;};
async function hash(file,algorithm='sha512'){const h=crypto.createHash(algorithm);await pipeline(createReadStream(file),h);return h.digest('hex');}
const fingerprint=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function createProfileService({io,store,fetchImpl=fetch,installManaged=async()=>{},isRunning=()=>false}){
 const fs=io.fsp,plans=new Map(),busy=new Set();
 const directory=profile=>{if(!profile||!/^[a-zA-Z0-9_-]{1,100}$/.test(profile.id))throw Error('Invalid profile');return path.resolve(profile.settings?.gameDir||io.instance(profile.id));};
 async function saved(id){const data=await store.loadData();const profile=data?.profiles?.find(p=>p.id===id);if(!profile)throw Error('Profile no longer exists');return {data,profile};}
 async function json(url,body){const response=await fetchImpl(url,{method:body?'POST':'GET',headers:{'User-Agent':'MonkeyClient/0.7','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});if(response.status===404)return null;if(!response.ok)throw Error('Modrinth is unavailable ('+response.status+'). No files were changed.');return response.json();}
 async function inventory(profile){
  const dir=path.join(directory(profile),'mods'),rows=new Map();
  for(const mod of profile.mods||[]){if(!/\.jar$/i.test(mod.fileName||''))continue;fileName(mod.fileName);if(!MANAGED.test(mod.fileName))rows.set(mod.fileName,{...mod,key:mod.fileName});}
  for(const diskName of await fs.readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){
   if(!/\.jar(?:\.disabled)?$/i.test(diskName)||MANAGED.test(diskName))continue;
   const base=diskName.replace(/\.disabled$/i,'');fileName(base);const full=path.join(dir,diskName),stat=await fs.lstat(full);if(!stat.isFile()||stat.isSymbolicLink())throw Error('A mod is a link or directory: '+diskName);
   const old=rows.get(base)||{id:'local-'+fingerprint([profile.id,base]).slice(0,24),title:base,local:true};if(old.diskName)throw Error('Both enabled and disabled copies exist: '+base);
   rows.set(base,{...old,fileName:base,key:base,diskName,enabled:!diskName.endsWith('.disabled'),hash:await hash(full)});
  }
  return [...rows.values()].sort((a,b)=>a.fileName.localeCompare(b.fileName));
 }
 async function copyFileMissing(from,to){try{const st=await fs.lstat(from);if(!st.isFile()||st.isSymbolicLink())return false;await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(from,to,require('fs').constants.COPYFILE_EXCL);return true;}catch(e){if(e.code==='ENOENT'||e.code==='EEXIST')return false;throw e;}}
 async function copyTree(from,to){let count=0;for(const entry of await fs.readdir(from,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){if(entry.isSymbolicLink())continue;const source=path.join(from,entry.name),target=path.join(to,entry.name);if(entry.isDirectory())count+=await copyTree(source,target);else if(entry.isFile()&&await copyFileMissing(source,target))count++;}return count;}
 async function inherit(sourceId,target){
  assertSupported(target.version,target.loader);const to=directory(target);if(!sourceId)return {copied:0};const {profile:source}=await saved(sourceId);const from=directory(source);if(from===to)throw Error('A new profile needs its own game directory');if(isRunning(source.id))throw Error('Close the source game before copying its settings');
  let copied=0;for(const name of ['options.txt','optionsof.txt','optionsshaders.txt','config/iris.properties','config/oculus.properties','config/shaders.properties'])if(await copyFileMissing(path.join(from,name),path.join(to,name)))copied++;
  for(const folder of ['resourcepacks','shaderpacks'])copied+=await copyTree(path.join(from,folder),path.join(to,folder));return {copied};
 }
 async function plan(id,version,loader){
  assertSupported(version,loader);if(isRunning(id)||busy.has(id))throw Error('Close this profile before changing its version');
  const {profile}=await saved(id),rows=await inventory(profile),unknown=rows.filter(r=>!r.projectId&&r.hash),identified=unknown.length?await json(API+'/version_files',{hashes:unknown.map(r=>r.hash),algorithm:'sha512'}):{};
  const compatible=[],incompatible=[],projects=new Map(),requested=new Map();
  const targetRelease=async project=>{if(!requested.has(project))requested.set(project,json(API+'/project/'+encodeURIComponent(project)+'/version?loaders='+encodeURIComponent(JSON.stringify([loader]))+'&game_versions='+encodeURIComponent(JSON.stringify([version]))).then(list=>Array.isArray(list)?list.find(v=>v.version_type==='release')||list[0]:null));return requested.get(project);};
  const record=(row,release)=>{const file=release.files.find(f=>f.primary)||release.files[0];if(!file)throw Error('Release has no file: '+row.title);fileName(file.filename);if(!file.hashes?.sha1)throw Error('Release has no checksum: '+row.title);return {id:row.id||crypto.randomUUID(),projectId:release.project_id,title:row.title||release.name,icon:row.icon,enabled:row.enabled!==false,version:release.version_number,versionId:release.id,fileName:file.filename,url:file.url,sha1:file.hashes.sha1,sha512:file.hashes.sha512};};
  for(const row of rows){
   const project=row.projectId||identified?.[row.hash]?.project_id;
   const release=project&&loader!=='vanilla'?await targetRelease(project):null;
   if(!release){incompatible.push({key:row.key,title:row.title||row.fileName,fileName:row.fileName,enabled:row.enabled!==false,reason:loader==='vanilla'?'Vanilla does not load mods':!project?'No matching project found for this local mod':`No ${loader} release for Minecraft ${version}`});continue;}
   const next=record(row,release);compatible.push({old:row,next});projects.set(next.projectId,{record:next,release});
  }
  // Required dependencies are part of the migration, including loader APIs.
  for(const {record:owner,release} of projects.values())for(const dep of release.dependencies||[]){
   if(dep.dependency_type!=='required')continue;let release;
   if(dep.version_id)release=await json(API+'/version/'+encodeURIComponent(dep.version_id));else if(dep.project_id)release=await targetRelease(dep.project_id);else continue;
   if(!release||!release.game_versions?.includes(version)||!release.loaders?.includes(loader))throw Error('Required dependency of '+owner.title+' has no compatible build');
   const existing=projects.get(release.project_id);if(existing){if(dep.version_id&&existing.release.id!==dep.version_id)throw Error('Conflicting dependency versions for '+owner.title);if(owner.enabled!==false)existing.record.enabled=true;continue;}
   if(projects.size>=200)throw Error('Too many mod dependencies');const next=record({title:release.name,enabled:owner.enabled},release);compatible.push({old:null,next});projects.set(next.projectId,{record:next,release});
  }
  // Propagate enabled state through dependencies even when a dependency was visited first.
  let changed=true;while(changed){changed=false;for(const {record:owner,release} of projects.values())if(owner.enabled!==false)for(const dep of release.dependencies||[]){if(dep.dependency_type!=='required')continue;const child=dep.project_id?projects.get(dep.project_id):[...projects.values()].find(p=>p.release.id===dep.version_id);if(child&&child.record.enabled===false){child.record.enabled=true;changed=true;}}}
  const names=new Set();for(const c of compatible){if(names.has(c.next.fileName))throw Error('Two installed mods resolve to the same file: '+c.next.fileName);names.add(c.next.fileName);}
  const token=crypto.randomUUID();plans.set(token,{id,profile:structuredClone(profile),fingerprint:fingerprint(profile),inventory:rows,version,loader,compatible,incompatible,created:Date.now()});
  for(const [key,value]of plans)if(Date.now()-value.created>1800000)plans.delete(key);
  return {token,from:profile.version,version,loader,updates:compatible.map(c=>({title:c.next.title,version:c.next.version,added:!c.old})),incompatible};
 }
 async function apply(token,choices={},onProgress=()=>{}){
  const p=plans.get(token);if(!p||Date.now()-p.created>1800000)throw Error('This version check expired. Check again.');if(busy.has(p.id)||isRunning(p.id))throw Error('This profile is busy');
  for(const row of p.incompatible)if(!['disable','delete'].includes(choices[row.key]))throw Error('Choose Disable or Delete for every incompatible mod');
  busy.add(p.id);const root=directory(p.profile),stage=path.join(root,'.version-change-'+token),stagedMods=path.join(stage,'mods'),mods=path.join(root,'mods'),backup=path.join(root,'backups','version-change-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+token.slice(0,8));let oldMoved=false,newMoved=false;
  try{
   const current=await saved(p.id);if(fingerprint(current.profile)!==p.fingerprint||fingerprint(await inventory(current.profile))!==fingerprint(p.inventory))throw Error('This profile changed since the compatibility check. Check again.');
   await fs.mkdir(stagedMods,{recursive:true});let completed=0;
   for(let i=0;i<p.compatible.length;i+=6){const results=await Promise.allSettled(p.compatible.slice(i,i+6).map(async({next})=>{const dest=path.join(stagedMods,next.fileName+(next.enabled===false?'.disabled':''));await io.download(next.url,dest,{sha1:next.sha1});if(next.sha512&&await hash(dest)!==next.sha512)throw Error('Checksum failed: '+next.title);onProgress({detail:'Updating '+next.title,pct:Math.round(++completed/Math.max(1,p.compatible.length)*80)});}));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
   const nextMods=[...(p.profile.mods||[]).filter(m=>!/\.jar$/i.test(m.fileName||'')),...p.compatible.map(c=>c.next)];
   // Preserve non-mod files (including manually installed pack archives) on commit.
   for(const name of await fs.readdir(mods).catch(e=>{if(e.code==='ENOENT')return [];throw e;}))if(!/\.jar(?:\.disabled)?$/i.test(name)&&!['monkeyclient-version.json','fabric-api-version.json'].includes(name)){
    const from=path.join(mods,name),stat=await fs.lstat(from);if(stat.isSymbolicLink())throw Error('Cannot migrate a linked mod file: '+name);
    if(stat.isDirectory())await copyTree(from,path.join(stagedMods,name));else if(stat.isFile())await fs.copyFile(from,path.join(stagedMods,name));
   }
   for(const row of p.inventory)if(choices[row.key]==='disable'){
    const next={...row,enabled:false,incompatibleWith:p.version};delete next.diskName;delete next.hash;delete next.key;
    const target=path.join(stagedMods,row.fileName+'.disabled');if(row.diskName)await fs.copyFile(path.join(mods,row.diskName),target);else if(row.url)await io.download(row.url,target,{sha1:row.sha1});nextMods.push(next);
   }
   const next={...p.profile,version:p.version,loader:p.loader,mods:nextMods};
   await installManaged({...next,settings:{...next.settings,gameDir:stage}},progress=>onProgress(progress));
   // Recheck after downloads, before any installed file or saved profile changes.
   const latest=await saved(p.id);if(fingerprint(latest.profile)!==p.fingerprint||fingerprint(await inventory(latest.profile))!==fingerprint(p.inventory))throw Error('Profile changed while downloading. No installed files were changed.');
   await fs.mkdir(backup,{recursive:true});await fs.writeFile(path.join(backup,'profile.json'),JSON.stringify(p.profile,null,2));
   for(const file of ['options.txt','optionsof.txt','optionsshaders.txt'])await copyFileMissing(path.join(root,file),path.join(backup,file));
   try{await fs.rename(mods,path.join(backup,'mods'));oldMoved=true;}catch(e){if(e.code!=='ENOENT')throw e;}
   await fs.rename(stagedMods,mods);newMoved=true;latest.data.profiles=latest.data.profiles.map(profile=>profile.id===p.id?next:profile);
   await store.saveData(latest.data);plans.delete(token);return {profile:next,backup};
  }catch(error){
   if(newMoved)await fs.rename(mods,stagedMods);
   if(oldMoved)await fs.rename(path.join(backup,'mods'),mods);
   throw error;
  }finally{busy.delete(p.id);await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});}
 }
 async function remove(id){
  if(isRunning(id)||busy.has(id))throw Error('Close this profile before deleting it.');
  busy.add(id);
  let moved=false,root,stage;
  try{
   const {data,profile}=await saved(id);directory(profile);
   root=path.resolve(io.instance(id));const parent=path.resolve(io.instance('.'));
   if(path.dirname(root)!==parent||path.basename(root)!==id)throw Error('Invalid instance directory');
   for(const other of data.profiles||[])if(other.id!==id){const d=directory(other);if(d===root||d.startsWith(root+path.sep))throw Error('Another profile uses this instance folder. Change its game directory first.');}
   const stat=await fs.lstat(root).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
   if(stat?.isSymbolicLink())throw Error('This instance folder is a link. Its files were preserved.');
   stage=path.join(parent,'.deleting-'+id+'-'+crypto.randomUUID());
   if(stat){await fs.rename(root,stage);moved=true;}
   data.profiles=data.profiles.filter(p=>p.id!==id);
   if(data.selId===id)data.selId=data.profiles[0]?.id||null;
   try{await store.saveData(data);}catch(error){if(moved)await fs.rename(stage,root);moved=false;throw error;}
   let cleanupWarning=null;
   if(moved)try{await fs.rm(stage,{recursive:true,force:true,maxRetries:3,retryDelay:150});}catch(error){cleanupWarning='The profile was removed, but some files are locked: '+stage;}
   return {profiles:data.profiles,selId:data.selId,customDirectoryPreserved:!!profile.settings?.gameDir&&path.resolve(profile.settings.gameDir)!==root,cleanupWarning};
  }finally{busy.delete(id);}
 }
 return {inherit,plan,apply,inventory,remove,isBusy:id=>busy.has(id)};
}
module.exports={createProfileService,fileName};
