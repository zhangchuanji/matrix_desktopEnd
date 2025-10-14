const makers = [
  {
    name: '@electron-forge/maker-zip',
    platforms: ['darwin', 'win64'],
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
    platforms: ['win64'],
    config: {
      name: 'matrix-application', // 内部名称使用英文
      authors: 'Samuel Maddock',
      description: 'AIGEO 增长引擎 - AI驱动的增长分析工具',
      exe: 'matrix-application.exe', // exe名称使用英文
      title: 'AIGEO 增长引擎', // 显示标题可以使用中文
      setupExe: 'AIGEO-增长引擎-Setup.exe',
      arch: ['x64'],
    },
  },
]

// WiX maker需要安装WiX Toolset，暂时注释掉
// 如需MSI安装包，请先安装WiX Toolset: https://wixtoolset.org/releases/
/*
if (process.platform === 'win32') {
  makers.push({
    name: '@electron-forge/maker-wix',
    platforms: ['win32'],
    config: {
      name: 'AIGEO.GrowthEngine', // 包ID必须使用英文和点号
      description: 'AIGEO Growth Engine - AI-driven growth analysis tool',
      manufacturer: 'AIGEO Team',
      version: '1.0.0',
      arch: 'x64',
      programFilesFolderName: 'AIGEO',
      shortName: 'AIGEO',
      exe: 'matrix-application', // exe名称使用英文
      productName: 'AIGEO 增长引擎', // 产品显示名称可以使用中文
      ui: {
        chooseDirectory: true,
      },
    },
  });
}
*/

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
