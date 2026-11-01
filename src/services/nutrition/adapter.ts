import type {
  NutritionAdapter,
  Snapshot,
  Entry,
} from "../../features/nutrition-v2/model";
import type { NutritionStore } from "./store";

export function createNutritionAdapter(
  open: () => Promise<NutritionStore>,
): NutritionAdapter {
  let snapshot: Snapshot = { status: "loading", entries: [], targets: {} };
  let initialized: Promise<NutritionStore> | undefined;
  let running = false;
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot) => {
    snapshot = next;
    for (const f of listeners) f();
  };
  const store = () =>
    (initialized ??= open().catch((error) => {
      initialized = undefined;
      throw error;
    }));
  const reload = async () => {
    try {
      publish({
        ...(await (await store()).load()),
        status: "ready",
        saving: running,
      });
    } catch {
      publish({
        ...snapshot,
        status: "error",
        message:
          "本机饮食资料暂时无法读取，请重新打开页面或重启应用；现有数据未清除。",
      });
    }
  };
  const mutate = async (
    action: (s: NutritionStore) => ReturnType<NutritionStore["load"]>,
  ) => {
    if (running) throw Error("正在保存，请等待完成。");
    running = true;
    publish({ ...snapshot, saving: true });
    try {
      publish({
        ...(await action(await store())),
        status: "ready",
        saving: true,
      });
    } catch (error) {
      // Reload resolves the rare commit-success/read-failure case without claiming rollback.
      await reload();
      throw Error(
        error instanceof Error &&
          !/sqlite|sql|constraint|database/i.test(error.message)
          ? error.message
          : "本机保存未完成或状态尚未确认，请检查存储空间后重试同一次提交。",
      );
    } finally {
      running = false;
      publish({ ...snapshot, saving: false });
    }
  };
  const updateEntry = (entry: Entry) => mutate((s) => s.update(entry));
  return {
    kind: "production",
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      if (!initialized) void reload();
      return () => {
        listeners.delete(listener);
      };
    },
    reload,
    record: (entry, operation) => mutate((s) => s.record(entry, operation)),
    updateEntry,
    updatePortion: (id, amount) => {
      const e = snapshot.entries.find((e) => e.id === id);
      if (!e) throw Error("记录不存在。");
      return updateEntry({ ...e, amount });
    },
    deleteEntry: (id) => mutate((s) => s.remove(id)),
    configureTargets: (targets) => mutate((s) => s.targets(targets)),
  };
}
