import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import type { ImageAsset } from '../../domain/ocr/types';
import { recognizeAndCapture, type OcrEvidence } from '../../application/usecases/OcrLabUseCases';
import { hukangVision } from '../../infrastructure/ocr/HukangVision';
import { cropPercentToPixels, FULL_CROP, isFullCrop, type CropPercent } from './geometry';
import { saveEvidence, shareEvidence, type SavedEvidence } from './evidence';

export type LabPhase = 'idle' | 'selecting' | 'preparing' | 'transforming' | 'recognizing' | 'exporting';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useOcrLab() {
  const [image, setImage] = useState<ImageAsset | null>(null);
  const [crop, setCrop] = useState<CropPercent>(FULL_CROP);
  const [evidence, setEvidence] = useState<OcrEvidence | null>(null);
  const [savedEvidence, setSavedEvidence] = useState<SavedEvidence | null>(null);
  const [phase, setPhase] = useState<LabPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const running = useRef(false);

  useEffect(() => () => { requestGeneration.current += 1; }, []);

  const start = useCallback((nextPhase: LabPhase, invalidateResult = true) => {
    if (running.current) return null;
    running.current = true;
    const token = ++requestGeneration.current;
    setPhase(nextPhase);
    setError(null);
    if (invalidateResult) setEvidence(null);
    return token;
  }, []);

  const finish = useCallback((token: number) => {
    if (requestGeneration.current === token) {
      running.current = false;
      setPhase('idle');
    }
  }, []);

  const choosePhoto = useCallback(async () => {
    const token = start('selecting');
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
    setSaveNotice(null);
    try {
      const record = await recognizeAndCapture(image);
      if (requestGeneration.current !== token) return;
      setEvidence(record);
      try {
        const saved = await saveEvidence(record);
        if (requestGeneration.current !== token) return;
        setSavedEvidence(saved);
        setSaveNotice('原图、处理图及真实 OCR JSON 已保存在本机。');
      } catch (cause) {
        setSavedEvidence(null);
        setSaveNotice(`OCR 已完成，但证据保存失败：${errorMessage(cause)}`);
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
    busy: phase !== 'idle', cropPending: !isFullCrop(crop),
    choosePhoto, updateCrop, resetCrop, transform, restoreOriginal, recognize, exportLastEvidence,
  };
}
