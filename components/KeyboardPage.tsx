import React, {createContext, useCallback, useEffect, useRef, useState} from 'react';
import {Keyboard, KeyboardAvoidingView, Platform, ScrollView, View} from 'react-native';

export const InputFocusContext = createContext<(target: number) => void>(() => {});

// The plugin runs inside the host activity: its own manifest's adjustResize
// cannot guarantee that the host resizes the plugin panel for the keyboard.
export function KeyboardPage({children}: {children: React.ReactNode}) {
  const outer = useRef<View>(null), scroll = useRef<ScrollView>(null);
  const focused = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [top, setTop] = useState(0);
  const reveal = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); }
    // Allow the keyboard and avoidance layout to settle before measuring.
    timer.current = setTimeout(() => {
      timer.current = null;
      if (focused.current != null) {
        scroll.current?.scrollResponderScrollNativeHandleToKeyboard(focused.current, 20, true);
      }
    }, 100);
  }, []);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', reveal);
    const hidden = Keyboard.addListener('keyboardDidHide', () => { focused.current = null; });
    return () => { shown.remove(); hidden.remove(); if (timer.current) { clearTimeout(timer.current); } };
  }, [reveal]);
  return <View ref={outer} style={{flex: 1, backgroundColor: '#fff'}} onLayout={() => {
    outer.current?.measureInWindow((_x, y) => setTop(y));
  }}>
    <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={top}>
      <InputFocusContext.Provider value={target => { focused.current = target; reveal(); }}>
        <ScrollView ref={scroll} style={{flex: 1}} contentContainerStyle={{padding: 16, paddingBottom: 36}}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onLayout={() => { if (Keyboard.isVisible()) { reveal(); } }}>
          {children}
        </ScrollView>
      </InputFocusContext.Provider>
    </KeyboardAvoidingView>
  </View>;
}
