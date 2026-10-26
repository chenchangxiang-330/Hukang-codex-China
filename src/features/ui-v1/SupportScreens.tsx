import Constants from "expo-constants";
import { Image, StyleSheet, Text, View } from "react-native";
import { C, S } from "../simple/ui";
import { PageIntro, StatusPill, Surface, Divider } from "../../ui/components";

export function SupportScreens({ screen }: { screen: "profile" | "about" }) {
  if (screen === "profile")
    return (
      <>
        <PageIntro
          eyebrow="本机档案"
          title="你好，护康使用者"
          description="不用注册，也能认真记录每一件食品。"
        />
        <Surface>
          <View style={styles.identity}>
            <Image
              source={require("../../../assets/icon.png")}
              style={styles.avatar}
            />
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={S.section}>本机访客</Text>
              <StatusPill label="无需登录" />
            </View>
          </View>
          <Divider />
          <Text style={S.note}>
            你的食品资料、图片与库存保存在这台设备。这里没有账号、健康档案或云同步。
          </Text>
        </Surface>
        <Surface>
          <Text style={S.rowTitle}>资料由你掌握</Text>
          <Text style={S.note}>
            可以从「我的」导出食品资料或个人数据。卸载应用可能删除本机资料；当前版本尚不支持
            App 内一键导入恢复。
          </Text>
        </Surface>
      </>
    );
  return (
    <>
      <View style={styles.brand}>
        <Image
          source={require("../../../assets/icon.png")}
          style={styles.logo}
        />
        <Text style={styles.title}>护康 Hukang</Text>
        <Text style={S.note}>把每一份安心，留在身边。</Text>
        <StatusPill
          label={`版本 ${Constants.expoConfig?.version ?? "开发版"} · UI V1`}
          tone="neutral"
        />
      </View>
      <Surface>
        <Text style={S.section}>从看清食品开始</Text>
        <Text style={S.note}>
          扫描条码，拍下包装，核对营养成分。建立属于你的食品库，让每次购买都更有条理。
        </Text>
        <Divider />
        <Text style={S.note}>
          食品资料与购买库存分开管理。库存增减不代表饮食摄入；未知营养值不会被当成零。
        </Text>
      </Surface>
      <Surface>
        <Text style={S.rowTitle}>本机优先，清楚可信</Text>
        <Text style={S.note}>
          国产 PaddleOCR
          模型在设备上运行。原始识别结果与人工修改分开保留；导出文件由你选择接收方。
        </Text>
        <Text style={S.small}>
          饮食记录暂为明确标识的交互演示。AI
          服务未连接，不提供自动分析结果或医疗建议。
        </Text>
      </Surface>
    </>
  );
}
const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 20 },
  logo: { width: 88, height: 88, borderRadius: 26 },
  brand: { alignItems: "center", gap: 12, paddingVertical: 22 },
  title: { fontSize: 28, fontWeight: "700", color: C.ink },
});
