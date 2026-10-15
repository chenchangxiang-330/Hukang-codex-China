import { useRef, useState } from 'react';
import { Image, Keyboard, Modal, Text, View, type GestureResponderEvent } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { BoundingBox, ImageAsset, Point } from '../../domain/ocr/types';
import { mapRectToPreview } from '../ocr-lab/geometry';
import { previewCrop } from './imageSelection';
import { Button, C, S } from './ui';

export function NutritionImageEditor({ image, transform, recognize }: { image: ImageAsset; transform: (rotation: number, crop: BoundingBox | null) => Promise<void>; recognize: () => Promise<void> }) {
  const [viewport, setViewport] = useState({ width: 1, height: 1 }), [cropping, setCropping] = useState(false), [crop, setCrop] = useState<BoundingBox | null>(null);
  const start = useRef<Point | null>(null);
  const select = (event: GestureResponderEvent) => {
    if (start.current) setCrop(previewCrop(start.current, { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }, image, viewport));
  };
  const cancel = () => { start.current = null; setCropping(false); setCrop(null); };
  return <View style={S.card}>
    <Text style={S.rowTitle}>调整营养表照片</Text>
    <Text style={S.note}>已自动修复照片方向。需要时可旋转、裁剪，再重新识别；原图始终保留。</Text>
    <Image source={{ uri: image.uri }} resizeMode="contain" style={{ width: '100%', height: 300, backgroundColor: C.pale }} />
    <View style={S.two}><View style={{ flex: 1 }}><Button title="左转90°" secondary onPress={() => void transform(-90, null)} /></View><View style={{ flex: 1 }}><Button title="右转90°" secondary onPress={() => void transform(90, null)} /></View></View>
    <Button title="选择裁剪区域" secondary onPress={() => { Keyboard.dismiss(); setCrop(null); setCropping(true); }} /><Button title="使用当前照片重新识别" onPress={() => void recognize()} />
    {/* The editor deliberately has no ScrollView ancestor: otherwise Android's
        parent scroll recognizer can steal a drag and leave a tiny early crop. */}
    <Modal visible={cropping} animationType="none" onRequestClose={cancel}>
      <SafeAreaProvider><SafeAreaView style={{ flex: 1, padding: 24, gap: 16, backgroundColor: C.bg }}>
        <Text style={S.section}>裁剪营养成分表</Text>
        <Text style={S.note}>在图片上从一个角拖到另一个角，框住完整营养表及计量基准。</Text>
        <View onLayout={e => setViewport({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          style={{ width: '100%', height: 300, flexShrink: 1, minHeight: 120, backgroundColor: C.pale }}
          accessible accessibilityLabel="营养表裁剪预览" onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={e => { start.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }; setCrop(null); }}
          onResponderMove={select} onResponderRelease={e => { select(e); start.current = null; }} onResponderTerminate={() => { start.current = null; setCrop(null); }}>
          <View pointerEvents="none" style={{ width: '100%', height: '100%' }}><Image source={{ uri: image.uri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} /></View>
          {crop && <View pointerEvents="none" style={[{ position: 'absolute', borderWidth: 2, borderColor: C.teal, backgroundColor: '#168F8622' }, mapRectToPreview(crop, image, viewport)]} />}
        </View>
        <Button title="应用裁剪" disabled={!crop} onPress={() => { if (crop) { const selected = crop; cancel(); void transform(0, selected); } }} />
        <Button title="取消裁剪" secondary onPress={cancel} />
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  </View>;
}
