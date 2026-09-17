const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'monkey-instances-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));let profiles=[];const io={fsp:fs,root:()=>root,setProfiles:p=>profiles=p,instance:(id,...parts)=>path.join(root,'instances',profiles.find(p=>p.id===id)?.directoryName||id,...parts)};
 function load(name){const context={module:{exports:{}},require:n=>n==='./io'?io:require(n)};vm.runInNewContext(require('node:fs').readFileSync(path.join(__dirname,'../electron/game',name),'utf8'),context);return context.module.exports;}
 return {root,io,dirs:load('directories.js'),copies:load('instance-copies.js')};}
test('named directories retain worlds, handle duplicate names and roll back failed saves',async t=>{
 const f=await fixture(t),old={profiles:[{id:'abc',name:'Old'}]};await fs.mkdir(f.io.instance('abc','saves'),{recursive:true});await fs.writeFile(f.io.instance('abc','saves','world.dat'),'world');
 const result=await f.dirs.reconcile({profiles:[{id:'abc',name:'Creative'},{id:'def',name:'Creative'}]},old);assert.equal(result.data.profiles[0].directoryName,'Creative');assert.equal(result.data.profiles[1].directoryName,'Creative (2)');assert.equal(await fs.readFile(path.join(f.root,'instances','Creative','saves','world.dat'),'utf8'),'world');
 await result.rollback();assert.equal(await fs.readFile(f.io.instance('abc','saves','world.dat'),'utf8'),'world');
});
test('active instances retain their path and unsafe names cannot escape the instances directory',async t=>{
 const f=await fixture(t);f.dirs.configure(()=>true);const old={profiles:[{id:'abc',name:'Before',directoryName:'Before'}]};const r=await f.dirs.reconcile({profiles:[{id:'abc',name:'After'}]},old);assert.equal(r.data.profiles[0].directoryName,'Before');
 assert.equal(f.dirs.safeName('../Bad:Profile'),'.._Bad_Profile');assert.equal(f.dirs.safeName('CON'),'_CON');await assert.rejects(f.dirs.reconcile({profiles:[{id:'../bad',name:'Bad'}]},{}),/Invalid profile/);
});
test('extra sessions have isolated worlds and config, reuse free slots and refresh mods',async t=>{
 const f=await fixture(t),p={id:'abc',name:'Creative',version:'26.2',loader:'fabric',settings:{}};
 for(const [name,data]of Object.entries({'options.txt':'one','config/monkeyclient/mod-profiles/pvp.json':'profile','mods/client.jar':'v1','saves/Live/level.dat':'live'})){const file=f.io.instance('abc',name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,data);}
 const second=await f.copies.prepareCopy(p,new Set([f.io.instance('abc')]));assert.equal(second.sessionName,'Session 2');assert.equal(await fs.readFile(path.join(second.settings.gameDir,'config/monkeyclient/mod-profiles/pvp.json'),'utf8'),'profile');await assert.rejects(fs.stat(path.join(second.settings.gameDir,'saves/Live/level.dat')));
 await fs.mkdir(path.join(second.settings.gameDir,'saves/Independent'),{recursive:true});await fs.writeFile(path.join(second.settings.gameDir,'saves/Independent/level.dat'),'independent');await fs.writeFile(path.join(second.settings.gameDir,'options.txt'),'two');await fs.writeFile(f.io.instance('abc','mods/client.jar'),'v2');
 const third=await f.copies.prepareCopy(p,new Set([f.io.instance('abc'),second.settings.gameDir]));assert.equal(third.sessionName,'Session 3');
 const reused=await f.copies.prepareCopy(p,new Set([f.io.instance('abc')]));assert.equal(reused.settings.gameDir,second.settings.gameDir);assert.equal(await fs.readFile(path.join(reused.settings.gameDir,'options.txt'),'utf8'),'two');assert.equal(await fs.readFile(path.join(reused.settings.gameDir,'mods/client.jar'),'utf8'),'v2');assert.equal(await fs.readFile(path.join(reused.settings.gameDir,'saves/Independent/level.dat'),'utf8'),'independent');assert.equal(await fs.readFile(f.io.instance('abc','options.txt'),'utf8'),'one');
});
