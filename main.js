const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron')
const path = require('path')
const fs = require('fs')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  })

  mainWindow.loadFile('index.html')
  mainWindow.setMenuBarVisibility(false)

  // ✅ F12 打开开发者工具
  globalShortcut.register('F12', () => {
    mainWindow.webContents.toggleDevTools()
  })
}

// 打开文件夹选择
ipcMain.handle('open-directory', async () => {
  return await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
})

ipcMain.handle('getLog', () => {
  const logPath = path.join(__dirname, 'cache.log')
  return fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''
})

ipcMain.handle('clearLog', () => {
  const logPath = path.join(__dirname, 'cache.log')
  if (fs.existsSync(logPath)) fs.writeFileSync(logPath, '')
})

ipcMain.handle('getConfig', () => {
  const cfgPath = path.join(__dirname, 'config.yml')
  const defaultCfg = `
api_key: ""
auto_save: false
models:
  v5: ""
  v45: ""
  v4: ""
`
  if (!fs.existsSync(cfgPath)) fs.writeFileSync(cfgPath, defaultCfg, 'utf8')
  return fs.readFileSync(cfgPath, 'utf8')
})

ipcMain.handle('saveConfig', (event, content) => {
  const cfgPath = path.join(__dirname, 'config.yml')
  fs.writeFileSync(cfgPath, content, 'utf8')
})

ipcMain.handle('readReadme', () => {
  const readmePath = path.join(__dirname, 'README.md')
  if (!fs.existsSync(readmePath)) return '# 使用说明\n\n暂无文档'
  return fs.readFileSync(readmePath, 'utf8')
})

ipcMain.on('appExit', () => {
  app.quit()
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// 退出时注销快捷键
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})