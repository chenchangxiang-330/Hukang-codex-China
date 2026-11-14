/** Pure ownership/reference gate. JSON fields may embed JSON strings. */
export function fileUris(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    if (value.startsWith('file://')) into.add(value);
    else if (/^[\[{]/.test(value)) { try { fileUris(JSON.parse(value), into); } catch {} }
  } else if (Array.isArray(value)) value.forEach(v => fileUris(v, into));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => fileUris(v, into));
  return into;
}
export function orphanDraftUris(drafts: unknown[], references: unknown[], root: string): string[] {
  const keep = fileUris(references), candidates = fileUris(drafts), base = root.replace(/\/$/, '') + '/ocr-lab/';
  const owned = (uri: string) => uri.startsWith(base) && /^(images|runs)\/[a-f0-9-]+\.(?:png|jpg|jpeg|source|json)$/.test(uri.slice(base.length));
  // Metadata sidecars have the same UUID; keep them when any related saved image is referenced.
  for (const uri of [...candidates]) if (owned(uri) && /\.(png|source)$/.test(uri)) candidates.add(uri.replace(/\.(png|source)$/, '.json'));
  return [...candidates].filter(uri => owned(uri) && !keep.has(uri) &&
    ![...keep].some(ref => owned(ref) && ref.replace(/\.[^.]+$/, '') === uri.replace(/\.[^.]+$/, '')));
}

/** Call within the same transaction; a partially saved food is already permanent. */
export async function discardNewFoodDraftRows(tx: {
  getAllAsync<T>(sql: string): Promise<T[]>;
  runAsync(sql: string, id: string): Promise<unknown>;
}): Promise<{id: string; json: string}[]> {
  const rows = await tx.getAllAsync<{id: string; json: string}>(
    'SELECT d.id,d.json FROM simple_capture_drafts d WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.id=d.id)');
  for (const row of rows) await tx.runAsync('DELETE FROM simple_capture_drafts WHERE id=?', row.id);
  return rows;
}
