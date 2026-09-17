const crypto=require('node:crypto');
const REDIRECT='https://login.microsoftonline.com/common/oauth2/nativeclient';
function request(clientId){
 const verifier=crypto.randomBytes(32).toString('base64url'),state=crypto.randomBytes(24).toString('base64url');
 const query=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:REDIRECT,response_mode:'query',scope:'XboxLive.signin offline_access',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'});
 return {verifier,state,url:'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?'+query};
}
function response(url,state){
 const u=new URL(url);if(u.origin+u.pathname!==REDIRECT)return null;
 if(u.searchParams.get('state')!==state)throw Error('Microsoft sign-in state did not match. Please try again.');
 if(u.searchParams.has('error'))throw Error(u.searchParams.get('error_description')||'Microsoft sign-in declined.');
 const code=u.searchParams.get('code');if(!code)throw Error('Microsoft did not return a sign-in code.');return code;
}
function open(request,{BrowserWindow,parent,isCancelled}){return new Promise((resolve,reject)=>{
 const window=new BrowserWindow({width:560,height:760,title:'Sign in with Microsoft',parent,modal:!!parent,autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,partition:'monkey-microsoft-login'}});
 let done=false;const finish=(error,code)=>{if(done)return;done=true;clearInterval(cancel);clearTimeout(timeout);if(!window.isDestroyed())window.close();error?reject(error):resolve(code);};
 const cancel=setInterval(()=>{if(isCancelled?.())finish(Object.assign(Error('Sign-in cancelled.'),{code:'cancelled'}));},200);
 const timeout=setTimeout(()=>finish(Error('Microsoft sign-in timed out. Please try again.')),300000);
 window.on('closed',()=>finish(Object.assign(Error('Sign-in cancelled.'),{code:'cancelled'})));
 const navigate=(event,url)=>{try{const code=response(url,request.state);if(code){event.preventDefault();finish(null,code);}else if(new URL(url).protocol!=='https:')event.preventDefault();}catch(error){event.preventDefault();finish(error);}};
 window.webContents.on('will-redirect',navigate);window.webContents.on('will-navigate',navigate);
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.session.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));
 window.loadURL(request.url).catch(error=>finish(error));
});}
module.exports={request,response,open,REDIRECT};
