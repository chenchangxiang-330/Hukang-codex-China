import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DurationSummary, OcrPerformanceRecord, PerformanceSummary } from './performance';

const ms = (value: number | null | undefined) => typeof value === 'number' ? `${value.toFixed(0)} ms` : '未测量';
const mib = (value: number | null | undefined, divisor: number) => typeof value === 'number'
  ? `${(value / divisor).toFixed(1)} MiB` : '未测量';

function SummaryRow({ label, value }: { label: string; value: DurationSummary | null }) {
  if (!value) return <Text style={styles.note}>{label}：暂无记录</Text>;
  return <Text style={styles.note}>{label} · {value.count} 次 · 最小 {ms(value.minMs)} · 中位 {ms(value.medianMs)} · 最大 {ms(value.maxMs)}
    {value.p95Ms === null ? ' · 少于 5 次，暂不计算 P95' : ` · P95 ${ms(value.p95Ms)}`}</Text>;
}

function RunDetail({ record }: { record: OcrPerformanceRecord }) {
  const t = record.timings;
  const detector = t ? t.detPreprocessMs + t.detInferenceMs + t.detPostprocessMs : null;
  const recognizer = t ? t.recPreprocessMs + t.recInferenceMs + t.recPostprocessMs : null;
  const memory = record.memory;
  return <View style={styles.run}>
    <Text style={styles.runTitle}>{record.loadMode === 'cold' ? '冷初始化' : '热模型'} · {record.recordedAt}</Text>
    <Text style={styles.note}>模型初始化 {ms(record.modelLoadMs)} · 图片处理累计 {ms(record.imagePreprocessingMs)} · 最近处理 {ms(record.imageLastOperationMs)}</Text>
    <Text style={styles.note}>识别时图片解码 {ms(record.imageDecodeMs)} · 文字检测 {ms(detector)} · 文字识别 {ms(recognizer)}</Text>
    {t ? <>
      <Text style={styles.note}>检测：预处理 {ms(t.detPreprocessMs)} / 推理 {ms(t.detInferenceMs)} / 后处理 {ms(t.detPostprocessMs)}</Text>
      <Text style={styles.note}>识别：预处理 {ms(t.recPreprocessMs)} / 推理 {ms(t.recInferenceMs)} / 后处理 {ms(t.recPostprocessMs)}</Text>
      <Text style={styles.note}>流程其他工作 {ms(t.pipelineOverheadMs)}</Text>
    </> : <Text style={styles.note}>此历史记录未提供原生分阶段耗时。</Text>}
    <Text style={styles.note}>OCR 流程 {ms(record.ocrMs)} · 原生总耗时 {ms(record.nativeTotalMs)} · 本次识别及证据保存 {ms(record.workflowMs)}</Text>
    <Text style={styles.note}>证据保存 {ms(record.evidenceSaveMs)}（{record.evidenceSaved ? '成功' : '失败'}）· {record.blockCount} 个文字块</Text>
    {memory ? <>
      <Text style={styles.note}>采样峰值 PSS {mib(memory.observedPeakPssKb, 1024)} · Java {mib(memory.observedPeakJavaHeapBytes, 1024 * 1024)} · Native {mib(memory.observedPeakNativeHeapBytes, 1024 * 1024)}</Text>
      <Text style={styles.note}>间隔 {ms(memory.samplingIntervalMs)} · {memory.sampleCount ?? '未测量'} 个样本；窗口从图片解码后开始。</Text>
    </> : <Text style={styles.note}>此记录未提供内存采样。</Text>}
    <Text selectable style={styles.identifier}>OCR 证据 {record.evidenceId}{'\n'}{record.sourceImageHash}</Text>
  </View>;
}

export function PerformancePanel({ records, summary, error, onClear, busy = false }: {
  records: readonly OcrPerformanceRecord[];
  summary: PerformanceSummary;
  error: string | null;
  onClear: () => void | Promise<void>;
  busy?: boolean;
}) {
  return <View style={styles.card}>
    <Text style={styles.title}>离线 OCR 性能记录</Text>
    <Text style={styles.note}>本机保留最近 100 次已完成的真实识别，当前 {summary.count} 次。图片处理不包含手动操作等待；本次识别总耗时不包含之前的图片导入。</Text>
    <Text style={styles.note}>冷/热模型分别汇总原生总耗时。P95 使用最近记录的 nearest-rank（ceil(0.95 × N)），至少 5 次；不同设备、模型和引擎分别分组。</Text>
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    {summary.groups.map((group) => <View key={group.identity} style={styles.group}>
      <Text style={styles.runTitle}>{group.device.manufacturer ?? ''} {group.device.model ?? group.device.platform} · Android API {group.device.osVersion} · {group.count} 次</Text>
      <SummaryRow label="冷初始化" value={group.cold} />
      <SummaryRow label="热模型" value={group.warm} />
    </View>)}
    <Text style={styles.note}>最近 5 次明细。内存为每 50 ms 采样观察值，不是瞬时绝对峰值；模拟器数值不代表真机性能。</Text>
    {[...records].slice(-5).reverse().map((record) => <RunDetail key={record.evidenceId} record={record} />)}
    <Pressable accessibilityRole="button" accessibilityLabel="清除 OCR 性能历史"
      onPress={() => void onClear()} disabled={busy}
      accessibilityState={{ disabled: busy }} style={[styles.button, busy && styles.disabled]}>
      <Text style={styles.buttonText}>清除性能历史</Text>
    </Pressable>
    <Text style={styles.note}>只清除性能汇总，不删除图片、OCR 原文或食品记录。</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', padding: 16, gap: 10, borderWidth: 1, borderColor: '#dce9e4', borderRadius: 18 },
  title: { color: '#183e37', fontSize: 17, fontWeight: '700' },
  runTitle: { color: '#183e37', fontSize: 12, fontWeight: '600', lineHeight: 19 },
  note: { color: '#60736e', fontSize: 12, lineHeight: 19 },
  group: { gap: 6, paddingVertical: 8 },
  run: { gap: 5, padding: 10, backgroundColor: '#f3faf8', borderRadius: 10 },
  identifier: { color: '#60736e', fontSize: 10, lineHeight: 16 },
  error: { color: '#a43b3b', fontSize: 12, lineHeight: 20 },
  button: { minHeight: 44, backgroundColor: '#e6f4ed', borderRadius: 10, alignItems: 'center', justifyContent: 'center', padding: 10 },
  buttonText: { color: '#157b67', fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
