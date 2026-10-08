# Mainland production dependency audit

Scope: Hukang China Phase 0 / Phase 1, Android arm64-v8a release, minSdk 26.
Audit date: 2026-10-07 (Asia/Shanghai).

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

Versions below reflect the project's declarations; npm's resolved patch
versions are locked in `package-lock.json`, and Gradle resolution must be
checked against the release dependency report.

| Component | Version / location | Category | Phase 1 behavior |
| --- | --- | --- | --- |
| Hukang UI, use cases, domain and Kotlin adapter | `src/`, `modules/hukang-vision/` | `LOCAL` | Local image preparation and raw OCR display |
| PaddlePaddle detection model | PP-OCRv5_mobile_det_onnx | `LOCAL` | APK-bundled domestic model; no runtime download |
| PaddlePaddle recognition model and dictionary | PP-OCRv5_mobile_rec_onnx + paired config | `LOCAL` | APK-bundled domestic model and exact dictionary |
| Reviewed PaddleOCR Android engine source | v3.7.0 baseline | `LOCAL` | Local inference; no model API endpoint |
| ONNX Runtime Android | 1.21.1 | `FOREIGN_OFFLINE_LIBRARY` | CPU inference only; no upload, downloader, telemetry or Play Services dependency in application path |
| OpenCV Android | 4.5.3.0 | `FOREIGN_OFFLINE_LIBRARY` | Bundled native image operations; no cloud recognition |
| AndroidX ExifInterface | 1.3.7 | `FOREIGN_OFFLINE_LIBRARY` | Read EXIF metadata locally; not Google Play Services |
| React / React Native / Hermes | 19.2.3 / 0.86.3 / RN-managed | `FOREIGN_OFFLINE_LIBRARY` | Bundled UI and JavaScript execution |
| Expo core and module infrastructure | 57.0.27 / SDK-managed modules | `FOREIGN_OFFLINE_LIBRARY` | Custom APK; Expo Go and Expo-hosted JavaScript not needed |
| Expo Router / linking | SDK 57 modules | `FOREIGN_OFFLINE_LIBRARY` | Local route navigation; no remote route/provider configuration |
| Expo image picker | SDK 57 module | `FOREIGN_OFFLINE_LIBRARY` | User selects a photo through Android; app imports a local copy |
| Expo file system | SDK 57 module | `FOREIGN_OFFLINE_LIBRARY` | Local evidence files only; its generic download APIs are not invoked |
| Expo sharing | SDK 57 module | `FOREIGN_OFFLINE_LIBRARY` | User-initiated local evidence export through OS share sheet; no automatic upload |
| Splash/status bar, safe-area and screens | SDK-compatible pinned lockfile | `FOREIGN_OFFLINE_LIBRARY` | Local rendering and lifecycle |
| `ChinaFoodRepository` / `MedicineRepository` | TypeScript contracts only | `LOCAL` | No provider, HTTP client, seed catalog or cloud storage implementation |
| Future `HukangChinaFoodService` | Interface only | — | Not a configured dependency; mainland hosting and data rights need separate approval before implementation |

There is **no active `CHINA_SERVICE` in Phase 1**. Local records are not uploaded
to a future central database. SQLite food storage and ZXing scanning are later
phase work; neither is claimed as implemented in this inventory.

Libraries may contain generic networking code transitively (for example React
Native's standard HTTP infrastructure). This is distinct from a configured
production service. App-owned code must not invoke it, and the release app's
network permission is removed as an additional operating-system boundary.

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

Source configuration and declared dependency review are complete for this
document's scope. Release dependency resolution, artifact Manifest check,
model bundling verification, real-device execution and traffic observation
must be reported with their actual status in the Phase 1 acceptance report.
No device test is asserted by this audit document.

Future Paddle Lite / Paddle-native runtime evaluation is recorded as an
optional optimization. It does not block the fixed ONNX Runtime baseline.
