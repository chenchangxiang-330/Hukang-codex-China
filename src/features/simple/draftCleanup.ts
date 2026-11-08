import { File, Paths } from 'expo-file-system';
import { orphanDraftUris } from './draftFiles';
export async function cleanupDraftFiles(drafts: unknown[], references: unknown[]) {
  for (const uri of orphanDraftUris(drafts, references, Paths.document.uri)) {
    try { const file = new File(uri); if (file.exists) file.delete(); }
    catch { /* File cleanup never changes confirmed data or blocks fresh capture. */ }
  }
}
