jest.mock('react-native-fs', () => ({ExternalStorageDirectoryPath: '/storage/emulated/0', exists: jest.fn(), readFile: jest.fn(), writeFile: jest.fn()}));
jest.mock('../imageStorage', () => ({getImageDirectory: async () => '/plugin'}));
import RNFS from 'react-native-fs';
import {loadPreferences, savePreferences, DEFAULT_PREFERENCES} from '../preferences';
beforeEach(() => jest.resetAllMocks());
test('new preferences contain no handwriting deletion setting', async () => {
  (RNFS.exists as jest.Mock).mockResolvedValue(false);
  expect(await loadPreferences()).not.toHaveProperty('deleteHandwriting');
});
test('legacy enabled deletion setting is ignored and omitted when saved', async () => {
  (RNFS.exists as jest.Mock).mockResolvedValue(true);
  (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify({...DEFAULT_PREFERENCES, deleteHandwriting: true}));
  const prefs = await loadPreferences();
  expect(prefs).not.toHaveProperty('deleteHandwriting');
  await savePreferences(prefs);
  expect((RNFS.writeFile as jest.Mock).mock.calls[0][1]).not.toContain('deleteHandwriting');
});

test('legacy image deletion is ignored and stripped on saving', async () => {
  (RNFS.exists as jest.Mock).mockResolvedValue(true);
  (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify({...DEFAULT_PREFERENCES, deleteAfterInsert: true}));
  const prefs = await loadPreferences();
  expect(prefs).not.toHaveProperty('deleteAfterInsert');
  await savePreferences({...prefs, deleteAfterInsert: true} as typeof prefs);
  expect(JSON.parse((RNFS.writeFile as jest.Mock).mock.calls[0][1])).toEqual(DEFAULT_PREFERENCES);
});
