# Release and Security

Secrets, signing, permissions and dependency exceptions. What the app stores and sends, retention and clearing: [`DATA_PRIVACY_RETENTION.md`](DATA_PRIVACY_RETENTION.md). Privacy policy, terms and support links are owner-provided facts (#47), never agent-authored; do not draft placeholder legal text and ship it as final. This file asserts no keystore, Play enrollment, CI secret or deployed proxy exists: `AGENTS.md` forbids claiming such state without checking it in that exact environment.

## Secrets boundary

Mobile code may hold only proxy base-URL configuration. Google Routes web-service credentials, proxy signing secrets and privileged bearer tokens must never be in mobile code or `EXPO_PUBLIC_*` variables. The map renders offline (MapLibre, bundled basemap), so the app holds no Google Maps SDK key at all. Never commit `.env`, keystores, `android/keystore.properties` or secret-bearing logs (all gitignored; checked in `.gitignore`). `android/app/debug.keystore` is the standard public React Native debug key and is intentionally tracked.

## Google Maps key (removed)

The Google Maps SDK and `react-native-maps` are gone (#140): no `com.google.android.geo.API_KEY` manifest entry, no `manifestPlaceholders`, no `GMSApiKey`, no `EXPO_PUBLIC_GOOGLE_MAPS_*` variables (`scripts/test-map-config.ts` fails the build if one reappears). Play Services *location* (fused location via `expo-location`) is separate and stays; it does not need the network.

**Owner action (optional hygiene):** the Maps key exposed historically (#49) is no longer used by the app and can be deleted in Google Cloud Console; nothing in this repo depends on it. This repo cannot verify its Console state.

## Release signing

`android/app/build.gradle` resolves release signing from `android/keystore.properties` (gitignored; template `keystore.properties.example`) or `ANDROID_RELEASE_STORE_FILE` / `_STORE_PASSWORD` / `_KEY_ALIAS` / `_KEY_PASSWORD`. With neither present, release-artifact tasks (`assembleRelease`, `bundleRelease`, install tasks) **refuse to run** instead of silently signing with the debug key; the only opt-out is `-PallowInsecureReleaseSigning=true` (or `ALLOW_INSECURE_RELEASE_SIGNING=true`), which produces an APK signed with the public debug key: testing only, never distributable. The inline comments in `build.gradle` that still say release builds "fall back to the debug keystore" predate that guard; the task guard above is the behavior.

To create a production keystore yourself (never commit it; choose your own passwords), keep it under `android/app/` or another gitignored path:

```bash
keytool -genkeypair -v -keystore release.keystore -alias karachi-ijtema-release \
  -keyalg RSA -keysize 2048 -validity 10000
```

Generating and custodying the real keystore and enrolling in Play App Signing is an owner action (#48); nothing here verifies that either exists.

## R8 / minification

`android/gradle.properties` sets `android.enableMinifyInReleaseBuilds=true` and `android.enableShrinkResourcesInReleaseBuilds=true` (#80). Re-verify if touching `android/app/build.gradle` or upgrading Expo/React Native.

## Android permissions

Ground truth is the checked-in `android/app/src/main/AndroidManifest.xml`, **not** `app.json`: this repo commits the native `android/` project instead of regenerating it, so the two can silently diverge if only one is edited (`scripts/test-legacy-and-permissions.ts` guards the manifest).

Current manifest: `INTERNET` and `ACCESS_NETWORK_STATE` (explicit; the app reads the OS network state and the optional proxy leg is the only outbound path), `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` (via `expo-location`; foreground only). `VIBRATE` was removed: it had zero traceable source and zero code usage (no `Vibration`/`Haptics` calls in `src/`), and the test fails if it returns. `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` are stripped with `tools:node="remove"` (#81): deleting the line alone is not enough, because `expo-file-system`'s own manifest would re-add them through autolinking, and the app never needs them (the bundled basemap copy uses app-scoped storage).

Location is optional and asked in context; precise and approximate grants are distinguished and approximate never drives live navigation (`PRODUCT_AND_USER_FLOWS.md`). Backup exclusion of the app database is described in `DATA_PRIVACY_RETENTION.md`.

## Google Routes proxy contract

Mobile never holds a Routes API credential, only an optional proxy base URL. The proxy (`backend/walking-proxy/`) is staging preparation and is **not deployed** (#123, owner billing/approval); the app therefore runs its bundled OSM / direct-guide legs everywhere today (`NAVIGATION_AND_ROUTING.md`). Treat the endpoint contract (`GoogleRoutesProxyContract.ts`), request validation and error mapping as a real external API contract: private IAM, never `--allow-unauthenticated`, no privileged token in the APK, and a trusted ingress design are still open decisions recorded in `backend/walking-proxy/README.md`.

## Dependency security

18 production-install advisories (9 high, 9 moderate) are accepted as a documented release exception: all trace to `image-size`, `postcss` and `uuid` inside Metro / `@expo/config-plugins` build tooling, never shipped in the compiled app, independently re-verified against source (#62, closed). Review date 2026-12-31, or sooner if an Expo SDK migration is scheduled. Current issue state: `PROJECT_STATUS.md`.
