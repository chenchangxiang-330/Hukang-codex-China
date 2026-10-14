import { Image, Pressable, Text, View } from 'react-native';
import { C, S, Button, Choices, Check, Field } from './ui';
import { type AppController, labels } from './useSimpleApp';
import type { NutritionReviewColumn, NutritionUnit } from '../../domain/food/scan';
export function CaptureScreens(p: AppController) {
  const { screen, draft, review, confirmed, setConfirmed, originalText, setOriginalText, draftRef, patchDraft, retainDraft, task, navigate, capture, readPackage, updateReview, updateColumn, saveFood, editing } = p;
  return <>
    {['package', 'nutrition', 'review'].includes(screen) && draft && <><View style={S.progress}>{['包装', '营养表', '确认'].map((label, i) => <View style={[S.progressItem, ['package', 'nutrition', 'review'].indexOf(screen) >= i && { backgroundColor: C.teal }]} key={label}><Text style={{ color: ['package', 'nutrition', 'review'].indexOf(screen) >= i ? 'white' : C.muted, fontSize: 13 }}>{i + 1} · {label}</Text></View>)}</View><Text style={S.small}>条码 {draft.barcode.scan.rawValue}</Text></>}
    {screen === 'package' && draft && <>
      <Text style={S.title}>先记下它的样子</Text><Text style={S.note}>拍包装正面，让商品名和品牌清晰可见。照片也会作为商品封面。</Text>
      {draft.packageImage && <Image source={{ uri: draft.packageImage.uri }} resizeMode="contain" style={S.photo} />}
      <Button title={draft.packageImage ? '重新拍包装' : '拍包装正面'} onPress={() => void capture('package')} /><Button title="从相册选择包装" secondary onPress={() => void capture('package', true)} />
      {draft.packageImage && <Button title="读取包装文字（可选）" secondary onPress={() => void readPackage()} />}
      {draft.packageOcr && <View style={S.card}><Text style={S.note}>点选商品名称候选，或直接手动填写。识别文字不等于已确认商品。</Text><View style={S.wrap}>{draft.packageOcr.ocr.blocks.filter(b => b.text.length >= 2 && b.text.length <= 24).slice(0, 14).map(b => <Pressable style={S.chip} key={b.id} onPress={() => patchDraft({ name: b.text })}><Text style={{ color: C.ink }}>{b.text}</Text></Pressable>)}</View></View>}
      <Field label="商品名称" value={draft.name} onChange={name => patchDraft({ name })} placeholder="例如：纯牛奶" /><Field label="品牌（选填）" value={draft.brand} onChange={brand => patchDraft({ brand })} /><Field label="规格（选填）" value={draft.specification ?? ''} onChange={specification => patchDraft({ specification })} placeholder="例如：250 mL" />
      <Button title="下一步，拍营养表" disabled={!draft.packageImage || !draft.name.trim()} onPress={() => void task('正在保存草稿', async () => { await retainDraft({ ...draftRef.current!, step: 'nutrition' }); navigate('nutrition'); })} />
    </>}
    {screen === 'nutrition' && draft && <>
      <Text style={S.title}>再拍营养成分表</Text><Text style={S.note}>{draft.name} · 请让完整表格入镜，包含「每100g / 每100mL / 每份」，避免反光。</Text>
      <View style={S.tablePlaceholder}><Text style={S.section}>营养成分表</Text>{labels.map(label => <View key={label} style={S.fakeRow}><Text style={S.note}>{label}</Text><View style={S.fakeLine} /></View>)}</View>
      <Button title="拍营养表并识别" onPress={() => void capture('nutrition')} /><Button title="从相册选择营养表" secondary onPress={() => void capture('nutrition', true)} /><Button title="返回修改包装信息" secondary onPress={() => navigate('package')} /><Text style={S.small}>这只是取景提示，不是示例营养数据。</Text>
    </>}
    {screen === 'review' && draft?.nutrition && review && <>
      <Text style={S.title}>最后，核对一下</Text><Text style={S.note}>对照照片检查单位、小数点和计量基准。看不清就重拍，不会把未知值当成零。</Text>
      <Image source={{ uri: draft.nutrition.image.uri }} resizeMode="contain" style={S.nutritionPhoto} /><Field label="商品名称" value={review.name} onChange={name => updateReview({ ...review, name })} /><Field label="规格（选填）" value={review.specification ?? ''} onChange={specification => updateReview({ ...review, specification })} placeholder="例如：250 mL" />
      {review.columns.map(column => <View style={S.card} key={column.id}>
        <Text style={S.rowTitle}>这一列是按多少计算？</Text><Choices value={column.basisKind} options={ [['per_100g', '每100g'], ['per_100ml', '每100mL'], ['per_serving', '每份']] } onChange={v => updateColumn(column.id, { basisKind: v as NutritionReviewColumn['basisKind'] })} />
        {column.basisKind === 'per_serving' && <><Field label="包装标明的每份大小" value={column.servingAmount} numeric onChange={v => updateColumn(column.id, { servingAmount: v })} /><Choices value={column.servingUnit} options={ [['g', 'g'], ['mL', 'mL']] } onChange={v => updateColumn(column.id, { servingUnit: v as 'g' | 'mL' })} /><Check label="包装未标注每份大小" value={column.servingSizeNotDeclared} onChange={v => updateColumn(column.id, { servingSizeNotDeclared: v, servingAmount: v ? '' : column.servingAmount })} /></>}
        {column.rows.map((row, index) => <View key={row.nutrient} style={S.nutrientRow}>
          <Text style={S.rowTitle}>{row.label}</Text><View style={S.two}><View style={{ flex: 1 }}><Field label={`${row.label}含量`} numeric value={row.amount} onChange={amount => updateColumn(column.id, { rows: column.rows.map((r, i) => i === index ? { ...r, amount } : r) })} /></View><View style={{ flex: 1 }}><Field label={`${row.label} NRV%`} numeric value={row.nrvPercent} onChange={nrvPercent => updateColumn(column.id, { rows: column.rows.map((r, i) => i === index ? { ...r, nrvPercent, nrvNotDeclared: false } : r) })} /></View></View>
          <Choices value={row.unit} options={(row.nutrient === 'energy' ? ['kJ', 'kcal'] : ['g', 'mg', 'µg']).map(v => [v, v])} onChange={v => updateColumn(column.id, { rows: column.rows.map((r, i) => i === index ? { ...r, unit: v as NutritionUnit } : r) })} />
          {!row.nrvPercent && <Check label="包装未标注这一项的 NRV%" value={row.nrvNotDeclared} onChange={v => updateColumn(column.id, { rows: column.rows.map((r, i) => i === index ? { ...r, nrvNotDeclared: v } : r) })} />}
        </View>)}
      </View>)}
      <Check label="我已对照照片，逐项核对以上数值、单位、NRV% 和计量基准" value={confirmed} onChange={setConfirmed} /><Button title="确认并保存食品" disabled={!confirmed} onPress={() => void saveFood()} />
      {!editing && <Button title="营养表不清楚，重新拍摄" secondary onPress={() => navigate('nutrition')} />}
      <Pressable onPress={() => setOriginalText(v => !v)}><Text style={S.link}>{originalText ? '收起识别原文' : '查看识别原文'}</Text></Pressable>{originalText && <Text selectable style={S.small}>{draft.nutrition.ocr.rawText}</Text>}
    </>}
  </>;
}
