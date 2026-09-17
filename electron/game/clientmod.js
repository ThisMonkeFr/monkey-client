/* Install only artifacts explicitly built for the selected Minecraft + loader. */
const path=require('path'),crypto=require('crypto');
const io=require('./io'),{fsp}=io;
const {clientModRepo}=require('../config');
const MANAGED='monkeyclient.jar',MARKER='monkeyclient-version.json';
const modsDir=profile=>path.join(profile.settings?.gameDir||io.instance(profile.id),'mods');
function compareVersions(a,b){const parse=v=>/^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v)),av=parse(a),bv=parse(b);if(!av||!bv)return 0;for(let i=1;i<4;i++){const delta=Number(av[i])-Number(bv[i]);if(delta)return Math.sign(delta);}return 0;}
const checksum=data=>crypto.createHash('sha256').update(data).digest('hex');
function matching(catalog,profile){return (catalog.releases||[catalog]).find(item=>item.minecraft===profile.version&&(item.loader||'fabric')===profile.loader&&typeof item.file==='string'&&path.basename(item.file)===item.file&&/^[a-f0-9]{64}$/.test(item.sha256||''));}
async function bundledRelease(profile){try{const dir=path.join(__dirname,'../../bundled'),catalog=JSON.parse(await fsp.readFile(path.join(dir,'monkeyclient.json'),'utf8')),meta=matching(catalog,profile);if(!meta)return null;const local=path.join(dir,meta.file);if(checksum(await fsp.readFile(local))!==meta.sha256)throw Error('Bundled mod checksum mismatch');return {...meta,local};}catch{return null;}}
async function requestJson(url){const response=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json','User-Agent':'MonkeyClient/0.7'}});if(!response.ok)throw Error('HTTP '+response.status);return response.json();}
async function latestRelease(profile){
 const release=await requestJson(`https://api.github.com/repos/${clientModRepo}/releases/latest`),manifest=release.assets?.find(asset=>asset.name==='monkeyclient.json');
 if(!manifest)throw Error('No version-specific mod catalog in the published release');
 const meta=matching(await requestJson(manifest.browser_download_url),profile);if(!meta)throw Error('Published release has no '+profile.loader+' build for '+profile.version);
 const artifact=release.assets.find(asset=>asset.name===meta.file);if(!artifact)throw Error('Published artifact is missing');return {...meta,url:artifact.browser_download_url,size:artifact.size};
}
async function installed(dir,profile){try{const meta=JSON.parse(await fsp.readFile(path.join(dir,MARKER),'utf8'));if(meta.minecraft!==profile.version||meta.loader!==profile.loader)return null;if(checksum(await fsp.readFile(path.join(dir,MANAGED)))!==meta.sha256)return null;return meta;}catch{return null;}}
async function ensureFabricApi(profile,dir,progress){
 if((profile.mods||[]).some(mod=>mod.enabled!==false&&(mod.projectId==='P7dR8mSH'||/^fabric-api[\d+_.-]/i.test(mod.fileName||''))))return;
 const target=path.join(dir,'fabric-api-managed.jar'),marker=path.join(dir,'fabric-api-version.json');
 progress({stage:'mods',pct:88,detail:'Checking Fabric API for '+profile.version});
 try{
  const list=await requestJson('https://api.modrinth.com/v2/project/fabric-api/version?loaders='+encodeURIComponent('["fabric"]')+'&game_versions='+encodeURIComponent(JSON.stringify([profile.version]))),release=list.find(v=>v.version_type==='release')||list[0];
  if(!release)throw Error('No matching Fabric API release');const file=release.files.find(f=>f.primary)||release.files[0];
  await io.download(file.url,target,{sha1:file.hashes.sha1});await fsp.writeFile(marker,JSON.stringify({minecraft:profile.version,sha256:checksum(await fsp.readFile(target))}));
 }catch(error){let valid=false;try{const meta=JSON.parse(await fsp.readFile(marker,'utf8'));valid=meta.minecraft===profile.version&&checksum(await fsp.readFile(target))===meta.sha256;}catch{}if(!valid)throw Error('Could not install Fabric API: '+error.message);}
}
async function ensure(profile,progress=()=>{}){
 if(!['fabric','forge'].includes(profile.loader))return {skipped:'vanilla profile'};
 const dir=modsDir(profile);
 if(profile.settings?.clientMod===false){try{await fsp.rename(path.join(dir,MANAGED),path.join(dir,MANAGED+'.disabled'));}catch(error){if(error.code!=='ENOENT')throw error;}return {skipped:'disabled for this profile'};}
 await io.ensureDir(dir);
 const bundled=await bundledRelease(profile),have=await installed(dir,profile);let release=bundled;
 try{const published=await latestRelease(profile);if(!release||compareVersions(published.version,release.version)>0)release=published;}catch(error){if(!release&&!have)throw Error('No compatible Monkey Client build for '+profile.version+' '+profile.loader+': '+error.message);}
 if(profile.loader==='fabric')await ensureFabricApi(profile,dir,progress);
 if(have&&(!release||compareVersions(have.version,release.version)>=0))return have.version===release?.version?{current:have.version}:{kept:have.version};
 if(!release)throw Error('No compatible Monkey Client artifact');
 progress({stage:'mods',pct:90,detail:'Installing Monkey Client '+release.version+' for '+profile.version+' '+profile.loader});
 const target=path.join(dir,MANAGED),stage=target+'.tmp';
 try{if(release.local)await fsp.copyFile(release.local,stage);else await io.download(release.url,stage,{size:release.size});if(checksum(await fsp.readFile(stage))!==release.sha256)throw Error('Monkey Client artifact checksum mismatch');await fsp.rename(stage,target);}finally{await fsp.unlink(stage).catch(()=>{});}
 await fsp.unlink(target+'.disabled').catch(()=>{});
 await fsp.writeFile(path.join(dir,MARKER),JSON.stringify({version:release.version,minecraft:profile.version,loader:profile.loader,sha256:release.sha256,installed:Date.now()},null,2));
 // Keep duplicate old builds recoverable, outside either loader's scan.
 for(const name of await fsp.readdir(dir))if(name!==MANAGED&&/^monkeyclient.*\.jar$/i.test(name))await fsp.rename(path.join(dir,name),path.join(dir,name+'.disabled'));
 return {installed:release.version};
}
module.exports={ensure,modsDir,matching,compareVersions,bundledRelease};
