import { useState, type ReactNode } from "react";
import Constants from "expo-constants";
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
  StatTile,
  StatusPill,
  Surface,
} from "../../ui/components";

type FoodFilter = "all" | "confirmed" | "draft";

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
  description: string;
  trailing?: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [H.menuRow, pressed && H.pressed]}
    >
      <View style={H.grow}>
        <Text style={S.rowTitle}>{title}</Text>
        <Text style={S.small}>{description}</Text>
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
export function HomeScreens(p: AppController) {
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
  const [filter, setFilter] = useState<FoodFilter>("all");
  const stockByUnit = stock.reduce<Record<string, number>>((totals, item) => {
    totals[item.unit] = (totals[item.unit] ?? 0) + item.quantity;
    return totals;
  }, {});
  const stockSummary = Object.entries(stockByUnit)
    .map(([unit, quantity]) => `${quantity}${unit}`)
    .join(" · ");
  const query = search.trim().toLocaleLowerCase();
  const filteredFoods = foods.filter(
    (food) =>
      `${food.name} ${food.brand}`.toLocaleLowerCase().includes(query) &&
      (filter === "all" || food.status === filter),
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
    setFilter("all");
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
            eyebrow="MY FOOD COLLECTION"
            title={screen === "library" ? "选择一件食品" : "我的食品库"}
            description="商品资料只存一份，每次购买单独记一笔。"
          />
          {screen === "home" && (
            <View style={H.segmented} accessibilityRole="tablist">
              {(
                [
                  ["library", "食品资料", foods.length],
                  ["stock", "我的库存", stock.length],
                ] as const
              ).map(([key, label, count]) => (
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
                    {label} <Text style={H.segmentCount}>{count}</Text>
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
              <View style={H.libraryActions}>
                <View style={H.flexButton}>
                  <Button
                    title="拍一拍，添加食品"
                    onPress={() => void startScan()}
                  />
                </View>
                <View style={H.flexButton}>
                  <Button
                    title="从已有食品添加"
                    secondary
                    onPress={showLibrary}
                  />
                </View>
              </View>
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
                  description="先保存商品资料，再选择购入数量。库存与食品档案会分别保存。"
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
                      onPress={() => void openProduct(item.food_id)}
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
                    ["all", "全部"],
                    ["confirmed", "已核对"],
                    ["draft", "待确认"],
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
                  显示 {filteredFoods.length} / {foods.length} 份食品资料
                </Text>
                <TextAction
                  title="拍一拍添加"
                  onPress={() => void startScan()}
                />
              </View>
              {!foods.length ? (
                <EmptyState
                  title="把喜欢的食品收进来"
                  description="扫一扫手边的包装。自己的食品库，从一件开始。"
                  action={
                    <Button
                      title="录入第一件食品"
                      onPress={() => void startScan()}
                    />
                  }
                />
              ) : !filteredFoods.length ? (
                <EmptyState
                  title="暂时没有符合条件的食品"
                  description="换个关键词，或查看全部确认状态。已保存的资料不会被删除。"
                  action={
                    <Button
                      title="清除筛选与搜索"
                      secondary
                      onPress={clearSearch}
                    />
                  }
                />
              ) : (
                filteredFoods.map(renderFood)
              )}
            </>
          )}
        </>
      )}

      {screen === "home" && tab === "mine" && (
        <>
          <PageIntro
            eyebrow="YOUR SPACE"
            title="我的"
            description="让记录简单，让数据留在自己手里。"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="查看本机用户信息"
            onPress={() => navigate("profile")}
            style={({ pressed }) => [H.profile, pressed && H.pressed]}
          >
            <Image
              source={require("../../../assets/icon.png")}
              style={H.profileAvatar}
            />
            <View style={H.grow}>
              <Text style={H.profileName}>本机用户</Text>
              <Text style={S.small}>无需注册，也能好好记录</Text>
              <View style={H.pillWrap}>
                <StatusPill label="资料仅保存在这台设备" tone="brand" />
              </View>
            </View>
            <Text style={H.chevron}>›</Text>
          </Pressable>
          <View style={H.statGrid}>
            <View style={H.statCell}>
              <StatTile label="食品资料" value={foods.length} unit="份" />
            </View>
            <View style={H.statCell}>
              <StatTile
                label="库存记录"
                value={stock.length}
                unit="笔"
                tone="neutral"
              />
            </View>
          </View>
          <Surface style={H.menuSurface}>
            <MenuRow
              title="查看我的食品"
              description="食品资料与库存分开管理"
              onPress={showLibrary}
            />
            <View style={H.menuDivider} />
            <MenuRow
              title="AI 服务设置"
              description="按需连接模型，密钥仅临时使用"
              trailing={<StatusPill label="可配置" tone="brand" />}
              onPress={() => navigate("ai-settings")}
            />
          </Surface>
          <Surface>
            <SectionHeading
              title="导出与分享"
              description="选择需要的资料，再决定分享给谁。"
            />
            <View style={H.photoOption}>
              <View style={H.grow}>
                <Text style={S.label}>包含包装与营养表照片</Text>
                <Text style={S.small}>
                  默认不包含。分享前请检查照片中的私人信息。
                </Text>
              </View>
              <Switch
                accessibilityLabel="包含包装与营养表照片"
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
              包含库存、OCR 和修订。文件在本机生成，不会自动上传；当前尚不支持
              App 内一键恢复。
            </Text>
          </Surface>
          <Surface style={H.menuSurface}>
            <MenuRow
              title="关于 Hukang"
              description={`${Constants.expoConfig?.version ?? "版本未知"} · 国产 OCR，本地识别`}
              onPress={() => navigate("about")}
            />
          </Surface>
          <Text style={S.footer}>
            删除应用可能删除本机资料，请及时导出妥善保管。
          </Text>
        </>
      )}
    </>
  );
}
