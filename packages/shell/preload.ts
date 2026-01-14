import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  captureLoginInfo: () => ipcRenderer.invoke('capture-login-info'),
  loadAccounts: () => ipcRenderer.invoke('load-accounts'),
  openAccountsFolder: () => ipcRenderer.invoke('open-accounts-folder'),

  // 新增：获取当前页面的cookie和localStorage数据
  getCurrentPageData: () => ipcRenderer.invoke('get-current-page-data'),

  // 新增：设置cookie和localStorage数据到新页面
  setPageData: (data: any) => ipcRenderer.invoke('set-page-data', data),

  // 新增：获取指定URL的cookie数据
  getCookiesForUrl: (url: any) => ipcRenderer.invoke('get-cookies-for-url', url),

  // 新增：设置cookie数据
  setCookies: (cookies: any, url: any) => ipcRenderer.invoke('set-cookies', cookies, url),

  // 修复事件监听器 - 关键修复
  onAccountSaved: (callback: any) => {
    const handler = (event: any, ...args: any[]) => {
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
  },
  // 添加创建无痕标签页的方法
  createIncognitoTab: (url: any) => ipcRenderer.invoke('create-incognito-tab', url),
})
