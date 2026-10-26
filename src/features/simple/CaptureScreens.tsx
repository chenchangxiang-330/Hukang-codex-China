import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { C, S, Button, Choices, Check, Field } from "./ui";
import { type AppController, labels } from "./useSimpleApp";
import type {
  NutritionReviewColumn,
  NutritionUnit,
} from "../../domain/food/scan";
import { NutritionImageEditor } from "./NutritionImageEditor";
import {
  PageIntro,
  SectionHeading,
  StatusPill,
  Surface,
} from "../../ui/components";

export function CaptureScreens(p: AppController) {
  const {
    screen,
    draft,
    review,
    confirmed,
    setConfirmed,
    originalText,
    setOriginalText,
    draftRef,
    patchDraft,
    retainDraft,
    task,
    navigate,
    capture,
    readPackage,
    transformNutrition,
    retryNutrition,
    saveCaptureDraft,
    updateReview,
    updateColumn,
    saveFood,
    editing,
  } = p;
  if (!["package", "nutrition", "review"].includes(screen) || !draft)
    return null;
  const currentStep = ["package", "nutrition", "review"].indexOf(screen);
  const nutritionImage = draft.nutritionImage ?? draft.nutrition?.image;

  return (
    <>
      <View style={captureStyle.context}>
        <View style={captureStyle.contextTop}>
          <Text style={S.eyebrow}>
            {editing ? "核对已有食品" : "建立食品档案"}
          </Text>
          <StatusPill label={editing ? "修改待确认" : "草稿"} tone="neutral" />
        </View>
        <Text style={S.rowTitle}>{draft.name || "一份新的食品"}</Text>
        {!!draft.specification && (
          <Text style={S.note}>{draft.specification}</Text>
        )}
        <Text selectable style={S.small}>
          条码 {draft.barcode.scan.rawValue || "尚未绑定"}
        </Text>
        {!editing && (
          <View style={captureStyle.steps}>
            {["包装", "营养表", "确认"].map((label, index) => (
              <View
                key={label}
                style={captureStyle.step}
                accessibilityLabel={`第${index + 1}步 ${label}${index === currentStep ? "，当前步骤" : index < currentStep ? "，已进入过" : ""}`}
              >
                <View
                  style={[
                    captureStyle.stepDot,
                    index <= currentStep && captureStyle.stepDotActive,
                  ]}
                >
                  <Text
                    style={[
                      captureStyle.stepNumber,
                      index <= currentStep && { color: "#FFFFFF" },
                    ]}
                  >
                    {index + 1}
                  </Text>
                </View>
                <Text
                  style={[
                    S.small,
                    index === currentStep && {
                      color: C.ink,
                      fontWeight: "600",
                    },
                  ]}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      {screen === "package" && (
        <>
          <PageIntro
            title="先记下它的样子"
            description="拍摄商品正面，用作食品封面。让商品名和品牌清晰可见。"
          />
          {draft.packageImage ? (
            <View style={captureStyle.imageCard}>
              <Image
                accessibilityLabel="已选择的商品包装照片"
                source={{ uri: draft.packageImage.uri }}
                resizeMode="contain"
                style={S.photo}
              />
              <Text style={captureStyle.imageCaption}>
                包装照片 · 独立保存为商品封面
              </Text>
            </View>
          ) : (
            <View style={captureStyle.emptyPhoto}>
              <View style={captureStyle.packageOutline}>
                <View style={captureStyle.packageBand} />
                <View style={captureStyle.packageLabel} />
              </View>
              <Text style={S.rowTitle}>给食品留一张封面</Text>
              <Text style={[S.note, { textAlign: "center" }]}>
                正面包装完整入镜，光线均匀即可。
              </Text>
            </View>
          )}
          <Button
            title={draft.packageImage ? "重新拍包装" : "拍包装正面"}
            onPress={() => void capture("package")}
          />
          <Button
            title="从相册选择包装"
            secondary
            onPress={() => void capture("package", true)}
          />
          {draft.packageImage && (
            <Button
              title="读取包装文字（可选）"
              secondary
              onPress={() => void readPackage()}
            />
          )}
          {draft.packageOcr && (
            <Surface>
              <SectionHeading
                title="包装文字候选"
                description="点选名称候选，或直接手动填写。识别结果仍需要你确认。"
              />
              <View style={S.wrap}>
                {draft.packageOcr.ocr.blocks
                  .filter(
                    (block) =>
                      block.text.length >= 2 && block.text.length <= 24,
                  )
                  .slice(0, 14)
                  .map((block) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`使用名称候选 ${block.text}`}
                      style={({ pressed }) => [
                        S.chip,
                        pressed && { opacity: 0.7 },
                      ]}
                      key={block.id}
                      onPress={() => patchDraft({ name: block.text })}
                    >
                      <Text style={{ color: C.ink }}>{block.text}</Text>
                    </Pressable>
                  ))}
              </View>
              {!draft.packageOcr.ocr.blocks.some(
                (block) => block.text.length >= 2 && block.text.length <= 24,
              ) && (
                <Text style={S.note}>
                  没有合适的名称候选，直接填写下方商品名称即可继续。
                </Text>
              )}
            </Surface>
          )}
          <Surface>
            <SectionHeading
              title="这是哪件食品？"
              description="名称必填；品牌和规格可以之后再补充。"
            />
            <Field
              label="商品名称"
              value={draft.name}
              onChange={(name) => patchDraft({ name })}
              placeholder="例如：纯牛奶"
            />
            <Field
              label="品牌（选填）"
              value={draft.brand}
              onChange={(brand) => patchDraft({ brand })}
              placeholder="包装上的品牌"
            />
            <Field
              label="规格（选填）"
              value={draft.specification ?? ""}
              onChange={(specification) => patchDraft({ specification })}
              placeholder="例如：250 mL"
            />
          </Surface>
          <Button
            title="下一步，拍营养表"
            disabled={!draft.packageImage || !draft.name.trim()}
            onPress={() =>
              void task("正在保存草稿", async () => {
                await retainDraft({ ...draftRef.current!, step: "nutrition" });
                navigate("nutrition");
              })
            }
          />
          {(!draft.packageImage || !draft.name.trim()) && (
            <Text style={S.small}>
              添加一张包装照片并填写商品名称，即可进入下一步。
            </Text>
          )}
        </>
      )}
      {screen === "nutrition" && (
        <>
          <PageIntro
            title="再拍营养成分表"
            description="拍清完整表格，尽量避免反光。保留「每100g / 每100mL / 每份」这一行。"
          />
          {nutritionImage ? (
            <NutritionImageEditor
              key={nutritionImage.uri}
              image={nutritionImage}
              transform={transformNutrition}
              recognize={retryNutrition}
            />
          ) : (
            <View style={captureStyle.labelGuide}>
              <View style={captureStyle.guideHeader}>
                <Text style={S.section}>营养成分表</Text>
                <StatusPill label="取景示意" tone="neutral" />
              </View>
              <Text style={S.small}>计量基准也要完整入镜</Text>
              {labels.map((label) => (
                <View key={label} style={captureStyle.guideRow}>
                  <Text style={S.note}>{label}</Text>
                  <View style={captureStyle.guideLine} />
                  <View style={[captureStyle.guideLine, { width: 24 }]} />
                </View>
              ))}
              <Text style={S.small}>这只是取景提示，不是示例营养数据。</Text>
            </View>
          )}
          <View style={captureStyle.privacy}>
            <StatusPill label="国产 PaddleOCR · 本地识别" tone="brand" />
            <Text style={S.note}>
              图片留在手机。原图、识别原文和后续修改分开保留。
            </Text>
          </View>
          <Button
            title="拍营养表并识别"
            onPress={() => void capture("nutrition")}
          />
          <Button
            title="从相册选择营养表"
            secondary
            onPress={() => void capture("nutrition", true)}
          />
          <Button
            title="返回修改包装信息"
            secondary
            onPress={() => navigate("package")}
          />
        </>
      )}
      {screen === "review" && draft.nutrition && review && (
        <>
          <PageIntro
            title="最后，核对一下"
            description="对照照片检查单位、小数点和计量基准。看不清就重拍，未知数值不会当作零。"
          />
          <View style={captureStyle.imageCard}>
            <Image
              accessibilityLabel="用于人工核对的营养表照片"
              source={{ uri: draft.nutrition.image.uri }}
              resizeMode="contain"
              style={S.nutritionPhoto}
            />
            <Text style={captureStyle.imageCaption}>
              营养表证据 · 原始识别不会被修改
            </Text>
          </View>
          {!editing && (
            <Button
              title="调整照片方向或裁剪"
              secondary
              onPress={() => navigate("nutrition")}
            />
          )}
          <Surface>
            <SectionHeading title="商品信息" />
            <Field
              label="商品名称"
              value={review.name}
              onChange={(name) => updateReview({ ...review, name })}
            />
            <Field
              label="品牌（选填）"
              value={review.brand}
              onChange={(brand) => updateReview({ ...review, brand })}
            />
            <Field
              label="规格（选填）"
              value={review.specification ?? ""}
              onChange={(specification) =>
                updateReview({ ...review, specification })
              }
              placeholder="例如：250 mL"
            />
            <Field
              label="配料表（选填）"
              value={review.ingredients}
              onChange={(ingredients) =>
                updateReview({ ...review, ingredients })
              }
              placeholder="按包装文字填写，不确定可以留空"
            />
          </Surface>
          {review.columns.map((column, columnIndex) => (
            <Surface key={column.id}>
              <SectionHeading
                title={
                  review.columns.length > 1
                    ? `营养数据 · 第${columnIndex + 1}列`
                    : "营养数据"
                }
                description="逐项核对含量、包装单位和 NRV%。缺失数据保留待确认。"
              />
              <Text style={S.rowTitle}>这一列是按多少计算？</Text>
              <Choices
                value={column.basisKind}
                options={[
                  ["per_100g", "每100g"],
                  ["per_100ml", "每100mL"],
                  ["per_serving", "每份"],
                ]}
                onChange={(value) =>
                  updateColumn(column.id, {
                    basisKind: value as NutritionReviewColumn["basisKind"],
                  })
                }
              />
              {column.basisKind === "unknown" && (
                <Text style={captureStyle.warning}>
                  计量基准待确认，请对照照片选择。
                </Text>
              )}
              {column.basisKind === "per_serving" && (
                <>
                  <Field
                    label="包装标明的每份大小"
                    value={column.servingAmount}
                    numeric
                    onChange={(value) =>
                      updateColumn(column.id, { servingAmount: value })
                    }
                  />
                  <Choices
                    value={column.servingUnit}
                    options={[
                      ["g", "g"],
                      ["mL", "mL"],
                    ]}
                    onChange={(value) =>
                      updateColumn(column.id, {
                        servingUnit: value as "g" | "mL",
                      })
                    }
                  />
                  <Check
                    label="包装未标注每份大小"
                    value={column.servingSizeNotDeclared}
                    onChange={(value) =>
                      updateColumn(column.id, {
                        servingSizeNotDeclared: value,
                        servingAmount: value ? "" : column.servingAmount,
                      })
                    }
                  />
                </>
              )}
              {column.rows.map((row, index) => (
                <View key={row.nutrient} style={captureStyle.nutrientRow}>
                  <View style={captureStyle.rowHeading}>
                    <Text style={S.rowTitle}>{row.label}</Text>
                    {(!row.amount.trim() ||
                      row.unit === "unknown" ||
                      (!row.nrvPercent.trim() && !row.nrvNotDeclared)) && (
                      <StatusPill label="待核对" tone="warning" />
                    )}
                  </View>
                  <View style={captureStyle.fields}>
                    <View style={captureStyle.field}>
                      <Field
                        label={`${row.label}含量`}
                        numeric
                        value={row.amount}
                        onChange={(amount) =>
                          updateColumn(column.id, {
                            rows: column.rows.map((item, i) =>
                              i === index ? { ...item, amount } : item,
                            ),
                          })
                        }
                      />
                    </View>
                    <View style={captureStyle.field}>
                      <Field
                        label={`${row.label} NRV%`}
                        numeric
                        value={row.nrvPercent}
                        onChange={(nrvPercent) =>
                          updateColumn(column.id, {
                            rows: column.rows.map((item, i) =>
                              i === index
                                ? { ...item, nrvPercent, nrvNotDeclared: false }
                                : item,
                            ),
                          })
                        }
                      />
                    </View>
                  </View>
                  <Choices
                    accessibilityPrefix={`${row.label}单位`}
                    value={row.unit}
                    options={(row.nutrient === "energy"
                      ? ["kJ", "kcal"]
                      : ["g", "mg", "µg"]
                    ).map((value) => [value, value])}
                    onChange={(value) =>
                      updateColumn(column.id, {
                        rows: column.rows.map((item, i) =>
                          i === index
                            ? { ...item, unit: value as NutritionUnit }
                            : item,
                        ),
                      })
                    }
                  />
                  {!row.nrvPercent && (
                    <Check
                      label="包装未标注这一项的 NRV%"
                      value={row.nrvNotDeclared}
                      onChange={(value) =>
                        updateColumn(column.id, {
                          rows: column.rows.map((item, i) =>
                            i === index
                              ? { ...item, nrvNotDeclared: value }
                              : item,
                          ),
                        })
                      }
                    />
                  )}
                </View>
              ))}
            </Surface>
          ))}
          <Surface>
            <Check
              label="我已对照照片，逐项核对以上数值、单位、NRV% 和计量基准"
              value={confirmed}
              onChange={setConfirmed}
            />
            <Button
              title="确认并保存食品"
              disabled={!confirmed}
              onPress={() => void saveFood()}
            />
            <Text style={S.small}>
              确认后保存到本机食品库，再选择是否加入库存。
            </Text>
          </Surface>
          {!editing && (
            <Button
              title="营养表不清楚，重新拍摄"
              secondary
              onPress={() => navigate("nutrition")}
            />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: originalText }}
            onPress={() => setOriginalText((value) => !value)}
            style={captureStyle.originalToggle}
          >
            <Text style={S.link}>
              {originalText ? "收起识别原文" : "查看识别原文"}
            </Text>
            <Text style={S.note}>{originalText ? "−" : "＋"}</Text>
          </Pressable>
          {originalText && (
            <Surface>
              <Text style={S.small}>
                以下为原始 OCR 文字，保留识别错误，不会被上方的人工修改覆盖。
              </Text>
              <Text selectable style={S.note}>
                {draft.nutrition.ocr.rawText}
              </Text>
            </Surface>
          )}
        </>
      )}
      {!editing && (
        <Button
          title="保存草稿，稍后继续"
          secondary
          onPress={() => void saveCaptureDraft()}
        />
      )}
    </>
  );
}

const captureStyle = StyleSheet.create({
  context: {
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  contextTop: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  steps: {
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 14,
    marginTop: 4,
  },
  step: { flex: 1, alignItems: "center", gap: 6 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.pale,
    justifyContent: "center",
    alignItems: "center",
  },
  stepDotActive: { backgroundColor: C.teal },
  stepNumber: { fontSize: 13, color: C.muted, fontWeight: "600" },
  imageCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
    overflow: "hidden",
  },
  imageCaption: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 19,
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlign: "center",
  },
  emptyPhoto: {
    backgroundColor: "#EDF2EB",
    minHeight: 220,
    padding: 28,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  packageOutline: {
    width: 64,
    height: 84,
    borderWidth: 2,
    borderColor: "#9AB5A2",
    borderRadius: 10,
    padding: 8,
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  packageBand: {
    width: 43,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#C4D6C2",
  },
  packageLabel: {
    width: 30,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#9AB5A2",
  },
  labelGuide: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#C6D7C7",
    borderStyle: "dashed",
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  guideHeader: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  guideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 12,
  },
  guideLine: {
    width: 45,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.line,
    marginLeft: "auto",
  },
  privacy: {
    backgroundColor: "#EDF2EB",
    borderRadius: 16,
    padding: 16,
    gap: 10,
    alignItems: "flex-start",
  },
  nutrientRow: {
    gap: 12,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  rowHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  field: { flex: 1, minWidth: 110 },
  warning: { color: "#98612D", fontSize: 13, lineHeight: 21 },
  originalToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 4,
  },
});
