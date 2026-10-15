import {PluginNoteAPI} from 'sn-plugin-lib';

export async function insertImage(processedPath: string): Promise<{warning?: string}> {
  const response = await PluginNoteAPI.insertImage(processedPath) as {
    success?: boolean; result?: boolean; error?: {message?: string};
  } | null | undefined;
  if (response?.success !== true || response.result !== true) {
    throw new Error(response?.error?.message || '图片插入失败，请重试。');
  }
  return {};
}
