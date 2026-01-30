import { contextBridge, ipcRenderer, webFrame } from 'electron'

// 反检测：隐藏自动化特征
try {
  webFrame.executeJavaScript(`
    // 1. Overwrite navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    })

    // 2. Mock chrome object if needed
    if (!window.chrome) {
      window.chrome = {
        runtime: {}
      }
    }
    
    // 3. Mock plugins
    if (navigator.plugins.length === 0) {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3]
      });
    }
    
    // 4. Mock languages
    if (!navigator.languages || navigator.languages.length === 0) {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en']
      });
    }
  `)
} catch (e) {
  console.error('Failed to hide webdriver:', e)
}

// 仅在受信任的域名下暴露 electronAPI
const trustedHosts = ['matrix.newgalaxyai.com', 'localhost', '127.0.0.1']
const currentHost = window.location.hostname

// 简单的子域名检查
const isTrusted = trustedHosts.some(
  (host) => currentHost === host || currentHost.endsWith('.' + host),
)

if (isTrusted) {
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
} else {
  // 对于非信任域名（如知乎），执行更严格的反指纹清理
  try {
    webFrame.executeJavaScript(`
      // 移除可能存在的 Electron 痕迹
    delete window.electronAPI;
    delete window.exports;
    delete window.module;
    
    // 深度反检测：移除 ChromeDriver 变量
    // 知乎等网站会检查这些变量
    const cdcRegex = /cdc_[a-z0-9]+/ig;
    for (const key in window) {
      if (key.match(cdcRegex)) {
        delete window[key];
      }
    }
    
    // 确保 navigator 属性正常
    if (!navigator.permissions) {
        navigator.permissions = {
          query: () => Promise.resolve({ state: 'granted' })
        };
      }
    `)
  } catch (e) {
    console.error('Failed to clean environment:', e)
  }
}
