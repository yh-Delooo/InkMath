jest.mock('react-native', () => ({NativeModules: {SupernoteMathKeys: {read: jest.fn(), write: jest.fn()}}}));
import {NativeModules} from 'react-native';
import {loadKey, saveKey} from '../src/keyStorage';
test('keys use canonical endpoint as isolated encryption scope', async () => {
  await saveKey('https://example.com/v1', '  secret  ');
  expect(NativeModules.SupernoteMathKeys.write).toHaveBeenCalledWith('https://example.com/v1/chat/completions', 'secret');
  await loadKey('https://other.com/v1');
  expect(NativeModules.SupernoteMathKeys.read).toHaveBeenCalledWith('https://other.com/v1/chat/completions');
});
test('rejects insecure endpoints before reaching key store', async () => {
  expect(() => saveKey('http://example.com', 'secret')).toThrow();
});
