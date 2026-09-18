const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),yauzl=require('yauzl');
const bundle=path.resolve(__dirname,'../bundled');
function entries(file){return new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true},(error,zip)=>{
 if(error)return reject(error);const result=[];zip.on('error',reject);zip.on('end',()=>resolve(result));
 zip.on('entry',entry=>{
  if(!entry.fileName.startsWith('gg/monkeyclient/')&&!entry.fileName.endsWith('.mixins.json'))return zip.readEntry();
  if(entry.uncompressedSize>4*1024*1024){zip.close();return reject(Error('Unexpected class size'));}
  zip.openReadStream(entry,(error,stream)=>{if(error)return reject(error);const parts=[];stream.on('error',reject);stream.on('data',p=>parts.push(p));stream.on('end',()=>{result.push({name:entry.fileName,bytes:Buffer.concat(parts)});zip.readEntry();});});
 });zip.readEntry();
}));}
test('all release jars exclude removed movement classes, raw mouse hooks and test probes',async()=>{
 const catalog=JSON.parse(await fs.readFile(path.join(bundle,'monkeyclient.json')));
 const allowed=new Set(catalog.releases.map(row=>row.file));
 const disk=await fs.readdir(bundle);
 assert.deepEqual(disk.filter(name=>name.endsWith('.jar')).sort(),[...allowed].sort(),'No stale bundled releases');
 for(const row of catalog.releases){
  const files=await entries(path.join(bundle,row.file));let classes=0;
  for(const {name,bytes} of files){
   assert.doesNotMatch(name,/(?:ToggleSprint|SprintMixin|WorldProbe|CreateProbe)\.class$/,row.file+': '+name);
   if(name.endsWith('.mixins.json'))assert.ok(!bytes.toString().includes('SprintMixin'),row.file);
   if(name.endsWith('.class')){classes++;
    // These shadow field/injection names survive class remapping. The named
    // bytecode audit in the mod builder separately checks movement API calls.
    for(const forbidden of ['monkeyclient$sensitivity','accumulatedDX','accumulatedDY'])assert.ok(!bytes.includes(Buffer.from(forbidden)),row.file+': '+name+' contains '+forbidden);
   }
  }
  assert.ok(classes>100,'Complete Monkey implementation: '+row.file);
 }
});
