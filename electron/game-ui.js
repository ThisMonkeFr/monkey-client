/* Data-only loopback API. Minecraft renders its own UI: no browser windows,
   frame streaming or input forwarding. Tokens are scoped to running games. */
const http=require('node:http'),crypto=require('node:crypto');
const SOCIAL=new Set(['friends','requests','addFriend','acceptRequest','declineRequest','removeFriend','history','send','groups','createGroup','updateGroup','leaveGroup','groupHistory','groupMembers','attachment','sendGroup']);
function createGameUI({net,services=()=>({})}){
 const sessions=new Map();let server,starting,revision=0,lastError=null;
 async function start(){if(starting)return starting;starting=new Promise((resolve,reject)=>{server=http.createServer(handle);server.on('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});return starting;}
 async function body(req){let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>6*1024*1024)throw Error('Request too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
 function socialAccount(api,s){const a=api.account?.();if(!a||a.uuid?.replace(/-/g,'')!==s.uuid?.replace(/-/g,''))throw Error('Select this Minecraft account in the launcher to use Friends.');return {uuid:a.uuid.replace(/-/g,''),name:a.name};}
 async function handle(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  const token=req.headers.authorization?.replace(/^Bearer /,''),s=sessions.get(token);
  if(!s||req.headers.origin){res.writeHead(401);res.end('{}');return;}
  try{
   const url=new URL(req.url,'http://127.0.0.1'),api=services();let result;
   if(req.method==='GET'&&url.pathname==='/events'){result={revision};const a=api.account?.();if(lastError&&a?.uuid?.replace(/-/g,'')===s.uuid?.replace(/-/g,''))result.error=lastError;}
   else if(req.method==='POST'){
    const b=await body(req);
    switch(url.pathname){
     case '/profile/share':result=await net.shareProfile(b.code,b.profile);break;
     case '/profile/import':result=await net.importProfile(b.code);break;
     case '/social':{const account=socialAccount(api,s);const [friends,requests,groups]=await Promise.all([net.friends(),net.requests(),net.groups()]);result={...friends,...requests,...groups,account,connected:net.isConnected()};break;}
     case '/net':socialAccount(api,s);if(!SOCIAL.has(b.method)||!Array.isArray(b.args)||b.args.length>3)throw Error('Unknown social action');result=await net[b.method](...b.args);break;
     case '/avatar':socialAccount(api,s);result=await api.library.avatar(b.uuid);break;
     case '/library/list':result=await api.library.list(b);break;
     case '/library/item':result=await api.library.item(b);break;
     case '/library/save':result=await api.library.save(b);break;
     case '/library/import':result=await api.library.import(b);break;
     case '/library/lookup':result=await api.library.lookup(b);break;
     case '/library/equip':result=await api.library.equip(b,s);break;
     case '/library/delete':result=await api.library.remove(b);break;
     case '/image/pick':result=await api.library.pickIcon();break;
     case '/screenshots/list':result=await api.screenshots.list({offset:b.offset,limit:b.limit,profileId:b.current?s.profileId:null});break;
     case '/screenshots/image':result=await api.screenshots.image(b.id);break;
     case '/screenshots/delete':result={deleted:await api.screenshots.remove(b.id)};break;
     case '/screenshots/open':result={opened:await api.screenshots.open(b.id,!!b.reveal)};break;
     case '/screenshots/local-delete':result={deleted:await api.screenshots.removeSource(s.gameDir,b.name)};break;
     case '/screenshots/attach':socialAccount(api,s);result=await net.uploadAttachment({...await api.screenshots.attachment(b.id),to:b.to,groupId:b.groupId});break;
     default:res.writeHead(404);res.end('{}');return;
    }
   }else {res.writeHead(404);res.end('{}');return;}
   res.end(JSON.stringify(result??{}));
  }catch(error){res.writeHead(400);res.end(JSON.stringify({error:error.message}));}
 }
 return {
  async session(id,context={}){const port=await start(),token=crypto.randomBytes(32).toString('hex');sessions.set(token,{id,...context});return {MONKEY_UI_URL:'http://127.0.0.1:'+port,MONKEY_UI_TOKEN:token};},
  release(id){for(const [key,s] of sessions)if(s.id===id)sessions.delete(key);},
  broadcast(channel,payload){if(['net:event','net:status','store:changed'].includes(channel))revision++;if(channel==='net:event'&&payload?.type==='message-error')lastError={revision,message:String(payload.message||'Message could not be sent.').slice(0,200)};},
  close(){sessions.clear();server?.close();}
 };
}
module.exports={createGameUI};
