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
const btnInspect    = document.getElementById('btn-inspect')
const inspectLabel  = document.getElementById('inspect-label')

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

// ─── Estado ──────────────────────────────────────────────────────────────────

let inspectorActive = false
let inspectorInjected = false
let inspectorScript = null
let currentFilePath = null
let toastTimer = null

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

// Foca a URL bar com Ctrl+L
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'l') {
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
btnReload.addEventListener('click',  () => webview.reload())

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

  // Click no elemento — copia o caminho
  if (channel === 'copy-path') {
    const { file, line, component } = args[0]
    if (file) {
      await doCopyPath(file, component)
    }
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
    currentFilePath = info.filePath
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
