webContents.setWindowOpenHandler((details) => {
  switch (details.disposition) {
    case 'foreground-tab':
    case 'background-tab':
    case 'new-window': {
      return {
        action: 'allow',
        outlivesOpener: true,
        createWindow: async ({ webContents: guest, webPreferences }) => {
          try {
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

            if (!webContents.isDestroyed()) {
              this.transferDataToNewTab(webContents, tab, details.url)
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
