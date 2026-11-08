import { useState } from "react";
import { Accordion, N } from "../nutrition-v2/components";
import { nutrientInfo, type Targets } from "../nutrition-v2/model";
import { policyFor } from "../../services/nutrition/profile";
import Constants from "expo-constants";
import { Image, StyleSheet, Text, View } from "react-native";
import { C, S } from "../simple/ui";
import { PageIntro, StatusPill, Surface, Divider } from "../../ui/components";

export function SupportScreens({
  screen,
  targets = {},
}: {
  screen: "profile" | "about";
  targets?: Targets;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const section = (id: string) => ({
    value: "",
    open: open === id,
    onToggle: () => setOpen(open === id ? null : id),
  });
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

        <StatusPill
          label={`版本 ${Constants.expoConfig?.version ?? "开发版"} · UI V2`}
          tone="neutral"
        />
      </View>
      <Accordion title="营养统计与进度" {...section("progress")}>
        <Text style={N.caption}>
          摄入仅累计所选日期已确认保存的饮食，按实际份量换算。未保存的识别结果与库存不计入。修改或删除记录会同步更新；修改食品资料不改写历史饮食。
        </Text>
        <Text style={N.caption}>
          深蓝填充表示已知下限，浅蓝区段表示估算上限；约为估算，小计表示部分食品缺少该营养数据。未知不当零，也不推断缺乏。区间不取中点作为精确摄入量。
        </Text>
        <Text style={N.caption}>
          蛋白质、纤维表示个人目标完成情况；能量、碳水、脂肪表示参考范围；钠、添加糖等表示参考上限。填满不一律代表最好。1
          kcal = 4.184 kJ；g 与 mL 没有可靠依据时不互换。
        </Text>
      </Accordion>
      <Accordion title="个人目标与计算依据" {...section("targets")}>
        <Text style={N.caption}>
          目标在「我的 → 个人目标」修改。AI
          推荐仅生成草案，确认后才应用；手改值不会被重新估算自动覆盖。资料不足时不生成精确目标。
        </Text>
        {Object.keys(nutrientInfo).map((key) => {
          const k = key as keyof typeof nutrientInfo,
            policy = policyFor(targets, k);
          return policy ? (
            <View key={key} style={{ gap: 5 }}>
              <Text style={S.rowTitle}>{nutrientInfo[k][0]}</Text>
              <Text style={N.caption}>
                {policy.source} · {policy.basis}
              </Text>
              <Text style={N.caption}>{policy.applicability}</Text>
              {policy.appliedAt && (
                <Text style={N.caption}>
                  应用日期 {policy.appliedAt.slice(0, 10)}
                </Text>
              )}
            </View>
          ) : null;
        })}
      </Accordion>
      <Accordion title="照片识别与资料发送" {...section("images")}>
        <Text style={N.caption}>
          营养表照片在本机压缩、移除上传副本的元数据并检查小于 4 MB，然后发送至
          AI
          设置中确认的服务地址及模型。首次发送或目的地址、资料范围变化时需要确认，可能产生服务商费用。
        </Text>
        <Text style={N.caption}>
          餐食照片用于 AI
          估算；营养表照片只读取包装实际标注，不根据食品外观补全。看不清或未标注保留为空。人工确认后，餐食估算仍保留估算属性；标签读取与人工修改分别保留。
        </Text>
        <Text style={N.caption}>
          只在主动操作时发送当前内容，不附带历史饮食、食品库和库存。密钥保存在系统安全存储，不进入导出。食品、记录、扫码、库存和导出可离线使用；营养表照片识别需要联网。
        </Text>
      </Accordion>
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
