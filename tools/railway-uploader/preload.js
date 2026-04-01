const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    uploadFiles: (payload) => ipcRenderer.invoke('upload-files', payload),
    getHistory: () => ipcRenderer.invoke('get-history'),
    onProgress: (callback) => ipcRenderer.on('upload-progress', (_event, data) => callback(data)),
    onHistoryUpdated: (callback) => ipcRenderer.on('history-updated', (_event, data) => callback(data))
});
