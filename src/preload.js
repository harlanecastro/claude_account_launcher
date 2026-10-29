const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('launcher', { ...Object.fromEntries(['state', 'add', 'rename', 'remove', 'launch', 'folder', 'choose'].map(channel => [channel, async (...args) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}])), onProfilesChanged: callback => {
  const listener = () => callback();
  ipcRenderer.on('profiles-changed', listener);
  return () => ipcRenderer.removeListener('profiles-changed', listener);
} });
