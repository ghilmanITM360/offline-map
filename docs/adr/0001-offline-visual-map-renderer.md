# ADR 0001 — Fully offline visual map renderer (MapLibre + bundled PMTiles)

- Status: Accepted (POC passed, EMULATOR VERIFIED)
- Date: 2026-10-05
- Issue: #140 (reopened — owner requirement changed)
- Supersedes: the "visual background imagery may require internet" contract in `docs/OFFLINE_NAVIGATION_AND_ROUTING.md`

## Context

Owner decision (locked): the Ijtema experience must work with **zero internet** — launch, Directory, Place Details, map render, blocks, gates, paths, route preview, navigation, reroute, arrival and process-death recovery. Internet is optional. The map must be present at install time (no Download Map step).

Today (audit, SOURCE level): the only base map is the Google Maps SDK through `react-native-maps` 1.20.1 (Google-only on Android). Offline, the app falls back to `GRAPH_ONLY` — venue overlays on an empty canvas. The `LocalTile` download path is dead in release builds. Location (expo-location → fused provider) is separate from the map SDK and does not need the network.

## Options

| Criterion | A: react-native-maps + local TileOverlay | B: MapLibre RN + bundled vector archive |
|---|---|---|
| True offline rendering | Possible, but only as raster tiles we generate; Google SDK still initialises and needs Play Services (+ key) | Native: no remote service in the render path |
| Zero-network cold launch | Depends on Google SDK `onMapReady`; unverified offline | **Verified** (below) |
| Styling | Raster only (pre-baked look, no runtime restyle) | Vector style JSON, runtime paint changes |
| Route animation / progress | Polyline props only; recreation per update (CME history, #268) | Source/layer data updates; paint properties; no marker recreation |
| Camera animation | `animateToRegion/Camera` | `easeTo`, `flyTo`, `fitBounds` with durations |
| Local data support | Polygons/markers as views | GeoJSON sources fed from the existing bundled TS datasets |
| Native stability | Needs the #268 patch; view-based markers | Layer-based rendering, no per-marker native views |
| Licence | Google ToS + API key | MapLibre BSD-2; data OSM ODbL |
| SDK extraction (future) | Couples to Google | Neutral |
| Cost | Maps SDK key/billing | None |

## Decision

**Option B.** MapLibre React Native (`@maplibre/maplibre-react-native` 11.5.0, MapLibre Native Android 13.6.1), rendering a **project-generated vector PMTiles archive** bundled in the APK and copied to app-private storage on first launch, styled with a local style (no remote glyph/sprite URLs). Venue overlays (blocks, gates, paths, routes, markers) are GeoJSON sources fed from the existing bundled datasets.

Offline is the native state, not a fallback mode.

## POC evidence (EMULATOR VERIFIED — arm64 AVD, Android 16 / API 36)

Isolated harness `src/poc/OfflineMapPoc.tsx`, enabled only with `EXPO_PUBLIC_OFFLINE_MAP_POC=1`; HomeScreen untouched.

| # | Requirement | Result |
|---|---|---|
| 1 | Map initialises | PASS |
| 2 | Renders with network off | PASS — release build, JS bundled (no Metro), **airplane mode ON**, app data cleared before launch |
| 3 | Local archive + style load | PASS — `pmtiles://file://<app files>/map/…` read from app-private storage after copy from the APK resource |
| 4 | Camera control | PASS — `easeTo` (600 ms) to the destination at zoom 17 |
| 5 | Marker | PASS (circle layer) |
| 6 | Route polyline | PASS (line layer, round caps) |
| 7 | Current-position marker | PASS (circle layer; real GNSS binding is a later PR) |
| 8 | No remote request | PASS by construction and observation — style has one source (`pmtiles://file://…`), no `glyphs`/`sprite`; no HTTP/mbgl error lines in logcat; device had no connectivity |
| 9 | New Architecture | PASS (`newArchEnabled=true`, bridgeless) |
| 10 | Android build | PASS — debug 4m10s; release (arm64 only) 2m13s |

Measured: `libmaplibre.so` (arm64) 10.8 MB uncompressed; POC archive 588,859 bytes; process PSS 111.8 MB / RSS 220.6 MB for the POC screen. Full-app APK/installed-size comparison against the 87,972,032-byte baseline is deferred to the production migration PR.

Findings that shape the next PRs:

- `pmtiles://asset://` is **not supported** by MapLibre Native (no byte-range reads on `AssetManager`); `pmtiles://file://` is. Hence the first-launch local copy (APK → app-private storage). No network involved.
- Metro must treat `.pmtiles` as an asset extension (`metro.config.js`); in a release build the file lands as an Android resource and `expo-asset` + `expo-file-system` copy it successfully.
- A debug build cannot be used for offline proof: it fetches JS from Metro at `10.0.2.2:8081`. Offline acceptance uses release-like builds.
- Labels need glyphs. The current label overlay is plain React Native; the POC has no `symbol` layers. Decision for PR F: keep the RN label overlay for venue labels, and bundle local glyph PBFs only if basemap place/road names are required.

## Data (decided here, built in PR B)

OSM **data** (never `tile.openstreetmap.org` / `vector.openstreetmap.org` tiles — bulk prefetch is prohibited) → Overpass for a bounded bbox → `osmium` → GeoJSON → `tippecanoe` → MBTiles → `pmtiles` archive. Bbox comes from the existing street-graph extent (≈ 6 km × 6 km: lat 24.944–24.999, lon 66.977–67.036) which already contains the venue (≈ 1.4 × 1.8 km) and all required connectors. Zoom range and layers are justified and size-measured in PR B. Attribution: © OpenStreetMap contributors, ODbL. Nothing is derived from Google data.

## Tradeoffs

- +~11 MB native lib per ABI; MapLibre native is a new native dependency to maintain.
- New styling/camera code replaces `react-native-maps` usage in ~14 components and their tests (done in small PRs; existing Jest map tests move to the new components).
- No Google imagery/satellite option (the product no longer needs it for core).
- PMTiles via `file://` bypasses MapLibre's offline-pack cache — fine, because the archive is the source of truth.

## Rollback plan

PR D (renderer migration) lands behind a single `MapRenderer` seam; `react-native-maps` stays installed until PR J. If MapLibre shows native instability in the Phase 22 stability matrix, revert PR D (one merge commit) — the data pipeline, bundled archive and design tokens remain valid. Google Maps SDK removal (PR J) only happens after the offline acceptance is green.

## Not decided here

Google walking-route provider (#123/#161): stays an optional enhancement; the offline OSM graph is already the core path.
