module.exports = {
  packagerConfig: {
    name: 'Matrix Application',
    asar: true,
    extraResource: ['browser/ui'],
    icon: './assets/icon', // 会自动根据平台选择对应格式
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        icon: './assets/icon.icns',
        name: 'Matrix Application'
      }
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
