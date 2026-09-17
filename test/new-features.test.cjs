const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFZkAAAAASUVORK5CYII=','base64');
test('Microsoft direct login uses unique state and PKCE and rejects mismatched callbacks',()=>{
 const auth=require('../electron/browser-auth'),r=auth.request('fixture'),url=new URL(r.url);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('code_challenge'),crypto.createHash('sha256').update(r.verifier).digest('base64url'));assert.notEqual(auth.request('fixture').state,r.state);assert.equal(auth.response(auth.REDIRECT+'?state='+r.state+'&code=good',r.state),'good');assert.throws(()=>auth.response(auth.REDIRECT+'?state=wrong&code=bad',r.state),/state/);assert.equal(auth.response('https://example.com/?code=bad',r.state),null);
});
test('archived screenshots survive removed profiles and deleted images do not return',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'monkey-gallery-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));let profiles=[{id:'one',name:'First'},{id:'two',name:'Second'}];
 for(const p of profiles){const dir=path.join(root,'instances',p.id,'screenshots');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'same.png'),PNG);await fs.writeFile(path.join(dir,'partial.png'),PNG.subarray(0,32));}
 const {createScreenshotService}=require('../electron/screenshots');const options={store:{loadData:async()=>({profiles})},io:{root:()=>root,instance:id=>path.join(root,'instances',id)},nativeImage:{createThumbnailFromPath:async()=>({toJPEG:()=>Buffer.from('thumb')})},shell:{}};let service=createScreenshotService(options),list=await service.list();assert.equal(list.total,2);const removed=list.items.find(s=>s.profileId==='one');await service.remove(removed.id);assert.equal((await service.list()).total,1);profiles=[];await fs.rm(path.join(root,'instances'),{recursive:true});service=createScreenshotService(options);assert.equal((await service.list()).total,1);
});
test('dependency resolution is recursive, exact-version and avoids bundled loader APIs',async()=>{
 const {resolve}=require('../electron/game/dependencies'),profile={version:'26.2',loader:'fabric',mods:[],settings:{performance:'off'}};
 const version=(id,deps=[])=>({id,project_id:id,game_versions:['26.2'],loaders:['fabric'],dependencies:deps,version_number:'1',files:[{primary:true,filename:id+'.jar',url:'https://cdn.modrinth.com/'+id,hashes:{sha1:'a'.repeat(40)}}]});
 const versions={dep:version('dep',[{dependency_type:'required',version_id:'child'}]),child:version('child')};
 const fetch=async url=>({ok:true,json:async()=>url.includes('/version/')?versions[url.split('/').pop()]:{title:url.split('/').pop()}});
 const rows=await resolve(profile,version('root',[{dependency_type:'required',project_id:'P7dR8mSH'},{dependency_type:'required',version_id:'dep'}]),fetch);assert.deepEqual(rows.map(r=>r.projectId),['child','dep']);versions.child.game_versions=['1.21.9'];await assert.rejects(resolve(profile,version('root',[{dependency_type:'required',version_id:'child'}]),fetch),/compatible/);
});
test('native chat deletion removes the source and archive and rejects path traversal',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'monkey-chat-delete-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const dir=path.join(root,'instances','one');await fs.mkdir(path.join(dir,'screenshots'),{recursive:true});await fs.writeFile(path.join(dir,'screenshots','one.png'),PNG);
 const service=require('../electron/screenshots').createScreenshotService({store:{loadData:async()=>({profiles:[{id:'one',name:'One'}]})},io:{root:()=>root,instance:id=>path.join(root,'instances',id)},nativeImage:{createThumbnailFromPath:async()=>({toJPEG:()=>PNG})},shell:{}});
 await assert.rejects(service.removeSource(dir,'../secret.png'),/Invalid/);await service.removeSource(dir,'one.png');await assert.rejects(fs.stat(path.join(dir,'screenshots','one.png')),{code:'ENOENT'});assert.equal((await service.list()).total,0);
 await assert.rejects(service.removeSource(dir,'one.png'),/already been deleted/);
});
test('native data bridge is token-scoped and never exposes streamed UI routes',async t=>{
 const me={uuid:'a'.repeat(32),name:'Test'},calls=[];
 const bridge=require('../electron/game-ui').createGameUI({net:{friends:async()=>({friends:[]}),requests:async()=>({requests:[]}),groups:async()=>({groups:[]}),isConnected:()=>true,send:async(...args)=>calls.push(args)},services:()=>({account:()=>me,library:{list:async()=>({items:[],total:0})}})});t.after(()=>bridge.close());
 const env=await bridge.session('fixture',{uuid:me.uuid}),url=env.MONKEY_UI_URL,headers={Authorization:'Bearer '+env.MONKEY_UI_TOKEN,'Content-Type':'application/json'};
 assert.equal((await fetch(url+'/events')).status,401);assert.equal((await fetch(url+'/events',{headers:{...headers,Origin:'https://example.com'}})).status,401);
 const post=(route,b)=>fetch(url+route,{method:'POST',headers,body:JSON.stringify(b)});
 assert.equal((await post('/open',{tab:'friends'})).status,404);assert.equal((await fetch(url+'/frame',{headers})).status,404);assert.equal((await post('/input',{type:'key'})).status,404);
 assert.equal((await post('/library/list',{kind:'skin'})).status,200);assert.equal((await post('/social',{})).status,200);
 assert.equal((await post('/net',{method:'disconnect',args:[]})).status,400);await post('/net',{method:'send',args:['friend','fixture message']});assert.equal(calls.length,1);
 const before=await (await fetch(url+'/events',{headers})).json();bridge.broadcast('store:changed',{secret:'never sent'});const after=await (await fetch(url+'/events',{headers})).json();assert.equal(after.revision,before.revision+1);assert.deepEqual(Object.keys(after),['revision']);
 me.uuid='b'.repeat(32);assert.equal((await post('/social',{})).status,400);assert.equal((await post('/net',{method:'send',args:['friend','wrong account']})).status,400);assert.equal(calls.length,1);
 bridge.release('fixture');assert.equal((await fetch(url+'/events',{headers})).status,401);
});
