import { Alert, Image, Pressable, Text, View } from 'react-native';
import { C, S, Button, Choices, Field } from './ui';
import { type AppController, basis } from './useSimpleApp';
import type { FoodReviewValues } from '../../domain/food/scan';
import { normalizeBarcode } from '../../domain/barcode/normalize';
import { type CaptureDraft, deleteProduct, addStock } from './store';
export function ProductScreens(p: AppController) {
  const { setTab, screen, product, cover, setNotice, setConfirmed, quantity, setQuantity, unit, setUnit, expiry, setExpiry, request, draftRef, refresh, task, navigate, showStock, setDraft, setReview, setEditing } = p;
  return <>
    {screen === 'product' && product && <>
      {cover && <Image source={{ uri: cover }} resizeMode="contain" style={S.productPhoto} />}<Text style={S.title}>{product.review.name}</Text><Text style={S.note}>{product.review.brand || '本地食品'} · {product.status === 'confirmed' ? '已人工核对' : '待确认'}</Text><Text style={S.small}>条码 {product.barcodes?.map(b => b.rawValue).join(' / ') || '尚未绑定'}</Text>
      <View style={S.card}><Text style={S.section}>营养成分</Text>{product.review.columns.map(c => <View style={{ gap: 10 }} key={c.id}><Text style={S.eyebrow}>{basis(c)}</Text>{c.rows.map(r => <View style={S.sectionRow} key={r.nutrient}><Text style={S.label}>{r.label}</Text><Text style={S.label}>{r.amount || '未记录'} {r.unit === 'unknown' ? '' : r.unit}<Text style={S.small}>{r.nrvPercent ? `  · ${r.nrvPercent}%` : ''}</Text></Text></View>)}</View>)}</View>
      <Text style={S.note}>是否加入我的库存？每次购买单独记一笔，不会重复建立商品资料。</Text><Button title="加入我的库存" disabled={product.status !== 'confirmed'} onPress={showStock} />
      <Button title="核对或修改商品资料" secondary onPress={() => {
        const b = product.barcodes?.[0];
        const d: CaptureDraft = { id: product.id, barcode: normalizeBarcode({ rawValue: b?.rawValue ?? '', format: b?.format ?? 'EAN_13', decodedAt: new Date().toISOString() }), acquiredBy: b?.acquiredBy ?? 'manual', step: 'review', name: product.review.name, brand: product.review.brand, nutrition: product.evidence, review: JSON.parse(JSON.stringify(product.review)) as FoodReviewValues };
        setEditing(product); draftRef.current = d; setDraft(d); setReview(d.review!); setConfirmed(false); navigate('review');
      }} />
      <Button title="暂不入库，返回首页" secondary onPress={() => navigate('home')} />
      <Pressable onPress={() => Alert.alert('删除商品资料？', '删除该食品资料。有关联库存时会拒绝删除。', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => void task('正在删除', async () => { await deleteProduct(product.id); await refresh(); navigate('home'); }) }])}><Text style={[S.link, { color: C.red, textAlign: 'center' }]}>删除商品资料</Text></Pressable>
    </>}
    {screen === 'add-stock' && product && <>
      <Text style={S.title}>{product.review.name}</Text><Text style={S.note}>只增加库存，不复制商品资料或重新识别营养表。</Text>
      <View style={S.card}><Field label="本次购入数量" value={quantity} numeric onChange={setQuantity} /><Choices value={unit} options={['件', '瓶', '盒', '袋', '罐', '包', '个'].map(v => [v, v])} onChange={setUnit} /><Field label="到期日（选填）" value={expiry} onChange={setExpiry} placeholder="YYYY-MM-DD" /></View>
      <Button title="确认加入库存" onPress={() => void task('正在加入库存', async () => { await addStock(product.id, quantity, unit, expiry, request); await refresh(); setTab('stock'); navigate('home'); setNotice('已加入库存。商品资料没有重复创建。'); })} />
      <Button title="取消" secondary onPress={() => navigate('product')} />
    </>}
  </>;
}
