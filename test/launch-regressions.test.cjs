const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{EventEmitter}=require('node:events');
function load(file,mocks,extra={}){
 const context={module:{exports:{}},require:name=>Object.hasOwn(mocks,name)?mocks[name]:require(name),process,console,setTimeout,clearTimeout,...extra};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../electron',file),'utf8'),context);return context.module.exports;
}
test('native selection keeps one matching architecture and preserves the macOS patch',()=>{
 const {nativeMatches}=load('game/install.js',{'./io':{}});
 for(const [platform,osName]of [['win32','windows'],['linux','linux'],['darwin','macos']]){
  assert.equal(nativeMatches('natives-'+osName,platform,'x64'),true);
  assert.equal(nativeMatches('natives-'+osName+'-arm64',platform,'x64'),false);
  assert.equal(nativeMatches('natives-'+osName+'-x86',platform,'x64'),false);
  assert.equal(nativeMatches('natives-'+osName+'-arm64',platform,'arm64'),true);
 }
 assert.equal(nativeMatches('natives-macos-patch','darwin','arm64'),true);
 assert.equal(nativeMatches('linux-aarch_64','linux','x64'),false);
 assert.equal(nativeMatches('osx-x86_64','darwin','arm64'),false);
});
test('Java selection requires the exact game major and uses the console executable',async()=>{
 const probed=[];
 const java=load('game/java.js',{'./io':{shared:()=>'/cache/java',fsp:{readdir:async()=>['java25','java21']}},child_process:{spawn:(bin)=>{
  probed.push(bin);const p=new EventEmitter();p.stdout=new EventEmitter();p.stderr=new EventEmitter();p.kill=()=>{};
  queueMicrotask(()=>{p.stderr.emit('data','openjdk version "'+(bin.includes('21')?'21':'25')+'.0.1"');p.emit('close',0);});return p;
 }}},{process:{platform:'win32',arch:'x64',env:{}}});
 assert.match(await java.find(21),/java21/);
 assert.match(await java.ensure({id:'1.21.11',javaVersion:{majorVersion:21}},'C:/java21/bin/javaw.exe'),/java\.exe$/);
 await assert.rejects(java.ensure({id:'1.21.11',javaVersion:{majorVersion:21}},'C:/java25/bin/java.exe'),/needs Java 21/);
 assert.ok(probed.every(bin=>!bin.endsWith('javaw.exe')));
});
test('Fabric replaces the older vanilla ASM artifact without dropping native classifiers',()=>{
 const {inheritedLibraries}=load('game/install.js',{'./io':{}});
 const libs=[{name:'org.ow2.asm:asm:9.6'},{name:'org.lwjgl:lwjgl:3.3.3'},{name:'org.lwjgl:lwjgl:3.3.3:natives-windows'}];
 const retained=inheritedLibraries(libs,[{name:'org.ow2.asm:asm:9.10.1'},{name:'org.lwjgl:lwjgl:3.4.0'}]);
 assert.equal(retained.length,1);assert.equal(retained[0].name,'org.lwjgl:lwjgl:3.3.3:natives-windows');
});
test('launch reservations, confirmation, exits and logs are independent across profiles',async t=>{
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'monkey-launch-'));t.after(()=>fsp.rm(root,{recursive:true,force:true}));
 const handlers=new Map(),events=new Map(),launches=[];
 const mocks={'./game-library':{createGameLibrary:()=>({})},'./game-ui':{createGameUI:()=>({session:async()=>({}),release:()=>{},broadcast:()=>{},close:()=>{}})},electron:{app:{requestSingleInstanceLock:()=>true,on:()=>{},whenReady:()=>({then:()=>{}}),getPath:()=>root},ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},shell:{}},'electron-updater':{autoUpdater:{}},'./auth':{},'./store':{},'./game/directories':{configure:()=>{}},'./game/instance-copies':{prepareCopy:async(p)=>({...p,sessionName:'Session 2',settings:{...p.settings,gameDir:path.join(root,p.id,'sessions','Session 2')}})},'./minecraft':{},'./monkeynet':{},'./sessions':{createRefreshGate:()=>async()=>({accessToken:'test'})},'./game/mods':{sync:async()=>{}},'./game/io':{instance:id=>path.join(root,id)},'./game/profiles':{createProfileService:()=>({isBusy:()=>false})},'./screenshots':{createScreenshotService:()=>({})},'./game/launch':{launch:async(p,account,progress,event)=>{events.set(launches.length,event);launches.push(p.id);event({type:'running'});return {pid:100+launches.length,kill:()=>event({type:'exit',code:0})};}}};
 const context=vm.createContext({require:name=>Object.hasOwn(mocks,name)?mocks[name]:require(name),process,console,setTimeout,setInterval,clearTimeout,__dirname:path.join(__dirname,'../electron')});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../electron/main.js'),'utf8')+'\naccounts=[{uuid:"test",name:"Test"}];activeUuid="test";',context);
 const profile=id=>({id,name:id,loader:'vanilla',version:'26.2',settings:{}}),call=(p,confirmAdditional=false)=>handlers.get('game:launch')(null,{profile:p,confirmAdditional});
 const a=await call(profile('a'));assert.equal(a.ok,true);
 assert.equal((await call(profile('a'))).confirmAdditional,true);
 const a2=await call(profile('a'),true);assert.equal(a2.ok,true);assert.notEqual(a2.instanceId,a.instanceId);
 assert.equal((await call(profile('b'))).confirmAdditional,true);
 const b=await call(profile('b'),true);assert.equal(b.ok,true);
 events.get(0)({type:'log',line:'primary-a'});events.get(1)({type:'log',line:'copy-a'});events.get(2)({type:'log',line:'log-b'});
 events.get(0)({type:'exit',code:1});
 const rows=await handlers.get('game:instances')();assert.equal(rows.length,2);assert.equal(rows[0].profileId,'a');assert.equal(rows[0].sessionName,'Session 2');
 assert.equal(handlers.get('game:log')(null,a.instanceId)[0],'primary-a');assert.equal(handlers.get('game:log')(null,a2.instanceId)[0],'copy-a');assert.equal(handlers.get('game:log')(null,b.instanceId)[0],'log-b');
 handlers.get('game:kill')(null,a2.instanceId);assert.equal((await handlers.get('game:instances')()).length,1);
 assert.deepEqual(launches,['a','a','b']);await vm.runInContext('instanceSave',context);
});
