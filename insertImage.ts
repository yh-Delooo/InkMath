import RNFS from 'react-native-fs';
import {PluginNoteAPI} from 'sn-plugin-lib';
import {requestDeletePermission} from './permissions';
import {isSharedDirectory, STORAGE_ROOT} from './preferences';

async function inspectSource(path: string) {
  const parent = path.slice(0, path.lastIndexOf('/'));
  if (!isSharedDirectory(path) || parent === STORAGE_ROOT || !/\.(png|jpe?g|bmp)$/i.test(path)) {
    throw new Error('只能删除从设备图片文件夹中选择的原图。');
  }
  const stat = await RNFS.stat(path);
  if (!stat.isFile()) { throw new Error('所选路径不是图片文件，未执行删除。'); }
  // RNFS returns Date on Android although its declaration uses number.
  const mtime = stat.mtime as unknown;
  const modified = mtime instanceof Date ? mtime.getTime() : typeof mtime === 'number' ? mtime : NaN;
  if (!Number.isFinite(modified)) { throw new Error('无法确认原图状态，未执行删除。'); }
  return {size: stat.size, modified};
}

// A cleanup failure is distinct from an insertion failure: never invite a
// second insertion when the note already contains the image.
export async function insertImageWithCleanup(
  processedPath: string,
  sourceUri: string,
  deleteAfterInsert: boolean,
): Promise<{cleanupWarning?: string}> {
  const sourcePath = sourceUri.replace(/^file:\/\//, '');
  let original: Awaited<ReturnType<typeof inspectSource>> | undefined;
  let inspectionError: unknown;
  if (deleteAfterInsert) {
    try { original = await inspectSource(sourcePath); }
    catch (error) { inspectionError = error; }
  }
  const response = await PluginNoteAPI.insertImage(processedPath) as {
    success?: boolean; result?: boolean; error?: {message?: string};
  } | null | undefined;
  if (response?.success !== true || response.result !== true) {
    throw new Error(response?.error?.message || 'Image insertion failed. Please try again.');
  }
  if (!deleteAfterInsert) { return {}; }
  try {
    if (!original) { throw inspectionError || new Error('无法确认原图，未执行删除。'); }
    if (!await requestDeletePermission()) { throw new Error('未获得删除权限，原图已保留。'); }
    const current = await inspectSource(sourcePath);
    if (current.size !== original.size || current.modified !== original.modified) {
      throw new Error('原图在插入期间发生了变化，已保留文件。');
    }
    await RNFS.unlink(sourcePath);
    return {};
  } catch (error) {
    return {cleanupWarning: `图片已经插入，无需再次插入。\n${error instanceof Error ? error.message : '原图未自动删除，请检查文件。'}`};
  }
}
