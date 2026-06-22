/**
 * preload.js — Bridge segura entre o processo main e a janela principal (renderer)
 * Expõe apenas as APIs necessárias via contextBridge.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Copiar texto para área de transferência via main process
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

  // Obter o código do inspector.js para injetar na webview
  getInspectorScript: () => ipcRenderer.invoke('get-inspector-script'),

  // Controles da janela (custom title bar)
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Novo: APIs de Projeto e Busca de Componente
  selectProjectFolder: () => ipcRenderer.invoke('select-project-folder'),
  findComponentFile: (projectPath, componentName) => ipcRenderer.invoke('find-component-file', { projectPath, componentName }),
})
