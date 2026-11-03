# Expo consumer of the packed SDK

A small Expo 54 app that uses `@muslim-ummah/offline-navigation` the way an outside app would: installed from the packed `.tgz` files (`file:./sdk.tgz`,
`file:./ios-precision.tgz`), with its own React and React Native and nothing from the SDK's source repository. It is **example code**: copy from it, do not ship it as it is.
The step-by-step path is `docs/QUICK_START.md` in the delivery.

```bash
npm ci --ignore-scripts --no-audit --no-fund   # installs exactly the tested versions from package-lock.json
npm run typecheck && npm test                  # tsc, then the Jest flows (journeys, venue switch, pack recovery, language, theme)
npm run export:android && npm run export:ios   # production Metro bundles
npx expo prebuild && npx expo run:ios --configuration Release   # or run:android --variant release; development/release builds, not Expo Go
```

(In the SDK repository this folder has no `sdk.tgz`; `npm run test:sdk-consumer -- <fresh directory outside the repo>` packs the SDK, copies the app next to the tarballs and runs the same checks.)

## What the SDK does for this app

- **One Expo config plugin** in `app.json`: `["@muslim-ummah/offline-navigation", { "locationPermissionText": "…", "languages": ["en", "ur"] }]`. It applies foreground location,
  MapLibre, the iOS language declarations, and the two Android settings the journey needs (MainActivity keeps running through font/display-size changes; React Native re-measures text
  on a font-scale change). The Android font fix is pinned to React Native 0.81.5 and stops `expo prebuild` on any other version rather than patch something untested. Do not also list
  `expo-location` or the MapLibre plugin.
- **One Metro line** in `metro.config.js`: `withOfflineNavigation(getDefaultConfig(__dirname))` registers the `pmtiles` and `packfile` asset types.
- **iOS precision** arrives as the `@muslim-ummah/ios-location-precision` package (autolinked); there is no `modules/` or `plugins/` folder to copy.

## What the host (this app) owns

The venue packs (`bundledPackTable.ts`: pinned manifest digests and Metro asset files; built with `tools/venue-pack/venue-pack.cjs`), place names (from the pack), the basemap file (each pack carries
its PMTiles archive, copied into app-private storage and trusted only while its bytes hash to the pinned manifest), the location service (`simulatedLocation.ts` for the demo,
`expoLocation.ts` for the device), language and theme (`copy/`), safe areas and system bars. The ready-made `NavigationScreen` owns the journey and the SDK's
`@muslim-ummah/offline-navigation/maplibre` adapter owns the map.

Sample data: the Karachi pack (the owner's, for acceptance testing; redistribution rights are an owner decision) and `synthetic-demo-venue` (invented). Replace both with your own pack
(`docs/QUICK_START.md` step 4).

Not proven by this folder's checks: real GPS, physical devices, whole-device airplane mode. Jest replaces the native map and file system with recorders; native evidence is in the compatibility matrix.
