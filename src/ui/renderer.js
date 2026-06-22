/**
 * renderer.js — Lógica da UI principal do DevLens
 */

'use strict'

// ─── Referências do DOM ──────────────────────────────────────────────────────

const tabsList        = document.getElementById('tabs-list')
const btnAddTab       = document.getElementById('btn-add-tab')
const startScreen     = document.getElementById('start-screen')
const urlInput        = document.getElementById('url-input')
const btnGo           = document.getElementById('btn-go')
const btnBack         = document.getElementById('btn-back')
const btnForward      = document.getElementById('btn-forward')
const btnReload       = document.getElementById('btn-reload')
const btnClearCache   = document.getElementById('btn-clear-cache')
const btnInspect      = document.getElementById('btn-inspect')
const inspectLabel    = document.getElementById('inspect-label')
const btnMobile       = document.getElementById('btn-mobile')
const deviceSelectorWrapper = document.getElementById('device-selector-wrapper')
const deviceSelector  = document.getElementById('device-selector')
const btnDevtools     = document.getElementById('btn-devtools')
const webviewContainer = document.getElementById('webview-container')

const btnProject      = document.getElementById('btn-project')
const projectLabel    = document.getElementById('project-label')
const btnQuickProject = document.getElementById('btn-quick-project')


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

let tabs = []
let activeTabId = null
let tabIdCounter = 0

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

// ─── Lógica de Abas ───────────────────────────────────────────────────────────

function getActiveTab() {
  return tabs.find(t => t.id === activeTabId)
}

function getActiveWebview() {
  const tab = getActiveTab()
  return tab ? tab.webview : null
}

function createTab(initialUrl = 'about:blank', makeActive = true) {
  tabIdCounter++
  const id = tabIdCounter
  const title = initialUrl === 'about:blank' ? 'Nova Aba' : 'Carregando...'

  // Cria a Webview
  const webview = document.createElement('webview')
  webview.setAttribute('src', initialUrl)
  webview.setAttribute('allowpopups', 'true')
  webview.setAttribute('nodeintegration', 'false')
  webview.setAttribute('webpreferences', 'contextIsolation=true, sandbox=true')
  
  // Esconde por padrão, só mostra quando for ativa
  webview.classList.remove('active')
  webviewContainer.appendChild(webview)

  // Cria o elemento da aba
  const tabEl = document.createElement('div')
  tabEl.className = 'tab'
  tabEl.innerHTML = `
    <span class="tab-title">${title}</span>
    <span class="tab-close">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </span>
  `
  tabsList.appendChild(tabEl)

  const tabObj = { id, title, url: initialUrl, webview, tabEl }
  tabs.push(tabObj)

  // Eventos do elemento aba
  tabEl.addEventListener('click', () => switchTab(id))
  tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
    e.stopPropagation()
    closeTab(id)
  })

  // Registra os listeners da webview
  bindWebviewEvents(webview, id)

  if (makeActive) {
    switchTab(id)
  }

  updateStartScreen()
  return id
}

function switchTab(id) {
  const newTab = tabs.find(t => t.id === id)
  if (!newTab) return

  // Desativa tab anterior
  const oldTab = getActiveTab()
  if (oldTab) {
    oldTab.tabEl.classList.remove('active')
    oldTab.webview.classList.remove('active')
  }

  activeTabId = id
  newTab.tabEl.classList.add('active')
  
  // Se for aba about:blank, podemos ocultar webview se quisermos,
  // mas aqui deixamos visivel pq start screen gerencia isso.
  newTab.webview.classList.add('active')

  // Atualiza URL Input
  urlInput.value = newTab.url === 'about:blank' ? '' : newTab.url

  // Aplica as regras de mobile atuais para a nova aba
  applyDeviceSettingsToWebview(newTab.webview)

  // Atualiza botões
  updateNavButtons()

  // Se o inspector estava ativo e mudou de aba, idealmente desativamos globalmente
  // ou poderíamos manter por aba, mas globalmente é mais simples:
  if (inspectorActive) {
    deactivateInspector(true)
  }

  updateStartScreen()
}

function closeTab(id) {
  const index = tabs.findIndex(t => t.id === id)
  if (index === -1) return
  const tab = tabs[index]

  // Remove DOM elements
  tab.tabEl.remove()
  tab.webview.remove()

  tabs.splice(index, 1)

  if (tabs.length === 0) {
    // Se fechou tudo, cria uma aba vazia
    createTab()
  } else if (activeTabId === id) {
    // Se fechou a aba ativa, ativa a aba à esquerda (ou à direita se não tiver esquerda)
    const newActiveIndex = Math.max(0, index - 1)
    switchTab(tabs[newActiveIndex].id)
  }
}

btnAddTab.addEventListener('click', () => createTab())

function updateStartScreen() {
  const activeWv = getActiveWebview()
  if (!activeWv || activeWv.src === 'about:blank' || !activeWv.src) {
    startScreen.style.display = 'flex'
    if (activeWv) activeWv.style.display = 'none'
  } else {
    startScreen.style.display = 'none'
    if (activeWv) activeWv.style.display = '' // Deixa a classe .active gerenciar (display: flex)
  }
}

// ─── Navegação ────────────────────────────────────────────────────────────────

function navigate(rawUrl) {
  let url = rawUrl.trim()
  if (!url) return

  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url
  }

  const tab = getActiveTab()
  if (!tab) return

  urlInput.value = url
  tab.url = url
  
  // Atualiza start screen
  startScreen.style.display = 'none'
  tab.webview.style.display = '' // vai obedecer a classe .active

  inspectorInjected = false
  tab.webview.setAttribute('src', url)
}

btnGo.addEventListener('click', () => navigate(urlInput.value))

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') navigate(urlInput.value)
})

// Atalhos globais de teclado
document.addEventListener('keydown', (e) => {
  const wv = getActiveWebview()
  if (e.key === 'F5') {
    e.preventDefault()
    if (wv) wv.reloadIgnoringCache()
  } else if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.shiftKey && e.key === 'i')) {
    e.preventDefault()
    toggleDevTools()
  } else if (e.ctrlKey && e.key === 'l') {
    e.preventDefault()
    urlInput.select()
  } else if (e.ctrlKey && e.key === 't') {
    e.preventDefault()
    createTab()
  } else if (e.ctrlKey && e.key === 'w') {
    e.preventDefault()
    if (activeTabId) closeTab(activeTabId)
  }
})

// ─── Eventos da webview ───────────────────────────────────────────────────────

function bindWebviewEvents(wv, tabId) {
  wv.addEventListener('did-start-loading', () => {
    if (activeTabId === tabId) {
      document.body.classList.add('loading')
      inspectorInjected = false
      if (inspectorActive) deactivateInspector(true)
    }
    const t = tabs.find(x => x.id === tabId)
    if (t) {
      t.tabEl.querySelector('.tab-title').textContent = 'Carregando...'
    }
  })

  wv.addEventListener('did-stop-loading', () => {
    if (activeTabId === tabId) {
      document.body.classList.remove('loading')
      updateNavButtons()
      updateStartScreen()
    }
    const t = tabs.find(x => x.id === tabId)
    if (t) {
      t.tabEl.querySelector('.tab-title').textContent = wv.getTitle() || t.url
    }
  })

  wv.addEventListener('dom-ready', () => {
    if (!defaultUserAgent) {
      defaultUserAgent = wv.getUserAgent()
    }
  })

  wv.addEventListener('devtools-opened', () => {
    if (activeTabId === tabId) btnDevtools.classList.add('active')
  })

  wv.addEventListener('devtools-closed', () => {
    if (activeTabId === tabId) btnDevtools.classList.remove('active')
  })

  wv.addEventListener('did-navigate', (e) => {
    const t = tabs.find(x => x.id === tabId)
    if (t) t.url = e.url
    if (activeTabId === tabId) {
      urlInput.value = e.url
      updateNavButtons()
      updateStartScreen()
    }
  })

  wv.addEventListener('did-navigate-in-page', (e) => {
    const t = tabs.find(x => x.id === tabId)
    if (t) t.url = e.url
    if (activeTabId === tabId) {
      urlInput.value = e.url
      updateNavButtons()
    }
  })

  wv.addEventListener('page-title-updated', (e) => {
    const t = tabs.find(x => x.id === tabId)
    if (t) t.tabEl.querySelector('.tab-title').textContent = e.title
    if (activeTabId === tabId) {
      document.title = `${e.title} — DevLens`
    }
  })

  // === NOVO: Tratar nova janela/aba ===
  wv.addEventListener('new-window', (e) => {
    // Cria uma aba para a URL solicitada em vez de abrir nova janela do app
    e.preventDefault()
    createTab(e.url)
  })

  wv.addEventListener('ipc-message', async (e) => {
    if (activeTabId !== tabId) return // Ignora eventos IPC de abas em background
    handleIpcMessage(e.channel, e.args)
  })
}

function updateNavButtons() {
  const wv = getActiveWebview()
  if (!wv) return
  try {
    btnBack.disabled    = !wv.canGoBack()
    btnForward.disabled = !wv.canGoForward()
  } catch (e) {
    btnBack.disabled = true
    btnForward.disabled = true
  }
}

btnBack.addEventListener('click',   () => { const wv = getActiveWebview(); if (wv && wv.canGoBack()) wv.goBack() })
btnForward.addEventListener('click', () => { const wv = getActiveWebview(); if (wv && wv.canGoForward()) wv.goForward() })
btnReload.addEventListener('click',  () => { const wv = getActiveWebview(); if (wv) wv.reloadIgnoringCache() })

btnClearCache.addEventListener('click', async () => {
  const wv = getActiveWebview()
  if (!wv || wv.style.display === 'none' || wv.src === 'about:blank') {
    showToast('⚠️  Carregue uma URL primeiro!', false)
    return
  }
  try {
    await wv.clearData({
      storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
    })
    wv.reloadIgnoringCache()
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
  const wv = getActiveWebview()
  if (!wv || wv.style.display === 'none' || wv.src === 'about:blank' || !wv.src) {
    showToast('⚠️  Carregue uma URL primeiro!', false)
    return
  }

  inspectorActive = true
  btnInspect.classList.add('active')
  inspectLabel.textContent = 'Inspecionando…'
  infoBar.classList.remove('hidden')

  if (!inspectorInjected) {
    const script = await getInspectorScript()
    try {
      await wv.executeJavaScript(script)
      inspectorInjected = true
    } catch (err) {
      console.error('[DevLens] Erro ao injetar inspector:', err)
      showToast('Erro ao injetar inspector.', false)
      deactivateInspector()
      return
    }
  }

  await wv.executeJavaScript('window.devlensStart && window.devlensStart()')
}

function deactivateInspector(silent = false) {
  inspectorActive = false
  btnInspect.classList.remove('active')
  inspectLabel.textContent = 'Inspecionar'
  currentFilePath = null
  btnCopyPath.disabled = true

  const wv = getActiveWebview()
  if (inspectorInjected && wv) {
    wv.executeJavaScript('window.devlensStop && window.devlensStop()').catch(() => {})
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

// ─── Receber dados do elemento inspecionado via webview IPC ───────────────────

function handleIpcMessage(channel, args) {
  const wv = getActiveWebview()

  if (channel === 'element-info') {
    const info = args[0]
    if (info) updateInfoBar(info)
  }

  if (channel === 'copy-path') {
    const { file, line, component, tagName, classes } = args[0]
    pendingCopyData = args[0]

    // Se a busca local resolveu o arquivo (e o resultado original era nulo ou URL)
    const projectPath = localStorage.getItem('devlens_project_path')
    if (projectPath && component && (!file || file.startsWith('http'))) {
      if (currentFilePath && !currentFilePath.startsWith('http') && currentFilePath !== 'Buscando no projeto...') {
        const parts = currentFilePath.split(':')
        pendingCopyData.file = parts[0]
        pendingCopyData.line = parts[1] ? parseInt(parts[1]) : null
      }
    }

    const componentName = component || tagName || 'elemento'
    const fileLabel = pendingCopyData.file ? (pendingCopyData.line ? `${pendingCopyData.file}:${pendingCopyData.line}` : pendingCopyData.file) : 'Arquivo Desconhecido'
    intentElementInfo.textContent = `<${componentName}> em ${fileLabel}`
    
    intentModal.classList.remove('hidden')
    intentInput.focus()
  }

  if (channel === 'webview-f5') {
    if (wv) wv.reloadIgnoringCache()
  }

  if (channel === 'webview-devtools') {
    toggleDevTools()
  }
}

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

  // Oculta por padrão o botão rápido
  btnQuickProject.classList.add('hidden')

  if (info.filePath && !info.filePath.startsWith('http')) {
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
    // Se veio sem caminho (ou se é URL temporário HTTP de bundle)
    const projectPath = localStorage.getItem('devlens_project_path')
    if (projectPath && info.component) {
      infoFilepath.textContent = 'Buscando no projeto...'
      infoFilepath.style.color = 'var(--text-muted)'
      infoLine.classList.add('hidden')
      currentFilePath = null
      btnCopyPath.disabled = true

      window.electronAPI.findComponentFile(projectPath, info.component).then(res => {
        // Evita condições de corrida garantindo que o componente selecionado ainda é o mesmo
        if (infoComponent.textContent === `<${info.component}>`) {
          if (res && res.filePath) {
            infoFilepath.textContent = res.filePath
            infoFilepath.style.color = 'var(--accent-cyan)'
            currentFilePath = res.line ? `${res.filePath}:${res.line}` : res.filePath
            btnCopyPath.disabled = false
            
            if (res.line) {
              infoLine.textContent = `:${res.line}`
              infoLine.classList.remove('hidden')
            } else {
              infoLine.classList.add('hidden')
            }

            // Atualiza dados de cópia pendente se for este componente
            if (pendingCopyData && pendingCopyData.component === info.component) {
              pendingCopyData.file = res.filePath
              pendingCopyData.line = res.line
              const componentName = pendingCopyData.component || pendingCopyData.tagName || 'elemento'
              intentElementInfo.textContent = `<${componentName}> em ${res.filePath}:${res.line}`
            }
          } else {
            infoFilepath.textContent = 'arquivo não identificado'
            infoFilepath.style.color = 'var(--text-muted)'
            infoLine.classList.add('hidden')
            currentFilePath = null
            btnCopyPath.disabled = true
          }
        }
      }).catch(err => {
        console.error(err)
        infoFilepath.textContent = 'arquivo não identificado'
        infoFilepath.style.color = 'var(--text-muted)'
        infoLine.classList.add('hidden')
        currentFilePath = null
        btnCopyPath.disabled = true
      })
    } else {
      infoFilepath.textContent = 'arquivo não identificado'
      infoFilepath.style.color = 'var(--text-muted)'
      infoLine.classList.add('hidden')
      currentFilePath = null
      btnCopyPath.disabled = true

      // Se for um componente react/vue mas não está vinculado, exibe botão rápido
      if (info.component && (fw === 'react' || fw === 'vue')) {
        btnQuickProject.classList.remove('hidden')
      }
    }
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
  btnQuickProject.classList.add('hidden')
}

// ─── Copiar Caminho ───────────────────────────────────────────────────────────

async function doCopyPath(filePath, component) {
  if (!filePath) return

  await window.electronAPI.copyToClipboard(filePath)

  btnCopyPath.classList.add('success')
  copyBtnLabel.textContent = 'Copiado!'
  setTimeout(() => {
    btnCopyPath.classList.remove('success')
    copyBtnLabel.textContent = 'Copiar Caminho'
  }, 2000)

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
  const wv = getActiveWebview()
  if (!wv || wv.style.display === 'none' || wv.src === 'about:blank') {
    showToast('⚠️  Carregue uma URL primeiro!', false)
    return
  }

  if (wv.isDevToolsOpened()) {
    wv.closeDevTools()
  } else {
    wv.openDevTools()
  }
}

function applyDeviceSettingsToWebview(wv) {
  if (!wv) return
  if (!mobileModeActive) {
    wv.style.width = ''
    wv.style.height = ''
    wv.style.borderRadius = ''
    const baseUa = defaultUserAgent || ''
    if (wv.getUserAgent() !== baseUa) {
      wv.setUserAgent(baseUa)
      // Recarrega apenas se necessário, mas na criação da aba pode não estar pronto
      try { wv.reloadIgnoringCache() } catch(e){}
    }
    return
  }

  const device = devices[deviceSelector.value]
  if (!device) return

  if (device.width === '100%') {
    wv.style.width = '100%'
    wv.style.height = '100%'
    wv.style.borderRadius = '0'
  } else {
    wv.style.width = device.width
    wv.style.height = device.height
    wv.style.borderRadius = 'var(--radius-lg)'
  }

  const newUa = device.ua || defaultUserAgent || ''
  if (wv.getUserAgent() !== newUa) {
    wv.setUserAgent(newUa)
    try { wv.reloadIgnoringCache() } catch(e){}
  }
}

function applyDeviceSettings() {
  const wv = getActiveWebview()
  applyDeviceSettingsToWebview(wv)
}

deviceSelector.addEventListener('change', applyDeviceSettings)

function toggleMobileMode() {
  const wv = getActiveWebview()
  if (!wv || wv.style.display === 'none' || wv.src === 'about:blank') {
    showToast('⚠️  Carregue uma URL primeiro!', false)
    return
  }

  mobileModeActive = !mobileModeActive

  if (mobileModeActive) {
    btnMobile.classList.add('active')
    webviewContainer.classList.add('mobile-mode')
    deviceSelectorWrapper.classList.remove('hidden')
    
    // Aplica para a webview atual, as outras herdam quando forem ativadas
    applyDeviceSettingsToWebview(wv)
  } else {
    btnMobile.classList.remove('active')
    webviewContainer.classList.remove('mobile-mode')
    deviceSelectorWrapper.classList.add('hidden')
    applyDeviceSettingsToWebview(wv)
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
  
  await window.electronAPI.copyToClipboard(prompt)
  showToast('✨ Mini-Prompt Copiado para a IA!', true)

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

// ─── Lógica de Vinculação de Pasta do Projeto ─────────────────────────────────

function updateProjectFolderUI(folderPath) {
  if (folderPath) {
    btnProject.classList.add('linked')
    const folderName = folderPath.replace(/\\/g, '/').split('/').pop() || folderPath
    projectLabel.textContent = folderName
    btnProject.title = `Projeto: ${folderPath}\nClique para alterar ou desvincular.`
  } else {
    btnProject.classList.remove('linked')
    projectLabel.textContent = 'Vincular Pasta'
    btnProject.title = 'Vincular pasta do projeto local para autodetecção de arquivos em React 19'
  }
}

btnProject.addEventListener('click', async () => {
  const currentPath = localStorage.getItem('devlens_project_path')
  if (currentPath) {
    const choice = confirm(`Pasta atual: ${currentPath}\n\nDeseja alterar a pasta do projeto?\nClique em "OK" para selecionar uma nova pasta ou "Cancelar" para desvincular a pasta atual.`)
    if (choice) {
      const folderPath = await window.electronAPI.selectProjectFolder()
      if (folderPath) {
        localStorage.setItem('devlens_project_path', folderPath)
        updateProjectFolderUI(folderPath)
        showToast(`Pasta vinculada: ${folderPath}`, true)
      }
    } else {
      localStorage.removeItem('devlens_project_path')
      updateProjectFolderUI(null)
      showToast('Pasta do projeto desvinculada.', true)
    }
  } else {
    const folderPath = await window.electronAPI.selectProjectFolder()
    if (folderPath) {
      localStorage.setItem('devlens_project_path', folderPath)
      updateProjectFolderUI(folderPath)
      showToast(`Pasta vinculada: ${folderPath}`, true)
    }
  }
})

btnQuickProject.addEventListener('click', async () => {
  const folderPath = await window.electronAPI.selectProjectFolder()
  if (folderPath) {
    localStorage.setItem('devlens_project_path', folderPath)
    updateProjectFolderUI(folderPath)
    showToast(`Pasta vinculada: ${folderPath}`, true)
    btnQuickProject.classList.add('hidden')
  }
})

// ─── Inicialização ────────────────────────────────────────────────────────────

// Carrega pasta do projeto vinculada do localStorage
const savedProjectPath = localStorage.getItem('devlens_project_path')
updateProjectFolderUI(savedProjectPath)

// Cria a primeira aba vazia ao iniciar
createTab()
