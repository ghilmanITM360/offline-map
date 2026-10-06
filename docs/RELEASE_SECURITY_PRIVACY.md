# Release, Security, and Privacy

## Secrets boundary

Mobile code may hold only proxy base-URL configuration. Google Routes web-service credentials, proxy signing secrets, and privileged bearer tokens must never be in mobile code or `EXPO_PUBLIC_*` variables. The map renders offline (MapLibre, bundled basemap), so the app holds no Google Maps SDK key at all. Never commit `.env`, keystores, `android/keystore.properties`, or secret-bearing logs (all gitignored — verified current).

## Google Maps key (removed)

The Google Maps SDK and `react-native-maps` are gone (#140): no `com.google.android.geo.API_KEY` manifest entry, no `manifestPlaceholders`, no `GMSApiKey`, no `EXPO_PUBLIC_GOOGLE_MAPS_*` variables. Play Services *location* (fused location via `expo-location`) is separate and stays; it does not need the network.

**Owner action (optional hygiene):** the Maps key that was exposed historically (#49) is no longer used by the app. It can be deleted in Google Cloud Console; nothing in this repo depends on it. This repo cannot verify its Console state.

## Release signing

`android/app/build.gradle` resolves release signing from `android/keystore.properties` (gitignored) or `ANDROID_RELEASE_*` env vars, and hard-fails `assembleRelease` if neither is present — it no longer silently falls back to the debug keystore. Local-only testing can opt out via `-PallowInsecureReleaseSigning=true`. Actually generating and provisioning a real release keystore / enrolling in Play App Signing is an owner action — #48.

## R8 / minification

Release minify and resource shrinking are enabled (#80, merged) — verify this hasn't regressed if touching `android/app/build.gradle` or upgrading Expo/RN.

## Android permissions

`INTERNET` and `ACCESS_NETWORK_STATE` are explicit; `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` are autolinked via `expo-location`. `VIBRATE` was removed — it had zero traceable source and zero code usage (no Vibration/Haptics calls in `src/`). `READ_EXTERNAL_STORAGE`/`WRITE_EXTERNAL_STORAGE` are stripped via `tools:node="remove"` (#81, merged) — deleting the line alone isn't enough, since `expo-file-system`'s own manifest would silently re-add them via autolinking; the app never needed them; the bundled basemap copy uses app-scoped storage.

**Location is optional and asked in context.** Location (foreground only, `expo-location`; no background location) is requested only when the user chooses something that benefits from it: live guidance, "use my location", or recenter. It is not asked at launch or in onboarding, and a user who declines is not asked again unprompted. Precise and approximate grants are distinguished (`docs/PRODUCT_AND_USER_FLOWS.md`); approximate never drives live navigation.

**Ground truth:** the checked-in `android/app/src/main/AndroidManifest.xml` is the source of truth for permissions, not `app.json` — this repo commits the native `android/` project rather than regenerating it fresh each time, so the two can silently diverge if only one is edited.

## Backup policy

`dataExtractionRules`/`fullBackupContent` exclude the entire AsyncStorage (`RKStorage`) database from Android auto-backup/restore, since it shares storage with settings/favorites and includes last-known-location data that shouldn't survive a device restore silently (#58, merged; EMULATOR VERIFIED on both backup and restore paths: Pixel 7 Pro emulator, local backup transport; physical-device backup/restore not run).

## Google Routes proxy contract

Mobile never holds a Routes API credential — only an optional proxy base URL. The proxy itself is not yet deployed (blocked on backend platform approval), so the app currently runs its OSM/direct-guide fallback legs in production (see `docs/OFFLINE_NAVIGATION_AND_ROUTING.md`). When resuming proxy work, treat the endpoint contract, request validation, and error-mapping behavior as a real external API contract to design carefully, not a stub.

## Dependency security

18 production-install advisories (9 high, 9 moderate) are accepted as a documented release exception — all trace to `image-size`/`postcss`/`uuid` inside Metro/`@expo/config-plugins` build tooling, never shipped in the compiled app, independently re-verified against current source (#62, closed). Review date 2026-12-31, or sooner if an Expo SDK migration is independently scheduled. See `docs/PROJECT_STATUS.md` for current issue state.

## Privacy / legal content

Privacy policy, terms, and support links are owner-provided facts, not agent-authored — see `docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md` (#47). Do not draft placeholder legal text and ship it as if final.
