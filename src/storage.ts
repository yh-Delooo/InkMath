import RNFS from 'react-native-fs';
import {PluginCommAPI} from 'sn-plugin-lib';
import {getImageDirectory} from '../imageStorage';
import {FormulaRecord, newestFirst} from './history';
export function checked<T>(response: any, label: string): T {
  if (response?.success !== true || response.result === false || response.result == null) {
    throw new Error(`${label}失败：${response?.error?.message || '设备未返回有效结果'}`);
  }
  return response.result as T;
}
export async function loadHistory(): Promise<FormulaRecord[]> {
  const file = `${await getImageDirectory()}/formulas.json`;
  if (!await RNFS.exists(file)) { return []; }
  const data = JSON.parse(await RNFS.readFile(file, 'utf8'));
  if (data.version !== 1 || !Array.isArray(data.records)) { throw new Error('公式记录损坏，请保留文件备份。'); }
  return newestFirst(data.records.filter((r: any) => typeof r.latex === 'string' && /^[a-f0-9]{64}$/.test(r.hash) && typeof r.path === 'string'));
}
export async function saveRecord(record: FormulaRecord) {
  const records = await loadHistory();
  const file = `${await getImageDirectory()}/formulas.json`;
  await RNFS.writeFile(file + '.tmp', JSON.stringify({version: 1, records: [record, ...records.filter(r => r.id !== record.id)]}), 'utf8');
  await RNFS.moveFile(file + '.tmp', file);
}
export async function savePng(base64: string): Promise<string> {
  const path = `${await getImageDirectory()}/math-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.png`;
  await RNFS.writeFile(path, base64, 'base64'); return path;
}
export async function exportSelection(): Promise<string> {
  const path = `${await getImageDirectory()}/selection-${Date.now()}.png`;
  const preview = checked<{imagePath: string}>(await PluginCommAPI.generateLassoPreview(path), '导出套索');
  const actual = (preview.imagePath || path).replace(/^file:\/\//, '');
  if (!await RNFS.exists(actual)) { throw new Error('套索图片不可读取，请改用导入截图。'); }
  return actual;
}
