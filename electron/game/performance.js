const path=require('node:path'),crypto=require('node:crypto'),catalog=require('./performance-catalog.json');
function selection(profile){const mode=profile.settings?.performance||'balanced';return (catalog.profiles.find(r=>r.minecraft===profile.version&&r.loader===profile.loader)?.mods||[]).filter(m=>mode!=='off'&&(mode==='maximum'||m.tier==='balanced'));}
async function sync(profile,onProgress=()=>{},io=require('./io')){
 const fs=io.fsp,dir=path.resolve(profile.settings?.gameDir||io.instance(profile.id)),mods=path.join(dir,'mods'),manifest=path.join(dir,'monkey-performance.json');await fs.mkdir(mods,{recursive:true});
 const old=await fs.readFile(manifest,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return {files:[]};throw e;});
 const selected=selection(profile).filter(m=>!(profile.mods||[]).some(u=>u.projectId===m.projectId));
 const owned=new Map((old.files||[]).map(f=>[f.fileName,f]));
 const safe=n=>/^monkey-perf-[A-Za-z0-9]+\.jar$/.test(n);
 const digest=async file=>crypto.createHash('sha512').update(await fs.readFile(file)).digest('hex');
 for(const row of selected){
  if(!safe(row.fileName))throw Error('Invalid optimization filename');
  const target=path.join(mods,row.fileName),stat=await fs.lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(stat?.isSymbolicLink())throw Error('Optimization file is a link');
  if(stat){const hash=await digest(target);if(hash!==row.sha512&&hash!==owned.get(row.fileName)?.sha512)throw Error('A custom optimization file occupies '+row.fileName+'. Move it before changing the preset.');}
  onProgress({stage:'mods',pct:89,detail:'Optimizing '+row.title});
  // Stage and verify before replacing the managed copy.
  const stage=path.join(dir,'.performance-'+row.projectId+'.jar');await io.download(row.url,stage,{sha1:row.sha1});if(await digest(stage)!==row.sha512)throw Error('Optimization checksum mismatch: '+row.title);
  await fs.rename(stage,target);
 }
 const wanted=new Set(selected.map(m=>m.fileName));
 for(const row of old.files||[])if(safe(row.fileName)&&!wanted.has(row.fileName)){
  const file=path.join(mods,row.fileName),stat=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(stat?.isFile()&&!stat.isSymbolicLink()&&await digest(file)===row.sha512)await fs.unlink(file);
 }
 await fs.writeFile(manifest+'.tmp',JSON.stringify({mode:profile.settings?.performance||'balanced',files:selected.map(m=>({fileName:m.fileName,sha512:m.sha512}))}));await fs.rename(manifest+'.tmp',manifest);
 return selected;
}
module.exports={selection,sync,catalog};
