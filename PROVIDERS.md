# 大模型图片接口预设

核对日期：2026-10-14。仅包含官方明确声明支持图片输入的预设；没有纯文本识别入口。

| 预设 | 默认模型 | 完整请求地址 |
|---|---|---|
| 千问 · 北京 | `qwen3-vl-plus` | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` |
| DeepSeek | `deepseek-flash` | `https://api.deepseek.com/chat/completions` |
| MiniMax · 国内 | `MiniMax-M3` | `https://api.minimax.cn/v1/chat/completions` |
| Kimi · 国内 | `kimi-k3` | `https://api.moonshot.cn/v1/chat/completions` |
| 千问 · 新加坡 | `qwen3-vl-plus` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions` |
| MiniMax · 国际 | `MiniMax-M3` | `https://api.minimax.io/v1/chat/completions` |
| Kimi · 国际 | `kimi-k3` | `https://api.moonshot.ai/v1/chat/completions` |
| 自定义图片接口 | 自填 | 自填 HTTPS 地址；支持完整地址或自动追加 `/chat/completions` 的 Base URL |

地址和模型名都能修改。国内/国际/地域的 API Key 不一定通用，需使用对应平台账号的 API 凭据；聊天产品订阅或 Coding Plan 不代表可以任意调用通用图片 API。预设是文档兼容配置，不代表本次已对各平台做付费实测。

## 为什么 OCR 仍需要图片能力

输入是手写截图时，API 接收到的是像素，识别为 LaTeX 就是图像理解/数学 OCR。纯文本模型不能直接读取图片。按用户要求，本版不提供“已有文字 → LaTeX”入口；公式编辑框仍保留原始 A 功能——手动输入/核对 LaTeX。

## 接口实现

`POST` + `Authorization: Bearer <API Key>` + `messages[].content` 的 `text` / `image_url`，图片以内嵌 Base64 data URL 发送。不自动上传到第三方图床。不调用搜索/工具，不自动求解公式。

模型被要求返回 `{"latex":"...","uncertainty":"..."}`。支持 JSON 代码围栏，移除单独的 `<think>` 区块；无效 JSON、空公式、截断、拒绝或工具调用会报错。返回的公式需要用户确认，模型的不确定性会显示在界面上，不能把没有警告等同于识别正确。

默认最多 4096 输出 token，90 秒超时，无自动重试。MiniMax M3 用 `max_completion_tokens` 并关闭 thinking；Kimi K3 用 `reasoning_effort=low`；其他默认只传 `max_tokens`，不强行设置 temperature。专用参数只对地址/模型保持原样的对应预设生效。自定义接口必须支持这些通用 Chat Completions 参数及非流式响应；Responses、Anthropic Messages 和需要额外签名的接口未实现。

设置自动保存。API Key 由 Android Keystore AES-GCM 加密，按完整接口地址隔离；普通 provider.json 仍只含 preset / endpoint / model / vision。圈选手写后点击“渲染公式”即开始识别；导入图片需手动上传。

只接受 HTTPS，图片限制约 1.4 MB。BMP 请先点“应用裁剪”转成 PNG；纯文本模型不会因勾选某项设置而获得看图能力。本版直接拦截已知不支持图片的 MiniMax M2.x，并将其他服务端兼容性错误显示给用户。

## 官方依据

- [DeepSeek Vision](https://api-docs.deepseek.com/guides/vision/)：`deepseek-flash` 的图片输入与 Chat Completions 示例。
- [MiniMax 国内 OpenAI 接口](https://platform.minimax.cn/docs/api-reference/text-openai-api)、[国际接口](https://platform.minimax.io/docs/api-reference/text-openai-api)：M3 图片输入与域名。没有预设仅限 M Plan/Code 的 M3.1 Preview，也没有添加不支持图片的 M2.x。
- [Kimi 国内快速开始](https://platform.kimi.com/docs/get-api-key)、[国际快速开始](https://platform.kimi.ai/docs/overview)、[模型参数](https://platform.kimi.ai/docs/api/models-overview)：K3 视觉输入、地区域名、reasoning_effort 与固定参数。
- [千问视觉兼容接口](https://help.aliyun.com/zh/model-studio/qwen-vl-compatible-with-openai)、[兼容接口参考](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions)：`qwen3-vl-plus`；官方推荐业务空间专属域名，并明确旧 dashscope 域名仍可用，因此预设无需额外填 WorkspaceId，也可手动替换。
- [OpenAI 图片输入格式](https://developers.openai.com/api/docs/guides/images-vision)：兼容请求的 `image_url`/Base64 结构依据。自定义能力不表示所有号称兼容的供应商都经过实测。
