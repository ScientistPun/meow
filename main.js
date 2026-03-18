/**
 * Meow - 主进程
 * 负责窗口管理、IPC通信、文件操作和API请求
 */

const { app, BrowserWindow, ipcMain, ipcRenderer, dialog, globalShortcut, clipboard, shell } = require('electron')
const pkgInfo = require('./package.json')
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const axios = require('axios')
const APP_NAME = 'Meow'

let mainWindow

// ======================
// 常量配置
// ======================

/** 默认配置文件内容 */
const DEFAULT_CONFIG = `api_key: ""
dev_mode: false
base_url: https://ark.cn-beijing.volces.com/api/v3/images/generations
auto_save: false
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

/** 提词库文件路径 */
const PROMPTS_PATH = () => {
  const userPath = app.isPackaged ? app.getPath('userData') : __dirname
  return path.join(userPath, 'prompts.json')
}

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
 * 解析文件名前缀中的日期占位符
 * 支持: %yyyy(四位年), %yy(两位年), %mm(月), %dd(日), %HH(时), %MM(分), %SS(秒)
 * @param {string} prefix - 包含占位符的文件名前缀
 * @returns {string} 解析后的文件名
 */
function parseDatePrefix(prefix) {
  if (!prefix) return getDefaultPrefix()

  const now = new Date()
  const pad = (n, len = 2) => n.toString().padStart(len, '0')
  const year = now.getFullYear()
  const year2 = year.toString().slice(2)

  return prefix
    .replace(/%yyyy/g, year)
    .replace(/%yy/g, year2)
    .replace(/%mm/g, pad(now.getMonth() + 1))
    .replace(/%dd/g, pad(now.getDate()))
    .replace(/%HH/g, pad(now.getHours()))
    .replace(/%MM/g, pad(now.getMinutes()))
    .replace(/%SS/g, pad(now.getSeconds()))
}

/**
 * 获取默认的文件名前缀
 * @returns {string} 默认前缀
 */
function getDefaultPrefix() {
  const now = new Date()
  const pad = (n) => n.toString().padStart(2, '0')
  const year = now.getFullYear().toString().slice(2)
  return `${pkgInfo.name}_${year}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_`
}

/**
 * 生成图片文件名前缀
 * @param {string} customPrefix - 自定义前缀（可选，支持日期占位符）
 * @returns {string} 文件名前缀
 */
function getSaveImgPrefix(customPrefix) {
  if (customPrefix) {
    return parseDatePrefix(customPrefix)
  }
  return getDefaultPrefix()
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
  name: pkgInfo.name,
  version: pkgInfo.version,
  author: pkgInfo.author,
  repository: pkgInfo.repository
}))

/** 检查版本更新 */
ipcMain.handle('check-update', async () => {
  try {
    const owner = 'ScientistPun'
    const repo = 'seedreem-tool'
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`

    const res = await axios.get(apiUrl, {
      timeout: 10000,
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    })

    const latest = res.data
    const latestVersion = latest.tag_name?.replace(/^v/, '') || latest.name?.replace(/^v/, '')
    const currentVersion = pkgInfo.version

    // 比较版本号
    const hasUpdate = compareVersion(latestVersion, currentVersion) > 0

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseUrl: latest.html_url,
      releaseNotes: latest.body || '暂无更新说明',
      publishedAt: latest.published_at
    }
  } catch (err) {
    return { error: err.message }
  }
})

/**
 * 比较版本号
 * @returns {number} 1: v1>v2, 0: v1=v2, -1: v1<v2
 */
function compareVersion(v1, v2) {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  const len = Math.max(parts1.length, parts2.length)

  for (let i = 0; i < len; i++) {
    const a = parts1[i] || 0
    const b = parts2[i] || 0
    if (a > b) return 1
    if (a < b) return -1
  }
  return 0
}

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
    return { success: true, message: '✅ 配置保存成功' }
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
    // 确保 default 对象存在且有 output_format
    if (!config.default) {
      config.default = {}
    }
    if (!config.default.output_format || config.default.output_format.trim() === '') {
      config.default.output_format = 'png'
    }
    const yamlContent = yaml.dump(config, { lineWidth: -1, quotingType: '"' })
    fs.writeFileSync(getConfigPath(), yamlContent, 'utf8')
    return { success: true, message: '✅ 配置保存成功' }
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
  if (!fs.existsSync(README_PATH)) return '# Meow 图像生成工具'
  return fs.readFileSync(README_PATH, 'utf8')
})

/** 加载提词库（支持从 localStorage 迁移） */
ipcMain.handle('load-prompts', () => {
  const promptsPath = PROMPTS_PATH()
  const isPackaged = app.isPackaged

  // 如果文件已存在，直接读取
  if (fs.existsSync(promptsPath)) {
    try {
      return JSON.parse(fs.readFileSync(promptsPath, 'utf8'))
    } catch {
      return []
    }
  }

  // 打包环境下，检查是否需要从 localStorage 迁移（通过 webContents 请求）
  // 这里返回空数组，实际迁移在渲染进程完成
  return []
})

/** 从 localStorage 迁移提词库到文件 */
ipcMain.handle('migrate-prompts-from-localStorage', (e, localStoragePrompts) => {
  try {
    const promptsPath = PROMPTS_PATH()
    fs.writeFileSync(promptsPath, JSON.stringify(localStoragePrompts, null, 2), 'utf8')
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

/** 保存提词库 */
ipcMain.handle('save-prompts', (e, prompts) => {
  try {
    fs.writeFileSync(PROMPTS_PATH(), JSON.stringify(prompts, null, 2), 'utf8')
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
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
    return { success: true, message: '✅ 日志已清空' }
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
    return { success: true, message: '✅ 图片保存成功' }
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
      const imgPrefix = getSaveImgPrefix(cfg.save_prefix)
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
    // 获取 requestId
    let requestId = ''
    if (e.response?.data) {
      requestId = e.response.data.request_id || e.response.data.requestId || ''
      // 无论是否开启调试模式，都保存完整响应
      appendLog(`📝 错误响应: ${JSON.stringify(e.response.data)}`, true)
    }
    const err = `请求失败：${e.message}${requestId ? ` (requestId: ${requestId})` : ''}`
    appendLog(`❌ ${err}`, true)
    return { error: err, requestId }
  }
})

/** 打开目录选择对话框 */
ipcMain.handle('open-directory', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  return dialog.showOpenDialog(win, { properties: ['openDirectory'] })
})

/** 弹出输入框对话框 */
ipcMain.handle('show-input-box', async (event, { title, defaultValue, placeholder }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return new Promise((resolve) => {
    const dialogId = 'input-' + Date.now()
    win.webContents.send('show-input-dialog', { dialogId, title, defaultValue, placeholder })

    // 监听渲染进程返回的结果
    ipcMain.once('input-dialog-result-' + dialogId, (e, result) => {
      resolve(result)
    })
  })
})

/** 复制到剪贴板 */
ipcMain.handle('copy-to-clipboard', (e, text) => {
  clipboard.writeText(text)
  return { success: true }
})

/** 在默认浏览器中打开外部链接 */
ipcMain.handle('open-external', async (e, url) => {
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

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
