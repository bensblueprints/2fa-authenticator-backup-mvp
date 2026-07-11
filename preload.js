const { contextBridge, ipcRenderer } = require('electron');

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('keyloop', {
  status: () => call('vault:status'),
  create: (pw) => call('vault:create', pw),
  unlock: (pw) => call('vault:unlock', pw),
  lock: () => call('vault:lock'),
  list: () => call('accounts:list'),
  codes: () => call('accounts:codes'),
  add: (input) => call('accounts:add', input),
  addUri: (uri) => call('accounts:addUri', uri),
  update: (id, patch) => call('accounts:update', id, patch),
  remove: (id) => call('accounts:remove', id),
  exportBackup: (pw) => call('backup:export', pw),
  importBackup: (pw) => call('backup:import', pw),
  importUris: (text) => call('backup:importUris', text),
  qrSheet: () => call('backup:qrSheet')
});
