const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const h = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('monkey', {
  desktop: true,

  auth: {
    signIn:   method => ipcRenderer.invoke('auth:sign-in',method),
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
    onChanged: on('store:changed'),
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
    launch: (profile, confirmAdditional=false) => ipcRenderer.invoke('game:launch', {profile,confirmAdditional}),
    kill: (profileId) => ipcRenderer.invoke('game:kill', profileId),
    instances: () => ipcRenderer.invoke('game:instances'),
    log: (profileId) => ipcRenderer.invoke('game:log', profileId),
    saveLog: (profileId) => ipcRenderer.invoke('game:save-log', profileId),
    onProgress: on('game:progress'),
    onEvent: on('game:event'),
    onCrash: on('game:crash')
  },

  mods: {
    dependencies:(profile,release)=>ipcRenderer.invoke('mods:dependencies',{profile,release}),
    download: (profile, mod) => ipcRenderer.invoke('mods:download', { profile, mod }),
    remove: (profile, fileName) => ipcRenderer.invoke('mods:remove', { profile, fileName }),
    setEnabled: (profile, fileName, enabled) => ipcRenderer.invoke('mods:enabled', { profile, fileName, enabled }),
    openFolder: (profile) => ipcRenderer.invoke('mods:folder', { profile })
  },

  profiles: {
    initialize:id=>ipcRenderer.invoke('profiles:initialize',{id}),
    remove: (id) => ipcRenderer.invoke('profiles:remove',{id}),
    versions: () => ipcRenderer.invoke('profiles:versions'),
    inherit: (sourceId,profile) => ipcRenderer.invoke('profiles:inherit',{sourceId,profile}),
    planVersion: (id,version,loader) => ipcRenderer.invoke('profiles:plan-version',{id,version,loader}),
    applyVersion: (token,choices) => ipcRenderer.invoke('profiles:apply-version',{token,choices}),
    onProgress: on('profiles:progress')
  },
  screenshots: {
    delete: id=>ipcRenderer.invoke('screenshots:delete',{id}),
    list: (options) => ipcRenderer.invoke('screenshots:list',options),
    open: (id,reveal=false) => ipcRenderer.invoke('screenshots:open',{id,reveal}),
    attach: (id,target) => ipcRenderer.invoke('screenshots:attach',{id,target})
  },
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    version: () => ipcRenderer.invoke('app:version'),
    onStatus: on('update:status')
  },

  app: {
    version: () => ipcRenderer.invoke('app:version'),
    shortcut: () => ipcRenderer.invoke('app:shortcut')
  },

  window: (what) => ipcRenderer.invoke('win:action', what),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  pickPng: (anyImage) => ipcRenderer.invoke('dialog:pick-png', !!anyImage)
});
