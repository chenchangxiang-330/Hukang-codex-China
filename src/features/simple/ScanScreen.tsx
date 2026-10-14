import { Text, View, type ViewStyle } from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';
import { S, Button, Choices, Field } from './ui';
import { type AppController } from './useSimpleApp';
interface LiveProps {
  style?: ViewStyle; active: boolean; torch: boolean;
  onBarcode: (e: { nativeEvent: { rawValue: string; format: string } }) => void;
  onError: (e: { nativeEvent: { message: string } }) => void;
}
const LiveScanner = requireNativeViewManager<LiveProps>('HukangBarcode');
export function ScanScreen(p: AppController) {
  const { screen, busy, setError, permission, foreground, torch, setTorch, scanToken, setScanToken, manual, setManual, manualFormat, setManualFormat, generation, lookup, pickBarcode } = p;
  return <>{screen === 'scan' && <>
    <Text style={S.title}>对准包装条形码</Text><Text style={S.note}>自动识别并查询本机食品库。未收录时，继续拍包装和营养表。</Text>
    <View style={S.scanner}>{permission ? <LiveScanner key={scanToken} active={foreground && !busy && screen === 'scan'} torch={torch} onBarcode={e => void lookup(e.nativeEvent.rawValue, e.nativeEvent.format, 'camera')} onError={e => setError(e.nativeEvent.message)} style={{ flex: 1 }} /> : <Text style={{ color: 'white' }}>需要相机权限</Text>}<View pointerEvents="none" style={S.scanFrame} /></View>
    <View style={S.two}><Button title={torch ? '关闭补光' : '打开补光'} secondary onPress={() => setTorch(v => !v)} /><Button title="重新扫描" secondary onPress={() => { generation.current++; setScanToken(n => n + 1); setError(null); }} /></View>
    <Button title="从相册识别条码" secondary onPress={() => void pickBarcode()} />
    <View style={S.card}><Text style={S.rowTitle}>也可以手动输入</Text><Field label="条码数字（保留前导零）" value={manual} numeric onChange={setManual} /><Choices value={manualFormat} options={['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'].map(v => [v, v.replace('_', '-')])} onChange={setManualFormat} /><Button title="查询本机食品" secondary disabled={!manual} onPress={() => void lookup(manual, manualFormat, 'manual')} /></View>
  </>}</>;
}
