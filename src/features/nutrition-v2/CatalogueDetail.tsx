import { useRef, useState } from "react";
import { Image, Text } from "react-native";
import { Field, Choices } from "../simple/ui";
import { addCatalogueStock, newId } from "../simple/store";
import { Action, Accordion, Card, Feedback, Link, N } from "./components";
import { FoodEditor } from "./FoodEditor";
import type { Food, NutritionAdapter, Snapshot } from "./model";
export function CatalogueDetail({
  food,
  adapter,
  snapshot,
  onIntake,
  onStock,
}: {
  food: Food;
  adapter: NutritionAdapter;
  snapshot: Snapshot;
  onIntake: (food: Food) => void;
  onStock: () => void;
}) {
  const current = snapshot.catalogue?.find((f) => f.id === food.id) ?? food;
  const [draft, setDraft] = useState(current),
    [editing, setEditing] = useState(false),
    [stock, setStock] = useState(false),
    [quantity, setQuantity] = useState("1"),
    [unit, setUnit] = useState("份"),
    [expiry, setExpiry] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [added, setAdded] = useState(false);
  const request = useRef(newId("meal-stock")),
    lock = useRef(false),
    cover = snapshot.covers?.[food.id];
  async function add() {
    if (lock.current || added) return;
    lock.current = true;
    setBusy(true);
    try {
      await addCatalogueStock(food.id, quantity, unit, expiry, request.current);
      setAdded(true);
      setMessage("已加入库存，未计入摄入。");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Text style={N.title}>{current.name}</Text>
      {(cover?.cover || current.image) && (
        <Image
          source={{ uri: cover?.cover || current.image }}
          resizeMode="contain"
          style={{ height: 220, width: "100%" }}
          accessibilityLabel="食品原图或已处理封面"
        />
      )}
      <Text style={N.caption}>{current.source}</Text>
      <Action title="食用这份食品" onPress={() => onIntake(current)} />
      <Accordion
        title="食品资料"
        value="查看或修改"
        open={editing}
        onToggle={() => setEditing(!editing)}
      >
        <FoodEditor food={draft} onChange={setDraft} />
        <Action
          title="保存食品资料"
          disabled={busy}
          secondary
          onPress={() => {
            setBusy(true);
            void adapter
              .saveCatalogueFood?.({ ...draft, version: newId("food-version") })
              .then(() => setMessage("食品资料已更新，历史食用快照不变。"))
              .catch((e) => setMessage(e.message))
              .finally(() => setBusy(false));
          }}
        />
      </Accordion>
      <Accordion
        title="加入库存"
        value="不计摄入"
        open={stock}
        onToggle={() => setStock(!stock)}
      >
        <Field
          label="购入数量"
          numeric
          value={quantity}
          onChange={setQuantity}
        />
        <Choices
          value={unit}
          options={["份", "件", "盒", "袋", "瓶"].map((v) => [v, v])}
          onChange={setUnit}
        />
        <Field
          label="到期日（选填）"
          value={expiry}
          onChange={setExpiry}
          placeholder="YYYY-MM-DD"
        />
        <Action
          title={added ? "已加入库存" : "确认加入库存"}
          disabled={added || busy}
          onPress={() => void add()}
        />
        <Link title="查看库存" onPress={onStock} />
      </Accordion>
      {cover && (
        <Card>
          <Text style={N.heading}>食品封面</Text>
          <Text style={N.caption}>
            {cover.state === "original"
              ? "使用原图"
              : cover.state === "ready"
                ? "已生成透明封面"
                : "原图已保存 · 抠图模型身份待核实，尚未处理"}
          </Text>
          <Link
            title="重试封面处理"
            onPress={() =>
              void adapter
                .retryCover?.(food.id)
                .then(() =>
                  setMessage("已保留重试任务；模型身份待核实，未执行推理。"),
                )
                .catch((e) => setMessage(e.message))
            }
          />
          <Link
            title="恢复原图"
            onPress={() =>
              void adapter
                .restoreCover?.(food.id)
                .then(() => setMessage("已恢复原图，旧任务不能覆盖本次选择。"))
                .catch((e) => setMessage(e.message))
            }
          />
        </Card>
      )}
      {!!message && <Feedback>{message}</Feedback>}
    </>
  );
}
