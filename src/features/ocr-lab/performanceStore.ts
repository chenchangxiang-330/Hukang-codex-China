import { Directory, File, Paths } from 'expo-file-system';
import { appendPerformanceRecord, decodePerformanceHistory, type OcrPerformanceRecord } from './performance';

const directory = () => new Directory(Paths.document, 'ocr-performance');
const history = () => new File(directory(), 'history-v1.json');
let pending: Promise<unknown> = Promise.resolve();

/** Serialize read-modify-write so clear/append cannot race within the app process. */
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation, operation);
  pending = result.catch(() => undefined);
  return result;
}

async function read(): Promise<readonly OcrPerformanceRecord[]> {
  const file = history();
  if (!file.exists) return [];
  return decodePerformanceHistory(JSON.parse(await file.text()));
}

async function write(records: readonly OcrPerformanceRecord[]): Promise<void> {
  directory().create({ intermediates: true, idempotent: true });
  // A same-directory temporary file protects existing history if writing fails.
  const temporary = new File(directory(), 'history-v1.pending.json');
  temporary.write(JSON.stringify({ schemaVersion: 1, records }, null, 2));
  // File.move is asynchronous and the destination is the canonical history
  // file. Await the replacement so the next serialized read never observes a
  // missing or half-written performance history.
  await temporary.move(history(), { overwrite: true });
}

export const performanceStore = {
  load: () => serial(read),
  append: (record: OcrPerformanceRecord) => serial(async () => {
    const records = appendPerformanceRecord(await read(), record);
    await write(records);
    return records;
  }),
  clear: () => serial(async () => {
    await write([]);
    return [] as readonly OcrPerformanceRecord[];
  }),
};
