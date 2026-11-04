import { Linking, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { requireNativeViewManager } from "expo-modules-core";
import { C, S, Button, Choices, Field } from "./ui";
import { type AppController } from "./useSimpleApp";
import {
  PageIntro,
  SectionHeading,
  StatusPill,
  Surface,
} from "../../ui/components";

interface LiveProps {
  style?: ViewStyle;
  active: boolean;
  torch: boolean;
  onBarcode: (e: { nativeEvent: { rawValue: string; format: string } }) => void;
  onError: (e: { nativeEvent: { message: string } }) => void;
}
const LiveScanner = requireNativeViewManager<LiveProps>("HukangBarcode");

export function ScanScreen(p: AppController) {
  const {
    screen,
    busy,
    setError,
    permission,
    foreground,
    torch,
    setTorch,
    scanToken,
    setScanToken,
    manual,
    setManual,
    manualFormat,
    setManualFormat,
    generation,
    lookup,
    pickBarcode,
    beginScan,
    task,
  } = p;
  if (screen !== "scan") return null;
  const scannerStatus = !permission
    ? "需要相机权限"
    : !foreground
      ? "相机已暂停"
      : busy
        ? "正在处理"
        : "等待条码进入取景框";

  return (
    <>
      <PageIntro
        eyebrow="拍一拍 · 食品条码"
        title="对准包装条形码"
        description="先查找你的本机食品库。还未收录的食品，可以继续拍照建档。"
      />
      <View style={scan.preview}>
        {permission ? (
          <LiveScanner
            key={scanToken}
            active={foreground && !busy && screen === "scan"}
            torch={torch}
            onBarcode={(e) =>
              void lookup(
                e.nativeEvent.rawValue,
                e.nativeEvent.format,
                "camera",
              )
            }
            onError={(e) => setError(e.nativeEvent.message)}
            style={{ flex: 1 }}
          />
        ) : (
          <View style={scan.permission}>
            <View style={scan.cameraMark}>
              <View style={scan.lens} />
            </View>
            <Text style={scan.permissionTitle}>让护康看见条码</Text>
            <Text style={scan.permissionText}>
              开启相机权限即可实时扫描。也可以使用下方的相册或手动输入。
            </Text>
          </View>
        )}
        {permission && (
          <View pointerEvents="none" style={scan.frame}>
            <View style={scan.scanLine} />
          </View>
        )}
        <View pointerEvents="none" style={scan.caption}>
          <View style={scan.statusDot} />
          <Text style={scan.captionText}>{scannerStatus}</Text>
        </View>
      </View>
      <View style={scan.statusRow}>
        <StatusPill label="本机解码 · 无需联网" tone="brand" />
        <Text style={S.small}>一次对准一个条码</Text>
      </View>
      {permission ? (
        <View style={scan.actions}>
          <View style={scan.action}>
            <Button
              title={torch ? "关闭补光" : "打开补光"}
              secondary
              onPress={() => setTorch((v) => !v)}
            />
          </View>
          <View style={scan.action}>
            <Button
              title="重新扫描"
              secondary
              onPress={() => {
                generation.current++;
                setScanToken((n) => n + 1);
                setError(null);
              }}
            />
          </View>
        </View>
      ) : (
        <>
          <Button title="开启相机权限" onPress={() => void beginScan()} />
          <Button
            title="前往系统设置"
            secondary
            onPress={() =>
              void task("正在打开系统设置", async () => {
                await Linking.openSettings();
              })
            }
          />
          <Text style={S.small}>
            从设置返回后，点「开启相机权限」重新检查。未授权也不影响手动查询。
          </Text>
        </>
      )}
      <Button
        title="从相册识别条码"
        secondary
        onPress={() => void pickBarcode()}
      />
      <Surface>
        <SectionHeading
          title="也可以手动输入"
          description="保留所有数字和前导零，选择包装对应的条码格式。"
        />
        <Field
          label="条码数字（保留前导零）"
          value={manual}
          numeric
          onChange={setManual}
          placeholder="输入完整食品条码"
        />
        <Choices
          value={manualFormat}
          options={["EAN_13", "EAN_8", "UPC_A", "UPC_E"].map((v) => [
            v,
            v.replace("_", "-"),
          ])}
          onChange={setManualFormat}
        />
        <Button
          title="查询本机食品"
          disabled={!manual}
          onPress={() => void lookup(manual, manualFormat, "manual")}
        />
      </Surface>
      <Text style={S.footer}>
        支持 EAN-13、EAN-8、UPC-A、UPC-E\n二维码与药品追溯码不用于食品查询。
      </Text>
    </>
  );
}

const scan = StyleSheet.create({
  preview: {
    height: 320,
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: "#213C50",
  },
  permission: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 30,
    gap: 12,
  },
  permissionTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  permissionText: {
    color: "#D5E5F0",
    fontSize: 14,
    lineHeight: 23,
    textAlign: "center",
  },
  cameraMark: {
    width: 48,
    height: 36,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#AACDDF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  lens: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#AACDDF",
  },
  frame: {
    position: "absolute",
    left: 28,
    right: 28,
    top: 100,
    height: 118,
    borderWidth: 2,
    borderColor: "#DEEDF8",
    borderRadius: 12,
    justifyContent: "center",
  },
  scanLine: { height: 1, backgroundColor: "#96CAE9", marginHorizontal: 12 },
  caption: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    padding: 16,
    backgroundColor: "#213C50E6",
  },
  captionText: {
    flexShrink: 1,
    color: "#F7FBFF",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#AFD3ED",
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  action: { flexGrow: 1, flexBasis: 130 },
});
