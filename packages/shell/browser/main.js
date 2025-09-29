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
      tab.loadURL('https://www.baidu.com/')

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
    newtab: 'http://36.141.100.123:9000',
  }

  constructor() {
    // 修改账号数据文件路径 - 使用用户数据目录而不是应用目录
    this.accountsDataPath = path.join(app.getPath('userData'), 'accounts.json')
    this.enableDataTransfer = false // 设置为 false 禁用数据传递

    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve
    })

    // 添加全局错误处理
    process.on('uncaughtException', (error) => {
      if (
        error.message.includes('Invalid webContents') ||
        error.message.includes('Render frame was disposed')
      ) {
        return // 不让这类错误崩溃应用
      }
      throw error // 其他错误正常抛出
    })

    app.whenReady().then(() => {
      this.init()

      // Register global shortcut for login info capture
      globalShortcut.register('CommandOrControl+Shift+L', () => {
        this.getCurrentPageLoginInfo()
          .then((loginInfo) => {})
          .catch((error) => {})
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
    try {
      if (!webContents || webContents.isDestroyed()) {
        return null
      }

      let window

      if (this.popup && webContents === this.popup.browserWindow?.webContents) {
        window = this.popup.parent
      } else {
        window = getParentWindowOfTab(webContents)
      }

      return window ? this.getWindowFromBrowserWindow(window) : null
    } catch (error) {
      return null
    }
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

        console.log('🔧 ElectronChromeExtensions createTab 被调用:', details)

        // 使用我们的 createTab 方法而不是直接调用 win.tabs.create()
        const tab = this.createTab({
          url: details.url,
          active: typeof details.active === 'boolean' ? details.active : true,
          incognito: false, // 默认不是无痕模式，可以根据需要修改
        })

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
          await this.session.serviceWorkers.startWorkerForScope(extension.url).catch((error) => {})
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

    this.session.serviceWorkers.on('running-status-changed', (event) => {})

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
              } catch (error) {}
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

    return tab.webContents
      .executeJavaScript(
        `
      // 在 getCurrentPageLoginInfo 方法的 executeJavaScript 部分添加通用用户信息提取
      (async () => {
        const result = {
          url: window.location.href,
          title: document.title,
          forms: [],
          inputs: [],
          userInfo: {}, // 新增用户信息字段
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
              result.storage.localStorage[key] = value
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
              result.storage.sessionStorage[key] = value
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
                        // 注释掉敏感数据过滤
                        // if (typeof item === 'object' && item !== null) {
                        //   const filtered = {}
                        //   for (const [key, value] of Object.entries(item)) {
                        //     const sensitiveKeywords = ['password', 'token', 'auth', 'secret', 'key', 'session']
                        //     const isSensitive = sensitiveKeywords.some(keyword => 
                        //       key.toLowerCase().includes(keyword)
                        //     )
                        //     filtered[key] = isSensitive ? '[Sensitive Data]' : value
                        //   }
                        //   return filtered
                        // }
                        
                        // 直接返回原始数据
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
        
        // 新增：通用用户信息获取
        try {
          const userInfo = {
            platform: null,
            username: null,
            avatar: null,
            userId: null,
            email: null,
            phone: null,
            source: null,
            selectors: []
          }
          
          // 检测平台类型
          const hostname = window.location.hostname
          let platform = 'unknown'
          
          if (hostname.includes('sohu.com')) platform = 'sohu'
          else if (hostname.includes('weibo.com')) platform = 'weibo'
          else if (hostname.includes('zhihu.com')) platform = 'zhihu'
          else if (hostname.includes('toutiao.com') || hostname.includes('jinritoutiao.com')) platform = 'toutiao'
          else if (hostname.includes('baidu.com')) platform = 'baidu'
          else if (hostname.includes('qq.com')) platform = 'qq'
          else if (hostname.includes('163.com') || hostname.includes('126.com')) platform = 'netease'
          else if (hostname.includes('sina.com')) platform = 'sina'
          else if (hostname.includes('douyin.com')) platform = 'douyin'
          else if (hostname.includes('kuaishou.com')) platform = 'kuaishou'
          else if (hostname.includes('bilibili.com')) platform = 'bilibili'
          else if (hostname.includes('xiaohongshu.com')) platform = 'xiaohongshu'
          
          userInfo.platform = platform
          
          // 平台特定的选择器配置
          const platformSelectors = {
            sohu: {
              username: ['.mp-author-name', '.author-name', '.mp-info .name', '.profile-name'],
              avatar: ['.mp-author-avatar img', '.author-avatar img', '.profile-avatar img']
            },
            weibo: {
              username: ['.username', '.name', '.WB_info .username', '.card-name'],
              avatar: ['.avatar img', '.head img', '.WB_face img']
            },
            zhihu: {
              username: ['.UserLink-link', '.AuthorInfo-name', '.Profile-name', '.UserInfo-name'],
              avatar: ['.Avatar img', '.UserAvatar img', '.Profile-avatar img']
            },
            toutiao: {
              username: ['.user-name', '.author-name', '.profile-name', '.nickname'],
              avatar: ['.user-avatar img', '.author-avatar img', '.profile-avatar img']
            },
            baidu: {
              username: ['.user-name', '.username', '.profile-name', '.passport-user-name'],
              avatar: ['.user-avatar img', '.profile-avatar img', '.passport-avatar img']
            },
            bilibili: {
              username: ['.username', '.user-name', '.up-name', '.bili-user-profile .username'],
              avatar: ['.user-avatar img', '.up-avatar img', '.bili-avatar img']
            },
            douyin: {
              username: ['.user-name', '.username', '.nickname', '.author-name'],
              avatar: ['.user-avatar img', '.avatar img', '.author-avatar img']
            }
          }
          
          // 通用选择器（适用于所有平台）
          const genericSelectors = {
            username: [
              '.user-name', '.username', '.user-info', '.profile-name',
              '.nickname', '.display-name', '.account-name', '.author-name',
              '[class*="user"][class*="name"]', '[class*="profile"][class*="name"]',
              '[class*="author"][class*="name"]', '[data-testid*="username"]',
              '.name', '.user', '.profile', '.account'
            ],
            avatar: [
              '.avatar img', '.user-avatar img', '.profile-avatar img',
              '[class*="avatar"] img', '[class*="head"] img',
              '.user-photo img', '.profile-photo img', '.user-img img',
              '[data-testid*="avatar"] img', '.headimg img'
            ]
          }
          
          // 获取平台特定选择器
          const selectors = platformSelectors[platform] || {}
          const usernameSelectors = [...(selectors.username || []), ...genericSelectors.username]
          const avatarSelectors = [...(selectors.avatar || []), ...genericSelectors.avatar]
          
          // 获取用户名
          for (const selector of usernameSelectors) {
            try {
              const element = document.querySelector(selector)
              if (element && element.textContent && element.textContent.trim()) {
                  console.log('找到用户名:', selector, element.textContent.trim());
                userInfo.username = element.textContent.trim()
                userInfo.selectors.push({ type: 'username', selector, found: true })
                break
              }
            } catch (e) {
              userInfo.selectors.push({ type: 'username', selector, error: e.message })
            }
          }
          
          // 获取头像
          for (const selector of avatarSelectors) {
            try {
              const element = document.querySelector(selector)
              if (element && element.src) {
                  console.log('找到头像:', selector, element.src);
                userInfo.avatar = element.src
                userInfo.selectors.push({ type: 'avatar', selector, found: true })
                break
              }
            } catch (e) {
              userInfo.selectors.push({ type: 'avatar', selector, error: e.message })
            }
          }
          
          // 从页面标题提取用户名
          if (!userInfo.username) {
            const titlePatterns = [
              /(.+?)的搜狐号/,
              /(.+?)\s*-\s*搜狐号/,
              /(.+?)的微博/,
              /(.+?)\s*-\s*微博/,
              /(.+?)的知乎/,
              /(.+?)\s*-\s*知乎/,
              /(.+?)的头条号/,
              /(.+?)\s*-\s*今日头条/,
              /(.+?)的百家号/,
              /(.+?)\s*-\s*百度/,
              /(.+?)的B站/,
              /(.+?)\s*-\s*哔哩哔哩/
            ]
            
            for (const pattern of titlePatterns) {
              const match = document.title.match(pattern)
              if (match && match[1]) {
                userInfo.username = match[1].trim()
                userInfo.source = 'title'
                break
              }
            }
          }
          
          // 从存储中获取用户信息
          const storageKeys = [
            'user', 'userInfo', 'profile', 'account', 'loginUser',
            'currentUser', 'userData', 'userProfile', 'accountInfo',
            'loginInfo', 'authUser', 'sessionUser'
          ]
          
          for (const key of storageKeys) {
            try {
              // 检查 localStorage
              const localData = localStorage.getItem(key)
              if (localData) {
                const parsed = JSON.parse(localData)
                if (parsed && typeof parsed === 'object') {
                  userInfo.username = userInfo.username || parsed.name || parsed.username || parsed.nickname || parsed.displayName
                  userInfo.avatar = userInfo.avatar || parsed.avatar || parsed.photo || parsed.headImg || parsed.profilePicture
                  userInfo.userId = userInfo.userId || parsed.id || parsed.userId || parsed.uid
                  userInfo.email = userInfo.email || parsed.email
                  userInfo.phone = userInfo.phone || parsed.phone || parsed.mobile
                  if (!userInfo.source) userInfo.source = 'localStorage'
                }
              }
              
              // 检查 sessionStorage
              const sessionData = sessionStorage.getItem(key)
              if (sessionData) {
                const parsed = JSON.parse(sessionData)
                if (parsed && typeof parsed === 'object') {
                  userInfo.username = userInfo.username || parsed.name || parsed.username || parsed.nickname || parsed.displayName
                  userInfo.avatar = userInfo.avatar || parsed.avatar || parsed.photo || parsed.headImg || parsed.profilePicture
                  userInfo.userId = userInfo.userId || parsed.id || parsed.userId || parsed.uid
                  userInfo.email = userInfo.email || parsed.email
                  userInfo.phone = userInfo.phone || parsed.phone || parsed.mobile
                  if (!userInfo.source) userInfo.source = 'sessionStorage'
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
          
          result.userInfo = userInfo
          
        } catch (error) {
          result.userInfo = { error: error.message }
        }
        
        return result
      })()
    `,
      )
      .then((pageData) => {
        return this.session.cookies.get({ url: url }).then((cookies) => {
          return {
            pageData: pageData,
            cookies: cookies,
            timestamp: new Date().toISOString(),
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
        width: 1310,
        height: 815,
        frame: false,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          height: 31,
          color: '#f3f4f6',
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

  createTab(options = {}) {
    const { url, active = true, incognito = false } = options

    // 添加调试日志
    console.log('🏷️ createTab 被调用:')
    console.log('  - url:', url)
    console.log('  - active:', active)
    console.log('  - incognito:', incognito)

    const win = this.getFocusedWindow()
    if (!win) {
      const newWin = this.createWindow({ initialUrl: url })
      return newWin.getFocusedTab()
    }

    const tab = win.tabs.create()

    if (url) {
      tab.loadURL(url)
    }

    if (active) {
      win.tabs.select(tab.id)
    }

    // 标记标签页是否为无痕模式
    if (incognito && tab.webContents) {
      tab.webContents._isIncognito = true
      console.log('🔒 标签页已标记为无痕模式')
    }

    // 如果不是无痕模式，且有当前活跃标签页，则传递数据
    if (!incognito && url) {
      const currentTab = win.getFocusedTab()
      if (currentTab && currentTab.webContents && !currentTab.webContents.isDestroyed()) {
        console.log('📊 准备传递数据到新标签页')
        // 延迟执行数据传递，等待页面加载
        setTimeout(() => {
          this.transferDataToNewTab(currentTab.webContents, tab, url)
        }, 1000)
      }
    } else if (incognito) {
      console.log('🚫 无痕模式，跳过数据传递')
    }

    return tab
  }

  createInitialWindow() {
    this.createWindow({
      initialUrl: 'http://36.141.100.123:9000', // 添加这行
    })
  }

  async onWebContentsCreated(event, webContents) {
    const type = webContents.getType()
    const url = webContents.getURL()
    console.log(`'web-contents-created' event [type:${type}, url:${url}]`)
    console.log('📝 为 webContents 设置 setWindowOpenHandler, ID:', webContents.id)

    if (process.env.SHELL_DEBUG && ['backgroundPage', 'remote'].includes(webContents.getType())) {
      webContents.openDevTools({ mode: 'detach', activate: true })
    }

    webContents.setWindowOpenHandler((details) => {
      // 添加最早期的调试日志
      console.log('🚀🚀🚀 setWindowOpenHandler 被触发! webContents ID:', webContents.id)
      console.log('  - details:', details)
      console.log('  - disposition:', details.disposition)
      console.log('  - url:', details.url)
      console.log('  - frameName:', details.frameName)
      console.log('  - features:', details.features)

      // 添加文件日志以确保能看到
      const logMessage = `${new Date().toISOString()} - setWindowOpenHandler triggered: ${details.url}\n`
      fs.appendFileSync('/tmp/electron-debug.log', logMessage)

      switch (details.disposition) {
        case 'foreground-tab':
        case 'background-tab':
        case 'new-window': {
          console.log('✅ 进入处理分支:', details.disposition)
          return {
            action: 'allow',
            outlivesOpener: true,
            createWindow: async ({ webContents: guest, webPreferences }) => {
              console.log('🔧 createWindow 被调用')
              try {
                // 检查URL参数中是否包含无痕模式标识
                let isIncognito = false
                try {
                  const url = new URL(details.url)
                  isIncognito = url.searchParams.get('incognito') === 'true'

                  // 添加调试日志
                  console.log('🔍 页面跳转调试信息:')
                  console.log('  - 目标URL:', details.url)
                  console.log('  - 无痕参数:', url.searchParams.get('incognito'))
                  console.log('  - 是否无痕模式:', isIncognito)
                } catch (urlError) {
                  // URL解析失败，默认不是无痕模式
                  console.log('❌ URL解析失败:', urlError.message)
                  isIncognito = false
                }

                let win = this.getWindowFromWebContents(webContents) || this.getFocusedWindow()

                if (!win) {
                  const newWin = this.createWindow({ initialUrl: details.url })
                  return newWin.getFocusedTab().webContents
                }

                const tab =
                  guest && !guest.isDestroyed()
                    ? win.tabs.create({ webContents: guest, webPreferences })
                    : win.tabs.create()

                await tab.loadURL(details.url)

                // 添加数据传递调试日志
                console.log('📊 数据传递检查:')
                console.log('  - 无痕模式:', isIncognito)
                console.log('  - webContents已销毁:', webContents.isDestroyed())
                console.log('  - enableDataTransfer:', this.enableDataTransfer)

                // 如果是无痕模式，不传递数据
                if (!isIncognito && !webContents.isDestroyed() && this.enableDataTransfer) {
                  console.log('✅ 执行数据传递')
                  this.transferDataToNewTab(webContents, tab, details.url)
                } else {
                  console.log('🚫 跳过数据传递 - 原因:')
                  if (isIncognito) console.log('    - 无痕模式')
                  if (webContents.isDestroyed()) console.log('    - webContents已销毁')
                  if (!this.enableDataTransfer) console.log('    - enableDataTransfer为false')
                }

                return tab.webContents
              } catch (error) {
                // 简化错误处理，避免重复创建
                return null
              }
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
              const tab = this.createTab({ url: url, active: true })
              break
          }
        },
      })

      menu.popup()
    })
  }

  // 添加数据传输方法
  async transferDataToNewTab(sourceWebContents, targetTab, targetUrl) {
    // 使用 setTimeout 而不是 setImmediate，给更多时间让窗口稳定
    setTimeout(async () => {
      try {
        // 多重检查
        if (!sourceWebContents || sourceWebContents.isDestroyed()) {
          return
        }

        if (!targetTab || !targetTab.webContents || targetTab.webContents.isDestroyed()) {
          return
        }

        // 等待目标页面完全加载
        if (targetTab.webContents.isLoading()) {
          await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              resolve()
            }, 5000) // 5秒超时

            targetTab.webContents.once('did-finish-load', () => {
              clearTimeout(timeout)
              resolve()
            })
          })
        }

        // 再次检查状态
        if (sourceWebContents.isDestroyed() || targetTab.webContents.isDestroyed()) {
          return
        }

        const sourceUrl = sourceWebContents.getURL()

        // 并行获取数据，但有超时保护
        const dataPromises = [
          Promise.race([
            this.getLocalStorageData(sourceWebContents),
            new Promise((resolve) => setTimeout(() => resolve({}), 3000)),
          ]),
          Promise.race([
            this.getSessionStorageData(sourceWebContents),
            new Promise((resolve) => setTimeout(() => resolve({}), 3000)),
          ]),
          Promise.race([
            this.session.cookies.get({ url: sourceUrl }),
            new Promise((resolve) => setTimeout(() => resolve([]), 3000)),
          ]),
        ]

        const [localStorageData, sessionStorageData, cookies] = await Promise.all(dataPromises)

        // 最后一次检查
        if (targetTab.webContents.isDestroyed()) {
          return
        }

        // 设置数据
        await this.setDataToTab(targetTab, localStorageData, sessionStorageData, cookies, targetUrl)
      } catch (error) {}
    }, 100) // 100ms 延迟
  }

  // 辅助方法
  async getLocalStorageData(webContents) {
    if (webContents.isDestroyed()) return {}

    try {
      return await webContents.executeJavaScript(`
        (() => {
          const data = {}
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key) {
              data[key] = localStorage.getItem(key)
            }
          }
          return data
        })()
      `)
    } catch (error) {
      return {}
    }
  }

  async getSessionStorageData(webContents) {
    if (webContents.isDestroyed()) return {}

    try {
      return await webContents.executeJavaScript(`
        (() => {
          const data = {}
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i)
            if (key) {
              data[key] = sessionStorage.getItem(key)
            }
          }
          return data
        })()
      `)
    } catch (error) {
      return {}
    }
  }

  async setDataToTab(tab, localStorageData, sessionStorageData, cookies, targetUrl) {
    if (!tab || !tab.webContents || tab.webContents.isDestroyed()) {
      return
    }

    try {
      // 设置 localStorage
      if (Object.keys(localStorageData).length > 0) {
        await tab.webContents.executeJavaScript(`
          (() => {
            const data = ${JSON.stringify(localStorageData)}
            Object.keys(data).forEach(key => {
              localStorage.setItem(key, data[key])
            })
          })()
        `)
      }

      // 设置 sessionStorage
      if (Object.keys(sessionStorageData).length > 0) {
        await tab.webContents.executeJavaScript(`
          (() => {
            const data = ${JSON.stringify(sessionStorageData)}
            Object.keys(data).forEach(key => {
              sessionStorage.setItem(key, data[key])
            })
          })()
        `)
      }

      // 设置 cookies
      if (cookies.length > 0) {
        const newUrl = new URL(targetUrl)
        for (const cookie of cookies) {
          const cookieDomain = cookie.domain.startsWith('.')
            ? cookie.domain.substring(1)
            : cookie.domain

          if (newUrl.hostname.endsWith(cookieDomain) || newUrl.hostname === cookieDomain) {
            await this.session.cookies.set({
              url: targetUrl,
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              secure: cookie.secure,
              httpOnly: cookie.httpOnly,
              expirationDate: cookie.expirationDate,
            })
          }
        }
      }
    } catch (error) {}
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
        userInfo: accountData.pageData.userInfo, // 添加这行
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
        const loginInfo = await this.getCurrentPageLoginInfo()

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
            saveResult: saveResult,
          }

          this.broadcastToAllTabs('account-saved', broadcastData)

          // // 额外延迟广播，确保所有标签页都能收到
          // setTimeout(() => {
          //   this.broadcastToAllTabs('account-saved', broadcastData)
          // }, 100)

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
                  } else {
                    // 是最后一个标签页，创建新的空白页后再关闭当前页
                    const newTab = focusedWindow.tabs.create()
                    newTab.loadURL('about:blank')
                    setTimeout(() => {
                      activeTab.webContents.close()
                    }, 100)
                  }
                }
              }
            } catch (closeError) {}
          }, 500) // 延迟500ms确保广播完成
        } else {
        }

        return saveResult
      } catch (error) {
        return {
          success: false,
          error: error.message,
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
        return {
          success: false,
          error: error.message,
        }
      }
    })

    // 新增：获取当前页面的数据（cookie和localStorage）
    ipcMain.handle('get-current-page-data', async (event) => {
      try {
        const focusedWindow = this.getFocusedWindow()
        if (!focusedWindow) {
          throw new Error('No active window found')
        }

        const tab = focusedWindow.getFocusedTab()
        if (!tab) {
          throw new Error('No active tab found')
        }

        const url = tab.webContents.getURL()

        // 获取localStorage数据
        const localStorageData = await tab.webContents.executeJavaScript(`
          (() => {
            const data = {}
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              if (key) {
                data[key] = localStorage.getItem(key)
              }
            }
            return data
          })()
        `)

        // 获取sessionStorage数据
        const sessionStorageData = await tab.webContents.executeJavaScript(`
          (() => {
            const data = {}
            for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i)
              if (key) {
                data[key] = sessionStorage.getItem(key)
              }
            }
            return data
          })()
        `)

        // 获取cookie数据
        const cookies = await this.session.cookies.get({ url: url })

        return {
          success: true,
          data: {
            url: url,
            localStorage: localStorageData,
            sessionStorage: sessionStorageData,
            cookies: cookies,
          },
        }
      } catch (error) {
        return {
          success: false,
          error: error.message,
        }
      }
    })

    // 新增：设置页面数据（cookie和localStorage）
    ipcMain.handle('set-page-data', async (event, data) => {
      try {
        const focusedWindow = this.getFocusedWindow()
        if (!focusedWindow) {
          throw new Error('No active window found')
        }

        const tab = focusedWindow.getFocusedTab()
        if (!tab) {
          throw new Error('No active tab found')
        }

        // 设置localStorage数据
        if (data.localStorage) {
          await tab.webContents.executeJavaScript(`
            (() => {
              const data = ${JSON.stringify(data.localStorage)}
              Object.keys(data).forEach(key => {
                localStorage.setItem(key, data[key])
              })
            })()
          `)
        }

        // 设置sessionStorage数据
        if (data.sessionStorage) {
          await tab.webContents.executeJavaScript(`
            (() => {
              const data = ${JSON.stringify(data.sessionStorage)}
              Object.keys(data).forEach(key => {
                sessionStorage.setItem(key, data[key])
              })
            })()
          `)
        }

        // 设置cookie数据
        if (data.cookies && data.url) {
          for (const cookie of data.cookies) {
            await this.session.cookies.set({
              url: data.url,
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              secure: cookie.secure,
              httpOnly: cookie.httpOnly,
              expirationDate: cookie.expirationDate,
            })
          }
        }

        return {
          success: true,
          message: 'Page data set successfully',
        }
      } catch (error) {
        return {
          success: false,
          error: error.message,
        }
      }
    })

    // 新增：获取指定URL的cookie
    ipcMain.handle('get-cookies-for-url', async (event, url) => {
      try {
        const cookies = await this.session.cookies.get({ url: url })
        return {
          success: true,
          data: cookies,
        }
      } catch (error) {
        return {
          success: false,
          error: error.message,
        }
      }
    })

    // 新增：设置cookie
    ipcMain.handle('set-cookies', async (event, cookies, url) => {
      try {
        for (const cookie of cookies) {
          await this.session.cookies.set({
            url: url,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            expirationDate: cookie.expirationDate,
          })
        }
        return {
          success: true,
          message: 'Cookies set successfully',
        }
      } catch (error) {
        return {
          success: false,
          error: error.message,
        }
      }
    })

    // 添加创建无痕标签页的处理器
    ipcMain.handle('create-incognito-tab', async (event, url) => {
      console.log('🔒 创建无痕标签页:', url)
      const tab = this.createTab({
        url: url,
        active: true,
        incognito: true,
      })
      return tab.id
    })
  }
}

module.exports = Browser
