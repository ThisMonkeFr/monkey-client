const http=require('node:http'),crypto=require('node:crypto'),path=require('node:path');
const TABS=new Set(['friends','screenshots','skins']);
function createGameUI({BrowserWindow,net}){
 const sessions=new Map();let server,starting;
 async function start(){if(starting)return starting;starting=new Promise((resolve,reject)=>{server=http.createServer(handle);server.on('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});return starting;}
 async function windowFor(s,tab){
  if(s.window&&!s.window.isDestroyed()){if(s.tab!==tab){s.tab=tab;await s.window.webContents.executeJavaScript('go('+JSON.stringify(tab)+')');}s.window.webContents.startPainting();return;}
  s.tab=tab;s.window=new BrowserWindow({show:false,width:1000,height:680,useContentSize:true,webPreferences:{offscreen:true,preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  s.window.webContents.setFrameRate(12);s.window.webContents.on('paint',(_e,_dirty,image)=>{s.frame=image.toPNG();s.revision++;});
  s.window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  await s.window.loadFile(path.join(__dirname,'../renderer/index.html'),{hash:'game-'+tab});
 }
 async function body(req){let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>1100000)throw Error('Request too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
 async function handle(req,res){
  res.setHeader('Cache-Control','no-store');const token=req.headers.authorization?.replace(/^Bearer /,''),s=sessions.get(token);
  if(!s||req.headers.origin){res.writeHead(401);res.end();return;}
  s.touched=Date.now();try{
   const url=new URL(req.url,'http://127.0.0.1');
   if(req.method==='POST'&&url.pathname==='/open'){const b=await body(req);if(!TABS.has(b.tab))throw Error('Invalid tab');await windowFor(s,b.tab);res.end('{}');return;}
   if(req.method==='GET'&&url.pathname==='/frame'){
    if(!s.frame||Number(url.searchParams.get('after'))===s.revision){res.writeHead(204);res.end();return;}
    res.writeHead(200,{'Content-Type':'image/png','X-Frame':String(s.revision)});res.end(s.frame);return;
   }
   if(req.method==='POST'&&url.pathname==='/close'){s.window?.webContents.stopPainting();res.end('{}');return;}
   if(req.method==='POST'&&url.pathname==='/input'){
    const b=await body(req),wc=s.window?.webContents;if(!wc||wc.isDestroyed())throw Error('Open the tab again');
    if(b.type==='text'){if(typeof b.text!=='string'||b.text.length>10000)throw Error('Invalid text');wc.insertText(b.text);}
    else if(['mouseDown','mouseUp','mouseMove','mouseWheel'].includes(b.type)){
     const x=Math.max(0,Math.min(999,Math.round(Number(b.x)||0))),y=Math.max(0,Math.min(679,Math.round(Number(b.y)||0)));
     const button=['left','right','middle'].includes(b.button)?b.button:'left';wc.sendInputEvent({type:b.type,x,y,button,clickCount:1,deltaX:0,deltaY:Math.max(-500,Math.min(500,Number(b.deltaY)||0))});
    }else if(b.type==='key'){if(!['Backspace','Delete','Enter','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Escape','A','C','V','X','Z'].includes(b.key))throw Error('Invalid key');const modifiers=Array.isArray(b.modifiers)?b.modifiers.filter(m=>['control','shift','alt','meta'].includes(m)):[];wc.sendInputEvent({type:'keyDown',keyCode:b.key,modifiers});wc.sendInputEvent({type:'keyUp',keyCode:b.key,modifiers});}
    else throw Error('Invalid input');res.end('{}');return;
   }
   if(req.method==='POST'&&url.pathname==='/profile/share'){const b=await body(req);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await net.shareProfile(b.code,b.profile)));return;}
   if(req.method==='POST'&&url.pathname==='/profile/import'){const b=await body(req);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await net.importProfile(b.code)));return;}
   res.writeHead(404);res.end();
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
 }
 const idle=setInterval(()=>{for(const s of sessions.values())if(s.window&&!s.window.isDestroyed()&&Date.now()-s.touched>30000){s.window.destroy();s.window=null;s.frame=null;}},10000);idle.unref();
 return {async session(id){const port=await start(),token=crypto.randomBytes(32).toString('hex');sessions.set(token,{id,revision:0,touched:Date.now()});return {MONKEY_UI_URL:'http://127.0.0.1:'+port,MONKEY_UI_TOKEN:token};},release(id){for(const [key,s] of sessions)if(s.id===id){s.window?.destroy();sessions.delete(key);}},broadcast(channel,payload){for(const s of sessions.values())if(s.window&&!s.window.isDestroyed())s.window.webContents.send(channel,payload);},close(){clearInterval(idle);for(const s of sessions.values())s.window?.destroy();sessions.clear();server?.close();}};
}
module.exports={createGameUI};
