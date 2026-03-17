/**
 * Preload Script - 预加载脚本
 * 负责在渲染进程中安全地暴露主进程 API
 * 遵循 Electron 安全最佳实践：contextIsolation + 显式 API 暴露
 */

const { contextBridge, ipcRenderer } = require('electron')

/**
 * 渲染进程可调用的 API 列表
 * 所有函数都返回 Promise，通过 IPC 与主进程通信
 */
const api = {
  // 应用信息
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // 配置管理
  loadConfig: () => ipcRenderer.invoke('load-config'),
  getConfigYml: () => ipcRenderer.invoke('get-config-yml'),
  saveConfigYml: (content) => ipcRenderer.invoke('save-config-yml', content),
  saveConfigObj: (config) => ipcRenderer.invoke('save-config-obj', config),

  // 日志管理
  getLogs: () => ipcRenderer.invoke('get-logs'),
  writeLog: (message) => ipcRenderer.invoke('write-log', message),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),

  // 文档
  getReadme: () => ipcRenderer.invoke('get-readme'),

  // 图片生成与保存
  generateImage: (opts) => ipcRenderer.invoke('generate-image', opts),
  saveImage: (filePath, base64Data) => ipcRenderer.invoke('save-image', { filePath, base64Data }),

  // 文件系统
  openDirectory: () => ipcRenderer.invoke('open-directory'),

  // 应用控制
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
}

// 暴露 API 到 window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', api)
