# Compatibility matrix

"Exercised" means the exact combination below was installed fresh from the packed `.tgz` and run at the stated evidence level.
Anything not listed is untested; widen only after testing.

| Component | Version exercised | Notes |
| --- | --- | --- |
| SDK | 0.1.0 | private, unsigned, reproducible tarball |
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
| Node | 24.14 | build tooling only; image-size 2.0.4 requires Node >=18 |
| PostCSS / image-size | 8.5.32 / 2.0.4 | deliberate build-tool overrides; parser/API regressions and standalone Metro export acceptance required; no native or SDK runtime dependency upgrade |
| Xcode / iOS Simulator | 26.2 (17C52) / iPhone 17 Pro, iOS 26.2 | Release, arm64 simulator |
| Android | API 36 arm64 emulator (Google Play image), Gradle wrapper 8.14.3, JDK 17 | Release APK, arm64-v8a only |

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
