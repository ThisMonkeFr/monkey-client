const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const auth = require('./auth');
const store = require('./store');
const mc = require('./minecraft');
const net = require('./monkeynet');
const game = require('./game/launch');
const mods = require('./game/mods');
const { autoUpdater } = require('electron-updater');

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
const persist = () => store.saveSessions(accounts, activeUuid);
function upsert(acc) {
  const i = accounts.findIndex(a => a.uuid === acc.uuid);
  if (i >= 0) accounts[i] = acc; else accounts.push(acc);
  activeUuid = acc.uuid;
}
const send = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload);

function createWindow() {
  win = new BrowserWindow({
    title: 'Monkey Client',
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
  restoreInstances();
  const saved = await store.loadSessions();
  if (saved.accounts.length) {
    /* Only the active account is refreshed at start-up; the others refresh
       when you switch to them, so start-up stays quick. */
    const wanted = saved.accounts.find(a => a.uuid === saved.active) || saved.accounts[0];
    accounts = saved.accounts.map(a => ({ ...a, expiresAt: 0 }));
    try {
      const live = await auth.refresh(wanted.refreshToken);
      upsert(live);
      await persist();
      send('auth:restored', publicAccount());
      send('auth:accounts', accountList());
      connectNet();
    } catch (e) {
      accounts = accounts.filter(a => a.uuid !== wanted.uuid);
      await persist();
      send('auth:restore-failed', { message: e.message });
      send('auth:accounts', accountList());
    }
  }
});

/* ------------------------------------------------------------------
   Auto-update. Only meaningful in a packaged build — in dev there is no
   installer to replace, so we skip it rather than throw on every start.
   ------------------------------------------------------------------ */
function setupUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', i => send('update:status', { state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', () => send('update:status', { state: 'current' }));
  autoUpdater.on('download-progress', p => send('update:status', { state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', i => send('update:status', { state: 'ready', version: i.version }));
  autoUpdater.on('error', e => send('update:status', { state: 'error', message: String(e.message || e) }));
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
async function liveToken() {
  const a = account();
  if (!a) throw new Error('Not signed in.');
  if (Date.now() > a.expiresAt - 60_000) {
    upsert(await auth.refresh(a.refreshToken));
    await persist();
  }
  return account().accessToken;
}

/* ---------------- IPC ---------------- */
ipcMain.handle('auth:sign-in', async () => {
  cancelSignIn = false;
  try {
    upsert(await auth.signIn({
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
  const target = accounts.find(a => a.uuid === uuid);
  if (!target) return { ok: false, message: 'That account is no longer signed in.' };
  try {
    net.disconnect();
    upsert(await auth.refresh(target.refreshToken));   // proves it still works
    await persist();
    connectNet();
    send('auth:accounts', accountList());
    return { ok: true, account: publicAccount() };
  } catch (e) {
    accounts = accounts.filter(a => a.uuid !== uuid);
    activeUuid = accounts.length ? accounts[0].uuid : null;
    await persist();
    send('auth:accounts', accountList());
    return { ok: false, message: `${target.name} needs signing in again.` };
  }
});

ipcMain.handle('auth:cancel', () => { cancelSignIn = true; return true; });

ipcMain.handle('auth:sign-out', async (_e, uuid) => {
  const target = uuid || activeUuid;
  accounts = accounts.filter(a => a.uuid !== target);
  if (activeUuid === target) {
    activeUuid = accounts.length ? accounts[0].uuid : null;
    net.disconnect();
    if (activeUuid) connectNet();
  }
  accounts.length ? await persist() : await store.clearSessions();
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
ipcMain.handle('mc:skin', async (_e, name) => {
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
    return {
      name: p.name,
      data: 'data:image/png;base64,' + buf.toString('base64'),
      slim: !!(tex.SKIN.metadata && tex.SKIN.metadata.model === 'slim')
    };
  } catch (e) { return { error: 'unavailable' }; }
});

ipcMain.handle('mc:upload-skin', async (_e, { data, variant }) => {

  try {
    const token = await liveToken();
    const buf = Buffer.from(String(data).split(',').pop(), 'base64');
    const profile = await mc.uploadSkin(token, buf, variant);
    const a = account(); if (a) a.skins = profile.skins || a.skins;
    return { ok: true };
  } catch (e) { return { ok: false, message: e.message }; }
});

let running = null;
let logBuf = [];                      // last lines of Minecraft output
const LOG_MAX = 400;

ipcMain.handle('game:launch', async (_e, profile) => {
  if (running) return { ok: false, message: 'Minecraft is already running.' };
  if (!account()) return { ok: false, message: 'Sign in before launching.' };
  try {
    const token = await liveToken();
    logBuf = [];
    await mods.sync(profile, p => send('game:progress', p));
    const started = Date.now();
    running = await game.launch(
      profile,
      { name: account().name, uuid: account().uuid, accessToken: token },
      p => send('game:progress', p),
      ev => {
        if (ev.type === 'log') {
          logBuf.push(ev.line);
          if (logBuf.length > LOG_MAX) logBuf.shift();
          return;                       // logs are pulled, not pushed per line
        }
        send('game:event', ev);
        if (ev.type === 'running' && profile.settings.closeOnLaunch && win) win.hide();
        if (ev.type === 'exit' || ev.type === 'error') {
          const bad = ev.type === 'error' || (ev.code !== 0 && ev.code !== null);
          if (bad) send('game:crash', { code: ev.code, log: logBuf.slice(-200) });
          running = null;
          saveInstances();
          if (win) { win.show(); win.focus(); }
        }
      }
    );
    running.profile = profile.name;
    running.startedAt = started;
    saveInstances();
    return { ok: true };
  } catch (e) {
    running = null;
    return { ok: false, message: e.message };
  }
});

const INST_FILE = () => path.join(app.getPath('userData'), 'instances.json');
const instanceList = () => running
  ? [{ profile: running.profile, pid: running.pid, startedAt: running.startedAt,
       logPath: running.logPath || null }]
  : [];

async function saveInstances() {
  try { await require('fs/promises').writeFile(INST_FILE(), JSON.stringify(instanceList())); }
  catch {}
}
/* A pid alone proves nothing after a restart, so check the process really is
   still alive before claiming the game is running. */
async function restoreInstances() {
  try {
    const raw = await require('fs/promises').readFile(INST_FILE(), 'utf8');
    const [prev] = JSON.parse(raw);
    if (!prev) return;
    try { process.kill(prev.pid, 0); } catch { return; }
    running = {
      profile: prev.profile, pid: prev.pid, startedAt: prev.startedAt,
      logPath: prev.logPath, external: true,
      kill: () => { try { process.kill(prev.pid); } catch {} }
    };
    send('game:instances', instanceList());
  } catch {}
}

ipcMain.handle('game:instances', () => instanceList());
ipcMain.handle('game:log', () => logBuf.slice());
ipcMain.handle('game:save-log', async () => {
  const p = path.join(app.getPath('downloads'), `monkey-client-log-${Date.now()}.txt`);
  await require('fs/promises').writeFile(p, logBuf.join('\n'), 'utf8');
  shell.showItemInFolder(p);
  return p;
});

ipcMain.handle('game:kill', () => {
  if (running) { running.kill(); running = null; saveInstances(); }
  return true;
});

const withProfile = (fn) => async (_e, payload) => {
  try { return { ok: true, data: await fn(payload) }; }
  catch (e) { return { ok: false, message: e.message }; }
};
ipcMain.handle('mods:download', withProfile(({ profile, mod }) => mods.download(profile, mod)));
ipcMain.handle('mods:remove', withProfile(({ profile, fileName }) => mods.remove(profile, fileName)));
ipcMain.handle('mods:enabled', withProfile(({ profile, fileName, enabled }) => mods.setEnabled(profile, fileName, enabled)));
ipcMain.handle('mods:folder', withProfile(({ profile }) => mods.openFolder(profile)));

ipcMain.handle('store:load', () => store.loadData());
ipcMain.handle('store:save', (_e, obj) => store.saveData(obj));

ipcMain.handle('net:call', async (_e, { method, args = [] }) => {
  try {
    if (typeof net[method] !== 'function') throw new Error('Unknown MonkeyNet call.');
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

ipcMain.handle('dialog:pick-png', async (_e, anyImage) => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: anyImage
      ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
      : [{ name: 'PNG images', extensions: ['png'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const fs = require('fs/promises');
  const buf = await fs.readFile(r.filePaths[0]);
  const ext = path.extname(r.filePaths[0]).slice(1).toLowerCase();
  const mime = { jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp', gif: 'gif' }[ext] || 'png';
  return { name: path.basename(r.filePaths[0]), data: `data:image/${mime};base64,` + buf.toString('base64') };
});
