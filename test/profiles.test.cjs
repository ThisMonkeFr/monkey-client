const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createProfileService}=require('../electron/game/profiles');
const digest=(value,algorithm)=>crypto.createHash(algorithm).update(value).digest('hex');
async function fixture(t){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'monkey-profile-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 let data={profiles:[{id:'source',name:'Source',version:'26.2',loader:'fabric',settings:{},mods:[{id:'a',projectId:'a',title:'Available',fileName:'old.jar',enabled:true},{id:'b',projectId:'b',title:'Missing',fileName:'missing.jar',enabled:true}]}]};
 const root=path.join(temp,'source'),mods=path.join(root,'mods');await fs.mkdir(mods,{recursive:true});await fs.writeFile(path.join(mods,'old.jar'),'old');await fs.writeFile(path.join(mods,'missing.jar'),'missing');await fs.writeFile(path.join(mods,'local.jar'),'local');
 const release={id:'new-a',project_id:'a',name:'Available',version_number:'2.0',game_versions:['26.3'],loaders:['fabric'],dependencies:[],files:[{filename:'new.jar',primary:true,url:'https://example.invalid/new.jar',hashes:{sha1:digest('new','sha1'),sha512:digest('new','sha512')}}]};
 const control={downloadFails:false,saveFails:false,running:false};
 const io={fsp:fs,instance:id=>path.join(temp,id),download:async(url,dest)=>{if(control.downloadFails)throw Error('download failed');await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,'new');}};
 const store={loadData:async()=>structuredClone(data),saveData:async next=>{if(control.saveFails)throw Error('disk full');data=structuredClone(next);}};
 const fetchImpl=async(url,options)=>({ok:true,status:200,json:async()=>url.endsWith('/version_files')?{}:url.includes('/project/a/')?[release]:[]});
 const service=createProfileService({io,store,fetchImpl,isRunning:()=>control.running,installManaged:async profile=>{await fs.writeFile(path.join(profile.settings.gameDir,'mods/monkeyclient.jar'),'managed');}});
 return {service,control,root,mods,temp,store,release,get data(){return data;}};
}
test('new profiles inherit options, shader configuration and packs without changing the source',async t=>{
 const f=await fixture(t);for(const [name,body] of Object.entries({'options.txt':'fov:0.7','config/iris.properties':'shaderPack=sky.zip','shaderpacks/sky.zip':'shader','resourcepacks/pack.zip':'pack','config/monkeyclient/mod-profiles.json':'{"profiles":[{"name":"PvP"}]}','config/monkeyclient.json':'{"modules":{}}'})){await fs.mkdir(path.dirname(path.join(f.root,name)),{recursive:true});await fs.writeFile(path.join(f.root,name),body);}
 const target={id:'new',version:'26.3',loader:'fabric',settings:{}};const result=await f.service.inherit('source',target);assert.equal(result.copied,6);
 assert.equal(JSON.parse(await fs.readFile(path.join(f.temp,'new/config/monkeyclient/mod-profiles.json'),'utf8')).profiles[0].name,'PvP');assert.equal(await fs.readFile(path.join(f.temp,'new/options.txt'),'utf8'),'fov:0.7');assert.equal(await fs.readFile(path.join(f.temp,'new/config/iris.properties'),'utf8'),'shaderPack=sky.zip');
 await fs.writeFile(path.join(f.temp,'new/options.txt'),'custom');await f.service.inherit('source',target);assert.equal(await fs.readFile(path.join(f.temp,'new/options.txt'),'utf8'),'custom');assert.equal(await fs.readFile(path.join(f.root,'options.txt'),'utf8'),'fov:0.7');
});
test('compatibility includes local JARs and lists only unavailable mods',async t=>{
 const f=await fixture(t),p=await f.service.plan('source','26.3','fabric');assert.equal(p.updates.length,1);assert.deepEqual(p.incompatible.map(r=>r.fileName),['local.jar','missing.jar']);
});
test('version changes update compatible mods, apply all choices, and retain a recovery backup',async t=>{
 const f=await fixture(t),p=await f.service.plan('source','26.3','fabric'),r=await f.service.apply(p.token,{'missing.jar':'disable','local.jar':'delete'});
 assert.deepEqual((await fs.readdir(f.mods)).sort(),['missing.jar.disabled','monkeyclient.jar','new.jar']);assert.equal(f.data.profiles[0].version,'26.3');
 assert.equal(await fs.readFile(path.join(f.mods,'missing.jar.disabled'),'utf8'),'missing');assert.equal(await fs.readFile(path.join(r.backup,'mods/local.jar'),'utf8'),'local');assert.equal(JSON.parse(await fs.readFile(path.join(r.backup,'profile.json'))).version,'26.2');
});
test('download failures leave every installed file and the profile version unchanged',async t=>{
 const f=await fixture(t),p=await f.service.plan('source','26.3','fabric');f.control.downloadFails=true;
 await assert.rejects(f.service.apply(p.token,{'missing.jar':'disable','local.jar':'disable'}),/download failed/);assert.equal(f.data.profiles[0].version,'26.2');assert.equal(await fs.readFile(path.join(f.mods,'old.jar'),'utf8'),'old');assert.deepEqual((await fs.readdir(f.mods)).sort(),['local.jar','missing.jar','old.jar']);
});
test('a failed profile save rolls the installed mod directory back',async t=>{
 const f=await fixture(t),p=await f.service.plan('source','26.3','fabric');f.control.saveFails=true;
 await assert.rejects(f.service.apply(p.token,{'missing.jar':'delete','local.jar':'delete'}),/disk full/);assert.equal(f.data.profiles[0].version,'26.2');assert.deepEqual((await fs.readdir(f.mods)).sort(),['local.jar','missing.jar','old.jar']);
});
test('files changed after the check invalidate the migration',async t=>{
 const f=await fixture(t),p=await f.service.plan('source','26.3','fabric');await fs.writeFile(path.join(f.mods,'old.jar'),'modified');
 await assert.rejects(f.service.apply(p.token,{'missing.jar':'disable','local.jar':'disable'}),/changed since/);assert.equal(await fs.readFile(path.join(f.mods,'old.jar'),'utf8'),'modified');
});
test('each missing mod requires an explicit disposition',async t=>{const f=await fixture(t),p=await f.service.plan('source','26.3','fabric');await assert.rejects(f.service.apply(p.token,{}),/every incompatible/);});
test('unreleased Forge combinations and running instances cannot migrate',async t=>{const f=await fixture(t);await assert.rejects(f.service.plan('source','26.3','forge'),/has not released/);f.control.running=true;await assert.rejects(f.service.plan('source','26.3','fabric'),/Close this profile/);});

test('migration preserves pack metadata and non-JAR files but replaces managed markers',async t=>{
 const f=await fixture(t),data=await f.store.loadData();data.profiles[0].mods.push({id:'pack',fileName:'pack.zip',title:'Pack'});await f.store.saveData(data);
 await fs.writeFile(path.join(f.mods,'readme.txt'),'keep');await fs.writeFile(path.join(f.mods,'monkeyclient-version.json'),'old marker');
 const p=await f.service.plan('source','26.3','fabric');await f.service.apply(p.token,{'missing.jar':'delete','local.jar':'delete'});
 assert.equal(await fs.readFile(path.join(f.mods,'readme.txt'),'utf8'),'keep');assert.ok(f.data.profiles[0].mods.some(m=>m.id==='pack'));await assert.rejects(fs.stat(path.join(f.mods,'monkeyclient-version.json')));
});

test('deleting a profile removes the complete managed instance and updates selection',async t=>{
 const f=await fixture(t),data=await f.store.loadData();data.selId='source';await f.store.saveData(data);
 await fs.mkdir(path.join(f.root,'saves','world'),{recursive:true});await fs.writeFile(path.join(f.root,'saves','world','level.dat'),'world');
 const result=await f.service.remove('source');assert.equal(result.profiles.length,0);assert.equal(f.data.profiles.length,0);await assert.rejects(fs.stat(f.root),{code:'ENOENT'});
});
test('deleting a custom-directory profile preserves that external game directory',async t=>{
 const f=await fixture(t),custom=path.join(f.temp,'custom'),data=await f.store.loadData();await fs.mkdir(custom);await fs.writeFile(path.join(custom,'keep.txt'),'keep');data.profiles[0].settings.gameDir=custom;await f.store.saveData(data);
 const result=await f.service.remove('source');assert.equal(result.customDirectoryPreserved,true);assert.equal(await fs.readFile(path.join(custom,'keep.txt'),'utf8'),'keep');await assert.rejects(fs.stat(f.root));
});
test('deletion refuses active and shared instance folders',async t=>{
 const f=await fixture(t);f.control.running=true;await assert.rejects(f.service.remove('source'),/Close|running/i);f.control.running=false;
 const data=await f.store.loadData();data.profiles.push({id:'other',settings:{gameDir:path.join(f.root,'nested')}});await f.store.saveData(data);await assert.rejects(f.service.remove('source'),/another|shared/i);assert.ok(await fs.stat(f.root));
});
test('failed profile save restores the instance directory after staged deletion',async t=>{
 const f=await fixture(t);f.control.saveFails=true;await assert.rejects(f.service.remove('source'),/disk full/);assert.equal(await fs.readFile(path.join(f.mods,'old.jar'),'utf8'),'old');assert.equal(f.data.profiles.length,1);
});
