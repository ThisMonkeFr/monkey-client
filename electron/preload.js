const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const h = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('monkey', {
  desktop: true,

  auth: {
    signIn:   () => ipcRenderer.invoke('auth:sign-in'),
    cancel:   () => ipcRenderer.invoke('auth:cancel'),
    signOut:  () => ipcRenderer.invoke('auth:sign-out'),
    account:  () => ipcRenderer.invoke('auth:account'),
    onProgress: on('auth:progress'),
    onRestored: on('auth:restored'),
    onRestoreFailed: on('auth:restore-failed')
  },

  mc: {
    lookup: (name) => ipcRenderer.invoke('mc:lookup', name),
    uploadSkin: (data, variant) => ipcRenderer.invoke('mc:upload-skin', { data, variant })
  },

  store: {
    load: () => ipcRenderer.invoke('store:load'),
    save: (obj) => ipcRenderer.invoke('store:save', obj)
  },

  net: {
    call: (method, ...args) => ipcRenderer.invoke('net:call', { method, args }),
    connected: () => ipcRenderer.invoke('net:connected'),
    onEvent: on('net:event'),
    onStatus: on('net:status')
  },

  window: (what) => ipcRenderer.invoke('win:action', what),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  pickPng: () => ipcRenderer.invoke('dialog:pick-png')
});
