import React from 'react';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {Text} from 'react-native';
jest.mock('sn-plugin-lib', () => ({PluginManager: {
  hasPermission: jest.fn(async () => 1), requestPermission: jest.fn(),
  registerButtonListener: jest.fn(() => ({remove: jest.fn()})), closePluginView: jest.fn(),
}}));
jest.mock('react-native-fs', () => ({stat: jest.fn(async () => ({size: 100})), readFile: jest.fn(async () => 'abc')}));
jest.mock('react-native-view-shot', () => 'ViewShot');
jest.mock('react-native-svg', () => ({SvgXml: 'SvgXml'}));
jest.mock('../components/FilePicker', () => ({FilePicker: () => null}));
jest.mock('../components/OcrCrop', () => ({OcrCrop: () => null}));
jest.mock('../components/ProviderSettings', () => ({ProviderSettings: () => null}));
jest.mock('../permissions', () => ({ensureFilePermissions: async () => {}}));
jest.mock('../preferences', () => ({DEFAULT_PREFERENCES: {}, loadPreferences: async () => ({}), savePreferences: jest.fn()}));
jest.mock('../src/storage', () => ({loadHistory: async () => []}));
jest.mock('../src/keyStorage', () => ({loadKey: async () => 'test-key'}));
jest.mock('../src/providerStorage', () => ({loadProvider: async () => ({preset: 'deepseek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash', vision: true})}));
jest.mock('../src/render', () => ({renderEquation: () => ({svg: '<svg/>', aspect: 1})}));
import App from '../App';
import {FilePicker} from '../components/FilePicker';

let app: ReactTestRenderer;
const originalFetch = global.fetch;
const button = (title: string) => app.root.findAll(n => typeof n.type === 'function' && n.props.title === title)[0];
const screenText = () => app.root.findAllByType(Text).map(n => n.props.children).join(' ');
beforeEach(async () => { await act(async () => { app = create(<App/>); }); });
afterEach(async () => { await act(async () => app.unmount()); global.fetch = originalFetch; });

test('image tab has upload only, with 2:1 return/cancel controls', async () => {
  expect(button('返回笔记').parent?.props.style.flex).toBe(2);
  expect(button('取消识别').parent?.props.style.flex).toBe(1);
  expect(button('取消识别').props.inverted).toBe(true);
  expect(button('取消识别').props.disabled).toBe(true);
  await act(async () => button('图片识别').props.onPress());
  expect(button('选择图片')).toBeTruthy();
  expect(button('识别当前套索')).toBeUndefined();
  expect(screenText()).not.toContain('删除');
});

test('cancel releases controls and a late response cannot replace the formula', async () => {
  let finish!: (value: any) => void;
  global.fetch = jest.fn(() => new Promise(resolve => { finish = resolve; })) as typeof fetch;
  await act(async () => button('图片识别').props.onPress());
  await act(async () => button('选择图片').props.onPress());
  await act(async () => app.root.findByType(FilePicker).props.onSelect('/image.png'));
  await act(async () => { void button('上传预览图片并识别').props.onPress(); });
  expect(screenText()).toContain('40%');
  expect(button('取消识别').props.disabled).toBe(false);
  await act(async () => button('取消识别').props.onPress());
  expect(button('返回笔记').props.disabled).toBe(false);
  expect(screenText()).toContain('已取消识别');
  const json = jest.fn(async () => ({choices: [{finish_reason: 'stop', message: {content: '{"latex":"late","uncertainty":""}'}}]}));
  await act(async () => finish({ok: true, json}));
  expect(json).not.toHaveBeenCalled();
  expect(screenText()).toContain('已取消识别');
});
