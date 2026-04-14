class WebUI {
  windowId = -1
  activeTabId = -1
  /** @type {chrome.tabs.Tab[]} */
  tabList = []

  constructor() {
    const $ = document.querySelector.bind(document)

    this.$ = {
      tabList: $('#tabstrip .tab-list'),
      tabTemplate: $('#tabtemplate'),
      createTabButton: $('#createtab'),
      goBackButton: $('#goback'),
      goForwardButton: $('#goforward'),
      reloadButton: $('#reload'),
      addressUrl: $('#addressurl'),
      saveAccountButton: $('#saveaccount'),

      browserActions: $('#actions'),

      minimizeButton: $('#minimize'),
      maximizeButton: $('#maximize'),
      closeButton: $('#close'),
    }

    this.$.createTabButton.addEventListener('click', () => chrome.tabs.create())
    this.$.goBackButton.addEventListener('click', () => chrome.tabs.goBack())
    this.$.goForwardButton.addEventListener('click', () => chrome.tabs.goForward())
    this.$.reloadButton.addEventListener('click', () => chrome.tabs.reload())
    this.$.addressUrl.addEventListener('keypress', this.onAddressUrlKeyPress.bind(this))
    this.$.saveAccountButton.addEventListener('click', this.onSaveAccountClick.bind(this))

    this.$.minimizeButton.addEventListener('click', () =>
      chrome.windows.get(chrome.windows.WINDOW_ID_CURRENT, (win) => {
        chrome.windows.update(win.id, { state: win.state === 'minimized' ? 'normal' : 'minimized' })
      }),
    )
    this.$.maximizeButton.addEventListener('click', () =>
      chrome.windows.get(chrome.windows.WINDOW_ID_CURRENT, (win) => {
        chrome.windows.update(win.id, { state: win.state === 'maximized' ? 'normal' : 'maximized' })
      }),
    )
    this.$.closeButton.addEventListener('click', () => chrome.windows.remove())

    const platformClass = `platform-${navigator.userAgentData.platform.toLowerCase()}`
    document.body.classList.add(platformClass)

    this.initTabs()
  }

  async initTabs() {
    // 首先获取当前窗口信息以设置 windowId
    try {
      const currentWindow = await new Promise((resolve) => chrome.windows.getCurrent(resolve))
      if (currentWindow) {
        this.windowId = currentWindow.id
      }
    } catch (e) {
      console.error('Failed to get current window:', e)
    }

    const tabs = await new Promise((resolve) => chrome.tabs.query({ windowId: -2 }, resolve))
    this.tabList = [...tabs]
    this.renderTabs()

    const activeTab = this.tabList.find((tab) => tab.active)
    if (activeTab) {
      this.setActiveTab(activeTab)
    }

    // Wait to setup tabs and windowId prior to listening for updates.
    this.setupBrowserListeners()
  }

  setupBrowserListeners() {
    if (!chrome.tabs.onCreated) {
      throw new Error(`chrome global not setup. Did the extension preload not get run?`)
    }

    const findTab = (tabId) => {
      const existingTab = this.tabList.find((tab) => tab.id === tabId)
      return existingTab
    }

    const findOrCreateTab = (tabId) => {
      const existingTab = findTab(tabId)
      if (existingTab) return existingTab

      const newTab = { id: tabId }
      this.tabList.push(newTab)
      return newTab
    }

    chrome.tabs.onCreated.addListener((tab) => {
      if (tab.windowId !== this.windowId) return
      const newTab = findOrCreateTab(tab.id)
      Object.assign(newTab, tab)
      this.renderTabs()
    })

    chrome.tabs.onActivated.addListener((activeInfo) => {
      if (activeInfo.windowId !== this.windowId) return

      // 找到完整的标签页对象
      const activeTab = this.tabList.find((tab) => tab.id === activeInfo.tabId)
      if (activeTab) {
        this.setActiveTab(activeTab)
        this.updateSaveAccountButtonVisibility(activeTab)
      }
    })

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, details) => {
      const tab = findTab(tabId)
      if (!tab) return
      Object.assign(tab, details)
      this.renderTabs()
      if (tabId === this.activeTabId) {
        this.renderToolbar(tab)
        // 当激活标签页的URL发生变化时，更新保存账号按钮状态
        if (changeInfo.url) {
          this.updateSaveAccountButtonVisibility(tab)
        }
      }
    })

    chrome.tabs.onRemoved.addListener((tabId) => {
      const tabIndex = this.tabList.findIndex((tab) => tab.id === tabId)
      if (tabIndex > -1) {
        this.tabList.splice(tabIndex, 1)
        this.$.tabList.querySelector(`[data-tab-id="${tabId}"]`).remove()

        // 如果关闭的是当前激活的标签页，更新保存账号按钮状态
        if (tabId === this.activeTabId) {
          const newActiveTab = this.tabList.find((tab) => tab.active)
          if (newActiveTab) {
            this.updateSaveAccountButtonVisibility(newActiveTab)
          } else {
            // 如果没有激活的标签页，隐藏按钮
            this.$.saveAccountButton.style.display = 'none'
          }
        }
      }
    })
  }

  setActiveTab(activeTab) {
    this.activeTabId = activeTab.id || activeTab.tabId
    this.windowId = activeTab.windowId

    for (const tab of this.tabList) {
      if (tab.id === (activeTab.id || activeTab.tabId)) {
        tab.active = true
        this.renderTab(tab)
        this.renderToolbar(tab)

        // 检查并更新保存账号按钮的显示状态
        this.updateSaveAccountButtonVisibility(tab)
      } else {
        if (tab.active) {
          tab.active = false
          this.renderTab(tab)
        }
      }
    }
  }

  onAddressUrlKeyPress(event) {
    if (event.code === 'Enter') {
      const url = this.$.addressUrl.value
      chrome.tabs.update({ url })
    }
  }

  createTabNode(tab) {
    const tabElem = this.$.tabTemplate.content.cloneNode(true).firstElementChild
    tabElem.dataset.tabId = tab.id

    tabElem.addEventListener('click', () => {
      chrome.tabs.update(tab.id, { active: true })
    })
    tabElem.querySelector('.close').addEventListener('click', () => {
      chrome.tabs.remove(tab.id)
    })
    const faviconElem = tabElem.querySelector('.favicon')
    faviconElem?.addEventListener('load', () => {
      faviconElem.classList.toggle('loaded', true)
    })
    faviconElem?.addEventListener('error', () => {
      faviconElem.classList.toggle('loaded', false)
    })

    this.$.tabList.appendChild(tabElem)
    return tabElem
  }

  renderTab(tab) {
    let tabElem = this.$.tabList.querySelector(`[data-tab-id="${tab.id}"]`)
    if (!tabElem) tabElem = this.createTabNode(tab)

    if (tab.active) {
      tabElem.dataset.active = ''
    } else {
      delete tabElem.dataset.active
    }

    const favicon = tabElem.querySelector('.favicon')
    if (tab.favIconUrl) {
      favicon.src = tab.favIconUrl
    } else {
      delete favicon.src
    }

    tabElem.querySelector('.title').textContent = tab.title
    tabElem.querySelector('.audio').disabled = !tab.audible
  }

  renderTabs() {
    this.tabList.forEach((tab) => {
      this.renderTab(tab)
    })
  }

  renderToolbar(tab) {
    this.$.addressUrl.value = tab.url

    // 更新保存账号按钮的显示状态
    this.updateSaveAccountButtonVisibility(tab)
  }

  /**
   * 检查当前URL是否为有效的网页（允许保存账号）
   * @param {string} url - 要检查的URL
   * @returns {boolean} - 是否为有效网页
   */
  isMediaOperatorUrl(url) {
    if (!url) return false

    try {
      const urlObj = new URL(url)
      // 只要是 http 或 https 协议的网页，都允许保存账号
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
    } catch (error) {
      console.error('URL解析错误:', error)
      return false
    }
  }

  /**
   * 更新保存账号按钮的显示状态
   * @param {chrome.tabs.Tab} tab - 当前标签页
   */
  updateSaveAccountButtonVisibility(tab) {
    if (!tab || !tab.url) {
      this.$.saveAccountButton.style.display = 'none'
      return
    }

    const isMediaSite = this.isMediaOperatorUrl(tab.url)
    this.$.saveAccountButton.style.display = isMediaSite ? 'block' : 'none'

    // 可选：在控制台输出调试信息
    console.log(`URL: ${tab.url}, 是否为媒体网站: ${isMediaSite}`)
  }

  async onSaveAccountClick() {
    try {
      // Check if electronAPI is available
      if (!window.electronAPI || !window.electronAPI.captureLoginInfo) {
        alert('electronAPI 不可用，请确保应用正确加载')
        return
      }

      // Get current active tab
      const activeTab = this.tabList.find((tab) => tab.active)
      if (!activeTab) {
        alert('没有活动的标签页')
        return
      }

      // Use electronAPI to capture login info
      const result = await window.electronAPI.captureLoginInfo()
      console.log('Capture login info result:', result)

      if (result.success) {
        alert('保存成功！')
        if (activeTab && activeTab.id) {
          // 在前端触发关闭当前标签页
          chrome.tabs.remove(activeTab.id)
        }
      } else {
        const errorMsg =
          typeof result.error === 'object' ? JSON.stringify(result.error) : result.error
        alert('保存失败: ' + errorMsg)
      }
    } catch (error) {
      alert('保存账号信息时出错: ' + error.message)
    }
  }
}

window.webui = new WebUI()
