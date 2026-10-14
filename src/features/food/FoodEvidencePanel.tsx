import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { OcrEvidence } from '../../domain/ocr/types';
import { mapRectToPreview } from '../ocr-lab/geometry';
import { FoodAction, foodStyles } from './ui';

/** Boxes only overlay the processed image; original coordinates may have been transformed. */
export function FoodEvidencePanel({ evidence, focusedBlockIds }: {
  evidence: OcrEvidence; focusedBlockIds: readonly string[];
}) {
  const [imageKind, setImageKind] = useState<'original' | 'processed'>('original');
  const [showBoxes, setShowBoxes] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const [viewport, setViewport] = useState({ width: 1, height: 400 });
  const onLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const { width, height } = nativeEvent.layout;
    if (width > 0 && height > 0) setViewport({ width, height });
  };
  const focused = new Set(focusedBlockIds);
  return <View style={foodStyles.card}>
    <Text style={foodStyles.sectionTitle}>对照包装照片</Text>
    <Text style={foodStyles.note}>核对时以照片实际印刷内容为准。原图与处理图分别保留，文字框只对应处理图。</Text>
    <View style={foodStyles.row}>
      <FoodAction title={imageKind === 'original' ? '原图 ✓' : '查看原图'} onPress={() => setImageKind('original')} />
      <FoodAction title={imageKind === 'processed' ? '处理图 ✓' : '查看处理图'} onPress={() => setImageKind('processed')} />
      {imageKind === 'processed' ? <FoodAction title={showBoxes ? '隐藏文字框' : '显示文字框'} onPress={() => setShowBoxes((value) => !value)} /> : null}
    </View>
    <View style={styles.preview} onLayout={onLayout}>
      <Image source={{ uri: imageKind === 'original' ? evidence.image.originalUri : evidence.image.uri }}
        accessibilityLabel={imageKind === 'original' ? '食品包装原图' : '食品包装 OCR 处理图'}
        resizeMode="contain" style={StyleSheet.absoluteFill} />
      {imageKind === 'processed' && showBoxes ? evidence.ocr.blocks.map((block, index) => <View key={block.id}
        pointerEvents="none" style={[styles.box, mapRectToPreview(block.boundingBox, evidence.image, viewport),
          focused.has(block.id) && styles.focusedBox]}><Text style={styles.boxIndex}>{index + 1}</Text></View>) : null}
    </View>
    {focused.size > 0 ? <>
      <Text style={foodStyles.note}>该字段关联的原始文字块：</Text>
      {evidence.ocr.blocks.filter((block) => focused.has(block.id)).map((block) => <Pressable key={block.id}
        accessibilityRole="button" onPress={() => { setImageKind('processed'); setShowBoxes(true); }}>
        <Text selectable style={foodStyles.text}>{block.text} · 分数 {(block.confidence * 100).toFixed(1)}%</Text>
        <Text style={foodStyles.code}>位置 {block.boundingBox.left.toFixed(0)}, {block.boundingBox.top.toFixed(0)} — {block.boundingBox.right.toFixed(0)}, {block.boundingBox.bottom.toFixed(0)}</Text>
      </Pressable>)}
    </> : null}
    <FoodAction title={showRaw ? '收起 OCR 原文' : '查看 OCR 原文'} onPress={() => setShowRaw((value) => !value)} />
    {showRaw ? <Text selectable style={foodStyles.text}>{evidence.ocr.rawText || '原始 OCR 未识别到文字。'}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  preview: { height: 400, backgroundColor: '#edf1ef', borderRadius: 12, overflow: 'hidden' },
  box: { position: 'absolute', borderWidth: 1, borderColor: '#078660', backgroundColor: '#21ba730d' },
  focusedBox: { borderWidth: 2, borderColor: '#164cdb', backgroundColor: '#164cdb20' },
  boxIndex: { backgroundColor: '#157b67', color: '#fff', alignSelf: 'flex-start', fontSize: 8, paddingHorizontal: 2 },
});
