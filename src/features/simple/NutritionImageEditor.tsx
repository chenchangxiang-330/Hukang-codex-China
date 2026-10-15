import { useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import type { BoundingBox, ImageAsset, Point } from '../../domain/ocr/types';
import { mapRectToPreview } from '../ocr-lab/geometry';
import { previewCrop } from './imageSelection';
import { Button, C, S } from './ui';

export function NutritionImageEditor({ image, transform, recognize }: { image: ImageAsset; transform: (rotation: number, crop: BoundingBox | null) => Promise<void>; recognize: () => Promise<void> }) {
  const [width, setWidth] = useState(1), [cropping, setCropping] = useState(false), [crop, setCrop] = useState<BoundingBox | null>(null);
  const start = useRef<Point | null>(null), viewport = { width, height: 300 };
  return <View style={S.card}>
    <Text style={S.rowTitle}>调整营养表照片</Text>
    <Text style={S.note}>{cropping ? '在图片上从一个角拖到另一个角，框住完整营养表及计量基准。' : '已自动修复照片方向。需要时可旋转、裁剪，再重新识别；原图始终保留。'}</Text>
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%', height: 300, backgroundColor: C.pale }}
      accessible accessibilityLabel="营养表裁剪预览" onStartShouldSetResponder={() => cropping}
      onResponderTerminationRequest={() => !cropping}
      onResponderGrant={e => { start.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }; setCrop(null); }}
      onResponderMove={e => { if (start.current) setCrop(previewCrop(start.current, { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }, image, viewport)); }}
      onResponderRelease={() => { start.current = null; }} onResponderTerminate={() => { start.current = null; }}>
      <View pointerEvents="none" style={{ width: '100%', height: '100%' }}><Image source={{ uri: image.uri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} /></View>
      {crop && <View pointerEvents="none" style={[{ position: 'absolute', borderWidth: 2, borderColor: C.teal, backgroundColor: '#168F8622' }, mapRectToPreview(crop, image, viewport)]} />}
    </View>
    {cropping ? <><Button title="应用裁剪" disabled={!crop} onPress={() => { if (crop) { setCropping(false); setCrop(null); void transform(0, crop); } }} /><Button title="取消裁剪" secondary onPress={() => { setCropping(false); setCrop(null); }} /></> : <>
      <View style={S.two}><View style={{ flex: 1 }}><Button title="左转90°" secondary onPress={() => void transform(-90, null)} /></View><View style={{ flex: 1 }}><Button title="右转90°" secondary onPress={() => void transform(90, null)} /></View></View>
      <Button title="选择裁剪区域" secondary onPress={() => setCropping(true)} /><Button title="使用当前照片重新识别" onPress={() => void recognize()} />
    </>}
  </View>;
}
