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

The SDK validates, stores and activates venue packs; **you** supply the filesystem and, for packs that ship in the app, the bytes.
Format, compiler and trust rules: [../OFFLINE_PACK_SPEC.md](../OFFLINE_PACK_SPEC.md).

**Build a pack.** `scripts/sdk-pack/compile.ts` (`compilePack(dir, spec, { write: true })`) turns a directory of resources plus a build
spec into a deterministic `pack.manifest.json` (sorted resources, streamed SHA-256, no clock or host paths). It refuses symlinks,
undeclared/missing files, unsafe or duplicate paths, missing required kinds, bad versions, missing attribution and a data file that
names another venue. `npm run sdk:karachi-pack -- <dir>` builds the real Karachi pack; its digest is pinned in
`scripts/sdk-pack/karachi-ijtema.pin.json`.

**Ship it in the app.** `examples/expo-consumer` is the reference: `bundledPackTable.ts` lists each bundled pack's pinned manifest
digest and its files (Metro assets with a `.packfile` extension registered in `metro.config.js`); `bundledPacks.ts` copies a pack into
app-private storage through a staging directory renamed into place whole, trusts it only while every byte hashes to the pinned
manifest, and repairs a damaged copy from the packaged one at the next start. `packRuntime.ts` then does, in this order:
bundled install/verify → `createPackManager({ bundled })` → `recover()` → `open(venueId)`. `open` pins the active pack, re-checks the
graph, place and name files against the manifest, and returns a `VenueDataSource` (`parsePackVenueData`) plus the archive path for
the map. Release the pin (`venue.release()`) when the venue closes; the sample holds it while a venue is open, which covers every
journey in it.

**Expo FileSystem adapter** (`expoPackFileSystem.ts`, `createExpoPackFileSystem(rootUri)`), written against the installed
`expo-file-system` 19.0.x object API:
- `File.write` is not atomic and there is no fsync, so replacing a file is a swap (write temp, move the target aside, move the temp in)
  that `readText` repairs; a process kill at any step leaves the old or the new complete text. Power-loss durability is the OS's.
- `move()` onto an existing file fails; moving a directory onto an existing directory moves it *inside*. `renameDir` therefore checks
  first, refuses an existing destination, and creates the destination's parent (Android requires it).
- Reads stream through `FileHandle.readBytes` in 64 KiB chunks and always close the handle.
- Keep packs under the document directory, not the cache directory (the OS may purge the cache).

**Imported and remote packs are refused.** Installing needs a signature from a trusted key; no signing scheme or key exists yet, so
`createPackManager` is configured without a verifier and every `installStaged` fails with `signature-required`. SHA-256 proves
integrity, not publisher authenticity. Do not enable `requireSignature: false` outside tests.

**Prove it on the device.** The sample's *Run pack self-test* button runs the lifecycle on the device's real filesystem in a separate
directory (copy/replace/rename semantics, interrupted replacement, install → update → rollback across restarts, a changed or deleted
resource, an update with a missing file, interrupted staging, pins, storage pressure, two venues). It uses a lab manager without the
signature requirement, so it checks storage and recovery, not the trust policy.
