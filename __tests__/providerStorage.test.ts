jest.mock('react-native-fs', () => ({writeFile: jest.fn(), readFile: jest.fn(), exists: jest.fn()}));
jest.mock('../imageStorage', () => ({getImageDirectory: async () => '/plugin/supernote-math-llm'}));
import RNFS from 'react-native-fs';
import {loadProvider, saveProvider} from '../src/providerStorage';
import {PRESETS} from '../src/providers';
beforeEach(() => jest.resetAllMocks());
test('persists only the non-secret fields, even if extra credentials are provided', async () => {
  await saveProvider({...PRESETS[0], apiKey: 'must-not-persist'} as any);
  const stored = (RNFS.writeFile as jest.Mock).mock.calls[0][1];
  expect(stored).not.toContain('must-not-persist');
  expect(Object.keys(JSON.parse(stored)).sort()).toEqual(['endpoint', 'model', 'preset', 'vision']);
});
test('custom image endpoint and model survive reopening', async () => {
  const custom = {preset: 'custom', endpoint: 'https://custom.example/v1/chat/completions', model: 'my-vision-model', vision: true};
  (RNFS.exists as jest.Mock).mockResolvedValue(true);
  (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(custom));
  expect(await loadProvider()).toEqual(custom);
});
