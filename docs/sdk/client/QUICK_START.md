# Quick start

One path, eight steps, for an Expo 54 / React Native 0.81.5 app. Nothing here needs our repository: every file named below is in the delivery archive.
Bare React Native: do steps 1, 2 (install lines only), 4, 5, 6, 7 and follow [INTEGRATION_GUIDES.md](INTEGRATION_GUIDES.md) §3 for the native configuration the
Expo plugin does for you.

What the SDK does **not** give you, and you must bring: your venue's surveyed data (nodes, corridors, places), your offline basemap (a PMTiles archive), and your
own review of the wording and permissions text. Everything else is installed, generated or copied in the steps below.

| Part | Is | Where |
| --- | --- | --- |
| **Library** | the SDK (`@muslim-ummah/offline-navigation`) and the iOS precision module (`@muslim-ummah/ios-location-precision`) | `package/*.tgz` |
| **Client tool** | `venue-pack.cjs`, which builds and verifies your venue pack | `tools/venue-pack/` |
| **Example code** | `examples/expo-consumer` (a working app) and `examples/synthetic-venue` (an invented venue) | copy from them, do not ship them as they are |

## 1. Receive and verify the delivery

```bash
shasum -a 256 delivery-XXXXXXX.tgz        # must equal the SHA-256 you were given with the delivery
tar -xzf delivery-XXXXXXX.tgz && cd delivery-XXXXXXX
shasum -a 256 -c CHECKSUMS.txt            # every file: OK
```

## 2. Install the SDK and its peers

Start from the example app (recommended): `cp -R examples/expo-consumer ../my-app && cd ../my-app && npm ci --ignore-scripts --no-audit --no-fund`.
The shipped `package-lock.json` pins every version that was tested; both tarballs sit next to it.

Into an existing app instead:

```bash
npm install /path/to/delivery/package/muslim-ummah-offline-navigation-0.1.0.tgz /path/to/delivery/package/muslim-ummah-ios-location-precision-0.1.0.tgz
npm install @maplibre/maplibre-react-native@11.5.0
npx expo install expo-location expo-file-system expo-asset expo-crypto expo-status-bar expo-system-ui react-native-safe-area-context
npm ls react react-native      # one version of each
```

## 3. Apply the native configuration (one plugin, one Metro line)

`app.json`:

```json
{ "expo": { "plugins": [["@muslim-ummah/offline-navigation", {
  "locationPermissionText": "<your reviewed iOS prompt text>",
  "languages": ["en", "ur"]
}]] } }
```

`metro.config.js`:

```js
const { getDefaultConfig } = require('expo/metro-config');
module.exports = require('@muslim-ummah/offline-navigation/metro').withOfflineNavigation(getDefaultConfig(__dirname));
```

The plugin applies, and you must **not** also list `expo-location` or the MapLibre plugin:

| Platform | What it configures |
| --- | --- |
| Android | foreground location permissions (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, no background); `MainActivity` keeps running through font and display-size changes (`fontScale`, `smallestScreenSize`, `density`) so the journey survives; React Native re-measures text when the font scale changes |
| iOS | `NSLocationWhenInUseUsageDescription` from `locationPermissionText` (no Always strings, no background modes); `CFBundleLocalizations` for `languages`; the iOS precision module is autolinked from `node_modules` |
| both | the MapLibre native module's config plugin |

Options (all optional): `locationPermissionText`, `languages` (default `["en"]`; include `ur` or iOS stays in English and never turns right-to-left), `maplibre`
(`false` if you bring your own map), `androidFontScaleFix` (see below). An unknown option or a missing peer stops the build with a message naming it.

**React Native version gate.** The Android font re-measure uses a React Native 0.81.5 internal initializer. On any other React Native version the plugin **stops with
`requires revalidation for RN x.y.z`** rather than patching something it has not been tested on. Either stay on 0.81.5, or set `"androidFontScaleFix": false`
(the journey is still kept; large-font changes then re-measure text only after the app restarts). Everything else in the plugin does not depend on the React Native version.

## 4. Provide your venue and offline basemap

Put your survey output in the folder layout of [VENUE_PACK_TOOL.md](VENUE_PACK_TOOL.md) (`examples/synthetic-venue` is a complete, runnable model), then:

```bash
node tools/venue-pack/venue-pack.cjs compile \
  --spec examples/synthetic-venue/pack.spec.json --input examples/synthetic-venue/input --out ./build/my-venue
```

It checks the graph and places (unknown nodes, duplicates, bad coordinates, unreachable places), hashes every file, writes `pack/pack.manifest.json`, `pack.pin.json` and
`SHA256SUMS.txt`, and prints the manifest SHA-256 your app pins. Then copy the verified pack into the app:

```bash
node tools/venue-pack/venue-pack.cjs app-assets --pack ./build/my-venue/pack --app ../my-app
```

Paste the entry it prints into the `PACKS` list in `bundledPackTable.ts` (replace the sample entries), set `DEFAULT_VENUE_ID` in `packRuntime.ts` to your venue id and
`BASEMAP.zoom` in `basemap.ts` to your archive's min/max zoom. Delete `assets/packs/karachi-ijtema*` and the demo pack when you no longer need them.

## 5. Configure the location adapter

`expoLocation.ts` (in the example) is the reference `NavigationLocationAdapter`: foreground only, one permission prompt from the user's explicit Live request, fresh fixes
only. On iOS it takes `readIOSPrecision` from `@muslim-ummah/ios-location-precision`, which reads `CLLocationManager.accuracyAuthorization` without prompting. Keep both; see
[INTEGRATION_GUIDES.md](INTEGRATION_GUIDES.md) §6 for the rules.

## 6. Mount the ready-made screen

`App.tsx` in the example is the working wiring: `createNavigationController({ venue, location, now })` once per open venue, `dispose()` in the effect cleanup, then

```tsx
<NavigationProvider controller={controller} lifecycle={appStateLifecycle}>
  <NavigationScreen copy={copy} theme={theme} isRTL={isRTL} describePlace={describePlace} MapComponent={MapComponent} />
</NavigationProvider>
```

`copy` comes from `copy/` (English, Urdu, Roman Urdu: complete **drafts**, see [TRANSLATION_REVIEW.md](TRANSLATION_REVIEW.md)). Headless use (no screen, no React) is
`createNavigationController` alone; see [API_REFERENCE.md](API_REFERENCE.md).

## 7. Build the native apps

```bash
npx expo prebuild --clean
npx expo run:ios --configuration Release        # Xcode 26, iOS 15.1+ deployment target
npx expo run:android --variant release          # JDK 17, Android API 24+
```

Expo Go cannot run MapLibre: use these development or release builds. Build from a real (non-symlinked) project path.

## 8. Run an offline journey

Turn on airplane mode, then open the app: choose a destination → choose a start → **Follow the steps** (Manual Guide, Previous/Next) → **Navigate with my location** (the
only permission prompt) → walk or use the demo GPS control → arrival → Done → start a second, independent journey. Before you ship, work through
[CLIENT_CHECKLIST_AND_QA.md](CLIENT_CHECKLIST_AND_QA.md); physical-device walking, screen-reader and field checks remain yours.
