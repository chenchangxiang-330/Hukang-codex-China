import { Text } from "react-native";
import { Card, N } from "./components";
import { cutoutModel } from "../../services/covers/tasks";
import type { Snapshot } from "./model";
export function ModelScreen({ snapshot }: { snapshot: Snapshot }) {
  const tasks = Object.values(snapshot.covers ?? {});
  return (
    <Card>
      <Text style={N.heading}>本地食品抠图</Text>
      <Text style={N.body}>{cutoutModel.name}</Text>
      <Text style={N.caption}>
        待接入 · 模型身份尚未完整核实，暂不能下载或推理。
      </Text>
      <Text style={N.caption}>{cutoutModel.missing}</Text>
      <Text style={N.caption}>
        已保留 {tasks.length}{" "}
        项原图与封面任务。未处理不影响食用记录；可在食品详情恢复原图。白盘被删仍是已知限制。
      </Text>
    </Card>
  );
}
