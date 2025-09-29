# AIGEO 增长引擎 - Electron Browser Shell

一个基于Electron构建的最小化浏览器shell应用程序，支持Chrome扩展和现代Web技术。

## 项目简介

本项目是一个功能完整的Electron浏览器shell，提供了：

- Chrome扩展支持
- 上下文菜单功能
- Chrome Web Store集成
- 现代化的浏览器界面

## 系统要求

- Node.js >= 16.0.0
- Yarn >= 1.10.0 < 2.0.0
- 支持的操作系统：Windows、macOS、Linux

## 安装依赖

```bash
# 安装项目依赖
yarn install
```

## 启动方式

### 开发模式启动

```bash
# 标准开发启动（推荐）
yarn start

# 调试模式启动
yarn start:debug

# 跳过构建直接启动（快速开发）
yarn start:skip-build
```

### Electron开发模式

```bash
# 使用本地Electron版本启动
yarn start:electron-dev

# Electron调试模式
yarn start:electron-dev:debug

# Electron性能追踪模式
yarn start:electron-dev:trace
```

## 构建项目

### 完整构建

```bash
# 构建所有包
yarn build
```

### 分别构建各个模块

```bash
# 构建上下文菜单模块
yarn build:context-menu

# 构建Chrome扩展模块
yarn build:extensions

# 构建Chrome Web Store模块
yarn build:chrome-web-store

# 构建Shell主程序
yarn build:shell
```

## 打包发布

```bash
# 进入shell目录
cd packages/shell

# 打包应用
yarn package

# 制作安装包
yarn make
```

## 测试

```bash
# 运行所有测试
yarn test

# 运行扩展模块测试
yarn test:extensions
```

## 代码格式化

```bash
# 格式化所有代码文件
yarn format
```

## 项目结构
