import type { CoverTask } from "../../features/nutrition-v2/model";
/** Identity is intentionally not inferred from a similar filename or approximate size. */
export const cutoutModel = {
  name: "BiRefNet general lite",
  identity: "unverified" as const,
  sourceCheckpoint: null,
  sourceSha256: null,
  androidArtifact: null,
  androidSha256: null,
  missing:
    "待核实 B 列实际检查点、固定来源、SHA-256、许可及转换/预后处理参数。",
};
export function originalTask(
  foodId: string,
  original: string,
  assetId: string,
  inputVersion: string,
): CoverTask {
  return {
    foodId,
    original,
    assetId,
    inputVersion,
    selectionVersion: 0,
    state: "waiting_identity",
    attempts: 0,
    taskId: `${assetId}-0`,
    processingVersion: "pending-identity-v1",
  };
}
export function retryTask(old: CoverTask): CoverTask {
  const version = old.selectionVersion + 1;
  const { cover: _cover, error: _error, ...task } = old;
  return {
    ...task,
    selectionVersion: version,
    taskId: `${old.assetId}-${version}`,
    state: "waiting_identity",
    attempts: old.attempts + 1,
  };
}
export function restoreOriginal(old: CoverTask): CoverTask {
  const { cover: _cover, error: _error, ...task } = old;
  return {
    ...task,
    selectionVersion: old.selectionVersion + 1,
    state: "original",
  };
}
/** Future native completions must prove ownership of the active input and user choice. */
export function acceptsResult(
  current: CoverTask,
  result: Pick<
    CoverTask,
    | "taskId"
    | "inputVersion"
    | "selectionVersion"
    | "modelSha256"
    | "processingVersion"
  >,
) {
  return (
    current.state === "processing" &&
    current.taskId === result.taskId &&
    current.inputVersion === result.inputVersion &&
    current.selectionVersion === result.selectionVersion &&
    !!current.modelSha256 &&
    current.modelSha256 === result.modelSha256 &&
    current.processingVersion === result.processingVersion
  );
}
