/**
 * renderer.js — Lógica da UI principal do DevLens
 *
 * Responsabilidades:
 *  - Navegação de URL na webview
 *  - Ativar/desativar o inspector (injeta inspector.js na webview)
 *  - Receber dados do elemento inspecionado e exibir na info bar
 *  - Copiar caminho do arquivo para a área de transferência
 *  - Atalho de teclado Ctrl+I para toggle do inspector
 */

'use strict'

// ─── Referências do DOM ──────────────────────────────────────────────────────

const webview       = document.getElementById('webview')
const startScreen   = document.getElementById('start-screen')
const urlInput      = document.getElementById('url-input')
const btnGo         = document.getElementById('btn-go')
const btnBack       = document.getElementById('btn-back')
const btnForward    = document.getElementById('btn-forward')
const btnReload     = document.getElementById('btn-reload')
const btnClearCache = document.getElementById('btn-clear-cache')
const btnInspect    = document.getElementById('btn-inspect')
const inspectLabel  = document.getElementById('inspect-label')
const btnMobile     = document.getElementById('btn-mobile')
const deviceSelectorWrapper = document.getElementById('device-selector-wrapper')
const deviceSelector = document.getElementById('device-selector')
const btnDevtools   = document.getElementById('btn-devtools')
const webviewContainer = document.getElementById('webview-container')

const infoBar          = document.getElementById('info-bar')
const infoFramework    = document.getElementById('info-framework-badge')
const infoComponent    = document.getElementById('info-component')
const infoSeparator    = document.getElementById('info-separator')
const infoFilepath     = document.getElementById('info-filepath')
const infoLine         = document.getElementById('info-line')
const btnCopyPath      = document.getElementById('btn-copy-path')
const copyBtnLabel     = document.getElementById('copy-btn-label')

const toast        = document.getElementById('toast')
const toastMessage = document.getElementById('toast-message')

const intentModal = document.getElementById('intent-modal')
const intentInput = document.getElementById('intent-input')
const intentElementInfo = document.getElementById('intent-modal-element-info')
const btnIntentCancel = document.getElementById('btn-intent-cancel')
const btnIntentConfirm = document.getElementById('btn-intent-confirm')

// ─── Estado ──────────────────────────────────────────────────────────────────

let inspectorActive = false
let inspectorInjected = false
let inspectorScript = null
let currentFilePath = null
let toastTimer = null

let defaultUserAgent = ''
let mobileModeActive = false

const devices = {
  'responsive': { width: '100%', height: '100%', ua: '' },
  'iphone-se': { width: '375px', height: '667px', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1' },
  'iphone-xr': { width: '414px', height: '896px', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1' },
  'iphone-12-pro': { width: '390px', height: '844px', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1' },
  'iphone-14-pro-max': { width: '430px', height: '932px', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1' },
  'ipad-mini': { width: '768px', height: '1024px', ua: 'Mozilla/5.0 (iPad; CPU OS 13_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1' },
  'ipad-air': { width: '820px', height: '1180px', ua: 'Mozilla/5.0 (iPad; CPU OS 13_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1' },
  'ipad-pro': { width: '1024px', height: '1366px', ua: 'Mozilla/5.0 (iPad; CPU OS 13_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1' },
  'pixel-7': { width: '412px', height: '915px', ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36' },
  'samsung-s8': { width: '360px', height: '740px', ua: 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36' },
  'samsung-s20': { width: '412px', height: '915px', ua: 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36' }
}

// ─── Controles da janela (custom title bar) ───────────────────────────────────

document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimizeWindow())
document.getElementById('btn-maximize').addEventListener('click', () => window.electronAPI.maximizeWindow())
document.getElementById('btn-close').addEventListener('click',    () => window.electronAPI.closeWindow())

// ─── Navegação ────────────────────────────────────────────────────────────────

function navigate(rawUrl) {
  let url = rawUrl.trim()
  if (!url) return

  // Adiciona protocolo se necessário
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url
  }

  urlInput.value = url

  // Mostra a webview e esconde a tela inicial
  startScreen.style.display = 'none'
  webview.style.display = 'flex'

  // Reseta o estado do inspector na navegação
  inspectorInjected = false

  webview.src = url
}

btnGo.addEventListener('click', () => navigate(urlInput.value))

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') navigate(urlInput.value)
})

// Atalhos globais de teclado (F5, F12, Ctrl+Shift+I, Ctrl+L)
document.addEventListener('keydown', (e) => {
  if (e.key === 'F5') {
    e.preventDefault()
    webview.reloadIgnoringCache()
  } else if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.shiftKey && e.key === 'i')) {
    e.preventDefault()
    toggleDevTools()
  } else if (e.ctrlKey && e.key === 'l') {
    e.preventDefault()
    urlInput.select()
  }
})

// ─── Eventos da webview ───────────────────────────────────────────────────────

webview.addEventListener('did-start-loading', () => {
  document.body.classList.add('loading')
  inspectorInjected = false
  // Ao navegar, desativa inspector
  if (inspectorActive) deactivateInspector(true)
})

webview.addEventListener('did-stop-loading', () => {
  document.body.classList.remove('loading')
  updateNavButtons()
})

webview.addEventListener('dom-ready', () => {
  if (!defaultUserAgent) {
    defaultUserAgent = webview.getUserAgent()
  }
})

webview.addEventListener('devtools-opened', () => {
  btnDevtools.classList.add('active')
})

webview.addEventListener('devtools-closed', () => {
  btnDevtools.classList.remove('active')
})

webview.addEventListener('did-navigate', (e) => {
  urlInput.value = e.url
  updateNavButtons()
})

webview.addEventListener('did-navigate-in-page', (e) => {
  urlInput.value = e.url
  updateNavButtons()
})

webview.addEventListener('page-title-updated', (e) => {
  document.title = `${e.title} — DevLens`
})

function updateNavButtons() {
  btnBack.disabled    = !webview.canGoBack()
  btnForward.disabled = !webview.canGoForward()
}

btnBack.addEventListener('click',   () => { if (webview.canGoBack())    webview.goBack() })
btnForward.addEventListener('click', () => { if (webview.canGoForward()) webview.goForward() })
btnReload.addEventListener('click',  () => webview.reloadIgnoringCache())

btnClearCache.addEventListener('click', async () => {
  if (webview.style.display === 'none' || webview.src === 'about:blank') {
    showToast('⚠️  Carregue uma URL primeiro!', false)
    return
  }
  try {
    await webview.clearData({
      storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
    })
    webview.reloadIgnoringCache()
    showToast('Cache apagado e recarregado!', true)
  } catch (err) {
    console.error('Erro ao limpar cache:', err)
    showToast('Erro ao limpar cache.', false)
  }
})

// ─── Inspector — Ativar/Desativar ─────────────────────────────────────────────

async function getInspectorScript() {
  if (!inspectorScript) {
    inspectorScript = await window.electronAPI.getInspectorScript()
  }
  return inspectorScript
}

async function activateInspector() {
  if (webview.style.display === 'none' || webview.src === 'about:blank') {
    showToast('⚠️  Carregue uma URL primeiro!', false)
    return
  }

  inspectorActive = true
  btnInspect.classList.add('active')
  inspectLabel.textContent = 'Inspecionando…'
  infoBar.classList.remove('hidden')

  // Injeta o script se ainda não foi injetado nesta página
  if (!inspectorInjected) {
    const script = await getInspectorScript()
    try {
      await webview.executeJavaScript(script)
      inspectorInjected = true
    } catch (err) {
      console.error('[DevLens] Erro ao injetar inspector:', err)
      showToast('Erro ao injetar inspector.', false)
      deactivateInspector()
      return
    }
  }

  // Ativa o inspector na página
  await webview.executeJavaScript('window.devlensStart && window.devlensStart()')
}

function deactivateInspector(silent = false) {
  inspectorActive = false
  btnInspect.classList.remove('active')
  inspectLabel.textContent = 'Inspecionar'
  currentFilePath = null
  btnCopyPath.disabled = true

  if (inspectorInjected) {
    webview.executeJavaScript('window.devlensStop && window.devlensStop()').catch(() => {})
  }

  if (!silent) {
    infoBar.classList.add('hidden')
    resetInfoBar()
  }
}

btnInspect.addEventListener('click', () => {
  if (inspectorActive) deactivateInspector()
  else activateInspector()
})

// Ctrl+I — toggle do inspector
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'i') {
    e.preventDefault()
    if (inspectorActive) deactivateInspector()
    else activateInspector()
  }
})

// ─── Receber dados do elemento inspecionado via webview IPC ───────────────────

webview.addEventListener('ipc-message', async (e) => {
  const { channel, args } = e

  // Elemento hoveredado — atualiza a info bar
  if (channel === 'element-info') {
    const info = args[0]
    if (info) updateInfoBar(info)
  }

  // Click no elemento — abre o modal de intenção
  if (channel === 'copy-path') {
    const { file, line, component, tagName, classes } = args[0]
    pendingCopyData = args[0]
    const componentName = component || tagName || 'elemento'
    const fileLabel = file ? (line ? `${file}:${line}` : file) : 'Arquivo Desconhecido'
    intentElementInfo.textContent = `<${componentName}> em ${fileLabel}`
    
    intentModal.classList.remove('hidden')
    intentInput.focus()
  }

  // Refresh (F5) vindo de dentro da webview
  if (channel === 'webview-f5') {
    webview.reloadIgnoringCache()
  }

  // DevTools (F12) vindo de dentro da webview
  if (channel === 'webview-devtools') {
    toggleDevTools()
  }
})

// ─── Info Bar ─────────────────────────────────────────────────────────────────

const frameworkLabels = { react: 'React', vue: 'Vue', html: 'HTML', 'data-attr': 'Attr', unknown: '—' }

function updateInfoBar(info) {
  if (!info) return

  const fw = info.framework || 'unknown'
  infoFramework.textContent = frameworkLabels[fw] || fw
  infoFramework.className = `framework-badge ${fw}`

  if (info.component) {
    infoComponent.textContent = `<${info.component}>`
    infoComponent.style.display = 'inline'
    infoSeparator.classList.remove('hidden')
  } else {
    infoComponent.textContent = `<${info.tagName || '?'}>`
    infoComponent.style.display = 'inline'
    infoSeparator.classList.add('hidden')
  }

  if (info.filePath) {
    infoFilepath.textContent = info.filePath
    infoFilepath.style.color = 'var(--accent-cyan)'
    currentFilePath = info.line ? `${info.filePath}:${info.line}` : info.filePath
    btnCopyPath.disabled = false

    if (info.line) {
      infoLine.textContent = `:${info.line}`
      infoLine.classList.remove('hidden')
    } else {
      infoLine.classList.add('hidden')
    }
  } else {
    infoFilepath.textContent = 'arquivo não identificado'
    infoFilepath.style.color = 'var(--text-muted)'
    infoLine.classList.add('hidden')
    currentFilePath = null
    btnCopyPath.disabled = true
  }
}

function resetInfoBar() {
  infoFramework.textContent = '—'
  infoFramework.className = 'framework-badge'
  infoComponent.textContent = '—'
  infoSeparator.classList.add('hidden')
  infoFilepath.textContent = 'Passe o mouse sobre um elemento'
  infoFilepath.style.color = 'var(--text-secondary)'
  infoLine.classList.add('hidden')
  btnCopyPath.disabled = true
  currentFilePath = null
}

// ─── Copiar Caminho ───────────────────────────────────────────────────────────

async function doCopyPath(filePath, component) {
  if (!filePath) return

  await window.electronAPI.copyToClipboard(filePath)

  // Feedback visual no botão
  btnCopyPath.classList.add('success')
  copyBtnLabel.textContent = 'Copiado!'
  setTimeout(() => {
    btnCopyPath.classList.remove('success')
    copyBtnLabel.textContent = 'Copiar Caminho'
  }, 2000)

  // Toast
  const msg = component
    ? `<${component}>  ${filePath}`
    : filePath
  showToast(msg, true)
}

btnCopyPath.addEventListener('click', async () => {
  if (currentFilePath) await doCopyPath(currentFilePath)
})

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(message, success = true) {
  toastMessage.textContent = message
  toast.classList.remove('hidden', 'show')
  toast.style.borderColor = success
    ? 'rgba(16, 185, 129, 0.4)'
    : 'rgba(239, 68, 68, 0.4)'
  toast.style.color = success ? 'var(--accent-green)' : '#EF4444'

  // Força reflow para reiniciar a animação
  void toast.offsetWidth
  toast.classList.add('show')

  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.classList.remove('show')
    toast.classList.add('hidden')
  }, 2200)
}

// ─── Modo Desenvolvedor & Modo Mobile ─────────────────────────────────────────

function toggleDevTools() {
  if (webview.style.display === 'none' || webview.src === 'about:blank') {
    showToast('⚠️  Carregue uma URL primeiro!', false)
    return
  }

  if (webview.isDevToolsOpened()) {
    webview.closeDevTools()
  } else {
    webview.openDevTools()
  }
}

function applyDeviceSettings() {
  const device = devices[deviceSelector.value]
  if (!device) return

  if (device.width === '100%') {
    webview.style.width = '100%'
    webview.style.height = '100%'
    webview.style.borderRadius = '0'
  } else {
    webview.style.width = device.width
    webview.style.height = device.height
    webview.style.borderRadius = 'var(--radius-lg)'
  }

  const newUa = device.ua || defaultUserAgent || ''
  if (webview.getUserAgent() !== newUa) {
    webview.setUserAgent(newUa)
    webview.reloadIgnoringCache()
  }
}

deviceSelector.addEventListener('change', applyDeviceSettings)

function toggleMobileMode() {
  if (webview.style.display === 'none' || webview.src === 'about:blank') {
    showToast('⚠️  Carregue uma URL primeiro!', false)
    return
  }

  mobileModeActive = !mobileModeActive

  if (mobileModeActive) {
    btnMobile.classList.add('active')
    webviewContainer.classList.add('mobile-mode')
    deviceSelectorWrapper.classList.remove('hidden')
    applyDeviceSettings()
  } else {
    btnMobile.classList.remove('active')
    webviewContainer.classList.remove('mobile-mode')
    deviceSelectorWrapper.classList.add('hidden')
    
    // Reset visual dimensions
    webview.style.width = ''
    webview.style.height = ''
    webview.style.borderRadius = ''

    // Reset User Agent
    const baseUa = defaultUserAgent || ''
    if (webview.getUserAgent() !== baseUa) {
      webview.setUserAgent(baseUa)
      webview.reloadIgnoringCache()
    }
  }
}

btnDevtools.addEventListener('click', toggleDevTools)
btnMobile.addEventListener('click', toggleMobileMode)

// ─── Lógica do Modal de Intenção ──────────────────────────────────────────────

let pendingCopyData = null

function hideIntentModal() {
  intentModal.classList.add('hidden')
  pendingCopyData = null
  intentInput.value = ''
}

btnIntentCancel.addEventListener('click', hideIntentModal)

btnIntentConfirm.addEventListener('click', async () => {
  if (!pendingCopyData) return
  const { file, line, component, tagName, classes } = pendingCopyData
  const intent = intentInput.value.trim()
  
  let prompt = ''
  if (file) {
    prompt += `No arquivo \`${file}\``
    if (line) prompt += ` (linha ${line})`
    prompt += `, temos o elemento \`<${component || tagName}>\``
  } else {
    prompt += `Temos um elemento \`<${component || tagName}>\``
  }
  
  if (classes && typeof classes === 'string' && classes.trim().length > 0) {
    prompt += ` com as classes \`${classes.trim()}\`.`
  } else {
    prompt += `.`
  }
  
  if (intent) {
    prompt += `\n\nPreciso que você ajuste este componente: ${intent}`
  } else {
    prompt += `\n\nPreciso que você ajuste o estilo deste componente.`
  }
  
  // Usa a API electron para copiar direto e exibe toast de prompt
  await window.electronAPI.copyToClipboard(prompt)
  showToast('✨ Mini-Prompt Copiado para a IA!', true)

  // Atualiza o botão da barra também
  btnCopyPath.classList.add('success')
  const copyBtnLabel = document.getElementById('copy-btn-label')
  copyBtnLabel.textContent = 'Prompt Copiado!'
  setTimeout(() => {
    btnCopyPath.classList.remove('success')
    copyBtnLabel.textContent = 'Copiar Caminho'
  }, 2000)

  hideIntentModal()
})

intentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    btnIntentConfirm.click()
  } else if (e.key === 'Escape') {
    hideIntentModal()
  }
})
