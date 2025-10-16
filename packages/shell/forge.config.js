const makers = [
  {
    name: '@electron-forge/maker-zip',
    platforms: ['darwin', 'win32'],
    config: {
      arch: ['x64', 'arm64'],
    },
  },
  {
    name: '@electron-forge/maker-dmg',
    platforms: ['darwin'],
    config: {
      icon: './assets/icon.icns',
      name: 'AIGEO 增长引擎',
      arch: ['x64', 'arm64'],
    },
  },
  {
    name: '@electron-forge/maker-squirrel',
    platforms: ['win32'],
    config: {
      name: 'matrix-application',
      authors: 'AIGEO Team',
      description: 'AIGEO Growth Engine',
      setupExe: 'AIGEO-Setup.exe',
      setupIcon: './assets/icon.ico',
      noMsi: true,
      remoteReleases: false,
      skipUpdateIcon: true,
    },
  },
]

// WiX maker - 生成标准的 MSI 安装包
if (process.platform === 'win32') {
  makers.push({
    name: '@electron-forge/maker-wix',
    platforms: ['win32'],
    config: {
      name: 'AIGEO.GrowthEngine',
      description: 'AIGEO Growth Engine - AI-driven growth analysis tool',
      manufacturer: 'AIGEO Team',
      version: '1.0.0',
      arch: 'x64',
      programFilesFolderName: 'AIGEO',
      shortName: 'AIGEO',
      exe: 'matrix-application',
      productName: 'AIGEO Growth Engine', // 使用英文避免编码问题
      icon: './assets/icon.ico',
      ui: {
        chooseDirectory: true,
        enabled: true,
      },
      features: {
        autoUpdate: false,
        autoLaunch: true,
      },
    },
  })
}

module.exports = {
  packagerConfig: {
    name: 'matrix-application', // 内部名称使用英文
    productName: 'AIGEO 增长引擎', // 产品显示名称使用中文
    asar: true,
    extraResource: ['browser/ui'],
    icon: './assets/icon', // 会自动根据平台选择对应格式
    // 添加这行来支持跨平台打包
    platform: ['darwin', 'win32'],
    arch: ['x64', 'arm64'], // 支持 x64 和 arm64 架构
    // Windows 特定配置
    win32metadata: {
      CompanyName: 'AIGEO Team',
      FileDescription: 'AIGEO 增长引擎 - AI驱动的增长分析工具',
      ProductName: 'AIGEO 增长引擎',
      InternalName: 'matrix-application',
      OriginalFilename: 'matrix-application.exe',
    },
    // 让 webpack 插件自动处理 ignore 配置
    // ignore: 配置已移除，让 Electron Forge 自动处理
  },
  makers,
  plugins: [
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              name: 'browser',
              preload: {
                js: './preload.ts',
              },
            },
          ],
        },
        devServer: {
          client: {
            overlay: false,
          },
        },
      },
    },
  ].filter(Boolean),
}
