import {NativeModules} from 'react-native';
import {completionEndpoint} from './providers';
function store() {
  if (!NativeModules.SupernoteMathKeys) { throw new Error('密钥模块未加载，请安装完整的新安装包。'); }
  return NativeModules.SupernoteMathKeys;
}
export const loadKey = (endpoint: string): Promise<string> => store().read(completionEndpoint(endpoint));
export const saveKey = (endpoint: string, key: string): Promise<boolean> => store().write(completionEndpoint(endpoint), key.trim());
