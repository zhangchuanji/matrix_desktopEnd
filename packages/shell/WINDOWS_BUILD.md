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

### 1. WiX MSI 安装包 (推荐，已启用)

- **文件名**: `AIGEO-GrowthEngine-1.0.0.msi`
- **特点**:
  - Windows 标准 MSI 安装包
  - 真正的安装程序，显示标准安装界面
  - 企业级部署支持
  - 支持组策略管理
  - 传统 Windows 安装包格式
- **⚠️ 需要安装 WiX Toolset**

### 2. Squirrel 安装包 (备用)

- **文件名**: `AIGEO-GrowthEngine-Setup.exe` (标准 Squirrel 安装包)
- **特点**:
  - 现代化安装体验
  - 支持自动更新
  - 安装速度快
  - 用户友好的界面
  - 安装到系统目录
  - 创建开始菜单快捷方式
  - **无需额外依赖**

## 构建方法

### 前置要求（重要！）

在 Windows 系统上，首先需要安装 WiX Toolset：

#### 方法 1: 手动下载安装（推荐）

1. 访问 [WiX Toolset 官网](https://wixtoolset.org/releases/)
2. 下载最新版本的 WiX Toolset（例如：wix311.exe）
3. 运行下载的安装程序
4. 按照安装向导完成安装
5. 重启命令行窗口

#### 方法 2: 使用 Chocolatey（如果已安装）

```bash
choco install wixtoolset
```

#### 方法 3: 安装 Chocolatey 然后安装 WiX

如果想使用 Chocolatey，先安装它：

```powershell
# 以管理员身份运行 PowerShell，然后执行：
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 然后安装 WiX
choco install wixtoolset
```

#### 验证安装

安装完成后，验证 WiX 是否正确安装：

```bash
# 检查 WiX 工具是否可用
candle.exe -?
```

如果显示 WiX 的帮助信息，说明安装成功。

### 构建命令

#### 方法 1: 在 Windows 系统上本地构建

在 Windows 系统上，确保已安装 WiX Toolset 后，运行：

```bash
yarn make
```

#### 方法 2: 使用 GitHub Actions 云端构建（推荐）

如果你在 macOS 或 Linux 上开发，可以使用 GitHub Actions 在云端的 Windows 环境中构建：

1. **推送代码到 GitHub**：

   ```bash
   git add .
   git commit -m "Update Windows build configuration"
   git push
   ```

2. **触发构建**：

   - 推送代码后会自动触发构建
   - 或者在 GitHub 仓库的 Actions 页面手动触发 "Build Windows MSI" 工作流

3. **下载安装包**：
   - 构建完成后，在 Actions 页面下载生成的安装包
   - 会生成两个文件：
     - `windows-msi-installer` (MSI 安装包，推荐)
     - `windows-squirrel-installer` (Squirrel 安装包，备用)

#### 方法 3: 使用虚拟机

在 macOS 上运行 Windows 虚拟机（如 Parallels Desktop、VMware），然后按照方法 1 操作。

### 生成的文件位置：

- `out/make/wix/x64/` - WiX MSI 安装包（主要）
- `out/make/squirrel.windows/x64/` - Squirrel 安装包（备用）

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

在 Windows 系统上：

### 测试 MSI 安装包（推荐）：

1. 双击 `AIGEO-GrowthEngine-1.0.0.msi`
2. 应该显示标准的 Windows 安装向导
3. 按照安装向导完成安装

### 测试 Squirrel 安装包（备用）：

1. 双击 `AIGEO-GrowthEngine-Setup.exe`
2. 应该显示安装界面（而不是直接启动应用）
3. 按照安装向导完成安装

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
