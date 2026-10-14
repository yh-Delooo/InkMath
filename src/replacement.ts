import RNFS from 'react-native-fs';
import {PluginCommAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {checked, exportSelection} from './storage';

type Rect = {left: number; top: number; right: number; bottom: number};
export type Selection = {file: string; page: number; layer: number; ids: number[]; rect: Rect; image: string; hash: string};
export function strokeIds(elements: any[]): number[] {
  if (!elements.length || elements.some(e => e.type !== 0 || !Number.isInteger(e.numInPage) || e.numInPage < 1 ||
      e.pageNum !== elements[0].pageNum || e.layerNum !== elements[0].layerNum)) {
    throw new Error('请只圈选同一图层的一条手写公式。混合图片、标题或跨图层选区不能自动处理。');
  }
  const ids = elements.map(e => e.numInPage).sort((a, b) => a - b);
  if (new Set(ids).size !== ids.length) { throw new Error('选区编号不完整，请重新圈选。'); }
  return ids;
}
export async function captureHandwriting(): Promise<Selection> {
  const elements = checked<any[]>(await PluginCommAPI.getLassoElements(), '读取手写选区');
  const ids = strokeIds(elements);
  const rect = checked<Rect>(await PluginCommAPI.getLassoRect(), '读取选区位置');
  if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) || rect.right <= rect.left || rect.bottom <= rect.top) {
    throw new Error('选区位置无效，请重新圈选。');
  }
  const file = checked<string>(await PluginCommAPI.getCurrentFilePath(), '读取笔记路径');
  const page = checked<number>(await PluginCommAPI.getCurrentPageNum(), '读取页码');
  if (elements[0].pageNum !== page || !Number.isInteger(elements[0].layerNum)) { throw new Error('选区页码或图层不一致。'); }
  const image = await exportSelection();
  return {file, page, layer: elements[0].layerNum, ids, rect, image, hash: await RNFS.hash(image, 'sha256')};
}
function accepted(response: any, label: string) {
  if (checked(response, label) !== true) { throw new Error(`${label}未得到明确确认`); }
}
async function validate(s: Selection) {
  if (checked<string>(await PluginCommAPI.getCurrentFilePath(), '读取笔记') !== s.file ||
      checked<number>(await PluginCommAPI.getCurrentPageNum(), '读取页码') !== s.page) { throw new Error('笔记或页面已经变化，请重新圈选。'); }
  // The selection was already exported before OCR. Host lasso actions can expire
  // while the confirmation UI is open or after saveCurrentNote. Insertion does
  // not modify original strokes, so only the destination note/page needs checking.
}
// Recognition only inserts a new image; original handwriting is never deleted.
export async function insertRecognizedFormula(s: Selection, path: string): Promise<string> {
  await validate(s);
  accepted(await PluginNoteAPI.insertImage(path), '插入公式');
  try {
    accepted(await PluginNoteAPI.saveCurrentNote(), '保存插入结果');
    return '';
  } catch (e) {
    return `公式已插入，但保存未能确认，请返回笔记检查，勿重复插入。${e instanceof Error ? e.message : ''}`;
  }
}
