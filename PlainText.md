## 开发指南

### 快速开始

1. 克隆项目到本地
2. 安装依赖：`yarn install`
3. 启动开发服务器：`yarn start`
4. 应用将自动打开，开始开发

### 调试技巧

- 使用 `yarn start:debug` 启用详细日志
- 使用 `yarn start:skip-build` 跳过构建加快启动
- 使用 `yarn start:electron-dev:trace` 进行性能分析

### 扩展开发

将Chrome扩展放置在 `extensions/` 目录下，应用启动时会自动加载。

## 环境变量

- `DEBUG`: 设置调试级别
- `SHELL_DEBUG`: 启用Shell调试模式
- `ELECTRON_ENABLE_LOGGING`: 启用Electron日志
- `ELECTRON_OVERRIDE_DIST_PATH`: 覆盖Electron分发路径

## 常见问题

### Q: 启动时出现依赖错误？
A: 请确保使用正确的Node.js和Yarn版本，然后重新安装依赖。

### Q: 扩展无法加载？
A: 检查扩展是否放置在正确的 `extensions/` 目录下，并确保扩展格式正确。

### Q: 构建失败？
A: 清理node_modules后重新安装：`rm -rf node_modules && yarn install`

## 贡献指南

1. Fork 本项目
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -am 'Add some feature'`
4. 推送到分支：`git push origin feature/your-feature`
5. 提交Pull Request

## 许可证

本项目采用 GPL-3.0 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 作者

Samuel Maddock <sam@samuelmaddock.com>

## 更新日志

查看 [CHANGELOG.md](packages/electron-chrome-extensions/CHANGELOG.md) 了解版本更新信息。
