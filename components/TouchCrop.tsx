import React, {useRef, useState} from 'react';
import {View, PanResponder, StyleSheet} from 'react-native';
import {Bounds, CropBox, CropMode, dragCrop, hitCrop} from '../cropGeometry';

type Props = {box: CropBox; bounds: Bounds; onChange: (box: CropBox) => void};
export function TouchCrop(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const gesture = useRef<{box: CropBox; mode: CropMode; bounds: Bounds} | null>(null);
  const [active, setActive] = useState(false);
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: event => event.nativeEvent.touches.length === 1 &&
      hitCrop(latest.current.box, event.nativeEvent.locationX, event.nativeEvent.locationY) !== null,
    onPanResponderGrant: event => {
      const {box, bounds} = latest.current;
      const mode = hitCrop(box, event.nativeEvent.locationX, event.nativeEvent.locationY);
      gesture.current = mode ? {box: {...box}, bounds: {...bounds}, mode} : null;
      setActive(!!mode);
    },
    onPanResponderMove: (_, state) => {
      const start = gesture.current;
      if (start && state.numberActiveTouches === 1) {
        latest.current.onChange(dragCrop(start.box, start.mode, state.dx, state.dy, start.bounds));
      }
    },
    onPanResponderRelease: () => { gesture.current = null; setActive(false); },
    onPanResponderTerminate: () => { gesture.current = null; setActive(false); },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  })).current;
  const {box, bounds} = props;
  const points = [
    [box.x, box.y], [box.x + box.w / 2, box.y], [box.x + box.w, box.y],
    [box.x, box.y + box.h / 2], [box.x + box.w, box.y + box.h / 2],
    [box.x, box.y + box.h], [box.x + box.w / 2, box.y + box.h], [box.x + box.w, box.y + box.h],
  ];
  return <View testID="touch-crop" style={StyleSheet.absoluteFill} {...responder.panHandlers}>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.shade, {left: 0, top: 0, width: bounds.width, height: box.y}]} />
      <View style={[styles.shade, {left: 0, top: box.y + box.h, width: bounds.width, bottom: 0}]} />
      <View style={[styles.shade, {left: 0, top: box.y, width: box.x, height: box.h}]} />
      <View style={[styles.shade, {left: box.x + box.w, top: box.y, right: 0, height: box.h}]} />
      <View style={{position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, borderWidth: active ? 4 : 3, borderColor: '#000'}} />
      {points.map(([x, y], i) => <View key={i} style={[styles.handle, {
        left: Math.max(0, Math.min(x - 9, bounds.width - 18)),
        top: Math.max(0, Math.min(y - 9, bounds.height - 18)),
      }]} />)}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  shade: {position: 'absolute', backgroundColor: 'rgba(0,0,0,0.22)'},
  handle: {position: 'absolute', width: 18, height: 18, backgroundColor: '#fff', borderWidth: 3, borderColor: '#000'},
});
