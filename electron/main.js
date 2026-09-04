const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const auth = require('./auth');
const store = require('./store');
const mc = require('./minecraft');
const net = require('./monkeynet');

let win = null;
let account = null;        // { name, uuid, accessToken, expiresAt, refreshToken }
let cancelSignIn = false;

const publicAccount = () => account && {
  name: account.name, uuid: account.uuid, skins: account.skins, capes: account.capes
};
const send = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload);

function createWindow() {
  win = new BrowserWindow({
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

app.whenReady().then(async () => {
  createWindow();
  // Try to restore the previous session silently.
  const saved = await store.loadSession();
  if (saved && saved.refreshToken) {
    try {
      account = await auth.refresh(saved.refreshToken);
      await store.saveSession(account);
      send('auth:restored', publicAccount());
      connectNet();
    } catch (e) {
      await store.clearSession();
      send('auth:restore-failed', { message: e.message });
    }
  }
});

app.on('window-all-closed', () => { net.disconnect(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

async function connectNet() {
  if (!account) return;
  try {
    await net.connect(account, ev => send('net:event', ev));
    send('net:status', { connected: true });
  } catch (e) {
    send('net:status', { connected: false, message: e.message });
  }
}

/* Refresh the Minecraft token if it is close to expiry. */
async function liveToken() {
  if (!account) throw new Error('Not signed in.');
  if (Date.now() > account.expiresAt - 60_000) {
    account = await auth.refresh(account.refreshToken);
    await store.saveSession(account);
  }
  return account.accessToken;
}

/* ---------------- IPC ---------------- */
ipcMain.handle('auth:sign-in', async () => {
  cancelSignIn = false;
  try {
    account = await auth.signIn({
      onProgress: p => send('auth:progress', p),
      isCancelled: () => cancelSignIn
    });
    await store.saveSession(account);
    connectNet();
    return { ok: true, account: publicAccount() };
  } catch (e) {
    return { ok: false, code: e.code || 'unknown', message: e.message, hint: e.hint || null };
  }
});

ipcMain.handle('auth:cancel', () => { cancelSignIn = true; return true; });

ipcMain.handle('auth:sign-out', async () => {
  account = null;
  net.disconnect();
  await store.clearSession();
  return true;
});

ipcMain.handle('auth:account', () => publicAccount());

ipcMain.handle('mc:lookup', async (_e, name) => {
  try { return await mc.lookupPlayer(name); }
  catch { return { error: 'unavailable' }; }
});

ipcMain.handle('mc:upload-skin', async (_e, { data, variant }) => {
  try {
    const token = await liveToken();
    const buf = Buffer.from(String(data).split(',').pop(), 'base64');
    const profile = await mc.uploadSkin(token, buf, variant);
    account.skins = profile.skins || account.skins;
    return { ok: true };
  } catch (e) { return { ok: false, message: e.message }; }
});

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

ipcMain.handle('dialog:pick-png', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'], filters: [{ name: 'PNG images', extensions: ['png'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const fs = require('fs/promises');
  const buf = await fs.readFile(r.filePaths[0]);
  return { name: path.basename(r.filePaths[0]), data: 'data:image/png;base64,' + buf.toString('base64') };
});
