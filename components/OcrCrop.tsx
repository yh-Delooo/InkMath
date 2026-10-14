import React, {useEffect, useState} from 'react';
import {View, Image, Text, Pressable} from 'react-native';
import ImageEditor from '@react-native-community/image-editor';
import RNFS from 'react-native-fs';
import {TouchCrop} from './TouchCrop';
import {cropPixels} from '../cropGeometry';
import {getImageDirectory} from '../imageStorage';
export function OcrCrop({path, onCrop, onError}: {path: string; onCrop: (p: string) => void; onError: (e: unknown) => void}) {
  const [size, setSize] = useState({width: 0, height: 0});
  const [width, setWidth] = useState(300), [busy, setBusy] = useState(false);
  const [box, setBox] = useState({x: 0, y: 0, w: 1, h: 1});
  const scale = Math.min(width / Math.max(1, size.width), 260 / Math.max(1, size.height));
  const bounds = {width: size.width * scale, height: size.height * scale};
  useEffect(() => { let active = true; setSize({width: 0, height: 0});
    Image.getSize(`file://${path}`, (w, h) => { if (active) { setSize({width: w, height: h}); } }, onError);
    return () => { active = false; };
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setBox({x: 0, y: 0, w: bounds.width, h: bounds.height}); }, [bounds.width, bounds.height]);
  return <View onLayout={e => setWidth(Math.max(1, e.nativeEvent.layout.width - 24))}>
    <Text style={{color: '#000'}}>拖动框选单个公式；或直接上传整张预览。</Text>
    <View style={{width: bounds.width, height: bounds.height, margin: 12}}>
      {size.width > 0 && <><Image source={{uri: `file://${path}`}} style={{width: '100%', height: '100%'}}/>
        <TouchCrop box={box} bounds={bounds} onChange={setBox}/></>}
    </View>
    <Pressable disabled={busy || !size.width} style={{borderWidth: 1, padding: 12}} onPress={async () => {
      setBusy(true);
      try {
        const pixels = cropPixels(box, bounds, size);
        const options = {outputDirectory: await getImageDirectory(),
          format: 'png' as const, ...pixels, displaySize: pixels.size, resizeMode: 'contain' as const};
        const result = await ImageEditor.cropImage(`file://${path}`, options);
        const destination = `${await getImageDirectory()}/ocr-crop-${Date.now()}.png`;
        await RNFS.copyFile(result.uri.replace(/^file:\/\//, ''), destination);
        onCrop(destination);
      } catch (e) { onError(e); } finally { setBusy(false); }
    }}><Text style={{color: '#000'}}>应用裁剪</Text></Pressable>
  </View>;
}
