# Mainland production dependency audit

Scope: Hukang China Phase 0 through Phase 3.1, Android arm64-v8a release, minSdk 26.
Audit date: 2026-10-13 (UTC).

**Configured production `FOREIGN_NETWORK_SERVICE` count: 0.** An optional
`CHINA_SERVICE` boundary now exists for barcode identity only; no provider URL,
credential or deployment is present in this repository. Final APK Manifest and
device traffic checks are separate acceptance gates; source configuration alone
does not prove device behavior.

The `main` simple product intentionally does not instantiate that historical
provider boundary. Its normal runtime is local-only: live barcode decoding,
PaddleOCR, food records, drafts, inventory and export all run on the device.
The merged Manifest removes both `INTERNET` and `ACCESS_NETWORK_STATE`; the
provider/server code remains a reference boundary for a future separately
authorized product and is not a startup or fallback path here.

## Categories

| Category | Meaning |
| --- | --- |
| `LOCAL` | App-owned on-device logic, records, pictures, and bundled domestic models |
| `CHINA_SERVICE` | Explicitly enabled, authorized mainland network service |
| `FOREIGN_OFFLINE_LIBRARY` | Foreign-origin code/runtime executing locally, without a required server |
| `FOREIGN_NETWORK_SERVICE` | Production function depends on a foreign server |

## Runtime inventory

JavaScript versions are locked in `package-lock.json`. Android versions below
include the actual local `releaseRuntimeClasspath` resolution recorded on
2026-10-08, rather than only direct Gradle declarations. The original report is
preserved in [release-dependencies-local-64808a5.txt](evidence/phase1/release-dependencies-local-64808a5.txt).

| Component | Version / location | Category | Phase 3 runtime role |
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
| React / React Native / Hermes | 19.2.3 / 0.86.3 / 250829098.0.17 | `FOREIGN_OFFLINE_LIBRARY` | Bundled UI and JavaScript execution; Hermes version is the actual resolved Android artifact |
| Expo core and module infrastructure | 57.0.27 / SDK-managed modules | `FOREIGN_OFFLINE_LIBRARY` | Custom APK; Expo Go and Expo-hosted JavaScript not needed |
| Expo Router / linking | SDK 57 modules | `FOREIGN_OFFLINE_LIBRARY` | Local route navigation; no remote route/provider configuration |
| Expo image picker | SDK 57 module | `FOREIGN_OFFLINE_LIBRARY` | User selects a photo through Android; app imports a local copy |
| Expo file system | SDK 57 module | `FOREIGN_OFFLINE_LIBRARY` | Local evidence files only; its generic download APIs are not invoked |
| Expo sharing | SDK 57 module | `FOREIGN_OFFLINE_LIBRARY` | User-initiated local evidence export through OS share sheet; no automatic upload |
| OkHttp / OkHttp URLConnection | 4.9.2 / 4.9.2 | `FOREIGN_OFFLINE_LIBRARY` | Transitive generic HTTP infrastructure; no configured OCR, food, AI or other remote provider is invoked |
| Okio / Okio JVM | 3.16.0 / 3.16.0 | `FOREIGN_OFFLINE_LIBRARY` | Transitive local buffering and I/O utilities; presence does not imply a server dependency |
| Fresco / imagepipeline-okhttp3 | 3.6.0 / 3.6.0 | `FOREIGN_OFFLINE_LIBRARY` | React Native image infrastructure; OCR Lab displays imported local images, not remote image URLs |
| Glide | 5.0.5 | `FOREIGN_OFFLINE_LIBRARY` | Expo image-loader transitive image infrastructure; Phase 1 uses local photo resources |
| Expo WebView | 57.0.1 | `FOREIGN_OFFLINE_LIBRARY` | Resolved Expo module infrastructure; OCR Lab does not render or open a remote WebView |
| Splash/status bar, safe-area and screens | SDK-compatible pinned lockfile | `FOREIGN_OFFLINE_LIBRARY` | Local rendering and lifecycle |
| `ChinaFoodRepository` / SQLite adapter | `src/infrastructure/food/` | `LOCAL` | Food records, evidence and revisions remain on-device; no provider or cloud sync |
| `MedicineRepository` | TypeScript contract only | `LOCAL` | No medicine provider or remote lookup implementation |
| `ConfiguredChinaFoodProvider` + fixed Hukang endpoint | `src/infrastructure/food/providers/`, optional build-time HTTPS origin | `CHINA_SERVICE` | Sends only validated barcode identity fields after user consent; absent endpoint fails closed; supplier key stays server-side |
| `server/` food identity service | `server/hukang-food-service.mjs` | `CHINA_SERVICE` | Fixed route, request validation, timeout, safe errors and injected vendor adapter; default `NOT_CONFIGURED`, no photos/OCR/food database |

There is no configured production `CHINA_SERVICE` yet. Local food records and
barcode associations are not uploaded to a central database; the optional query
payload contains only the user-approved barcode identity fields. OCR images,
OCR text, nutrition records and the local catalog never cross this boundary.

Phase 3 deliberately does **not** add `expo-camera`. Expo Camera 57's Android
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

The current device evidence exercised the album/synthetic-barcode path on an
Android emulator (`physicalCameraVerified: false`). Camera permission is
declared and the live view is implemented, but physical camera focus, exposure,
torch, continuous-frame decoding, and OPPO hardware behavior remain
unverified. Do not use the image-only evidence as a physical-camera claim.

The actual graph contains generic networking-capable libraries, including
OkHttp and image-loading adapters. Their capability is distinct from a
configured production service; this APK must not be described as containing
no HTTP-capable code. App-owned Phase 1 code uses local image/file resources,
and the release app's `INTERNET` permission is limited to the explicit domestic
identity lookup boundary; it does not enable model download or telemetry. Neither a dependency name nor successful Gradle
resolution proves absence of traffic; device observations are a separate gate.

### Actual Android release dependency graph

The following command ran locally with the existing Java 17 / Android SDK /
Gradle environment and its configured proxy; it did not rebuild the APK:

```text
./gradlew :app:dependencies --configuration releaseRuntimeClasspath --console=plain --no-daemon --max-workers=2
```

Result: exit code 0, `BUILD SUCCESSFUL in 1m`, with no dependency-tree `FAILED`
or unresolved `(n)` nodes. The preserved raw report is 94,037 bytes with SHA-256
`d57d33e056827d4fc66d759ad4bd70526f1e115cfd43b44b55f6ecd022131dd0`.
It contains 200 distinct resolved Maven coordinates plus local project
dependencies; repeated branches and constraints are not counted as extra
libraries. Dependency metadata resolution is not proof that every binary was
downloaded locally, and it is separate from the recorded GitHub Actions release
compilation and APK inspection.

The actual graph contains no `com.google.android.gms`, `com.google.firebase`,
`com.google.mlkit`, Google Cloud Vision, Gemini/GenAI, OpenAI, Open Food Facts or
Wikidata SDK coordinates. No Sentry, Firebase Analytics/Crashlytics/Remote
Config, Bugsnag, App Center, Mixpanel, Amplitude, Segment, OpenTelemetry or New
Relic coordinates were found. This establishes the checked graph's dependency
inventory, not a universal claim about every internal code path or device
packet. Google Material, Gson, annotations and Guava's listenable-future utility
are local libraries and do not constitute Google Play Services or Google OCR.

## Prohibited production integrations

| Item | Phase 1 policy / inspection target |
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

- `INTERNET` is allowed only because the optional domestic identity query needs
  it. `ACCESS_NETWORK_STATE` remains blocked because the app does not need a
  network-state API; a failed request is handled as an explicit offline status.
- The native Manifest does not add arbitrary network endpoints or cleartext
  traffic. The client accepts only a fixed HTTPS origin.
  An XML remove marker is not a granted permission and is not sufficient proof
  of the final merge result.
- Expo updates is disabled. Any generated `CHECK_ON_LAUNCH` metadata must be
  interpreted together with the disabled flag; no update URL is configured.
- The release merged Manifest and APK's decoded Manifest must both be checked.
  Attribute/permission names cannot be inferred by searching raw compressed APK bytes.
- Check resolved release npm/Gradle packages for prohibited SDKs; save the
  resolved inventory, not only direct `package.json` dependencies.
- Install the actual release on ARM64 Android. In airplane mode, verify local
  barcode/OCR/manual archive behavior. With consent and an authorized test
  deployment, separately record the fixed HTTPS host, request purpose and
  response. Record model initialization, OCR timing, evidence and observed
  network behavior.

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

## Verification status

Source configuration, declared dependency review and actual local release
dependency-graph resolution are complete for this document's scope. Artifact
Manifest checks, model bundling verification, GitHub Actions compilation,
Android execution and traffic observations retain their individually recorded
statuses in the Phase 3 acceptance report. The dependency-tree execution does
not assert a successful device barcode/OCR run or a packet-capture result.

Future Paddle Lite / Paddle-native runtime evaluation is recorded as an
optional optimization. It does not block the fixed ONNX Runtime baseline.

## Signing and upgrade boundary

Release signing and same-signature `adb install -r` data-preservation checks are
defined in [AndroidSigningAndUpgradePolicy.md](AndroidSigningAndUpgradePolicy.md).
The policy does not treat an ephemeral CI certificate as a production signing key.
