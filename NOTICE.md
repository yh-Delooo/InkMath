# 代码来源与许可说明

InkMath 的图片导入、文件浏览、裁剪、权限和插入基础代码复用了 Wolfsolver 的 Image Inserter 项目，并基于本地 Touch Crop 修改继续开发：

https://github.com/wolfsolver/supernote-image-insert-plugin

截至 2026-10-15 检查时，上游仓库未提供 LICENSE，GitHub API 的 license 字段为空。本项目未取得额外授权证明，不将这些代码重新标为 MIT 或其他开源许可证；公开源码不代表对上游代码另行授予使用、修改或再分发许可。原作者保留其相应权利。

数学排版、识别接口、函数绘图、公式记录和相关 UI 为此项目的新增或修改内容。本仓库尚未为项目整体指定许可证。

React Native、MathJax、sn-plugin-lib 及其他依赖遵循各自许可；已收集的许可文本保留在 third-party-licenses/。这些依赖的许可证不替代上游基础代码的授权。

API 设置界面参考 KOAssistant 的交互设计，没有复制其代码：
https://github.com/zeeyado/koassistant.koplugin
