import { Text } from "react-native";
import { Field } from "../simple/ui";
import { Accordion, N } from "./components";
import { nutrientInfo, type Food, type Nutrient } from "./model";

export function FoodEditor({
  food,
  onChange,
}: {
  food: Food;
  onChange: (food: Food) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Field
        label="食物名称"
        value={food.name}
        onChange={(name) =>
          onChange({
            ...food,
            name,
            provenance: {
              ...(food.provenance ?? { kind: "manual" }),
              nameEdited: true,
            },
          })
        }
      />
      <Text style={N.caption}>
        营养基准：每 {food.basis.amount}
        {food.basis.unit}
        {food.serving
          ? `（每份 ${food.serving.amount}${food.serving.unit}）`
          : ""}
        。实际食用份量在下方调整，只换算一次。
      </Text>
      {food.provenance?.kind === "ai" && (
        <Text style={N.caption}>
          此 1
          份已包含你描述的实际食用量（例如半碗）；已按描述估算时，不要再减半。用户确认保存后仍是
          AI 估算。
        </Text>
      )}
      <Accordion
        open={open}
        onToggle={() => setOpen(!open)}
        title="核对或修改营养数值"
        value="按上方基准"
        hint="留空为未知；输入 0 表示已知零值。修改会移除原区间并标记用户修改。"
      >
        {(Object.keys(nutrientInfo) as Nutrient[])
          .filter(
            (k) =>
              [
                "energy",
                "protein",
                "carbohydrate",
                "fat",
                "sodium",
                "added_sugars",
                "fiber",
                "total_sugars",
              ].includes(k) ||
              (food.nutrients[k]?.status !== "unknown" && food.nutrients[k]),
          )
          .map((k) => {
            const f = food.nutrients[k];
            return (
              <NutrientInput
                key={k}
                nutrient={k}
                food={food}
                onChange={onChange}
              />
            );
          })}
      </Accordion>
    </>
  );
}
import { useState } from "react";
function NutrientInput({
  nutrient: k,
  food,
  onChange,
}: {
  nutrient: Nutrient;
  food: Food;
  onChange: (f: Food) => void;
}) {
  const f = food.nutrients[k];
  const [value, setValue] = useState(
    f?.range || f?.value == null ? "" : String(f.value),
  );
  const [error, setError] = useState("");
  return (
    <>
      {f?.range && (
        <Text style={N.caption}>
          原估算 {f.range.join("–")} {f.unit} · 未修改时保留区间
        </Text>
      )}
      <Field
        label={`${nutrientInfo[k][0]}（${f?.unit ?? nutrientInfo[k][1]} / 基准）`}
        value={value}
        numeric
        onChange={(v) => {
          setValue(v);
          const valid = /^\d+(\.\d{0,3})?$/.test(v) && Number(v) <= 10000000;
          setError(v.trim() && !valid ? "请输入非负数；保存前请修正。" : "");
          onChange({
            ...food,
            nutrients: {
              ...food.nutrients,
              [k]: {
                value: valid ? Number(v) : v.trim() ? Number.NaN : null,
                unit: f?.unit ?? nutrientInfo[k][1],
                status: valid ? "estimated" : "unknown",
                source: "用户修改 · 未经独立验证",
              },
            },
          });
        }}
      />
      {error ? (
        <Text style={N.caption}>{error}</Text>
      ) : (
        <Text style={N.tiny}>{f?.source ?? "暂无数据"}</Text>
      )}
    </>
  );
}
