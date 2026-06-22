/**
 * inspector.js — Injetado dinamicamente na webview ao ativar o Modo Inspeção.
 *
 * Estratégia de identificação de arquivo-fonte (fallback progressivo):
 *   1. React Fiber: lê __reactFiber$xxx._debugSource (requer babel-plugin-transform-react-jsx-source)
 *   2. Vue 3: lê __vueParentComponent.type.__file (disponível em dev mode)
 *   3. Atributo data-source: injeção manual ou via plugin de build
 *   4. Nenhum: exibe apenas a tag HTML
 */
;(function () {
  // Guarda para evitar duplicação ao recarregar a página
  if (window.__devlens_inspector_loaded__) {
    console.log('[DevLens] Inspector já carregado. Ignorando re-injeção.')
    return
  }
  window.__devlens_inspector_loaded__ = true

  // ─── Estado ──────────────────────────────────────────────────────────────

  let isActive = false
  let currentElement = null
  let overlayEl = null
  let tooltipEl = null
  let mouseX = 0
  let mouseY = 0

  // ─── Criação de elementos de UI ──────────────────────────────────────────

  function createOverlay() {
    const el = document.createElement('div')
    el.id = '__devlens_overlay__'
    Object.assign(el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483646',
      border: '2px solid #7C3AED',
      background: 'rgba(124, 58, 237, 0.08)',
      boxShadow: '0 0 0 1px rgba(124, 58, 237, 0.25), inset 0 0 20px rgba(124, 58, 237, 0.05)',
      borderRadius: '3px',
      display: 'none',
      transition: 'left 0.08s, top 0.08s, width 0.08s, height 0.08s',
    })
    document.body.appendChild(el)
    return el
  }

  function createTooltip() {
    const el = document.createElement('div')
    el.id = '__devlens_tooltip__'
    Object.assign(el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      background: 'rgba(10, 10, 18, 0.95)',
      border: '1px solid rgba(124, 58, 237, 0.6)',
      borderRadius: '6px',
      padding: '5px 10px',
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: '11px',
      lineHeight: '1.5',
      color: '#E2E8F0',
      whiteSpace: 'nowrap',
      backdropFilter: 'blur(12px)',
      display: 'none',
      maxWidth: '500px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    })
    document.body.appendChild(el)
    return el
  }

  // ─── Leitura de Fonte: React ──────────────────────────────────────────────

  function getReactSource(element) {
    // React 16+ guarda a fiber no nó DOM com chave que começa com __reactFiber
    const fiberKey = Object.keys(element).find(
      (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
    )
    if (!fiberKey) return null

    let fiber = element[fiberKey]
    // Sobe na árvore de fibers até encontrar _debugSource
    while (fiber) {
      if (fiber._debugSource) {
        const { fileName, lineNumber, columnNumber } = fiber._debugSource
        const componentName =
          fiber.type && typeof fiber.type === 'function'
            ? fiber.type.displayName || fiber.type.name || null
            : null
        return { file: fileName, line: lineNumber, col: columnNumber, component: componentName, framework: 'react' }
      }
      fiber = fiber.return
    }
    return null
  }

  // ─── Leitura de Fonte: Vue 3 ─────────────────────────────────────────────

  function getVueSource(element) {
    // Vue 3 em dev mode expõe __vueParentComponent no nó DOM
    const vueKey = Object.keys(element).find((k) => k.startsWith('__vue'))
    if (!vueKey) return null

    let vnode = element[vueKey]
    while (vnode) {
      const type = vnode.component?.type || vnode.type
      if (type && type.__file) {
        return {
          file: type.__file,
          line: null,
          component: type.__name || type.name || null,
          framework: 'vue',
        }
      }
      vnode = vnode.parent || vnode.component?.parent
    }
    return null
  }

  // ─── Leitura de Fonte: Atributo data-source ───────────────────────────────

  function getDataAttrSource(element) {
    // Suporta atributo data-source="filepath:line" injetado por plugins de build
    const el = element.closest('[data-source]') || (element.dataset?.source ? element : null)
    if (!el) return null
    const raw = el.getAttribute('data-source') || ''
    const parts = raw.split(':')
    return parts[0]
      ? { file: parts[0], line: parts[1] ? parseInt(parts[1]) : null, framework: 'data-attr' }
      : null
  }

  // ─── Utilitário: formatar caminho relativo ────────────────────────────────

  function formatPath(rawPath) {
    if (!rawPath) return null
    // Normaliza separadores
    const normalized = rawPath.replace(/\\/g, '/')
    // Tenta extrair a partir de diretórios comuns de projeto
    const match = normalized.match(/\/(src|app|pages|components|views|features|lib|utils)\/(.+)/)
    if (match) return `${match[1]}/${match[2]}`
    // Fallback: mostra tudo após o último /projeto/
    const parts = normalized.split('/')
    // Remove prefixos de path do sistema (até encontrar 'src' ou similar)
    const srcIdx = parts.findIndex((p) => ['src', 'app', 'pages'].includes(p))
    if (srcIdx >= 0) return parts.slice(srcIdx).join('/')
    return normalized
  }

  // ─── Aggregador de informações do elemento ────────────────────────────────

  function getElementInfo(element) {
    if (!element || element.id === '__devlens_overlay__' || element.id === '__devlens_tooltip__') {
      return null
    }

    const tagName = element.tagName?.toLowerCase() || 'unknown'
    const source = getReactSource(element) || getVueSource(element) || getDataAttrSource(element)

    if (source) {
      return {
        ...source,
        tagName,
        filePath: formatPath(source.file),
      }
    }

    // Nenhuma fonte encontrada — retorna pelo menos o nome da tag
    return { tagName, file: null, filePath: null, component: null, framework: 'html' }
  }

  // ─── Atualização do Overlay visual ───────────────────────────────────────

  function positionOverlay(element) {
    if (!element || element === document.body || element === document.documentElement) {
      overlayEl.style.display = 'none'
      return
    }
    const rect = element.getBoundingClientRect()
    overlayEl.style.display = 'block'
    overlayEl.style.left = `${rect.left}px`
    overlayEl.style.top = `${rect.top}px`
    overlayEl.style.width = `${rect.width}px`
    overlayEl.style.height = `${rect.height}px`
  }

  function positionTooltip(info, mx, my) {
    if (!info) {
      tooltipEl.style.display = 'none'
      return
    }

    // Monta o texto do tooltip
    const frameworkIcon = { react: '⚛', vue: '💚', html: '🌐', 'data-attr': '📌', unknown: '❓' }
    const icon = frameworkIcon[info.framework] || '📄'
    const componentPart = info.component ? `${info.component}  ` : ''
    const filePart = info.filePath || `<${info.tagName}>`
    const linePart = info.line ? `:${info.line}` : ''

    tooltipEl.textContent = `${icon}  ${componentPart}${filePart}${linePart}`
    tooltipEl.style.display = 'block'

    // Posicionar próximo ao mouse, mas mantendo dentro da tela
    const padding = 10
    let x = mx + 14
    let y = my + 14

    // Recalcula após o display estar visível
    requestAnimationFrame(() => {
      const tw = tooltipEl.offsetWidth
      const th = tooltipEl.offsetHeight
      if (x + tw > window.innerWidth - padding) x = mx - tw - 14
      if (y + th > window.innerHeight - padding) y = my - th - 14
      tooltipEl.style.left = `${Math.max(padding, x)}px`
      tooltipEl.style.top = `${Math.max(padding, y)}px`
    })
  }

  // ─── Event Handlers ───────────────────────────────────────────────────────

  function onMouseMove(e) {
    if (!isActive) return
    mouseX = e.clientX
    mouseY = e.clientY

    const el = document.elementFromPoint(mouseX, mouseY)
    if (!el || el === overlayEl || el === tooltipEl) return

    currentElement = el
    const info = getElementInfo(el)

    positionOverlay(el)
    positionTooltip(info, mouseX, mouseY)

    // Envia info para o renderer da janela principal
    if (window.__devlens_bridge__) {
      window.__devlens_bridge__.sendInfo(info || { tagName: el.tagName?.toLowerCase(), file: null })
    }
  }

  function onClick(e) {
    if (!isActive) return
    e.preventDefault()
    e.stopPropagation()

    if (!currentElement) return
    const info = getElementInfo(currentElement)

    if (info?.filePath && window.__devlens_bridge__) {
      let classes = ''
      if (typeof currentElement.className === 'string') {
        classes = currentElement.className
      } else if (currentElement.className && currentElement.className.baseVal) {
        classes = currentElement.className.baseVal
      }

      window.__devlens_bridge__.sendCopy({
        file: info.filePath,
        line: info.line || null,
        component: info.component || null,
        framework: info.framework,
        tagName: currentElement.tagName.toLowerCase(),
        classes: classes
      })
    }
  }

  // ─── Ativar / Desativar ───────────────────────────────────────────────────

  function start() {
    if (isActive) return
    isActive = true
    document.addEventListener('mousemove', onMouseMove, true)
    document.addEventListener('click', onClick, true)
    document.body.style.cursor = 'crosshair'
    console.log('[DevLens] Inspector ativado.')
  }

  function stop() {
    if (!isActive) return
    isActive = false
    document.removeEventListener('mousemove', onMouseMove, true)
    document.removeEventListener('click', onClick, true)
    document.body.style.cursor = ''
    currentElement = null
    if (overlayEl) overlayEl.style.display = 'none'
    if (tooltipEl) tooltipEl.style.display = 'none'
    console.log('[DevLens] Inspector desativado.')
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  overlayEl = createOverlay()
  tooltipEl = createTooltip()

  // Expõe controles globais para o renderer chamar via executeJavaScript
  window.devlensStart = start
  window.devlensStop = stop

  // Escuta o evento customizado disparado pelo webview-preload
  window.addEventListener('devlens-command', (e) => {
    if (e.detail.action === 'start') start()
    else if (e.detail.action === 'stop') stop()
  })

  console.log('[DevLens] Inspector.js carregado e pronto.')
})()
