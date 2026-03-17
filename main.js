const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron')
const pkgInfo = require('./package.json')
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml') // 已修复依赖

let mainWindow

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  })

  await mainWindow.loadFile('index.html')
  mainWindow.setMenuBarVisibility(false)
}

ipcMain.handle('get-path', () => {
  return app.isPackaged ? app.getPath('userData'):__dirname
})

ipcMain.handle('save-file', (e, param) => {
  const dir = app.isPackaged ? app.getPath('userData'):__dirname
  console.log('path', path)
  const target = path.join(dir, param.filename)
  try {
    fs.writeFileSync(target, param.content, 'utf-8')
    dialog.showMessageBoxSync({ type: 'info', title: pkgInfo.build.productName, message: '✅ 操作成功'})
    return {success: true}
  } catch (e) {
    dialog.showMessageBoxSync({ type: 'warning', title: pkgInfo.build.productName, message: `⚠️ 操作失败：${e.error}`})
    return {error: e.message}
  }
})

app.whenReady().then(() => {
  createWindow()

  globalShortcut.register('F12', () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools()
    }
  })
})

ipcMain.handle('open-directory', async () => {
  return await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
})

ipcMain.on('appExit', () => {
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})