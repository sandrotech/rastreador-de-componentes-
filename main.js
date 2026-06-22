const { app, BrowserWindow, ipcMain, clipboard, session, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const fsPromises = fs.promises

// Desabilita totalmente o cache HTTP para evitar cachear arquivos de desenvolvimento
app.commandLine.appendSwitch('disable-http-cache')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0A0A0F',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // habilita a tag <webview>
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'src', 'ui', 'index.html'))

  // Injeta o preload na webview antes dela ser criada
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences) => {
    webPreferences.preload = path.join(__dirname, 'webview-preload.js')
    // contextIsolation: false permite que o preload defina window.__devlens_bridge__
    // e o script injetado (inspector.js) acesse normalmente
    webPreferences.contextIsolation = false
    webPreferences.nodeIntegration = false
  })
}

// Função auxiliar de busca recursiva assíncrona por componente no projeto
async function findComponentInDirAsync(dir, componentName, baseDir = dir) {
  const ignoreDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.vercel', 'out', 'public', 'temp', 'tmp'])
  const validExts = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue'])
  
  let files
  try {
    files = await fsPromises.readdir(dir, { withFileTypes: true })
  } catch (e) {
    return null
  }
  
  const subdirs = []
  for (const file of files) {
    const fullPath = path.join(dir, file.name)
    if (file.isDirectory()) {
      if (!ignoreDirs.has(file.name)) {
        subdirs.push(fullPath)
      }
    } else {
      const ext = path.extname(file.name).toLowerCase()
      if (validExts.has(ext)) {
        try {
          const content = await fsPromises.readFile(fullPath, 'utf8')
          const lines = content.split('\n')
          
          const regexes = [
            new RegExp(`\\bfunction\\s+${componentName}\\b`),
            new RegExp(`\\bconst\\s+${componentName}\\s*=`),
            new RegExp(`\\blet\\s+${componentName}\\s*=`),
            new RegExp(`\\bclass\\s+${componentName}\\b`),
            new RegExp(`\\bexport\\s+default\\s+(?:function\\s+)?${componentName}\\b`),
          ]
          
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const lineText = lines[lineIdx]
            for (const regex of regexes) {
              if (regex.test(lineText)) {
                const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/')
                return {
                  filePath: relativePath,
                  line: lineIdx + 1
                }
              }
            }
          }
        } catch (e) {
          // ignora erro de leitura
        }
      }
    }
  }
  
  for (const subdir of subdirs) {
    const res = await findComponentInDirAsync(subdir, componentName, baseDir)
    if (res) return res
  }
  
  return null
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

// Selecionar a pasta do projeto
ipcMain.handle('select-project-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Selecione a pasta do seu projeto React/Vue'
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
})

// Buscar um componente na pasta do projeto
ipcMain.handle('find-component-file', async (_event, { projectPath, componentName }) => {
  if (!projectPath || !componentName) return null
  try {
    return await findComponentInDirAsync(projectPath, componentName)
  } catch (err) {
    console.error('Erro ao buscar componente:', err)
    return null
  }
})

// Copiar para área de transferência
ipcMain.handle('copy-to-clipboard', (_event, text) => {
  clipboard.writeText(text)
  return true
})

// Ler o script do inspector para injetar na webview
ipcMain.handle('get-inspector-script', () => {
  const scriptPath = path.join(__dirname, 'src', 'injected', 'inspector.js')
  return fs.readFileSync(scriptPath, 'utf-8')
})

// Controles da janela (custom title bar)
ipcMain.on('window-minimize', () => mainWindow.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow.close())

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
