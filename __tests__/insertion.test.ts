jest.mock('react-native-fs', () => ({unlink: jest.fn()}));
jest.mock('sn-plugin-lib', () => ({PluginNoteAPI: {insertImage: jest.fn()}}));
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
