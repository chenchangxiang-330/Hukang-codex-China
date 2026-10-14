import { Alert, Image, Pressable, Switch, Text, View } from 'react-native';
import { C, S, Button, Field } from './ui';
import { type AppController } from './useSimpleApp';
import type { FoodSummary } from '../../domain/food/scan';
import { expiryLabel } from '../../domain/inventory/rules';
import { reduceStock, removeStock } from './store';
export function HomeScreens(p: AppController) {
  const { tab, screen, foods, stock, resume, search, setSearch, photos, setPhotos, draftRef, refresh, task, navigate, openProduct, startScan, exportData, date, setDraft, setReview } = p;
  const stockByUnit = stock.reduce<Record<string, number>>((totals, item) => {
    totals[item.unit] = (totals[item.unit] ?? 0) + item.quantity;
    return totals;
  }, {});
  const stockSummary = Object.entries(stockByUnit).map(([unit, quantity]) => `${quantity}${unit}`).join(' · ') || '0';
  const renderFood = (food: FoodSummary) => <Pressable accessibilityRole="button" key={food.id} onPress={() => void openProduct(food.id)} style={S.listRow}><View style={[S.smallMark, { backgroundColor: C.pale }]}><Text style={{ color: C.teal, fontSize: 19 }}>食</Text></View><View style={{ flex: 1, gap: 4 }}><Text style={S.rowTitle}>{food.name || '未命名食品'}</Text><Text style={S.note}>{food.brand || '本地食品'} · {food.status === 'confirmed' ? '已核对' : '待确认'}</Text></View><Text style={S.chevron}>›</Text></Pressable>;
  return <>
    {screen === 'home' && tab === 'today' && <>
      <View style={S.brandRow}><View><Text style={S.brand}>护康</Text><Text style={S.tagline}>今天，照顾好自己。</Text></View><Image source={require('../../../assets/icon.png')} style={S.logo} /></View>
      <View style={{ gap: 6, marginTop: 16 }}><Text style={S.eyebrow}>今天</Text><Text style={S.date}>{date.getMonth() + 1}月{date.getDate()}日 <Text style={{ fontSize: 23 }}>周{'日一二三四五六'[date.getDay()]}</Text></Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="拍一拍" onPress={() => void startScan()} style={S.hero}><View style={S.heroTop}><View style={S.cameraIcon}><View style={S.lens} /></View><Text style={S.heroArrow}>↗</Text></View><Text style={S.heroTitle}>拍一拍</Text><Text style={S.heroNote}>扫一扫条码，记下每一份安心。</Text><View style={S.heroBottom}><Text style={{ color: 'white', fontSize: 14 }}>查商品 · 拍包装 · 识营养</Text><Text style={{ color: 'white' }}>开始 →</Text></View></Pressable>
      <View style={S.stats}><View style={S.stat}><Text style={S.number}>{foods.length}<Text style={S.countUnit}> 种</Text></Text><Text style={S.note}>我的食品</Text></View><View style={S.statDivider} /><View style={S.stat}><Text style={S.number}>{stockSummary}</Text><Text style={S.note}>现有库存 · 按单位分别计数</Text></View></View>
      {resume && <Button title="继续上次未完成的录入" secondary onPress={() => { draftRef.current = resume; setDraft(resume); setReview(resume.review ?? null); navigate(resume.step); }} />}
      <View style={S.sectionRow}><Text style={S.section}>最近保存</Text><Pressable accessibilityRole="button" onPress={() => navigate('library')}><Text style={S.link}>全部食品 →</Text></Pressable></View>
      {foods.length ? foods.slice(0, 4).map(renderFood) : <View style={S.empty}><Text style={S.emptyTitle}>从第一件食品开始</Text><Text style={S.note}>拍下包装和营养表，核对后保存。再次扫描，无需重新录入。</Text></View>}
      <Text style={S.footer}>国产 OCR · 本机保存 · 无需联网</Text>
    </>}
    {screen === 'home' && tab === 'stock' && <>
      <Text style={S.brand}>我的库存</Text><Text style={S.tagline}>每次购买单独记录，商品资料只保存一次。</Text>
      <Button title="拍一拍，添加食品" onPress={() => void startScan()} /><Button title="从已有食品添加" secondary onPress={() => navigate('library')} />
      {!stock.length ? <View style={S.empty}><Text style={S.emptyTitle}>库存还是空的</Text><Text style={S.note}>打开商品详情，点击「加入我的库存」。</Text></View> : stock.map(item => <View style={S.card} key={item.id}>
        <Pressable onPress={() => void openProduct(item.food_id)}><Text style={S.rowTitle}>{item.name}</Text><Text style={S.note}>{expiryLabel(item.expires_on)}</Text></Pressable>
        <View style={S.sectionRow}><Text style={S.number}>{item.quantity}<Text style={S.countUnit}> {item.unit}</Text></Text><View style={S.wrap}>
          <Button title={`用掉1${item.unit}`} secondary onPress={() => void task('正在更新库存', async () => { if (item.quantity === 1) await removeStock(item.id); else await reduceStock(item.id); await refresh(); })} />
          <Pressable accessibilityRole="button" onPress={() => Alert.alert('移除这条库存？', '只移除本次入库记录，保留商品资料。', [{ text: '取消', style: 'cancel' }, { text: '移除', style: 'destructive', onPress: () => void task('正在移除', async () => { await removeStock(item.id); await refresh(); }) }])}><Text style={S.link}>移除</Text></Pressable>
        </View></View></View>)}
      <Text style={S.footer}>入库和用掉的包装数量不等于已摄入营养。</Text>
    </>}
    {screen === 'home' && tab === 'mine' && <>
      <Text style={S.brand}>我的</Text><Text style={S.tagline}>你的食品资料，由你掌握。</Text>
      <View style={S.card}><Text style={S.section}>本机数据</Text><Text style={S.note}>{foods.length} 种食品 · {stock.length} 条库存记录</Text><Button title="查看我的食品" secondary onPress={() => navigate('library')} /></View>
      <View style={S.card}><Text style={S.section}>导出与分享</Text><Text style={S.note}>食品资料包适合发给开发者汇总测试，不会包含个人购买数量、到期日或设备标识。</Text>
        <View style={S.sectionRow}><Text style={S.label}>包含包装与营养表照片</Text><Switch value={photos} onValueChange={setPhotos} trackColor={{ true: '#A5DCD2', false: C.line }} thumbColor={photos ? C.teal : '#FFF'} /></View>
        <Button title="导出食品资料包" onPress={() => exportData('catalogue')} /><Button title="导出个人数据（含库存）" secondary onPress={() => exportData('personal')} />
        <Text style={S.small}>不会自动上传。生成文件后，由你选择保存位置或接收人。当前版本不提供导入还原。</Text>
      </View>
      <View style={S.card}><Text style={S.rowTitle}>护康 · 本地简易版</Text><Text style={S.note}>0.3.1 · 数据保存在这台设备\n国产 PaddleOCR 识别仅在手机运行。\n删除应用可能删除本机数据，请及时导出。</Text></View>
    </>}
    {screen === 'library' && <><Field label="搜索食品名称或品牌" value={search} onChange={setSearch} />{foods.filter(f => `${f.name} ${f.brand}`.toLowerCase().includes(search.toLowerCase())).map(renderFood)}{!foods.length && <Text style={S.note}>暂无食品，请先点击「拍一拍」录入。</Text>}</>}
  </>;
}
