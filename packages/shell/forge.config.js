module.exports = {
  packagerConfig: {
    name: 'matrix-application',
    asar: true,
    extraResource: ['browser/ui'],
    icon: './assets/icon', // 会自动根据平台选择对应格式
    // 添加这行来支持跨平台打包
    platform: ['darwin', 'win32'],
    arch: ['x64', 'arm64'], // 支持 x64 和 arm64 架构
  },
  makers: [
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
        authors: 'Samuel Maddock',
        description: 'AIGEO 增长引擎 - AI驱动的增长分析工具',
        exe: 'matrix-application.exe',
        title: 'AIGEO 增长引擎',
        setupExe: 'AIGEO-增长引擎-Setup.exe',
        arch: ['x64'],
      },
    },
    {
      name: '@electron-forge/maker-wix',
      platforms: ['win32'],
      config: {
        name: 'AIGEO 增长引擎',
        description: 'AIGEO 增长引擎 - AI驱动的增长分析工具',
        manufacturer: 'AIGEO Team',
        version: '1.0.0',
        arch: 'x64',
        programFilesFolderName: 'AIGEO',
        shortName: 'AIGEO',
        exe: 'matrix-application',
        ui: {
          chooseDirectory: true,
        },
      },
    },
  ],
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
