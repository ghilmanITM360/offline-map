# Integration guides

The reference implementation of everything below is `examples/expo-consumer`: a small Expo 54 app that installs the packed `.tgz` files and nothing else. In
the delivered folder it is checked with `npm ci --ignore-scripts`, `npm run typecheck`, `npm test` and `npm run export:android` / `npm run export:ios`. The step-by-step
path is [QUICK_START.md](QUICK_START.md); this page is the detail behind it.

## 1. Install

```bash
npm install ./package/muslim-ummah-offline-navigation-0.1.0.tgz ./package/muslim-ummah-ios-location-precision-0.1.0.tgz   # the second is for iOS Live
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
  "ios": { "bundleIdentifier": "com.yourco.app" },
  "android": { "package": "com.yourco.app", "blockedPermissions": ["android.permission.READ_EXTERNAL_STORAGE","android.permission.WRITE_EXTERNAL_STORAGE","android.permission.SYSTEM_ALERT_WINDOW","android.permission.VIBRATE"] },
  "plugins": [["@muslim-ummah/offline-navigation", { "locationPermissionText": "<reviewed text>", "languages": ["en", "ur"] }]]
} }
```

`metro.config.js`: `module.exports = require('@muslim-ummah/offline-navigation/metro').withOfflineNavigation(getDefaultConfig(__dirname));` (it only adds the `pmtiles` and
`packfile` asset types to the config's own list).

The single plugin replaces what used to be four hand-copied pieces; **do not also list `expo-location` or `@maplibre/maplibre-react-native`**:

| Setting | Applied by the plugin |
| --- | --- |
| Android permissions | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` (foreground only), via the `expo-location` plugin the SDK invokes |
| Android configuration changes | `MainActivity` handles `fontScale`, `smallestScreenSize`, `density`, so a font or display-size change does not recreate the activity (the native map would fail and the journey would be lost) |
| Android font layout | React Native 0.81.5's own font-scale invalidation flag is turned on and the React surface is re-measured. **Only on RN 0.81.5**: any other version stops `expo prebuild` with `requires revalidation for RN x.y.z`; set `"androidFontScaleFix": false` to accept the older behaviour knowingly |
| iOS location | `NSLocationWhenInUseUsageDescription` = `locationPermissionText`; Always strings and background modes are not added |
| iOS languages | `CFBundleLocalizations` = `languages`. It must include `ur` for Urdu, or iOS keeps the app in English and `I18nManager.isRTL` stays false |
| MapLibre | its config plugin (`"maplibre": false` skips it) |
| iOS precision module | autolinked from `node_modules` (`@muslim-ummah/ios-location-precision`); nothing to copy |

A missing peer (`expo-location`, MapLibre), an unknown option or an invalid option stops the build with a message that names it.

- `npx expo prebuild`, then `pod install` (iOS) and a Release build. Use real paths for the project root when building
  from a temp directory (`/tmp` vs `/private/tmp` made Metro fail the bundle phase).

## 3. Bare React Native (manual native setup; not validated by a native build)

The Expo plugin cannot run, so apply by hand what it applies. **Status: no bare React Native project has been built with this SDK.** The Expo equivalents were generated and
inspected (`expo prebuild`) and built on a simulator and an emulator; the bare steps below are the same edits written out and have **not** been executed.

Same peers and the same `@maplibre/maplibre-react-native` 11.5.0 install (follow its README for autolinking on 0.81.5 with the New Architecture).

- **Metro:** `module.exports = require('@muslim-ummah/offline-navigation/metro').withOfflineNavigation(mergeConfig(getDefaultConfig(__dirname), {}));`
- **Android** (`minSdk 24`, `compileSdk 36`): `AndroidManifest.xml` gets `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` only; `MainActivity`'s `android:configChanges`
  gains `fontScale|smallestScreenSize|density` (keep what is there). Optional font re-measure, RN 0.81.5 only: the exact `MainApplication.kt` and `MainActivity.kt` additions are the
  Kotlin in `node_modules/@muslim-ummah/offline-navigation/plugin/androidFontScale.js` (`APPLICATION_METHOD`, `ACTIVITY_METHOD`); skip them and a font-size change re-measures text
  after a restart.
- **iOS** (deployment target 15.1+): `pod install`; `Info.plist` gets `NSLocationWhenInUseUsageDescription` (no Always, no background modes) and `CFBundleLocalizations` listing every
  language including `ur`.
- **iOS precision:** the module is an Expo module (`ExpoModulesCore`). A bare app either adopts Expo modules (`npx install-expo-modules`) and installs
  `@muslim-ummah/ios-location-precision`, or implements the 15 lines itself (`CLLocationManager().accuracyAuthorization`, read-only; the Swift is in the package's `ios/`) and passes
  the result as `readIOSPrecision`. Without any precision reader, iOS Live is refused as `precision_unknown`.
- **Minimal checks after wiring:** the production bundle exports for both platforms; Release builds open the map in airplane mode; one Manual Guide journey; one Live journey with
  a permission prompt; a font-size change mid-journey keeps the journey.

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
  and Live is refused as `precision_unknown`. Install `@muslim-ummah/ios-location-precision` (a ~15-line Swift Expo module,
  `CLLocationManager.accuracyAuthorization`, no prompt/updates/coordinates; autolinked, nothing to copy) and pass its `readIOSPrecision` to the adapter. Do not infer precision from a fix's accuracy.
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

**Build a pack.** Use `tools/venue-pack/venue-pack.cjs` from the delivery ([VENUE_PACK_TOOL.md](VENUE_PACK_TOOL.md)): `compile` turns a folder of your survey output plus a
`pack.spec.json` into a deterministic, verified pack (sorted resources, streamed SHA-256, no clock or host paths) and prints the manifest digest your app pins; `verify` re-checks it;
`app-assets` copies it into your Expo app and prints the `bundledPackTable.ts` entry. It checks the graph and places (unknown nodes, duplicate ids, bad coordinates and distances,
unreachable places) and refuses symlinks, undeclared or missing files, unsafe or duplicate paths, missing required kinds, bad versions, missing attribution and a data file that names
another venue. It never overwrites or deletes. (Inside the SDK repository the same compiler is `scripts/sdk-pack/compile.ts`; `npm run sdk:karachi-pack -- <dir>` builds the Karachi pack,
pinned in `scripts/sdk-pack/karachi-ijtema.pin.json`.)

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

**Fast verification.** Hashing a pack in JS costs about a second on a phone (Hermes has no JIT). Pass `digestFile` to `createFileSystemPackStore` / the bundled installer to use the platform's SHA-256: the example installs `expo-crypto` (15.0.9 for Expo 54) and `nativeDigest.ts` reads a whole file (up to 8 MiB) and returns `{ bytes, sha256 }` of exactly what it hashed; anything it declines is hashed by the SDK in bounded chunks. Verification still fails on any byte difference.

**Appearance and language in the example.** `expo-system-ui` (6.0.9 for Expo 54) is installed so `userInterfaceStyle: "automatic"` and the root background work on Android. The *System / Light / Dark* and *English / اردو / Roman Urdu* pickers sit above the venue and the journey: switching restyles in place and keeps the trip, the step, the map camera and the pack pin. Urdu and Roman Urdu use the complete draft tables in `copy/` (generated from [TRANSLATION_REVIEW.md](TRANSLATION_REVIEW.md); pending native review).

**Imported and remote packs are refused.** Installing needs a signature from a trusted key; no signing scheme or key exists yet, so
`createPackManager` is configured without a verifier and every `installStaged` fails with `signature-required`. SHA-256 proves
integrity, not publisher authenticity. Do not enable `requireSignature: false` outside tests.

**Prove it on the device.** The sample's *Run pack self-test* button runs the lifecycle on the device's real filesystem in a separate
directory (copy/replace/rename semantics, interrupted replacement, install → update → rollback across restarts, a changed or deleted
resource, an update with a missing file, interrupted staging, pins, storage pressure, two venues). It uses a lab manager without the
signature requirement, so it checks storage and recovery, not the trust policy.
