import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { OcrEvidence } from '../../application/usecases/OcrLabUseCases';

export type SavedEvidence = Readonly<{
  directoryUri: string;
  recordUri: string;
  originalUri: string;
  processedUri: string;
}>;

function imageExtension(uri: string): string {
  const suffix = uri.split(/[?#]/)[0]?.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
  return suffix && ['png', 'jpg', 'jpeg', 'webp', 'heic', 'heif'].includes(suffix) ? suffix : 'bin';
}

export async function saveEvidence(evidence: OcrEvidence): Promise<SavedEvidence> {
  const directory = new Directory(Paths.document, 'ocr-evidence', evidence.id);
  directory.create({ intermediates: true, idempotent: true });
  const original = new File(directory, `original.${imageExtension(evidence.image.originalUri)}`);
  const processed = new File(directory, `processed.${imageExtension(evidence.image.uri)}`);
  await new File(evidence.image.originalUri).copy(original);
  await new File(evidence.image.uri).copy(processed);
  const record = new File(directory, 'record.json');
  record.write(JSON.stringify({
    ...evidence,
    savedFiles: { original: original.name, processed: processed.name },
  }, null, 2));
  return { directoryUri: directory.uri, recordUri: record.uri, originalUri: original.uri, processedUri: processed.uri };
}

export async function shareEvidence(saved: SavedEvidence, kind: 'record' | 'original' | 'processed' = 'record'): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('此设备没有可用的系统分享目标。原始证据已保存在本机。');
  const uri = kind === 'record' ? saved.recordUri : kind === 'original' ? saved.originalUri : saved.processedUri;
  await Sharing.shareAsync(uri, {
    mimeType: kind === 'record' ? 'application/json' : 'image/*',
    dialogTitle: kind === 'record' ? '导出 OCR 原始证据' : kind === 'original' ? '导出原始图片' : '导出处理后图片',
  });
}
