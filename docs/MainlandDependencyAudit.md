# Mainland production dependency audit

Scope: `main` simple local product, Android arm64-v8a, minSdk 26. Audit date: 2026-10-15 (Asia/Shanghai).

**Active `CHINA_SERVICE`: 0. Active `FOREIGN_NETWORK_SERVICE`: 0.**
Barcode decoding, PP-OCRv5, photos, nutrition parsing, manual review, SQLite,
drafts, inventory and export all run locally. No provider is instantiated by
the production route. The final APK must remove both INTERNET and
ACCESS_NETWORK_STATE. CI inspects its actual Manifest, bundled model hashes,
JS and resolved release dependency graph. Emulator acceptance disables Wi-Fi/
mobile data and drops IPv4/IPv6 outbound traffic before executing the app.

Historical provider/server code remains non-runtime reference only; it is not
a startup dependency, button, fallback, or an enabled domestic service. Future
activation requires a separate product decision and audit. Developer npm/Maven/
GitHub downloads and user-directed system sharing are distinct from App runtime
network requests.

## Categories

| Category | Meaning |
| --- | --- |
| `LOCAL` | App-owned on-device logic, records, pictures, and bundled domestic models |
| `CHINA_SERVICE` | Explicitly enabled, authorized mainland network service |
| `FOREIGN_OFFLINE_LIBRARY` | Foreign-origin code/runtime executing locally, without a required server |
| `FOREIGN_NETWORK_SERVICE` | Production function depends on a foreign server |

## Local runtime inventory

JavaScript versions are locked in `package-lock.json`; direct Android modules
are declared in their Gradle files. Some transitive versions below come from
the **historical 2026-10-08** local `releaseRuntimeClasspath` report. That report
predates this simple-product build and does not establish the final 0.3.3 graph.
The current release workflow must save and inspect its own resolved
`runtime-dependencies.txt`. Final-build status is recorded in
[SimpleAppAcceptance.md](SimpleAppAcceptance.md), not inferred from this table.

| Component | Version / location | Category | Simple-product runtime role |
| --- | --- | --- | --- |
| Hukang UI, use cases, domain and Kotlin adapter | `src/`, `modules/hukang-vision/` | `LOCAL` | Local image preparation, OCR, barcode flow and raw evidence display |
| PaddlePaddle detection model | PP-OCRv5_mobile_det_onnx | `LOCAL` | APK-bundled domestic model; no runtime download |
| PaddlePaddle recognition model and dictionary | PP-OCRv5_mobile_rec_onnx + paired config | `LOCAL` | APK-bundled domestic model and exact dictionary |
| Reviewed PaddleOCR Android engine source | v3.7.0 baseline | `LOCAL` | Local inference; no model API endpoint |
| ONNX Runtime Android | 1.21.1 | `FOREIGN_OFFLINE_LIBRARY` | CPU inference only; no upload, downloader, telemetry or Play Services dependency in application path |
| OpenCV Android | 4.5.3.0 | `FOREIGN_OFFLINE_LIBRARY` | Bundled native image operations; no cloud recognition |
| AndroidX ExifInterface | 1.4.1 | `FOREIGN_OFFLINE_LIBRARY` | Read EXIF metadata locally; not Google Play Services |
| AndroidX CameraX camera2/lifecycle/view | 1.4.2, `modules/hukang-barcode/android` | `FOREIGN_OFFLINE_LIBRARY` | Native live camera preview and local Y-plane frame delivery; Apache-2.0; no ML Kit, GMS, or network client |
| ZXing core | 3.5.3, `modules/hukang-barcode/android` | `FOREIGN_OFFLINE_LIBRARY` | On-device EAN/UPC decoding for CameraX frames and local images; Apache-2.0; no ML Kit, GMS, or network client |
| React / React Native / Hermes | 19.2.3 / 0.86.3 / 250829098.0.17 | `FOREIGN_OFFLINE_LIBRARY` | Bundled UI and JavaScript execution; Hermes version shown is from the historical graph and requires current-build confirmation |
| Expo core and module infrastructure | 57.0.27 / SDK-managed modules | `FOREIGN_OFFLINE_LIBRARY` | Custom APK; Expo Go and Expo-hosted JavaScript not needed |
| Expo Router / linking | SDK 57 modules | `FOREIGN_OFFLINE_LIBRARY` | Local route navigation; no remote route/provider configuration |
| Expo image picker | SDK 57 module | `FOREIGN_OFFLINE_LIBRARY` | User selects a photo through Android; app imports a local copy |
| Expo file system | SDK 57 module | `FOREIGN_OFFLINE_LIBRARY` | Local evidence files only; its generic download APIs are not invoked |
| Expo sharing | SDK 57 module | `FOREIGN_OFFLINE_LIBRARY` | User-initiated local evidence export through OS share sheet; no automatic upload |
| OkHttp / OkHttp URLConnection | 4.9.2 / 4.9.2 | `FOREIGN_OFFLINE_LIBRARY` | Transitive generic HTTP infrastructure; no configured OCR, food, AI or other remote provider is invoked |
| Okio / Okio JVM | 3.16.0 / 3.16.0 | `FOREIGN_OFFLINE_LIBRARY` | Transitive local buffering and I/O utilities; presence does not imply a server dependency |
| Fresco / imagepipeline-okhttp3 | 3.6.0 / 3.6.0, historical graph | `FOREIGN_OFFLINE_LIBRARY` | React Native image infrastructure; this UI displays imported local images, not remote image URLs |
| Glide | 5.0.5, historical graph | `FOREIGN_OFFLINE_LIBRARY` | Expo image-loader transitive infrastructure; this app uses local photo resources |
| Expo WebView | 57.0.1, historical graph | `FOREIGN_OFFLINE_LIBRARY` | Historical resolved module infrastructure; this product does not render or open a remote WebView |
| Splash/status bar, safe-area and screens | SDK-compatible pinned lockfile | `FOREIGN_OFFLINE_LIBRARY` | Local rendering and lifecycle |
| `ChinaFoodRepository` / SQLite adapter | `src/infrastructure/food/` | `LOCAL` | Food records, evidence and revisions remain on-device; no provider or cloud sync |
| `MedicineRepository` | TypeScript contract only | `LOCAL` | No medicine provider or remote lookup implementation |

Historical `ConfiguredChinaFoodProvider` (`src/infrastructure/food/providers/`)
and `server/hukang-food-service.mjs` are dormant references to a previously
considered `CHINA_SERVICE` boundary. They are excluded from the active runtime
inventory and counts. They are not linked from `src/app/index.tsx` or the simple
product UI. Their former consent/HTTPS configuration does **not** authorize a
network permission or supplier call in this build.

This product deliberately does **not** add `expo-camera`. Expo Camera 57's Android
barcode implementation declares `com.google.mlkit:barcode-scanning`,
`com.google.android.gms:play-services-code-scanner`, and
`androidx.camera:camera-mlkit-vision`. Those are prohibited in this product.
The custom `modules/hukang-barcode` module instead uses AndroidX CameraX
camera2/lifecycle/view 1.4.2 for the live preview and frame delivery, with
Apache-2.0 ZXing core 3.5.3 decoding only the local Y plane. Its separate
`scanImage` function accepts only local `file://` or `content://` images and
rejects `http://` and `https://` before opening a stream. The live analyzer
uses CameraX's reported 0/90/180/270 degree correction and tries right-angle
fallbacks; reflection, low light, and small/curved labels still need device
testing.

Recorded earlier device attempts exercised the album/synthetic-barcode path on
an Android emulator (`physicalCameraVerified: false`); their exact APK and
partial results are listed in [SimpleAppAcceptance.md](SimpleAppAcceptance.md).
The separate 0.3.3 replay `38706597120` passed the image-based offline flow; its exact APK and evidence are recorded there. Camera permission is
declared and the live view is implemented, but physical camera focus, exposure,
torch, continuous-frame decoding, and OPPO hardware behavior remain
unverified. Do not use the image-only evidence as a physical-camera claim.

The dependency inventory includes generic networking-capable libraries, including
OkHttp and image-loading adapters. Their capability is distinct from a
configured production service; this APK must not be described as containing
no HTTP-capable code. This simple-product application uses local image/file
resources and must remove **both `INTERNET` and `ACCESS_NETWORK_STATE`** from the
final release Manifest. There is no domestic identity-query exception in this
version. Neither a dependency name nor successful Gradle resolution proves
absence of traffic; final Manifest inspection and offline execution are separate
gates tied to the actual delivered APK.

### Historical dependency graph: 2026-10-08, not this build's verification

On 2026-10-08 the following command ran locally with the then-existing Java 17 / Android SDK /
Gradle environment and its configured proxy; it did not rebuild the APK:

```text
./gradlew :app:dependencies --configuration releaseRuntimeClasspath --console=plain --no-daemon --max-workers=2
```

Historical result: exit code 0, `BUILD SUCCESSFUL in 1m`, with no dependency-tree `FAILED`
or unresolved `(n)` nodes. The preserved raw report is 94,037 bytes with SHA-256
`d57d33e056827d4fc66d759ad4bd70526f1e115cfd43b44b55f6ecd022131dd0`.
It contains 200 distinct resolved Maven coordinates plus local project
dependencies; repeated branches and constraints are not counted as extra
libraries. Dependency metadata resolution is not proof that every binary was
downloaded locally, and it is separate from the recorded GitHub Actions release
compilation and APK inspection. The original report is preserved in
[release-dependencies-local-64808a5.txt](evidence/phase1/release-dependencies-local-64808a5.txt).
Do not use its successful result, library count or hash as 0.3.3 evidence.

That historical graph contains no `com.google.android.gms`, `com.google.firebase`,
`com.google.mlkit`, Google Cloud Vision, Gemini/GenAI, OpenAI, Open Food Facts or
Wikidata SDK coordinates. No Sentry, Firebase Analytics/Crashlytics/Remote
Config, Bugsnag, App Center, Mixpanel, Amplitude, Segment, OpenTelemetry or New
Relic coordinates were found. This establishes the checked graph's dependency
inventory, not a universal claim about every internal code path or device
packet. Google Material, Gson, annotations and Guava's listenable-future utility
are local libraries and do not constitute Google Play Services or Google OCR.

## Prohibited production integrations

| Item | Current simple-product policy / inspection target |
| --- | --- |
| Google ML Kit / Google Vision / Google Play Services | No OCR SDK, service dependency, client, plugin or fallback |
| Firebase | No Firebase SDK, google-services plugin/config or backend |
| OpenAI / Gemini / other online OCR | No model/API client, key, URL, provider or fallback |
| Open Food Facts / Wikidata | No food lookup, mapping, cache, import or fallback |
| Telemetry / analytics / crash reporting | No Sentry, analytics SDK, event uploader or crash reporting service |
| Remote config | No remote-config SDK or endpoint |
| Model auto-download | Models must exist and match fixed hashes before release build; missing assets fail explicitly |
| OTA updates | `app.json` has `updates.enabled=false`; bundled release JavaScript |
| Cloud sync / backup | No app cloud sync; Android `allowBackup=false` |

Model provenance URLs and license URLs in documentation are not runtime
requests. App name `hukang-vision` denotes the local native module, not Google,
OpenAI, or another remote Vision service.

ONNX Runtime telemetry is explicitly disabled before session creation; failure
to disable it aborts engine initialization. Expo image-picker's optional Google
Play Services photo-picker backport metadata service is removed by the project
config plugin. Neither check substitutes for inspecting the resulting APK.

Two CC-BY-SA-3.0 photographs in `tests/fixtures/china-food/` retain historical
Open Food Facts attribution from the read-only archive. They are test inputs,
are not packaged as a food catalog, and do not enable a lookup/API/import path
in the production App. No network request is made to obtain them at runtime.

## Manifest and network gates

- Both `INTERNET` and `ACCESS_NETWORK_STATE` must be absent from the final
  release APK. The current application has no domestic lookup exception,
  provider switch or network fallback. Missing local records lead to local
  manual capture, not a remote query.
- Source Manifest remove markers express the intended permission boundary;
  they are not granted permissions and do not prove the final merged result.
  Inspect the decoded release Manifest and save the full permission list.
  Camera and local image access permissions are audited separately and must
  support the implemented local capture flow.
- Expo updates is disabled. Any generated `CHECK_ON_LAUNCH` metadata must be
  interpreted together with the disabled flag; no update URL is configured.
- The release merged Manifest and APK's decoded Manifest must both be checked.
  Attribute/permission names cannot be inferred by searching raw compressed APK bytes.
- Check resolved release npm/Gradle packages for prohibited SDKs; save the
  resolved inventory, not only direct `package.json` dependencies.
- Install the exact built ARM64 release APK. Disable Wi-Fi/mobile data and
  record the available outbound-blocking controls before testing local barcode
  decoding, OCR, manual confirmation, saving, restart, inventory and export.
  Record model initialization, OCR timing, evidence and any network observation.
  Separate emulator ARM translation from physical ARM64 device evidence. No
  supplier endpoint, credentials or authorized online deployment is required
  for this product's acceptance.

Android's system photo provider may offer cloud-backed images, and other apps
chosen by an explicit share action may have their own network behavior. Hukang
does not require either for offline OCR; acceptance uses locally available
photos. These external OS/app behaviors must not be described as Hukang
silently uploading images.

## Development and build supply chain (not app services)

GitHub/source downloads, npm registry, Maven/Google Maven, Gradle distributions,
Expo CLI and model-artifact downloads occur while developing/building. They do
not make a bundled APK depend on those servers during user OCR. Build tools
must still preserve license provenance and lock versions, but are kept out of
the production service count. Expo CLI telemetry settings are build-tool
settings, not evidence that the app has telemetry.

JVM barcode fixtures, Android emulator system images, test-only dependencies
and attributed archived packaging photos are also development/test inputs.
An emulator image containing Google packages is not evidence that those packages
are in the delivered APK or required by the app; acceptance disables the
identified Google services and tests local images. Production SDK checks still
apply to the actual release dependency graph. Test-generated product records
must not be bundled as production food data.

## Verification status

This document records the current source-level policy and distinguishes the
historical dependency resolution from this build's evidence. Final Manifest,
model bundling, resolved dependencies, GitHub Actions compilation, installed
Android execution and offline/network observations must each retain their
individual status and source/APK identity in
[SimpleAppAcceptance.md](SimpleAppAcceptance.md). The 0.3.3 build `38703696958` passed artifact and dependency checks; replay
`38706597120` passed the installed image-barcode/OCR/inventory/export flow with
IPv4/IPv6 OUTPUT blocked. Its source and APK hash are recorded in the acceptance
report. This is emulator evidence, not physical-camera, OPPO, or packet-capture
verification. The historical graph remains separate.

Future Paddle Lite / Paddle-native runtime evaluation is recorded as an
optional optimization. It does not block the fixed ONNX Runtime baseline.

## Signing and upgrade boundary

Release signing and same-signature `adb install -r` data-preservation checks are
defined in [AndroidSigningAndUpgradePolicy.md](AndroidSigningAndUpgradePolicy.md).
The policy does not treat an ephemeral CI certificate as a production signing key.


## UI V1 增量审计（2026-10-26）

`codex/ui-v1` / 0.4.0 仅添加本地 UI，没有新的生产依赖。`LOCAL` 增加设计组件、每日记录临时演示和 AI 配置格式检查；后者没有 HTTP 客户端、密钥持久化或真实连接测试。原有离线运行边界不变，CHINA_SERVICE 与 FOREIGN_NETWORK_SERVICE 仍为 0。APK 实际检查见 [UIV1Acceptance.md](UIV1Acceptance.md)。

新加入的 `@playwright/test`、`esbuild`、`prettier`、`react-native-web` 仅是开发/测试依赖，用于本地浏览器预览和截图，不是 Android 运行服务，也不把测试 controller 或样例食品导入 App。字体使用系统字体，导航图形用原生 View 绘制，没有远程字体或图标请求。预览照片是既有许可测试素材，截图内有持续演示提示，不能作为生产食品库内容或实际 OCR 输出。

浏览器测试观察到的零外部请求只说明共享 UI 测试会话；不作为 Android 网络抓包或设备断网执行证据。
