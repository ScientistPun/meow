/**
 * Seedream Tools - 主进程
 * 负责窗口管理、IPC通信、文件操作和API请求
 */

const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron')
const pkgInfo = require('./package.json')
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const axios = require('axios')
const APP_NAME = 'Seedream Tools'

let mainWindow

// ======================
// 常量配置
// ======================

/** 默认配置文件内容 */
const DEFAULT_CONFIG = `api_key: ""
dev_mode: true
base_url: https://ark.cn-beijing.volces.com/api/v3/images/generations
auto_save: true
save_dir:
models:
  v5: doubao-seedream-5-0-260128
  v45: doubao-seedream-4-5-251128
  v4: doubao-seedream-4-0-250828
default:
  output_format: png
  watermark: false
`

/** README 文件路径 */
const README_PATH = path.join(__dirname, 'readme.md')

// ======================
// 工具函数
// ======================

/**
 * 获取配置文件路径
 * @returns {string} 配置文件完整路径
 */
function getConfigPath() {
  const userPath = app.isPackaged ? app.getPath('userData') : __dirname
  return path.join(userPath, 'config.yml')
}

/**
 * 获取日志文件路径
 * @returns {string} 日志文件完整路径
 */
function getLogPath() {
  const userPath = app.isPackaged ? app.getPath('userData') : __dirname
  return path.join(userPath, 'cache.log')
}

/**
 * 生成图片文件名前缀 (格式: seedream_YYMMDDHHMMSS_)
 * @returns {string} 时间戳前缀
 */
function getSaveImgPrefix() {
  const now = new Date()
  const pad = (n) => n.toString().padStart(2, '0')
  const year = now.getFullYear().toString().slice(2)
  return `seedream_${year}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_`
}

/**
 * 获取当前时间戳 (格式: YYYY-MM-DD HH:MM:SS)
 * @returns {string} 格式化时间戳
 */
function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').split('.')[0]
}

/**
 * 写入日志
 * @param {string} message - 日志内容
 * @param {boolean} force - 是否强制写入（无视 dev_mode）
 */
function appendLog(message, force = false) {
  const logPath = getLogPath()
  const cfg = yaml.load(fs.readFileSync(getConfigPath(), 'utf8'))
  if (!cfg.dev_mode && !force) return
  fs.appendFileSync(logPath, `[${getTimestamp()}] ${message}\n`, 'utf8')
}

// ======================
// 窗口管理
// ======================

/**
 * 创建主窗口
 */
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  await mainWindow.loadFile('index.html')
  mainWindow.setMenuBarVisibility(false)
}

// ======================
// IPC 处理器
// ======================

/** 获取应用信息 */
ipcMain.handle('get-app-info', () => ({
  version: pkgInfo.version,
  author: pkgInfo.author,
  repository: pkgInfo.repository
}))

/** 加载配置 */
ipcMain.handle('load-config', () => {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, DEFAULT_CONFIG, 'utf8')
  }
  return yaml.load(fs.readFileSync(configPath, 'utf8'))
})

/** 获取配置 YAML 原文 */
ipcMain.handle('get-config-yml', () => {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, DEFAULT_CONFIG, 'utf8')
  }
  return fs.readFileSync(configPath, 'utf8')
})

/** 保存配置 */
ipcMain.handle('save-config-yml', (e, content) => {
  try {
    fs.writeFileSync(getConfigPath(), content, 'utf8')
    dialog.showMessageBoxSync({
      type: 'info',
      title: APP_NAME,
      message: '✅ 配置保存成功',
      buttons: ['确定']
    })
    return { success: true }
  } catch (err) {
    dialog.showMessageBoxSync({
      type: 'error',
      title: APP_NAME,
      message: `❌ 配置保存失败：${err.message}`,
      buttons: ['确定']
    })
    return { error: err.message }
  }
})

/** 保存配置对象（从表单） */
ipcMain.handle('save-config-obj', (e, config) => {
  try {
    const yamlContent = yaml.dump(config, { lineWidth: -1 })
    fs.writeFileSync(getConfigPath(), yamlContent, 'utf8')
    dialog.showMessageBoxSync({
      type: 'info',
      title: APP_NAME,
      message: '✅ 配置保存成功',
      buttons: ['确定']
    })
    return { success: true }
  } catch (err) {
    dialog.showMessageBoxSync({
      type: 'error',
      title: APP_NAME,
      message: `❌ 配置保存失败：${err.message}`,
      buttons: ['确定']
    })
    return { error: err.message }
  }
})

/** 获取说明文档 */
ipcMain.handle('get-readme', () => {
  if (!fs.existsSync(README_PATH)) return '# Seedream 图像生成工具'
  return fs.readFileSync(README_PATH, 'utf8')
})

/** 获取日志内容 */
ipcMain.handle('get-logs', () => {
  const logPath = getLogPath()
  return fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''
})

/** 写入日志 */
ipcMain.handle('write-log', (e, message) => {
  appendLog(message, true)
  return { success: true }
})

/** 清空日志 */
ipcMain.handle('clear-logs', () => {
  try {
    fs.writeFileSync(getLogPath(), '', 'utf8')
    dialog.showMessageBoxSync({
      type: 'info',
      title: APP_NAME,
      message: '✅ 日志已清空',
      buttons: ['确定']
    })
    return { success: true }
  } catch (err) {
    dialog.showMessageBoxSync({
      type: 'error',
      title: APP_NAME,
      message: `❌ 清空日志失败：${err.message}`,
      buttons: ['确定']
    })
    return { error: err.message }
  }
})

/** 保存图片到指定路径 */
ipcMain.handle('save-image', (e, { filePath, base64Data }) => {
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
    dialog.showMessageBoxSync({
      type: 'info',
      title: APP_NAME,
      message: '✅ 图片保存成功',
      buttons: ['确定']
    })
    return { success: true }
  } catch (err) {
    dialog.showMessageBoxSync({
      type: 'error',
      title: APP_NAME,
      message: `❌ 图片保存失败：${err.message}`,
      buttons: ['确定']
    })
    return { error: err.message }
  }
})

/** 生成图片 */
ipcMain.handle('generate-image', async (e, opts) => {
  const cfg = yaml.load(fs.readFileSync(getConfigPath(), 'utf8'))
  const { modelKey, mode, prompt, imageUrls = [], size, strength = 0.7, maxImages } = opts

  // 参数校验
  if (!cfg.api_key) return { error: 'api_key错误' }
  if (!cfg.base_url) return { error: 'base_url地址错误' }

  const model = cfg.models[modelKey]
  if (!model) return { error: '不支持的模型' }
  if (!prompt) return { error: '请输入提示词' }

  // 构建请求体
  const payload = {
    model, prompt, size,
    watermark: cfg.default?.watermark || false,
    stream: true,
    sequential_image_generation: 'auto',
    response_format: 'b64_json'
  }

  // 可选参数
  if (maxImages && maxImages > 0) {
    payload.sequential_image_generation_options = { max_images: maxImages }
  }
  if (model === cfg.models.v5) {
    payload.output_format = cfg.default?.output_format || 'png'
  }
  if (['img2img', 'img2img_multi', 'img2img_group'].includes(mode)) {
    if (!imageUrls?.length) return { error: `[${mode}] 必须传入图片` }
    if (mode === 'img2img_multi' && imageUrls.length < 2) {
      return { error: '多图融合至少需要 2 张' }
    }
    payload.image = imageUrls
    payload.strength = strength
  }

  // 记录请求日志
  appendLog(`💡 请求 | 模型=${model} | 模式=${mode}`, true)
  if (cfg.dev_mode) {
    const curl = `curl -X POST ${cfg.base_url} -H "Authorization: Bearer ${cfg.api_key}" -H "Content-Type: application/json" -d '${JSON.stringify(payload)}'`
    appendLog(`📝 CURL: ${curl}`, true)
  }

  try {
    // 发送请求
    const res = await axios({
      method: 'POST',
      url: cfg.base_url,
      headers: {
        Authorization: `Bearer ${cfg.api_key}`,
        'Content-Type': 'application/json'
      },
      data: payload,
      responseType: 'text',
      timeout: 180000
    })

    // 解析 SSE 响应
    const dataList = []
    let usage = {}
    for (const line of res.data.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const json = line.slice(6).trim()
      if (json === '[DONE]') break
      try {
        const obj = JSON.parse(json)
        if (obj.type === 'image_generation.partial_succeeded') {
          dataList.push({ b64_json: obj.b64_json })
        } else if (obj.type === 'image_generation.completed') {
          usage = obj.usage || {}
        }
      } catch {}
    }

    // 自动保存图片
    const savedPaths = []
    if (cfg.auto_save && cfg.save_dir && dataList.length > 0) {
      const imgPrefix = getSaveImgPrefix()
      const outputDir = cfg.save_dir.replace(/^~/, process.env.HOME)
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

      for (let i = 0; i < dataList.length; i++) {
        const ext = cfg.default?.output_format || 'png'
        const filePath = path.join(outputDir, `${imgPrefix}${i}.${ext}`)
        fs.writeFileSync(filePath, Buffer.from(dataList[i].b64_json, 'base64'))
        savedPaths.push(filePath)
      }
    }

    const base64List = dataList.map(i => i.b64_json).filter(Boolean)
    appendLog(`✅ 完成 | 生成=${base64List.length}张 | 保存=${savedPaths.length}张`, true)

    return { success: true, base64List, savedPaths, usage }
  } catch (e) {
    const err = `请求失败：${e.message}`
    appendLog(`❌ ${err}`, true)
    return { error: err }
  }
})

/** 打开目录选择对话框 */
ipcMain.handle('open-directory', () => dialog.showOpenDialog({ properties: ['openDirectory'] }))

/** 退出应用 */
ipcMain.on('appExit', () => app.quit())

// ======================
// 应用生命周期
// ======================

app.whenReady().then(() => {
  createWindow()

  // 注册 F12 开发者工具快捷键
  globalShortcut.register('F12', () => {
    mainWindow?.webContents.toggleDevTools()
  })
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
