import { Text, View } from 'react-native';
import type {
  NutritionReviewColumn, NutritionReviewRow, NutritionUnit, ParsedNutritionColumn,
} from '../../domain/food/scan';
import { FoodAction, FoodCheck, FoodChoices, FoodField, foodStyles } from './ui';

const basisOptions: readonly { value: NutritionReviewColumn['basisKind']; label: string }[] = [
  { value: 'per_100g', label: '每 100g' }, { value: 'per_100ml', label: '每 100mL' },
  { value: 'per_serving', label: '每份' }, { value: 'unknown', label: '待确认' },
];
const unitOptions: readonly { value: NutritionUnit; label: string }[] = [
  { value: 'kJ', label: 'kJ' }, { value: 'kcal', label: 'kcal' }, { value: 'g', label: 'g' },
  { value: 'mg', label: 'mg' }, { value: 'µg', label: 'µg' }, { value: 'unknown', label: '待确认' },
];
const servingUnitOptions: readonly { value: NutritionReviewColumn['servingUnit']; label: string }[] = [
  { value: 'g', label: 'g' }, { value: 'mL', label: 'mL' }, { value: 'unknown', label: '待确认' },
];

export function NutritionReviewForm({ column, candidate, index, disabled, onChange, onShowSource }: {
  column: NutritionReviewColumn; candidate: ParsedNutritionColumn | undefined; index: number; disabled: boolean;
  onChange: (column: NutritionReviewColumn) => void; onShowSource: (blockIds: readonly string[]) => void;
}) {
  const changeBasis = (patch: Partial<NutritionReviewColumn>) => onChange({ ...column, ...patch, reviewed: false });
  const changeRow = (rowIndex: number, patch: Partial<NutritionReviewRow>, reviewing = false) => {
    onChange({ ...column, rows: column.rows.map((row, current) => current === rowIndex
      ? { ...row, ...patch, reviewed: reviewing ? (patch.reviewed ?? false) : false } : row) });
  };
  const prefix = `营养${column.id}`;
  return <View style={foodStyles.card}>
    <Text style={foodStyles.sectionTitle}>营养表 · 第 {index + 1} 列</Text>
    <Text style={foodStyles.note}>逐列核对计量基准，再逐行核对数值、单位与 NRV%。空白不是 0；识别分数不能代替人工确认。</Text>
    <FoodChoices label="计量基准" accessibilityLabel={`${prefix}-计量基准`} value={column.basisKind}
      options={basisOptions} disabled={disabled} onChange={(basisKind) => changeBasis({
        basisKind, ...(basisKind !== 'per_serving' ? { servingAmount: '', servingUnit: 'unknown', servingSizeNotDeclared: false } : {}),
      })} />
    <Text selectable style={foodStyles.note}>表头原文：{candidate?.basis.rawText || '未确定。请对照照片选择。'}</Text>
    {candidate && candidate.basisBlockIds.length > 0 ? <FoodAction title={`查看第 ${index + 1} 列表头来源`}
      onPress={() => onShowSource(candidate.basisBlockIds)} /> : null}
    {column.basisKind === 'per_serving' ? <>
      <FoodField label="每份的份量" accessibilityLabel={`${prefix}-份量`} value={column.servingAmount}
        disabled={disabled || column.servingSizeNotDeclared} numeric onChangeText={(servingAmount) => changeBasis({ servingAmount })} />
      <FoodChoices label="份量单位" accessibilityLabel={`${prefix}-份量单位`} value={column.servingUnit}
        options={servingUnitOptions} disabled={disabled || column.servingSizeNotDeclared}
        onChange={(servingUnit) => changeBasis({ servingUnit })} />
      <FoodCheck label="已核对：包装未标注每份具体份量" accessibilityLabel={`${prefix}-份量未标注`}
        value={column.servingSizeNotDeclared} disabled={disabled} onChange={(servingSizeNotDeclared) => changeBasis({
          servingSizeNotDeclared, ...(servingSizeNotDeclared ? { servingAmount: '', servingUnit: 'unknown' } : {}),
        })} />
    </> : null}
    <FoodCheck label="已对照照片核对本列计量基准与份量" accessibilityLabel={`${prefix}-已核对`}
      value={column.reviewed} disabled={disabled} onChange={(reviewed) => onChange({ ...column, reviewed })} />
    {column.rows.map((row, rowIndex) => {
      const parsedRow = candidate?.rows.find((item) => item.nutrient === row.nutrient);
      const rowPrefix = `${prefix}-${row.nutrient}`;
      const sources = [...(parsedRow?.labelBlockIds ?? []), ...(parsedRow?.amount.blockIds ?? []), ...(parsedRow?.nrv.blockIds ?? [])];
      return <View key={`${row.nutrient}-${rowIndex}`} style={{ gap: 10 }}>
        <View style={foodStyles.divider} />
        <Text style={foodStyles.sectionTitle}>{row.label}</Text>
        <Text selectable style={foodStyles.note}>识别原文 · 含量：{parsedRow?.amount.rawText ?? '未确定'} · NRV%：{parsedRow?.nrv.rawText ?? '未确定'}</Text>
        {parsedRow?.amount.status !== 'candidate' || parsedRow.nrv.status !== 'candidate' || (parsedRow.issues.length > 0)
          ? <Text style={foodStyles.warning}>该行存在缺失或歧义，请查看原图后填写；无法确定时保存待确认记录。</Text> : null}
        {sources.length > 0 ? <FoodAction title={`查看第 ${index + 1} 列${row.label}来源`} onPress={() => onShowSource(sources)} /> : null}
        <FoodField label={`${row.label}数值`} accessibilityLabel={`${rowPrefix}-数值`} value={row.amount}
          disabled={disabled} numeric onChangeText={(amount) => changeRow(rowIndex, { amount })} />
        <FoodChoices label={`${row.label}单位`} accessibilityLabel={`${rowPrefix}-单位`} value={row.unit}
          options={unitOptions} disabled={disabled} onChange={(unit) => changeRow(rowIndex, { unit })} />
        <FoodField label={`${row.label} NRV%（只填百分比数值）`} accessibilityLabel={`${rowPrefix}-NRV`} value={row.nrvPercent}
          disabled={disabled || row.nrvNotDeclared} numeric onChangeText={(nrvPercent) => changeRow(rowIndex, { nrvPercent })} />
        <FoodCheck label="已核对：包装未标注该行 NRV%" accessibilityLabel={`${rowPrefix}-NRV未标注`}
          value={row.nrvNotDeclared} disabled={disabled} onChange={(nrvNotDeclared) => changeRow(rowIndex, {
            nrvNotDeclared, ...(nrvNotDeclared ? { nrvPercent: '' } : {}),
          })} />
        <FoodCheck label={`已对照照片核对${row.label}数值、单位和 NRV%`} accessibilityLabel={`${rowPrefix}-已核对`}
          value={row.reviewed} disabled={disabled} onChange={(reviewed) => changeRow(rowIndex, { reviewed }, true)} />
      </View>;
    })}
  </View>;
}
