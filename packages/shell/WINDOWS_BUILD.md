# Windows 安装包构建说明

## 构建目标

- ✅ 生成真正的 Windows 安装包（非便携版）
- ✅ 移除 Windows ZIP 便携版
- ✅ 支持 Squirrel 安装包
- ⚠️ WiX MSI 需要额外安装工具

## 安装包类型

### 1. Squirrel 安装包 (推荐，默认启用)

- **文件名**: `AIGEO-增长引擎-Setup.exe`
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

## 验证安装包

1. **Squirrel 安装包测试**:

   - 双击 `AIGEO-增长引擎-Setup.exe`
   - 应该显示安装界面
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
