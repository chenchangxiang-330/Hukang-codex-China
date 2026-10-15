/** Replace app-private URIs only in an exported copy; never mutate saved evidence. */
export function portableExportValue(value: unknown, mappings: Readonly<Record<string, string>>): unknown {
  const pathFields = new Set(['uri', 'originalUri', 'imageUri', 'originalImageUri', 'evidenceUri', 'folderUri', 'localUri']);
  const convert = (item: unknown, field?: string): unknown => {
    if (typeof item === 'string' && (field === undefined || pathFields.has(field)) && /^(file|content):\/\//.test(item)) {
      return mappings[item] ?? null;
    }
    if (Array.isArray(item)) return item.map(entry => convert(entry, field));
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, convert(entry, key)]));
    }
    // Raw OCR text and user-entered values are not path fields, even if they
    // happen to start with "file://". Preserve their exact bytes as evidence.
    return item;
  };
  return convert(value);
}
