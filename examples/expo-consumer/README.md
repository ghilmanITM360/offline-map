# Expo consumer of the packed SDK

A tiny Expo app that uses `@muslim-ummah/offline-navigation` the way an outside app would: installed from the packed `.tgz`
(`file:./sdk.tgz`), with its own React and React Native, a stock Metro config, and nothing from this repository's source.

It is driven by `npm run test:sdk-consumer -- <fresh directory outside the repo>` from the repository root, which packs the
SDK, copies this folder next to the tarball, installs, then runs `tsc`, the Jest flows and production Android and iOS bundles.
Do not run `npm install` here: `sdk.tgz` only exists in that copy.

What the host owns, and this app shows: the venue (`demoVenue.ts`, synthetic, placed inside the Karachi basemap only so the
map has something under it), place names, the basemap file (`basemap.ts` installs the bundled PMTiles archive into app-private
storage and trusts it only when its SHA-256 matches), the location service (`simulatedLocation.ts`, a stand-in for
`expo-location`), language, theme and safe area. The ready-made `NavigationScreen` owns the journey and the SDK's
`@muslim-ummah/offline-navigation/maplibre` adapter owns the map. `@maplibre/maplibre-react-native` 11.5.0 is the app's own
dependency (an optional SDK peer) and its Expo config plugin is listed in `app.json`.

The driver copies the repository's verified `assets/offline-map/ijtema-basemap.pmtiles` to `assets/karachi-basemap.pmtiles`
and checks `basemap.ts` against `BASEMAP_PROVENANCE.json`. `metro.config.js` is stock apart from registering `pmtiles` as an
asset extension.

Not proven here: native builds, a simulator or device, real MapLibre rendering or PMTiles reads, real GPS. The Jest and bundle
checks are JS-only, and Jest replaces the native map and the file system with recorders.

On Android with RN0.81.5, keep the registered `withAndroidConfigChanges` plugin and both files in `plugins/` when integrating this consumer. Keeping the Activity alive preserves the journey; the companion font-layout plugin also enables RN's existing measurement invalidation and remeasures the React surface on font changes. The SDK Text wrapper recreates only affected native paragraphs. Android retains nonlinear system scaling, with no added text cap or manual size multiplication. Native projects that do not use Expo prebuild must integrate the equivalent MainApplication/MainActivity changes. This workaround uses a pinned RN internal initializer, preserves the selected stock provider/SoLoader/edge-to-edge setup, and intentionally rejects another RN version or an unknown native source shape until revalidated.
