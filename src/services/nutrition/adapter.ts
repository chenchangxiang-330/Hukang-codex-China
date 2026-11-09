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
  let blocking = false;
  let queue: Promise<unknown> = Promise.resolve();
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
        saving: blocking,
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
  const perform = async (
    action: (s: NutritionStore) => ReturnType<NutritionStore["load"]>,
    background = false,
  ) => {
    if (running) throw Error("正在保存，请等待完成。");
    running = true;
    blocking = !background;
    publish({ ...snapshot, saving: blocking });
    try {
      publish({
        ...(await action(await store())),
        status: "ready",
        saving: blocking,
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
      blocking = false;
      publish({ ...snapshot, saving: false });
    }
  };
  // Autosaved inputs are ordered with other writes; no keystrokes are dropped.
  const mutate = (
    action: (s: NutritionStore) => ReturnType<NutritionStore["load"]>,
    background = false,
  ) => {
    const next = queue.then(
      () => perform(action, background),
      () => perform(action, background),
    );
    queue = next.catch(() => {});
    return next;
  };
  const updateEntry = (entry: Entry) => mutate((s) => s.update(entry));
  return {
    kind: "production",
    saveCatalogueFood: (f) => mutate((s) => s.catalogueFood(f)),
    saveHealthPhotos: (uris) => mutate((s) => s.healthPhotos(uris)),
    saveProfile: (p) => mutate((s) => s.profile(p), true),
    saveTargetDraft: (d) => mutate((s) => s.targetDraft(d)),
    applyTargetDraft: (d) => mutate((s) => s.applyDraft(d)),
    deferOnboarding: () => mutate((s) => s.defer()),
    saveCaptureDraft: (d) => mutate((s) => s.captureDraft(d), true),
    saveIntakeDraft: (e) => mutate((s) => s.intakeDraft(e), true),
    restoreCover: (id) => mutate((s) => s.restoreCover(id)),
    retryCover: (id) => mutate((s) => s.retryCover(id)),
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
