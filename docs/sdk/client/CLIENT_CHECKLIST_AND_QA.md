# Client integration checklist and independent QA

## A. Integration checklist (tick before you ship)

**Install**
- [ ] Tarball installed; `npm ls react react-native` shows one version each; no Metro aliases/resolvers for the SDK.
- [ ] `@maplibre/maplibre-react-native` 11.5.0 installed once; config plugin listed; Release build opens a map offline.
- [ ] `pmtiles` registered as a Metro asset extension; archive size and SHA-256 recorded in your own manifest.

**Data**
- [ ] A surveyed `VenueDataSource` (not `demoVenue.ts`); node coordinates inside the archive's bounds; place names reviewed.
- [ ] Attribution "© OpenStreetMap contributors" visible on the map screen (the adapter keeps it).

**Language and theme**
- [ ] Every language you ship is in `copy` (type-checked), reviewed by a native speaker; `ur` in iOS `CFBundleLocalizations`.
- [ ] `isRTL` passed to screen and theme; chevrons and alignment checked in RTL; light and dark checked.

**Location and privacy**
- [ ] Location adapter reviewed against [INTEGRATION_GUIDES.md](INTEGRATION_GUIDES.md) §6; prompt only from the explicit Live request.
- [ ] iOS precision reader supplied (or Live is knowingly Manual-only on iOS).
- [ ] Foreground only: no Always strings, no background modes, no background location permission.
- [ ] Android manifest reviewed (`blockedPermissions`; decide about `INTERNET` for an app with no network features).

**Lifecycle**
- [ ] Controller created once, `dispose()`d by the host; `lifecycle` wired to `AppState`.
- [ ] Safe-area insets used; system-bar icons visible; last controls clear the Android navigation bar.

**Acceptance still required from you**
- [ ] Physical iOS and Android devices; real walking with real GPS inside the venue (inside and at the edges).
- [ ] Whole-device airplane mode with a cold start (no network at any point).
- [ ] VoiceOver and TalkBack passes; AX5 / font scale 2.0 on small screens.
- [ ] Venue field survey (graph accuracy, entrances, gates) — the SDK cannot certify your data.

## B. Independent QA instructions

Run from a clean checkout of branch `feat/muslim-ummah-offline-navigation-sdk` on a Mac with Node 24, Xcode 26.2, Android SDK 36, JDK 17.
Do not share a working tree with the implementer.

1. **Source gates:** `npm ci`, `npx tsc --noEmit -p .`, `npx eslint packages src/__tests__ examples scripts/sdk-package`, `npx jest` (expect 207
   suites / 2,096 tests), `npm run test:sdk-exports`, `npm run test:sdk-headless`, `npm test` (routing differential and golden parity;
   goldens must not be edited).
2. **Artifact:** `npm run test:sdk-package` (contents allowlist, byte-reproducible tarball, plain-Node runtime without React,
   declarations, shared peers). Compare the tarball SHA-256 with `CHECKSUMS.txt` in the delivery bundle.
3. **Independent install:** `npm run test:sdk-consumer -- <fresh dir outside the repo>` (fresh `npm install` of the `.tgz`, `tsc`,
   Jest flows, Android + iOS production bundles; it fails if a module comes from the repository or a second React/RN/MapLibre appears).
4. **iOS:** from that fresh consumer: `npx expo prebuild --platform ios --no-install`, `pod install`, Release simulator build (export real
   `PROJECT_ROOT`/`ENTRY_FILE` when under `/tmp`). Walk: directory → route → Manual Guide → explicit Live (device source with a
   simulator location) → arrival; switch `ur` and AX5; delete/corrupt the installed archive (`Documents/map/basemap-*.pmtiles`) and relaunch.
5. **Android:** `npx expo prebuild --platform android --no-install`, `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`,
   emulator **with `-gpu host`**; same walk; `adb emu geo fix <lng> <lat>` for device location; deny the permission once.
6. **Record** each result with its evidence level (see the matrix) and never relabel simulator evidence as device evidence.
7. **Negative controls:** point Metro at repository source and confirm the consumer driver fails; mutate a guard (e.g. accept a stale
   fix) and confirm a test fails.
