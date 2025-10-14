const makers = [
  {
    name: '@electron-forge/maker-zip',
    platforms: ['darwin'], // 只在macOS上生成ZIP便携版
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
      name: 'AIGEO-GrowthEngine', // 内部名称，不能有中文和特殊字符
      authors: 'AIGEO Team',
      description: 'AIGEO Growth Engine - AI-driven growth analysis tool',
      exe: 'AIGEO-GrowthEngine.exe', // exe名称使用英文
      title: 'AIGEO 增长引擎', // 显示标题可以使用中文
      setupExe: 'AIGEO-GrowthEngine-Setup.exe', // 明确指定安装程序名称
      setupIcon: './assets/icon.ico', // 安装包图标
      // loadingGif: './assets/install-spinner.gif', // 安装动画（已移除，文件不存在）
      // 移除 noMsi 设置，确保生成标准的安装程序
      arch: ['x64'],
    },
  },
]

// WiX maker - 生成MSI安装包（需要安装WiX Toolset）
// 安装WiX Toolset: https://wixtoolset.org/releases/
// 或使用命令: choco install wixtoolset
// 启用 WiX MSI 安装包，提供标准的 Windows 安装体验
makers.push({
  name: '@electron-forge/maker-wix',
  platforms: ['win32'], // 只在 Windows 平台上实际运行
  config: {
    name: 'AIGEO-GrowthEngine',
    description: 'AI驱动的增长分析工具',
    manufacturer: 'AIGEO Team',
    version: '1.0.0',
    arch: ['x64'],
    programFilesFolderName: 'AIGEO',
    shortcutFolderName: 'AIGEO 增长引擎',
    ui: {
      chooseDirectory: true,
    },
  },
})

module.exports = {
  packagerConfig: {
    name: 'AIGEO-GrowthEngine', // 内部名称，与 Squirrel 配置保持一致
    productName: 'AIGEO 增长引擎', // 产品显示名称使用中文
    asar: true,
    extraResource: ['browser/ui'],
    icon: './assets/icon', // 会自动根据平台选择对应格式
    // 添加这行来支持跨平台打包
    platform: ['darwin', 'win32'],
    arch: ['x64', 'arm64'], // 支持 x64 和 arm64 架构
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
