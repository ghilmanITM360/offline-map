# Integration guides

The reference implementation of everything below is [`examples/expo-consumer`](../../../examples/expo-consumer): a small Expo 54 app
that installs the packed `.tgz`. Build and test it with `npm run test:sdk-consumer -- <fresh dir outside the repo>` from the
repository root (it packs the SDK, copies the example, installs, runs `tsc`, Jest and both production bundles).

## 1. Install

```bash
npm install ./muslim-ummah-offline-navigation-0.1.0.tgz
npm install @maplibre/maplibre-react-native@11.5.0   # only if you use the /maplibre entrypoint
```

Keep **one** `react` and **one** `react-native` in the app (the SDK declares them as peers). Do not add Metro aliases, resolvers or
`watchFolders` for the SDK: it is compiled CommonJS and needs none. `npm ls react react-native` must show a single version each.

## 2. Expo development build (Expo 54, RN 0.81.5)

MapLibre is a native module, so Expo Go cannot run it: use a development build or a release build.

`app.json`:

```json
{ "expo": {
  "userInterfaceStyle": "automatic",
  "ios": { "bundleIdentifier": "com.yourco.app", "infoPlist": { "CFBundleLocalizations": ["en", "ur"] } },
  "android": { "package": "com.yourco.app", "blockedPermissions": ["android.permission.READ_EXTERNAL_STORAGE","android.permission.WRITE_EXTERNAL_STORAGE","android.permission.SYSTEM_ALERT_WINDOW","android.permission.VIBRATE"] },
  "plugins": [
    "@maplibre/maplibre-react-native",
    ["expo-location", { "locationWhenInUsePermission": "<reviewed text>", "locationAlwaysPermission": false, "locationAlwaysAndWhenInUsePermission": false }]
  ]
} }
```

- `CFBundleLocalizations` must list every language you ship, **including `ur`**, or iOS keeps the app in English and
  `I18nManager.isRTL` stays false.
- The expo-location plugin otherwise adds "Always" usage strings; the SDK is foreground-only, so turn them off.
- `metro.config.js`: stock `expo/metro-config` plus `config.resolver.assetExts.push('pmtiles')` so the archive is bundled.
- `npx expo prebuild`, then `pod install` (iOS) and a Release build. Use real paths for the project root when building
  from a temp directory (`/tmp` vs `/private/tmp` made Metro fail the bundle phase).

## 3. Bare React Native

Same peers and the same `@maplibre/maplibre-react-native` 11.5.0 install (follow its README for autolinking on 0.81.5 with the New
Architecture). iOS: `pod install`, deployment target 15.1+. Android: `minSdk 24`, `compileSdk 36`. Add the permission
declarations by hand: Android `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` only; iOS `NSLocationWhenInUseUsageDescription`
only (no Always, no background modes).

## 4. The offline basemap

MapLibre Native opens `pmtiles://file://…` but not an app asset, so the host installs the archive into app-private storage:

1. Bundle `*.pmtiles` as an app asset (Metro `assetExts`).
2. On start, copy it to `Paths.document/map/` via a `.partial` file; accept it only when **size and SHA-256 equal your manifest**; a
   leftover partial is never trusted; a corrupt or missing file is replaced from the bundle (see `basemap.ts`/`basemapExpo.ts`).
3. Pass the resulting `file://` URI to `createMapLibreNavigationMap`. On failure pass `null`: the screen shows a plain canvas and
   says directions still work, and you can offer a retry.

The sample archive's identity (bytes `434589`, SHA-256 `d5e6883d55d55b0fa9e3230ab92585fb25a8949551528ef4d176192384a28cc0`, zoom
12–16, Karachi bbox) is recorded in `assets/offline-map/BASEMAP_PROVENANCE.json`. Source data © OpenStreetMap contributors (ODbL).
Never replace the local archive with remote or demo tiles.

## 5. Your venue

Implement `VenueDataSource`: `venueId`, `dataVersion`, `graph` (`nodeIds`, `getNode`, `edgesFrom` with metric lengths),
`placeIds`, `getPlace` (`{ id, kind, nodeIds }`). The controller routes only between places; names come from your `describePlace`.
The SDK ships no venue. `demoVenue.ts` in the example is **synthetic** and must not be mistaken for a surveyed place.

## 6. Location and permissions

Implement `NavigationLocationAdapter` (see [API_REFERENCE.md](API_REFERENCE.md)) or copy the reference
`examples/expo-consumer/expoLocation.ts`:

- Foreground only; the one prompt comes from `requestPermission()` inside the user's explicit Live request. Never auto-start Live
  after a denial.
- Android: precision from `permission.android.accuracy` (`fine`/`coarse`); approximate-only is refused as `approximate_only`.
- **iOS:** `expo-location` 19.0.8 cannot tell full from reduced accuracy, so without a native check precision is reported `none`
  and Live is refused as `precision_unknown`. The example adds a ~15-line Swift Expo module
  (`modules/sdk-location-precision`, `CLLocationManager.accuracyAuthorization`, no prompt/updates/coordinates) and passes it as
  `readIOSPrecision`. Do not infer precision from a fix's accuracy.
- `getCurrentFix` must be a fresh `getCurrentPositionAsync`, never last-known; `watch` must release exactly once (the reference
  handles stop-before-subscribe).
- Wire `lifecycle={{ onForeground }}` from `AppState` so Live resumes cleanly.
- Keep simulated and device sources separate; never present simulated GPS as device evidence.

## 7. Minimal wiring

```tsx
const MapView = createMapLibreNavigationMap({ venue, archiveUri, archiveZoom: { min: 12, max: 16 }, initialCenter, initialZoom: 17 });
const controller = createNavigationController({ venue, location, now: Date.now });
// dispose when the app is done with navigation
<SafeAreaProvider initialMetrics={initialWindowMetrics}>
  <NavigationProvider controller={controller} lifecycle={appStateLifecycle}>
    <NavigationScreen style={{ paddingTop: insets.top }} copy={copy} theme={theme} isRTL={I18nManager.isRTL}
      describePlace={describePlace} MapComponent={MapView} bottomInset={insets.bottom} />
  </NavigationProvider>
</SafeAreaProvider>
```

Use `react-native-safe-area-context` insets (Android edge-to-edge draws under the system bars) and `expo-status-bar`
(`style="auto"`) so system icons stay visible.

## 8. Offline venue packs

`createPackManager` handles staged install → verify → atomic activation → rollback → recovery over a `PackStore` port you implement
(filesystem, extraction, downloads). Platform adapters (SHA-256 reader, file store, compiler) are **not shipped yet**; see
[RELEASE_NOTES.md](RELEASE_NOTES.md). SHA-256 proves integrity, not publisher authenticity: do not accept imported packs without a
publisher signature scheme and keys you control.
