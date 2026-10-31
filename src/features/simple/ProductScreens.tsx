import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { C, S, Button, Choices, Field } from "./ui";
import { type AppController, basis } from "./useSimpleApp";
import type { FoodReviewValues } from "../../domain/food/scan";
import { normalizeBarcode } from "../../domain/barcode/normalize";
import { type CaptureDraft, deleteProduct, addStock } from "./store";
import {
  PageIntro,
  SectionHeading,
  StatTile,
  StatusPill,
  Surface,
} from "../../ui/components";

export function ProductScreens(p: AppController & { onIntake?: () => void }) {
  const {
    setTab,
    screen,
    product,
    cover,
    stock,
    setNotice,
    setConfirmed,
    quantity,
    setQuantity,
    unit,
    setUnit,
    expiry,
    setExpiry,
    request,
    draftRef,
    refresh,
    task,
    navigate,
    showStock,
    setDraft,
    setReview,
    setEditing,
  } = p;
  if (!product || !["product", "add-stock"].includes(screen)) return null;
  const primaryColumn = product.review.columns[0];
  const stockByUnit = stock
    .filter((item) => item.food_id === product.id)
    .reduce<Record<string, number>>((total, item) => {
      total[item.unit] = (total[item.unit] ?? 0) + item.quantity;
      return total;
    }, {});
  const stockLabel =
    Object.entries(stockByUnit)
      .map(([label, count]) => `${count} ${label}`)
      .join(" · ") || "尚未加入库存";
  const quantityValid = /^[1-9]\d{0,3}$/.test(quantity.trim());
  const quantityNumber = Number(quantity);

  return (
    <>
      {screen === "product" && (
        <>
          <View style={productStyle.cover}>
            {cover ? (
              <Image
                accessibilityLabel={`${product.review.name}的包装照片`}
                source={{ uri: cover }}
                resizeMode="contain"
                style={productStyle.coverImage}
              />
            ) : (
              <View style={productStyle.noCover}>
                <Text style={productStyle.noCoverMark}>食</Text>
                <Text style={S.note}>尚无包装封面</Text>
              </View>
            )}
            <View style={productStyle.coverBadge}>
              <StatusPill label="我的食品库" tone="neutral" />
            </View>
          </View>
          <View style={{ gap: 12 }}>
            <PageIntro
              title={product.review.name}
              description={
                [product.review.brand, product.review.specification]
                  .filter(Boolean)
                  .join(" · ") || "本机食品资料"
              }
            />
            <View style={S.wrap}>
              <StatusPill
                label={product.status === "confirmed" ? "已人工核对" : "待确认"}
                tone={product.status === "confirmed" ? "brand" : "warning"}
              />
              <Text style={S.small}>资料保存在这台设备</Text>
            </View>
            <Text selectable style={S.note}>
              条码{" "}
              {product.barcodes?.map((b) => b.rawValue).join(" / ") ||
                "尚未绑定"}
            </Text>
          </View>
          {primaryColumn && (
            <>
              <SectionHeading
                title="主要营养"
                description={`${basis(primaryColumn)} · 按包装标注单位展示`}
              />
              <View style={productStyle.nutrients}>
                {["energy", "protein", "fat", "carbohydrate"].map(
                  (nutrient) => {
                    const row = primaryColumn.rows.find(
                      (item) => item.nutrient === nutrient,
                    );
                    const label =
                      nutrient === "energy"
                        ? "能量"
                        : nutrient === "protein"
                          ? "蛋白质"
                          : nutrient === "fat"
                            ? "脂肪"
                            : "碳水化合物";
                    return (
                      <View style={productStyle.nutrient} key={nutrient}>
                        <StatTile
                          label={label}
                          value={row?.amount || "—"}
                          unit={
                            row?.unit && row.unit !== "unknown" ? row.unit : ""
                          }
                          tone={nutrient === "energy" ? "warning" : "neutral"}
                        />
                      </View>
                    );
                  },
                )}
              </View>
            </>
          )}
          <Surface>
            <SectionHeading
              title="完整营养成分"
              description="数值与 NRV% 分开展示，不将未知数值记为零。"
            />
            {product.review.columns.length ? (
              product.review.columns.map((column) => (
                <View style={{ gap: 12 }} key={column.id}>
                  <Text style={S.eyebrow}>{basis(column)}</Text>
                  <View style={productStyle.tableHeader}>
                    <Text style={[S.small, productStyle.labelCell]}>
                      营养项目
                    </Text>
                    <Text style={[S.small, productStyle.amountCell]}>含量</Text>
                    <Text style={[S.small, productStyle.nrvCell]}>NRV%</Text>
                  </View>
                  {column.rows.map((row) => (
                    <View style={productStyle.tableRow} key={row.nutrient}>
                      <Text style={[S.label, productStyle.labelCell]}>
                        {row.label}
                      </Text>
                      <Text style={[S.label, productStyle.amountCell]}>
                        {row.amount || "未记录"}
                        {row.unit === "unknown" ? "" : ` ${row.unit}`}
                      </Text>
                      <Text style={[S.note, productStyle.nrvCell]}>
                        {row.nrvPercent
                          ? `${row.nrvPercent}%`
                          : row.nrvNotDeclared
                            ? "未标注"
                            : "待确认"}
                      </Text>
                    </View>
                  ))}
                </View>
              ))
            ) : (
              <Text style={S.note}>
                还没有已保存的营养表，请先核对商品资料。
              </Text>
            )}
            {!!product.review.ingredients && (
              <View style={productStyle.ingredients}>
                <Text style={S.rowTitle}>配料表</Text>
                <Text style={S.note}>{product.review.ingredients}</Text>
              </View>
            )}
          </Surface>
          <Surface>
            <SectionHeading title="我的库存" description={stockLabel} />
            <Text style={S.note}>
              这次又买了一份？每次购入单独记录，商品资料只保留一份。
            </Text>
            <Button
              title="加入我的库存"
              disabled={product.status !== "confirmed"}
              onPress={showStock}
            />
            {product.status !== "confirmed" && (
              <Text style={S.small}>先核对商品资料，再加入库存。</Text>
            )}
          </Surface>
          {p.onIntake && (
            <Button
              title="如果吃完这份 · 摄入预览"
              secondary
              onPress={p.onIntake}
            />
          )}
          <Button
            title="核对或修改商品资料"
            secondary
            onPress={() => {
              const barcode = product.barcodes?.[0];
              const draft: CaptureDraft = {
                id: product.id,
                barcode: normalizeBarcode({
                  rawValue: barcode?.rawValue ?? "",
                  format: barcode?.format ?? "EAN_13",
                  decodedAt: new Date().toISOString(),
                }),
                acquiredBy: barcode?.acquiredBy ?? "manual",
                step: "review",
                name: product.review.name,
                brand: product.review.brand,
                specification: product.review.specification ?? "",
                nutrition: product.evidence,
                review: JSON.parse(
                  JSON.stringify(product.review),
                ) as FoodReviewValues,
              };
              setEditing(product);
              draftRef.current = draft;
              setDraft(draft);
              setReview(draft.review!);
              setConfirmed(false);
              navigate("review");
            }}
          />
          <Button
            title="暂不入库，返回首页"
            secondary
            onPress={() => navigate("home")}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="删除商品资料"
            style={productStyle.deleteButton}
            onPress={() =>
              Alert.alert(
                "删除商品资料？",
                "删除该食品资料。有关联库存时会拒绝删除。",
                [
                  { text: "取消", style: "cancel" },
                  {
                    text: "删除",
                    style: "destructive",
                    onPress: () =>
                      void task("正在删除", async () => {
                        await deleteProduct(product.id);
                        await refresh();
                        navigate("home");
                      }),
                  },
                ],
              )
            }
          >
            <Text style={[S.link, { color: C.red }]}>删除商品资料</Text>
          </Pressable>
        </>
      )}
      {screen === "add-stock" && (
        <>
          <PageIntro
            eyebrow="记下这次购入"
            title="加入我的库存"
            description="记录买了多少，留意什么时候到期。"
          />
          <Surface>
            <View style={productStyle.stockProduct}>
              {cover && (
                <Image
                  source={{ uri: cover }}
                  resizeMode="contain"
                  style={productStyle.stockCover}
                />
              )}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={S.rowTitle}>{product.review.name}</Text>
                <Text style={S.note}>
                  {product.review.specification ||
                    product.review.brand ||
                    "本机食品资料"}
                </Text>
              </View>
            </View>
            <Text style={S.small}>现有库存 · {stockLabel}</Text>
          </Surface>
          <Surface>
            <SectionHeading
              title="这次买了多少？"
              description="以包装数量记录，每次购入单独保存。"
            />
            <View style={productStyle.quantityRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="减少购入数量"
                accessibilityState={{
                  disabled: !quantityValid || quantityNumber <= 1,
                }}
                disabled={!quantityValid || quantityNumber <= 1}
                onPress={() => setQuantity(String(quantityNumber - 1))}
                style={({ pressed }) => [
                  productStyle.quantityButton,
                  (!quantityValid || quantityNumber <= 1) && S.disabled,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={productStyle.quantitySign}>−</Text>
              </Pressable>
              <View style={{ flex: 1, minWidth: 120 }}>
                <Field
                  label="本次购入数量"
                  value={quantity}
                  numeric
                  onChange={setQuantity}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="增加购入数量"
                accessibilityState={{
                  disabled: !quantityValid || quantityNumber >= 9999,
                }}
                disabled={!quantityValid || quantityNumber >= 9999}
                onPress={() => setQuantity(String(quantityNumber + 1))}
                style={({ pressed }) => [
                  productStyle.quantityButton,
                  (!quantityValid || quantityNumber >= 9999) && S.disabled,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={productStyle.quantitySign}>＋</Text>
              </Pressable>
            </View>
            <Text style={S.label}>包装单位</Text>
            <Choices
              value={unit}
              options={["件", "瓶", "盒", "袋", "罐", "包", "个"].map(
                (value) => [value, value],
              )}
              onChange={setUnit}
            />
            <Field
              label="到期日（选填）"
              value={expiry}
              onChange={setExpiry}
              placeholder="YYYY-MM-DD"
            />
            <Text style={S.small}>
              不确定到期日可以留空。不同包装单位分开统计，不自动换算重量。
            </Text>
          </Surface>
          <Button
            title="确认加入库存"
            onPress={() =>
              void task("正在加入库存", async () => {
                await addStock(product.id, quantity, unit, expiry, request);
                await refresh();
                setTab("stock");
                navigate("home");
                setNotice("已加入库存。商品资料没有重复创建。");
              })
            }
          />
          <Button title="取消" secondary onPress={() => navigate("product")} />
          <Text style={S.footer}>加入库存不会计为饮食摄入。</Text>
        </>
      )}
    </>
  );
}

const productStyle = StyleSheet.create({
  cover: {
    borderRadius: 24,
    backgroundColor: "#EAF4FB",
    overflow: "hidden",
    minHeight: 240,
  },
  coverImage: { width: "100%", height: 260 },
  coverBadge: { position: "absolute", top: 16, left: 16 },
  noCover: {
    height: 240,
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  noCoverMark: { fontSize: 48, color: C.teal, fontWeight: "300" },
  nutrients: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  nutrient: { flexBasis: "45%", flexGrow: 1, minWidth: 125 },
  tableHeader: { flexDirection: "row", gap: 8, paddingBottom: 6 },
  tableRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.line,
    alignItems: "flex-start",
  },
  labelCell: { flex: 1.1, flexShrink: 1 },
  amountCell: { flex: 1, flexShrink: 1, textAlign: "right" },
  nrvCell: { flex: 0.75, flexShrink: 1, textAlign: "right" },
  ingredients: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: C.line,
    gap: 8,
  },
  deleteButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  stockProduct: { flexDirection: "row", gap: 16, alignItems: "center" },
  stockCover: {
    width: 64,
    height: 76,
    borderRadius: 12,
    backgroundColor: "#FFFDF7",
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  quantityButton: {
    width: 48,
    height: 50,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#EDF5FA",
  },
  quantitySign: {
    color: C.teal,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "500",
  },
});
