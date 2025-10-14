# Windows 安装包构建说明

## ⚠️ 重要提示

**Windows 安装包只能在 Windows 系统上生成！**

- Squirrel 和 WiX 都依赖 Windows 特定的工具
- 在 macOS 或 Linux 上运行 `yarn make` 不会生成 Windows 安装包

## 构建目标

- ✅ 生成真正的 Windows 安装包（非便携版）
- ✅ 移除 Windows ZIP 便携版
- ✅ 支持 Squirrel 安装包
- ⚠️ WiX MSI 需要额外安装工具
- ⚠️ 必须在 Windows 系统上构建

## 安装包类型

### 1. Squirrel 安装包 (推荐，默认启用)

- **文件名**: `AIGEO-GrowthEngine-Setup.exe` (标准 Squirrel 安装包)
- **特点**:
  - 现代化安装体验
  - 支持自动更新
  - 安装速度快
  - 用户友好的界面
  - **无需额外依赖**

### 2. WiX MSI 安装包 (可选，需要工具)

- **文件名**: `AIGEO.GrowthEngine.msi`
- **特点**:
  - 企业级部署支持
  - 支持组策略管理
  - 传统 Windows 安装包格式
- **⚠️ 需要安装 WiX Toolset**

## 构建方法

### 快速构建（仅 Squirrel）

在 Windows 系统上运行：

```powershell
cd packages/shell
yarn make
```

### 完整构建（包含 MSI）

1. 先安装 WiX Toolset：

   ```powershell
   # 方法1: 使用 Chocolatey
   choco install wixtoolset

   # 方法2: 手动下载安装
   # 访问 https://wixtoolset.org/releases/
   ```

2. 取消注释 forge.config.js 中的 WiX maker 配置

3. 运行构建：
   ```powershell
   yarn make
   ```

## 输出文件位置

构建完成后，安装包将生成在：

- `out/make/squirrel.windows/x64/` - Squirrel 安装包
- `out/make/wix/x64/` - WiX MSI 安装包（如果启用）

## 跨平台构建解决方案

### 方案 1：在 Windows 系统上构建

1. 将项目代码复制到 Windows 系统
2. 在 Windows 上安装 Node.js 和 Yarn
3. 运行 `yarn install` 安装依赖
4. 运行 `yarn make` 生成 Windows 安装包

### 方案 2：使用虚拟机

1. 在 macOS 上安装 Windows 虚拟机（如 Parallels Desktop、VMware Fusion）
2. 在虚拟机中安装开发环境
3. 在虚拟机中构建 Windows 安装包

### 方案 3：使用 CI/CD（推荐）

1. 使用 GitHub Actions 或其他 CI/CD 服务
2. 配置 Windows 构建环境
3. 自动化构建和发布流程

## 验证安装包

1. **Squirrel 安装包测试**:

   - 双击 `AIGEO-GrowthEngine-Setup.exe`
   - 应该显示安装界面（而不是直接启动应用）
   - 安装完成后在开始菜单找到应用

2. **WiX MSI 安装包测试**:
   - 双击 `.msi` 文件
   - 应该显示 Windows 标准安装向导
   - 可以选择安装目录

## 故障排除

### 错误: "Could not find light.exe or candle.exe"

这表示 WiX Toolset 未安装。解决方案：

1. 安装 WiX Toolset（见上方安装方法）
2. 或者暂时禁用 WiX maker，只使用 Squirrel

### 当前配置状态

- ✅ Squirrel maker: 已启用
- ⚠️ WiX maker: 已暂时禁用（避免依赖错误）

## 注意事项

- ✅ 已移除 Windows ZIP 便携版
- ✅ 只生成真正的安装包
- ✅ 支持自动更新功能
- ⚠️ WiX MSI 需要手动安装工具
