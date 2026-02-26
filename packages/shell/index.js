const { app } = require('electron')

// 关键修复：禁用自动化控制特征，防止被检测为 WebDriver
// app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
// 伪装显卡信息（可选，视情况而定）
// app.commandLine.appendSwitch('disable-gpu-driver-bug-workarounds')

const Browser = require('./browser/main')
new Browser()
