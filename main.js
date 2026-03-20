/**
 * Meow - 主进程
 * 负责窗口管理、IPC通信、文件操作和API请求
 */

const { app, BrowserWindow, ipcMain, dialog, globalShortcut, clipboard, shell } = require('electron')
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

const DEFAULT_CONFIG = `dev_mode: false

#保存
save_setting:
  auto: false
  dir: ""
  format: png
  prefix: ""

# 首选模型 (格式: "供应商.模型")
preferred_model: minimax.v1_live

# 火山引擎
volces:
  api_key: ""
  base_url: https://ark.cn-beijing.volces.com/api/v3/images/generations
  models:
    v5: doubao-seedream-5-0-260128
    v45: doubao-seedream-4-5-251126
    v4: doubao-seedream-4-0-250828

#其他
other:
  watermark: false

# minimax
minimax:
  api_key: ""
  base_url: https://api.minimaxi.com/v1/image_generation
  models:
    v1: image-01
    v1_live: image-01-live
  prompt_optimizer: false
  aigc_watermark: false
`

const README_PATH = path.join(__dirname, 'readme.md')
const MODEL_SIZES_PATH = path.join(__dirname, 'model-sizes.json')

// ======================
// 配置缓存
// ======================

let cachedConfig = null

function getConfig() {
  if (!cachedConfig) {
    cachedConfig = yaml.load(fs.readFileSync(getConfigPath(), 'utf8'))
  }
  return cachedConfig
}

function refreshConfig() {
  cachedConfig = yaml.load(fs.readFileSync(getConfigPath(), 'utf8'))
}

// ======================
// 工具函数
// ======================

function getConfigPath() {
  const userPath = app.isPackaged ? app.getPath('userData') : __dirname
  return path.join(userPath, 'config.yml')
}

function getLogPath() {
  const userPath = app.isPackaged ? app.getPath('userData') : __dirname
  return path.join(userPath, 'cache.log')
}

function getPromptsPath() {
  const userPath = app.isPackaged ? app.getPath('userData') : __dirname
  return path.join(userPath, 'prompts.json')
}

function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').split('.')[0]
}

function appendLog(message, force = false) {
  const cfg = getConfig()
  if (!cfg.dev_mode && !force) return
  fs.appendFileSync(getLogPath(), `[${getTimestamp()}] ${message}\n`, 'utf8')
}

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

function getDefaultPrefix() {
  return parseDatePrefix(`${pkgInfo.name}_%yy%mm%dd%HH%MM%SS_`)
}

function getSaveImgPrefix(customPrefix) {
  return customPrefix ? parseDatePrefix(customPrefix) : getDefaultPrefix()
}

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

// ======================
// 窗口管理
// ======================

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
// IPC 处理器 - 应用信息
// ======================

ipcMain.handle('get-app-info', () => ({
  name: pkgInfo.name,
  version: pkgInfo.version,
  author: pkgInfo.author,
  repository: pkgInfo.repository
}))

ipcMain.handle('check-update', async () => {
  try {
    const apiUrl = `https://api.github.com/repos/ScientistPun/seedreem-tool/releases/latest`
    const res = await axios.get(apiUrl, {
      timeout: 10000,
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    })

    const latest = res.data
    const latestVersion = latest.tag_name?.replace(/^v/, '') || latest.name?.replace(/^v/, '')
    const hasUpdate = compareVersion(latestVersion, pkgInfo.version) > 0

    // 获取 assets 中的下载链接
    const assets = latest.assets?.map(asset => ({
      name: asset.name,
      downloadUrl: asset.browser_download_url
    })) || []

    return {
      hasUpdate,
      currentVersion: pkgInfo.version,
      latestVersion,
      releaseUrl: latest.html_url,
      releaseNotes: latest.body || '暂无更新说明',
      publishedAt: latest.published_at,
      assets
    }
  } catch (err) {
    return { error: err.message }
  }
})

// ======================
// IPC 处理器 - 配置管理
// ======================

ipcMain.handle('load-config', () => {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, DEFAULT_CONFIG, 'utf8')
  }
  return getConfig()
})

ipcMain.handle('load-model-sizes', () => {
  try {
    if (fs.existsSync(MODEL_SIZES_PATH)) {
      return JSON.parse(fs.readFileSync(MODEL_SIZES_PATH, 'utf8'))
    }
  } catch (err) {
    appendLog(`⚠️ 加载 model-sizes.json 失败: ${err.message}`, true)
  }
  return null
})

ipcMain.handle('get-config-yml', () => {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, DEFAULT_CONFIG, 'utf8')
  }
  return fs.readFileSync(configPath, 'utf8')
})

ipcMain.handle('save-config-yml', (e, content) => {
  try {
    fs.writeFileSync(getConfigPath(), content, 'utf8')
    refreshConfig()
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

ipcMain.handle('save-config-obj', (e, config) => {
  try {
    if (!config.save_setting) config.save_setting = {}
    if (!config.save_setting.format || config.save_setting.format.trim() === '') {
      config.save_setting.format = 'png'
    }
    const yamlContent = yaml.dump(config, { lineWidth: -1, quotingType: '"' })
    fs.writeFileSync(getConfigPath(), yamlContent, 'utf8')
    refreshConfig()
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

// ======================
// IPC 处理器 - 文档和日志
// ======================

ipcMain.handle('get-readme', () => {
  if (!fs.existsSync(README_PATH)) return '# Meow 图像生成工具'
  return fs.readFileSync(README_PATH, 'utf8')
})

ipcMain.handle('get-logs', () => {
  return fs.existsSync(getLogPath()) ? fs.readFileSync(getLogPath(), 'utf8') : ''
})

ipcMain.handle('write-log', (e, message) => {
  appendLog(message, true)
  return { success: true }
})

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

// ======================
// IPC 处理器 - 提词库
// ======================

ipcMain.handle('load-prompts', () => {
  const promptsPath = getPromptsPath()
  if (fs.existsSync(promptsPath)) {
    try {
      return JSON.parse(fs.readFileSync(promptsPath, 'utf8'))
    } catch {
      return []
    }
  }
  return []
})

ipcMain.handle('migrate-prompts-from-localStorage', (e, localStoragePrompts) => {
  try {
    fs.writeFileSync(getPromptsPath(), JSON.stringify(localStoragePrompts, null, 2), 'utf8')
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('save-prompts', (e, prompts) => {
  try {
    fs.writeFileSync(getPromptsPath(), JSON.stringify(prompts, null, 2), 'utf8')
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

// ======================
// IPC 处理器 - 图片生成
// ======================

ipcMain.handle('generate-image-volces', async (e, opts) => {
  const cfg = getConfig()
  const { modelKey, mode, prompt, imageUrls = [], size, strength = 0.7, maxImages } = opts

  // 参数校验
  if (!cfg.volces?.api_key) return { error: 'api_key错误' }
  if (!cfg.volces?.base_url) return { error: 'base_url地址错误' }

  const model = cfg.volces?.models?.[modelKey]
  if (!model) return { error: '不支持的模型' }
  if (!prompt) return { error: '请输入提示词' }

  // 构建请求体
  const payload = {
    model, prompt, size,
    watermark: cfg.other?.watermark || false,
    stream: true,
    sequential_image_generation: 'auto',
    response_format: 'b64_json'
  }

  // 可选参数
  if (maxImages && maxImages > 0) {
    payload.sequential_image_generation_options = { max_images: maxImages }
  }
  if (model === cfg.volces?.models?.v5) {
    payload.output_format = cfg.save_setting?.format || 'png'
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
  appendLog(`💡 火山引擎 请求 | 模型=${model} | 模式=${mode}`, true)
  if (cfg.dev_mode) {
    const curl = `curl -X POST ${cfg.volces?.base_url} -H "Authorization: Bearer ${cfg.volces?.api_key}" -H "Content-Type: application/json" -d '${JSON.stringify(payload)}'`
    appendLog(`📝 CURL: ${curl}`, true)
  }

  try {
    const res = await axios({
      method: 'POST',
      url: cfg.volces?.base_url,
      headers: {
        Authorization: `Bearer ${cfg.volces?.api_key}`,
        'Content-Type': 'application/json'
      },
      data: payload,
      responseType: 'text',
      timeout: 180000
    })

    // 解析 SSE 响应
    const dataList = []
    let lastProgress = 0
    let totalExpected = maxImages || 1
    let usage = {}

    for (const line of res.data.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const json = line.slice(6).trim()
      if (json === '[DONE]') break
      try {
        const obj = JSON.parse(json)
        if (obj.type === 'image_generation.partial_succeeded') {
          dataList.push({ b64_json: obj.b64_json })
          lastProgress++
          appendLog(`📝 进度 | 已生成 ${lastProgress}/${totalExpected} 张`, true)
        } else if (obj.type === 'image_generation.completed') {
          usage = obj.usage || {}
          appendLog(`📝 完成 | usage=${JSON.stringify(usage)}`, true)
        }
      } catch (err) {
        appendLog(`⚠️ 解析行失败: ${err.message}`, true)
      }
    }

    // 调试模式保存响应结果
    if (cfg.dev_mode) {
      appendLog(`📝 响应结果: ${res.data.substring(0, 500)}...`, true)
    }

    // 自动保存图片
    const savedPaths = []
    if (cfg.save_setting?.auto && cfg.save_setting?.dir && dataList.length > 0) {
      const imgPrefix = getSaveImgPrefix(cfg.save_setting?.prefix || '')
      const outputDir = cfg.save_setting.dir.replace(/^~/, process.env.HOME)
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

      const ext = cfg.save_setting?.format || 'png'
      for (let i = 0; i < dataList.length; i++) {
        const filePath = path.join(outputDir, `${imgPrefix}${i}.${ext}`)
        fs.writeFileSync(filePath, Buffer.from(dataList[i].b64_json, 'base64'))
        savedPaths.push(filePath)
        appendLog(`💾 保存 | ${filePath}`, true)
      }
    }

    const base64List = dataList.map(i => i.b64_json).filter(Boolean)
    appendLog(`✅ 火山引擎 完成 | 生成=${base64List.length}张 | 保存=${savedPaths.length}张`, true)

    return { success: true, base64List, savedPaths, usage, progress: { current: base64List.length, total: totalExpected } }
  } catch (err) {
    let requestId = ''
    let errMsg = err.message

    if (err.response?.data) {
      const errData = err.response.data
      if (typeof errData === 'string') {
        try {
          const parsed = JSON.parse(errData)
          requestId = parsed.request_id || parsed.requestId || ''
          errMsg = parsed.error?.message || parsed.message || errMsg
        } catch {}
      } else {
        requestId = errData.request_id || errData.requestId || ''
        errMsg = errData.error?.message || errData.message || errData.error || errMsg
      }
      appendLog(`📝 火山引擎 错误响应: ${typeof errData === 'string' ? errData : JSON.stringify(errData)}`, true)
    }

    const fullErrMsg = `火山引擎请求失败：${errMsg}${requestId ? ` (requestId: ${requestId})` : ''}`
    appendLog(`❌ ${fullErrMsg}`, true)
    return { error: fullErrMsg, requestId }
  }
})

ipcMain.handle('save-image', (e, { filePath, base64Data }) => {
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
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

// ======================
// IPC 处理器 - MiniMax 文生图
// ======================

ipcMain.handle('generate-image-minimax', async (e, opts) => {
  const cfg = getConfig()
  const { modelKey, prompt, aspect_ratio, width, height, n = 1, style, subject_reference } = opts

  // 参数校验
  if (!cfg.minimax?.api_key) return { error: 'MiniMax api_key 未设置' }
  if (!cfg.minimax?.base_url) return { error: 'MiniMax base_url 未设置' }

  const model = cfg.minimax?.models?.[modelKey]
  if (!model) return { error: '不支持的 MiniMax 模型' }
  if (!prompt) return { error: '请输入提示词' }

  // 从配置读取 prompt_optimizer 和 aigc_watermark
  const promptOptimizer = cfg.minimax?.prompt_optimizer || false
  const aigcWatermark = cfg.minimax?.aigc_watermark || false

  // 构建请求体
  const payload = {
    model,
    prompt,
    response_format: 'base64',
    n,
    prompt_optimizer: promptOptimizer,
    aigc_watermark: aigcWatermark
  }

  // 处理尺寸参数
  if (aspect_ratio && model === 'image-01') {
    payload.aspect_ratio = aspect_ratio
  } else if (width && height && model === 'image-01') {
    payload.width = width
    payload.height = height
  }

  // 处理 style 参数（仅 image-01-live 支持）
  if (style && model === 'image-01-live') {
    payload.style = style
  }

  // 处理图生图参考图（仅 image-01-live 支持）
  if (subject_reference && subject_reference.length > 0 && model === 'image-01-live') {
    payload.subject_reference = subject_reference.map(ref => ({
      type: 'character',
      image_file: ref
    }))
  }

  // 记录请求日志
  appendLog(`💡 MiniMax 请求 | 模型=${model} | 比例=${aspect_ratio || `${width}x${height}`}`, true)
  if (cfg.dev_mode) {
    const curl = `curl -X POST ${cfg.minimax?.base_url} -H "Authorization: Bearer ${cfg.minimax?.api_key}" -H "Content-Type: application/json" -d '${JSON.stringify(payload)}'`
    appendLog(`📝 CURL: ${curl}`, true)
  }

  try {
    const res = await axios({
      method: 'POST',
      url: cfg.minimax?.base_url,
      headers: {
        Authorization: `Bearer ${cfg.minimax?.api_key}`,
        'Content-Type': 'application/json'
      },
      data: payload,
      timeout: 180000
    })

    const respData = res.data
    appendLog(`📝 MiniMax 响应: ${JSON.stringify(respData).substring(0, 200)}...`, true)

    // 解析响应
    const result = {
      success: true,
      id: respData.id,
      imageUrls: [],
      imageBase64: [],
      metadata: respData.metadata || {}
    }

    if (respData.data?.image_base64) {
      result.imageBase64 = respData.data.image_base64
    }

    // 自动保存图片
    const savedPaths = []
    if (cfg.save_setting?.auto && cfg.save_setting?.dir && result.imageBase64.length > 0) {
      const imgPrefix = getSaveImgPrefix(cfg.save_setting?.prefix || '')
      const outputDir = cfg.save_setting.dir.replace(/^~/, process.env.HOME)
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

      const ext = cfg.save_setting?.format || 'png'
      for (let i = 0; i < result.imageBase64.length; i++) {
        const filePath = path.join(outputDir, `${imgPrefix}${i}.${ext}`)
        fs.writeFileSync(filePath, Buffer.from(result.imageBase64[i], 'base64'))
        savedPaths.push(filePath)
        appendLog(`💾 保存 | ${filePath}`, true)
      }
    }

    appendLog(`✅ MiniMax 完成 | 生成=${result.imageBase64.length}张 | 保存=${savedPaths.length}张`, true)

    return result
  } catch (err) {
    let errMsg = err.message
    let requestId = ''
    if (err.response?.data) {
      const errData = err.response.data
      requestId = errData.id || ''
      const statusMsg = errData.base_resp?.status_msg || errData.status_msg || ''
      const statusCode = errData.base_resp?.status_code || errData.status_code || ''
      errMsg = `MiniMax 请求失败：${statusMsg || err.message} (code: ${statusCode})${requestId ? ` (id: ${requestId})` : ''}`
      appendLog(`📝 MiniMax 错误响应: ${JSON.stringify(errData)}`, true)
    }
    appendLog(`❌ ${errMsg}`, true)
    return { error: errMsg, requestId }
  }
})

// ======================
// IPC 处理器 - 系统交互
// ======================

ipcMain.handle('open-directory', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  return dialog.showOpenDialog(win, { properties: ['openDirectory'] })
})

ipcMain.handle('show-input-box', async (e, { title, defaultValue, placeholder }) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  return new Promise((resolve) => {
    const dialogId = 'input-' + Date.now()
    win.webContents.send('show-input-dialog', { dialogId, title, defaultValue, placeholder })
    ipcMain.once('input-dialog-result-' + dialogId, (e, result) => resolve(result))
  })
})

ipcMain.handle('copy-to-clipboard', (e, text) => {
  clipboard.writeText(text)
  return { success: true }
})

ipcMain.handle('open-external', async (e, url) => {
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

// 下载更新文件
ipcMain.handle('download-update', async (_, { url, filename }) => {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 300000 })
    const downloadPath = path.join(app.getPath('temp'), filename)
    fs.writeFileSync(downloadPath, res.data)
    shell.showItemInFolder(downloadPath)
    return { success: true, path: downloadPath }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.on('appExit', () => app.quit())

// ======================
// 应用生命周期
// ======================

app.whenReady().then(() => {
  createWindow()
  globalShortcut.register('F12', () => mainWindow?.webContents.toggleDevTools())
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
