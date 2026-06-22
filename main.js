const { app, BrowserWindow, ipcMain, clipboard, session } = require('electron')
const path = require('path')
const fs = require('fs')

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

// ─── IPC Handlers ────────────────────────────────────────────────────────────

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
