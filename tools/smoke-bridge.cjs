const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
app.commandLine.appendSwitch('no-sandbox');
app.on('window-all-closed',()=>{});
const me={name:'TestPlayer',uuid:'a'.repeat(32)},friend={uuid:'b'.repeat(32),name:'TestFriend',online:true},stranger={uuid:'c'.repeat(32),name:'Builder'};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFZkAAAAASUVORK5CYII=';
const group={id:'group-test',name:'Building crew',owner:me.uuid,icon:png,members:[me.uuid,friend.uuid,stranger.uuid]};
let state={account:me,profiles:[],skins:[],friends:[],requests:[],chats:{}},deletes=0,bridge;
for(const channel of ['store:load','store:save','auth:account','auth:accounts','app:version','net:connected','net:call','game:instances','update:status','screenshots:list','screenshots:delete','mc:skin'])ipcMain.handle(channel,async(_e,arg)=>{
 switch(channel){
  case 'store:load':return state;
  case 'store:save':state={...state,...arg};return state;
  case 'auth:account':return me;
  case 'auth:accounts':return {accounts:[me],active:me.uuid};
  case 'app:version':return '0.10.0';
  case 'net:connected':return true;
  case 'game:instances':return [];
  case 'update:status':return {state:'idle'};
  case 'mc:skin':return {ok:false};
  case 'screenshots:list':return {ok:true,data:{items:deletes?[]:[{id:'shot',name:'World.png',profile:'Deleted profile',thumbnail:png,created:Date.now()}],total:deletes?0:1,hasMore:false}};
  case 'screenshots:delete':deletes++;return {ok:true,data:true};
  case 'net:call':{const data={friends:{friends:[friend]},requests:{requests:[]},groups:{groups:[group]},groupMembers:{members:[{uuid:me.uuid,name:me.name},friend,stranger]},groupHistory:{messages:[{id:'message',from:stranger.uuid,name:stranger.name,t:'Our base!',at:Date.now()}]},history:{messages:[]}};return {ok:true,data:data[arg.method]||{}};}
 }
});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<150;i++){if(await fn())return;await wait(100);}throw Error('Timed out waiting for bridge UI');}
app.whenReady().then(async()=>{
 bridge=require('../electron/game-ui').createGameUI({BrowserWindow,net:{}});const env=await bridge.session('test'),headers={Authorization:'Bearer '+env.MONKEY_UI_TOKEN,'Content-Type':'application/json'};
 const post=async(route,body)=>{const r=await fetch(env.MONKEY_UI_URL+route,{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,200,await r.text());};
 await post('/open',{tab:'friends'});const win=BrowserWindow.getAllWindows()[0],wc=win.webContents,errors=[];wc.on('console-message',(_e,level,message)=>{if(level>=3&&!/ERR_|WebGL|favicon/i.test(message))errors.push(message);});
 const js=code=>wc.executeJavaScript(code);await until(()=>js("document.body.classList.contains('boot-ready')"));
 assert.equal(await js("getComputedStyle(document.querySelector('.rail')).display"),'none');
 await js("openChat('group:group-test')");await until(()=>js("!!document.querySelector('.group-people')&&document.querySelector('.group-people').textContent.includes('Builder')"));
 assert.equal(await js("document.querySelectorAll('[data-act=group-friend]').length"),1);
 assert.ok(await js("document.querySelector('.chat').textContent.includes('Builder')"));
 await until(()=>js("!document.querySelector('#boot-screen')"));await wait(250);
 await fs.mkdir('build/ui-check',{recursive:true});let frame=await fetch(env.MONKEY_UI_URL+'/frame',{headers});assert.equal(frame.status,200);await fs.writeFile('build/ui-check/in-game-friends.png',Buffer.from(await frame.arrayBuffer()));
 await post('/open',{tab:'screenshots'});await until(()=>js("document.body.textContent.includes('World.png')"));
 const click=async selector=>{const pos=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await post('/input',{type:'mouseDown',button:'left',...pos});await post('/input',{type:'mouseUp',button:'left',...pos});};
 await click('[data-act=shot-delete]');await until(()=>js("document.querySelector('#modal').textContent.includes('Delete')"));
 await fs.writeFile('build/ui-check/in-game-delete.png',(await wc.capturePage()).toPNG());
 await js('closeModal()');assert.equal(deletes,0);
 await post('/open',{tab:'skins'});await until(()=>js("document.body.textContent.includes('Add a skin')"));
 await fs.writeFile('build/ui-check/in-game-skins.png',(await wc.capturePage()).toPNG());
 assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS real Electron offscreen friends, group members, author names, screenshot controls and skins');
 const gameArg=process.argv.indexOf('--game');if(gameArg>=0){const cp=require('node:child_process');await new Promise((resolve,reject)=>{const child=cp.spawn('node',['tools/smoke-game.cjs',...process.argv.slice(gameArg+1)],{stdio:'inherit',env:{...process.env,...env}});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Game bridge check failed: '+code)));});}
 bridge.close();app.exit(0);
}).catch(e=>{console.error(e);bridge?.close();app.exit(1);});
setTimeout(()=>{console.error('Bridge test timed out');bridge?.close();app.exit(1);},process.argv.includes('--game')?900000:90000).unref();
