# Installed baseline and cross-platform plan

Inspected 2026-10-12, canonical `6996b7e`. This is a source/configuration inventory, not a fresh Android/iOS build. Lockfile versions differ from requested ranges; use lockfile for actual JS resolution.

| Item | Actual evidence | Constraint / evidence boundary |
| --- | --- | --- |
| React | package-lock.json 19.1.0 | Single peer and installation per app binary. |
| React Native | lock 0.81.5 | New Architecture consumer required. |
| Expo | requested ~54.0.34, lock 54.0.37 | Preserve existing Expo modules/tooling. |
| TypeScript | requested ~5.9.2, lock 5.9.3 | Shared declaration compatibility tests. |
| MapLibre RN | pinned/locked 11.5.0 | Installed exports use Map/Camera; do not copy old MapView examples. |
| MapLibre Android | installed package android/gradle.properties default 13.6.1, opengl | Not a fresh resolved Gradle graph; check each consumer graph before native acceptance. |
| MapLibre iOS | installed podspec default 6.31.0 via Swift Package reference | Not installed/verified. Existing Podfile.lock predates MapLibre and includes obsolete react-native-maps. |
| AGP / Kotlin | RN installed catalog 8.11.0 / 2.1.20 | Buildscript unversioned classpath resolves via RN/Expo; verify effective graph in native spike. MapLibre own fallback Kotlin 2.0.21 is not host effective version. |
| Gradle | android wrapper 8.14.3 | Preserve custom Reanimated/worklets copy/ELF safety workaround in android/build.gradle. |
| Android API | app uses root properties; RN catalog min24, compile/target36 | Expo root plugin sets catalog-derived defaults; actual configured build log needed before consumer certification. |
| Android architecture | gradle.properties newArchEnabled=true | Hermes/native autolinking, one MapLibre framework per app. |
| iOS deployment | Podfile fallback/project15.1; RN helper minimum15.1 | Does not prove CocoaPods/SPM graph builds. |
| Xcode / CocoaPods | local xcodebuild26.2 (17C52) / pod1.16.2 | RN helper requires Xcode >=16.1; actual device/simulator compatibility unverified. |

## Dependency ownership

Proposed SDK `peerDependencies`: React19.1.0, RN0.81.5, MapLibreRN11.5.0 for RN presentation entry; pin initially, widen only after compatibility matrix tests. Native presentation peers also include the current compatible gesture-handler, Reanimated/worklets, safe-area-context, SVG and sheet dependencies used by extracted UI. Expo location/filesystem/asset/speech and AsyncStorage belong to the default adapter's host-installed peer requirements. Do not export them from domain. Pure helpers may be ordinary dependencies only if they do not create native singleton duplication; Zustand remains private implementation.

Each host lists direct native deps once, one root npm lock/workspace install resolves them. SDK tarball excludes node_modules/framework binaries, native apps, data packs, secrets and recovery. Do not bundle React/RN into emitted JS. Each app has its own Gradle/Pods target but resolves shared JS packages and autolinks each native module once per target. Native frameworks are not manually embedded by both SDK and app. Check npm ls, Metro resolved realpaths, RN/Expo autolink output, Gradle dependencyInsight and Pod/SPM graph. Peer declarations alone do not prove deduplication.

Metro currently uses expo/metro-config and registers pmtiles assets. Start with Expo54 workspace defaults; preserve asset extension. Evaluate `experiments.autolinkingModuleResolution` in a bounded B5 fixture before changing configuration. No custom duplicate resolver aliases unless demonstrated necessary. Existing scripts/Jest/TS/node-import tests need explicit package path support; do not move root native projects until a separate path audit covers entrypoint, codegen, signing references, Gradle projectRoot, Pod app_path, assets and build scripts.

## iOS parity work

1. Regenerate native dependencies from current lock in a dedicated approved parity milestone. Stale ignored Pods were preserved outside root; tracked Podfile.lock is not proof of current MapLibre support. Verify podspec-added SPM MapLibre6.31.0, resource copies, framework linkage and simulator/device architectures.
2. Replace Android-only precision mapping with an adapter that can read iOS full/reduced authorization independently of permission scope and fix accuracy. Current LocationAccessService returns none on iOS: Live Navigation fails closed. Expo19 scope cannot prove precision; propose bounded native capability spike, no silent assumption or framework upgrade. If unavailable, retain manual guide and honest capability blocker.
3. Prove local PMTiles file URL support in the installed iOS engine; install in Application Support/private durable storage with backup/privacy policy and atomic rename. Bundle asset resolution, escaping and file availability need tests. Android path `pmtiles://file://...` is not sufficient iOS evidence.
4. Host-owned reviewed permission descriptions, Settings return and foreground service-state checks; test Allow Once, denied/permanent denial, reduced/full accuracy, disabled services and revoked permission. Initial foreground-only behavior; background entitlement is not implied.
5. Validate safe-area/keyboard/gesture sheets, RTL mixed numerals, 200% font, VoiceOver focus via installed RN accessibility APIs, reduced motion and map geometry direction. Native speech output must be observed, not inferred from mocks.
6. Build and interact with actual iOS consumer before declaring parity; emulator/simulator results do not certify physical GPS/arrival or Gates18/19.

## Official references and version discipline

Installed lock, podspec and Gradle defaults are version-specific authorities; current official guides explain architecture, not a guarantee for every 11.5.0 combination. Consult [MapLibre v11 migration](https://maplibre.org/maplibre-react-native/docs/setup/migrations/v11/) for New Architecture and renamed APIs; [Expo54 release](https://expo.dev/changelog/sdk-54), [Expo monorepos](https://docs.expo.dev/guides/monorepos/) and [autolinking](https://docs.expo.dev/modules/autolinking/) for workspace resolution; [RN0.81 release](https://reactnative.dev/blog/2025/08/12/react-native-0.81) and [Expo54 Location](https://docs.expo.dev/versions/v54.0.0/sdk/location/) for platform baseline. [MapLibre Android PMTiles](https://github.com/maplibre/maplibre-native/blob/main/platform/android/docs/data/PMTiles.md) documents fully specified URLs; iOS local archive behavior remains a spike. No remote tile URL from tutorial examples belongs in the offline SDK style.
