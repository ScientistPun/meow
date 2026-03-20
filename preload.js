/**
 * Preload Script - 预加载脚本
 * 负责在渲染进程中安全地暴露主进程 API
 * 遵循 Electron 安全最佳实践：contextIsolation + 显式 API 暴露
 */

const { contextBridge, ipcRenderer } = require('electron')

/**
 * 渲染进程可调用的 API 列表
 * 所有函数都返回 Promise，通过 IPC 与主进程通信
 * 
 * IPC 处理器分组：                                                                                                                                                                            
  - 应用信息（get-app-info, check-update）
  - 配置管理（load-config, get-config-yml, save-config-yml, save-config-obj）                                                                                                                 
  - 文档和日志（get-readme, get-logs, write-log, clear-logs）                
  - 提词库（load-prompts, migrate-prompts-from-localStorage, save-prompts）                                                                                                                   
  - 图片生成（generate-image, save-image）                                                                                                                                                    
  - 系统交互（open-directory, show-input-box, copy-to-clipboard, open-external, appExit）
 */
const api = {
  // 应用信息
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),

  // 配置管理
  loadConfig: () => ipcRenderer.invoke('load-config'),
  loadModelSizes: () => ipcRenderer.invoke('load-model-sizes'),
  getConfigYml: () => ipcRenderer.invoke('get-config-yml'),
  saveConfigYml: (content) => ipcRenderer.invoke('save-config-yml', content),
  saveConfigObj: (config) => ipcRenderer.invoke('save-config-obj', config),

  // 日志管理
  getLogs: () => ipcRenderer.invoke('get-logs'),
  writeLog: (message) => ipcRenderer.invoke('write-log', message),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),

  // 文档
  getReadme: () => ipcRenderer.invoke('get-readme'),

  // 提词库
  loadPrompts: () => ipcRenderer.invoke('load-prompts'),
  savePrompts: (prompts) => ipcRenderer.invoke('save-prompts', prompts),
  migratePromptsFromLocalStorage: (prompts) => ipcRenderer.invoke('migrate-prompts-from-localStorage', prompts),

  // 图片生成与保存
  generateImageVolces: (opts) => ipcRenderer.invoke('generate-image-volces', opts),
  generateImageMinimax: (opts) => ipcRenderer.invoke('generate-image-minimax', opts),
  saveImage: (filePath, base64Data) => ipcRenderer.invoke('save-image', { filePath, base64Data }),

  // 文件系统
  openDirectory: () => ipcRenderer.invoke('open-directory'),
  showInputBox: (opts) => ipcRenderer.invoke('show-input-box', opts),

  // 应用控制
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),

  // 剪贴板和系统操作
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  downloadUpdate: (opts) => ipcRenderer.invoke('download-update', opts),
}

// 暴露 API 到 window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', api)

// 监听输入对话框事件
ipcRenderer.on('show-input-dialog', (e, data) => {
  const { dialogId, title, defaultValue, placeholder } = data

  // 触发前端显示输入弹窗，使用 CustomEvent 传递数据
  const event = new CustomEvent('show-input-dialog', {
    detail: { dialogId, title, defaultValue, placeholder }
  })
  document.dispatchEvent(event)
})

// 发送输入对话框结果回主进程
contextBridge.exposeInMainWorld('returnInputDialogResult', (dialogId, result) => {
  ipcRenderer.send('input-dialog-result-' + dialogId, result)
})
