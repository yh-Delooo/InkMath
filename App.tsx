import React, {useEffect, useRef, useState} from 'react';
import {View, Text, TextInput, Pressable, ScrollView, Alert, useWindowDimensions} from 'react-native';
import {SvgXml} from 'react-native-svg';
import ViewShot, {ViewShotRef} from 'react-native-view-shot';
import RNFS from 'react-native-fs';
import {PluginManager} from 'sn-plugin-lib';
import {FilePicker} from './components/FilePicker';
import {OcrCrop} from './components/OcrCrop';
import {ensureFilePermissions, requestDeletePermission} from './permissions';
import {DEFAULT_PREFERENCES, loadPreferences, savePreferences, Preferences} from './preferences';
import {insertImage, ImportedImage} from './insertImage';
import {renderEquation} from './src/render';
import {latexToExpression, plotSvg, plotLayout, Range} from './src/math';
import {transcribe} from './src/llm';
import {abortable, RecognitionCancelled} from './src/cancellation';
import {DEFAULT_PROVIDER, ProviderConfig} from './src/providers';
import {loadKey, saveKey} from './src/keyStorage';
import {captureHandwriting, insertRecognizedFormula, Selection} from './src/replacement';
import {loadProvider, saveProvider} from './src/providerStorage';
import {ProviderSettings} from './components/ProviderSettings';
import {KeyboardPage} from './components/KeyboardPage';
import {FormulaRecord} from './src/history';
import {loadHistory, savePng, saveRecord} from './src/storage';

type Preview = {svg: string; aspect: number; kind: 'equation' | 'plot'; latex: string; revision: number};
function Button({title, onPress, disabled = false, inverted = false}: {title: string; onPress: () => void; disabled?: boolean; inverted?: boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={{backgroundColor: inverted ? '#000' : '#fff', borderWidth: 2, borderColor: '#000', padding: 12, marginVertical: 5, minHeight: 48, opacity: disabled ? 0.4 : 1}}>
    <Text style={{color: inverted ? '#fff' : '#000', fontSize: 17, textAlign: 'center'}}>{title}</Text></Pressable>;
}
const inputStyle = {borderWidth: 1, borderColor: '#000', color: '#000', padding: 10, marginVertical: 6, fontSize: 18};
export default function App() {
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const recognition = useRef<AbortController | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const lock = useRef(false), serial = useRef(0), revision = useRef(0);
  const [tab, setTab] = useState<'equation' | 'plot' | 'ocr' | 'history' | 'settings'>('settings');
  const [latex, setLatex] = useState('y=\\frac{x^{2}+1}{2}');
  const [expression, setExpression] = useState('(x^2+1)/2');
  const [unit, setUnit] = useState('1');
  const [range, setRange] = useState({xmin: '-5', xmax: '5', ymin: '-5', ymax: '5'});
  const [preview, setPreview] = useState<Preview | null>(null), [laidOut, setLaidOut] = useState(false);
  const [status, setStatus] = useState('正在读取设置…'), [picker, setPicker] = useState(false);
  const [ocrPath, setOcrPath] = useState('');
  const [importedImage, setImportedImage] = useState<ImportedImage | null>(null);
  const [recognizedImage, setRecognizedImage] = useState<ImportedImage | null>(null);
  const [provider, setProvider] = useState<ProviderConfig>({...DEFAULT_PROVIDER}), [appKey, setAppKey] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [records, setRecords] = useState<FormulaRecord[]>([]);
  const [prefs, setPrefs] = useState<Preferences>({...DEFAULT_PREFERENCES});
  const selection = useRef<Selection | null>(null);
  const settingsRef = useRef({provider: {...DEFAULT_PROVIDER}, key: ''});
  const pendingSave = useRef<Promise<void>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRevision = useRef(0);
  const [saveStatus, setSaveStatus] = useState('');
  const persistSettings = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const value = {...settingsRef.current, provider: {...settingsRef.current.provider}};
    pendingSave.current = pendingSave.current.catch(() => {}).then(async () => {
      await saveKey(value.provider.endpoint, value.key); await saveProvider(value.provider); setSaveStatus('已自动保存');
    }).catch(e => { setSaveStatus('保存失败，请检查接口地址'); throw e; });
    return pendingSave.current;
  };
  const scheduleSave = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); }
    setSaveStatus('正在保存…'); saveTimer.current = setTimeout(() => { void persistSettings().catch(() => {}); }, 700);
  };
  const changeProvider = (next: ProviderConfig) => {
    const keyTicket = ++keyRevision.current;
    const changed = settingsRef.current.provider.endpoint !== next.endpoint;
    if (saveTimer.current) { void persistSettings().catch(() => {}); }
    settingsRef.current = {provider: next, key: changed ? '' : settingsRef.current.key};
    setProvider(next); setAppKey(settingsRef.current.key);
    if (changed && next.endpoint) { void pendingSave.current.catch(() => {}).then(() => loadKey(next.endpoint)).then(key => {
      if (keyRevision.current === keyTicket && settingsRef.current.provider.endpoint === next.endpoint) { settingsRef.current.key = key; setAppKey(key); scheduleSave(); }
    }).catch(() => scheduleSave()); } else { scheduleSave(); }
  };
  const changeKey = (key: string) => { keyRevision.current++; settingsRef.current.key = key; setAppKey(key); scheduleSave(); };
  const shot = useRef<ViewShotRef>(null), window = useWindowDimensions();
  const error = (e: unknown) => Alert.alert('InkMath', e instanceof Error ? e.message : String(e));
  const invalidate = () => { revision.current++; setPreview(null); setLaidOut(false); };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) { return; } lock.current = true; setBusy(true);
    try { await action(); } catch (e) { error(e); } finally { lock.current = false; setBusy(false); }
  };
  const openEntry = async (lasso: boolean, plotOnly = false) => {
    const ticket = ++serial.current; selection.current = null; invalidate(); setPicker(false); setOcrPath(''); setImportedImage(null); setRecognizedImage(null); setAppKey('');
    try {
      await ensureFilePermissions();
      const preferences = await loadPreferences(), history = await loadHistory(), savedProvider = await loadProvider();
      if (ticket !== serial.current) { return; }
      let key = '';
      try { key = await loadKey(savedProvider.endpoint); } catch (e) { error(e); }
      if (ticket !== serial.current) { return; }
      settingsRef.current = {provider: savedProvider, key}; setAppKey(key);
      const apiConfigured = !!(key.trim() && savedProvider.endpoint.trim() && savedProvider.model.trim() && savedProvider.vision);
      setPrefs(preferences); setRecords(history); setSelectedRecordId(history[0]?.id || ''); setProvider(savedProvider);
      setTab(lasso ? (plotOnly ? 'plot' : apiConfigured ? 'equation' : 'settings') : 'settings');
      if (lasso && !plotOnly && apiConfigured) { setLatex(''); setStatus('正在读取手写选区…'); }
      setReady(true);
      if (!lasso) { setTab('settings'); setStatus('配置 API 后返回笔记，圈选手写并点击“渲染公式”。'); return; }
      if (plotOnly) { setTab('history'); setStatus('请选择要绘图的公式。'); return; }
      const selected = await captureHandwriting();
      if (ticket !== serial.current) { return; }
      selection.current = selected; setOcrPath(selected.image);
      if (!apiConfigured) { setTab('settings'); setStatus('请先配置接口地址、模型和 API Key，然后返回笔记重新圈选。'); return; }
      await run(() => recognizePath(selected.image, savedProvider, key));
    } catch (e) { if (ticket === serial.current) { setStatus('初始化失败，可点击重试。'); error(e); } }
  };
  useEffect(() => {
    let received = false;
    const sub = PluginManager.registerButtonListener({onButtonPress: event => {
      received = true; if (!lock.current) { void openEntry(event.id === 200 || event.id === 201, event.id === 201); }
    }});
    if (!received) { void openEntry(false); }
    return () => { serial.current++; recognition.current?.abort(); if (saveTimer.current) { void persistSettings().catch(() => {}); } sub.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const updatePrefs = (change: Partial<Preferences>) => run(async () => {
    if (change.deleteImportedImageAfterInsert && !await requestDeletePermission()) { throw new Error('未获得删除权限，选项保持关闭。'); }
    const next = {...prefs, ...change}; await savePreferences(next); setPrefs(next);
  });
  const chooseFormula = (r: FormulaRecord) => {
    invalidate(); selection.current = null; setRecognizedImage(null); setLatex(r.latex);
    try { setExpression(latexToExpression(r.latex)); setTab('plot'); setStatus('已选择公式，请生成图像并检查范围。'); }
    catch (e) { setTab('equation'); error(e); }
  };
  const makePreview = () => {
    invalidate();
    try {
      if (tab === 'plot') {
        const r: Range = {xmin: Number(range.xmin), xmax: Number(range.xmax), ymin: Number(range.ymin), ymax: Number(range.ymax)};
        if (Object.values(range).some(v => !v.trim())) { throw new Error('请填完坐标范围。'); }
        const layout = plotLayout(r, Number(unit));
        setPreview({svg: plotSvg(expression, r, Number(unit)), aspect: layout.width / layout.height, kind: 'plot', latex, revision: revision.current});
      } else { setPreview({...renderEquation(latex), kind: 'equation', latex, revision: revision.current}); }
    } catch (e) { error(e); }
  };
  const insert = () => run(async () => {
    if (!preview || !laidOut || preview.revision !== revision.current || !shot.current?.capture) { throw new Error('请先生成并检查预览。'); }
    const saved = preview; await ensureFilePermissions();
    const path = await savePng(await shot.current.capture()), hash = await RNFS.hash(path, 'sha256');
    const handwriting = saved.kind === 'equation' && selection.current;
    const result = handwriting ? await insertRecognizedFormula(handwriting, path, previewWidth / (previewWidth / saved.aspect + 24))
      : await insertImage(path, saved.kind === 'equation' && prefs.deleteImportedImageAfterInsert ? recognizedImage : null);
    selection.current = null;
    // Insertion already committed: a history failure must never invite a second insertion.
    invalidate(); setOcrPath(''); setImportedImage(null); setRecognizedImage(null);
    let warning = result.warning || '';
    if (saved.kind === 'equation' && (!handwriting || !warning)) {
      try {
        await saveRecord({id: path, path, hash, latex: saved.latex, created: Date.now()}); const updated = await loadHistory(); setRecords(updated); setSelectedRecordId(updated[0]?.id || ''); }
      catch { warning += '\n公式已插入，但本地记录保存失败，之后可能需要重新识别。'; }
    }
    if (handwriting && !warning) { PluginManager.closePluginView(); return; }
    Alert.alert(warning ? '请检查笔记' : '已插入笔记', warning || '返回笔记后可移动、缩放；再次圈选公式可点“一键绘图”。',
      [{text: '返回笔记', onPress: () => PluginManager.closePluginView()}, {text: '继续'}]);
  });
  const recognizePath = async (imagePath: string, config: ProviderConfig, key: string, original: ImportedImage | null = null) => {
    setRecognizedImage(null);
    const controller = new AbortController();
    recognition.current = controller; setRecognizing(true);
    const step = <T,>(action: () => Promise<T>) => abortable(action, controller.signal);
    try {
      setStatus('10%……');
      const permission = 'plugin.permission.INTERNET';
      if (await step(() => PluginManager.hasPermission(permission)) !== 1) {
        const granted = await step(() => PluginManager.requestPermission(permission, '将当前预览图片发送到你配置的大模型接口以识别公式。'));
        if (granted !== 1 && granted !== 2) { throw new Error('联网权限未授予。'); }
      }
      setStatus('20%……');
      const stat = await step(() => RNFS.stat(imagePath));
      if (Number(stat.size) > 1400000) { throw new Error('图片过大，请先裁剪为单个公式。'); }
      const data = await step(() => RNFS.readFile(imagePath, 'base64'));
      const mime = /\.jpe?g$/i.test(imagePath) ? 'image/jpeg' : /\.bmp$/i.test(imagePath) ? 'image/bmp' : 'image/png';
      const result = await step(() => transcribe({base64: data, mime}, config, key, fetch, {
        signal: controller.signal, onProgress: percent => { if (!controller.signal.aborted) { setStatus(`${percent}%……`); } },
      }));
      if (controller.signal.aborted) { throw new RecognitionCancelled(); }
      invalidate(); setRecognizedImage(original); setLatex(result.latex); setTab('equation');
      setPreview({...renderEquation(result.latex), kind: 'equation', latex: result.latex, revision: revision.current});
      setStatus('100% · 请核对公式，确认后插入笔记。' + (result.warning ? ` 模型提示：${result.warning}` : ''));
    } catch (e) {
      if (controller.signal.aborted || e instanceof RecognitionCancelled) { setStatus('已取消识别，可重新识别或返回笔记。'); }
      else { setStatus(e instanceof Error ? e.message : '识别失败，请重试。'); throw e; }
    } finally {
      if (recognition.current === controller) { recognition.current = null; setRecognizing(false); }
    }
  };
  const recognizeImage = () => run(() => recognizePath(ocrPath, provider, appKey, importedImage));
  const previewWidth = preview ? Math.max(1, Math.min(window.width - 40, 360 * preview.aspect)) : 1;
  if (picker && ready) { return <FilePicker onSelect={path => { void run(async () => {
    const hash = await RNFS.hash(path, 'sha256');
    invalidate(); selection.current = null; setImportedImage({path, hash}); setRecognizedImage(null); setOcrPath(path); setPicker(false); setTab('ocr');
  }); }} onClose={() => setPicker(false)} initialDirectory={prefs.defaultDirectory}
    defaultDirectory={prefs.defaultDirectory} onSetDefaultDirectory={path => { void updatePrefs({defaultDirectory: path}); }} settingsBusy={busy}/>; }
  const pageHeader = <>
    <Text style={{fontSize: 26, fontWeight: 'bold', color: '#000'}}>InkMath</Text>
    <Text style={{color: '#000', marginVertical: 8}}>{busy && !recognizing ? '处理中，请稍候…' : status}</Text>
    <View style={{flexDirection: 'row', gap: 8}}>
      <View style={{flex: 2}}><Button title="返回笔记" disabled={busy} onPress={() => { void run(async () => { if (saveTimer.current) { await persistSettings(); } else { await pendingSave.current; } PluginManager.closePluginView(); }); }}/></View>
      <View style={{flex: 1}}><Button title="取消识别" inverted disabled={!recognizing} onPress={() => recognition.current?.abort()}/></View>
    </View>
    {!ready && <Button title="重试初始化" onPress={() => { void openEntry(false); }}/>}
    {ready && <View pointerEvents={busy ? 'none' : 'auto'}>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{([['settings', 'API 设置'], ['equation', '公式'], ['ocr', '图片识别'], ['plot', '绘图'], ['history', '公式记录']] as const).map(([id, label]) =>
        <Button key={id} title={(tab === id ? '● ' : '') + label} onPress={() => { invalidate(); setTab(id); if (id === 'history') { setSelectedRecordId(records[0]?.id || ''); } }}/>)}</View>
    </View>}
  </>;
  if (ready && tab === 'history') {
    const selected = records.find(r => r.id === selectedRecordId);
    const disabled = busy || !selected;
    const actionStyle = {flex: 1, minWidth: 0, minHeight: 64, paddingHorizontal: 10, paddingVertical: 14,
      borderWidth: 2, borderColor: '#000', alignItems: 'center' as const, justifyContent: 'center' as const, opacity: disabled ? 0.4 : 1};
    return <View style={{flex: 1, backgroundColor: '#fff', padding: 16}}>
      {pageHeader}
      <View style={{flexDirection: 'row', gap: 10, marginVertical: 8}}>
        <Pressable accessibilityRole="button" accessibilityLabel="用所选公式绘图" disabled={disabled}
          style={{...actionStyle, backgroundColor: '#000'}} onPress={() => { if (selected) { chooseFormula(selected); } }}>
          <Text style={{color: '#fff', fontSize: 17, fontWeight: 'bold', textAlign: 'center'}}>用所选公式绘图</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="重新编辑所选公式" disabled={disabled}
          style={{...actionStyle, backgroundColor: '#fff'}} onPress={() => {
            if (!selected) { return; }
            invalidate(); selection.current = null; setOcrPath(''); setImportedImage(null); setRecognizedImage(null);
            setLatex(selected.latex); setTab('equation'); setStatus('已载入所选公式，可修改 LaTeX 后预览并插入。');
          }}>
          <Text style={{color: '#000', fontSize: 17, textAlign: 'center'}}>重新编辑所选公式</Text>
        </Pressable>
      </View>
      <Text style={{color: '#000', marginBottom: 8}}>最近 100 条已插入公式，默认选中最新一条。选择后使用上方按钮。</Text>
      <ScrollView style={{flex: 1}} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom: 16}}>
        {records.length === 0 && <Text style={{color: '#000'}}>还没有已插入公式。</Text>}
        {records.slice(0, 100).map(r => <Button key={r.id} disabled={busy}
          title={(selectedRecordId === r.id ? '● ' : '○ ') + r.latex.slice(0, 100)} onPress={() => setSelectedRecordId(r.id)}/>)}
      </ScrollView>
    </View>;
  }
  return <KeyboardPage>
    {pageHeader}
    {ready && <View pointerEvents={busy ? 'none' : 'auto'}>
      {tab === 'equation' && <>
        <Text style={{color: '#000'}}>LaTeX（本地 MathJax；支持分式、矩阵、上下标等）</Text>
        <TextInput accessibilityLabel="LaTeX" style={inputStyle} value={latex} multiline autoCapitalize="none" autoCorrect={false}
          maxLength={2000} onChangeText={v => { invalidate(); setLatex(v); }}/>
        <Button title="预览公式" onPress={makePreview}/>
        <Button title="用此公式绘图" onPress={() => { try { const e = latexToExpression(latex); invalidate(); setExpression(e); setTab('plot'); } catch (e) { error(e); } }}/>
      </>}
      {tab === 'plot' && <>
        <Text style={{color: '#000'}}>y(x)；例如 sin(x)、x^2、1/(1+exp(-x))。角度为弧度。</Text>
        <TextInput accessibilityLabel="函数" value={expression} style={inputStyle} autoCapitalize="none" autoCorrect={false}
          onChangeText={v => { invalidate(); setExpression(v); }}/>
        <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>{(['xmin', 'xmax', 'ymin', 'ymax'] as const).map(key =>
          <View key={key} style={{width: '50%', padding: 4}}><Text style={{color: '#000'}}>{key}</Text><TextInput accessibilityLabel={key}
            style={inputStyle} value={range[key]} onChangeText={v => { invalidate(); setRange({...range, [key]: v}); }}/></View>)}</View>
        <Text style={{color: '#000'}}>单位格（横纵轴共用，默认 1）</Text>
        <TextInput accessibilityLabel="单位格" style={inputStyle} value={unit} keyboardType="decimal-pad"
          onChangeText={v => { invalidate(); setUnit(v); }}/>
        <Text style={{color: '#000'}}>横纵轴每格等长；坐标范围裁切显示区域，不单独拉伸坐标轴。</Text>
        <Button title="生成图像" onPress={makePreview}/>
      </>}
      {tab === 'ocr' && <>
        <Button title="选择图片" onPress={() => { setPicker(true); }}/>
      </>}
      {tab === 'settings' && <ProviderSettings value={provider} onChange={changeProvider} apiKey={appKey} onKey={changeKey}
        onCommit={() => { void persistSettings().catch(error); }} saving={saveStatus}/>}
      {tab === 'ocr' && <>
        {!!ocrPath && <OcrCrop key={ocrPath} path={ocrPath} onCrop={path => { invalidate(); setRecognizedImage(null); setOcrPath(path); }} onError={error}/>}
        <Pressable accessibilityRole="checkbox" accessibilityLabel="插入成功后删除原图片" accessibilityState={{checked: !!prefs.deleteImportedImageAfterInsert, disabled: busy}}
          disabled={busy} onPress={() => { void updatePrefs({deleteImportedImageAfterInsert: !prefs.deleteImportedImageAfterInsert}); }}
          style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, minHeight: 48}}>
          <View style={{width: 24, height: 24, borderWidth: 2, borderColor: '#000', alignItems: 'center', justifyContent: 'center'}}>
            <Text style={{color: '#000', fontSize: 18, lineHeight: 20}}>{prefs.deleteImportedImageAfterInsert ? '✓' : ''}</Text>
          </View>
          <Text style={{color: '#000', fontSize: 17, flexShrink: 1}}>插入成功后删除原图片</Text>
        </Pressable>
        <Button title="上传预览图片并识别" disabled={!ocrPath || !provider.model || !provider.endpoint || !appKey} onPress={recognizeImage}/>
      </>}
      {preview && <>
        <Text style={{color: '#000', marginVertical: 10}}>检查预览；插入后可在笔记中缩放。</Text>
        <ViewShot key={preview.revision} ref={shot} onLayout={() => setLaidOut(true)}
          options={{format: 'png', result: 'base64', width: Math.round(previewWidth * 2), height: Math.round((previewWidth / preview.aspect + 24) * 2)}}
          style={{width: previewWidth, height: previewWidth / preview.aspect + 24, paddingVertical: 12, backgroundColor: '#fff'}}>
          <SvgXml xml={preview.svg} width={previewWidth} height={previewWidth / preview.aspect} onError={e => { invalidate(); error(e); }}/>
        </ViewShot>
        <Button title={preview.kind === 'equation' ? (selection.current ? '确认并替换原笔迹' : '确认并插入公式') : '插入函数图像'} disabled={!laidOut || busy} onPress={insert}/>
      </>}
    </View>}
  </KeyboardPage>;
}
