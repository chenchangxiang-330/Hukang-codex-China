import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import type { ImageAsset } from '../../domain/ocr/types';
import { recognizeAndCapture, type OcrEvidence } from '../../application/usecases/OcrLabUseCases';
import { hukangVision } from '../../infrastructure/ocr/HukangVision';
import { cropPercentToPixels, FULL_CROP, isFullCrop, type CropPercent } from './geometry';
import { saveEvidence, shareEvidence, type SavedEvidence } from './evidence';
import { appendPerformanceRecord, makePerformanceRecord, summarizePerformance,
  type OcrPerformanceRecord, type PerformanceDevice } from './performance';
import { performanceStore } from './performanceStore';

export type LabPhase = 'idle' | 'selecting' | 'preparing' | 'transforming' | 'recognizing' | 'exporting';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function performanceDevice(): PerformanceDevice {
  if (Platform.OS === 'android') return { platform: Platform.OS, osVersion: String(Platform.Version),
    manufacturer: Platform.constants.Manufacturer, model: Platform.constants.Model, brand: Platform.constants.Brand };
  return { platform: Platform.OS, osVersion: String(Platform.Version) };
}

export function useOcrLab() {
  const [image, setImage] = useState<ImageAsset | null>(null);
  const [crop, setCrop] = useState<CropPercent>(FULL_CROP);
  const [evidence, setEvidence] = useState<OcrEvidence | null>(null);
  const [savedEvidence, setSavedEvidence] = useState<SavedEvidence | null>(null);
  const [phase, setPhase] = useState<LabPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [performanceRecords, setPerformanceRecords] = useState<readonly OcrPerformanceRecord[]>([]);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const performanceGeneration = useRef(0);
  const running = useRef(false);

  useEffect(() => {
    const token = performanceGeneration.current;
    void performanceStore.load().then((records) => {
      if (performanceGeneration.current === token) setPerformanceRecords(records);
    }).catch((cause) => {
      if (performanceGeneration.current === token) setPerformanceError(`性能历史读取失败：${errorMessage(cause)}`);
    });
    return () => { requestGeneration.current += 1; performanceGeneration.current += 1; };
  }, []);

  const performanceSummary = useMemo(() => summarizePerformance(performanceRecords), [performanceRecords]);

  const clearPerformanceRecords = useCallback(async () => {
    if (running.current) return;
    const token = ++performanceGeneration.current;
    try {
      const records = await performanceStore.clear();
      if (performanceGeneration.current !== token) return;
      setPerformanceRecords(records);
      setPerformanceError(null);
    } catch (cause) {
      if (performanceGeneration.current === token) setPerformanceError(`性能历史清除失败：${errorMessage(cause)}`);
    }
  }, []);

  const start = useCallback((nextPhase: LabPhase, invalidateResult = true) => {
    if (running.current) return null;
    running.current = true;
    const token = ++requestGeneration.current;
    setPhase(nextPhase);
    setError(null);
    if (invalidateResult) {
      setEvidence(null);
      setSavedEvidence(null);
      setSaveNotice(null);
    }
    return token;
  }, []);

  const finish = useCallback((token: number) => {
    if (requestGeneration.current === token) {
      running.current = false;
      setPhase('idle');
    }
  }, []);

  const choosePhoto = useCallback(async () => {
    const token = start('selecting', false);
    if (token === null) return;
    try {
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: true, legacy: true,
      });
      if (requestGeneration.current !== token || selection.canceled) return;
      const asset = selection.assets[0];
      if (!asset) throw new Error('相册没有返回图片。');
      setPhase('preparing');
      const prepared = await hukangVision.prepareImage(asset.uri);
      if (requestGeneration.current !== token) return;
      setImage(prepared);
      setCrop(FULL_CROP);
      setEvidence(null);
      setSavedEvidence(null);
      setSaveNotice(null);
    } catch (cause) {
      if (requestGeneration.current === token) setError(`导入失败：${errorMessage(cause)}`);
    } finally {
      finish(token);
    }
  }, [finish, start]);

  const cropStatus = useMemo(() => {
    if (!image) return { rect: null, error: null };
    try { return { rect: cropPercentToPixels(crop, image), error: null }; }
    catch (cause) { return { rect: null, error: errorMessage(cause) }; }
  }, [crop, image]);

  const updateCrop = useCallback((key: keyof CropPercent, value: string) => {
    if (running.current) return;
    setCrop((previous) => ({ ...previous, [key]: value }));
    setEvidence(null);
    setSavedEvidence(null);
    setSaveNotice(null);
    setError(null);
  }, []);

  const resetCrop = useCallback(() => {
    if (running.current) return;
    setCrop(FULL_CROP);
    setError(null);
  }, []);

  const transform = useCallback(async (rotationDegrees: number, applyCrop: boolean) => {
    if (!image) return;
    const rect = applyCrop ? cropStatus.rect : null;
    if (applyCrop && !rect) { setError(cropStatus.error ?? '裁剪区域无效。'); return; }
    const token = start('transforming');
    if (token === null) return;
    try {
      const transformed = await hukangVision.transformImage(image, rotationDegrees, rect);
      if (requestGeneration.current !== token) return;
      setImage(transformed);
      setCrop(FULL_CROP);
    } catch (cause) {
      if (requestGeneration.current === token) setError(`图片处理失败：${errorMessage(cause)}`);
    } finally {
      finish(token);
    }
  }, [cropStatus, finish, image, start]);

  const restoreOriginal = useCallback(async () => {
    if (!image) return;
    const token = start('preparing');
    if (token === null) return;
    try {
      const prepared = await hukangVision.prepareImage(image.originalUri);
      if (requestGeneration.current !== token) return;
      setImage(prepared);
      setCrop(FULL_CROP);
    } catch (cause) {
      if (requestGeneration.current === token) setError(`恢复失败：${errorMessage(cause)}`);
    } finally {
      finish(token);
    }
  }, [finish, image, start]);

  const recognize = useCallback(async () => {
    if (!image) return;
    if (!isFullCrop(crop)) { setError('先应用裁剪，或重置裁剪区域后再识别。'); return; }
    const token = start('recognizing');
    if (token === null) return;
    const workflowStarted = performance.now();
    setSaveNotice(null);
    try {
      const record = await recognizeAndCapture(image);
      if (requestGeneration.current !== token) return;
      setEvidence(record);
      const saveStarted = performance.now();
      let evidenceSaved = false;
      try {
        const saved = await saveEvidence(record);
        if (requestGeneration.current !== token) return;
        setSavedEvidence(saved);
        evidenceSaved = true;
        setSaveNotice('原图、处理图及真实 OCR JSON 已保存在本机。');
      } catch (cause) {
        if (requestGeneration.current === token) {
          setSavedEvidence(null);
          setSaveNotice(`OCR 已完成，但证据保存失败：${errorMessage(cause)}`);
        }
      }
      const saveMs = performance.now() - saveStarted;
      const workflowMs = performance.now() - workflowStarted;
      if (requestGeneration.current !== token) return;
      // Performance persistence has its own error channel; a failure cannot hide valid OCR.
      const performanceToken = ++performanceGeneration.current;
      try {
        const measurement = makePerformanceRecord(record, {
          device: performanceDevice(), workflowMs, evidenceSaveMs: saveMs, evidenceSaved,
        });
        setPerformanceRecords((previous) => appendPerformanceRecord(previous, measurement));
        const records = await performanceStore.append(measurement);
        if (performanceGeneration.current !== performanceToken) return;
        setPerformanceRecords(records);
        setPerformanceError(null);
      } catch (cause) {
        if (performanceGeneration.current === performanceToken) {
          setPerformanceError(`OCR 已完成，但性能历史保存失败：${errorMessage(cause)}`);
        }
      }
    } catch (cause) {
      if (requestGeneration.current === token) setError(`本地 OCR 失败：${errorMessage(cause)}`);
    } finally {
      finish(token);
    }
  }, [crop, finish, image, start]);

  const exportLastEvidence = useCallback(async (kind: 'record' | 'original' | 'processed' = 'record') => {
    if (!savedEvidence) return;
    const token = start('exporting', false);
    if (token === null) return;
    try { await shareEvidence(savedEvidence, kind); }
    catch (cause) { if (requestGeneration.current === token) setError(errorMessage(cause)); }
    finally { finish(token); }
  }, [finish, savedEvidence, start]);

  return {
    image, crop, cropStatus, evidence, savedEvidence, phase, error, saveNotice,
    performanceRecords, performanceError, performanceSummary, clearPerformanceRecords,
    busy: phase !== 'idle', cropPending: !isFullCrop(crop),
    choosePhoto, updateCrop, resetCrop, transform, restoreOriginal, recognize, exportLastEvidence,
  };
}
