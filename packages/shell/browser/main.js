const path = require('path')
const fs = require('fs') // 添加这行
const { app, session, BrowserWindow, dialog, globalShortcut, ipcMain } = require('electron')

const { Tabs } = require('./tabs')
const { ElectronChromeExtensions } = require('electron-chrome-extensions')
const { setupMenu } = require('./menu')
const { buildChromeContextMenu } = require('electron-chrome-context-menu')
const { installChromeWebStore, loadAllExtensions } = require('electron-chrome-web-store')

// https://www.electronforge.io/config/plugins/webpack#main-process-code
const SHELL_ROOT_DIR = path.join(__dirname, '../../')
const ROOT_DIR = path.join(__dirname, '../../../../')
const PATHS = {
  WEBUI: app.isPackaged
    ? path.resolve(process.resourcesPath, 'ui')
    : path.resolve(SHELL_ROOT_DIR, 'browser', 'ui'),
  PRELOAD: path.join(__dirname, '../renderer/browser/preload.js'),
  LOCAL_EXTENSIONS: path.join(ROOT_DIR, 'extensions'),
}

let webuiExtensionId

const getParentWindowOfTab = (tab) => {
  switch (tab.getType()) {
    case 'window':
      return BrowserWindow.fromWebContents(tab)
    case 'browserView':
    case 'webview':
      return tab.getOwnerBrowserWindow()
    case 'backgroundPage':
      return BrowserWindow.getFocusedWindow()
    default:
      throw new Error(`Unable to find parent window of '${tab.getType()}'`)
  }
}

class TabbedBrowserWindow {
  constructor(options) {
    this.session = options.session || session.defaultSession
    this.extensions = options.extensions

    // Can't inheret BrowserWindow
    // https://github.com/electron/electron/issues/23#issuecomment-19613241
    this.window = new BrowserWindow(options.window)
    this.id = this.window.id
    this.webContents = this.window.webContents

    const webuiUrl = `chrome-extension://${webuiExtensionId}/webui.html`
    this.webContents.loadURL(webuiUrl)

    this.tabs = new Tabs(this.window)

    const self = this

    this.tabs.on('tab-created', function onTabCreated(tab) {
      tab.loadURL(options.urls.newtab)

      // Track tab that may have been created outside of the extensions API.
      self.extensions.addTab(tab.webContents, tab.window)
    })

    this.tabs.on('tab-selected', function onTabSelected(tab) {
      self.extensions.selectTab(tab.webContents)
    })

    queueMicrotask(() => {
      // Create initial tab
      const tab = this.tabs.create()

      if (options.initialUrl) {
        tab.loadURL(options.initialUrl)
      }
    })
  }

  destroy() {
    this.tabs.destroy()
    this.window.destroy()
  }

  getFocusedTab() {
    return this.tabs.selected
  }
}

class Browser {
  windows = []

  urls = {
    newtab: 'about:blank',
  }

  constructor() {
    // 添加账号数据文件路径
    this.accountsDataPath = path.join(__dirname, 'accounts.json')

    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve
    })

    app.whenReady().then(() => {
      this.init()

      // Register global shortcut for login info capture
      globalShortcut.register('CommandOrControl+Shift+L', () => {
        this.getCurrentPageLoginInfo()
          .then((loginInfo) => {
            console.log('Login info captured:', JSON.stringify(loginInfo, null, 2))
          })
          .catch((error) => {
            console.error('Failed to capture login info:', error)
          })
      })
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.destroy()
      }
    })

    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) this.createInitialWindow()
    })

    app.on('web-contents-created', this.onWebContentsCreated.bind(this))
  }

  destroy() {
    app.quit()
  }

  getFocusedWindow() {
    return this.windows.find((w) => w.window.isFocused()) || this.windows[0]
  }

  getWindowFromBrowserWindow(window) {
    return !window.isDestroyed() ? this.windows.find((win) => win.id === window.id) : null
  }

  getWindowFromWebContents(webContents) {
    let window

    if (this.popup && webContents === this.popup.browserWindow?.webContents) {
      window = this.popup.parent
    } else {
      window = getParentWindowOfTab(webContents)
    }

    return window ? this.getWindowFromBrowserWindow(window) : null
  }

  async init() {
    this.initSession()
    setupMenu(this)

    // Setup IPC handlers
    this.setupIpcHandlers()

    if ('registerPreloadScript' in this.session) {
      this.session.registerPreloadScript({
        id: 'shell-preload',
        type: 'frame',
        filePath: PATHS.PRELOAD,
      })
    } else {
      // TODO(mv3): remove
      this.session.setPreloads([PATHS.PRELOAD])
    }

    this.extensions = new ElectronChromeExtensions({
      license: 'internal-license-do-not-use',
      session: this.session,

      createTab: async (details) => {
        await this.ready

        const win =
          typeof details.windowId === 'number' &&
          this.windows.find((w) => w.id === details.windowId)

        if (!win) {
          throw new Error(`Unable to find windowId=${details.windowId}`)
        }

        const tab = win.tabs.create()

        if (details.url) tab.loadURL(details.url)
        if (typeof details.active === 'boolean' ? details.active : true) win.tabs.select(tab.id)

        return [tab.webContents, tab.window]
      },
      selectTab: (tab, browserWindow) => {
        const win = this.getWindowFromBrowserWindow(browserWindow)
        win?.tabs.select(tab.id)
      },
      removeTab: (tab, browserWindow) => {
        const win = this.getWindowFromBrowserWindow(browserWindow)
        win?.tabs.remove(tab.id)
      },

      createWindow: async (details) => {
        await this.ready

        const win = this.createWindow({
          initialUrl: details.url,
        })
        // if (details.active) tabs.select(tab.id)
        return win.window
      },
      removeWindow: (browserWindow) => {
        const win = this.getWindowFromBrowserWindow(browserWindow)
        win?.destroy()
      },
    })

    // Display <browser-action-list> extension icons.
    ElectronChromeExtensions.handleCRXProtocol(this.session)

    this.extensions.on('browser-action-popup-created', (popup) => {
      this.popup = popup
    })

    // Allow extensions to override new tab page
    this.extensions.on('url-overrides-updated', (urlOverrides) => {
      if (urlOverrides.newtab) {
        this.urls.newtab = urlOverrides.newtab
      }
    })

    const webuiExtension = await this.session.extensions.loadExtension(PATHS.WEBUI)
    webuiExtensionId = webuiExtension.id

    // Wait for web store extensions to finish loading as they may change the
    // newtab URL.
    await installChromeWebStore({
      session: this.session,
      async beforeInstall(details) {
        if (!details.browserWindow || details.browserWindow.isDestroyed()) return

        const title = `Add “${details.localizedName}”?`

        let message = `${title}`
        if (details.manifest.permissions) {
          const permissions = (details.manifest.permissions || []).join(', ')
          message += `\n\nPermissions: ${permissions}`
        }

        const returnValue = await dialog.showMessageBox(details.browserWindow, {
          title,
          message,
          icon: details.icon,
          buttons: ['Cancel', 'Add Extension'],
        })

        return { action: returnValue.response === 0 ? 'deny' : 'allow' }
      },
    })

    if (!app.isPackaged) {
      await loadAllExtensions(this.session, PATHS.LOCAL_EXTENSIONS, {
        allowUnpacked: true,
      })
    }

    await Promise.all(
      this.session.extensions.getAllExtensions().map(async (extension) => {
        const manifest = extension.manifest
        if (manifest.manifest_version === 3 && manifest?.background?.service_worker) {
          await this.session.serviceWorkers.startWorkerForScope(extension.url).catch((error) => {
            console.error(error)
          })
        }
      }),
    )

    this.createInitialWindow()
    this.resolveReady()
  }

  initSession() {
    this.session = session.defaultSession

    // Remove Electron and App details to closer emulate Chrome's UA
    const userAgent = this.session
      .getUserAgent()
      .replace(/\sElectron\/\S+/, '')
      .replace(new RegExp(`\\s${app.getName()}/\\S+`), '')
    this.session.setUserAgent(userAgent)

    // Setup login monitoring
    this.setupLoginMonitoring()

    this.session.serviceWorkers.on('running-status-changed', (event) => {
      console.info(`service worker ${event.versionId} ${event.runningStatus}`)
    })

    if (process.env.SHELL_DEBUG) {
      this.session.serviceWorkers.once('running-status-changed', () => {
        const tab = this.windows[0]?.getFocusedTab()
        if (tab) {
          tab.webContents.inspectServiceWorker()
        }
      })
    }
  }

  setupLoginMonitoring() {
    console.log('Starting login monitoring...')

    // Monitor cookie changes
    this.session.cookies.on('changed', (event, cookie, cause, removed) => {
      if (!removed) {
        const loginKeywords = ['session', 'auth', 'token', 'login', 'user', 'jwt', 'access']
        const isLoginCookie = loginKeywords.some((keyword) =>
          cookie.name.toLowerCase().includes(keyword),
        )

        if (isLoginCookie) {
          console.log('Login Cookie detected:', {
            name: cookie.name,
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            value: cookie.value.substring(0, 50) + '...',
          })
        }
      }
    })

    // Monitor network requests
    this.session.webRequest.onBeforeRequest((details, callback) => {
      const url = details.url.toLowerCase()
      const loginUrls = ['login', 'signin', 'auth', 'authenticate', 'oauth']
      const isLoginRequest = loginUrls.some((keyword) => url.includes(keyword))

      if (isLoginRequest) {
        console.log('Login request detected:', {
          url: details.url,
          method: details.method,
          timestamp: new Date().toISOString(),
        })

        if (details.method === 'POST' && details.uploadData) {
          details.uploadData.forEach((data, index) => {
            if (data.bytes) {
              try {
                const formData = Buffer.from(data.bytes).toString('utf8')
                console.log(`Form data ${index + 1}:`, formData)
              } catch (error) {
                console.log(`Form data ${index + 1}: [Binary data]`)
              }
            }
          })
        }
      }

      callback({})
    })

    // Monitor responses
    this.session.webRequest.onHeadersReceived((details, callback) => {
      const url = details.url.toLowerCase()
      const loginUrls = ['login', 'signin', 'auth', 'authenticate']
      const isLoginResponse = loginUrls.some((keyword) => url.includes(keyword))

      if (isLoginResponse) {
        console.log('Login response:', {
          url: details.url,
          statusCode: details.statusCode,
          headers: details.responseHeaders,
        })
      }

      callback({})
    })
  }

  getCurrentPageLoginInfo() {
    const focusedWindow = this.getFocusedWindow()
    if (!focusedWindow) {
      throw new Error('No active window found')
    }
  
    const tab = focusedWindow.getFocusedTab()
    if (!tab) {
      throw new Error('No active tab found')
    }
  
    const url = tab.webContents.getURL()
    console.log('Analyzing page:', url)
    
    return tab.webContents.executeJavaScript(`
      (async () => {
        const result = {
          url: window.location.href,
          title: document.title,
          forms: [],
          inputs: [],
          storage: {
            localStorage: {},
            sessionStorage: {},
            indexedDB: null
          }
        }
        
        // 获取表单数据
        document.querySelectorAll('form').forEach((form, index) => {
          const formData = {
            index: index,
            action: form.action,
            method: form.method,
            inputs: []
          }
          
          form.querySelectorAll('input').forEach(input => {
            formData.inputs.push({
              type: input.type,
              name: input.name,
              value: input.type === 'password' ? '[Hidden]' : input.value,
              placeholder: input.placeholder
            })
          })
          
          result.forms.push(formData)
        })
        
        // 获取独立输入框
        document.querySelectorAll('input').forEach((input, index) => {
          if (!input.closest('form')) {
            result.inputs.push({
              index: index,
              type: input.type,
              name: input.name,
              value: input.type === 'password' ? '[Hidden]' : input.value,
              placeholder: input.placeholder
            })
          }
        })
        
        // 获取 localStorage 数据
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key) {
              const value = localStorage.getItem(key)
              // 过滤敏感信息关键词
              const sensitiveKeywords = ['password', 'token', 'auth', 'secret', 'key', 'session']
              const isSensitive = sensitiveKeywords.some(keyword => 
                key.toLowerCase().includes(keyword)
              )
              result.storage.localStorage[key] = isSensitive ? '[Sensitive Data]' : value
            }
          }
        } catch (error) {
          result.storage.localStorage = { error: 'Failed to access localStorage: ' + error.message }
        }
        
        // 获取 sessionStorage 数据
        try {
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i)
            if (key) {
              const value = sessionStorage.getItem(key)
              // 过滤敏感信息关键词
              const sensitiveKeywords = ['password', 'token', 'auth', 'secret', 'key', 'session']
              const isSensitive = sensitiveKeywords.some(keyword => 
                key.toLowerCase().includes(keyword)
              )
              result.storage.sessionStorage[key] = isSensitive ? '[Sensitive Data]' : value
            }
          }
        } catch (error) {
          result.storage.sessionStorage = { error: 'Failed to access sessionStorage: ' + error.message }
        }
        
        // 获取 IndexedDB 数据（完整实现）
        try {
          if (window.indexedDB) {
            // 获取所有数据库
            const databases = await indexedDB.databases()
            result.storage.indexedDB = {
              available: true,
              databases: []
            }
            
            // 遍历每个数据库
            for (const dbInfo of databases) {
              try {
                const dbName = dbInfo.name
                const dbVersion = dbInfo.version
                
                // 打开数据库
                const db = await new Promise((resolve, reject) => {
                  const request = indexedDB.open(dbName, dbVersion)
                  request.onsuccess = () => resolve(request.result)
                  request.onerror = () => reject(request.error)
                })
                
                const dbData = {
                  name: dbName,
                  version: dbVersion,
                  objectStores: []
                }
                
                // 获取所有对象存储
                const storeNames = Array.from(db.objectStoreNames)
                
                // 创建事务来读取数据
                const transaction = db.transaction(storeNames, 'readonly')
                
                for (const storeName of storeNames) {
                  try {
                    const store = transaction.objectStore(storeName)
                    
                    // 获取存储中的所有数据
                    const allData = await new Promise((resolve, reject) => {
                      const request = store.getAll()
                      request.onsuccess = () => resolve(request.result)
                      request.onerror = () => reject(request.error)
                    })
                    
                    // 获取所有键
                    const allKeys = await new Promise((resolve, reject) => {
                      const request = store.getAllKeys()
                      request.onsuccess = () => resolve(request.result)
                      request.onerror = () => reject(request.error)
                    })
                    
                    dbData.objectStores.push({
                      name: storeName,
                      keyPath: store.keyPath,
                      autoIncrement: store.autoIncrement,
                      indexNames: Array.from(store.indexNames),
                      dataCount: allData.length,
                      keys: allKeys.slice(0, 10), // 只保存前10个键
                      sampleData: allData.slice(0, 3).map(item => {
                        // 过滤敏感数据
                        if (typeof item === 'object' && item !== null) {
                          const filtered = {}
                          for (const [key, value] of Object.entries(item)) {
                            const sensitiveKeywords = ['password', 'token', 'auth', 'secret', 'key', 'session']
                            const isSensitive = sensitiveKeywords.some(keyword => 
                              key.toLowerCase().includes(keyword)
                            )
                            filtered[key] = isSensitive ? '[Sensitive Data]' : value
                          }
                          return filtered
                        }
                        return item
                      })
                    })
                  } catch (storeError) {
                    dbData.objectStores.push({
                      name: storeName,
                      error: storeError.message
                    })
                  }
                }
                
                result.storage.indexedDB.databases.push(dbData)
                db.close()
                
              } catch (dbError) {
                result.storage.indexedDB.databases.push({
                  name: dbInfo.name,
                  version: dbInfo.version,
                  error: dbError.message
                })
              }
            }
          } else {
            result.storage.indexedDB = {
              available: false,
              note: 'IndexedDB is not supported'
            }
          }
        } catch (error) {
          result.storage.indexedDB = {
            available: false,
            error: error.message
          }
        }
        
        return result
      })()
    `).then(pageData => {
      return this.session.cookies.get({ url: url }).then(cookies => {
        return {
          pageData: pageData,
          cookies: cookies,
          timestamp: new Date().toISOString()
        }
      })
    })
  }

  createWindow(options) {
    const win = new TabbedBrowserWindow({
      ...options,
      urls: this.urls,
      extensions: this.extensions,
      window: {
        width: 1280,
        height: 720,
        frame: false,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          height: 31,
          color: '#39375b',
          symbolColor: '#ffffff',
        },
        webPreferences: {
          sandbox: true,
          nodeIntegration: false,
          enableRemoteModule: false,
          contextIsolation: true,
          worldSafeExecuteJavaScript: true,
          preload: PATHS.PRELOAD, // 添加这行关键配置
        },
      },
    })
    this.windows.push(win)

    if (process.env.SHELL_DEBUG) {
      win.webContents.openDevTools({ mode: 'detach' })
    }

    return win
  }

  createInitialWindow() {
    this.createWindow()
  }

  async onWebContentsCreated(event, webContents) {
    const type = webContents.getType()
    const url = webContents.getURL()
    console.log(`'web-contents-created' event [type:${type}, url:${url}]`)

    if (process.env.SHELL_DEBUG && ['backgroundPage', 'remote'].includes(webContents.getType())) {
      webContents.openDevTools({ mode: 'detach', activate: true })
    }

    webContents.setWindowOpenHandler((details) => {
      switch (details.disposition) {
        case 'foreground-tab':
        case 'background-tab':
        case 'new-window': {
          return {
            action: 'allow',
            outlivesOpener: true,
            createWindow: ({ webContents: guest, webPreferences }) => {
              const win = this.getWindowFromWebContents(webContents)
              const tab = win.tabs.create({ webContents: guest, webPreferences })
              tab.loadURL(details.url)
              return tab.webContents
            },
          }
        }
        default:
          return { action: 'allow' }
      }
    })

    webContents.on('context-menu', (event, params) => {
      const menu = buildChromeContextMenu({
        params,
        webContents,
        extensionMenuItems: this.extensions.getContextMenuItems(webContents, params),
        openLink: (url, disposition) => {
          const win = this.getFocusedWindow()

          switch (disposition) {
            case 'new-window':
              this.createWindow({ initialUrl: url })
              break
            default:
              const tab = win.tabs.create()
              tab.loadURL(url)
          }
        },
      })

      menu.popup()
    })
  }

  // 添加广播方法 (增强版本)
  broadcastToAllTabs(eventName, data) {
    let sentCount = 0
    const allWindows = BrowserWindow.getAllWindows()
    allWindows.forEach((browserWindow, index) => {
      if (!browserWindow.isDestroyed()) {
        try {
          browserWindow.webContents.send(eventName, data)
          sentCount++
        } catch (error) {}
      }
    })

    this.windows.forEach((tabbedWindow, windowIndex) => {
      if (tabbedWindow && tabbedWindow.tabs && tabbedWindow.tabs.tabList) {
        tabbedWindow.tabs.tabList.forEach((tab, tabIndex) => {
          if (tab && tab.webContents && !tab.webContents.isDestroyed()) {
            try {
              tab.webContents.send(eventName, data)
              sentCount++
            } catch (error) {}
          } else {
          }
        })
      } else {
      }
    })
  }
  // 添加保存账号到文件的方法
  saveAccountToFile(accountData) {
    try {
      const domain = new URL(accountData.pageData.url).hostname
      const timestamp = new Date().toISOString()

      let accounts = []

      // 读取现有账号数据
      if (fs.existsSync(this.accountsDataPath)) {
        try {
          const data = fs.readFileSync(this.accountsDataPath, 'utf8')
          accounts = JSON.parse(data)
        } catch (error) {
          accounts = []
        }
      }

      // 查找是否已存在相同域名的账号
      const existingIndex = accounts.findIndex((account) => account.domain === domain)

      const newAccount = {
        domain: domain,
        url: accountData.pageData.url,
        title: accountData.pageData.title,
        timestamp: timestamp,
        forms: accountData.pageData.forms,
        inputs: accountData.pageData.inputs,
        cookies: accountData.cookies,
      }

      if (existingIndex !== -1) {
        // 更新现有记录
        accounts[existingIndex] = newAccount
      } else {
        // 添加新记录
        accounts.push(newAccount)
      }

      // 保存到文件
      fs.writeFileSync(this.accountsDataPath, JSON.stringify(accounts, null, 2))

      return {
        success: true,
        message: existingIndex !== -1 ? 'Account updated' : 'Account saved',
        domain: domain,
        totalAccounts: accounts.length,
      }
    } catch (error) {
      console.error('Failed to save account:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  }

  // 添加读取账号文件的方法
  loadAccountsFromFile() {
    try {
      if (!fs.existsSync(this.accountsDataPath)) {
        return []
      }

      const data = fs.readFileSync(this.accountsDataPath, 'utf8')
      return JSON.parse(data)
    } catch (error) {
      return []
    }
  }

  setupIpcHandlers() {
    // Handle login info capture requests
    ipcMain.handle('capture-login-info', async (event) => {
      try {
        console.log('收到捕获登录信息请求')
        const loginInfo = await this.getCurrentPageLoginInfo()
        console.log('成功捕获登录信息:', loginInfo)
        
        // 保存到文件
        const saveResult = this.saveAccountToFile(loginInfo)
        
        // 广播到所有窗口的所有标签页
        if (saveResult.success) {
          const broadcastData = {
            // 基本信息
            domain: saveResult.domain,
            url: loginInfo.pageData.url,
            title: loginInfo.pageData.title,
            timestamp: new Date().toISOString(),
            message: saveResult.message,
            totalAccounts: saveResult.totalAccounts,
            
            // 完整的登录信息
            loginInfo: loginInfo,
            
            // 保存结果
            saveResult: saveResult
          }
          
          console.log('准备广播数据:', broadcastData)
          this.broadcastToAllTabs('account-saved', broadcastData)
          
          // 额外延迟广播，确保所有标签页都能收到
          setTimeout(() => {
            console.log('延迟广播...')
            this.broadcastToAllTabs('account-saved', broadcastData)
          }, 100)
          
          // 保存成功后关闭当前标签页
          setTimeout(() => {
            try {
              const focusedWindow = this.getFocusedWindow()
              if (focusedWindow) {
                const activeTab = focusedWindow.getFocusedTab()
                if (activeTab) {
                  // 检查是否是最后一个标签页
                  if (focusedWindow.tabs.tabList.length > 1) {
                    // 不是最后一个标签页，直接关闭
                    activeTab.webContents.close()
                    console.log('已关闭当前标签页')
                  } else {
                    // 是最后一个标签页，创建新的空白页后再关闭当前页
                    const newTab = focusedWindow.tabs.create()
                    newTab.loadURL('about:blank')
                    setTimeout(() => {
                      activeTab.webContents.close()
                      console.log('已关闭当前标签页并创建新的空白页')
                    }, 100)
                  }
                }
              }
            } catch (closeError) {
              console.error('关闭标签页时出错:', closeError)
            }
          }, 500) // 延迟500ms确保广播完成
          
        } else {
          console.error('保存失败，不进行广播:', saveResult)
        }
        
        return saveResult
      } catch (error) {
        console.error('捕获登录信息失败:', error)
        return {
          success: false,
          error: error.message
        }
      }
    })

    // 添加加载账号列表的处理器
    ipcMain.handle('load-accounts', async (event) => {
      try {
        const accounts = this.loadAccountsFromFile()
        return {
          success: true,
          data: accounts,
        }
      } catch (error) {
        console.error('Failed to load accounts:', error)
        return {
          success: false,
          error: error.message,
        }
      }
    })

    // 添加打开账号文件夹的处理器
    ipcMain.handle('open-accounts-folder', async (event) => {
      try {
        const { shell } = require('electron')
        const folderPath = path.dirname(this.accountsDataPath)
        await shell.openPath(folderPath)
        return {
          success: true,
          path: folderPath,
        }
      } catch (error) {
        console.error('Failed to open accounts folder:', error)
        return {
          success: false,
          error: error.message,
        }
      }
    })
  }
}

module.exports = Browser
