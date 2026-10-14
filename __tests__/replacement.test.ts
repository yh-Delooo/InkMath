jest.mock('react-native-fs', () => ({copyFile: jest.fn(), hash: jest.fn(), exists: jest.fn()}));
jest.mock('sn-plugin-lib', () => ({
  PluginCommAPI: {getLassoElements: jest.fn(), getLassoRect: jest.fn(), getCurrentFilePath: jest.fn(), getCurrentPageNum: jest.fn(), createElement: jest.fn(), insertPageElements: jest.fn(), deletePageElements: jest.fn()},
  PluginFileAPI: {getElements: jest.fn()}, PluginNoteAPI: {saveCurrentNote: jest.fn(), insertImage: jest.fn()},
}));
jest.mock('../imageStorage', () => ({getImageDirectory: async () => '/plugin'}));
jest.mock('../src/storage', () => ({checked: (r: any) => { if (!r?.success || r.result == null || r.result === false) { throw Error('failed'); } return r.result; }, exportSelection: async () => '/selection.png'}));
import RNFS from 'react-native-fs';
import {PluginCommAPI as C, PluginFileAPI as F, PluginNoteAPI as N} from 'sn-plugin-lib';
import {captureHandwriting, insertRecognizedFormula, strokeIds} from '../src/replacement';
const ok = (result: any) => ({success: true, result});
const strokes = [{type: 0, numInPage: 1, pageNum: 0, layerNum: 0}];
beforeEach(() => {
  jest.resetAllMocks();
  (C.getLassoElements as jest.Mock).mockResolvedValue(ok(strokes));
  (C.getLassoRect as jest.Mock).mockResolvedValue(ok({left: 10, top: 20, right: 110, bottom: 120}));
  (C.getCurrentFilePath as jest.Mock).mockResolvedValue(ok('/test.note'));
  (C.getCurrentPageNum as jest.Mock).mockResolvedValue(ok(0));
  (C.createElement as jest.Mock).mockResolvedValue(ok({uuid: 'native-id'}));
  (N.insertImage as jest.Mock).mockResolvedValue(ok(true));
  (C.deletePageElements as jest.Mock).mockResolvedValue(ok(true));
  (N.saveCurrentNote as jest.Mock).mockResolvedValue(ok(true));
  (RNFS.hash as jest.Mock).mockResolvedValue('hash');
  (RNFS.exists as jest.Mock).mockResolvedValue(true);
  (F.getElements as jest.Mock).mockResolvedValue(ok([...strokes, {type: 200, layerNum: 0, picture: {picturePath: '/formula.png'}}]));
});
test('rejects mixed, empty, cross-layer and duplicate selections', () => {
  for (const list of [[], [{...strokes[0], type: 200}], [...strokes, {...strokes[0], layerNum: 1}], [...strokes, ...strokes]]) {
    expect(() => strokeIds(list)).toThrow();
  }
});
test('successful insertion preserves handwriting and creates no backup', async () => {
  expect(await insertRecognizedFormula(await captureHandwriting(), '/formula.png')).toBe('');
  expect(N.insertImage).toHaveBeenCalledWith('/formula.png');
  expect(C.deletePageElements).not.toHaveBeenCalled();
  expect(RNFS.copyFile).not.toHaveBeenCalled();
});
test('changed page prevents insertion', async () => {
  const s = await captureHandwriting(); (C.getCurrentPageNum as jest.Mock).mockResolvedValue(ok(1));
  await expect(insertRecognizedFormula(s, '/formula.png')).rejects.toThrow();
  expect(N.insertImage).not.toHaveBeenCalled(); expect(C.deletePageElements).not.toHaveBeenCalled();
});
test('failed insertion preserves handwriting', async () => {
  (N.insertImage as jest.Mock).mockResolvedValue(ok(false));
  await expect(insertRecognizedFormula(await captureHandwriting(), '/formula.png')).rejects.toThrow();
  expect(C.deletePageElements).not.toHaveBeenCalled();
});
test('save failure warns without deleting or suggesting duplicate insertion', async () => {
  (N.saveCurrentNote as jest.Mock).mockResolvedValue(ok(false));
  expect(await insertRecognizedFormula(await captureHandwriting(), '/formula.png')).toContain('勿重复插入');
  expect(C.deletePageElements).not.toHaveBeenCalled();
});

test('confirmation inserts after host lasso action expires', async () => {
  const selection = await captureHandwriting();
  (C.getLassoElements as jest.Mock).mockClear().mockRejectedValue(Error('cannot call API NO lasso Action has been performed'));
  (C.getLassoRect as jest.Mock).mockClear().mockRejectedValue(Error('NO lasso Action'));
  expect(await insertRecognizedFormula(selection, '/formula.png')).toBe('');
  expect(C.getLassoElements).not.toHaveBeenCalled();
  expect(C.getLassoRect).not.toHaveBeenCalled();
  expect(N.insertImage).toHaveBeenCalledTimes(1);
  expect(C.deletePageElements).not.toHaveBeenCalled();
});
test('changed note still prevents insertion without a live lasso', async () => {
  const selection = await captureHandwriting();
  (C.getCurrentFilePath as jest.Mock).mockResolvedValue(ok('/other.note'));
  await expect(insertRecognizedFormula(selection, '/formula.png')).rejects.toThrow('笔记或页面已经变化');
  expect(N.insertImage).not.toHaveBeenCalled();
});
