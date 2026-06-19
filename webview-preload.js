/**
 * webview-preload.js — Preload injetado na webview (não na janela principal)
 *
 * Roda no contexto da webview, com acesso ao ipcRenderer.
 * Expõe window.__devlens_bridge__ para que o inspector.js injetado
 * possa se comunicar com o renderer da janela principal.
 *
 * Comunicação:
 *   inspector.js → __devlens_bridge__.sendInfo() → ipcRenderer.sendToHost()
 *   → webview 'ipc-message' event → renderer.js
 */
const { ipcRenderer } = require('electron')

// Expõe a bridge no window da página (acessível pelo inspector.js injetado)
window.__devlens_bridge__ = {
  /**
   * Envia informações do elemento hoveredado para o renderer da janela principal.
   * @param {Object} info - { file, line, col, component, framework, tagName }
   */
  sendInfo: (info) => {
    ipcRenderer.sendToHost('element-info', info)
  },

  /**
   * Solicita a cópia do caminho do arquivo para a área de transferência.
   * @param {Object} data - { file, line, component }
   */
  sendCopy: (data) => {
    ipcRenderer.sendToHost('copy-path', data)
  },
}

// Escuta comandos enviados do renderer via webview.send()
ipcRenderer.on('inspector-command', (_event, { action }) => {
  // Dispara evento customizado na página para o inspector.js escutar
  window.dispatchEvent(new CustomEvent('devlens-command', { detail: { action } }))
})

console.log('[DevLens] webview-preload carregado.')
