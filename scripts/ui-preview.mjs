/** Builds shared RN UI for a labelled browser preview. No native claims. */
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "artifacts/ui-preview");
export async function buildPreview() {
  await mkdir(path.join(out, "assets"), { recursive: true });
  await copyFile(
    path.join(root, "assets/icon.png"),
    path.join(out, "assets/icon.png"),
  );
  await copyFile(
    path.join(root, "tests/fixtures/china-food/6923644266066.jpg"),
    path.join(out, "assets/archived-milk.jpg"),
  );
  await build({
    entryPoints: [path.join(root, "tests/ui-preview/index.tsx")],
    bundle: true,
    outfile: path.join(out, "app.js"),
    platform: "browser",
    jsx: "automatic",
    define: { __DEV__: "true", "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "explicit-test-native-boundary",
        setup(b) {
          b.onResolve({ filter: /^react-native$/ }, () => ({
            path: path.join(root, "tests/ui-preview/react-native-shim.ts"),
          }));
          b.onResolve(
            {
              filter:
                /^(expo-router|expo-status-bar|expo-constants|expo-modules-core|react-native-safe-area-context)$/,
            },
            () => ({
              path: path.join(root, "tests/ui-preview/native-shims.tsx"),
            }),
          );
          b.onResolve({ filter: /useSimpleApp$/ }, () => ({
            path: path.join(root, "tests/ui-preview/controller-shim.ts"),
          }));
          b.onResolve({ filter: /^\.\/store$/ }, (args) =>
            args.importer.includes("/src/features/simple/")
              ? { path: path.join(root, "tests/ui-preview/store-shim.ts") }
              : undefined,
          );
          b.onLoad({ filter: /assets\/icon\.png$/ }, () => ({
            contents:
              'module.exports = { uri: "/assets/icon.png", width: 1024, height: 1024 };',
            loader: "js",
          }));
        },
      },
    ],
    logLevel: "warning",
  });
  await writeFile(
    path.join(out, "index.html"),
    `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5"><title>Hukang UI V1 — 明确标注的界面预览</title><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}#root{display:flex;flex-direction:column}body{font-family:system-ui,-apple-system,"Noto Sans CJK SC",sans-serif}*{box-sizing:border-box}button,input{font:inherit}#preview-notice{position:fixed;top:0;left:0;right:0;z-index:2147483647;height:36px;display:flex;align-items:center;justify-content:center;text-align:center;background:#fff3d9;color:#6c5125;font:11px/15px system-ui;padding:3px 10px;flex-shrink:0}#preview-app{margin-top:36px;height:calc(100% - 36px);display:flex;flex-direction:column}</style></head><body><div id="preview-notice" role="note">UI 预览 · 模拟数据仅在内存中 · 非设备扫码 / OCR</div><div id="preview-app"><div id="root"></div></div><script src="/app.js"></script></body></html>`,
  );
  return out;
}
export async function servePreview(port = 4173) {
  await buildPreview();
  const server = createServer(async (req, res) => {
    try {
      const raw = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const relative = raw === "/" ? "/index.html" : raw;
      const filename = path.resolve(out, "." + relative);
      if (!filename.startsWith(out + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const body = await readFile(filename);
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".png": "image/png",
        ".jpg": "image/jpeg",
      };
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(filename)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return server;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes("--serve")) {
    await servePreview(Number(process.env.UI_PREVIEW_PORT || 4173));
    console.log(
      "Labelled UI preview: http://127.0.0.1:4173 (no native OCR/SQLite)",
    );
  } else {
    console.log(await buildPreview());
  }
}
