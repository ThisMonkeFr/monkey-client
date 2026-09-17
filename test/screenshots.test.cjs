const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createScreenshotService}=require('../electron/screenshots');
test('gallery combines profiles, filters, paginates and caches thumbnails without loading full PNGs into IPC',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'monkey-shots-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const id of ['a','b']){await fs.mkdir(path.join(root,id,'screenshots'),{recursive:true});for(let i=0;i<3;i++)await fs.writeFile(path.join(root,id,'screenshots',i+'.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFZkAAAAASUVORK5CYII=','base64'));await fs.writeFile(path.join(root,id,'screenshots','ignore.txt'),'ignore');}
 let calls=0,opened=null;
 const service=createScreenshotService({store:{loadData:async()=>({profiles:[{id:'a',name:'First'},{id:'b',name:'Second'}]})},io:{instance:id=>path.join(root,id)},nativeImage:{createThumbnailFromPath:async(file,size)=>{calls++;assert.deepEqual(size,{width:320,height:180});return {toJPEG:()=>Buffer.from('thumbnail')};}},shell:{openPath:async file=>{opened=file;return '';},showItemInFolder:file=>opened=file}});
 const first=await service.list({limit:2});assert.equal(first.total,6);assert.equal(first.items.length,2);assert.equal(first.hasMore,true);assert.equal(calls,2);
 await service.list({limit:2});assert.equal(calls,2);const filtered=await service.list({profileId:'a'});assert.equal(filtered.total,3);assert.ok(filtered.items.every(r=>r.profile==='First'));
 await service.open(first.items[0].id);assert.ok(opened.endsWith('.png'));await assert.rejects(service.open('../../secret'),/Refresh/);
 await fs.unlink(opened);await assert.rejects(service.open(first.items[0].id),{code:'ENOENT'});
});
