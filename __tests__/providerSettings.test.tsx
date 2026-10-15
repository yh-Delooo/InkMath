import React from 'react';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {Alert, Clipboard, Pressable, TextInput} from 'react-native';
import {ProviderSettings} from '../components/ProviderSettings';
import {InputFocusContext} from '../components/KeyboardPage';
import {PRESETS} from '../src/providers';
let app: ReactTestRenderer;
const onKey = jest.fn(), onChange = jest.fn(), onCommit = jest.fn(), focus = jest.fn();
const props = {value: PRESETS[0], onKey, onChange, onCommit, apiKey: 'existing', saving: ''};
const render = (override = {}) => <InputFocusContext.Provider value={focus}><ProviderSettings {...props} {...override}/></InputFocusContext.Provider>;
const paste = () => app.root.findAllByType(Pressable).find(n => n.props.accessibilityLabel === '粘贴 API Key')!.props.onPress();
beforeEach(async () => {
  jest.clearAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Clipboard, 'getString').mockResolvedValue('  new-key\n');
  await act(async () => { app = create(render()); });
});
afterEach(async () => { await act(async () => app.unmount()); jest.restoreAllMocks(); });

test('reads clipboard only on explicit paste, trims edges and updates via normal save path', async () => {
  expect(Clipboard.getString).not.toHaveBeenCalled();
  const input = app.root.findByType(TextInput);
  expect(input.props.contextMenuHidden).toBe(false);
  expect(input.props.secureTextEntry).toBe(true);
  await act(async () => paste());
  expect(onKey).toHaveBeenCalledWith('new-key');
});

test.each(['', '   ', 'key with spaces', 'key\nother'])('invalid clipboard preserves existing key: %#', async text => {
  (Clipboard.getString as jest.Mock).mockResolvedValue(text);
  await act(async () => paste());
  expect(onKey).not.toHaveBeenCalled(); expect(Alert.alert).toHaveBeenCalled();
});

test('clipboard failure is handled without echoing sensitive native error details', async () => {
  (Clipboard.getString as jest.Mock).mockRejectedValue(Error('secret-value'));
  await act(async () => paste());
  expect(onKey).not.toHaveBeenCalled();
  expect(JSON.stringify((Alert.alert as jest.Mock).mock.calls)).not.toContain('secret-value');
});

test('switching providers while clipboard is pending cannot set the other provider key', async () => {
  let finish!: (value: string) => void;
  (Clipboard.getString as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => paste());
  await act(async () => app.update(render({value: PRESETS[1]})));
  await act(async () => finish('wrong-provider-key'));
  expect(onKey).not.toHaveBeenCalled();
});

test('all API fields request keyboard visibility on focus', async () => {
  await act(async () => app.update(render({value: {...PRESETS[0], preset: 'custom'}})));
  for (const input of app.root.findAllByType(TextInput)) {
    input.props.onFocus({nativeEvent: {target: 42}});
  }
  expect(focus).toHaveBeenCalledTimes(3);
  expect(focus).toHaveBeenCalledWith(42);
});
