const { EventEmitter } = require('events')
const { WebContentsView, session } = require('electron')
const path = require('path')

const toolbarHeight = 78

const STORAGE_WHITELIST = ['https://matrix.newgalaxyai.com']

class Tab {
  constructor(parentWindow, wcvOpts = {}) {
    this.invalidateLayout = this.invalidateLayout.bind(this)

    // Delete undefined properties which cause WebContentsView constructor to
    // throw. This should probably be fixed in Electron upstream.
    if (wcvOpts.hasOwnProperty('webContents') && !wcvOpts.webContents) delete wcvOpts.webContents
    if (wcvOpts.hasOwnProperty('webPreferences') && !wcvOpts.webPreferences)
      delete wcvOpts.webPreferences

    this.view = new WebContentsView(wcvOpts)
    this.id = this.view.webContents.id
    this.window = parentWindow
    this.webContents = this.view.webContents

    // 监听导航事件，在跳转时清理本地存储
    this.webContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) {
        try {
          const parsedUrl = new URL(url)
          const isWhitelisted = STORAGE_WHITELIST.some((domain) => url.startsWith(domain))

          if (!isWhitelisted && ['http:', 'https:'].includes(parsedUrl.protocol)) {
            this.webContents.session
              .clearStorageData({
                origin: parsedUrl.origin,
                storages: ['localstorage'],
              })
              .catch((e) => console.error('Failed to clear storage on navigation:', e))
          }
        } catch (e) {
          // Ignore invalid URLs
        }
      }
    })

    this.window.contentView.addChildView(this.view)
  }

  destroy() {
    if (this.destroyed) return

    this.destroyed = true

    this.hide()

    this.window.contentView.removeChildView(this.view)
    this.window = undefined

    if (!this.webContents.isDestroyed()) {
      if (this.webContents.isDevToolsOpened()) {
        this.webContents.closeDevTools()
      }

      // TODO: why is this no longer called?
      this.webContents.emit('destroyed')

      this.webContents.destroy()
    }

    this.webContents = undefined
    this.view = undefined
  }

  async loadURL(url) {
    try {
      const parsedUrl = new URL(url)
      const isWhitelisted = STORAGE_WHITELIST.some((domain) => url.startsWith(domain))

      if (!isWhitelisted && ['http:', 'https:'].includes(parsedUrl.protocol)) {
        await this.view.webContents.session.clearStorageData({
          origin: parsedUrl.origin,
          storages: ['localstorage'],
        })
      }
    } catch (e) {
      console.error(`Failed to clear storage for ${url}:`, e)
    }
    return this.view.webContents.loadURL(url)
  }

  show() {
    this.invalidateLayout()
    this.startResizeListener()
    this.view.setVisible(true)
  }

  hide() {
    this.stopResizeListener()
    this.view.setVisible(false)
  }

  reload() {
    this.view.webContents.reload()
  }

  invalidateLayout() {
    const [width, height] = this.window.getSize()
    const padding = 4
    this.view.setBounds({
      x: padding,
      y: toolbarHeight,
      width: width - padding * 2,
      height: height - toolbarHeight - padding,
    })
    this.view.setBorderRadius(8)
  }

  // Replacement for BrowserView.setAutoResize. This could probably be better...
  startResizeListener() {
    this.stopResizeListener()
    this.window.on('resize', this.invalidateLayout)
  }
  stopResizeListener() {
    this.window.off('resize', this.invalidateLayout)
  }
}

class Tabs extends EventEmitter {
  tabList = []
  selected = null

  constructor(browserWindow) {
    super()
    this.window = browserWindow
  }

  destroy() {
    this.tabList.forEach((tab) => tab.destroy())
    this.tabList = []

    this.selected = undefined

    if (this.window) {
      this.window.destroy()
      this.window = undefined
    }
  }

  get(tabId) {
    return this.tabList.find((tab) => tab.id === tabId)
  }

  create(webContentsViewOptions = {}) {
    // 如果请求干净会话，创建一个随机分区的会话
    if (webContentsViewOptions.cleanSession) {
      const randomPartition = `no-storage-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const cleanSession = session.fromPartition(randomPartition, {
        cache: false,
        persistent: false, // 内存中会话
      })

      // 注册 preload 脚本
      // 注意：这里的路径需要与 main.js 中的 PATHS.PRELOAD 保持一致
      // PATHS.PRELOAD = path.join(__dirname, '../renderer/browser/preload.js')
      // tabs.js 在 packages/shell/browser/tabs.js
      // preload.js 在 packages/shell/renderer/browser/preload.js
      const preloadPath = path.join(__dirname, '../renderer/browser/preload.js')

      if ('registerPreloadScript' in cleanSession) {
        cleanSession.registerPreloadScript({
          id: 'shell-preload',
          type: 'frame',
          filePath: preloadPath,
        })
      } else {
        cleanSession.setPreloads([preloadPath])
      }

      // 确保 webPreferences 存在
      webContentsViewOptions.webPreferences = webContentsViewOptions.webPreferences || {}

      // 设置 session
      webContentsViewOptions.webPreferences.session = cleanSession
      // 也可以设置 partition 字符串作为备份（虽然提供了 session 对象通常优先）
      webContentsViewOptions.webPreferences.partition = randomPartition

      // 删除标记
      delete webContentsViewOptions.cleanSession
    }

    const tab = new Tab(this.window, webContentsViewOptions)
    this.tabList.push(tab)
    if (!this.selected) this.selected = tab
    tab.show() // must be attached to window
    this.emit('tab-created', tab)
    this.select(tab.id)
    return tab
  }

  remove(tabId) {
    const tabIndex = this.tabList.findIndex((tab) => tab.id === tabId)
    if (tabIndex < 0) {
      throw new Error(`Tabs.remove: unable to find tab.id = ${tabId}`)
    }
    const tab = this.tabList[tabIndex]
    this.tabList.splice(tabIndex, 1)
    tab.destroy()
    if (this.selected === tab) {
      this.selected = undefined
      const nextTab = this.tabList[tabIndex] || this.tabList[tabIndex - 1]
      if (nextTab) this.select(nextTab.id)
    }
    this.emit('tab-destroyed', tab)
    if (this.tabList.length === 0) {
      this.destroy()
    }
  }

  select(tabId) {
    const tab = this.get(tabId)
    if (!tab) return
    if (this.selected) this.selected.hide()
    tab.show()
    this.selected = tab
    this.emit('tab-selected', tab)
  }
}

exports.Tabs = Tabs
