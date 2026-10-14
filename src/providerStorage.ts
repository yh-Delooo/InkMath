import RNFS from 'react-native-fs';
import {getImageDirectory} from '../imageStorage';
import {completionEndpoint, DEFAULT_PROVIDER, ProviderConfig} from './providers';
export async function loadProvider(): Promise<ProviderConfig> {
  const file = `${await getImageDirectory()}/provider.json`;
  if (!await RNFS.exists(file)) { return {...DEFAULT_PROVIDER}; }
  try {
    const value = JSON.parse(await RNFS.readFile(file, 'utf8'));
    return {preset: typeof value.preset === 'string' ? value.preset : 'custom',
      endpoint: completionEndpoint(value.endpoint), model: typeof value.model === 'string' ? value.model : '', vision: value.vision === true};
  } catch { return {...DEFAULT_PROVIDER}; }
}
export async function saveProvider(value: ProviderConfig) {
  // Explicit allowlist: never serialize the API key, even if passed extra properties.
  await RNFS.writeFile(`${await getImageDirectory()}/provider.json`, JSON.stringify({
    preset: value.preset, endpoint: completionEndpoint(value.endpoint), model: value.model.trim(), vision: value.vision,
  }), 'utf8');
}
