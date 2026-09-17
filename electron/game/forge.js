/* Use Forge's official client installer and generated launch metadata. */
const path=require('path'),{spawn}=require('child_process');
const io=require('./io'),java=require('./java'),{assertSupported}=require('./versions');
const pending=new Map();
function runInstaller(javaBin,installer,root,onProgress){return new Promise((resolve,reject)=>{
 const executable=process.platform==='win32'?javaBin.replace(/javaw\.exe$/i,'java.exe'):javaBin;
 const child=spawn(executable,['-Djava.awt.headless=true','-jar',installer,'--installClient',root],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let tail='';
 const output=chunk=>{tail=(tail+chunk).slice(-16000);const line=chunk.toString().split(/\r?\n/).filter(Boolean).at(-1);if(line)onProgress({stage:'forge',pct:84,detail:line.slice(0,180)});};
 child.stdout.on('data',output);child.stderr.on('data',output);child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Forge installation failed ('+code+'): '+tail.slice(-1600))));
});}
async function install(version,onProgress=()=>{}){
 const release=assertSupported(version.id,'forge'),id=version.id+'-forge-'+release.forge;
 if(pending.has(id))return pending.get(id);
 const promise=(async()=>{
  const root=io.shared(),metaFile=io.shared('versions',id,id+'.json'),marker=io.shared('versions',id,'monkey-install-complete.json');
  try{const profile=JSON.parse(await io.fsp.readFile(metaFile,'utf8'));const state=JSON.parse(await io.fsp.readFile(marker,'utf8'));if(state.id===id&&await librariesPresent(profile))return profile;}catch{}
  onProgress({stage:'forge',pct:82,detail:'Installing Forge '+release.forge});
  const coordinate=version.id+'-'+release.forge,installer=io.shared('installers','forge-'+coordinate+'.jar');
  await io.download('https://maven.minecraftforge.net/net/minecraftforge/forge/'+coordinate+'/forge-'+coordinate+'-installer.jar',installer);
  await io.ensureDir(root);const launcherProfiles=io.shared('launcher_profiles.json');try{await io.fsp.writeFile(launcherProfiles,JSON.stringify({profiles:{},settings:{},version:3}),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
  const javaBin=await java.ensure(version,false,onProgress);await runInstaller(javaBin,installer,root,onProgress);
  const profile=JSON.parse(await io.fsp.readFile(metaFile,'utf8'));if(profile.inheritsFrom!==version.id)throw Error('Forge installed a different game version');
  if(!await librariesPresent(profile))throw Error('Forge did not finish generating its client libraries');
  await io.fsp.writeFile(marker,JSON.stringify({id,installed:Date.now()}));return profile;
 })();pending.set(id,promise);try{return await promise;}finally{pending.delete(id);}
}
async function librariesPresent(profile){for(const lib of profile.libraries||[]){if(!io.allowed(lib.rules))continue;const a=lib.downloads?.artifact;if(a&&!await io.verified(io.shared('libraries',a.path),a.sha1,a.size))return false;}return true;}
module.exports={install,runInstaller,librariesPresent};
