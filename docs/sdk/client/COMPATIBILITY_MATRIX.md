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
| `expo-location` | 19.0.8 | reference adapter; no iOS accuracy-authorization API |
| `expo-asset` / `expo-file-system` | 12.0.13 / 19.0.24 | basemap installation |
| `react-native-safe-area-context` / `expo-status-bar` | 5.6.2 / 3.0.9 | insets and system bars |
| TypeScript | 5.9.3 | `.d.ts` consumed with `strict` |
| Jest / jest-expo / RNTL | 29.7.0 / 54.0.18 / 14.0.1 | `jest-expo/android` preset for the consumer |
| Node | 24.14 | build tooling only |
| Xcode / iOS Simulator | 26.2 (17C52) / iPhone 17 Pro, iOS 26.2 | Release, arm64 simulator |
| Android | API 36 arm64 emulator (Google Play image), Gradle wrapper 8.14.3, JDK 17 | Release APK, arm64-v8a only |

## Evidence level per capability

| Capability | Jest/Node | Metro bundle | iOS simulator | Android emulator | Physical device |
| --- | --- | --- | --- | --- | --- |
| Offline routing, steps, progress, reroute, arrival | yes | yes | yes (simulated GPS) | yes (simulated GPS + emulator GPS) | **no** |
| Manual Guide / ready-made screen | yes | yes | yes | yes | **no** |
| Offline MapLibre rendering of local PMTiles | mocked | n/a | yes | yes (needs `-gpu host`) | **no** |
| Device location adapter | mocked | yes | first fix only (see below) | yes (permission, deny, fix, walk, arrival) | **no** |
| iOS continuous location updates | n/a | n/a | **not proven** (watcher delivered one callback) | n/a | **no** |
| RTL (Urdu locale) | yes | n/a | yes | yes | **no** |
| Font scaling | structure only | n/a | AX5 layout works, panel tall | scale 2.0 ok | **no** |
| VoiceOver / TalkBack | structure only | n/a | **no** | **no** | **no** |
| Whole-device airplane mode | n/a | n/a | **no** | **no** | **no** |
| Real GPS walking | n/a | n/a | **no** | **no** | **no** |

Bundle facts (consumer, production Hermes): Android 736 modules / 1.30 MB, iOS 738 modules / 1.30 MB; one React, one React Native,
one MapLibre; every module from the consumer's `node_modules`, none from this repository.
