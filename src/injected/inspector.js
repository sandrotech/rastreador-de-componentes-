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
  // Guarda o último resultado de source map resolvido de forma assíncrona (React 19)
  let _lastResolved = null
  let _lastResolvedInfo = null
  // Guarda o elemento atual para usar na callback assíncrona
  let _currentInfo = null

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

  // Cache de source maps já buscados: url -> consumer object
  const _smCache = {}

  // Resolve (url, line, col) para originalFile:originalLine via source map do servidor de dev
  async function resolveViaSourceMap(rawUrl, line, col) {
    try {
      // Remove parâmetros/hash
      const cleanUrl = rawUrl.split('?')[0].split('#')[0]
      const mapUrl = cleanUrl + '.map'

      if (!_smCache[mapUrl]) {
        const res = await fetch(mapUrl)
        if (!res.ok) { _smCache[mapUrl] = null; return null }
        const json = await res.json()
        _smCache[mapUrl] = json
      }

      const map = _smCache[mapUrl]
      if (!map) return null

      // Decodifica VLQ manualmente para localizar a entrada correta
      const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      function decodeVLQ(str) {
        let result = []
        let i = 0
        while (i < str.length) {
          let value = 0, shift = 0, digit
          do {
            digit = BASE64.indexOf(str[i++])
            value |= (digit & 0x1f) << shift
            shift += 5
          } while (digit & 0x20)
          result.push(value & 1 ? -(value >> 1) : value >> 1)
        }
        return result
      }

      const groups = map.mappings.split(';')
      let srcLine = 0, srcCol = 0, srcFileIdx = 0, genLine = 1

      for (const group of groups) {
        const segs = group.split(',')
        let genCol = 0
        for (const seg of segs) {
          if (!seg) continue
          const vals = decodeVLQ(seg)
          genCol += vals[0]
          if (vals.length >= 4) {
            srcFileIdx += vals[1]
            srcLine += vals[2]
            srcCol += vals[3]
            // Verifica se o segmento gerado corresponde à linha/coluna desejada
            if (genLine === line && genCol >= (col - 5) && genCol <= (col + 15)) {
              const orig = map.sources[srcFileIdx] || ''
              // Converte sourceRoot + source para algo legível
              const root = map.sourceRoot || ''
              const full = root ? root + orig : orig
              // Extrai caminho relativo (remove webpack://, ../, etc)
              const cleaned = full.replace(/^webpack:\/+/, '').replace(/^\.\.\//, '').replace(/^\.\//, '')
              return { file: cleaned, line: srcLine + 1 }
            }
          }
        }
        genLine++
        if (genLine > line + 2) break
      }
    } catch (e) {
      // Silencioso — não impede o fluxo principal
    }
    return null
  }

  // Extrai URL e posição de uma linha de stack trace
  function parseStackLine(line) {
    // Formato: "    at Component (http://host/file.js:10:20)" ou "    at http://host/file.js:10:20"
    const match = line.match(/\(?(https?:\/\/[^)]+):(\d+):(\d+)\)?/)
    if (match) return { url: match[1], line: parseInt(match[2]), col: parseInt(match[3]) }
    return null
  }

  function getReactSource(element) {
    // React 16+ guarda a fiber no nó DOM com chave que começa com __reactFiber
    const fiberKey = Object.keys(element).find(
      (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
    )
    if (!fiberKey) return null

    let fiber = element[fiberKey]
    let bestFiber = null

    // Sobe na árvore buscando tanto _debugSource (React 18) quanto _debugStack/_debugTask (React 19)
    while (fiber) {
      // ── React 18: _debugSource ──────────────────────────────────────────────
      if (fiber._debugSource) {
        const { fileName, lineNumber, columnNumber } = fiber._debugSource
        const componentName =
          fiber.type && typeof fiber.type === 'function'
            ? fiber.type.displayName || fiber.type.name || null
            : null
        return { file: fileName, line: lineNumber, col: columnNumber, component: componentName, framework: 'react' }
      }

      // ── React 19: _debugStack (Error object com stack trace) ────────────────
      if ((fiber._debugStack || fiber._debugTask) && !bestFiber) {
        if (typeof fiber.type === 'function' && fiber.type.name) {
          bestFiber = fiber
        }
      }

      fiber = fiber.return
    }

    // Processa o fiber do React 19 com _debugStack
    if (bestFiber) {
      const stackErr = bestFiber._debugStack || bestFiber._debugTask?.run
      const stack = typeof stackErr === 'string'
        ? stackErr
        : (stackErr instanceof Error ? stackErr.stack : null)

      const componentName = bestFiber.type?.displayName || bestFiber.type?.name || null

      if (stack) {
        // Encontra a primeira linha de stack que pertence ao servidor de dev (não node_modules)
        const lines = stack.split('\n')
        for (const l of lines) {
          if (!l.includes('node_modules') && !l.includes('webpack-internal') &&
              !l.includes('react-dom') && !l.includes('react.development')) {
            const pos = parseStackLine(l)
            if (pos && pos.url) {
              // Retorna resultado pendente + agenda resolução assíncrona pelo source map
              const pending = {
                file: pos.url, line: pos.line, col: pos.col,
                component: componentName, framework: 'react',
                _pendingSourceMap: true  // flag para resolução assíncrona
              }
              // Resolve o source map e quando terminar atualiza o último resultado capturado
              resolveViaSourceMap(pos.url, pos.line, pos.col).then(resolved => {
                if (resolved) {
                  _lastResolved = { ...pending, file: resolved.file, line: resolved.line, _pendingSourceMap: false }
                  // Dispara um elemento-info atualizado se o inspector ainda estiver ativo
                  if (isActive && window.__devlens_bridge__) {
                    window.__devlens_bridge__.sendInfo({
                      ...(_lastResolvedInfo || {}),
                      filePath: formatPath(resolved.file),
                      file: resolved.file,
                      line: resolved.line,
                    })
                  }
                }
              })
              return pending
            }
          }
        }
        // Fallback: retorna só o nome do componente sem arquivo
        return { file: null, line: null, component: componentName, framework: 'react' }
      }

      return { file: null, line: null, component: componentName, framework: 'react' }
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

  // ─── Aggregador de informações do elemento ─────────────────────────────

  function getElementInfo(element) {
    if (!element || element.id === '__devlens_overlay__' || element.id === '__devlens_tooltip__') {
      return null
    }

    const tagName = element.tagName?.toLowerCase() || 'unknown'
    const source = getReactSource(element) || getVueSource(element) || getDataAttrSource(element)

    if (source) {
      // Se é resultado pendente de React 19 e já temos a resolução em cache, usa ela
      if (source._pendingSourceMap && _lastResolved && !_lastResolved._pendingSourceMap) {
        const resolved = _lastResolved
        const info = {
          ...source,
          ...resolved,
          tagName,
          filePath: formatPath(resolved.file),
        }
        _lastResolvedInfo = info
        return info
      }
      const info = { ...source, tagName, filePath: formatPath(source.file) }
      _lastResolvedInfo = info
      return info
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
    // Limpa o cache de resolução ao mudar de elemento
    _lastResolved = null
    const info = getElementInfo(el)
    _currentInfo = info

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

    let classes = ''
    if (typeof currentElement.className === 'string') {
      classes = currentElement.className
    } else if (currentElement.className && currentElement.className.baseVal) {
      classes = currentElement.className.baseVal
    }

    const doSend = (info) => {
      if (window.__devlens_bridge__) {
        window.__devlens_bridge__.sendCopy({
          file: info?.filePath || null,
          line: info?.line || null,
          component: info?.component || null,
          framework: info?.framework || 'html',
          tagName: currentElement.tagName.toLowerCase(),
          classes: classes
        })
      }
    }

    // Tenta pegar a info mais atualizada (já com source map resolvido)
    const info = getElementInfo(currentElement)

    // Se ainda está pendente a resolução do source map, espera um curto período
    if (info?._pendingSourceMap) {
      // Aguarda até 800ms pela resolução assíncrona do source map
      const deadline = Date.now() + 800
      const wait = setInterval(() => {
        if (_lastResolved && !_lastResolved._pendingSourceMap) {
          clearInterval(wait)
          const resolved = {
            ...info,
            ..._lastResolved,
            filePath: formatPath(_lastResolved.file),
          }
          doSend(resolved)
        } else if (Date.now() > deadline) {
          clearInterval(wait)
          doSend(info) // envia com o que tiver (URL do bundle)
        }
      }, 50)
    } else {
      doSend(info)
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
