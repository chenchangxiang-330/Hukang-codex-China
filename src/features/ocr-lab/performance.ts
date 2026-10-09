import type { OcrEvidence, OcrStageTimings } from '../../domain/ocr/types';

export type PerformanceDevice = Readonly<{
  platform: string;
  osVersion: string;
  manufacturer?: string;
  model?: string;
  brand?: string;
}>;

/** Only created from a completed native recognition. No estimated or substituted durations. */
export type OcrPerformanceRecord = Readonly<{
  schemaVersion: 1;
  evidenceId: string;
  recordedAt: string;
  sourceImageHash: string;
  processedImageHash: string;
  imageWidth: number;
  imageHeight: number;
  device: PerformanceDevice;
  engineVersion: string;
  modelVersion: string;
  modelHashes: Readonly<Record<string, string>>;
  /** Cold means this call performed model initialization (modelLoadMs > 0). */
  loadMode: 'cold' | 'warm';
  modelLoadMs: number;
  /** Session initialization duration from the first load; not another warm-call loading cost. */
  modelColdLoadMs: number | null;
  /** Cumulative native import/EXIF + applied transforms; excludes time spent using UI. */
  imagePreprocessingMs: number | null;
  imageLastOperationMs: number | null;
  /** Native prepared-image metadata read/decode, before model load/inference. */
  imageDecodeMs: number | null;
  timings: OcrStageTimings | null;
  ocrMs: number;
  nativeTotalMs: number;
  /** Recognition button -> native result validation -> evidence save; excludes earlier image/UI work. */
  workflowMs: number;
  evidenceSaveMs: number;
  evidenceSaved: boolean;
  blockCount: number;
  /** Native sampler runs after image decode, every 50 ms; not whole-app absolute peak RSS. */
  memory: Readonly<Record<string, number | null>> | null;
}>;

export type DurationSummary = Readonly<{
  count: number;
  minMs: number;
  medianMs: number;
  maxMs: number;
  /** Nearest-rank ceil(.95 * N), emitted only for N >= 5. */
  p95Ms: number | null;
}>;

export type PerformanceGroup = Readonly<{
  identity: string;
  device: PerformanceDevice;
  engineVersion: string;
  modelVersion: string;
  count: number;
  cold: DurationSummary | null;
  warm: DurationSummary | null;
}>;

export type PerformanceSummary = Readonly<{
  count: number;
  groups: readonly PerformanceGroup[];
}>;

const HISTORY_LIMIT = 100;
const HASH = /^[0-9a-f]{64}$/;

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`性能记录无效：${message}`);
}

function object(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), '必须是对象');
  return value as Record<string, unknown>;
}

export function makePerformanceRecord(
  evidence: OcrEvidence,
  measured: Readonly<{
    device: PerformanceDevice;
    workflowMs: number;
    evidenceSaveMs: number;
    evidenceSaved: boolean;
  }>,
): OcrPerformanceRecord {
  const result: OcrPerformanceRecord = {
    schemaVersion: 1,
    evidenceId: evidence.id,
    recordedAt: evidence.recordedAt,
    sourceImageHash: evidence.image.sourceImageHash,
    processedImageHash: evidence.image.processedImageHash,
    imageWidth: evidence.image.width,
    imageHeight: evidence.image.height,
    device: { ...measured.device },
    engineVersion: evidence.ocr.engineVersion,
    modelVersion: evidence.ocr.modelVersion,
    modelHashes: { ...evidence.ocr.modelHashes },
    loadMode: evidence.ocr.modelLoadMs > 0 ? 'cold' : 'warm',
    modelLoadMs: evidence.ocr.modelLoadMs,
    modelColdLoadMs: evidence.ocr.modelColdLoadMs ?? null,
    imagePreprocessingMs: evidence.image.preprocessingMs ?? null,
    imageLastOperationMs: evidence.image.preprocessingLastOperationMs ?? null,
    imageDecodeMs: evidence.ocr.imageDecodeMs ?? null,
    timings: evidence.ocr.timings ? structuredTimingCopy(evidence.ocr.timings) : null,
    ocrMs: evidence.ocr.ocrMs,
    nativeTotalMs: evidence.ocr.totalMs,
    workflowMs: measured.workflowMs,
    evidenceSaveMs: measured.evidenceSaveMs,
    evidenceSaved: measured.evidenceSaved,
    blockCount: evidence.ocr.blocks.length,
    memory: evidence.ocr.memory ? { ...evidence.ocr.memory } : null,
  };
  assertPerformanceRecord(result);
  return result;
}

function structuredTimingCopy(timings: OcrStageTimings): OcrStageTimings {
  return { ...timings, detInputShape: [...timings.detInputShape],
    recInputShapes: timings.recInputShapes.map((shape) => [...shape]) };
}

export function assertPerformanceRecord(value: unknown): asserts value is OcrPerformanceRecord {
  const record = object(value);
  assert(record.schemaVersion === 1, '版本不支持');
  for (const key of ['evidenceId', 'recordedAt', 'engineVersion', 'modelVersion']) {
    assert(typeof record[key] === 'string' && record[key].length > 0, `${key} 缺失`);
  }
  assert(Number.isFinite(Date.parse(record.recordedAt as string)), '日期无效');
  for (const key of ['sourceImageHash', 'processedImageHash']) {
    assert(typeof record[key] === 'string' && HASH.test(record[key]), `${key} 不符合 SHA-256`);
  }
  const hashes = object(record.modelHashes);
  for (const key of ['detector', 'recognizer']) {
    assert(typeof hashes[key] === 'string' && HASH.test(hashes[key]), `模型 ${key} 摘要缺失`);
  }
  for (const key of ['imageWidth', 'imageHeight']) {
    assert(typeof record[key] === 'number' && Number.isInteger(record[key]) && record[key] > 0, `${key} 无效`);
  }
  assert(Number.isInteger(record.blockCount) && nonnegative(record.blockCount), '文字块数量无效');
  const device = object(record.device);
  for (const key of ['platform', 'osVersion']) {
    assert(typeof device[key] === 'string' && device[key].length > 0, `设备 ${key} 无效`);
  }
  for (const key of ['manufacturer', 'model', 'brand']) {
    assert(device[key] === undefined || typeof device[key] === 'string', `设备 ${key} 无效`);
  }
  for (const key of ['modelLoadMs', 'ocrMs', 'nativeTotalMs', 'workflowMs', 'evidenceSaveMs']) {
    assert(nonnegative(record[key]), `${key} 不是实测有限非负值`);
  }
  for (const key of ['modelColdLoadMs', 'imagePreprocessingMs', 'imageLastOperationMs', 'imageDecodeMs']) {
    assert(record[key] === null || nonnegative(record[key]), `${key} 必须是实测值或 null`);
  }
  assert(record.loadMode === ((record.modelLoadMs as number) > 0 ? 'cold' : 'warm'), '冷/热初始化标记不一致');
  assert(typeof record.evidenceSaved === 'boolean', '证据保存状态无效');
  if (record.timings !== null) {
    const timings = object(record.timings);
    for (const key of ['detPreprocessMs', 'detInferenceMs', 'detPostprocessMs',
      'recPreprocessMs', 'recInferenceMs', 'recPostprocessMs', 'pipelineOverheadMs']) {
      assert(nonnegative(timings[key]), `原生 ${key} 无效`);
    }
    const shape = (value: unknown) => Array.isArray(value)
      && value.every((n) => typeof n === 'number' && Number.isInteger(n) && n > 0);
    assert(shape(timings.detInputShape), '检测形状无效');
    assert(Array.isArray(timings.recInputShapes) && timings.recInputShapes.every(shape), '识别形状无效');
  }
  if (record.memory !== null) {
    const memory = object(record.memory);
    for (const [key, n] of Object.entries(memory)) assert(n === null || nonnegative(n), `内存 ${key} 无效`);
  }
}

/** Unknown legacy timings stay null. Corrupt history is reported, never filled with estimates. */
export function decodePerformanceHistory(value: unknown): readonly OcrPerformanceRecord[] {
  const data = object(value);
  assert(data.schemaVersion === 1 && Array.isArray(data.records), '历史记录格式无效');
  assert(data.records.length <= HISTORY_LIMIT, '历史记录超过保留上限');
  data.records.forEach(assertPerformanceRecord);
  const ids = new Set(data.records.map((item) => item.evidenceId));
  assert(ids.size === data.records.length, '历史证据 ID 重复');
  return data.records as readonly OcrPerformanceRecord[];
}

export function appendPerformanceRecord(
  records: readonly OcrPerformanceRecord[],
  record: OcrPerformanceRecord,
): readonly OcrPerformanceRecord[] {
  assertPerformanceRecord(record);
  return [...records.filter((previous) => previous.evidenceId !== record.evidenceId), record].slice(-HISTORY_LIMIT);
}

export function summarizeDurations(durations: readonly number[]): DurationSummary | null {
  if (!durations.length) return null;
  assert(durations.every(nonnegative), '汇总含有无效耗时');
  const sorted = [...durations].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return { count: sorted.length, minMs: sorted[0]!, medianMs: median, maxMs: sorted[sorted.length - 1]!,
    p95Ms: sorted.length >= 5 ? sorted[Math.ceil(0.95 * sorted.length) - 1]! : null };
}

/** Keep device/engine/model and cold/warm measurements separate. Metric is native totalMs. */
export function summarizePerformance(records: readonly OcrPerformanceRecord[]): PerformanceSummary {
  const groups = new Map<string, OcrPerformanceRecord[]>();
  for (const record of records) {
    assertPerformanceRecord(record);
    const identity = JSON.stringify([record.device.platform, record.device.osVersion,
      record.device.manufacturer ?? '', record.device.model ?? '', record.device.brand ?? '',
      record.engineVersion, record.modelVersion, record.modelHashes.detector, record.modelHashes.recognizer]);
    const group = groups.get(identity) ?? [];
    group.push(record);
    groups.set(identity, group);
  }
  return { count: records.length, groups: [...groups].map(([identity, items]) => {
    const first = items[0]!;
    return { identity, device: first.device, engineVersion: first.engineVersion, modelVersion: first.modelVersion,
      count: items.length,
      cold: summarizeDurations(items.filter((item) => item.loadMode === 'cold').map((item) => item.nativeTotalMs)),
      warm: summarizeDurations(items.filter((item) => item.loadMode === 'warm').map((item) => item.nativeTotalMs)),
    } }) };
}
