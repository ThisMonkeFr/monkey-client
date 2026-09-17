const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const auth = require('./auth');
const store = require('./store');
const mc = require('./minecraft');
const net = require('./monkeynet');
const game = require('./game/launch');
const mods = require('./game/mods');
const { autoUpdater } = require('electron-updater');

const gameUI=require('./game-ui').createGameUI({net,services:()=>({account,library:gameLibrary,screenshots})});
let win = null;
/* Several Minecraft accounts can be signed in; one is active at a time. */
let accounts = [];         // [{ name, uuid, accessToken, expiresAt, refreshToken }]
let activeUuid = null;
let cancelSignIn = false;

const account = () => accounts.find(a => a.uuid === activeUuid) || null;
const pub = a => a && { name: a.name, uuid: a.uuid, skins: a.skins, capes: a.capes };
const publicAccount = () => pub(account());
const accountList = () => accounts.map(a => ({
  name: a.name, uuid: a.uuid, active: a.uuid === activeUuid
}));
let persistQueue=Promise.resolve();
const persist = () => {const snapshot=accounts.map(a=>({...a})),active=activeUuid;return persistQueue=persistQueue.catch(()=>{}).then(()=>store.saveSessions(snapshot,active));};
const ensureAccount=require('./sessions').createRefreshGate({find:uuid=>accounts.find(a=>a.uuid===uuid),refresh:auth.refresh,commit:async live=>{const i=accounts.findIndex(a=>a.uuid===live.uuid);if(i<0)throw Error('Account was signed out.');accounts[i]=live;await persist();return live;}});
let switchRevision=0;
function upsert(acc) {
  ++switchRevision;
  const i = accounts.findIndex(a => a.uuid === acc.uuid);
  if (i >= 0) accounts[i] = acc; else accounts.push(acc);
  activeUuid = acc.uuid;
}
const send = (channel,payload)=>{if(win&&!win.isDestroyed())win.webContents.send(channel,payload);gameUI.broadcast(channel,payload);};

function createWindow() {
  win = new BrowserWindow({
    title: 'Monkey Client',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    width: 1240, height: 800, minWidth: 1000, minHeight: 680,
    frame: false, backgroundColor: '#070C09', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // External links open in the real browser, never in the app.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
}

app.whenReady().then(async () => {
  createWindow();
  // Try to restore the previous session silently.
  setupUpdates();
  instancesReady=restoreInstances();
  const saved = await store.loadSessions();
  if (saved.accounts.length) {
    /* Only the active account is refreshed at start-up; the others refresh
       when you switch to them, so start-up stays quick. */
    const wanted = saved.accounts.find(a => a.uuid === saved.active) || saved.accounts[0];
    accounts = saved.accounts.map(a => ({ ...a }));
    activeUuid=wanted.uuid;
    try {
      const live = await ensureAccount(wanted.uuid);
      await persist();
      send('auth:restored', publicAccount());
      send('auth:accounts', accountList());
      connectNet();
    } catch (e) {
      send('auth:restored', publicAccount());
      send('auth:restore-failed', { message: e.message });
      send('auth:accounts', accountList());
    }
  }
});

/* ------------------------------------------------------------------
   Auto-update. Only meaningful in a packaged build — in dev there is no
   installer to replace, so we skip it rather than throw on every start.
   ------------------------------------------------------------------ */
let latestUpdate=null;
function updateStatus(status){latestUpdate={...latestUpdate,...status};send('update:status',latestUpdate);}
ipcMain.handle('update:status',()=>latestUpdate);
function setupUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', i => updateStatus({ state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', () => updateStatus({ state: 'current' }));
  autoUpdater.on('download-progress', p => updateStatus({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', i => updateStatus({ state: 'ready', version: i.version }));
  autoUpdater.on('error', e => updateStatus({ state: 'error', message: String(e.message || e) }));
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return { ok: false, message: 'Updates only run in an installed build, not from npm start.' };
  try { await autoUpdater.checkForUpdates(); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message }; }
});
ipcMain.handle('update:install', () => { autoUpdater.quitAndInstall(); });
ipcMain.handle('app:version', () => app.getVersion());

/* Put a desktop shortcut back if it gets deleted. Windows only — macOS has
   the Applications folder and Linux handles its own .desktop entries. */
ipcMain.handle('app:shortcut', () => {
  if (process.platform !== 'win32')
    return { ok: false, message: 'Shortcuts are a Windows feature.' };
  try {
    const target = process.execPath;
    const link = path.join(app.getPath('desktop'), 'Monkey Client.lnk');
    const ok = shell.writeShortcutLink(link, 'create', {
      target, cwd: path.dirname(target), description: 'Monkey Client', icon: target, iconIndex: 0
    });
    return ok ? { ok: true, path: link } : { ok: false, message: 'Windows refused to write the shortcut.' };
  } catch (e) { return { ok: false, message: e.message }; }
});

app.on('window-all-closed', () => {
  net.disconnect();
  /* Instances stay up on purpose: closing the launcher should not close
     someone's game. They are remembered and shown again next start. */
  saveInstances();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

async function connectNet() {
  if (!account()) return;
  try {
    await net.connect(account(), ev => send('net:event', ev));
    send('net:status', { connected: true });
  } catch (e) {
    send('net:status', { connected: false, message: e.message });
  }
}

/* Refresh the Minecraft token if it is close to expiry. */
async function liveToken(uuid=activeUuid) {
  return (await ensureAccount(uuid)).accessToken;
}

/* ---------------- IPC ---------------- */
ipcMain.handle('auth:sign-in', async (_e, method='code') => {
  cancelSignIn = false;
  try {
    upsert(await auth.signIn({
      method,openAuthorization:r=>require('./browser-auth').open(r,{BrowserWindow,parent:win,isCancelled:()=>cancelSignIn}),
      onProgress: p => send('auth:progress', p),
      isCancelled: () => cancelSignIn
    }));
    await persist();
    connectNet();
    send('auth:accounts', accountList());
    return { ok: true, account: publicAccount() };
  } catch (e) {
    return { ok: false, code: e.code || 'unknown', message: e.message, hint: e.hint || null };
  }
});

ipcMain.handle('auth:accounts', () => accountList());

ipcMain.handle('auth:switch', async (_e, uuid) => {
  const target=accounts.find(a=>a.uuid===uuid),revision=++switchRevision;
  if(!target)return {ok:false,message:'That account was signed out.'};
  try {
    await ensureAccount(uuid);
    if(revision!==switchRevision)return {ok:false,message:'A newer account selection is active.'};
    activeUuid=uuid;net.disconnect();await persist();connectNet();send('auth:accounts',accountList());
    return {ok:true,account:publicAccount()};
  } catch(e) {
    send('auth:accounts',accountList());
    return {ok:false,message:e.message+' Your saved account has been kept.'};
  }
});

ipcMain.handle('auth:cancel', () => { cancelSignIn = true; return true; });

ipcMain.handle('auth:sign-out', async (_e, uuid) => {
  ++switchRevision;
  const target = uuid || activeUuid;
  accounts = accounts.filter(a => a.uuid !== target);
  if (activeUuid === target) {
    activeUuid = accounts.length ? accounts[0].uuid : null;
    net.disconnect();
    if (activeUuid) connectNet();
  }
  if(accounts.length)await persist();
  else await (persistQueue=persistQueue.catch(()=>{}).then(()=>store.clearSessions()));
  send('auth:accounts', accountList());
  return { ok: true, account: publicAccount() };
});

ipcMain.handle('auth:account', () => publicAccount());

ipcMain.handle('mc:lookup', async (_e, name) => {
  try { return await mc.lookupPlayer(name); }
  catch { return { error: 'unavailable' }; }
});

/* Fetch a player's actual skin texture plus whether it uses the slim (Alex)
   model. Mojang's session server is CORS-blocked in the renderer, so it has
   to happen here. */
async function lookupSkin(name) {
  try {
    const p = await mc.lookupPlayer(name);
    if (!p) return { error: 'notfound' };
    const r = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${p.id}`);
    if (!r.ok) return { error: 'unavailable' };
    const j = await r.json();
    const prop = (j.properties || []).find(x => x.name === 'textures');
    if (!prop) return { error: 'noskin' };
    const tex = JSON.parse(Buffer.from(prop.value, 'base64').toString()).textures || {};
    if (!tex.SKIN) return { error: 'noskin' };
    const img = await fetch(tex.SKIN.url);
    const buf = Buffer.from(await img.arrayBuffer());
    /* The cape comes from the same textures blob, so fetch it here too and the
       launcher can mirror whatever the account is actually wearing. */
    let cape = null;
    if (tex.CAPE && tex.CAPE.url) {
      try {
        const cimg = await fetch(tex.CAPE.url);
        const cbuf = Buffer.from(await cimg.arrayBuffer());
        cape = 'data:image/png;base64,' + cbuf.toString('base64');
      } catch {}
    }
    return {
      name: p.name,
      data: 'data:image/png;base64,' + buf.toString('base64'),
      slim: !!(tex.SKIN.metadata && tex.SKIN.metadata.model === 'slim'),
      cape
    };
  } catch (e) { return { error: 'unavailable' }; }
}
ipcMain.handle('mc:skin',(_e,name)=>lookupSkin(name));

async function uploadSkin(uuid, { data, variant }) {

  try {
    const token = await liveToken(uuid);
    const buf = Buffer.from(String(data).split(',').pop(), 'base64');
    const profile = await mc.uploadSkin(token, buf, variant);
    const a = accounts.find(a=>a.uuid===uuid); if (a) a.skins = profile.skins || a.skins;
    return { ok: true };
  } catch (e) { return { ok: false, message: e.message }; }
}
ipcMain.handle('mc:upload-skin',(_e,data)=>uploadSkin(activeUuid,data));

const running = new Map();
const recentLogs = new Map();
const recentLogPaths = new Map();
const LOG_MAX = 400;
let lastProfileId = null;
const instanceList = () => [...running.values()].map(r => ({instanceId:r.instanceId,sessionName:r.sessionName,profile:r.profile,profileId:r.profileId,pid:r.pid||null,startedAt:r.startedAt,logPath:r.logPath||null,state:r.state,gameDir:r.gameDir}));
const INST_FILE = () => path.join(app.getPath('userData'), 'instances.json');
let instanceSave=Promise.resolve(),instancesReady=Promise.resolve();
function saveInstances(){
  const snapshot=JSON.stringify(instanceList().filter(r=>r.pid));
  instanceSave=instanceSave.catch(()=>{}).then(()=>require('fs/promises').writeFile(INST_FILE(),snapshot)).catch(()=>{});
  send('game:instances',instanceList());return instanceSave;
}
async function restoreInstances(){
  try{const rows=JSON.parse(await require('fs/promises').readFile(INST_FILE(),'utf8')),data=await store.loadData();
    for(const prev of rows){if(!prev.profileId){const matches=(data.profiles||[]).filter(p=>p.name===prev.profile);if(matches.length===1)prev.profileId=matches[0].id;}const p=(data.profiles||[]).find(p=>p.id===prev.profileId);if(p&&!prev.gameDir)prev.gameDir=path.resolve(p.settings?.gameDir||require('./game/io').instance(p.id));}
    for(const prev of rows){if(!prev.profileId||!Number.isInteger(prev.pid))continue;
      try{process.kill(prev.pid,0);}catch{continue;}
      const instanceId=prev.instanceId||require('node:crypto').randomUUID();
      running.set(instanceId,{...prev,instanceId,state:'running',external:true,kill:()=>{try{process.kill(prev.pid);}catch{}}});
    }
    send('game:instances',instanceList());
  }catch{}
}
function refreshExternalInstances(){for(const [id,record] of running)if(record.external){try{process.kill(record.pid,0);}catch{running.delete(id);}}}
function rememberLog(id,lines){recentLogs.delete(id);recentLogs.set(id,lines);recentLogPaths.delete(id);while(recentLogs.size>8){const key=recentLogs.keys().next().value;recentLogs.delete(key);recentLogPaths.delete(key);}}
ipcMain.handle('game:launch',async(_e,payload)=>{
  await instancesReady;
  let {profile,confirmAdditional=false}=payload||{};
  if(!profile||!/^[a-zA-Z0-9_-]{1,100}$/.test(profile.id))return {ok:false,message:'Choose a saved profile.'};
  refreshExternalInstances();
  if(profileService.isBusy(profile.id))return {ok:false,message:'This profile is changing versions. Wait for it to finish.'};
  if([...running.values()].some(r=>r.profileId===profile.id&&r.state==='preparing'))return {ok:false,message:'Wait for this profile to finish starting before opening another copy.'};
  if(running.size&&!confirmAdditional)return {ok:false,confirmAdditional:true,instances:instanceList()};
  if(!account())return {ok:false,message:'Sign in before launching.'};
  let dir=path.resolve(profile.settings?.gameDir||require('./game/io').instance(profile.id));
  const duplicate=[...running.values()].some(r=>r.gameDir===dir);
  const instanceId=require('node:crypto').randomUUID();
  const record={instanceId,sessionName:'Primary',profile:profile.name,profileId:profile.id,gameDir:dir,startedAt:Date.now(),state:'preparing',logs:[]};
  running.set(instanceId,record);lastProfileId=instanceId;rememberLog(instanceId,record.logs);
  const progress=p=>send('game:progress',{...p,profileId:profile.id,instanceId});
  try{
    if(duplicate){profile=await require('./game/instance-copies').prepareCopy(profile,new Set([...running.values()].filter(r=>r!==record).map(r=>r.gameDir)));dir=profile.settings.gameDir;record.gameDir=dir;record.sessionName=profile.sessionName;}
    const selectedAccount={...account()},token=await liveToken(selectedAccount.uuid);
    await mods.sync(profile,progress);
    if(['fabric','forge'].includes(profile.loader)){
      const state=await store.loadData();
      await require('./game/cosmetics').sync(dir,state,selectedAccount.uuid,png=>{
        let image=require('electron').nativeImage.createFromBuffer(png);const size=image.getSize();
        if(size.width===size.height)image=image.crop({x:0,y:0,width:size.width,height:size.height/2});
        else if(size.width!==size.height*2)throw Error('Cape must use a 2:1 texture.');
        if(image.getSize().width>2048)throw Error('Cape texture is too large (maximum width 2048).');return image.toPNG();
      });
    }
    const gameEnvironment=await gameUI.session(instanceId,{uuid:selectedAccount.uuid,gameDir:dir,profileId:profile.id});
    const processInfo=await game.launch(profile,{name:selectedAccount.name,uuid:selectedAccount.uuid,accessToken:token},progress,ev=>{
      if(ev.type==='log'){record.logs.push(ev.line);if(record.logs.length>LOG_MAX)record.logs.shift();return;}
      if(ev.logPath){record.logPath=ev.logPath;recentLogPaths.set(instanceId,ev.logPath);}
      if(ev.type==='running'){record.state='running';saveInstances();if(profile.settings.closeOnLaunch&&win)win.hide();}
      send('game:event',{...ev,instanceId,profileId:profile.id,profile:profile.name});
      if(ev.type==='exit'||ev.type==='error'){
        gameUI.release(instanceId);running.delete(instanceId);saveInstances();
        const bad=ev.type==='error'||(ev.code!==0&&ev.code!==null);
        if(bad){const lines=record.logs.length?record.logs.slice(-200):ev.tail||[ev.message||'Java exited before writing output. Full log: '+record.logPath];send('game:crash',{instanceId,profileId:profile.id,profile:profile.name,code:ev.code,log:lines,logPath:record.logPath});}
        if(win){win.show();win.focus();}
      }
    },gameEnvironment);
    if(running.get(instanceId)===record){Object.assign(record,processInfo);recentLogPaths.set(instanceId,processInfo.logPath);saveInstances();}
    return {ok:true,profileId:profile.id,instanceId};
  }catch(error){gameUI.release(instanceId);running.delete(instanceId);saveInstances();return {ok:false,message:error.message};}
});
ipcMain.handle('game:instances',async()=>{await instancesReady;refreshExternalInstances();return instanceList();});
ipcMain.handle('game:log',(_e,id)=>recentLogs.get(id||lastProfileId)||[]);
ipcMain.handle('game:save-log',async(_e,id)=>{
  const key=id||lastProfileId,record=running.get(key),lines=recentLogs.get(key)||[];
  const target=path.join(app.getPath('downloads'),`monkey-client-log-${Date.now()}.txt`);
  const source=record?.logPath||recentLogPaths.get(key),fs=require('fs/promises');
  let copied=false;if(source)try{await fs.copyFile(source,target);copied=true;}catch{}
  if(!copied)await fs.writeFile(target,lines.length?lines.join('\n'):'No console output. '+(source||''),'utf8');shell.showItemInFolder(target);return target;
});
ipcMain.handle('game:kill',(_e,id)=>{
  const record=id?running.get(id):running.size===1?[...running.values()][0]:null;
  if(!record?.kill)return false;record.kill();return true;
});

const withProfile = (fn) => async (_e, payload) => {
  try { return { ok: true, data: await fn(payload) }; }
  catch (e) { return { ok: false, message: e.message }; }
};
ipcMain.handle('mods:dependencies',withProfile(({profile,release})=>require('./game/dependencies').resolve(profile,release)));
ipcMain.handle('profiles:initialize',withProfile(async({id})=>{const data=await store.loadData(),p=data.profiles.find(p=>p.id===id);if(!p)throw Error('Profile missing');await mods.sync(p);return true;}));
ipcMain.handle('mods:download', withProfile(({ profile, mod }) => mods.download(profile, mod)));
ipcMain.handle('mods:remove', withProfile(({ profile, fileName }) => mods.remove(profile, fileName)));
ipcMain.handle('mods:enabled', withProfile(({ profile, fileName, enabled }) => mods.setEnabled(profile, fileName, enabled)));
ipcMain.handle('mods:folder', withProfile(({ profile }) => mods.openFolder(profile)));
const profileService=require('./game/profiles').createProfileService({
  io:require('./game/io'),store,
  installManaged:(profile,progress)=>require('./game/clientmod').ensure(profile,progress),
  isRunning:id=>[...running.values()].some(r=>r.profileId===id)
});
require('./game/directories').configure(id=>[...running.values()].some(r=>r.profileId===id));
ipcMain.handle('profiles:remove',withProfile(async({id})=>{await screenshots.preserve();return profileService.remove(id);}));
const screenshots=require('./screenshots').createScreenshotService({store,io:require('./game/io'),nativeImage:require('electron').nativeImage,shell});
ipcMain.handle('screenshots:list',withProfile(options=>screenshots.list(options)));
ipcMain.handle('screenshots:delete',withProfile(({id})=>screenshots.remove(id)));
ipcMain.handle('screenshots:open',withProfile(({id,reveal})=>screenshots.open(id,reveal)));
ipcMain.handle('screenshots:attach',withProfile(({id,target})=>screenshots.attachment(id).then(image=>net.uploadAttachment({...image,...target}))));
ipcMain.handle('profiles:versions',()=>require('./game/versions').releases);
ipcMain.handle('profiles:inherit',withProfile(({sourceId,profile})=>profileService.inherit(sourceId,profile)));
ipcMain.handle('profiles:plan-version',withProfile(({id,version,loader})=>profileService.plan(id,version,loader)));
ipcMain.handle('profiles:apply-version',withProfile(({token,choices})=>profileService.apply(token,choices,p=>send('profiles:progress',p))));

ipcMain.handle('store:load', async () => {await instancesReady;const data=await store.loadData();return data?store.saveData(data):data;});
ipcMain.handle('store:save', async (_e, obj) => {await instancesReady;const saved=await store.saveData(obj,true);send('store:changed',saved);return saved;});

ipcMain.handle('net:call', async (_e, { method, args = [] }) => {
  try {
      if (!['groupMembers','shareProfile','importProfile','friends','requests','addFriend','acceptRequest','declineRequest','removeFriend','history','send','groups','createGroup','updateGroup','leaveGroup','groupHistory','attachment','sendGroup'].includes(method)) throw new Error('Unknown MonkeyNet call.');
    return { ok: true, data: await net[method](...args) };
  } catch (e) { return { ok: false, message: e.message }; }
});
ipcMain.handle('net:connected', () => net.isConnected());

ipcMain.handle('win:action', (_e, what) => {
  if (!win) return;
  if (what === 'minimize') win.minimize();
  if (what === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  if (what === 'close') win.close();
});

ipcMain.handle('shell:open', (_e, url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});

async function pickPng(anyImage) {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: anyImage
      ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
      : [{ name: 'PNG images', extensions: ['png'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const fs = require('fs/promises');
  const stat=await fs.stat(r.filePaths[0]);if(stat.size>8*1024*1024)throw Error('Choose an image smaller than 8 MB.');
  const buf = await fs.readFile(r.filePaths[0]);
  const ext = path.extname(r.filePaths[0]).slice(1).toLowerCase();
  const mime = { jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp', gif: 'gif' }[ext] || 'png';
  return { name: path.basename(r.filePaths[0]), data: `data:image/${mime};base64,` + buf.toString('base64') };
}
ipcMain.handle('dialog:pick-png',(_e,anyImage)=>pickPng(anyImage));
const gameLibrary=require('./game-library').createGameLibrary({store,nativeImage:require('electron').nativeImage,pick:pickPng,lookupSkin,uploadSkin,changed:saved=>send('store:changed',saved)});

app.on('before-quit',()=>gameUI.close());
