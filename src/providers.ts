export type ProviderConfig = {preset: string; endpoint: string; model: string; vision: boolean};
export type Preset = ProviderConfig & {label: string; note: string};
// Verified against provider documentation on 2026-10-14. Availability is account/region dependent.
export const PRESETS: Preset[] = [
  {preset: 'qwen-cn', label: '千问 · 北京', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen3-vl-plus', vision: true, note: '使用北京地域 API Key；也可改成你的业务空间专属域名。'},
  {preset: 'deepseek', label: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash', vision: true, note: '预设 Flash 支持图片；不要把纯文本模型当作图片识别模型。'},
  {preset: 'minimax-cn', label: 'MiniMax · 国内', endpoint: 'https://api.minimax.cn/v1/chat/completions', model: 'MiniMax-M3', vision: true, note: 'M3 支持图片；M2.x 不可直接做图片 OCR。需对应平台 API Key。'},
  {preset: 'kimi-cn', label: 'Kimi · 国内', endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'kimi-k3', vision: true, note: 'K3 支持图片。API 账号额度与聊天产品订阅不同。'},
  {preset: 'qwen-intl', label: '千问 · 新加坡', endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen3-vl-plus', vision: true, note: '需新加坡地域 API Key，不与北京地域混用。'},
  {preset: 'minimax-intl', label: 'MiniMax · 国际', endpoint: 'https://api.minimax.io/v1/chat/completions', model: 'MiniMax-M3', vision: true, note: '使用国际平台 API Key；预设采用可用的 M3，而非受限 Preview。'},
  {preset: 'kimi-intl', label: 'Kimi · 国际', endpoint: 'https://api.moonshot.ai/v1/chat/completions', model: 'kimi-k3', vision: true, note: '使用国际 API 平台对应凭据。'},
  {preset: 'custom', label: '自定义图片接口', endpoint: '', model: '', vision: true, note: '必须兼容 Chat Completions 并支持 Base64 image_url。'},
];
export const DEFAULT_PROVIDER: ProviderConfig = {...PRESETS[0]};
export function completionEndpoint(input: string): string {
  let endpoint = input.trim().replace(/\/+$/, '');
  // RN's built-in URL is incomplete on some hosts: conservative ASCII URL validation.
  if (!/^https:\/\/[a-zA-Z0-9.-]+(?::\d{1,5})?(?:\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]*)?$/.test(endpoint) ||
    /[?#{}\s\\]/.test(endpoint)) { throw new Error('请输入完整 HTTPS 接口地址，不含密钥、查询参数或占位符。'); }
  if (endpoint.endsWith('/responses') || endpoint.endsWith('/messages')) { throw new Error('本版需要 Chat Completions 接口，不是 Responses / Messages。'); }
  if (!endpoint.endsWith('/chat/completions')) { endpoint += '/chat/completions'; }
  return endpoint;
}
export function presetParameters(config: ProviderConfig): Record<string, unknown> {
  const p = PRESETS.find(v => v.preset === config.preset && v.model === config.model && v.endpoint === completionEndpoint(config.endpoint));
  if (p?.model === 'MiniMax-M3') { return {max_completion_tokens: 4096, thinking: {type: 'disabled'}}; }
  if (p?.model === 'kimi-k3') { return {max_tokens: 4096, reasoning_effort: 'low'}; }
  return {max_tokens: 4096};
}
