jest.mock('react-native-fs', () => ({stat: jest.fn(), unlink: jest.fn(), ExternalStorageDirectoryPath: '/storage/emulated/0'}));
jest.mock('sn-plugin-lib', () => ({PluginNoteAPI: {insertImage: jest.fn()}}));
jest.mock('../permissions', () => ({requestDeletePermission: jest.fn()}));
import RNFS from 'react-native-fs';
import {PluginNoteAPI} from 'sn-plugin-lib';
import {requestDeletePermission} from '../permissions';
import {insertImageWithCleanup} from '../insertImage';
const stat = {size: 24, mtime: new Date(1000), isFile: () => true};
beforeEach(() => {
  jest.resetAllMocks();
  (RNFS.stat as jest.Mock).mockResolvedValue(stat);
  (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({success: true, result: true});
  (requestDeletePermission as jest.Mock).mockResolvedValue(true);
});
test('failed insertion never deletes original', async () => {
  (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({success: true, result: false});
  await expect(insertImageWithCleanup('/processed.png', '/storage/emulated/0/SCREENSHOT/a.png', true)).rejects.toThrow();
  expect(RNFS.unlink).not.toHaveBeenCalled();
});
test('ambiguous acknowledgment never deletes original', async () => {
  (PluginNoteAPI.insertImage as jest.Mock).mockResolvedValue({success: true});
  await expect(insertImageWithCleanup('/processed.png', '/storage/emulated/0/SCREENSHOT/a.png', true)).rejects.toThrow();
  expect(RNFS.unlink).not.toHaveBeenCalled();
});
test('auto-delete off never requests deletion', async () => {
  await insertImageWithCleanup('/processed.png', '/storage/emulated/0/SCREENSHOT/a.png', false);
  expect(requestDeletePermission).not.toHaveBeenCalled(); expect(RNFS.unlink).not.toHaveBeenCalled();
});
test('deletes only after acknowledged insertion and unchanged source', async () => {
  await insertImageWithCleanup('/processed.png', '/storage/emulated/0/SCREENSHOT/a.png', true);
  expect(RNFS.unlink).toHaveBeenCalledWith('/storage/emulated/0/SCREENSHOT/a.png');
  expect((PluginNoteAPI.insertImage as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((RNFS.unlink as jest.Mock).mock.invocationCallOrder[0]);
});
test('changed source produces cleanup warning, not an insertion failure', async () => {
  (RNFS.stat as jest.Mock).mockResolvedValueOnce(stat).mockResolvedValueOnce({...stat, size: 25});
  const result = await insertImageWithCleanup('/processed.png', '/storage/emulated/0/SCREENSHOT/a.png', true);
  expect(result.cleanupWarning).toBeTruthy(); expect(RNFS.unlink).not.toHaveBeenCalled();
});
test('denied delete permission preserves original', async () => {
  (requestDeletePermission as jest.Mock).mockResolvedValue(false);
  const result = await insertImageWithCleanup('/processed.png', '/storage/emulated/0/SCREENSHOT/a.png', true);
  expect(result.cleanupWarning).toBeTruthy(); expect(RNFS.unlink).not.toHaveBeenCalled();
});
