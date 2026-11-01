import type { FoodSqlDriver } from "../../infrastructure/food/sqliteFoodStore";
import type { Entry, Targets } from "../../features/nutrition-v2/model";
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
        await driver.get(
          "SELECT id FROM nutrition_entries WHERE id=?",
          row.entry_id,
        )
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
    return {
      entries: rows.map((r) => JSON.parse(r.snapshot_json) as Entry),
      targets: row
        ? validateTargets(JSON.parse(row.targets_json) as Targets)
        : {},
    };
  }
  return {
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
        if (done) return read(); // tombstones survive deletion; late callback cannot resurrect a meal
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
