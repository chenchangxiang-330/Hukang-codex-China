import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import "./register-typescript.mjs";

// Test only the JS/native contract here. Real decoding uses the installed APK.
const bridgeKey = Symbol.for("hukang-test-image-bridge");
registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier === "expo-modules-core" &&
      context.parentURL?.endsWith("/services/ai/images.ts")
    ) {
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(
            'export const requireNativeModule = () => globalThis[Symbol.for("hukang-test-image-bridge")];',
          ),
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});
const { prepareUpload } = await import("../src/services/ai/images.ts");
const image = {
  uri: "file:///owned/upload.jpg",
  width: 100,
  height: 200,
  bytes: 1000,
  metadataRemoved: true,
};

test("image cancellation before processing never enters native work", async () => {
  let calls = 0;
  globalThis[bridgeKey] = {
    prepareImage: () => {
      calls++;
    },
  };
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    prepareUpload("file:///picker/copy.jpg", controller.signal),
    /已取消本地图片处理/,
  );
  assert.equal(calls, 0);
});

test("cancel during native work discards and cleans a late upload copy without deleting the source", async () => {
  let resolve, id;
  const cancelled = [],
    removed = [];
  globalThis[bridgeKey] = {
    prepareImage: (requestId) => {
      id = requestId;
      return new Promise((done) => {
        resolve = done;
      });
    },
    cancel: (requestId) => cancelled.push(requestId),
    removeUpload: async (uri) => removed.push(uri),
  };
  const controller = new AbortController();
  const pending = prepareUpload("file:///picker/copy.jpg", controller.signal);
  const rejected = assert.rejects(pending, /已取消本地图片处理/);
  controller.abort();
  resolve(image);
  await rejected;
  assert.deepEqual(cancelled, [id]);
  assert.deepEqual(removed, [image.uri]);
});

test("native image errors are bounded public feedback and oversized results are never accepted", async () => {
  globalThis[bridgeKey] = {
    prepareImage: async () => {
      throw { code: "IMAGE_SOURCE_SIZE", message: "private-native-details" };
    },
  };
  await assert.rejects(
    prepareUpload("file:///picker/copy.jpg", new AbortController().signal),
    /原图超过本机 50 MB/,
  );
  const removed = [];
  globalThis[bridgeKey] = {
    prepareImage: async () => ({ ...image, bytes: 4_000_001 }),
    removeUpload: async (uri) => removed.push(uri),
  };
  await assert.rejects(
    prepareUpload("file:///picker/copy.jpg", new AbortController().signal),
  );
  assert.deepEqual(removed, [image.uri]);
});
