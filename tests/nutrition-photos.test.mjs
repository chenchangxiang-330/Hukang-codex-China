import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import "./register-typescript.mjs";

const state = {
  files: new Map(),
  folders: new Set(),
  settle: null,
  reject: null,
};
const uri = (...parts) =>
  parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
class Directory {
  constructor(...parts) {
    this.uri = uri(...parts);
  }
  get exists() {
    return state.folders.has(this.uri);
  }
  create() {
    state.folders.add(this.uri);
  }
  delete() {
    state.folders.delete(this.uri);
    for (const name of state.files.keys())
      if (name.startsWith(this.uri + "/")) state.files.delete(name);
  }
}
class File {
  constructor(...parts) {
    this.uri = uri(...parts);
  }
  get exists() {
    return state.files.has(this.uri);
  }
  get size() {
    return state.files.get(this.uri)?.length ?? 0;
  }
  copy(target) {
    const data = state.files.get(this.uri);
    return new Promise((resolve, reject) => {
      state.settle = () => {
        state.files.set(target.uri, Buffer.from(data));
        resolve();
      };
      state.reject = reject;
    });
  }
}
globalThis[Symbol.for("nutrition-test-fs")] = {
  Directory,
  File,
  Paths: { document: "file:///document" },
};
registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier === "expo-file-system" &&
      context.parentURL?.endsWith("/nutrition/photos.ts")
    )
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(
            'export const {Directory,File,Paths} = globalThis[Symbol.for("nutrition-test-fs")];',
          ),
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const { nutritionPhotos } = await import("../src/services/nutrition/photos.ts");

test("durable photo waits for asynchronous Expo copy before reporting a verified destination", async () => {
  const source = "file:///upload.jpg";
  state.files.set(source, Buffer.from("original photo bytes"));
  let settled = false;
  const pending = nutritionPhotos.copy("entry-copy", source);
  pending.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    settled,
    false,
    "Copy must not verify a missing destination while native work is pending",
  );
  state.settle();
  const saved = await pending;
  assert.equal(await nutritionPhotos.exists(saved), true);
  assert.deepEqual(state.files.get(saved), state.files.get(source));
  await nutritionPhotos.remove("entry-copy");
  assert.equal(state.files.has(saved), false);
  assert.equal(state.files.has(source), true);
});

test("native copy rejection reaches the save transaction and can be cleaned without touching the source", async () => {
  const pending = nutritionPhotos.copy(
    "entry-failed-copy",
    "file:///upload.jpg",
  );
  const rejected = assert.rejects(pending, /disk copy failed/);
  state.reject(Error("disk copy failed"));
  await rejected;
  await nutritionPhotos.remove("entry-failed-copy");
  assert.equal(
    state.folders.has("file:///document/nutrition-photos/entry-failed-copy"),
    false,
  );
  assert.equal(state.files.has("file:///upload.jpg"), true);
});
