const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const performance=require('../electron/game/performance');
test('catalog selects only the exact loader/version and keeps visual tradeoffs optional',()=>{
 const profile=(version,loader,mode)=>({version,loader,settings:{performance:mode}});
 for(const version of ['26.3','26.2','26.1.2','26.1.1','26.1','1.21.11','1.21.10','1.21.9']){
  const balanced=performance.selection(profile(version,'fabric','balanced'));assert.ok(balanced.some(m=>m.title==='Lithium'));assert.ok(balanced.every(m=>m.tier==='balanced'));assert.equal(performance.selection(profile(version,'vanilla','maximum')).length,0);assert.equal(performance.selection(profile(version,'fabric','off')).length,0);
 }
 assert.equal(performance.selection(profile('26.2','forge','maximum')).length,0);assert.equal(performance.selection(profile('1.21.10','forge','maximum'))[0].title,'Entity Culling');
 for(const row of performance.catalog.profiles)for(const mod of row.mods){assert.match(mod.sha512,/^[a-f0-9]{128}$/);assert.match(mod.url,/^https:\/\/cdn\.modrinth\.com\//);}
});
test('turning off optimizations removes only owned unchanged files',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'monkey-perf-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const mods=path.join(root,'mods');await fs.mkdir(mods);const hash=s=>crypto.createHash('sha512').update(s).digest('hex');
 await fs.writeFile(path.join(mods,'monkey-perf-owned.jar'),'owned');await fs.writeFile(path.join(mods,'monkey-perf-edited.jar'),'custom');await fs.writeFile(path.join(mods,'user.jar'),'user');await fs.writeFile(path.join(root,'monkey-performance.json'),JSON.stringify({files:[{fileName:'monkey-perf-owned.jar',sha512:hash('owned')},{fileName:'monkey-perf-edited.jar',sha512:hash('original')}]}));
 await performance.sync({id:'test',version:'26.2',loader:'fabric',settings:{performance:'off'}},()=>{},{fsp:fs,instance:()=>root});
 await assert.rejects(fs.stat(path.join(mods,'monkey-perf-owned.jar')));assert.equal(await fs.readFile(path.join(mods,'monkey-perf-edited.jar'),'utf8'),'custom');assert.equal(await fs.readFile(path.join(mods,'user.jar'),'utf8'),'user');
});
