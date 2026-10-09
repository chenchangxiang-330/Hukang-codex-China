import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { OcrBlock, OcrDocument } from '../../domain/ocr/types';
import { mapRectToPreview, type CropPercent } from './geometry';
import { useOcrLab, type LabPhase } from './useOcrLab';
import { PerformancePanel } from './PerformancePanel';
import { setFoodDraft } from '../food/draftStore';

const colors = {
  background: '#f3faf8', surface: '#ffffff', ink: '#183e37', secondary: '#60736e',
  teal: '#157b67', border: '#dce9e4', pale: '#e6f4ed', amber: '#946015', red: '#a43b3b',
};

const phaseLabels: Record<LabPhase, string> = {
  idle: '', selecting: '正在打开相册…', preparing: '正在修复 EXIF 方向…',
  transforming: '正在本地处理图片…', recognizing: '正在本地识别，请稍候…', exporting: '正在打开系统分享…',
};

function Action({ title, onPress, disabled = false, primary = false }: {
  title: string; onPress: () => void; disabled?: boolean; primary?: boolean;
}) {
  return <Pressable
    accessibilityRole="button" accessibilityState={{ disabled }}
    onPress={onPress} disabled={disabled}
    style={({ pressed }) => [styles.action, primary && styles.primaryAction, disabled && styles.disabled, pressed && styles.pressed]}
  >
    <Text style={[styles.actionText, primary && styles.primaryActionText]}>{title}</Text>
  </Pressable>;
}

function Heading({ title, note }: { title: string; note?: string }) {
  return <View style={styles.heading}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {note ? <Text style={styles.note}>{note}</Text> : null}
  </View>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.note}>{label}</Text></View>;
}

function confidenceText(block: OcrBlock) {
  return Number.isFinite(block.confidence) ? `${(block.confidence * 100).toFixed(1)}%` : '未提供';
}

function MemorySummary({ result }: { result: OcrDocument }) {
  const memory = result.memory;
  if (!memory) return <Text style={styles.note}>本次原生结果未提供内存测量。</Text>;
  const pss = memory.observedPeakPssKb;
  const java = memory.observedPeakJavaHeapBytes;
  const native = memory.observedPeakNativeHeapBytes;
  const interval = memory.samplingIntervalMs;
  const samples = memory.sampleCount;
  const mib = (value: number | null | undefined, divisor: number) => typeof value === 'number' ? `${(value / divisor).toFixed(1)} MiB` : '未提供';
  return <View style={styles.memory}>
    <Text style={styles.note}>OCR 期间采样峰值：PSS {mib(pss, 1024)} · Java {mib(java, 1024 * 1024)} · Native {mib(native, 1024 * 1024)}</Text>
    <Text style={styles.note}>采样间隔 {typeof interval === 'number' ? `${interval} ms` : '未提供'}，{typeof samples === 'number' ? samples : '未提供'} 个样本；不代表瞬时绝对峰值。</Text>
  </View>;
}

export default function OcrLabScreen() {
  const router = useRouter();
  const lab = useOcrLab();
  const [viewport, setViewport] = useState({ width: 1, height: 320 });
  const [selection, setSelection] = useState<{ evidenceId: string; blockId: string } | null>(null);
  const onPreviewLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const { width, height } = nativeEvent.layout;
    if (width > 0 && height > 0) setViewport({ width, height });
  };
  const cropFields: { key: keyof CropPercent; label: string }[] = [
    { key: 'x', label: '左侧 %' }, { key: 'y', label: '顶部 %' },
    { key: 'width', label: '宽度 %' }, { key: 'height', label: '高度 %' },
  ];
  const result = lab.evidence?.ocr;
  const image = lab.image;
  const selectedId = selection?.evidenceId === lab.evidence?.id ? selection?.blockId : null;
  const selectBlock = (blockId: string) => {
    if (lab.evidence) setSelection({ evidenceId: lab.evidence.id, blockId });
  };

  return <SafeAreaView style={styles.safeArea} edges={['bottom']}>
    <Stack.Screen options={{ title: 'OCR Lab', headerShadowVisible: false }} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Image source={require('../../../assets/icon.png')} style={styles.logo} />
        <View style={styles.heroCopy}>
          <Text style={styles.title}>护康 · OCR Lab</Text>
          <Text style={styles.subtitle}>国产 PaddleOCR，图片始终留在本机</Text>
        </View>
      </View>
      <View style={styles.badges}><Text style={styles.badge}>完全离线</Text><Text style={styles.badge}>PP-OCRv5 mobile</Text><Text style={styles.badge}>原文保留</Text></View>

      <View style={styles.card}>
        <Heading title="01 选择照片" note="选择食品包装、配料表或营养表的真实照片。" />
        <Action title={image ? '从相册更换照片' : '从相册选择照片'} onPress={() => void lab.choosePhoto()} disabled={lab.busy} primary />
        {lab.busy ? <View style={styles.loading} accessibilityLiveRegion="polite"><ActivityIndicator color={colors.teal} /><Text style={styles.status}>{phaseLabels[lab.phase]}</Text></View> : null}
        {lab.error ? <View style={styles.error} accessibilityLiveRegion="assertive"><Text style={styles.errorText}>{lab.error}</Text></View> : null}
      </View>

      {image ? <>
        <View style={styles.card}>
          <Heading title="02 图片与文字框" note="EXIF 方向已由本地模块处理。旋转或裁剪后须重新识别。" />
          <View onLayout={onPreviewLayout} style={styles.preview}>
            <Image source={{ uri: image.uri }} resizeMode="contain" style={StyleSheet.absoluteFill} />
            {result?.blocks.map((block, index) => <Pressable
              key={block.id} onPress={() => selectBlock(block.id)}
              accessibilityLabel={`文字块 ${index + 1}：${block.text}，confidence ${confidenceText(block)}`}
              style={[styles.box, mapRectToPreview(block.boundingBox, image, viewport), selectedId === block.id && styles.selectedBox]}
            >
              <Text numberOfLines={1} style={styles.boxIndex}>{index + 1}</Text>
            </Pressable>)}
            {lab.cropPending && lab.cropStatus.rect ? <View pointerEvents="none" style={[styles.cropBox, mapRectToPreview(lab.cropStatus.rect, image, viewport)]} /> : null}
          </View>
          <Text style={styles.note}>{image.width} × {image.height} px · 原图 {image.transform.originalWidth} × {image.transform.originalHeight} px · EXIF {image.sourceOrientation}</Text>
          <View style={styles.actionRow}>
            <Action title="↶ 左转 90°" onPress={() => void lab.transform(-90, false)} disabled={lab.busy || lab.cropPending} />
            <Action title="↷ 右转 90°" onPress={() => void lab.transform(90, false)} disabled={lab.busy || lab.cropPending} />
            <Action title="恢复原图" onPress={() => void lab.restoreOriginal()} disabled={lab.busy} />
          </View>
          <Heading title="矩形裁剪" note="按图片百分比输入边界，绿色矩形为预览。应用后才改变识别图片。" />
          <View style={styles.cropFields}>{cropFields.map(({ key, label }) => <View key={key} style={styles.cropField}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
              accessibilityLabel={`裁剪${label}`} value={lab.crop[key]}
              onChangeText={(value) => lab.updateCrop(key, value)}
              editable={!lab.busy} keyboardType="decimal-pad" selectTextOnFocus
              style={styles.input} maxLength={7}
            />
          </View>)}</View>
          {lab.cropStatus.error ? <Text style={styles.validation}>{lab.cropStatus.error}</Text> : null}
          <View style={styles.actionRow}>
            <Action title="应用裁剪" onPress={() => void lab.transform(0, true)} disabled={lab.busy || !lab.cropPending || !lab.cropStatus.rect} />
            <Action title="重置裁剪区域" onPress={lab.resetCrop} disabled={lab.busy || !lab.cropPending} />
          </View>
        </View>

        <View style={styles.card}>
          <Heading title="03 本地 OCR" note="仅识别照片实际文字；不接 AI，不解析营养，不自动补写数字。" />
          <Action title={lab.phase === 'recognizing' ? 'PaddleOCR 识别中…' : '开始离线识别'} onPress={() => void lab.recognize()} disabled={lab.busy || lab.cropPending} primary />
          {lab.cropPending ? <Text style={styles.validation}>先应用或重置裁剪区域。</Text> : null}
          {result ? <>
            <View style={styles.metrics}>
              <Metric label="总耗时" value={`${result.totalMs.toFixed(0)} ms`} />
              <Metric label="模型加载" value={`${result.modelLoadMs.toFixed(0)} ms`} />
              <Metric label="OCR 推理流程" value={`${result.ocrMs.toFixed(0)} ms`} />
              <Metric label="文字块" value={`${result.blocks.length}`} />
            </View>
            <Text style={styles.note}>已加载模型的后续识别，加载时间可能为 0；总耗时以原生返回为准。</Text>
            <MemorySummary result={result} />
            <Heading title="OCR 原文" />
            <View style={styles.rawText}><Text selectable style={styles.rawTextContent}>{result.rawText || '未识别到文字。可裁剪文字区域、旋转或换一张更清晰的照片后重试。'}</Text></View>
            <Heading title="文字块与 confidence" note="confidence 是模型分数，不能当作已校准的正确概率。点按列表可突出图片上的文字框。" />
            {result.blocks.map((block, index) => <Pressable
              key={block.id} onPress={() => selectBlock(block.id)}
              style={[styles.blockRow, selectedId === block.id && styles.selectedRow]}
              accessibilityRole="button"
            >
              <View style={styles.blockHeader}><Text style={styles.blockNumber}>#{index + 1}</Text><Text style={styles.confidence}>{confidenceText(block)}</Text></View>
              <Text selectable style={styles.blockText}>{block.text}</Text>
              <Text style={styles.coordinates}>框 ({block.boundingBox.left.toFixed(0)}, {block.boundingBox.top.toFixed(0)}) — ({block.boundingBox.right.toFixed(0)}, {block.boundingBox.bottom.toFixed(0)}) · page {block.page}</Text>
            </Pressable>)}
            <Text selectable style={styles.fingerprint}>模型 {result.modelVersion}{'\n'}处理图 SHA-256 {image.processedImageHash}</Text>
            <View style={styles.actionRow}>
              <Action title="食品营养核对" primary onPress={() => {
                if (!lab.evidence) return;
                const draftId = setFoodDraft(lab.evidence);
                router.push({ pathname: '/food-review', params: { draftId } });
              }} />
              <Action title="打开本地食品" onPress={() => router.push('/foods')} />
            </View>
          </> : <Text style={styles.note}>识别完成后展示真实原文、坐标、分数与耗时。图片修改会隐藏旧结果，原始证据仍保留。</Text>}
        </View>
      </> : null}

      <PerformancePanel records={lab.performanceRecords} summary={lab.performanceSummary}
        error={lab.performanceError} onClear={lab.clearPerformanceRecords} busy={lab.busy} />

      {lab.saveNotice || lab.savedEvidence ? <View style={styles.card}>
        <Heading title="本地实验记录" />
        {lab.saveNotice ? <Text style={styles.note}>{lab.saveNotice}</Text> : null}
        {lab.savedEvidence ? <>
          <Text selectable style={styles.fingerprint}>{lab.savedEvidence.directoryUri}</Text>
          <Action title="分享最近一次真实 OCR JSON" onPress={() => void lab.exportLastEvidence()} disabled={lab.busy} />
          <View style={styles.actionRow}>
            <Action title="分享该次原图" onPress={() => void lab.exportLastEvidence('original')} disabled={lab.busy} />
            <Action title="分享该次处理图" onPress={() => void lab.exportLastEvidence('processed')} disabled={lab.busy} />
          </View>
          <Text style={styles.note}>分享由你主动操作；App 不自动上传。若要外部校验，请将 JSON、原图、处理图保存到同一目录。</Text>
        </> : null}
      </View> : null}
      <Text style={styles.footer}>Phase 2 · OCR 原文和初始解析永久保留；食品数据只写入本机 SQLite，未调用任何在线服务。</Text>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 58, height: 58, borderRadius: 15 },
  heroCopy: { flex: 1, gap: 5 },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 13, color: colors.secondary, lineHeight: 20 },
  badges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  badge: { backgroundColor: colors.pale, color: colors.teal, fontSize: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  heading: { gap: 6 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  note: { color: colors.secondary, fontSize: 12, lineHeight: 19 },
  action: { minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.pale, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  primaryAction: { backgroundColor: colors.teal },
  actionText: { color: colors.teal, fontWeight: '600', fontSize: 14 },
  primaryActionText: { color: '#ffffff' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 4 },
  status: { color: colors.teal, fontSize: 13 },
  error: { backgroundColor: '#fff1ee', padding: 12, borderRadius: 10 },
  errorText: { color: colors.red, fontSize: 13, lineHeight: 21 },
  preview: { height: 320, backgroundColor: '#edf1ef', overflow: 'hidden', borderRadius: 12 },
  box: { position: 'absolute', borderWidth: 1, borderColor: '#078660', backgroundColor: '#21ba730d' },
  selectedBox: { borderColor: '#164cdb', borderWidth: 2, backgroundColor: '#164cdb20' },
  boxIndex: { alignSelf: 'flex-start', backgroundColor: colors.teal, color: '#fff', fontSize: 8, paddingHorizontal: 2 },
  cropBox: { position: 'absolute', borderWidth: 2, borderColor: '#0ea966', backgroundColor: '#39df641a', borderStyle: 'dashed' },
  cropFields: { flexDirection: 'row', gap: 8 },
  cropField: { flex: 1, gap: 5 },
  fieldLabel: { fontSize: 11, color: colors.secondary },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.ink, fontSize: 15, minHeight: 44 },
  validation: { color: colors.amber, fontSize: 12, lineHeight: 19 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { width: '47%', padding: 10, backgroundColor: colors.background, borderRadius: 10, gap: 4 },
  metricValue: { fontSize: 20, color: colors.teal, fontWeight: '700' },
  memory: { gap: 5 },
  rawText: { backgroundColor: colors.background, borderRadius: 10, padding: 12 },
  rawTextContent: { fontSize: 15, lineHeight: 25, color: colors.ink },
  blockRow: { borderWidth: 1, borderColor: colors.border, padding: 11, borderRadius: 10, gap: 6 },
  selectedRow: { borderColor: '#164cdb', backgroundColor: '#edf3ff' },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  blockNumber: { fontSize: 12, color: colors.secondary },
  confidence: { fontSize: 12, color: colors.teal, fontWeight: '700' },
  blockText: { fontSize: 14, lineHeight: 22, color: colors.ink },
  coordinates: { fontSize: 10, color: colors.secondary, lineHeight: 16 },
  fingerprint: { color: colors.secondary, fontSize: 10, lineHeight: 17 },
  footer: { textAlign: 'center', color: colors.secondary, fontSize: 11, lineHeight: 18 },
});
