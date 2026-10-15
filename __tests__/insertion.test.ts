jest.mock('react-native-fs', () => ({ExternalStorageDirectoryPath: '/storage/emulated/0', unlink: jest.fn(), stat: jest.fn(), hash: jest.fn()}));
jest.mock('sn-plugin-lib', () => ({PluginNoteAPI: {insertImage: jest.fn(), saveCurrentNote: jest.fn()}}));
jest.mock('../permissions', () => ({requestDeletePermission: jest.fn(async () => true)}));
import {requestDeletePermission} from '../permissions';
import RNFS from 'react-native-fs';
import {PluginNoteAPI} from 'sn-plugin-lib';
import {insertImage} from '../insertImage';
beforeEach(() => jest.resetAllMocks());

test.each([{success: true, result: false}, {success: true}, null])('rejects failed or ambiguous insertion %#', async response => {
  (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue(response);
  await expect(insertImage('/processed.png')).rejects.toThrow();
  expect(RNFS.unlink).not.toHaveBeenCalled();
});

test('successful insertion preserves original files', async () => {
  (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({success: true, result: true});
  await expect(insertImage('/processed.png')).resolves.toEqual({});
  expect(PluginNoteAPI.insertImage).toHaveBeenCalledWith('/processed.png');
  expect(RNFS.unlink).not.toHaveBeenCalled();
});

const original = {path: '/storage/emulated/0/SCREENSHOT/formula.png', hash: 'original-hash'};
function successfulInsert() {
  (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({success: true, result: true});
  (PluginNoteAPI.saveCurrentNote as jest.Mock).mockResolvedValue({success: true, result: true});
  (requestDeletePermission as jest.Mock).mockResolvedValue(true);
  (RNFS.stat as jest.Mock).mockResolvedValue({isFile: () => true});
  (RNFS.hash as jest.Mock).mockResolvedValue(original.hash);
}
test('deletes only the selected original after confirmed insertion and saving', async () => {
  successfulInsert();
  expect(await insertImage('/processed.png', original)).toEqual({});
  expect(RNFS.unlink).toHaveBeenCalledWith(original.path);
});
test.each(['insert', 'save', 'permission', 'changed', 'directory', 'outside'])('preserves original when %s fails', async reason => {
  successfulInsert();
  if (reason === 'insert') { (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({success: false}); }
  if (reason === 'save') { (PluginNoteAPI.saveCurrentNote as jest.Mock).mockResolvedValue({success: false}); }
  if (reason === 'permission') { (requestDeletePermission as jest.Mock).mockResolvedValue(false); }
  if (reason === 'changed') { (RNFS.hash as jest.Mock).mockResolvedValue('new-hash'); }
  if (reason === 'directory') { (RNFS.stat as jest.Mock).mockResolvedValue({isFile: () => false}); }
  const source = reason === 'outside' ? {...original, path: '/private/file.png'} : original;
  if (reason === 'insert') { await expect(insertImage('/processed.png', source)).rejects.toThrow(); }
  else { expect((await insertImage('/processed.png', source)).warning).toContain('原图片未删除'); }
  expect(RNFS.unlink).not.toHaveBeenCalled();
});
