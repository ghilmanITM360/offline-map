# Compatibility matrix

"Exercised" means the exact combination below was installed fresh from the packed `.tgz` and run at the stated evidence level.
Anything not listed is untested; widen only after testing.

| Component | Version exercised | Notes |
| --- | --- | --- |
| SDK | 0.1.0 | private, unsigned, reproducible tarball (`npm run pack:sdk`) |
| `@muslim-ummah/ios-location-precision` | 0.1.0 | reads iOS accuracy authorization; Expo >= 54 module (needs `ExpoModulesCore`); reproducible tarball |
| Expo config plugin (`@muslim-ummah/offline-navigation`) | 0.1.0 | Expo SDK 54: `expo prebuild` for Android and iOS generated and inspected; Android font-layout part pinned to RN 0.81.5 and refuses any other version |
| Venue pack tool (`venue-pack.cjs`) | 0.1.0 | plain Node >= 18 (exercised on Node 24.14); bundled from the repository's pack compiler |
| React | 19.1.0 | single copy enforced by the consumer driver |
| React Native | 0.81.5 (New Architecture) | Hermes |
| Expo | 54.0.37 | development/release builds; not Expo Go |
| `@maplibre/maplibre-react-native` | 11.5.0 | optional peer, `/maplibre` only |
| `expo-location` | 19.0.8 | reference adapter; no iOS accuracy-authorization API; ends a watch on the first Core Location error (the adapter restarts it) |
| `expo-file-system` | 19.0.24 | pack adapter; object API (`File`, `Directory`, `FileHandle`); cannot read packaged assets in place on iOS, no fsync, no atomic file replace |
| `expo-asset` / `expo-file-system` | 12.0.13 / 19.0.24 | basemap installation |
| `react-native-safe-area-context` / `expo-status-bar` | 5.6.2 / 3.0.9 | insets and system bars |
| `expo-system-ui` / `expo-crypto` | 6.0.9 / 15.0.9 | Android appearance and root background; platform SHA-256 for pack verification (both optional for a host that does not need them) |
| TypeScript | 5.9.3 | `.d.ts` consumed with `strict` |
| Jest / jest-expo / RNTL | 29.7.0 / 54.0.18 / 14.0.1 | `jest-expo/android` preset for the consumer |
| Node | 24.14 | build tooling only; Metro 0.83.8 requires Node >=20.19.4 |
| PostCSS / Metro family | 8.5.32 / 0.83.8 | deliberate build-tool overrides; parser/API regressions and standalone Metro export acceptance required; no native or SDK runtime dependency upgrade |
| Xcode / iOS Simulator | 26.2 (17C52) / iPhone 17 Pro, iOS 26.2 | Release, arm64 simulator |
| Android | API 36 arm64 emulator (Google Play image), Gradle wrapper 8.14.3, JDK 17 | Release APK, arm64-v8a only |

## Declared range versus what was tested

| Dependency | Declared (peer range) | Tested | Notes |
| --- | --- | --- | --- |
| `react` | `>=19.1.0` | 19.1.0 only | |
| `react-native` | `>=0.81.0` | 0.81.5 only | the Expo plugin's Android font-layout fix is **exactly 0.81.5** and stops the build on any other version (`androidFontScaleFix: false` opts out); other 0.81.x and later are untested |
| `@maplibre/maplibre-react-native` | `>=11.5.0 <12` | 11.5.0 only | optional |
| Expo SDK | not a peer (plugin and the iOS module need Expo) | 54.0.37 only | |
| Bare React Native (no Expo) | supported in principle (headless, `/ui`, `/maplibre`) | **not validated**: no bare project has been built; the manual native steps in [INTEGRATION_GUIDES.md](INTEGRATION_GUIDES.md) §3 are written out, not executed | |

Widen a range only after running the delivered example against the new version.

## Evidence level per capability

| Capability | Jest/Node | Metro bundle | iOS simulator | Android emulator | Physical device |
| --- | --- | --- | --- | --- | --- |
| Offline routing, steps, progress, reroute, arrival | yes | yes | yes (simulated GPS) | yes (simulated GPS + emulator GPS) | **no** |
| Manual Guide / ready-made screen | yes | yes | yes | yes | **no** |
| Offline MapLibre rendering of local PMTiles | mocked | n/a | yes | yes (needs `-gpu host`) | **no** |
| Device location adapter | mocked | yes | yes (permission, fix, 25-fix simulated walk to arrival through real expo-location callbacks) | yes (permission, deny, fix, walk, arrival) | **no** |
| iOS continuous location updates | restart logic tested | n/a | **yes, with the adapter's restart** (expo-location ends a watch on the first transient `kCLErrorLocationUnknown`; `docs/sdk/C3_IOS_CONTINUOUS_LOCATION.md`) | n/a | **no** |
| Pack store on the platform filesystem (copy, verify, replace, rename, rollback, recovery, pins) | Node + test double, kill sweeps | n/a | **yes** (self-test 10/10) | **yes** (self-test 10/10) | **no** |
| Bundled Karachi pack served to the map and router | yes | yes | yes | yes | **no** |
| RTL (Urdu locale) | yes | n/a | yes | yes | **no** |
| Font scaling | structure + large-text layout | n/a | **AX5: directory scrolls, Manual Guide / Live controls pinned and reachable; live change keeps the journey** | **scale 2.0 from a cold start**; a live change recreates the activity (restart the app) | **no** |
| System / Light / Dark, dark basemap | yes (palette contrast, in-place restyle) | n/a | **yes** (System follows the device, forced Light/Dark, mid-route change keeps route, step and camera) | **yes** (forced Dark keeps the system's light navigation bar) | **no** |
| Camera browsing while Live | yes | n/a | **yes** | **yes** (emulator GPS) | **no** |
| Pack verification speed | Node | n/a | **warm start 1,460 → ~200 ms; corruption repaired** | **919 → 84 ms (benchmark)** | **no** |
| VoiceOver / TalkBack | structure only | n/a | **no** | **no** | **no** |
| Whole-device airplane mode | n/a | n/a | **no** | **no** | **no** |
| Real GPS walking | n/a | n/a | **no** | **no** | **no** |

Current standalone production Metro counts and byte sizes are recorded in final raw export logs and the release handoff; older C5.3 values (759/761 modules) are historical. Every current source must resolve inside the delivered consumer with one React/RN/MapLibre and all pinned pack assets exported. Native rows above describe historical source/package combinations, not a newly rebuilt final SDK native binary. Exact APK A/B and earlier iOS identities are in [SECURITY_AND_VALIDATION_REPORT.md](SECURITY_AND_VALIDATION_REPORT.md).
