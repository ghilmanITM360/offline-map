# Location and Environment Diagnostics

## Controlled environment

- Source: `audit/codex-runtime-evidence` at `1599c324b7b5cfc1a0a92b4b1158382d4a7a2b81` before evidence-only docs.
- APK: debug-signed release-shaped `app-release.apk`, SHA-256 `82907c67633a11f73675e11fe5dafeda60af5bbce2ddd8c01a14d0175eb202b2`.
- Package: `com.aicrafted.karachiijtema`, version name `1.0.0`, version code `1`, target SDK 36.
- Emulator: `emulator-5554`, `sdk_gphone64_arm64`, Android 16/API 36.
- Display: physical 1080×2400, override 540×1200; physical density 420, override 210; font scale 1.0.
- Google Play services: 26.34.36.
- Wi-Fi: connected to `AndroidWifi`, address `10.0.2.16` during this audit.

## Permission and service state

- `cmd location is-location-enabled`: true.
- Secure `location_mode`: 3.
- Allowed providers: `+network,+gps`.
- Package dump: fine and coarse runtime permissions granted.
- AppOps reports coarse location in foreground mode; package dump independently confirms fine permission granted.
- GPS and fused providers reported enabled/allowed but `ProviderRequest[OFF]` after each failed attempt.

## Application behavior and source timing

`LocationAccessService.ts:121-167` calls Expo `getCurrentPositionAsync` at balanced accuracy. It applies a 15-second JavaScript timeout, then accepts only a device last-known fix no older than 30 seconds and no worse than 50 m. Otherwise it returns “Current location is unavailable. Choose start manually.”

The current recenter flow waited approximately 15 seconds, displayed that exact alert, and did not silently substitute the emulator’s stale last location.

## Controlled GPS attempt

1. Dismissed the pre-existing alert.
2. Tapped the map recenter control once.
3. Sent `geo fix 67.006339 24.963676`; emulator console returned `OK`.
4. Captured Android location-service state.
5. Sent `geo fix 67.006862 24.963718`; emulator console returned `OK`.
6. Waited through the application timeout and captured the result.

Observed chain:

| Stage | Evidence | Classification |
|---|---|---|
| Emulator console accepted command | Two `OK` responses | Observed, not proof of delivery |
| Android GPS/fused last location | Remained `24.860710,67.001108`; provider requests OFF | Delivery not observed |
| App-attributed provider registration | No new event for current run in `dumpsys location`; only historical 16:23 events | Not observed |
| Expo current-position result | App spinner persisted to timeout | Not observed |
| Application location state | “Location unavailable” alert | TRUSTED-BUILD EMULATOR VERIFIED failure path |
| Navigation ViewModel / rendered nav | Never reached | ENVIRONMENT BLOCKED |

The historical 16:23 location event in the dump predates installation of this audit APK and is not used as current-build proof.

## Diagnostic conclusion

The evidence stops between emulator-console acceptance and Android provider delivery/registration. Current data does not establish an application defect. Location permissions and Android master location state are healthy; the emulator/Play-services location path remains unhealthy or incomplete. The historical hypothesis about Google Location Accuracy consent remains a hypothesis because no direct consent-state proof was obtained.

No production settings or code were changed. No injected location harness was used.
