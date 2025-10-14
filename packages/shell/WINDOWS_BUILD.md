# Windows 安装包构建说明

## 🎯 目标

生成真正的 Windows 安装包，而不是便携版

## 📦 安装包类型

### 1. Squirrel 安装包 (推荐)

- **文件名**: `AIGEO-增长引擎-Setup.exe`
- **特点**: 自动更新支持，现代安装体验
- **无需额外工具**: 开箱即用

### 2. WiX MSI 安装包 (企业级)

- **文件名**: `AIGEO.GrowthEngine.msi`
- **特点**: 企业级部署，组策略支持
- **需要**: 安装 WiX Toolset

## 🔧 在 Windows 上构建

### 方法1: 使用 Squirrel (推荐)

```powershell
# 在 Windows PowerShell 中运行
cd C:\path\to\matrix_application\packages\shell
yarn install
yarn make
```

### 方法2: 使用 WiX MSI

```powershell
# 1. 安装 WiX Toolset
choco install wixtoolset
# 或从 https://wixtoolset.org/releases/ 下载安装

# 2. 构建
yarn make
```

## 📁 输出文件位置

- Squirrel: `out/make/squirrel.windows/x64/AIGEO-增长引擎-Setup.exe`
- WiX MSI: `out/make/wix/x64/AIGEO.GrowthEngine.msi`

## ✅ 验证安装包

1. 双击 `.exe` 文件应该显示安装界面
2. 不应该直接启动应用程序
3. 安装完成后在开始菜单中找到应用

## 🚫 已移除

- Windows ZIP 便携版（避免混淆）
- 只保留真正的安装包
