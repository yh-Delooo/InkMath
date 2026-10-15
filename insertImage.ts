import RNFS from 'react-native-fs';
import {PluginNoteAPI} from 'sn-plugin-lib';
import {requestDeletePermission} from './permissions';
import {isSharedDirectory, STORAGE_ROOT} from './preferences';
export type ImportedImage = {path: string; hash: string};

export async function insertImage(processedPath: string, original?: ImportedImage | null): Promise<{warning?: string}> {
  const response = await PluginNoteAPI.insertImage(processedPath) as {
    success?: boolean; result?: boolean; error?: {message?: string};
  } | null | undefined;
  if (response?.success !== true || response.result !== true) {
    throw new Error(response?.error?.message || '图片插入失败，请重试。');
  }
  if (!original) { return {}; }
  try {
    const path = original.path;
    if (path === processedPath || !isSharedDirectory(path) || path.slice(0, path.lastIndexOf('/')) === STORAGE_ROOT || !/\.(png|jpe?g|bmp)$/i.test(path)) {
      throw new Error('原图片路径不符合删除条件。');
    }
    const saved = await PluginNoteAPI.saveCurrentNote() as {success?: boolean; result?: boolean};
    if (saved?.success !== true || saved.result !== true) { throw new Error('笔记保存未确认。'); }
    if (!await requestDeletePermission()) { throw new Error('未获得删除权限。'); }
    const stat = await RNFS.stat(path);
    if (!stat.isFile() || await RNFS.hash(path, 'sha256') !== original.hash) { throw new Error('原图片已变化。'); }
    await RNFS.unlink(path);
    return {};
  } catch (e) {
    return {warning: `公式已插入，原图片未删除，请勿重复插入。${e instanceof Error ? e.message : ''}`};
  }
}
