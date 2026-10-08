# Mainland production dependency audit

Scope: Hukang China Phase 0 / Phase 1, Android arm64-v8a release, minSdk 26.
Audit date: 2026-10-08 (Asia/Shanghai).

**Configured production `FOREIGN_NETWORK_SERVICE` count: 0.** This counts active
services in the app's runtime path, not foreign-origin offline libraries or
build repositories. Final APK Manifest and device traffic checks are separate
acceptance gates; source configuration alone does not prove device behavior.

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

| Component | Version / location | Category | Phase 1 behavior |
| --- | --- | --- | --- |
| Hukang UI, use cases, domain and Kotlin adapter | `src/`, `modules/hukang-vision/` | `LOCAL` | Local image preparation and raw OCR display |
| PaddlePaddle detection model | PP-OCRv5_mobile_det_onnx | `LOCAL` | APK-bundled domestic model; no runtime download |
| PaddlePaddle recognition model and dictionary | PP-OCRv5_mobile_rec_onnx + paired config | `LOCAL` | APK-bundled domestic model and exact dictionary |
| Reviewed PaddleOCR Android engine source | v3.7.0 baseline | `LOCAL` | Local inference; no model API endpoint |
| ONNX Runtime Android | 1.21.1 | `FOREIGN_OFFLINE_LIBRARY` | CPU inference only; no upload, downloader, telemetry or Play Services dependency in application path |
| OpenCV Android | 4.5.3.0 | `FOREIGN_OFFLINE_LIBRARY` | Bundled native image operations; no cloud recognition |
| AndroidX ExifInterface | 1.4.1 | `FOREIGN_OFFLINE_LIBRARY` | Read EXIF metadata locally; not Google Play Services |
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
| `ChinaFoodRepository` / `MedicineRepository` | TypeScript contracts only | `LOCAL` | No provider, HTTP client, seed catalog or cloud storage implementation |
| Future `HukangChinaFoodService` | Interface only | — | Not a configured dependency; mainland hosting and data rights need separate approval before implementation |

There is **no active `CHINA_SERVICE` in Phase 1**. Local records are not uploaded
to a future central database. SQLite food storage and ZXing scanning are later
phase work; neither is claimed as implemented in this inventory.

The actual graph contains generic networking-capable libraries, including
OkHttp and image-loading adapters. Their capability is distinct from a
configured production service; this APK must not be described as containing
no HTTP-capable code. App-owned Phase 1 code uses local image/file resources,
and the release app's network permission is removed as an additional
operating-system boundary. Neither a dependency name nor successful Gradle
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

- `app.json.android.blockedPermissions` removes `INTERNET` and
  `ACCESS_NETWORK_STATE`, plus permissions not used by this phase.
- Native app Manifest uses `tools:node="remove"` for blocked network permissions.
  An XML remove marker is not a granted permission and is not sufficient proof
  of the final merge result.
- Expo updates is disabled. Any generated `CHECK_ON_LAUNCH` metadata must be
  interpreted together with the disabled flag; no update URL is configured.
- The release merged Manifest and APK's decoded Manifest must both be checked.
  Attribute/permission names cannot be inferred by searching raw compressed APK bytes.
- Check resolved release npm/Gradle packages for prohibited SDKs; save the
  resolved inventory, not only direct `package.json` dependencies.
- Install the actual release on ARM64 Android, cold-start in airplane mode,
  select an available local image and recognize. Record model initialization,
  OCR timing, evidence and observed network behavior.

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
statuses in the Phase 1 acceptance report. The dependency-tree execution does
not assert a successful device OCR run or a packet-capture result.

Future Paddle Lite / Paddle-native runtime evaluation is recorded as an
optional optimization. It does not block the fixed ONNX Runtime baseline.
