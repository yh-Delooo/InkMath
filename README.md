# InkMath

Supernote Nomad 数学插件：手写公式识别、LaTeX 排版、函数绘图。

## 功能

- **手写转公式**：圈选手写内容，点击「渲染公式」，自动识别并生成预览；核对、编辑后插入笔记，保留原手写。
- **离线公式排版**：输入 LaTeX，生成分式、根号、矩阵、求和等公式图片。
- **离线函数绘图**：从公式记录选择公式，或输入函数表达式，生成并插入函数图像。
- **固定单位格**：横纵轴默认均为 -5 到 5，单位格默认 1；两轴保持相同比例，按指定范围裁切。
- **公式记录**：默认选择最新记录；列表顶部提供「用所选公式绘图」和「重新编辑所选公式」。
- **图片导入**：支持从目录导入图片、裁剪并识别，保存常用目录。
- **API 设置**：内置千问、DeepSeek、MiniMax、Kimi 图片模型预设，支持自定义接口、模型和 API Key。设置自动保存，密钥在本机加密存储。

只有图片识别需要联网调用你配置的服务，可能产生 API 费用；公式排版和函数绘图可离线使用。服务商配置见 [PROVIDERS.md](PROVIDERS.md)。

## 安装与使用

适用于 Supernote Nomad 的原生插件系统，开发基于 Chauvet 3.29.45_beta、sn-plugin-lib 0.1.65。

1. 从本仓库 **Releases** 下载 `.snplg` 安装包，复制到设备 `MyStyle` 目录。
2. 在设备插件管理中添加 InkMath，并授予所需权限。
3. 从插件入口打开 API 设置，选择服务商，填入自己的 API Key。
4. 在笔记中圈选手写公式，点击「渲染公式」。核对预览后点击「确认并插入公式」。
5. 使用「一键绘图」打开公式记录，选中公式后点击顶部「用所选公式绘图」，设置范围并插入图像。
6. 要修改历史公式，选中记录后点击「重新编辑所选公式」。

图片入口的「一键绘图」使用手动选择的公式记录，默认选中最新一条。插入结果是图片，可使用笔记工具调整位置和大小。

## 绘图表达式

支持显式函数，例如 `x^2`、`sin(x)`、`1/x`、`sqrt(x)`，以及可转换的 LaTeX 分式、根号、幂和函数。

支持 `x`、`pi`、`e`、`+ - * / ^`、括号，以及 `sin cos tan asin acos atan sqrt abs exp ln log`。角度使用弧度，`ln` 是自然对数，`log` 是以 10 为底的对数。

单位格可以填写 1、0.5 等正数。例如纵轴 -1 到 5、单位格 1 时，仍按每格 1 绘制，横纵比例保持一致。

## 数据与隐私

选择手写「渲染公式」会把选区图片发送给你配置的 API 服务；导入图片在点击识别后上传。请自行核对识别结果。

API Key 使用 Android Keystore 加密，按接口地址区分保存。公式图片和记录保存在插件目录 `supernote-math-llm/`；需要迁移时请备份该目录。源码不包含用户密钥。

## 本地构建

Windows / PowerShell，需要 Node.js 22、JDK 17、Android SDK 35 / build-tools 35.0.0、NDK 27.1.12297006。设置 `JAVA_HOME` 和 `ANDROID_HOME`。

```powershell
npm ci
npm run typecheck
npm test -- --runInBand
./buildPlugin.ps1
```

脚本生成预览、JavaScript bundle 和原生载荷，最终安装包位于 `build/outputs/`。安装使用 `.snplg` 文件。

`npm ci` 会执行本项目的原生缓存目录修补脚本；构建时保留此步骤。仓库包含 Android 模板的公开 debug keystore，用于开发构建。GitHub Actions 执行类型和单元检查。

当前代码已通过类型检查、90 项单元测试和构建打包；本项目开发环境未连接 Nomad，也未使用真实 API 凭据完成端到端验证。

## 目录

| 路径 | 内容 |
| --- | --- |
| `App.tsx` | 插件界面和交互 |
| `src/` | 公式排版、识别、绘图和记录 |
| `android/` | Android 工程和密钥存储模块 |
| `scripts/` | 预览与打包脚本 |
| `__tests__/` | 单元测试 |
| `third-party-licenses/` | 第三方依赖许可文本 |

版本：0.1.1。插件 ID：`snmllm4e9a6c2f8b`，pluginKey：`supernote_math_llm`。

## 来源与许可

图片导入、裁剪与笔记插入基础来自 [Wolfsolver / Image Inserter](https://github.com/wolfsolver/supernote-image-insert-plugin)，并基于本地 Touch Crop 修改继续开发。数学排版使用 MathJax，插件接口使用 sn-plugin-lib。感谢这些项目的作者。

上游 Image Inserter 的授权状态及依赖说明见 [NOTICE.md](NOTICE.md)。本仓库没有为上游代码另行授予 MIT 等许可证。
