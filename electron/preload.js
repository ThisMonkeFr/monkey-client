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
    signOut:  (uuid) => ipcRenderer.invoke('auth:sign-out', uuid),
    accounts: () => ipcRenderer.invoke('auth:accounts'),
    switch:   (uuid) => ipcRenderer.invoke('auth:switch', uuid),
    onAccounts: on('auth:accounts'),
    account:  () => ipcRenderer.invoke('auth:account'),
    onProgress: on('auth:progress'),
    onRestored: on('auth:restored'),
    onRestoreFailed: on('auth:restore-failed')
  },

  mc: {
    lookup: (name) => ipcRenderer.invoke('mc:lookup', name),
    skin: (name) => ipcRenderer.invoke('mc:skin', name),
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

  game: {
    launch: (profile) => ipcRenderer.invoke('game:launch', profile),
    kill: () => ipcRenderer.invoke('game:kill'),
    instances: () => ipcRenderer.invoke('game:instances'),
    log: () => ipcRenderer.invoke('game:log'),
    saveLog: () => ipcRenderer.invoke('game:save-log'),
    onProgress: on('game:progress'),
    onEvent: on('game:event'),
    onCrash: on('game:crash')
  },

  mods: {
    download: (profile, mod) => ipcRenderer.invoke('mods:download', { profile, mod }),
    remove: (profile, fileName) => ipcRenderer.invoke('mods:remove', { profile, fileName }),
    setEnabled: (profile, fileName, enabled) => ipcRenderer.invoke('mods:enabled', { profile, fileName, enabled }),
    openFolder: (profile) => ipcRenderer.invoke('mods:folder', { profile })
  },

  update: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    version: () => ipcRenderer.invoke('app:version'),
    onStatus: on('update:status')
  },

  window: (what) => ipcRenderer.invoke('win:action', what),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  pickPng: (anyImage) => ipcRenderer.invoke('dialog:pick-png', !!anyImage)
});
