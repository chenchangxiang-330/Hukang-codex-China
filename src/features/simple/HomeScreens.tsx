import type { Food, Snapshot } from "../nutrition-v2/model";
import { useState, type ReactNode } from "react";
import { Alert, Image, Pressable, Switch, Text, View } from "react-native";
import { C, S, Button, Field } from "./ui";
import { H } from "./HomeScreenStyles";
import { type AppController } from "./useSimpleApp";
import type { FoodSummary } from "../../domain/food/scan";
import { expiryLabel } from "../../domain/inventory/rules";
import { reduceStock, removeStock } from "./store";
import {
  EmptyState,
  PageIntro,
  SectionHeading,
  StatusPill,
  Surface,
} from "../../ui/components";

type FoodFilter = "meal" | "packaged";

function TextAction({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [H.textAction, pressed && H.pressed]}
    >
      <Text style={H.actionLabel}>{title}</Text>
    </Pressable>
  );
}

function MenuRow({
  title,
  description,
  trailing,
  onPress,
}: {
  title: string;
  description?: string;
  trailing?: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [H.menuRow, pressed && H.pressed]}
    >
      <View style={H.grow}>
        <Text style={S.rowTitle}>{title}</Text>
        {description && <Text style={S.small}>{description}</Text>}
      </View>
      {trailing}
      <Text style={H.chevron}>›</Text>
    </Pressable>
  );
}

function recordedDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "保存在本机"
    : `${date.getMonth() + 1}月${date.getDate()}日更新`;
}

/** Presentation only: existing controller/store still own all food and inventory writes. */
export function HomeScreens(
  p: AppController & {
    onTargets?: () => void;
    onModel?: () => void;
    onMeal?: (food: Food) => void;
    nutrition?: Snapshot;
  },
) {
  const [exportOpen, setExportOpen] = useState(false);
  const {
    tab,
    setTab,
    screen,
    foods,
    stock,
    stockCovers,
    resume,
    search,
    setSearch,
    photos,
    setPhotos,
    draftRef,
    refresh,
    task,
    navigate,
    openProduct,
    startScan,
    exportData,
    date,
    setDraft,
    setReview,
    setConfirmed,
  } = p;
  const [filter, setFilter] = useState<FoodFilter>("meal");
  const stockByUnit = stock.reduce<Record<string, number>>((totals, item) => {
    totals[item.unit] = (totals[item.unit] ?? 0) + item.quantity;
    return totals;
  }, {});
  const stockSummary = Object.entries(stockByUnit)
    .map(([unit, quantity]) => `${quantity}${unit}`)
    .join(" · ");
  const query = search.trim().toLocaleLowerCase();
  const filteredFoods = foods.filter((food) =>
    `${food.name} ${food.brand}`.toLocaleLowerCase().includes(query),
  );
  const mealFoods = (p.nutrition?.catalogue ?? []).filter(
    (f) => f.kind === "meal" && f.name.toLowerCase().includes(query),
  );
  const filteredStock = stock.filter((item) =>
    `${item.name} ${item.brand}`.toLocaleLowerCase().includes(query),
  );
  const libraryVisible =
    screen === "library" ||
    (screen === "home" && (tab === "library" || tab === "stock"));
  const inventoryVisible = screen === "home" && tab === "stock";
  const clearSearch = () => {
    setSearch("");
    setFilter("meal");
  };
  const showLibrary = () => {
    clearSearch();
    navigate("library");
  };

  const renderFood = (food: FoodSummary) => (
    <Pressable
      key={food.id}
      accessibilityRole="button"
      accessibilityLabel={food.name || "未命名食品"}
      accessibilityHint={`${food.status === "confirmed" ? "已人工核对" : "待确认"}，打开食品详情`}
      onPress={() => void openProduct(food.id)}
      style={({ pressed }) => [H.foodRow, pressed && H.pressed]}
    >
      <View style={H.foodThumbnail}>
        {stockCovers[food.id] ? (
          <Image
            source={{ uri: stockCovers[food.id] }}
            resizeMode="contain"
            style={H.thumbnailImage}
          />
        ) : (
          <Text style={H.foodInitial}>
            {food.name.trim().slice(0, 1) || "食"}
          </Text>
        )}
      </View>
      <View style={H.grow}>
        <Text style={S.rowTitle} numberOfLines={2}>
          {food.name || "未命名食品"}
        </Text>
        <Text style={S.small}>
          {food.brand || "本地食品"} · {recordedDate(food.updatedAt)}
        </Text>
        <View style={H.pillWrap}>
          <StatusPill
            label={food.status === "confirmed" ? "已人工核对" : "待确认"}
            tone={food.status === "confirmed" ? "brand" : "warning"}
          />
        </View>
      </View>
      <Text style={H.chevron}>›</Text>
    </Pressable>
  );

  return (
    <>
      {libraryVisible && (
        <>
          <PageIntro
            title={screen === "library" ? "选择一件食品" : "我的食品库"}
          />
          {screen === "home" && (
            <View style={H.segmented} accessibilityRole="tablist">
              {(
                [
                  ["library", "食品资料"],
                  ["stock", "我的库存"],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: tab === key }}
                  onPress={() => {
                    clearSearch();
                    setTab(key);
                  }}
                  style={({ pressed }) => [
                    H.segment,
                    tab === key && H.segmentSelected,
                    pressed && H.pressed,
                  ]}
                >
                  <Text
                    style={[
                      H.segmentText,
                      tab === key && H.segmentTextSelected,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <Field
            label={
              inventoryVisible ? "搜索库存名称或品牌" : "搜索食品名称或品牌"
            }
            value={search}
            onChange={setSearch}
            placeholder="输入商品名或品牌"
          />
          {inventoryVisible ? (
            <>
              <SectionHeading
                title="库存清单"
                description={
                  stockSummary
                    ? `当前 ${stockSummary}，按包装单位分别计数`
                    : "每次购买都可以独立填写到期日"
                }
              />
              {!stock.length ? (
                <EmptyState
                  title="给食品留一个位置"
                  description="从食品详情加入库存。"
                />
              ) : !filteredStock.length ? (
                <EmptyState
                  title="没有找到这件库存"
                  description="试试其他名称或品牌，已有库存仍保留在本机。"
                  action={
                    <Button title="清除搜索" secondary onPress={clearSearch} />
                  }
                />
              ) : (
                filteredStock.map((item) => (
                  <Surface key={item.id}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`查看${item.name}`}
                      onPress={() => {
                        const food = p.nutrition?.catalogue?.find(
                          (f) => f.id === item.food_id && f.kind === "meal",
                        );
                        if (food) p.onMeal?.(food);
                        else void openProduct(item.food_id);
                      }}
                      style={({ pressed }) => [
                        H.stockHeading,
                        pressed && H.pressed,
                      ]}
                    >
                      <View style={H.foodThumbnail}>
                        {stockCovers[item.food_id] ? (
                          <Image
                            source={{ uri: stockCovers[item.food_id] }}
                            resizeMode="contain"
                            style={H.thumbnailImage}
                          />
                        ) : (
                          <Text style={H.foodInitial}>
                            {item.name.trim().slice(0, 1) || "食"}
                          </Text>
                        )}
                      </View>
                      <View style={H.grow}>
                        <Text style={S.rowTitle} numberOfLines={2}>
                          {item.name}
                        </Text>
                        <Text style={S.small}>{item.brand || "本地食品"}</Text>
                        <Text style={S.small}>
                          {expiryLabel(item.expires_on)}
                        </Text>
                      </View>
                      <Text style={H.chevron}>›</Text>
                    </Pressable>
                    <View style={H.stockFooter}>
                      <View>
                        <Text style={H.stockQuantity}>
                          {item.quantity}
                          <Text style={H.quantityUnit}> {item.unit}</Text>
                        </Text>
                        <Text style={S.small}>本次购入剩余</Text>
                      </View>
                      <View style={H.stockActions}>
                        <Button
                          title={`用掉1${item.unit}`}
                          secondary
                          onPress={() =>
                            void task("正在更新库存", async () => {
                              if (item.quantity === 1)
                                await removeStock(item.id);
                              else await reduceStock(item.id);
                              await refresh();
                            })
                          }
                        />
                        <TextAction
                          title="移除"
                          onPress={() =>
                            Alert.alert(
                              "移除这条库存？",
                              "只移除本次入库记录，保留商品资料。",
                              [
                                { text: "取消", style: "cancel" },
                                {
                                  text: "移除",
                                  style: "destructive",
                                  onPress: () =>
                                    void task("正在移除", async () => {
                                      await removeStock(item.id);
                                      await refresh();
                                    }),
                                },
                              ],
                            )
                          }
                        />
                      </View>
                    </View>
                  </Surface>
                ))
              )}
              <Text style={S.footer}>
                用掉或移除库存，不会自动记录为饮食摄入。
              </Text>
            </>
          ) : (
            <>
              <View style={H.filters} accessibilityRole="radiogroup">
                {(
                  [
                    ["meal", "餐食"],
                    ["packaged", "包装食品"],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityLabel={`食品筛选：${label}`}
                    accessibilityState={{ checked: filter === value }}
                    onPress={() => setFilter(value)}
                    style={({ pressed }) => [
                      H.filter,
                      filter === value && H.filterSelected,
                      pressed && H.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        H.filterText,
                        filter === value && H.filterTextSelected,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={H.collectionHeading}>
                <Text style={S.small}>
                  显示{" "}
                  {filter === "meal" ? mealFoods.length : filteredFoods.length}{" "}
                  份食品资料
                </Text>
                <TextAction
                  title="拍一拍添加"
                  onPress={() => void startScan()}
                />
              </View>
              {filter === "meal" ? (
                mealFoods.length ? (
                  mealFoods.map((f) => (
                    <Pressable
                      key={f.id}
                      accessibilityRole="button"
                      accessibilityLabel={`餐食 ${f.name}`}
                      onPress={() => p.onMeal?.(f)}
                      style={H.foodRow}
                    >
                      {(p.nutrition?.covers?.[f.id]?.cover || f.image) && (
                        <Image
                          source={{
                            uri: p.nutrition?.covers?.[f.id]?.cover || f.image,
                          }}
                          resizeMode="contain"
                          style={{ width: 64, height: 64 }}
                        />
                      )}
                      <View style={H.grow}>
                        <Text style={S.rowTitle}>{f.name}</Text>
                        <Text style={S.small}>
                          {f.provenance?.kind === "ai"
                            ? "AI 估算 · 已确认保存"
                            : "本机餐食资料"}
                        </Text>
                      </View>
                      <Text style={H.chevron}>›</Text>
                    </Pressable>
                  ))
                ) : (
                  <EmptyState
                    title="还没有餐食资料"
                    description="餐食确认食用后会保存在这里，方便下次复用。"
                  />
                )
              ) : filteredFoods.length ? (
                filteredFoods.map(renderFood)
              ) : (
                <EmptyState
                  title="还没有匹配的包装食品"
                  description="扫描条码后补全营养标签，核对后保存。"
                />
              )}
            </>
          )}
        </>
      )}

      {screen === "home" && tab === "mine" && (
        <>
          <Text accessibilityRole="header" style={S.title}>
            我的
          </Text>
          <Surface style={H.menuSurface}>
            <MenuRow title="个人参考目标" onPress={() => p.onTargets?.()} />
            <View style={H.menuDivider} />
            <MenuRow
              title="AI 服务设置"
              onPress={() => navigate("ai-settings")}
            />
            <View style={H.menuDivider} />
            <MenuRow
              title="数据导出"
              onPress={() => setExportOpen(!exportOpen)}
            />
            <View style={H.menuDivider} />
            <MenuRow title="本地抠图模型" onPress={() => p.onModel?.()} />
            <View style={H.menuDivider} />
            <MenuRow title="关于 Hukang" onPress={() => navigate("about")} />
          </Surface>
          {exportOpen && (
            <>
              <Surface>
                <SectionHeading
                  title="导出与分享"
                  description="选择需要的资料，再决定分享给谁。"
                />
                <View style={H.photoOption}>
                  <View style={H.grow}>
                    <Text style={S.label}>包含食品与饮食照片</Text>
                    <Text style={S.small}>
                      默认不包含。分享前请检查照片中的私人信息。
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel="包含食品与饮食照片"
                    value={photos}
                    onValueChange={setPhotos}
                    trackColor={{ true: "#B7D8EB", false: C.line }}
                    thumbColor={photos ? C.teal : "#FFF"}
                  />
                </View>
                <Button
                  title="导出食品资料包"
                  onPress={() => exportData("catalogue")}
                />
                <Text style={S.small}>
                  仅含已确认食品资料，不含个人库存、购买时间或到期日。
                </Text>
                <Button
                  title="导出个人数据（含库存）"
                  secondary
                  onPress={() => exportData("personal")}
                />
                <Text style={S.small}>
                  包含饮食、个人目标、食品、库存、OCR
                  和修订。文件在本机生成，不会自动上传；当前尚不支持 App
                  内一键恢复。
                </Text>
              </Surface>
            </>
          )}
        </>
      )}
    </>
  );
}
