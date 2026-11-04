import {
  sanitizeProfile,
  validatePolicies,
  type PersonalProfile,
  type TargetDraft,
} from "./profile";
import { originalTask, retryTask, restoreOriginal } from "../covers/tasks";
import type { FoodSqlDriver } from "../../infrastructure/food/sqliteFoodStore";
import type {
  Entry,
  Targets,
  Food,
  CoverTask,
} from "../../features/nutrition-v2/model";
import { safeId, snapshotEntry, validateTargets } from "./validation";

/** Additive migration; deliberately no foreign key to mutable foods/inventory. */
export const NUTRITION_MIGRATION_V7 = `
CREATE TABLE IF NOT EXISTS nutrition_entries (
 id TEXT PRIMARY KEY NOT NULL, date TEXT NOT NULL, meal TEXT NOT NULL,
 snapshot_json TEXT NOT NULL, confirmed_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS nutrition_entries_by_date ON nutrition_entries(date, meal, confirmed_at, id);
CREATE TABLE IF NOT EXISTS nutrition_operations (
 operation_id TEXT PRIMARY KEY NOT NULL, entry_id TEXT NOT NULL, committed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nutrition_settings (id INTEGER PRIMARY KEY CHECK(id=1), targets_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS nutrition_photo_cleanup (entry_id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE IF NOT EXISTS simple_package_hints (food_id TEXT PRIMARY KEY NOT NULL REFERENCES foods(id) ON DELETE CASCADE, json TEXT NOT NULL);
PRAGMA user_version = 7;
`;
export interface NutritionPhotos {
  copy(id: string, source: string): Promise<string>;
  remove(id: string): Promise<void>;
  exists(uri: string): Promise<boolean>;
}
export function createNutritionStore(
  driver: FoodSqlDriver,
  photos: NutritionPhotos,
  now = () => new Date().toISOString(),
) {
  let writes: Promise<unknown> = Promise.resolve();
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const next = writes.then(task, task);
    writes = next.catch(() => {});
    return next;
  };
  async function cleanup() {
    for (const row of await driver.all<{ entry_id: string }>(
      "SELECT entry_id FROM nutrition_photo_cleanup",
    )) {
      if (
        (await driver.get(
          "SELECT id FROM nutrition_entries WHERE id=?",
          row.entry_id,
        )) ||
        (await driver.get(
          "SELECT food_id FROM nutrition_catalogue WHERE asset_id=?",
          row.entry_id,
        ))
      ) {
        await driver.run(
          "DELETE FROM nutrition_photo_cleanup WHERE entry_id=?",
          row.entry_id,
        );
        continue;
      }
      try {
        await photos.remove(row.entry_id);
        await driver.run(
          "DELETE FROM nutrition_photo_cleanup WHERE entry_id=?",
          row.entry_id,
        );
      } catch {
        /* durable queue retries next launch/write; never delete a referenced photo */
      }
    }
  }
  async function read() {
    const rows = await driver.all<{ snapshot_json: string }>(
      "SELECT snapshot_json FROM nutrition_entries ORDER BY date,confirmed_at,id",
    );
    const row = await driver.get<{ targets_json: string }>(
      "SELECT targets_json FROM nutrition_settings WHERE id=1",
    );
    const stateRows = await driver.all<{ key: string; json: string }>(
      "SELECT key,json FROM nutrition_state",
    );
    const state = Object.fromEntries(
      stateRows.map((r) => [r.key, JSON.parse(r.json)]),
    );
    const catalogue = await driver.all<{ json: string }>(
      "SELECT json FROM nutrition_catalogue ORDER BY food_id",
    );
    const covers = await driver.all<{ food_id: string; json: string }>(
      "SELECT food_id,json FROM nutrition_covers",
    );
    return {
      profile: state.profile as PersonalProfile | undefined,
      targetDraft: state.targetDraft as TargetDraft | undefined,
      onboardingDeferred: state.onboardingDeferred === true,
      intakeDraft: state.intakeDraft as Entry | undefined,
      captureDraft: state.captureDraft as
        | { id: string; original: string; description: string }
        | undefined,
      catalogue: catalogue.map((r) => JSON.parse(r.json) as Food),
      covers: Object.fromEntries(
        covers.map((r) => [r.food_id, JSON.parse(r.json) as CoverTask]),
      ),
      entries: rows.map((r) => JSON.parse(r.snapshot_json) as Entry),
      targets: row
        ? validateTargets(JSON.parse(row.targets_json) as Targets)
        : {},
    };
  }
  async function setState(key: string, value: unknown) {
    await driver.run(
      "INSERT INTO nutrition_state(key,json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json",
      key,
      JSON.stringify(value),
    );
  }
  const changeCover = (foodId: string, action: (old: CoverTask) => CoverTask) =>
    serialize(async () => {
      safeId(foodId);
      const row = await driver.get<{ json: string }>(
        "SELECT json FROM nutrition_covers WHERE food_id=?",
        foodId,
      );
      if (!row) throw Error("此食品暂无可处理的原图。");
      await driver.run(
        "UPDATE nutrition_covers SET json=? WHERE food_id=?",
        JSON.stringify(action(JSON.parse(row.json))),
        foodId,
      );
      return read();
    });
  return {
    catalogueFood: (input: Food) => {
      const food = snapshotEntry({
        id: "validate-food",
        date: "2000-01-01",
        meal: "lunch",
        food: input,
        amount: input.basis.amount,
        unit: input.basis.unit,
      }).food;
      return serialize(async () => {
        const old = await driver.get<{ json: string }>(
          "SELECT json FROM nutrition_catalogue WHERE food_id=?",
          food.id,
        );
        if (!old) throw Error("食品不存在。");
        if (JSON.parse(old.json).image !== food.image)
          throw Error("此处不能替换原图。");
        await driver.run(
          "UPDATE nutrition_catalogue SET json=? WHERE food_id=?",
          JSON.stringify(food),
          food.id,
        );
        return read();
      });
    },
    profile: (input: PersonalProfile) => {
      const p = sanitizeProfile(input);
      return serialize(async () => {
        const old = await driver.get<{ json: string }>(
          "SELECT json FROM nutrition_state WHERE key='profile'",
        );
        const previous = old ? JSON.parse(old.json) : null;
        if (
          previous &&
          [
            "age",
            "heightCm",
            "weightKg",
            "exerciseDescription",
            "exerciseFrequencyPerWeek",
            "sex",
          ].every(
            (k) =>
              (previous[k] ?? "") === (p[k as keyof PersonalProfile] ?? ""),
          )
        )
          return read();
        p.revision = (previous?.revision ?? 0) + 1;
        p.updatedAt = now();
        await setState("profile", p);
        return read();
      });
    },
    targetDraft: (draft: TargetDraft | null) =>
      serialize(async () => {
        if (draft) validatePolicies(draft.policies);
        await setState("targetDraft", draft);
        return read();
      }),
    applyDraft: (draft: TargetDraft) =>
      serialize(async () => {
        const policies = validatePolicies(draft.policies);
        if (!Object.keys(policies).length)
          throw Error("尚无可应用目标，请补充资料。");
        await driver.transaction(async (tx) => {
          const row = await tx.get<{ json: string }>(
            "SELECT json FROM nutrition_state WHERE key='profile'",
          );
          if (!row || JSON.parse(row.json).revision !== draft.profileRevision)
            throw Error("资料已修改，请重新估算或核对手动目标。");
          const old = await tx.get<{ targets_json: string }>(
            "SELECT targets_json FROM nutrition_settings WHERE id=1",
          );
          const targets = old
            ? validateTargets(JSON.parse(old.targets_json))
            : {};
          for (const policy of Object.values(policies))
            if (policy) policy.appliedAt = now();
          // Missing recommendations retain previously confirmed targets.
          targets.policies = { ...targets.policies, ...policies };
          await tx.run(
            "INSERT INTO nutrition_settings(id,targets_json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET targets_json=excluded.targets_json",
            JSON.stringify(targets),
          );
          await tx.run("DELETE FROM nutrition_state WHERE key='targetDraft'");
          await tx.run(
            "INSERT INTO nutrition_state(key,json) VALUES('onboardingDeferred','true') ON CONFLICT(key) DO UPDATE SET json='true'",
          );
        });
        return read();
      }),
    defer: () =>
      serialize(async () => {
        await setState("onboardingDeferred", true);
        return read();
      }),
    captureDraft: (
      input: { id: string; original: string; description: string } | null,
    ) =>
      serialize(async () => {
        if (input) {
          safeId(input.id);
          if (
            !input.original.startsWith("file://") ||
            input.description.length > 4000
          )
            throw Error("餐食草稿格式无效。");
        }
        await setState(
          "captureDraft",
          input
            ? {
                id: input.id,
                original: input.original,
                description: input.description,
              }
            : null,
        );
        return read();
      }),
    intakeDraft: (input: Entry | null) => {
      const entry = input ? snapshotEntry(input) : null;
      return serialize(async () => {
        // A late draft flush after confirmation (or deletion) cannot resurrect
        // the operation. The intake tombstone outlives the visible record.
        if (
          entry &&
          (await driver.get(
            "SELECT entry_id FROM nutrition_operations WHERE entry_id=?",
            entry.id,
          ))
        )
          return read();
        await setState("intakeDraft", entry);
        return read();
      });
    },
    restoreCover: (id: string) => changeCover(id, restoreOriginal),
    retryCover: (id: string) => changeCover(id, retryTask),
    load: () =>
      serialize(async () => {
        await cleanup();
        return read();
      }),
    record: (input: Entry, operationId: string) => {
      const entry = snapshotEntry(input); // clone before any await, including photos/provenance
      safeId(operationId);
      return serialize(async () => {
        const done = await driver.get<{ entry_id: string }>(
          "SELECT entry_id FROM nutrition_operations WHERE operation_id=?",
          operationId,
        );
        if (done) {
          await driver.run(
            "DELETE FROM nutrition_state WHERE key='intakeDraft' AND json_extract(json,'$.id')=?",
            done.entry_id,
          );
          return read();
        } // tombstones survive deletion; late callback cannot resurrect a meal
        if (
          await driver.get(
            "SELECT id FROM nutrition_entries WHERE id=?",
            entry.id,
          )
        )
          throw Error("这条记录已经存在，请从饮食记录编辑。");
        const at = now();
        entry.confirmedAt = at;
        entry.updatedAt = at;
        try {
          if (entry.food.image) {
            await driver.run(
              "INSERT OR IGNORE INTO nutrition_photo_cleanup(entry_id) VALUES(?)",
              entry.id,
            );
            entry.food.image = await photos.copy(entry.id, entry.food.image);
            if (!(await photos.exists(entry.food.image)))
              throw Error("照片保存校验失败，本次没有新增饮食记录。");
          }
          await driver.transaction(async (tx) => {
            await tx.run(
              "INSERT INTO nutrition_operations(operation_id,entry_id,committed_at) VALUES(?,?,?)",
              operationId,
              entry.id,
              at,
            );
            await tx.run(
              "INSERT INTO nutrition_entries(id,date,meal,snapshot_json,confirmed_at,updated_at) VALUES(?,?,?,?,?,?)",
              entry.id,
              entry.date,
              entry.meal,
              JSON.stringify(entry),
              at,
              at,
            );
            await tx.run(
              "INSERT OR IGNORE INTO nutrition_catalogue(food_id,json,asset_id) VALUES(?,?,?)",
              entry.food.id,
              JSON.stringify(entry.food),
              entry.food.image ? entry.id : null,
            );
            if (entry.food.image)
              await tx.run(
                "INSERT OR IGNORE INTO nutrition_covers(food_id,json) VALUES(?,?)",
                entry.food.id,
                JSON.stringify(
                  originalTask(
                    entry.food.id,
                    entry.food.image,
                    entry.id,
                    entry.food.version,
                  ),
                ),
              );
            await tx.run(
              "DELETE FROM nutrition_state WHERE key='intakeDraft' AND json_extract(json,'$.id')=?",
              entry.id,
            );
            await tx.run(
              "DELETE FROM nutrition_state WHERE key='captureDraft' AND json_extract(json,'$.original')=?",
              input.food.image ?? "",
            );
            await tx.run(
              "DELETE FROM nutrition_photo_cleanup WHERE entry_id=?",
              entry.id,
            );
          });
        } catch (error) {
          await cleanup();
          throw error;
        }
        // Commit succeeded. A later reload failure must not invite a second insert.
        return read();
      });
    },
    update: (input: Entry) => {
      const entry = snapshotEntry(input);
      return serialize(async () => {
        await driver.transaction(async (tx) => {
          const row = await tx.get<{ snapshot_json: string }>(
            "SELECT snapshot_json FROM nutrition_entries WHERE id=?",
            entry.id,
          );
          if (!row) throw Error("记录已不存在，请返回饮食记录刷新。");
          const old = JSON.parse(row.snapshot_json) as Entry;
          if (entry.food.image !== old.food.image)
            throw Error("此处仅修改饮食资料，不能替换历史照片。");
          entry.confirmedAt = old.confirmedAt ?? now();
          entry.updatedAt = now();
          await tx.run(
            "UPDATE nutrition_entries SET date=?,meal=?,snapshot_json=?,updated_at=? WHERE id=?",
            entry.date,
            entry.meal,
            JSON.stringify(entry),
            entry.updatedAt,
            entry.id,
          );
        });
        return read();
      });
    },
    remove: (id: string) =>
      serialize(async () => {
        safeId(id);
        await driver.transaction(async (tx) => {
          await tx.run(
            "INSERT OR IGNORE INTO nutrition_photo_cleanup(entry_id) VALUES(?)",
            id,
          );
          await tx.run("DELETE FROM nutrition_entries WHERE id=?", id);
        });
        await cleanup();
        return read();
      }),
    targets: (input: Targets) => {
      const targets = validateTargets(input);
      return serialize(async () => {
        await driver.transaction(async (tx) => {
          await tx.run(
            "INSERT INTO nutrition_settings(id,targets_json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET targets_json=excluded.targets_json",
            JSON.stringify(targets),
          );
        });
        return read();
      });
    },
  };
}
export type NutritionStore = ReturnType<typeof createNutritionStore>;
