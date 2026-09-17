/* Isolated data-service fixture. This deliberately creates zero BrowserWindows. */
const {app,BrowserWindow,nativeImage}=require('electron');
const assert=require('node:assert/strict'),path=require('node:path');
app.commandLine.appendSwitch('no-sandbox');app.on('window-all-closed',()=>{});
const me={name:'ReleaseCheck',uuid:'00000000000000000000000000000001'},friend={uuid:'b'.repeat(32),name:'TestFriend',online:true},stranger={uuid:'c'.repeat(32),name:'Builder'};
let bridge;
app.whenReady().then(async()=>{
 const bitmap=Buffer.alloc(64*64*4);for(let i=0;i<bitmap.length;i+=4){bitmap[i]=180;bitmap[i+1]=80;bitmap[i+2]=90;bitmap[i+3]=255;}
 const png='data:image/png;base64,'+nativeImage.createFromBitmap(bitmap,{width:64,height:64}).toPNG().toString('base64');
 const jpeg='data:image/jpeg;base64,'+nativeImage.createFromDataURL(png).toJPEG(80).toString('base64');
 const group={id:'group-test',name:'Building crew',owner:me.uuid,icon:png,members:[me.uuid,friend.uuid,stranger.uuid]};
 let state={skins:[{id:'skin',name:'Orange monkey',data:png,slim:false}],capes:[],profiles:[]},messages=[];
 const library=require('../electron/game-library').createGameLibrary({store:{loadData:async()=>state,saveData:async patch=>(state={...state,...patch})},nativeImage,pick:async()=>({name:'fixture.png',data:png}),lookupSkin:async()=>({name:'Fixture',data:png,slim:false}),uploadSkin:async()=>({ok:true}),changed:()=>bridge.broadcast('store:changed')});
 library.avatar=async()=>({data:png});
 const net={isConnected:()=>true,friends:async()=>({friends:[friend]}),requests:async()=>({requests:[]}),groups:async()=>({groups:[group]}),groupMembers:async()=>({members:[me,friend,stranger]}),groupHistory:async()=>({messages:[{id:'msg',from:stranger.uuid,name:stranger.name,t:'Our base!',at:Date.now()}]}),history:async()=>({messages:[]}),send:async(...args)=>messages.push(args)};
 bridge=require('../electron/game-ui').createGameUI({net,services:()=>({account:()=>me,library,screenshots:{list:async()=>({items:[{id:'shot',name:'World.png',profile:'Archived profile',thumbnail:jpeg,created:Date.now()}],total:1,hasMore:false}),image:async()=>({data:jpeg})}})});
 const env=await bridge.session('test',{uuid:me.uuid}),headers={Authorization:'Bearer '+env.MONKEY_UI_TOKEN,'Content-Type':'application/json'};
 const post=async(route,body)=>{const r=await fetch(env.MONKEY_UI_URL+route,{method:'POST',headers,body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
 assert.equal(BrowserWindow.getAllWindows().length,0);assert.equal((await post('/social',{})).groups[0].name,'Building crew');assert.equal((await post('/screenshots/list',{})).items[0].name,'World.png');
 assert.equal((await post('/library/list',{kind:'skin'})).items[0].name,'Orange monkey');const item=(await post('/library/item',{kind:'skin',id:'skin'})).item;assert.deepEqual(nativeImage.createFromDataURL(item.data).toBitmap(),nativeImage.createFromDataURL(png).toBitmap());
 const added=await post('/library/save',{kind:'cape',item:{name:'Test cape',data:png}});assert.equal(nativeImage.createFromDataURL(added.item.data).getSize().height,32);
 await post('/library/equip',{kind:'cape',id:added.item.id});assert.equal(state.activeCape,added.item.id);await post('/library/delete',{kind:'cape',id:added.item.id});assert.equal(state.capes.length,0);
 assert.equal(BrowserWindow.getAllWindows().length,0);assert.equal(messages.length,0);console.log('PASS native data API, shared library mutations and no hidden browser windows');
 const gameArg=process.argv.indexOf('--game');if(gameArg>=0){const cp=require('node:child_process');await new Promise((resolve,reject)=>{const child=cp.spawn('node',['tools/smoke-game.cjs',...process.argv.slice(gameArg+1)],{stdio:'inherit',env:{...process.env,...env}});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Native game check failed: '+code)));});}
 assert.equal(messages.length,0);assert.equal(BrowserWindow.getAllWindows().length,0);bridge.close();app.exit(0);
}).catch(e=>{console.error(e);bridge?.close();app.exit(1);});
setTimeout(()=>{console.error('Native data test timed out');bridge?.close();app.exit(1);},process.argv.includes('--game')?900000:90000).unref();
