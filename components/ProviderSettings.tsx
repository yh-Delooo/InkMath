import React, {useContext, useEffect, useRef, useState} from 'react';
import {View, Text, TextInput, Pressable, Clipboard, Alert} from 'react-native';
import {InputFocusContext} from './KeyboardPage';
import {PRESETS, ProviderConfig} from '../src/providers';
const field = {borderWidth: 1, borderColor: '#000', color: '#000', padding: 12, marginVertical: 8, fontSize: 18};
export function ProviderSettings({value, onChange, apiKey, onKey, onCommit, saving}: {
  value: ProviderConfig; onChange: (v: ProviderConfig) => void; apiKey: string; onKey: (s: string) => void; onCommit: () => void; saving: string;
}) {
  const [show, setShow] = useState(false), [advanced, setAdvanced] = useState(false);
  const focusInput = useContext(InputFocusContext);
  const input = useRef<TextInput>(null), pending = useRef(false), mounted = useRef(true);
  const latest = useRef({endpoint: value.endpoint, preset: value.preset, key: apiKey});
  latest.current = {endpoint: value.endpoint, preset: value.preset, key: apiKey};
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const paste = async () => {
    if (pending.current) { return; }
    pending.current = true;
    const started = latest.current;
    try {
      const text = await Clipboard.getString();
      if (!mounted.current || latest.current.endpoint !== started.endpoint || latest.current.preset !== started.preset || latest.current.key !== started.key) { return; }
      const key = text.trim();
      if (!key || key === 'null') { Alert.alert('无法粘贴', '剪贴板没有文字，请先复制 API Key。'); return; }
      if (/\s/.test(key)) { Alert.alert('无法粘贴', '复制的内容包含空格或换行，请只复制 API Key。'); return; }
      onKey(key);
      input.current?.focus();
    } catch {
      if (mounted.current) { Alert.alert('无法读取剪贴板', '可点“显示密钥”后，在输入框内长按粘贴，或使用键盘的粘贴功能。'); }
    } finally { pending.current = false; }
  };
  return <View>
    <Text style={{color: '#000', fontSize: 22}}>API 密钥与服务商</Text>
    {PRESETS.map(p => <Pressable key={p.preset} style={{borderBottomWidth: 1, padding: 14}} onPress={() => { setShow(false); onChange({...p}); }}>
      <Text style={{color: '#000', fontSize: 18}}>{value.preset === p.preset ? '● ' : '○ '}{p.label}{value.preset === p.preset ? (apiKey ? '  [已填写]' : '  [未配置密钥]') : ''}</Text>
    </Pressable>)}
    <Text style={{color: '#000', marginTop: 16}}>API Key · {apiKey ? '已填写' : '尚未填写'}</Text>
    <View style={{flexDirection: 'row', alignItems: 'stretch', gap: 8}}>
      <TextInput ref={input} accessibilityLabel="API Key" placeholder="粘贴此服务商的 API Key" placeholderTextColor="#555"
        style={[field, {flex: 1, minWidth: 0, minHeight: 48}]} value={apiKey}
        secureTextEntry={!show} contextMenuHidden={false} autoComplete="off" importantForAutofill="no"
        onFocus={event => focusInput(event.nativeEvent.target)} autoCapitalize="none" autoCorrect={false} onChangeText={onKey} onBlur={onCommit}/>
      <Pressable accessibilityRole="button" accessibilityLabel="粘贴 API Key" onPress={() => { void paste(); }}
        style={{borderWidth: 1, borderColor: '#000', paddingHorizontal: 8, marginVertical: 8, minHeight: 48, flexShrink: 0, justifyContent: 'center'}}>
        <Text style={{color: '#000', fontSize: 17}}>粘贴</Text>
      </Pressable>
    </View>
    <Pressable accessibilityRole="button" onPress={() => setShow(!show)} style={{padding: 12, minHeight: 48}}>
      <Text style={{color: '#000'}}>{show ? '隐藏密钥' : '显示密钥'}</Text>
    </Pressable>
    <Text style={{color: '#000'}}>{saving} · 密钥在本机加密保存</Text>
    <Pressable onPress={() => setAdvanced(!advanced)} style={{paddingVertical: 16}}><Text style={{color: '#000'}}>接口与模型 {advanced || value.preset === 'custom' ? '▾' : '▸'}</Text></Pressable>
    {(advanced || value.preset === 'custom') && <>
      <Text style={{color: '#000'}}>HTTPS 接口地址</Text>
      <TextInput onFocus={event => focusInput(event.nativeEvent.target)} contextMenuHidden={false} accessibilityLabel="API 地址" style={field} value={value.endpoint} autoCapitalize="none" autoCorrect={false} onBlur={onCommit}
        onChangeText={endpoint => onChange({...value, endpoint})}/>
      <Text style={{color: '#000'}}>支持图片的模型名称</Text>
      <TextInput onFocus={event => focusInput(event.nativeEvent.target)} contextMenuHidden={false} accessibilityLabel="模型名" style={field} value={value.model} autoCapitalize="none" autoCorrect={false} onBlur={onCommit}
        onChangeText={model => onChange({...value, model})}/>
    </>}
    <Text style={{color: '#000'}}>设置自动保存。圈选手写后点击套索菜单中的「渲染公式」，会自动把选区图片发送给当前服务商，可能产生 API 费用。确认识别结果后插入排版公式，原手写笔迹保留。</Text>
  </View>;
}
