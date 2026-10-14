import React, {useState} from 'react';
import {View, Text, TextInput, Pressable} from 'react-native';
import {PRESETS, ProviderConfig} from '../src/providers';
const field = {borderWidth: 1, borderColor: '#000', color: '#000', padding: 12, marginVertical: 8, fontSize: 18};
export function ProviderSettings({value, onChange, apiKey, onKey, onCommit, saving}: {
  value: ProviderConfig; onChange: (v: ProviderConfig) => void; apiKey: string; onKey: (s: string) => void; onCommit: () => void; saving: string;
}) {
  const [show, setShow] = useState(false), [advanced, setAdvanced] = useState(false);
  return <View>
    <Text style={{color: '#000', fontSize: 22}}>API 密钥与服务商</Text>
    {PRESETS.map(p => <Pressable key={p.preset} style={{borderBottomWidth: 1, padding: 14}} onPress={() => { setShow(false); onChange({...p}); }}>
      <Text style={{color: '#000', fontSize: 18}}>{value.preset === p.preset ? '● ' : '○ '}{p.label}{value.preset === p.preset ? (apiKey ? '  [已填写]' : '  [未配置密钥]') : ''}</Text>
    </Pressable>)}
    <Text style={{color: '#000', marginTop: 16}}>API Key · {apiKey ? '已填写' : '尚未填写'}</Text>
    <TextInput accessibilityLabel="API Key" placeholder="粘贴此服务商的 API Key" placeholderTextColor="#555" style={field} value={apiKey}
      secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} onChangeText={onKey} onBlur={onCommit}/>
    <Pressable onPress={() => setShow(!show)} style={{padding: 12}}><Text style={{color: '#000'}}>{show ? '隐藏密钥' : '显示密钥'}</Text></Pressable>
    <Text style={{color: '#000'}}>{saving} · 密钥在本机加密保存</Text>
    <Pressable onPress={() => setAdvanced(!advanced)} style={{paddingVertical: 16}}><Text style={{color: '#000'}}>接口与模型 {advanced || value.preset === 'custom' ? '▾' : '▸'}</Text></Pressable>
    {(advanced || value.preset === 'custom') && <>
      <Text style={{color: '#000'}}>HTTPS 接口地址</Text>
      <TextInput accessibilityLabel="API 地址" style={field} value={value.endpoint} autoCapitalize="none" autoCorrect={false} onBlur={onCommit}
        onChangeText={endpoint => onChange({...value, endpoint})}/>
      <Text style={{color: '#000'}}>支持图片的模型名称</Text>
      <TextInput accessibilityLabel="模型名" style={field} value={value.model} autoCapitalize="none" autoCorrect={false} onBlur={onCommit}
        onChangeText={model => onChange({...value, model})}/>
    </>}
    <Text style={{color: '#000'}}>设置自动保存。圈选手写后点击套索菜单中的「渲染公式」，会自动把选区图片发送给当前服务商，可能产生 API 费用。确认识别结果后插入排版公式，原手写笔迹保留。</Text>
  </View>;
}
