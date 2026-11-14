import { useState, useSyncExternalStore } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { C, S, Button, Choices, Check, Field } from "./ui";
import { basis, type AppController } from "./useSimpleApp";
import type {
  NutritionReviewColumn,
  NutritionUnit,
} from "../../domain/food/scan";
import { AiDisclosure } from "../nutrition-v2/AiDisclosure";
import { aiService } from "../../services/ai/runtime";

export function CaptureScreens(
  p: AppController & { onAiSettings?: () => void },
) {
  if (!["package", "nutrition", "review"].includes(p.screen) || !p.draft)
    return null;
  return <LabelCapture key={p.draft.id} {...p} />;
}
function LabelCapture(p: AppController & { onAiSettings?: () => void }) {
  const ai = useSyncExternalStore(aiService.subscribe, aiService.getSnapshot);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [photo, setPhoto] = useState(false);
  const draft = p.draft!,
    review = p.review;
  const image = draft.nutritionImage ?? draft.nutrition?.image;
  const resultImage = draft.nutrition?.image;
  const settings = p.onAiSettings ?? (() => p.navigate("ai-settings"));
  if (p.screen === "package")
    return (
      <>
        <Text style={S.section}>食品封面</Text>
        {draft.packageImage && (
          <Image
            source={{ uri: draft.packageImage.uri }}
            style={S.photo}
            resizeMode="contain"
          />
        )}
        <Button title="拍包装正面" onPress={() => void p.capture("package")} />
        <Button
          title="从相册选择包装"
          secondary
          onPress={() => void p.capture("package", true)}
        />
        <Field
          label="商品名称"
          value={draft.name}
          onChange={(name) => p.patchDraft({ name })}
        />
        <Button
          title="查看营养表"
          onPress={() => p.navigate(image && review ? "review" : "nutrition")}
        />
      </>
    );
  if (p.screen === "nutrition")
    return (
      <>
        {image ? (
          <Image
            source={{ uri: image.uri }}
            style={S.photo}
            resizeMode="contain"
            accessibilityLabel="待识别的营养成分表"
          />
        ) : (
          <Text style={S.note}>
            拍清表格，保留每 100g、每 100mL 或每份这一行。
          </Text>
        )}
        <Button
          title={image ? "重新拍摄" : "拍营养成分表"}
          secondary={!!image}
          onPress={() => void p.capture("nutrition")}
        />
        <Button
          title="从相册选择营养表"
          secondary
          onPress={() => void p.capture("nutrition", true)}
        />
        {!ai.hasKey || !ai.supportsImage ? (
          <>
            <Text style={S.note}>
              {!ai.hasKey
                ? "请先配置 AI 服务。"
                : "当前模型不支持图片，请更换模型。"}
            </Text>
            <Button title="前往 AI 设置" secondary onPress={settings} />
          </>
        ) : (
          <>
            {image && (
              <AiDisclosure scope="label-image" onSettings={settings} />
            )}
            {image && (
              <Button
                title="识别营养表"
                onPress={() => void p.retryNutrition()}
              />
            )}
          </>
        )}
        {review && (
          <Button
            title="返回已识别结果"
            secondary
            onPress={() => p.navigate("review")}
          />
        )}
      </>
    );
  if (!review) return null;
  return (
    <>
      <Field
        label="食品名称"
        value={review.name}
        onChange={(name) => p.updateReview({ ...review, name })}
        placeholder="填写包装上的名称"
      />
      {review.columns.map((column) => (
        <View key={column.id} style={{ gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`修改计量基准 ${basis(column)}`}
            onPress={() =>
              setExpanded(expanded === column.id ? null : column.id)
            }
            style={{ minHeight: 48, justifyContent: "center" }}
          >
            <Text style={[S.rowTitle, { color: C.teal }]}>
              {basis(column)}　⌄
            </Text>
          </Pressable>
          {expanded === column.id && (
            <>
              <Choices
                value={column.basisKind}
                options={[
                  ["per_100g", "每100g"],
                  ["per_100ml", "每100mL"],
                  ["per_serving", "每份"],
                ]}
                onChange={(value) =>
                  p.updateColumn(column.id, {
                    basisKind: value as NutritionReviewColumn["basisKind"],
                  })
                }
              />
              {column.basisKind === "per_serving" && (
                <>
                  <Field
                    label="每份大小"
                    value={column.servingAmount}
                    numeric
                    onChange={(servingAmount) =>
                      p.updateColumn(column.id, {
                        servingAmount,
                        servingSizeNotDeclared: false,
                      })
                    }
                  />
                  <Choices
                    value={column.servingUnit}
                    options={[
                      ["g", "g"],
                      ["mL", "mL"],
                    ]}
                    onChange={(value) =>
                      p.updateColumn(column.id, {
                        servingUnit: value as "g" | "mL",
                      })
                    }
                  />
                  <Check
                    label="包装未标注每份大小"
                    value={column.servingSizeNotDeclared}
                    onChange={(value) =>
                      p.updateColumn(column.id, {
                        servingSizeNotDeclared: value,
                        ...(value
                          ? {
                              servingAmount: "",
                              servingUnit: "unknown" as const,
                            }
                          : {}),
                      })
                    }
                  />
                </>
              )}
            </>
          )}
          {column.rows.map((row, index) => {
            const key = `${column.id}-${index}`;
            const patch = (changes: Partial<typeof row>) =>
              p.updateColumn(column.id, {
                rows: column.rows.map((r, i) =>
                  i === index ? { ...r, ...changes } : r,
                ),
              });
            return (
              <View key={key}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`修改${row.label} ${row.amount || "未识别"}${row.unit === "unknown" ? "" : row.unit}`}
                  onPress={() => setExpanded(expanded === key ? null : key)}
                  style={{
                    minHeight: 52,
                    paddingVertical: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderBottomWidth: 1,
                    borderColor: C.line,
                  }}
                >
                  <Text style={[S.label, { flex: 1 }]}>{row.label}</Text>
                  <Text style={S.rowTitle}>
                    {row.amount || "未识别"}
                    {row.amount && row.unit !== "unknown" ? ` ${row.unit}` : ""}
                  </Text>
                  <Text style={{ color: C.teal }}>⌄</Text>
                </Pressable>
                {expanded === key && (
                  <View style={{ gap: 8, paddingVertical: 12 }}>
                    <Field
                      label={`${row.label}数值`}
                      value={row.amount}
                      onChange={(amount) => patch({ amount })}
                      placeholder="看不清可留空"
                    />
                    <Choices
                      value={row.unit}
                      options={(row.nutrient === "energy"
                        ? ["kJ", "kcal"]
                        : ["g", "mg", "µg"]
                      ).map((unit) => [unit, unit])}
                      onChange={(unit) =>
                        patch({ unit: unit as NutritionUnit })
                      }
                    />
                    <Field
                      label={`${row.label} NRV%（选填）`}
                      value={row.nrvPercent}
                      numeric
                      onChange={(nrvPercent) =>
                        patch({ nrvPercent, nrvNotDeclared: false })
                      }
                    />
                    {review.inputMethod !== "api_label" && (
                      <Check
                        label="包装未标注 NRV%"
                        value={row.nrvNotDeclared}
                        onChange={(value) =>
                          patch({
                            nrvNotDeclared: value,
                            ...(value ? { nrvPercent: "" } : {}),
                          })
                        }
                      />
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ))}
      <Button
        title={photo ? "收起原表" : "查看原表"}
        secondary
        onPress={() => setPhoto(!photo)}
      />
      {photo && resultImage && (
        <Image
          source={{ uri: resultImage.uri }}
          style={S.photo}
          resizeMode="contain"
          accessibilityLabel="营养成分表原图"
        />
      )}
      <Check
        label="已核对营养表与计量基准"
        value={p.confirmed}
        onChange={p.setConfirmed}
      />
      <Button
        title={p.editing ? "保存修改" : "确认保存食品"}
        disabled={!p.confirmed}
        onPress={() => void p.saveFood()}
      />
      <Button
        title="重新拍摄营养表"
        secondary
        onPress={() => p.navigate("nutrition")}
      />
    </>
  );
}
