import type { OcrBlock, OcrDocument, Point } from '../ocr/types';
import type { NutrientId, NutritionBasis } from './types';
import { CORE_NUTRIENTS } from './scan';
import type { NutritionUnit, ParsedNutritionCell, ParsedNutritionColumn, ParsedNutritionLabel } from './scan';

export const NUTRITION_PARSER_VERSION = 'china-label-geometry/1.0.0';
export const NUTRIENT_LABELS: Readonly<Record<NutrientId, string>> = {
  energy: '能量', protein: '蛋白质', fat: '脂肪', carbohydrate: '碳水化合物', sodium: '钠',
  saturated_fat: '饱和脂肪', trans_fat: '反式脂肪', sugars: '糖', dietary_fiber: '膳食纤维', other: '其他',
};
const aliases: Readonly<Record<string, NutrientId>> = {
  能量: 'energy', 蛋白质: 'protein', 脂肪: 'fat', 碳水化合物: 'carbohydrate', 钠: 'sodium',
  饱和脂肪: 'saturated_fat', 饱和脂肪酸: 'saturated_fat', 反式脂肪: 'trans_fat',
  反式脂肪酸: 'trans_fat', 糖: 'sugars', 总糖: 'sugars', 膳食纤维: 'dietary_fiber',
};
/** Only typography normalization, never digit substitution, punctuation repair or inferred decimals. */
function compact(text: string): string {
  return text.replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/％/g, '%')
    .replace(/[＜]/g, '<').replace(/≤/g, '<=').replace(/[．]/g, '.').replace(/\s/g, '');
}
export function parsePrintedNumber(text: string): {
  numericText: string; value: number; comparator: ParsedNutritionCell['comparator'];
} | null {
  // Whitespace *inside* a printed number may conceal a lost decimal; never concatenate it.
  const normalized = text.trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/＜/g, '<').replace(/≤/g, '<=').replace(/．/g, '.');
  const match = /^(<=|<)?(\d+(?:\.\d+)?)$/.exec(normalized);
  if (!match) return null;
  const value = Number(match[2]);
  if (!Number.isFinite(value) || value < 0) return null;
  return { numericText: match[2]!, value, comparator: match[1] === '<' ? 'less_than' : match[1] === '<=' ? 'less_than_or_equal' : 'exact' };
}

function unitOf(text: string): NutritionUnit {
  const units: Readonly<Record<string, NutritionUnit>> = {
    kj: 'kJ', 千焦: 'kJ', '千焦(kj)': 'kJ', kcal: 'kcal', 千卡: 'kcal', '千卡(kcal)': 'kcal',
    g: 'g', 克: 'g', '克(g)': 'g', mg: 'mg', 毫克: 'mg', '毫克(mg)': 'mg',
    'µg': 'µg', 'μg': 'µg', ug: 'µg', 微克: 'µg', '微克(µg)': 'µg', '微克(μg)': 'µg', '微克(ug)': 'µg',
  };
  return units[compact(text).toLowerCase()] ?? 'unknown';
}
export function isCompatibleNutritionUnit(nutrient: NutrientId, unit: NutritionUnit): boolean {
  return nutrient === 'energy' ? unit === 'kJ' || unit === 'kcal' : unit === 'g' || unit === 'mg' || unit === 'µg';
}

interface Located { block: OcrBlock; x: number; y: number; left: number; right: number; top: number; bottom: number; height: number }
interface Header { position: Located; basis: NutritionBasis; issues: string[] }
interface RowLabel { position: Located; nutrient: NutrientId; issues: string[] }
function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
function locate(blocks: readonly OcrBlock[]): Located[] {
  // Table header centres define row direction more reliably than glyph slopes on curved packaging.
  // Top edges are a fallback only: opposite package sides can have differently tilted glyphs.
  const anchors = blocks.filter(block => /^(?:项目|每100(?:g|克(?:\(g\))?|ml|毫升(?:\(ml\))?)|每(?:份|包|袋|瓶).*|NRV%)$/i.test(compact(block.text)))
    .map(block => ({ x: (block.boundingBox.left + block.boundingBox.right) / 2, y: (block.boundingBox.top + block.boundingBox.bottom) / 2,
      height: block.boundingBox.bottom - block.boundingBox.top }));
  const headerSlopes = anchors.flatMap((a, index) => anchors.slice(index + 1).flatMap(b => {
    if (Math.abs(a.x - b.x) < Math.max(a.height, b.height) * 2 || Math.abs(a.y - b.y) > Math.max(a.height, b.height) * 1.5) return [];
    const slope = Math.atan((b.y - a.y) / (b.x - a.x));
    return Math.abs(slope) <= Math.PI / 6 ? [slope] : [];
  }));
  // Sorting is geometric and deterministic even when OCR block order changes.
  const slopes = blocks.filter(block => aliases[compact(block.text)] || /^(每|NRV)/i.test(compact(block.text)))
    .flatMap(block => {
      const first = block.polygon[0], second = block.polygon[1];
      if (!first || !second || second.x <= first.x) return [];
      const angle = Math.atan2(second.y - first.y, second.x - first.x);
      return Math.abs(angle) <= Math.PI / 6 ? [angle] : [];
    });
  const angle = median(headerSlopes.length ? headerSlopes : slopes), cosine = Math.cos(angle), sine = Math.sin(angle);
  const turn = (point: Point): Point => ({ x: point.x * cosine + point.y * sine, y: -point.x * sine + point.y * cosine });
  return blocks.map(block => {
    const box = block.boundingBox;
    const corners = block.polygon.length >= 4 ? block.polygon : [
      { x: box.left, y: box.top }, { x: box.right, y: box.top },
      { x: box.right, y: box.bottom }, { x: box.left, y: box.bottom },
    ];
    const points = corners.map(turn), xs = points.map(p => p.x), ys = points.map(p => p.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    return { block, left, right, top, bottom, x: (left + right) / 2, y: (top + bottom) / 2, height: bottom - top };
  }).sort((a, b) => a.y - b.y || a.x - b.x || a.block.id.localeCompare(b.block.id));
}
function detectBasis(position: Located): Header | null {
  const text = compact(position.block.text), lower = text.toLowerCase();
  if (/^每100(?:g|克(?:\(g\))?)$/.test(lower)) return { position, basis: { kind: 'per_100g', rawText: position.block.text }, issues: [] };
  if (/^每100(?:ml|毫升(?:\(ml\))?)$/.test(lower)) return { position, basis: { kind: 'per_100ml', rawText: position.block.text }, issues: [] };
  if (/^每(?:份|包|袋|瓶)/.test(lower)) {
    const serving = /^每(?:份|包|袋|瓶)(?::)?(?:\((.+)\)|(.+))?$/.exec(lower);
    const body = serving?.[1] ?? serving?.[2] ?? '';
    const quantity = /^(\d+(?:\.\d+)?)(g|克(?:\(g\))?|ml|毫升(?:\(ml\))?)$/.exec(body);
    const amount = quantity?.[1] && !/\d\s+\d/.test(position.block.text) ? Number(quantity[1]) : null;
    const unit = quantity?.[2] ? (/^(g|克)/.test(quantity[2]) ? 'g' : 'mL') : null;
    const issues = !serving || body && !quantity || /\d\s+\d/.test(position.block.text) || amount === 0 ? ['份量文字或大小需要人工核对'] : amount === null ? ['未识别到每份大小，请核对是否印有份量'] : [];
    return { position, basis: { kind: 'per_serving', rawText: position.block.text, servingAmount: amount && unit ? amount : null, servingUnit: amount && unit ? unit : null }, issues };
  }
  if (/^每/.test(lower) && /\d|份|克|毫升|[gm]/.test(lower)) {
    return { position, basis: { kind: 'unknown', rawText: position.block.text }, issues: ['营养计量基准无法确定'] };
  }
  return null;
}

function missingCell(issue: string): ParsedNutritionCell {
  return { rawText: null, numericText: null, value: null, unit: 'unknown', comparator: 'unknown', status: 'missing', blockIds: [], issues: [issue] };
}
function readCell(positions: readonly Located[], nutrient: NutrientId, role: 'amount' | 'nrv', inheritedIssues: readonly string[] = []): ParsedNutritionCell {
  if (!positions.length) return missingCell(role === 'nrv' ? '未识别到此行 NRV%' : '未识别到此行数值');
  const ordered = [...positions].sort((a, b) => a.x - b.x || a.y - b.y || a.block.id.localeCompare(b.block.id));
  const rawText = ordered.map(p => p.block.text).join('\n'), blockIds = ordered.map(p => p.block.id);
  const issues = [...inheritedIssues];
  let text = ordered[0]!.block.text.trim();
  if (ordered.length === 2 && role === 'amount') {
    const numberPosition = ordered.find(p => parsePrintedNumber(p.block.text) !== null);
    const unitPosition = ordered.find(p => unitOf(p.block.text) !== 'unknown');
    if (numberPosition && unitPosition && numberPosition !== unitPosition && numberPosition.right <= unitPosition.left &&
      unitPosition.left - numberPosition.right <= Math.max(numberPosition.height, unitPosition.height) * 1.5) {
      text = numberPosition.block.text.trim() + unitPosition.block.text.trim();
    } else issues.push('同一单元格包含多个文字块，数字、小数点或单位关系待确认');
  } else if (ordered.length !== 1) issues.push('同一单元格包含多个文字块，数字、小数点或行列关系待确认');
  if (ordered.some(p => !Number.isFinite(p.block.confidence) || p.block.confidence < 0.8)) issues.push('OCR 置信度较低');
  let numericText: string | null = null, value: number | null = null;
  let comparator: ParsedNutritionCell['comparator'] = 'unknown', unit: NutritionUnit = 'unknown';
  if (role === 'nrv') {
    const match = /^(\d+(?:\.\d+)?)\s*[%％]$/.exec(text);
    const printed = match ? parsePrintedNumber(match[1]!) : null;
    if (printed) ({ numericText, value, comparator } = printed);
    else issues.push('NRV% 必须是明确数字后接百分号；不修复倒置或粘连文字');
  } else {
    const match = /^(<=|<|＜|≤)?([０-９\d]+(?:[．.][０-９\d]+)?)\s*([^\d０-９\s].*)$/.exec(text);
    const printed = match ? parsePrintedNumber((match[1] ?? '') + match[2]!) : null;
    if (printed) {
      ({ numericText, value, comparator } = printed);
      unit = unitOf(match![3]!);
      if (unit === 'unknown') issues.push('单位缺失或含不明确字符；不自动修复单位');
      else if (!isCompatibleNutritionUnit(nutrient, unit)) issues.push('单位与营养项目不一致');
    } else issues.push('数字、单位或小数点无法确定；不拼接数字或补小数点');
  }
  // Ambiguous multi-block content must not leak a plausible first value into the review form.
  if (issues.some(issue => issue.startsWith('同一单元格'))) { numericText = null; value = null; comparator = 'unknown'; unit = 'unknown'; }
  return { rawText, numericText, value, unit, comparator, status: issues.length ? 'needs_confirmation' : 'candidate', blockIds, issues: [...new Set(issues)] };
}

/** Table candidates use polygon-adjusted rows and header-derived columns, never OCR array/text order. */
export function parseNutritionLabel(ocr: OcrDocument): ParsedNutritionLabel {
  const positions = locate(ocr.blocks.filter(block => block.page === 0));
  const used = new Set<string>(), issues: string[] = [];
  const labels: RowLabel[] = positions.flatMap(position => {
    const nutrient = aliases[compact(position.block.text).replace(/[:：]$/, '')];
    if (nutrient) { used.add(position.block.id); return [{ position, nutrient, issues: [] }]; }
    // An OCR merged label such as 钠钙 is not equivalent to a clear 钠 row.
    if (/^(钠钙|钙钠)$/.test(compact(position.block.text))) issues.push('存在合并营养项目文字，不能确定钠与钙的行关系');
    return [];
  });
  const detectedHeaders = positions.flatMap(position => { const header = detectBasis(position); return header ? [header] : []; });
  const nrvHeaders = positions.filter(p => /^NRV[%％]$/i.test(compact(p.block.text)));
  const titlePositions = positions.filter(p => /^营养成[分份]表$/.test(compact(p.block.text)));
  titlePositions.forEach(p => used.add(p.block.id));
  if (titlePositions.length > 1) issues.push('图片包含多张营养表，请分别裁剪后识别');
  // Header candidates must precede detected nutrient rows, excluding unrelated 每... marketing text.
  const firstLabelY = labels.length ? Math.min(...labels.map(l => l.position.y)) : Number.POSITIVE_INFINITY;
  let headers = detectedHeaders.filter(h => h.position.y < firstLabelY).sort((a, b) => a.position.x - b.position.x || a.position.block.id.localeCompare(b.position.block.id));
  if (headers.length !== detectedHeaders.length) issues.push('检测到表格下方基准文字，未用于自动关联');
  if (!headers.length) {
    issues.push('未识别到每100g、每100mL或每份基准');
    const amounts = positions.filter(p => /\d/.test(p.block.text) && !/%|％/.test(p.block.text) && p.x > median(labels.map(l => l.position.right)));
    const inferredX = amounts.length ? median(amounts.map(p => p.x)) : ocr.width / 2;
    const synthetic = { block: { id: '__unknown_basis__', text: '', page: 0, confidence: 0, polygon: [], boundingBox: { left: inferredX, right: inferredX, top: 0, bottom: 0 } },
      x: inferredX, y: firstLabelY - 100, left: inferredX, right: inferredX, top: firstLabelY - 100, bottom: firstLabelY - 100, height: 1 };
    headers = [{ position: synthetic, basis: { kind: 'unknown', rawText: '' }, issues: ['营养计量基准需要人工指定'] }];
  }
  headers.forEach(h => { if (h.position.block.id !== '__unknown_basis__') used.add(h.position.block.id); });
  nrvHeaders.forEach(p => used.add(p.block.id));
  if (headers.length > 1 && nrvHeaders.length !== headers.length) issues.push('多个数值列的 NRV% 列关系不完整，需要逐列确认');
  const allHeaders = [...headers.map(h => ({ x: h.position.x, role: 'amount' as const, header: h })),
    ...nrvHeaders.map(p => ({ x: p.x, role: 'nrv' as const, position: p }))].sort((a, b) => a.x - b.x);
  const labelYs = [...labels.map(l => l.position.y)].sort((a, b) => a - b);
  const rowGap = median(labelYs.slice(1).map((y, i) => y - labelYs[i]!).filter(g => g > 2)) || median(labels.map(l => l.position.height)) * 1.3 || 24;
  const lastLabelY = labels.length ? Math.max(...labelYs) : 0;
  const maxLabelRight = labels.length ? Math.max(...labels.map(l => l.position.right)) : 0;
  const duplicateNutrients = new Set(labels.filter(l => labels.filter(other => other.nutrient === l.nutrient).length > 1).map(l => l.nutrient));
  if (duplicateNutrients.size) issues.push('同一营养项目出现多个行，自动解析保留待确认状态');
  const columns: ParsedNutritionColumn[] = headers.map((header, columnIndex) => {
    const amountIndex = allHeaders.findIndex(h => h.role === 'amount' && h.header === header);
    const amountHeader = allHeaders[amountIndex]!;
    const next = allHeaders[amountIndex + 1];
    const nrvPosition = next?.role === 'nrv' ? next.position : null;
    const columnIssues = [...header.issues];
    if (!nrvPosition) columnIssues.push('没有与此基准明确对应的 NRV% 表头');
    if (headers.length > 1 && nrvHeaders.length !== headers.length) columnIssues.push('多个基准与 NRV% 的关系待确认');
    const amountsByRow = new Map<NutrientId, Located[]>(), nrvByRow = new Map<NutrientId, Located[]>();
    const cellGeometryIssues = new Map<string, string[]>();
    for (const position of positions) {
      if (used.has(position.block.id) || position.x <= maxLabelRight || position.y < firstLabelY - rowGap * 0.45 || position.y > lastLabelY + rowGap * 0.45) continue;
      if (!/[\d０-９%％.．]|^(?:[gG]|[mM][gG]|千焦|千卡|克|毫克|微克)$/.test(position.block.text)) continue;
      const nearestHeader = allHeaders.map((candidate, i) => ({ candidate, i, distance: Math.abs(position.x - candidate.x) })).sort((a, b) => a.distance - b.distance)[0];
      if (!nearestHeader) continue;
      const role = nearestHeader.i === amountIndex ? 'amount' : nrvPosition && nearestHeader.candidate.role === 'nrv' && nearestHeader.candidate.position === nrvPosition ? 'nrv' : null;
      if (!role) continue;
      const nearestRows = labels.map(label => ({ label, distance: Math.abs(position.y - label.position.y) })).sort((a, b) => a.distance - b.distance || a.label.position.block.id.localeCompare(b.label.position.block.id));
      const nearest = nearestRows[0];
      if (!nearest || nearest.distance > rowGap * 0.58) continue;
      const row = nearest.label.nutrient;
      const geometryIssues: string[] = [];
      if (nearestRows[1] && nearestRows[1].distance - nearest.distance < rowGap * 0.18) geometryIssues.push('数值位置处于两行之间，行关系待确认');
      if (position.height > rowGap * 1.65) geometryIssues.push('文字框跨越多行，行关系待确认');
      if (duplicateNutrients.has(row)) geometryIssues.push('营养项目有重复行，不能唯一关联');
      if (position.left < maxLabelRight && position.right > amountHeader.x) geometryIssues.push('文字框跨越项目与数值列，列关系待确认');
      const target = role === 'amount' ? amountsByRow : nrvByRow;
      target.set(row, [...(target.get(row) ?? []), position]);
      const key = `${row}/${role}`;
      cellGeometryIssues.set(key, [...(cellGeometryIssues.get(key) ?? []), ...geometryIssues]);
      used.add(position.block.id);
    }
    const optional = Object.keys(NUTRIENT_LABELS).filter(key => !CORE_NUTRIENTS.includes(key as typeof CORE_NUTRIENTS[number]) && labels.some(l => l.nutrient === key)) as NutrientId[];
    const rows = [...CORE_NUTRIENTS, ...optional].map(nutrient => {
      const rowLabels = labels.filter(l => l.nutrient === nutrient);
      const rowIssues = !rowLabels.length ? ['未识别到独立的营养项目行'] : duplicateNutrients.has(nutrient) ? ['营养项目行重复'] : [];
      const inherited = [...rowIssues, ...(header.basis.kind === 'unknown' ? ['基准未知，数值关系需确认'] : [])];
      return {
        nutrient, label: NUTRIENT_LABELS[nutrient], labelBlockIds: rowLabels.map(l => l.position.block.id),
        amount: readCell(amountsByRow.get(nutrient) ?? [], nutrient, 'amount', [...inherited, ...(cellGeometryIssues.get(`${nutrient}/amount`) ?? [])]),
        nrv: readCell(nrvByRow.get(nutrient) ?? [], nutrient, 'nrv', [...inherited, ...(cellGeometryIssues.get(`${nutrient}/nrv`) ?? []), ...(headers.length > 1 && nrvHeaders.length !== headers.length ? ['NRV% 基准关系待确认'] : [])]),
        issues: rowIssues,
      };
    });
    return { id: `column-${columnIndex + 1}`, basis: header.basis, basisBlockIds: header.position.block.id === '__unknown_basis__' ? [] : [header.position.block.id], rows, issues: columnIssues };
  });
  const completeCandidateTable = issues.length === 0 && columns.length > 0 && columns.every(column =>
    column.issues.length === 0 && column.basis.kind !== 'unknown' && column.rows.every(row =>
      row.issues.length === 0 && row.amount.status === 'candidate' && row.nrv.status === 'candidate'));
  return { parserVersion: NUTRITION_PARSER_VERSION, ocrSourceImageHash: ocr.sourceImageHash, ocrProcessedImageHash: ocr.processedImageHash,
    columns, issues: [...new Set(issues)], completeCandidateTable,
    unassignedBlockIds: positions.filter(p => !used.has(p.block.id)).map(p => p.block.id).sort() };
}
