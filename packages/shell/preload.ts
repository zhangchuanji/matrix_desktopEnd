import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  captureLoginInfo: () => ipcRenderer.invoke('capture-login-info'),
  loadAccounts: () => ipcRenderer.invoke('load-accounts'),
  openAccountsFolder: () => ipcRenderer.invoke('open-accounts-folder'),
  
  // 修复事件监听器 - 关键修复
  onAccountSaved: (callback) => {
    const handler = (event, ...args) => {
      console.log('preload.ts 接收到 account-saved 事件:', { event, args })
      // 确保正确传递数据
      if (args.length > 0) {
        callback(args[0])
      } else {
        callback(null)
      }
    }
    ipcRenderer.on('account-saved', handler)
    // 返回清理函数
    return () => ipcRenderer.removeListener('account-saved', handler)
  }
})
